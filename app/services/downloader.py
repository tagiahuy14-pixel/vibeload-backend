import os
import shutil
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional, List
import yt_dlp
from ..config import settings
from ..schemas import DownloadRequest, DownloadType, FileInfo
from ..security import sanitize_filename
from ..storage import get_job_dir
from ..workers.jobs import DownloadJob
from .ffmpeg_service import verify_media_streams, convert_to_mp3, get_ffmpeg_path
from .zip_service import create_photo_zip
from ..extractors.registry import clean_and_normalize_url, resolve_redirect_if_needed, registry


DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
}


def run_download_job(job: DownloadJob, request: DownloadRequest):
    """Worker function executed in background thread."""
    job_dir = get_job_dir(job.id)
    url = clean_and_normalize_url(request.url)
    url = resolve_redirect_if_needed(url)

    try:
        if job.is_cancelled:
            return

        # Case 1: Photo album / Carousel
        if request.download_type == DownloadType.PHOTOS:
            _handle_photo_album_download(job, request, job_dir)
            return

        # Case 2: Direct HTTP/HTTPS media URL (e.g. direct CDN image or MP4)
        if request.format_id and (request.format_id.startswith("http://") or request.format_id.startswith("https://")):
            _handle_direct_stream_download(job, request, job_dir)
            return

        # Case 3: Audio extraction (MP3 / native)
        if request.download_type == DownloadType.AUDIO:
            _handle_audio_download(job, request, job_dir, url)
            return

        # Case 4: Video download
        try:
            _handle_video_download(job, request, job_dir, url)
        except Exception as e:
            # Fallback for TikTok if yt-dlp was blocked or failed
            if ("tiktok.com" in url.lower() or "douyin.com" in url.lower()) and not job.is_cancelled:
                tikwm_res = registry.tiktok_photo_extractor._extract_tikwm(url)
                if tikwm_res and tikwm_res.get("video_options"):
                    stream_url = tikwm_res["video_options"][0]["format_id"]
                    req_copy = DownloadRequest(
                        url=request.url,
                        download_type=DownloadType.VIDEO,
                        format_id=stream_url
                    )
                    _handle_direct_stream_download(job, req_copy, job_dir)
                    return
            raise e

    except Exception as e:
        if "DOWNLOAD_CANCELLED" in str(e) or job.is_cancelled:
            job.cancel()
        else:
            job.set_failed(f"Lỗi tải phương tiện: {str(e)}")
        # Clean up any leftover partial files
        _cleanup_partial_files(job_dir)


def _handle_photo_album_download(job: DownloadJob, request: DownloadRequest, job_dir: Path):
    job.update_progress(10.0, 0.0, 0, 100, 0)
    analysis = registry.analyze(request.url)
    if not analysis.get("success") or not analysis.get("photos"):
        raise RuntimeError("Không thể trích xuất danh sách ảnh từ bài viết này")

    photos = analysis["photos"]
    if request.photo_indices:
        photos = [p for p in photos if p.get("index") in request.photo_indices]

    if not photos:
        raise RuntimeError("Không có ảnh nào được chọn để tải")

    raw_title = analysis.get("title") or "TikTok_Photos"
    safe_title = sanitize_filename(raw_title, "TikTok_Photos")
    zip_path = job_dir / f"{safe_title}.zip"

    def progress_hook(pct, current, total):
        if job.is_cancelled:
            raise RuntimeError("DOWNLOAD_CANCELLED")
        job.update_progress(pct, 0.0, current, total, 0)

    create_photo_zip(
        photos=photos,
        output_zip_path=zip_path,
        progress_cb=progress_hook,
        is_cancelled_cb=lambda: job.is_cancelled
    )

    filesize = zip_path.stat().st_size
    file_info = FileInfo(
        filename=zip_path.name,
        filesize=filesize,
        content_type="application/zip",
        has_video=False,
        has_audio=False,
        is_zip=True
    )
    job.set_completed(zip_path, file_info)


