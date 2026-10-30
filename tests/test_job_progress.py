import json
import pytest
from app.workers.jobs import DownloadJob
from app.schemas import FileInfo, JobStatus


def job():
    return DownloadJob("6a9d0a0d-b73f-4d7a-9f1c-ef362a849d49", "test", "https://soundcloud.com/example/track")


def test_real_soundcloud_hls_estimate_is_serializable():
    task = job()
    # Captured from a real yt-dlp 2026.10.26 SoundCloud download.
    task.update_progress(6.093127760892837, 504219.7212986238, 206326, 2708966.666666667, 0)
    response = json.loads(task.to_response().model_dump_json())
    assert response["total_bytes"] == 2708966
    assert response["downloaded_bytes"] == 206326


@pytest.mark.parametrize("eta,expected", [
    (0.3710743243961664, 0),  # Exact value from Render's traceback.
    (0.999, 0), (1.9, 1), (-0.371, 0), (-5, 0),
    (None, 0), (float("nan"), 0), (float("inf"), 0), (float("-inf"), 0),
    ("invalid", 0), ("", 0), ({}, 0), ([], 0), (True, 0), (False, 0),
])
def test_eta_is_normalized_at_progress_source(eta, expected):
    task = job()
    task.update_progress(10, 100, 10, 100, eta)
    assert type(task.eta_seconds) is int
    assert task.eta_seconds == expected
    assert json.loads(task.to_response().model_dump_json())["eta_seconds"] == expected


def test_repeated_status_gets_during_worker_progress_never_return_500(monkeypatch):
    import threading
    from fastapi.testclient import TestClient
    from app.main import app
    from app.workers.jobs import JobManager
    manager = JobManager()
    monkeypatch.setattr("app.main.job_manager", manager)
    task = manager.create_job("eta-regression", "https://soundcloud.com/example/track")
    values = [0.3710743243961664, -1, None, float("nan"), float("inf"), "invalid"]
    stop = threading.Event()
    ready = threading.Event()
    def update():
        while not stop.is_set():
            for eta in values:
                task.update_progress(10, 100, 10, 2708966.666666667, eta)
                ready.set()
                if stop.wait(.001):
                    return
    worker = threading.Thread(target=update, daemon=True)
    worker.start()
    assert ready.wait(timeout=5)
    try:
        client = TestClient(app, raise_server_exceptions=False)
        for _ in range(100):
            response = client.get(f"/api/downloads/{task.id}")
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["status"] == "downloading"
            assert type(body["eta_seconds"]) is int and body["eta_seconds"] >= 0
            assert type(body["total_bytes"]) is int
    finally:
        stop.set()
        worker.join(timeout=5)


@pytest.mark.parametrize("value", [None, float("nan"), float("inf"), -1])
def test_unknown_or_invalid_progress_never_breaks_json(value):
    task = job()
    task.update_progress(value, value, value, value, value)
    assert json.loads(task.to_response().model_dump_json())["total_bytes"] == 0


def test_completed_size_is_verified_file_size(tmp_path):
    task = job()
    task.update_progress(80, 200, 4029317, 4049253.333333333, 2.5)
    task.set_completed(tmp_path / "audio.mp3", FileInfo(filename="audio.mp3", filesize=4788179, content_type="audio/mpeg", has_audio=True))
    response = task.to_response()
    assert response.total_bytes == response.downloaded_bytes == 4788179
    assert response.progress_percent == 100 and response.eta_seconds == 0


def test_cancellation_cannot_be_overwritten_by_late_worker_result(tmp_path):
    task = job()
    task.cancel()
    with pytest.raises(RuntimeError, match="DOWNLOAD_CANCELLED"):
        task.set_completed(tmp_path / "audio.mp3", FileInfo(filename="audio.mp3", filesize=100, content_type="audio/mpeg"))
    task.set_failed("Late error")
    assert task.to_response().status == JobStatus.CANCELLED
