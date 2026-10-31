from pathlib import Path
try:
    from PIL import Image, UnidentifiedImageError
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    Image = None
    UnidentifiedImageError = Exception
from fastapi import HTTPException
import urllib.request
from ..config import settings
from ..security import safe_urlopen

FORMATS = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png"),
           "WEBP": ("webp", "image/webp"), "GIF": ("gif", "image/gif"),
           "AVIF": ("avif", "image/avif")}


def _detect_magic(path: Path):
    with path.open("rb") as f:
        header = f.read(16)
    if header.startswith(b"\xff\xd8\xff"):
        return ("jpg", "image/jpeg")
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return ("png", "image/png")
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return ("webp", "image/webp")
    if header.startswith((b"GIF87a", b"GIF89a")):
        return ("gif", "image/gif")
    return None


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
        if HAS_PIL and Image is not None:
            with Image.open(target) as image:
                detected = FORMATS.get(image.format)
                image.verify()
        else:
            detected = _detect_magic(target)
        if not detected or detected[1] != mime:
            raise RuntimeError("Định dạng ảnh không khớp MIME từ nguồn")
        return detected
    except Exception:
        target.unlink(missing_ok=True)
        raise
