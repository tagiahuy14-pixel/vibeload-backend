"""Read/test existing production APIs; never deploy or change hosting settings."""
import argparse
import datetime as dt
import hashlib
import io
import json
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from PIL import Image

BASE = "https://vibeload-backend.onrender.com"
ORIGIN = "https://vibeload-web.vercel.app"
OUT = Path(__file__).resolve().parents[2] / ".qa" / "postdeploy-audit"
SAMPLES = {
    "youtube": ("https://www.youtube.com/watch?v=jNQXAC9IVRw", "video"),
    "facebook": ("https://www.facebook.com/watch/?v=10153231379946729", "video"),
    "instagram": ("https://www.instagram.com/p/DZN3mhZBQ_Q/", "video"),
    "soundcloud": ("https://soundcloud.com/nocopyrightsounds/sace-caramel-ncs-release", "audio"),
    "tiktok": ("https://www.tiktok.com/@kn10hd/video/7697035038751231240", "video"),
    "tiktok-mp3": ("https://www.tiktok.com/@kn10hd/video/7697035038751231240", "audio"),
    "album": ("https://www.tiktok.com/@hullcity/photo/7553302113757990166", "photos"),
}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def save(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / (name + ".json")).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: data.get(key) for key in ("platform", "status", "job_id", "file", "decode", "exception")}, ensure_ascii=True), flush=True)


def call(path, data=None, method=None, timeout=100):
    payload = json.dumps(data).encode() if data is not None else None
    headers = {"Origin": ORIGIN, "User-Agent": "VibeLoad-production-audit"}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    started = time.monotonic()
    request = urllib.request.Request(BASE + path, data=payload, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read()
        meta = {"at": now(), "path": path.split("?")[0], "status": response.status,
                "seconds": round(time.monotonic() - started, 3),
                "request_id": response.headers.get("X-Request-ID"),
                "content_type": response.headers.get("Content-Type"),
                "cors": response.headers.get("Access-Control-Allow-Origin")}
        return meta, body, response.headers


def api(path, data=None):
    meta, body, _ = call(path, data)
    try:
        parsed = json.loads(body)
    except ValueError:
        parsed = {"non_json": body[:200].decode("utf-8", errors="replace")}
    return meta, parsed


def audit(name, poll_interval=1.0):
    url, kind = SAMPLES[name]
    result = {"platform": name, "source": url, "started": now(), "status": "Không đạt", "events": []}
    try:
        meta, analysis = api("/api/analyze", {"url": url})
        result["events"].append({**meta, "response": analysis})
        if meta["status"] != 200 or not analysis.get("success"):
            result["error"] = analysis
            return
        assert analysis.get("title") and analysis.get("uploader")
        request = {"url": url, "download_type": kind}
        if kind == "video":
            assert analysis.get("video_options"), "No video formats"
            request["format_id"] = analysis["video_options"][0]["format_id"]
        if kind == "photos":
            assert len(analysis.get("photos", [])) >= 2
            request["photo_indices"] = [p["index"] for p in analysis["photos"]]
            photo = analysis["photos"][0]
            path = "/api/download-photo?" + urllib.parse.urlencode({"url": photo["url"], "filename": "TikTok Ảnh_01.jpg"})
            photo_meta, content, headers = call(path)
            assert photo_meta["status"] == 200
            with Image.open(io.BytesIO(content)) as image:
                image.verify()
            disposition = headers["Content-Disposition"]
            assert "filename*=utf-8''" in disposition and "TikTok Ảnh_01" in urllib.parse.unquote(disposition)
            (OUT / "unicode-photo.jpg").write_bytes(content)
            result["unicode_photo"] = {**photo_meta, "bytes": len(content), "disposition": disposition, "sha256": hashlib.sha256(content).hexdigest()}
        meta, job = api("/api/downloads", request)
        result["events"].append({**meta, "response": job})
        assert meta["status"] == 202, job
        result["job_id"] = job["id"]
        deadline = time.monotonic() + 240
        transient_errors = 0
        while job["status"] in ("queued", "downloading", "processing"):
            assert time.monotonic() < deadline, "Job deadline exceeded"
            time.sleep(poll_interval)
            meta, polled = api("/api/downloads/" + result["job_id"])
            result["events"].append({**meta, "response": polled})
            if meta["status"] != 200:
                result.setdefault("poll_errors", []).append(meta)
                transient_errors += 1
                assert transient_errors <= 3, "Repeated polling errors"
                continue
            job = polled
            assert type(job["eta_seconds"]) is int and job["eta_seconds"] >= 0
        assert job["status"] == "completed", job.get("error")
        meta, body, headers = call("/api/downloads/" + job["id"] + "/file")
        assert meta["status"] == 200
        ext = "zip" if kind == "photos" else "mp3" if kind == "audio" else "mp4"
        target = OUT / (name + "." + ext)
        target.write_bytes(body)
        result["file"] = {"name": target.name, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "http": meta}
        if kind == "photos":
            with zipfile.ZipFile(target) as archive:
                assert archive.testzip() is None and len(archive.namelist()) == len(analysis["photos"])
                result["entries"] = archive.namelist()
                for entry in archive.namelist():
                    with Image.open(io.BytesIO(archive.read(entry))) as image:
                        image.verify()
        else:
            probe = subprocess.run([shutil.which("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(target)], capture_output=True, text=True, timeout=30, check=True)
            result["ffprobe"] = json.loads(probe.stdout)
            streams = result["ffprobe"]["streams"]
            assert any(s["codec_type"] == "audio" for s in streams)
            if kind == "video":
                assert any(s["codec_type"] == "video" for s in streams)
                claimed = analysis["video_options"][0]
                measured = next(s for s in streams if s["codec_type"] == "video")
                if claimed.get("height") and claimed["height"] != measured.get("height"):
                    result["metadata_mismatch"] = {"api_height": claimed["height"], "actual_height": measured.get("height"), "format_id": claimed["format_id"]}
            # Decode the entire file, rather than counting streams alone.
            decoded = subprocess.run([shutil.which("ffmpeg"), "-nostdin", "-v", "error", "-xerror", "-i", str(target), "-map", "0:v?", "-map", "0:a?", "-f", "null", "-"], capture_output=True, text=True, timeout=120)
            result["decode"] = {"returncode": decoded.returncode, "stderr": decoded.stderr[-2000:], "scope": "full file software decode; physical playback not tested"}
            assert decoded.returncode == 0, decoded.stderr[-1000:]
        result["status"] = "Không đạt" if result.get("poll_errors") or result.get("metadata_mismatch") else "Đạt"
    except Exception as error:
        result["exception"] = str(error)
        if result.get("job_id"):
            meta, cancel = api("/api/downloads/" + result["job_id"] + "/cancel", {})
            result["cleanup_cancel"] = {**meta, "response": cancel}
    finally:
        result["finished"] = now()
        save(name, result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("samples", nargs="*", choices=list(SAMPLES))
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for sample in args.samples or list(SAMPLES):
        audit(sample)
