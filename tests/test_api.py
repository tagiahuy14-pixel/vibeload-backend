import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "yt_dlp_version" in data
    assert "has_ffmpeg" in data
    assert "active_jobs" in data


def test_analyze_rejects_ssrf():
    response = client.post("/api/analyze", json={"url": "http://127.0.0.1:8080/test"})
    assert response.status_code == 403


def test_analyze_rejects_empty():
    response = client.post("/api/analyze", json={"url": ""})
    assert response.status_code == 400


def test_download_job_not_found():
    response = client.get("/api/downloads/c9bf9e57-1685-4c89-bafb-ff5af830be8a")
    assert response.status_code == 404
