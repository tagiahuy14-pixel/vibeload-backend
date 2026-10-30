import logging
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.extractor_diagnostics import classify_extractor_error, redact_log


@pytest.mark.parametrize("raw,status,code", [
    ("Sign in to confirm you’re not a bot. Use --cookies", 403, "BOT_VERIFICATION_REQUIRED"),
    ("This video is private", 403, "PRIVATE_MEDIA"),
    ("private video", 403, "PRIVATE_MEDIA"),
    ("Sign in to access this video", 403, "AUTH_REQUIRED"),
    ("HTTP Error 403: Forbidden", 403, "UPSTREAM_FORBIDDEN"),
    ("HTTP Error 429: Too Many Requests", 429, "UPSTREAM_RATE_LIMITED"),
    ("HTTP Error 404", 404, "MEDIA_NOT_FOUND"),
    ("This video is DRM protected", 403, "DRM_PROTECTED"),
    ("The read operation timed out", 504, "UPSTREAM_TIMEOUT"),
])
def test_upstream_reasons_are_not_conflated(raw, status, code):
    actual_status, actual_code, message, retryable = classify_extractor_error(raw)
    assert (actual_status, actual_code) == (status, code)
    assert "--cookies" not in message
    if status == 403:
        assert retryable is False


def test_logs_redact_headers_and_signed_urls():
    raw = 'failed https://cdn.example/video?token=secret&signature=abc\nCookie: session=private\nAuthorization: Bearer xyz'
    clean = redact_log(raw)
    assert "secret" not in clean and "abc" not in clean
    assert "private" not in clean and "xyz" not in clean


def test_api_preserves_bot_reason_and_request_id(monkeypatch):
    monkeypatch.setattr("app.main.validate_platform_url", lambda url: url)
    monkeypatch.setattr("app.main.registry.analyze", lambda url: {
        "success": False, "status_code": 403, "error_code": "BOT_VERIFICATION_REQUIRED",
        "error": "Nguồn yêu cầu xác minh bot/CAPTCHA.", "retryable": False})
    response = TestClient(app).post("/api/analyze", json={"url": "https://youtu.be/example"})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "BOT_VERIFICATION_REQUIRED"
    assert response.json()["error"]["requestId"] == response.headers["x-request-id"]
    assert response.json()["error"]["retryable"] is False


def test_render_youtube_error_flows_through_extractor_api_and_logs(monkeypatch, caplog):
    import yt_dlp
    class DeniedEngine:
        def __init__(self, options):
            assert not options.get("cookiefile")
            assert not options.get("cookiesfrombrowser")
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def extract_info(self, *args, **kwargs):
            raise yt_dlp.utils.DownloadError("ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you’re not a bot.")
    monkeypatch.setattr("app.main.validate_platform_url", lambda url: url)
    monkeypatch.setattr("app.extractors.ytdlp_extractor.yt_dlp.YoutubeDL", DeniedEngine)
    with caplog.at_level(logging.ERROR, logger="vibeload.extractor"):
        response = TestClient(app).post("/api/analyze", json={"url": "https://www.youtube.com/watch?v=jNQXAC9IVRw"})
    assert response.status_code == 403
    error = response.json()["error"]
    assert error["code"] == "BOT_VERIFICATION_REQUIRED"
    assert "bot/CAPTCHA" in error["message"] and "riêng tư" not in error["message"]
    assert error["retryable"] is False
    assert error["requestId"] in caplog.text
    assert "yt_dlp=" in caplog.text
