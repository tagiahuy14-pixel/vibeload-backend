from contextlib import contextmanager
from threading import BoundedSemaphore
from fastapi import HTTPException
from .config import settings

_analysis_slots = BoundedSemaphore(max(1, settings.MAX_CONCURRENT_JOBS_TOTAL))
_photo_slots = BoundedSemaphore(max(1, settings.MAX_CONCURRENT_JOBS_TOTAL))


@contextmanager
def engine_slot(kind):
    slots = _analysis_slots if kind == "analysis" else _photo_slots
    if not slots.acquire(blocking=False):
        raise HTTPException(429, "Máy chủ đang bận. Vui lòng thử lại sau ít giây.")
    try:
        yield
    finally:
        slots.release()