def _handle_direct_stream_download(job: DownloadJob, request: DownloadRequest, job_dir: Path):
    stream_url = request.format_id
    base_name = f"media_{job.id[:8]}"
    try:
        analysis = registry.analyze(request.url)
        if analysis.get("success") and analysis.get("title"):
            base_name = analysis["title"]
    except Exception:
        pass

    safe_filename = sanitize_filename(base_name, f"media_{job.id[:8]}")
    ext = "mp4" if request.download_type == DownloadType.VIDEO else "mp3"
    target_path = job_dir / f"{safe_filename}.{ext}"

    req = urllib.request.Request(stream_url, headers=DEFAULT_HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        total_bytes = int(resp.headers.get('Content-Length', 0))
        downloaded = 0
        with open(target_path, 'wb') as out_f:
            while True:
                if job.is_cancelled:
                    raise RuntimeError("DOWNLOAD_CANCELLED")
                chunk = resp.read(65536)
                if not chunk:
                    break
                out_f.write(chunk)
                downloaded += len(chunk)
                if total_bytes > 0:
                    pct = (downloaded / total_bytes) * 100.0
                    job.update_progress(pct, 0.0, downloaded, total_bytes, 0)

    stream_check = verify_media_streams(str(target_path))
    filesize = target_path.stat().st_size
    content_type = "video/mp4" if ext == "mp4" else "audio/mpeg"
    file_info = FileInfo(
        filename=target_path.name,
        filesize=filesize,
        content_type=content_type,
        has_video=stream_check.get("has_video", ext == "mp4"),
        has_audio=stream_check.get("has_audio", True),
        is_zip=False
    )
    job.set_completed(target_path, file_info)


def _handle_audio_download(job: DownloadJob, request: DownloadRequest, job_dir: Path, target_url: str):
    ffmpeg_loc = get_ffmpeg_path()
    raw_output_tmpl = str(job_dir / "raw_audio.%(ext)s")

    def hook(d):
        if job.is_cancelled:
            raise RuntimeError("DOWNLOAD_CANCELLED")
        if d.get('status') == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            speed = d.get('speed') or 0.0
            eta = d.get('eta') or 0
            pct = (downloaded / total * 80.0) if total > 0 else 0.0
            job.update_progress(pct, speed, downloaded, total, eta)

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': raw_output_tmpl,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'socket_timeout': settings.SOCKET_TIMEOUT,
        'progress_hooks': [hook],
        'http_headers': DEFAULT_HEADERS,
        'extractor_args': {
            'youtube': {
                'player_client': ['ios', 'android']
            }
        }
    }
    if ffmpeg_loc:
        ydl_opts['ffmpeg_location'] = os.path.dirname(ffmpeg_loc)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(target_url, download=True)
        raw_title = info.get('title') or "audio"

    job.set_processing()
    safe_title = sanitize_filename(raw_title, "audio")
    final_mp3_path = job_dir / f"{safe_title}.mp3"

    # Find the downloaded raw audio file
    downloaded_cand = None
    for f in job_dir.iterdir():
        if f.is_file() and f.name.startswith("raw_audio"):
            downloaded_cand = f
            break

    if not downloaded_cand or not downloaded_cand.exists():
        raise RuntimeError("Không tìm thấy tệp âm thanh thô sau khi tải")

    # Convert to MP3 using FFmpeg
    bitrate = request.audio_bitrate or 192
    convert_to_mp3(str(downloaded_cand), str(final_mp3_path), bitrate=bitrate)

    # Clean up raw audio
    try:
        downloaded_cand.unlink(missing_ok=True)
    except Exception:
        pass

    # Verify stream with ffprobe
    stream_check = verify_media_streams(str(final_mp3_path))
    if not stream_check.get("has_audio"):
        raise RuntimeError(f"Tệp MP3 sau xử lý không có luồng âm thanh hợp lệ: {stream_check.get('error')}")

    filesize = final_mp3_path.stat().st_size
    file_info = FileInfo(
        filename=final_mp3_path.name,
        filesize=filesize,
        content_type="audio/mpeg",
        has_video=False,
        has_audio=True,
        is_zip=False
    )
    job.set_completed(final_mp3_path, file_info)


