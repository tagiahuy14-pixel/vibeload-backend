import os
import sys
import time
from pathlib import Path

# Add backend root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Ensure UTF-8 output on Windows terminal
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from app.extractors.registry import registry
from app.services.downloader import run_download_job
from app.services.ffmpeg_service import verify_media_streams
from app.workers.jobs import job_manager
from app.schemas import DownloadRequest, DownloadType

TEST_SAMPLES = [
    ("TikTok", "https://www.tiktok.com/@kn10hd/video/7697035038751231240", DownloadType.VIDEO),
    ("YouTube Video", "https://www.youtube.com/watch?v=jNQXAC9IVRw", DownloadType.VIDEO),
    ("YouTube Audio", "https://www.youtube.com/watch?v=jNQXAC9IVRw", DownloadType.AUDIO),
    ("Facebook", "https://www.facebook.com/watch/?v=10153231379946729", DownloadType.VIDEO),
    ("Instagram", "https://www.instagram.com/p/DZN3mhZBQ_Q/", DownloadType.VIDEO),
    ("SoundCloud", "https://soundcloud.com/nocopyrightsounds/sace-caramel-ncs-release", DownloadType.AUDIO),
]

def test_platform(name: str, url: str, dtype: DownloadType):
    print(f"\n==========================================")
    print(f"Testing Platform: {name}")
    print(f"URL: {url}")
    print(f"Type: {dtype.value}")
    
    # 1. Analyze
    t0 = time.time()
    try:
        res = registry.analyze(url)
        print(f"Analyze succeeded in {time.time() - t0:.2f}s:")
        print(f"  Title: {res.get('title')}")
        print(f"  Uploader: {res.get('uploader')}")
        print(f"  Duration: {res.get('duration')}s")
        print(f"  Video Options: {len(res.get('video_options', []))}")
        print(f"  Audio Options: {len(res.get('audio_options', []))}")
        print(f"  Photos: {len(res.get('photos', []))}")
    except Exception as e:
        print(f"Analyze FAILED: {e}")
        return False

    if not res.get("success"):
        print(f"Analyze returned success=False: {res.get('error')}")
        return False

    # 2. Download a sample
    job = job_manager.create_job("127.0.0.1", url)
    fmt_id = None
    if dtype == DownloadType.VIDEO and res.get("video_options"):
        fmt_id = res["video_options"][0]["format_id"]

    req = DownloadRequest(
        url=url,
        download_type=dtype,
        format_id=fmt_id,
        audio_bitrate=192
    )

    t1 = time.time()
    try:
        run_download_job(job, req)
        print(f"Download finished in {time.time() - t1:.2f}s:")
        print(f"  Status: {job.status.value}")
        if job.error:
            print(f"  Error: {job.error}")
        if job.file_path and job.file_path.exists():
            size = job.file_path.stat().st_size
            print(f"  Saved file: {job.file_path.name} ({size:,} bytes)")
            
            # Verify with ffprobe
            v_res = verify_media_streams(str(job.file_path))
            print(f"  FFprobe verification:")
            print(f"    has_video: {v_res.get('has_video')}")
            print(f"    has_audio: {v_res.get('has_audio')}")
            print(f"    vcodec: {v_res.get('vcodec')}")
            print(f"    acodec: {v_res.get('acodec')}")
            print(f"    duration: {v_res.get('duration')}s")
            return True
        else:
            print("  No file output path produced")
            return False
    except Exception as e:
        print(f"Download FAILED with exception: {e}")
        return False

if __name__ == "__main__":
    results = {}
    for name, url, dtype in TEST_SAMPLES:
        results[name] = test_platform(name, url, dtype)
    print("\n\n==========================================")
    print("SUMMARY RESULTS FOR 5 SUPPORTED PLATFORMS:")
    print("==========================================")
    for k, v in results.items():
        print(f"  {k:15}: {'PASSED (VERIFIED)' if v else 'FAILED'}")
