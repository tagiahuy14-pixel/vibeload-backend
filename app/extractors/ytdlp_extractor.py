import re
import shutil
from typing import Dict, Any, List, Optional
import yt_dlp
from .base import BaseExtractor


DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
}


def find_ffmpeg_location() -> Optional[str]:
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        import os
        return os.path.dirname(which_ffmpeg)
    return None


class YtDlpExtractor(BaseExtractor):
    def can_handle(self, url: str) -> bool:
        # Generic handler for all supported platforms
        return True

    def analyze(self, url: str) -> Dict[str, Any]:
        ffmpeg_loc = find_ffmpeg_location()
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'extract_flat': False,
            'socket_timeout': 20,
            'noplaylist': True,
            'http_headers': DEFAULT_HEADERS,
            'extractor_args': {
                'youtube': {
                    'player_client': ['ios', 'android']
                }
            }
        }
        if ffmpeg_loc:
            ydl_opts['ffmpeg_location'] = ffmpeg_loc

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return {"success": False, "error": "Không tìm thấy dữ liệu phương tiện từ liên kết này."}

                if 'entries' in info and info['entries']:
                    info = info['entries'][0]

                title = info.get('title') or info.get('description') or 'Unknown Title'
                thumbnail = info.get('thumbnail') or ""
                uploader = info.get('uploader') or info.get('uploader_id') or info.get('channel') or 'Unknown Author'
                duration = info.get('duration') or 0
                extractor = (info.get('extractor') or 'unknown').lower()

                raw_formats = info.get('formats') or []
                video_options: List[Dict[str, Any]] = []
                audio_options: List[Dict[str, Any]] = []
                seen_resolutions = set()

                for fmt in raw_formats:
                    fmt_id = str(fmt.get('format_id', ''))
                    ext = fmt.get('ext', '')
                    vcodec = fmt.get('vcodec') or 'none'
                    acodec = fmt.get('acodec') or 'none'
                    height = fmt.get('height') or 0
                    width = fmt.get('width') or 0
                    filesize = fmt.get('filesize') or fmt.get('filesize_approx') or 0
                    abr = fmt.get('abr') or 0

                    if fmt_id.startswith('sb') or ext in ('mhtml',) or fmt.get('protocol') == 'mhtml':
                        continue

                    has_vcodec = vcodec != 'none' and vcodec is not None
                    has_acodec = acodec != 'none' and acodec is not None

                    # Facebook / TikTok combined format normalization
                    if fmt_id == 'hd' and height == 0:
                        height = 720
                    elif fmt_id == 'sd' and height == 0:
                        height = 480

                    is_named_video = fmt_id in ('sd', 'hd', 'video')
                    is_video = has_vcodec or is_named_video
                    is_audio_only = has_acodec and not has_vcodec and not is_named_video

                    if is_video and height > 0:
                        res_label = f"{height}p"
                        if fmt_id in ('sd', 'hd'):
                            res_label = f"{fmt_id.upper()} ({height}p)"

                        needs_merge = not has_acodec and fmt_id not in ('sd', 'hd') and ('tiktok' not in extractor)

                        if res_label not in seen_resolutions:
                            seen_resolutions.add(res_label)
                            video_options.append({
                                "format_id": fmt_id,
                                "resolution": res_label,
                                "height": height,
                                "width": width,
                                "ext": "mp4",
                                "filesize": filesize,
                                "vcodec": vcodec,
                                "acodec": acodec,
                                "needs_merge": needs_merge
                            })
                        else:
                            for existing in video_options:
                                if existing["resolution"] == res_label:
                                    # Priority 1: Audio included
                                    if existing["needs_merge"] and not needs_merge:
                                        existing["format_id"] = fmt_id
                                        existing["vcodec"] = vcodec
                                        existing["acodec"] = acodec
                                        existing["needs_merge"] = False
                                        if filesize > 0:
                                            existing["filesize"] = filesize
                                        break
                                    # Priority 2: AVC1 (H.264)
                                    elif existing["needs_merge"] and needs_merge:
                                        cur_is_avc = "avc" in vcodec.lower() or "h264" in vcodec.lower()
                                        prev_is_avc = "avc" in (existing.get("vcodec") or "").lower() or "h264" in (existing.get("vcodec") or "").lower()
                                        if cur_is_avc and not prev_is_avc:
                                            existing["format_id"] = fmt_id
                                            existing["vcodec"] = vcodec
                                            existing["acodec"] = acodec
                                            if filesize > 0:
                                                existing["filesize"] = filesize
                                            break

                    elif is_audio_only:
                        audio_options.append({
                            "format_id": fmt_id,
                            "ext": ext,
                            "abr": int(abr) if abr else 128,
                            "filesize": filesize,
                            "acodec": acodec
                        })

                # Sort video options ascending by height
                video_options.sort(key=lambda x: x["height"])

                # If no video options parsed but video exists
                if not video_options and raw_formats:
                    candidate_fmts = [f for f in raw_formats if (f.get('vcodec') or 'none') != 'none' or str(f.get('format_id')) in ('sd', 'hd', 'video')]
                    if candidate_fmts:
                        last_fmt = candidate_fmts[-1]
                        vcodec = last_fmt.get('vcodec') or 'none'
                        acodec = last_fmt.get('acodec') or 'none'
                        h = last_fmt.get('height') or 720
                        video_options.append({
                            "format_id": str(last_fmt.get('format_id', 'best')),
                            "resolution": f"{h}p (Mặc định)",
                            "height": h,
                            "width": last_fmt.get('width') or 1280,
                            "ext": "mp4",
                            "filesize": last_fmt.get('filesize') or 0,
                            "vcodec": vcodec,
                            "acodec": acodec,
                            "needs_merge": (vcodec != 'none') and (acodec == 'none')
                        })

                # Add default MP3 options if any audio is available
                has_any_audio = len(audio_options) > 0 or any(not opt["needs_merge"] for opt in video_options) or len(video_options) > 0
                standard_audio_options = []
                if has_any_audio:
                    for br in [320, 256, 192, 128]:
                        standard_audio_options.append({
                            "format_id": f"bestaudio/mp3_{br}",
                            "ext": "mp3",
                            "abr": br,
                            "filesize": 0,
                            "acodec": "mp3"
                        })
                if not audio_options:
                    audio_options = standard_audio_options
                else:
                    audio_options = standard_audio_options + audio_options

                return {
                    "success": True,
                    "url": url,
                    "title": title,
                    "thumbnail": thumbnail,
                    "uploader": uploader,
                    "duration": duration,
                    "platform": extractor,
                    "is_photo_album": False,
                    "is_audio_only": len(video_options) == 0 and len(audio_options) > 0,
                    "video_options": video_options,
                    "audio_options": audio_options,
                    "photos": [],
                    "error": None
                }
        except yt_dlp.utils.DownloadError as e:
            return {"success": False, "error": self._format_error(str(e), url)}
        except Exception as e:
            return {"success": False, "error": f"Lỗi phân tích: {str(e)}"}

    def _format_error(self, err: str, url: str) -> str:
        err_lower = err.lower()
        if "private video" in err_lower or "sign in" in err_lower or "login" in err_lower:
            return "Nội dung này ở chế độ riêng tư hoặc yêu cầu đăng nhập."
        if "not found" in err_lower or "404" in err_lower or "does not exist" in err_lower:
            return "Bài viết hoặc video không tồn tại (có thể đã bị xóa)."
        if "drm" in err_lower or "copyright" in err_lower:
            return "Nội dung này được bảo vệ bản quyền (DRM), không thể tải."
        if "bot" in err_lower or "captcha" in err_lower:
            return "Nền tảng yêu cầu xác minh bảo mật (CAPTCHA). Vui lòng thử lại sau."
        return f"Không thể phân tích nội dung từ liên kết: {err}"
