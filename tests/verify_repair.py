"""Live checks, never run by pytest. Usage: python tests/verify_repair.py [sample]."""
import hashlib
import json
import sys
import time
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import settings
from app.extractors.registry import registry
from app.schemas import DownloadRequest, DownloadType
from app.services.downloader import run_download_job
from app.services.photos import download_photo
from app.services.ffmpeg_service import verify_media_streams
from app.workers.jobs import job_manager
from PIL import Image

OUTPUT = Path(__file__).resolve().parents[2] / ".qa" / "repair-live"
OUTPUT.mkdir(parents=True, exist_ok=True)
settings.STORAGE_DIR = str(OUTPUT / "storage")

SAMPLES = {
    "tiktok": ("https://www.tiktok.com/@kn10hd/video/7697035038751231240", "video"),
    "photo": ("https://www.tiktok.com/@hullcity/photo/7557376330036153622", "photos"),
    "album": ("https://www.tiktok.com/@hullcity/photo/7553302113757990166", "photos"),
    "short": ("https://vm.tiktok.com/ZGdhVtER2/", "photos"),
    "youtube": ("https://www.youtube.com/watch?v=jNQXAC9IVRw", "video"),
    "mp3": ("https://www.youtube.com/watch?v=jNQXAC9IVRw", "audio"),
    "facebook": ("https://www.facebook.com/watch/?v=10153231379946729", "video"),
    "instagram": ("https://www.instagram.com/p/DZN3mhZBQ_Q/", "video"),
    "soundcloud": ("https://soundcloud.com/nocopyrightsounds/sace-caramel-ncs-release", "audio"),
}


def verify(name):
    url, kind = SAMPLES[name]
    started = time.monotonic()
    result = {"sample": name, "url": url, "success": False}
    try:
        analysis = registry.analyze(url)
        result["analyze_success"] = bool(analysis.get("success"))
        result["photo_count"] = len(analysis.get("photos", []))
        if not analysis.get("success"):
            result["error"] = analysis.get("error")
            return result
        if kind == "photos":
            if not analysis.get("photos"):
                raise RuntimeError("No post photos were extracted")
            photo_path = OUTPUT / (name + "-single")
            ext, mime = download_photo(analysis["photos"][0]["url"], photo_path)
            with Image.open(photo_path) as image:
                result["single_photo"] = {"format": image.format, "size": image.size, "bytes": photo_path.stat().st_size}
            from fastapi.testclient import TestClient
            from app.main import app
            from urllib.parse import unquote
            response = TestClient(app).get("/api/download-photo", params={"url": analysis["photos"][0]["url"], "filename": "TikTok Ảnh_01.jpg"})
            assert response.status_code == 200, response.text[:200]
            disposition = response.headers["content-disposition"]
            disposition.encode("ascii")
            result["photo_api"] = {"status": response.status_code, "content_type": response.headers["content-type"], "disposition": unquote(disposition), "bytes": len(response.content)}
        fmt = analysis["video_options"][0]["format_id"] if kind == "video" and analysis.get("video_options") else None
        job = job_manager.create_job("live-check", url)
        run_download_job(job, DownloadRequest(url=url, download_type=kind, format_id=fmt))
        result["job_status"] = job.status.value
        if job.error:
            result["error"] = job.error
        if job.file_path and job.file_path.exists():
            result["file"] = str(job.file_path.relative_to(OUTPUT))
            result["bytes"] = job.file_path.stat().st_size
            with job.file_path.open("rb") as file:
                result["sha256"] = hashlib.file_digest(file, "sha256").hexdigest()
            if kind == "photos":
                with zipfile.ZipFile(job.file_path) as archive:
                    result["archive_entries"] = archive.namelist()
                    assert len(archive.namelist()) == len(analysis["photos"])
                    assert archive.testzip() is None
            else:
                result["streams"] = verify_media_streams(str(job.file_path))
            result["success"] = job.status.value == "completed"
    except Exception as exc:
        result["error"] = str(exc)
    finally:
        result["seconds"] = round(time.monotonic() - started, 2)
        (OUTPUT / (name + ".json")).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(result, ensure_ascii=True), flush=True)
    return result


if __name__ == "__main__":
    selected = sys.argv[1:] or list(SAMPLES)
    for name in selected:
        verify(name)
