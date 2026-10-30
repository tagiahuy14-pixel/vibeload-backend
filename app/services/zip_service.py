import os
import urllib.request
import zipfile
from pathlib import Path
from typing import List, Dict, Any, Callable, Optional
from .photos import download_photo
from ..config import settings


def create_photo_zip(
    photos: List[Dict[str, Any]],
    output_zip_path: Path,
    progress_cb: Optional[Callable[[float, int, int], None]] = None,
    is_cancelled_cb: Optional[Callable[[], bool]] = None
) -> Path:
    """
    Download a list of photo items and bundle them into a validated ZIP archive.
    """
    temp_dir = output_zip_path.parent / "raw_photos"
    temp_dir.mkdir(parents=True, exist_ok=True)

    downloaded_files: List[Tuple[str, Path]] = []
    total = len(photos)
    total_bytes = 0

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    }

    try:
        for idx, photo in enumerate(photos):
            if is_cancelled_cb and is_cancelled_cb():
                raise RuntimeError("DOWNLOAD_CANCELLED")

            img_url = photo.get("url")
            if not img_url:
                raise RuntimeError(f"Ảnh #{photo.get('index', idx + 1)} thiếu URL; đã tải {idx}/{total} ảnh")

            file_ext = "jpg"
            if ".png" in img_url.lower():
                file_ext = "png"
            elif ".webp" in img_url.lower():
                file_ext = "webp"

            target_filename = f"photo_{idx + 1:02d}.{file_ext}"
            target_path = temp_dir / target_filename

            try:
                ext, mime = download_photo(img_url, target_path,
                    is_cancelled_cb or (lambda: False),
                    settings.MAX_FILE_SIZE_MB * 1024 * 1024 - total_bytes)
                total_bytes += target_path.stat().st_size
                actual_path = target_path.with_suffix("." + ext)
                if actual_path != target_path:
                    target_path.rename(actual_path)
                target_path = actual_path
                target_filename = target_path.name
            except Exception as exc:
                if str(exc) == "DOWNLOAD_CANCELLED":
                    raise
                raise RuntimeError(f"Ảnh #{photo.get('index', idx + 1)} tải thất bại; đã hoàn tất {idx}/{total} ảnh") from exc

            downloaded_files.append((target_filename, target_path))

            if progress_cb:
                pct = ((idx + 1) / total) * 80.0  # First 80% for downloading
                progress_cb(pct, idx + 1, total)

        if not downloaded_files:
            raise RuntimeError("Không thể tải được bất kỳ ảnh nào từ bài viết")

        # Create ZIP
        if is_cancelled_cb and is_cancelled_cb():
            raise RuntimeError("DOWNLOAD_CANCELLED")

        with zipfile.ZipFile(output_zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for arcname, fpath in downloaded_files:
                zf.write(fpath, arcname=arcname)

        # Validate ZIP integrity
        with zipfile.ZipFile(output_zip_path, "r") as zf:
            corrupted = zf.testzip()
            if corrupted is not None:
                raise RuntimeError(f"Tệp ZIP bị lỗi dữ liệu tại mục: {corrupted}")

        if progress_cb:
            progress_cb(100.0, total, total)

        return output_zip_path
    finally:
        # Clean up temporary raw photos directory
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