def _handle_video_download(job: DownloadJob, request: DownloadRequest, job_dir: Path, target_url: str):
    ffmpeg_loc = get_ffmpeg_path()
    output_tmpl = str(job_dir / "%(title)s.%(ext)s")

    def hook(d):
        if job.is_cancelled:
            raise RuntimeError("DOWNLOAD_CANCELLED")
        if d.get('status') == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
            speed = d.get('speed') or 0.0
            eta = d.get('eta') or 0
            pct = (downloaded / total * 90.0) if total > 0 else 0.0
            job.update_progress(pct, speed, downloaded, total, eta)

    format_spec = request.format_id or "bestvideo+bestaudio/best"
    # Ensure audio is always merged if video-only format selected, falling back gracefully
    if '+' not in format_spec and not format_spec.endswith('/best'):
        format_spec = f"{format_spec}+bestaudio/{format_spec}/best"

    ydl_opts = {
        'format': format_spec,
        'outtmpl': output_tmpl,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'socket_timeout': settings.SOCKET_TIMEOUT,
        'progress_hooks': [hook],
        'http_headers': DEFAULT_HEADERS,
        'merge_output_format': 'mp4',
        'extractor_args': {
            'youtube': {
                'player_client': ['ios', 'android']
            }
        }
    }
    if ffmpeg_loc:
        ydl_opts['ffmpeg_location'] = os.path.dirname(ffmpeg_loc)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(target_url, download=True)
        raw_title = info.get('title') or "video"

    job.set_processing()

    # Find the resulting file in job_dir
    final_file = None
    for f in job_dir.iterdir():
        if f.is_file() and not f.name.endswith(".part"):
            final_file = f
            break

    if not final_file or not final_file.exists() or final_file.stat().st_size == 0:
        raise RuntimeError("Không tạo được tệp video hoàn chỉnh")

    # Verify stream with ffprobe
    stream_check = verify_media_streams(str(final_file))
    if not stream_check.get("has_video"):
        raise RuntimeError(f"Tệp không chứa luồng video hợp lệ: {stream_check.get('error')}")

    # Critical requirement: Ensure YouTube video has audio!
    if not stream_check.get("has_audio"):
        # If file is missing audio, attempt to download bestaudio and merge immediately
        merged_file = _emergency_audio_merge(final_file, target_url, ffmpeg_loc)
        if merged_file:
            final_file = merged_file
        else:
            raise RuntimeError("Tệp video đã tải bị thiếu luồng âm thanh và không thể ghép tự động.")

    filesize = final_file.stat().st_size
    file_info = FileInfo(
        filename=final_file.name,
        filesize=filesize,
        content_type="video/mp4",
        has_video=True,
        has_audio=True,
        is_zip=False
    )
    job.set_completed(final_file, file_info)


def _emergency_audio_merge(video_path: Path, target_url: str, ffmpeg_loc: Optional[str]) -> Optional[Path]:
    """Fallback if video has no audio: download audio stream and merge."""
    temp_audio = video_path.parent / "temp_audio.m4a"
    merged_path = video_path.parent / f"merged_{video_path.name}"

    try:
        ydl_opts = {
            'format': 'bestaudio',
            'outtmpl': str(temp_audio),
            'quiet': True,
        }
        if ffmpeg_loc:
            ydl_opts['ffmpeg_location'] = os.path.dirname(ffmpeg_loc)

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([target_url])

        if not temp_audio.exists():
            return None

        # Merge with ffmpeg
        ffmpeg_bin = ffmpeg_loc or "ffmpeg"
        import subprocess
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i", str(video_path),
            "-i", str(temp_audio),
            "-c:v", "copy",
            "-c:a", "aac",
            str(merged_path)
        ]
        res = subprocess.run(cmd, capture_output=True, timeout=120)
        if res.returncode == 0 and merged_path.exists() and merged_path.stat().st_size > 0:
            video_path.unlink(missing_ok=True)
            temp_audio.unlink(missing_ok=True)
            return merged_path
    except Exception:
        pass
    return None


def _cleanup_partial_files(job_dir: Path):
    """Remove partial download files."""
    try:
        for f in job_dir.iterdir():
            if f.is_file() and f.name.endswith(".part"):
                f.unlink(missing_ok=True)
    except Exception:
        pass
