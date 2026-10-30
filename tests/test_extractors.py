import pytest
from app.extractors.registry import clean_and_normalize_url, registry
from app.extractors.tiktok_photos import TikTokPhotoExtractor


def test_clean_and_normalize_url():
    # Facebook tracking
    fb_url = "https://www.facebook.com/watch/?v=123456&fbclid=IwAR123"
    assert "fbclid" not in clean_and_normalize_url(fb_url)

    # YouTube tracking
    yt_url = "https://youtu.be/dQw4w9WgXcQ?si=abcdef123456"
    assert "si=" not in clean_and_normalize_url(yt_url)

    # Threads domain normalization
    threads_url = "https://threads.com/@user/post/123"
    assert "threads.net" in clean_and_normalize_url(threads_url)


def test_tiktok_photo_extractor_can_handle():
    extractor = TikTokPhotoExtractor()
    assert extractor.can_handle("https://www.tiktok.com/@user/photo/7123456789012345678")
    assert extractor.can_handle("https://vt.tiktok.com/ZSjV9xxxx/")
    assert not extractor.can_handle("https://www.youtube.com/watch?v=123")
    assert not extractor.can_handle("https://tiktok.com.evil.example/@user/photo/123")


def test_debug_environment_does_not_break_startup(monkeypatch):
    from app.config import Settings
    monkeypatch.setenv("DEBUG", "WARN")
    assert Settings().DEBUG is False
    monkeypatch.setenv("VIBELOAD_DEBUG", "true")
    assert Settings().DEBUG is True


def test_facebook_sd_hd_do_not_invent_dimensions(monkeypatch):
    from app.extractors.ytdlp_extractor import YtDlpExtractor
    class Engine:
        def __init__(self, options):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def extract_info(self, *args, **kwargs):
            return {"title": "Sample", "extractor": "facebook", "formats": [
                {"format_id": "sd", "ext": "mp4"}, {"format_id": "hd", "ext": "mp4"}]}
    monkeypatch.setattr("app.extractors.ytdlp_extractor.yt_dlp.YoutubeDL", Engine)
    result = YtDlpExtractor().analyze("https://www.facebook.com/watch/?v=fixture")
    assert result["success"]
    assert len(result["video_options"]) == 2
    assert all(option["height"] == option["width"] == 0 for option in result["video_options"])
    assert all("chưa rõ" in option["resolution"] for option in result["video_options"])
    assert all(option["vcodec"] is None for option in result["video_options"])
