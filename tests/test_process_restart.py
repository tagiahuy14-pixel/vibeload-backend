"""Local process lifecycle checks; fixtures are not real-media evidence."""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def test_job_memory_disappears_after_real_process_restart(tmp_path):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    marker = tmp_path / "marker.json"
    env = dict(os.environ, STORAGE_DIR=str(tmp_path / "storage"), PORT=str(port), VIBELOAD_DEBUG="false")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    script = """
import json, os
from pathlib import Path
from app.config import settings
from app.workers.jobs import job_manager
from app.storage import get_job_dir
from app.schemas import FileInfo
if os.environ['AUDIT_SEED_JOB'] == '1':
    job = job_manager.create_job('restart-test', 'https://youtu.be/fixture')
    path = get_job_dir(job.id) / 'fixture.txt'
    path.write_bytes(b'lifecycle fixture, not media')
    job.set_completed(path, FileInfo(filename=path.name, filesize=path.stat().st_size, content_type='text/plain'))
    active = job_manager.create_job('restart-test', 'https://youtu.be/fixture')
    active.update_progress(10, 0, 100, 1000, 0)
    Path(os.environ['AUDIT_MARKER']).write_text(json.dumps({'completed':job.id,'active':active.id,'file':str(path)}))
import uvicorn
uvicorn.run('app.main:app', host='127.0.0.1', port=settings.PORT, log_level='error')
"""

    def start(seed):
        logfile = (tmp_path / ("first.log" if seed else "second.log")).open("w")
        process = subprocess.Popen([sys.executable, "-c", script], cwd=str(Path(__file__).resolve().parents[1]),
            env=dict(env, AUDIT_SEED_JOB="1" if seed else "0", AUDIT_MARKER=str(marker)),
            stdout=logfile, stderr=subprocess.STDOUT, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if process.poll() is not None:
                logfile.close()
                raise AssertionError("Local server exited; inspect " + str(tmp_path))
            try:
                with opener.open(f"http://127.0.0.1:{port}/api/health", timeout=1) as response:
                    if response.status == 200:
                        return process, logfile
            except (OSError, urllib.error.URLError):
                time.sleep(0.05)
        process.terminate()
        process.wait(timeout=5)
        logfile.close()
        raise AssertionError("Local server did not start")

    def stop(process, logfile):
        process.terminate()
        process.wait(timeout=5)
        logfile.close()

    process, logfile = start(True)
    try:
        ids = json.loads(marker.read_text())
        with opener.open(f"http://127.0.0.1:{port}/api/downloads/{ids['completed']}/file") as response:
            assert response.read() == b"lifecycle fixture, not media"
    finally:
        stop(process, logfile)
    # A local disk survives process restart; the in-memory job registry does not.
    assert Path(ids["file"]).exists()
    process, logfile = start(False)
    try:
        for job_id in (ids["completed"], ids["active"]):
            for suffix in ("", "/file"):
                try:
                    opener.open(f"http://127.0.0.1:{port}/api/downloads/{job_id}{suffix}")
                except urllib.error.HTTPError as error:
                    assert error.code == 404
                    assert json.load(error)["error"]["code"] == "NOT_FOUND"
                else:
                    raise AssertionError("Job unexpectedly survived process restart")
    finally:
        stop(process, logfile)
