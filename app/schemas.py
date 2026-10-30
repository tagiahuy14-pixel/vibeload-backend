from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DownloadType(str, Enum):
    VIDEO = "video"
    AUDIO = "audio"
    PHOTOS = "photos"
    SINGLE_PHOTO = "single_photo"


class AnalyzeRequest(BaseModel):
    url: str = Field(..., description="Target media URL to analyze")


class VideoOption(BaseModel):
    format_id: str
    resolution: str
    height: int = 0
    width: int = 0
    ext: str = "mp4"
    filesize: int = 0
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    needs_merge: bool = False


class AudioOption(BaseModel):
    format_id: str
    ext: str = "mp3"
    abr: int = 128
    filesize: int = 0
    acodec: Optional[str] = None


class PhotoItem(BaseModel):
    id: str
    index: int
    url: str
    thumbnail: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None


class AnalyzeResponse(BaseModel):
    success: bool
    url: str
    title: str
    thumbnail: str = ""
    uploader: str = "Unknown Author"
    duration: int = 0
    platform: str = "unknown"
    is_photo_album: bool = False
    is_audio_only: bool = False
    video_options: List[VideoOption] = []
    audio_options: List[AudioOption] = []
    photos: List[PhotoItem] = []
    error: Optional[str] = None


class DownloadRequest(BaseModel):
    url: str = Field(..., description="Target media URL")
    download_type: DownloadType = DownloadType.VIDEO
    format_id: Optional[str] = Field(None, description="Format ID or resolution or URL")
    audio_bitrate: Optional[int] = Field(192, description="Target MP3 bitrate if audio (128, 192, 256, 320)")
    photo_indices: Optional[List[int]] = Field(None, description="Indices of photos to download, or None for all in ZIP")


class FileInfo(BaseModel):
    filename: str
    filesize: int
    content_type: str
    has_video: bool = False
    has_audio: bool = False
    is_zip: bool = False


class DownloadJobResponse(BaseModel):
    id: str
    status: JobStatus
    progress_percent: float = 0.0
    downloaded_bytes: int = 0
    total_bytes: int = 0
    speed_bytes_sec: float = 0.0
    eta_seconds: int = 0
    error: Optional[str] = None
    file_info: Optional[FileInfo] = None
    created_at: float
    updated_at: float


class HealthResponse(BaseModel):
    status: str
    yt_dlp_version: str
    has_ffmpeg: bool
    has_ffprobe: bool
    active_jobs: int
    storage_used_mb: float
    storage_free_mb: float
