import asyncio
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import yt_dlp

from .config import settings
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
    get_client_ip
)
from .storage import (
    check_storage_capacity,
    cleanup_expired_files,
    get_storage_usage_mb,
    delete_job_dir
)
from .extractors.registry import registry
from .services.downloader import run_download_job
from .services.ffmpeg_service import get_ffmpeg_path, get_ffprobe_path
from .workers.jobs import job_manager


# Periodic cleanup loop in background thread
def _background_cleanup_worker():
    while True:
        try:
            time.sleep(300)  # Check every 5 minutes
            cleanup_expired_files()
            job_manager.cleanup_old_jobs(settings.STORAGE_TTL_SECONDS)
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure storage dir exists and start background cleaner
    settings.storage_path
    cleanup_thread = threading.Thread(target=_background_cleanup_worker, daemon=True)
    cleanup_thread.start()
    yield
    # Shutdown


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


@app.get("/api/health", response_model=HealthResponse)
def get_health():
    """Health check endpoint providing engine versions and storage statistics."""
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
    valid_url = validate_url_security(req.url)
    result = registry.analyze(valid_url)

    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error") or "Không thể phân tích phương tiện từ liên kết này."
        )

    return AnalyzeResponse(
        success=True,
        url=result.get("url") or valid_url,
        title=result.get("title") or "Unknown Title",
        thumbnail=result.get("thumbnail") or "",
        uploader=result.get("uploader") or "Unknown Author",
        duration=result.get("duration") or 0,
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
    valid_url = validate_url_security(req.url)
    req.url = valid_url

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

    # Schedule cleanup of partial files
    delete_job_dir(job_id)
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
        raise HTTPException(status_code=400, detail="Tệp phương tiện chưa hoàn tất hoặc đã bị xóa.")

    media_file: Path = job.file_path
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
