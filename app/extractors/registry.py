import re
import urllib.parse
import urllib.request
from typing import Dict, Any
from .tiktok_photos import TikTokPhotoExtractor
from .threads import ThreadsExtractor
from .pinterest import PinterestExtractor
from .ytdlp_extractor import YtDlpExtractor
from ..security import safe_urlopen, validate_platform_url

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
}


def clean_and_normalize_url(raw_url: str) -> str:
    """Strip unnecessary tracking queries and normalize platform URLs."""
    if not raw_url:
        return ""
    url = raw_url.strip().strip('"\'')

    # Threads domain normalization
    if "threads.com/" in url.lower():
        url = re.sub(r'(https?://(?:www\.)?)threads\.com', r'\1threads.net', url, flags=re.IGNORECASE)

    # Clean tracking query params
    try:
        parsed = urllib.parse.urlparse(url)
        # Keep query parameters that represent video IDs or photo IDs (like v= in youtube)
        keep_keys = {'v', 'list', 'index', 'p', 't'}
        query_dict = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
        cleaned_query = {k: v for k, v in query_dict.items() if k in keep_keys or not k.startswith(('utm_', 'fbclid', 'igsh', 'is_from_webapp', 'sender_device', 'feature', 'si', 'xmt', 'slof'))}
        new_query_str = urllib.parse.urlencode(cleaned_query, doseq=True)
        url = urllib.parse.urlunparse(parsed._replace(query=new_query_str))
    except Exception:
        pass

    return url


def resolve_redirect_if_needed(url: str) -> str:
    """Follow HTTP redirect for short links like fb.watch, on.soundcloud.com, vt.tiktok.com, or social shares."""
    url_lower = url.lower()
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    short_hosts = (
        "fb.watch",
        "vt.tiktok.com",
        "vm.tiktok.com",
        "on.soundcloud.com",
        "soundcloud.app.goo.gl",
        "youtu.be",
        "pin.it",
        "v.redd.it",
        "t.co",
    )
    is_share_path = (
        (host in ("facebook.com", "www.facebook.com") and any(p in url_lower for p in ("/share/", "/reel/", "/watch/"))) or
        (host in ("instagram.com", "www.instagram.com") and "/share/" in url_lower)
    )
    if host in short_hosts or is_share_path:
        try:
            req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
            with safe_urlopen(req, timeout=8) as resp:
                resolved = resp.geturl()
                return validate_platform_url(resolved)
        except Exception:
            pass
    return url


class ExtractorRegistry:
    def __init__(self):
        self.tiktok_photo_extractor = TikTokPhotoExtractor()
        self.threads_extractor = ThreadsExtractor()
        self.pinterest_extractor = PinterestExtractor()
        self.ytdlp_extractor = YtDlpExtractor()

    def analyze(self, raw_url: str) -> Dict[str, Any]:
        url = clean_and_normalize_url(raw_url)
        url = resolve_redirect_if_needed(url)
        url = clean_and_normalize_url(url)

        # 1. Check TikTok Photo album / carousel first
        if self.tiktok_photo_extractor.can_handle(url):
            res = self.tiktok_photo_extractor.analyze(url)
            if res and res.get("status_code") == 403:
                return res
            if res and res.get("success"):
                return res

        # 2. Check Threads (photos & videos)
        if self.threads_extractor.can_handle(url):
            res = self.threads_extractor.analyze(url)
            if res and res.get("success"):
                return res
            if res and res.get("status_code") in (403, 404):
                return res

        # 3. Check Pinterest (photos & videos)
        if self.pinterest_extractor.can_handle(url):
            res = self.pinterest_extractor.analyze(url)
            if res and res.get("success"):
                return res
            if res and res.get("status_code") in (403, 404):
                return res

        # 4. Check for incomplete / truncated YouTube link
        yt_match = re.search(r'(?:youtu\.be/|youtube\.com/(?:watch\?.*v=|shorts/|embed/))([a-zA-Z0-9_-]+)', url)
        if yt_match:
            vid = yt_match.group(1)
            if len(vid) < 11:
                return {
                    "success": False,
                    "error": "Đường dẫn YouTube chưa đầy đủ (mã video thường gồm 11 ký tự). Vui lòng sao chép lại toàn bộ liên kết từ YouTube.",
                    "error_code": "INCOMPLETE_URL",
                    "status_code": 400,
                    "retryable": False
                }

        # 5. General extractor via yt-dlp (handles video, soundcloud, facebook, instagram, youtube, tiktok video)
        res = self.ytdlp_extractor.analyze(url)
        if res.get("success"):
            return res
        if res.get("status_code") in (403, 404):
            return res

        # 3. Fallback for TikTok if yt-dlp encountered captcha or bot block
        if "tiktok.com" in url.lower() or "douyin.com" in url.lower():
            fb_res = self.tiktok_photo_extractor._extract_tikwm(url)
            if fb_res and fb_res.get("success"):
                return fb_res

        return res


registry = ExtractorRegistry()
