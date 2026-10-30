import re
import urllib.parse
import urllib.request
from typing import Dict, Any
from .tiktok_photos import TikTokPhotoExtractor
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
        cleaned_query = {k: v for k, v in query_dict.items() if k in keep_keys or not k.startswith(('utm_', 'fbclid', 'igsh', 'is_from_webapp', 'sender_device', 'feature', 'si'))}
        new_query_str = urllib.parse.urlencode(cleaned_query, doseq=True)
        url = urllib.parse.urlunparse(parsed._replace(query=new_query_str))
    except Exception:
        pass

    return url


def resolve_redirect_if_needed(url: str) -> str:
    """Follow HTTP redirect for short links like fb.watch or facebook.com/share/."""
    url_lower = url.lower()
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    if host in ("fb.watch", "vt.tiktok.com", "vm.tiktok.com") or (host in ("facebook.com", "www.facebook.com") and "/share/" in url_lower):
        try:
            req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
            with safe_urlopen(req, timeout=6) as resp:
                return validate_platform_url(resp.geturl())
        except Exception:
            pass
    return url


class ExtractorRegistry:
    def __init__(self):
        self.tiktok_photo_extractor = TikTokPhotoExtractor()
        self.ytdlp_extractor = YtDlpExtractor()

    def analyze(self, raw_url: str) -> Dict[str, Any]:
        url = clean_and_normalize_url(raw_url)
        url = resolve_redirect_if_needed(url)

        # 1. Check TikTok Photo album / carousel first
        if self.tiktok_photo_extractor.can_handle(url):
            res = self.tiktok_photo_extractor.analyze(url)
            if res and res.get("status_code") == 403:
                return res
            if res and res.get("success"):
                return res

        # 2. General extractor via yt-dlp (handles video, soundcloud, facebook, instagram, youtube, tiktok video)
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
