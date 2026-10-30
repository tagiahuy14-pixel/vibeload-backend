import os
import urllib.request
import zipfile
from pathlib import Path
from typing import List, Dict, Any, Callable, Optional


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

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    }

    try:
        for idx, photo in enumerate(photos):
            if is_cancelled_cb and is_cancelled_cb():
                raise RuntimeError("DOWNLOAD_CANCELLED")

            img_url = photo.get("url")
            if not img_url:
                continue

            file_ext = "jpg"
            if ".png" in img_url.lower():
                file_ext = "png"
            elif ".webp" in img_url.lower():
                file_ext = "webp"

            target_filename = f"photo_{idx + 1:02d}.{file_ext}"
            target_path = temp_dir / target_filename

            req = urllib.request.Request(img_url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = resp.read()
                with open(target_path, "wb") as f:
                    f.write(data)

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
