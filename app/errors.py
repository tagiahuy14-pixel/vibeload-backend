import logging
import uuid

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger("vibeload")


def error_response(request: Request, status: int, code: str, message: str):
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    headers = {"X-Request-ID": request_id}
    from .config import settings
    if request.headers.get("origin") in settings.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = request.headers["origin"]
        headers["Vary"] = "Origin"
    return JSONResponse(status_code=status, content={
        "success": False,
        "error": {"code": code, "message": message,
                  "retryable": status in (429, 502, 503, 504), "requestId": request_id},
    }, headers=headers)


def install_error_handlers(app):
    @app.middleware("http")
    async def request_id(request, call_next):
        request.state.request_id = str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        codes = {400: "INVALID_REQUEST", 403: "ACCESS_DENIED", 404: "NOT_FOUND",
                 409: "JOB_NOT_READY", 413: "FILE_TOO_LARGE", 429: "RATE_LIMITED",
                 502: "MEDIA_EXTRACTION_FAILED", 503: "ENGINE_UNAVAILABLE", 504: "UPSTREAM_TIMEOUT"}
        return error_response(request, exc.status_code, codes.get(exc.status_code, "REQUEST_FAILED"), str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error_response(request, 400, "INVALID_REQUEST", "URL hoặc tham số không hợp lệ.")

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        logger.error("Unhandled error requestId=%s", getattr(request.state, "request_id", ""),
                     exc_info=(type(exc), exc, exc.__traceback__))
        return error_response(request, 500, "INTERNAL_ERROR", "Máy chủ gặp lỗi nội bộ. Vui lòng gửi mã yêu cầu để kiểm tra.")
