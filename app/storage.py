import os
import shutil
import time
from pathlib import Path
from typing import Tuple, Optional
from fastapi import HTTPException
from .config import settings


def get_storage_usage_mb() -> Tuple[float, float]:
    """Return (used_mb, free_mb) for the storage volume."""
    storage_dir = settings.storage_path
    total_size = 0
    for root, dirs, files in os.walk(storage_dir):
        for f in files:
            fp = os.path.join(root, f)
            try:
                total_size += os.path.getsize(fp)
            except OSError:
                pass
    used_mb = total_size / (1024 * 1024)

    total, used, free = shutil.disk_usage(storage_dir)
    free_mb = free / (1024 * 1024)
    return round(used_mb, 2), round(free_mb, 2)


def check_storage_capacity():
    """Ensure storage usage is within configured limit."""
    used_mb, free_mb = get_storage_usage_mb()
    if used_mb >= settings.MAX_STORAGE_MB:
        cleanup_expired_files(force_aggressive=True)
        used_mb, free_mb = get_storage_usage_mb()
        if used_mb >= settings.MAX_STORAGE_MB:
            raise HTTPException(
                status_code=507,
                detail=f"Dung lượng lưu trữ tạm trên máy chủ đã đầy ({used_mb:.1f} MB / {settings.MAX_STORAGE_MB} MB). Vui lòng thử lại sau."
            )
    if free_mb < 200:  # Under 200 MB disk free
        raise HTTPException(
            status_code=507,
            detail="Ổ đĩa máy chủ không còn đủ dung lượng khả dụng."
        )


def cleanup_expired_files(force_aggressive: bool = False):
    """
    Remove temporary job directories older than STORAGE_TTL_SECONDS.
    If force_aggressive is True, removes files older than 5 minutes.
    """
    storage_dir = settings.storage_path
    ttl = 300 if force_aggressive else settings.STORAGE_TTL_SECONDS
    now = time.time()

    try:
        for entry in storage_dir.iterdir():
            if entry.is_file() and entry.name.startswith("photo-"):
                if now - entry.stat().st_mtime > ttl:
                    entry.unlink(missing_ok=True)
                continue
            if entry.is_dir():
                from .workers.jobs import job_manager
                from .schemas import JobStatus
                job = job_manager.get_job(entry.name)
                if job and job.status in (JobStatus.QUEUED, JobStatus.DOWNLOADING, JobStatus.PROCESSING):
                    continue
                mtime = entry.stat().st_mtime
                if now - mtime > ttl:
                    try:
                        shutil.rmtree(entry, ignore_errors=True)
                    except Exception:
                        pass
    except Exception:
        pass


def get_job_dir(job_id: str) -> Path:
    """Get isolated directory path for a specific job."""
    job_dir = (settings.storage_path / job_id).resolve()
    if not job_dir.is_relative_to(settings.storage_path):
        raise HTTPException(status_code=400, detail="Đường dẫn không hợp lệ")
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir


def delete_job_dir(job_id: str):
    """Safely delete job directory and all its files."""
    try:
        job_dir = (settings.storage_path / job_id).resolve()
        if job_dir.is_relative_to(settings.storage_path) and job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
    except Exception:
        pass
