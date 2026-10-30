import threading
import time
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, status
from fastapi import Header
import secrets
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import yt_dlp

from .config import settings
from .errors import install_error_handlers
from .limits import engine_slot
from .schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    DownloadRequest,
    DownloadJobResponse,
    HealthResponse,
    JobStatus
)
from .security import (
    validate_url_security,
    validate_job_id,
    get_client_ip,
    sanitize_filename
)
from .security import validate_platform_url
from .services.photos import download_photo
from starlette.background import BackgroundTask
from .storage import (
    check_storage_capacity,
    cleanup_expired_files,
    get_storage_usage_mb
)
from .extractors.registry import registry
from .services.downloader import run_download_job
from .services.ffmpeg_service import get_ffmpeg_path, get_ffprobe_path
from .workers.jobs import job_manager


# Periodic cleanup loop in background thread
def _background_cleanup_worker(stop_event):
    while not stop_event.wait(300):
        try:
            cleanup_expired_files()
            job_manager.cleanup_old_jobs(settings.STORAGE_TTL_SECONDS)
        except Exception:
            logging.getLogger("vibeload").exception("Temporary storage cleanup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure storage dir exists and start background cleaner
    settings.storage_path
    stop_event = threading.Event()
    cleanup_thread = threading.Thread(target=_background_cleanup_worker, args=(stop_event,), daemon=True)
    cleanup_thread.start()
    try:
        yield
    finally:
        stop_event.set()
        cleanup_thread.join(timeout=1)


app = FastAPI(
    title="VibeLoad Media Engine API",
    version="1.0.0",
    description="High-performance media extractor and downloader service for TikTok, YouTube, Facebook, Instagram, and SoundCloud.",
    lifespan=lifespan
)

# CORS Middleware
origins = settings.CORS_ORIGINS
if isinstance(origins, list):
    origins_list = origins
else:
    origins_list = [str(origins)]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list if origins_list != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
install_error_handlers(app)


@app.get("/")
def get_root():
    return {"status": "ok", "service": "vibeload-backend", "health": "/api/health"}


@app.get("/api/health")
def get_health():
    return {"status": "ok", "service": "vibeload-backend"}


@app.get("/api/system/status", response_model=HealthResponse)
def get_system_status(x_status_token: str = Header(default="")):
    """Protected engine diagnostics; liveness does not depend on this endpoint."""
    if not settings.SYSTEM_STATUS_TOKEN or not secrets.compare_digest(x_status_token, settings.SYSTEM_STATUS_TOKEN):
        raise HTTPException(403, "Không có quyền xem trạng thái engine")
    used_mb, free_mb = get_storage_usage_mb()
    return HealthResponse(
        status="healthy",
        yt_dlp_version=yt_dlp.version.__version__,
        has_ffmpeg=get_ffmpeg_path() is not None,
        has_ffprobe=get_ffprobe_path() is not None,
        active_jobs=job_manager.get_active_count(),
        storage_used_mb=used_mb,
        storage_free_mb=free_mb
    )


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_media(req: AnalyzeRequest):
    """
    Analyze given media URL and return title, thumbnail, duration, author,
    available video resolutions, audio bitrates, or photo albums.
    """
    valid_url = validate_platform_url(req.url)
    with engine_slot("analysis"):
        result = registry.analyze(valid_url)

    if not result.get("success"):
        raise HTTPException(
            status_code=result.get("status_code", 502),
            detail=result.get("error") or "Không thể phân tích phương tiện từ liên kết này."
        )

    return AnalyzeResponse(
        success=True,
        url=result.get("url") or valid_url,
        title=result.get("title") or "Unknown Title",
        thumbnail=result.get("thumbnail") or "",
        uploader=result.get("uploader") or "Unknown Author",
        duration=round(float(result.get("duration") or 0), 1),
        platform=result.get("platform") or "unknown",
        is_photo_album=result.get("is_photo_album", False),
        is_audio_only=result.get("is_audio_only", False),
        video_options=result.get("video_options", []),
        audio_options=result.get("audio_options", []),
        photos=result.get("photos", [])
    )


@app.post("/api/downloads", response_model=DownloadJobResponse, status_code=status.HTTP_202_ACCEPTED)
def create_download(req: DownloadRequest, request: Request, background_tasks: BackgroundTasks):
    """
    Initiate a background media download job with real progress tracking.
    """
    client_ip = get_client_ip(request)

    # 1. SSRF & URL validation
    valid_url = validate_platform_url(req.url)
    req.url = valid_url
    if req.format_id and req.format_id.startswith(("http://", "https://")):
        validate_url_security(req.format_id)

    # 2. Check storage capacity
    check_storage_capacity()

    # 3. Check concurrent limits
    if job_manager.get_active_count() >= settings.MAX_CONCURRENT_JOBS_TOTAL:
        raise HTTPException(
            status_code=429,
            detail="Máy chủ đang xử lý tối đa số lượng tác vụ cho phép. Vui lòng thử lại sau ít phút."
        )

    if job_manager.get_active_count(client_ip) >= settings.MAX_CONCURRENT_JOBS_PER_IP:
        raise HTTPException(
            status_code=429,
            detail=f"Bạn đã vượt quá giới hạn {settings.MAX_CONCURRENT_JOBS_PER_IP} tác vụ tải đồng thời từ địa chỉ IP này."
        )

    # 4. Create Job
    job = job_manager.create_job(client_ip=client_ip, url=valid_url)

    # 5. Dispatch background task
    background_tasks.add_task(run_download_job, job, req)

    return job.to_response()


@app.get("/api/downloads/{id}", response_model=DownloadJobResponse)
def get_download_status(id: str):
    """
    Query real-time status, percent, bytes, speed and ETA of an active or completed download job.
    """
    job_id = validate_job_id(id)
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tải này hoặc tác vụ đã hết hạn.")
    return job.to_response()


@app.post("/api/downloads/{id}/cancel")
def cancel_download(id: str):
    """
    Cancel an active media download job immediately.
    """
    job_id = validate_job_id(id)
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tác vụ tải.")

    cancelled = job_manager.cancel_job(job_id)
    if not cancelled:
        return {"success": False, "message": "Tác vụ không thể hủy (có thể đã hoàn thành hoặc thất bại)."}

    # The worker owns cleanup after observing cancellation; deleting here races writes.
    return {"success": True, "message": "Đã hủy tác vụ tải thành công."}


@app.get("/api/downloads/{id}/file")
def download_media_file(id: str):
    """
    Stream or download the completed media file to client device.
    """
    job_id = validate_job_id(id)
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp hoặc tác vụ đã hết hạn.")

    if job.status != JobStatus.COMPLETED or not job.file_path or not job.file_path.exists():
        raise HTTPException(status_code=409, detail="Tệp phương tiện chưa hoàn tất hoặc đã bị xóa.")

    media_file: Path = job.file_path
    if not media_file.resolve().is_relative_to(settings.storage_path / job_id):
        raise HTTPException(403, "Đường dẫn tệp không hợp lệ")
    filename = job.file_info.filename if job.file_info else media_file.name
    media_type = job.file_info.content_type if job.file_info else "application/octet-stream"

    return FileResponse(
        path=str(media_file),
        media_type=media_type,
        filename=filename,
        headers={
            "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


@app.get("/api/download-photo")
def download_single_photo(request: Request, url: str, filename: str = "photo.jpg"):
    """
    Directly proxy an individual photo to client browser with attachment headers.
    """
    valid_url = validate_url_security(url)
    check_storage_capacity()
    path = settings.storage_path / ("photo-" + uuid.uuid4().hex)
    try:
        with engine_slot("photo"):
            ext, mime = download_photo(valid_url, path)
    except HTTPException:
        raise
    except Exception:
        logging.getLogger("vibeload").exception("Photo download failed requestId=%s", request.state.request_id)
        raise HTTPException(502, "Không tải được ảnh hợp lệ từ nguồn. Vui lòng phân tích lại liên kết.")
    name = Path(sanitize_filename(filename, "photo")).stem + "." + ext
    return FileResponse(path, media_type=mime, filename=name,
                        background=BackgroundTask(path.unlink, missing_ok=True),
                        headers={"Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
                                 "Cache-Control": "no-store"})
