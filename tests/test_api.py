import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data == {"status": "ok", "service": "vibeload-backend"}


def test_root_and_health_do_not_depend_on_storage(monkeypatch):
    monkeypatch.setattr("app.main.get_storage_usage_mb", lambda: (_ for _ in ()).throw(PermissionError()))
    assert client.get("/").status_code == 200
    assert client.get("/api/health").status_code == 200


def test_system_status_requires_explicit_token():
    assert client.get("/api/system/status").status_code == 403


def test_validation_errors_are_structured():
    response = client.post("/api/analyze", json={})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
    assert response.json()["error"]["requestId"] == response.headers["x-request-id"]


def test_cors_preflight():
    response = client.options("/api/analyze", headers={"Origin": "https://vibeload-web.vercel.app", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "Content-Type"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://vibeload-web.vercel.app"
    response = client.options("/api/analyze", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in response.headers


def test_short_tiktok_url_reaches_extractor(monkeypatch):
    monkeypatch.setattr("app.security.socket.getaddrinfo", lambda *a: [(2, 1, 6, "", ("8.8.8.8", 443))])
    captured = []
    def analyze(url):
        captured.append(url)
        return {"success": True, "title": "sample", "platform": "tiktok", "photos": []}
    monkeypatch.setattr("app.main.registry.analyze", analyze)
    response = client.post("/api/analyze", json={"url": "https://vt.tiktok.com/abc/"})
    assert response.status_code == 200
    assert captured == ["https://vt.tiktok.com/abc/"]


def test_extractor_failure_is_502(monkeypatch):
    monkeypatch.setattr("app.main.validate_platform_url", lambda url: url)
    monkeypatch.setattr("app.main.registry.analyze", lambda url: {"success": False, "error": "Không thể phân tích nội dung"})
    response = client.post("/api/analyze", json={"url": "https://vt.tiktok.com/abc/"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "MEDIA_EXTRACTION_FAILED"


def test_photo_download_with_vietnamese_filename(monkeypatch, tmp_path):
    import io
    from PIL import Image
    from urllib.parse import unquote
    stream = io.BytesIO()
    Image.new("RGB", (3, 2), "blue").save(stream, format="PNG")
    def download(url, path):
        path.write_bytes(stream.getvalue())
        return "png", "image/png"
    monkeypatch.setattr("app.main.validate_url_security", lambda url: url)
    monkeypatch.setattr("app.main.download_photo", download)
    monkeypatch.setattr("app.main.settings.STORAGE_DIR", str(tmp_path))
    response = client.get("/api/download-photo", params={"url": "https://cdn.example/photo", "filename": "TikTok Ảnh_01.jpg"})
    assert response.status_code == 200
    disposition = response.headers["content-disposition"]
    disposition.encode("ascii")
    assert "filename*=utf-8''" in disposition
    assert "TikTok Ảnh_01.png" in unquote(disposition)
    assert response.content == stream.getvalue()
    assert list(tmp_path.iterdir()) == []  # FileResponse background cleanup ran.


def test_photo_upstream_error_is_not_500(monkeypatch):
    monkeypatch.setattr("app.main.validate_url_security", lambda url: url)
    def fail(*a):
        raise RuntimeError("Invalid image")
    monkeypatch.setattr("app.main.download_photo", fail)
    response = client.get("/api/download-photo", params={"url": "https://cdn.example/photo", "filename": "Ảnh.jpg"})
    assert response.status_code == 502
    assert response.json()["success"] is False


def test_analyze_rejects_ssrf():
    response = client.post("/api/analyze", json={"url": "http://127.0.0.1:8080/test"})
    assert response.status_code == 403


def test_analyze_rejects_empty():
    response = client.post("/api/analyze", json={"url": ""})
    assert response.status_code == 400


def test_download_job_not_found():
    response = client.get("/api/downloads/c9bf9e57-1685-4c89-bafb-ff5af830be8a")
    assert response.status_code == 404
