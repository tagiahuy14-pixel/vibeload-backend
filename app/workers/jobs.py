import threading
import time
import uuid
from pathlib import Path
from typing import Dict, Optional
from ..schemas import JobStatus, FileInfo, DownloadJobResponse


class DownloadJob:
    def __init__(self, job_id: str, client_ip: str, url: str):
        self.id = job_id
        self.client_ip = client_ip
        self.url = url
        self.status = JobStatus.QUEUED
        self.progress_percent = 0.0
        self.downloaded_bytes = 0
        self.total_bytes = 0
        self.speed_bytes_sec = 0.0
        self.eta_seconds = 0
        self.error: Optional[str] = None
        self.file_path: Optional[Path] = None
        self.file_info: Optional[FileInfo] = None
        self.is_cancelled = False
        self.created_at = time.time()
        self.updated_at = time.time()

    def update_progress(self, percent: float, speed: float, downloaded: int, total: int, eta: int):
        self.status = JobStatus.DOWNLOADING
        self.progress_percent = round(percent, 1)
        self.speed_bytes_sec = speed
        self.downloaded_bytes = downloaded
        self.total_bytes = total
        self.eta_seconds = eta
        self.updated_at = time.time()

    def set_processing(self):
        self.status = JobStatus.PROCESSING
        self.progress_percent = 95.0
        self.updated_at = time.time()

    def set_completed(self, file_path: Path, file_info: FileInfo):
        self.status = JobStatus.COMPLETED
        self.progress_percent = 100.0
        self.file_path = file_path
        self.file_info = file_info
        self.updated_at = time.time()

    def set_failed(self, error_message: str):
        self.status = JobStatus.FAILED
        self.error = error_message
        self.updated_at = time.time()

    def cancel(self):
        self.is_cancelled = True
        self.status = JobStatus.CANCELLED
        self.updated_at = time.time()

    def to_response(self) -> DownloadJobResponse:
        return DownloadJobResponse(
            id=self.id,
            status=self.status,
            progress_percent=self.progress_percent,
            downloaded_bytes=self.downloaded_bytes,
            total_bytes=self.total_bytes,
            speed_bytes_sec=self.speed_bytes_sec,
            eta_seconds=self.eta_seconds,
            error=self.error,
            file_info=self.file_info,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )


class JobManager:
    def __init__(self):
        self._jobs: Dict[str, DownloadJob] = {}
        self._lock = threading.Lock()

    def create_job(self, client_ip: str, url: str) -> DownloadJob:
        job_id = str(uuid.uuid4())
        job = DownloadJob(job_id=job_id, client_ip=client_ip, url=url)
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[DownloadJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel_job(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.get(job_id)
            if job and job.status in (JobStatus.QUEUED, JobStatus.DOWNLOADING, JobStatus.PROCESSING):
                job.cancel()
                return True
        return False

    def get_active_count(self, client_ip: Optional[str] = None) -> int:
        active_statuses = (JobStatus.QUEUED, JobStatus.DOWNLOADING, JobStatus.PROCESSING)
        with self._lock:
            if client_ip:
                return sum(1 for j in self._jobs.values() if j.client_ip == client_ip and j.status in active_statuses)
            return sum(1 for j in self._jobs.values() if j.status in active_statuses)

    def cleanup_old_jobs(self, ttl_seconds: int):
        now = time.time()
        with self._lock:
            to_remove = [
                jid for jid, j in self._jobs.items()
                if (now - j.updated_at > ttl_seconds) and j.status not in (JobStatus.QUEUED, JobStatus.DOWNLOADING, JobStatus.PROCESSING)
            ]
            for jid in to_remove:
                del self._jobs[jid]


job_manager = JobManager()
