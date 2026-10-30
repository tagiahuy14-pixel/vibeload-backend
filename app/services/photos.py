from pathlib import Path
from PIL import Image, UnidentifiedImageError
from fastapi import HTTPException
import urllib.request
from ..config import settings
from ..security import safe_urlopen

FORMATS = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png"),
           "WEBP": ("webp", "image/webp"), "GIF": ("gif", "image/gif"),
           "AVIF": ("avif", "image/avif")}


def download_photo(url: str, target: Path, cancelled=lambda: False, max_bytes=None):
    limit = min(settings.MAX_PHOTO_SIZE_MB * 1024 * 1024,
                max_bytes if max_bytes is not None else settings.MAX_FILE_SIZE_MB * 1024 * 1024)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.tiktok.com/"})
    try:
        with safe_urlopen(request, timeout=settings.SOCKET_TIMEOUT) as response:
            mime = response.headers.get_content_type()
            if not mime.startswith("image/"):
                raise RuntimeError("Nguồn trả về nội dung không phải ảnh")
            size = 0
            with target.open("wb") as output:
                while True:
                    if cancelled():
                        raise RuntimeError("DOWNLOAD_CANCELLED")
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit:
                        raise HTTPException(413, "Ảnh vượt giới hạn dung lượng cho phép")
                    output.write(chunk)
        with Image.open(target) as image:
            detected = FORMATS.get(image.format)
            image.verify()
        if not detected or detected[1] != mime:
            raise RuntimeError("Định dạng ảnh không khớp MIME từ nguồn")
        return detected
    except Exception:
        target.unlink(missing_ok=True)
        raise
