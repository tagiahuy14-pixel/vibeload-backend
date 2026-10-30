import json
import os
import shutil
import subprocess
import sys
from typing import Dict, Any, Optional, Tuple


def get_ffmpeg_path() -> Optional[str]:
    return shutil.which("ffmpeg")


def get_ffprobe_path() -> Optional[str]:
    which_probe = shutil.which("ffprobe")
    if which_probe:
        return which_probe
    which_ffmpeg = shutil.which("ffmpeg")
    if which_ffmpeg:
        ffmpeg_dir = os.path.dirname(which_ffmpeg)
        cand = os.path.join(ffmpeg_dir, "ffprobe.exe" if sys.platform == "win32" else "ffprobe")
        if os.path.exists(cand):
            return cand
    return None


def verify_media_streams(file_path: str) -> Dict[str, Any]:
    """
    Verify audio and video streams of the downloaded media file using ffprobe.
    Ensures that a video has video stream, and an audio file has audio stream.
    """
    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        return {
            "success": False,
            "has_video": False,
            "has_audio": False,
            "error": "Tệp không tồn tại hoặc có kích thước 0 bytes"
        }

    ffprobe = get_ffprobe_path()
    if not ffprobe:
        # Fallback if ffprobe binary not found: check file size > 1KB
        return {
            "success": False,
            "has_video": False,
            "has_audio": False,
            "error": "ffprobe không khả dụng; không thể xác minh tệp"
        }

    cmd = [
        ffprobe,
        "-v", "error",
        "-show_entries", "stream=codec_type,codec_name,width,height:format=duration,size",
        "-of", "json",
        file_path
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if proc.returncode != 0:
            return {
                "success": False,
                "has_video": False,
                "has_audio": False,
                "error": f"Lỗi ffprobe: {proc.stderr[:200]}"
            }

        data = json.loads(proc.stdout)
        streams = data.get("streams", [])
        has_video = any(s.get("codec_type") == "video" for s in streams)
        has_audio = any(s.get("codec_type") == "audio" for s in streams)
        vcodec = next((s.get("codec_name") for s in streams if s.get("codec_type") == "video"), None)
        acodec = next((s.get("codec_name") for s in streams if s.get("codec_type") == "audio"), None)

        duration = float(data.get("format", {}).get("duration", 0))

        return {
            "success": True,
            "has_video": has_video,
            "has_audio": has_audio,
            "vcodec": vcodec,
            "acodec": acodec,
            "duration": duration
        }
    except Exception as e:
        return {
            "success": False,
            "has_video": False,
            "has_audio": False,
            "error": f"Lỗi xác minh luồng phương tiện: {str(e)}"
        }


def convert_to_mp3(input_path: str, output_path: str, bitrate: int = 192) -> bool:
    """Convert any audio or video stream to standard MP3 using FFmpeg."""
    ffmpeg = get_ffmpeg_path()
    if not ffmpeg:
        raise RuntimeError("FFmpeg không khả dụng trên hệ thống để chuyển đổi MP3")

    cmd = [
        ffmpeg,
        "-y",
        "-i", input_path,
        "-vn",
        "-c:a", "libmp3lame",
        "-b:a", f"{bitrate}k",
        output_path
    ]

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if proc.returncode != 0 or not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError(f"FFmpeg chuyển đổi thất bại: {proc.stderr[:300]}")
    return True
