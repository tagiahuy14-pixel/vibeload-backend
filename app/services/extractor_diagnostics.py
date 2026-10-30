"""Safe extractor diagnostics and honest upstream error classifications."""
import logging
import re
import traceback
from ..errors import request_id_context

logger = logging.getLogger("vibeload.extractor")


def redact_log(message):
    text = str(message)
    text = re.sub(r"(https?://[^\s?'\"<>]+)\?[^\s'\"<>]+", r"\1?[redacted]", text)
    return re.sub(r"(?im)^.*(?:authorization|set-cookie|cookie)\s*:\s*.*$", "[sensitive header redacted]", text)


def classify_extractor_error(error):
    raw = str(error).lower()
    if "drm" in raw:
        return 403, "DRM_PROTECTED", "Nội dung được bảo vệ DRM; không thể tải.", False
    if "not a bot" in raw or "captcha" in raw:
        return 403, "BOT_VERIFICATION_REQUIRED", "Nguồn yêu cầu xác minh bot/CAPTCHA. Backend hiện không thể truy cập nội dung này.", False
    if "private video" in raw or "private content" in raw or "video is private" in raw:
        return 403, "PRIVATE_MEDIA", "Nội dung ở chế độ riêng tư; backend không có quyền truy cập.", False
    if any(term in raw for term in ("sign in", "log in", "login", "authentication required")):
        return 403, "AUTH_REQUIRED", "Nguồn yêu cầu đăng nhập; backend không thể tải nội dung này.", False
    if "403" in raw and ("http" in raw or "forbidden" in raw):
        return 403, "UPSTREAM_FORBIDDEN", "Nguồn từ chối truy cập từ backend (HTTP 403). Chưa đủ dữ liệu để kết luận nguyên nhân.", False
    if any(term in raw for term in ("404", "not found", "does not exist")):
        return 404, "MEDIA_NOT_FOUND", "Bài viết hoặc video không tồn tại hoặc đã bị xóa.", False
    if "429" in raw or "too many requests" in raw:
        return 429, "UPSTREAM_RATE_LIMITED", "Nguồn đang giới hạn số yêu cầu. Vui lòng thử lại sau.", True
    if "timed out" in raw or "timeout" in raw:
        return 504, "UPSTREAM_TIMEOUT", "Nguồn không phản hồi trong thời gian cho phép.", True
    return 502, "MEDIA_EXTRACTION_FAILED", "Không thể phân tích nội dung từ nguồn. Liên kết có thể hết hạn hoặc nền tảng tạm thời không phản hồi.", True


class ExtractorLogger:
    def debug(self, message):
        # Do not log yt-dlp's full option/header dump.
        if not str(message).startswith("[debug]"):
            logger.info("requestId=%s %s", request_id_context.get(), redact_log(message))

    def warning(self, message):
        logger.warning("requestId=%s %s", request_id_context.get(), redact_log(message))

    def error(self, message):
        logger.error("requestId=%s %s", request_id_context.get(), redact_log(message))


def log_extractor_failure(code):
    import yt_dlp.version
    logger.error("Extractor failed requestId=%s yt_dlp=%s code=%s traceback=%s", request_id_context.get(), yt_dlp.version.__version__, code,
                 redact_log(traceback.format_exc()))
