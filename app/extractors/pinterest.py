import html
import json
import re
import urllib.parse
import urllib.request
from typing import Dict, Any, List
from .base import BaseExtractor
from .ytdlp_extractor import YtDlpExtractor
from ..security import safe_urlopen

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
}


class PinterestExtractor(BaseExtractor):
    def __init__(self):
        self.ytdlp_extractor = YtDlpExtractor()

    def can_handle(self, url: str) -> bool:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
        if host == "pin.it" or host.endswith(".pin.it"):
            return True
        return bool(re.search(r'(?:^|\.)pinterest\.[a-z.]+$', host))

    def analyze(self, raw_url: str) -> Dict[str, Any]:
        url = raw_url.strip()

        # 1. Resolve shortlink redirect if pin.it
        canonical = url
        host = (urllib.parse.urlparse(url).hostname or "").lower()
        if "pin.it" in host:
            try:
                req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
                with safe_urlopen(req, timeout=10) as resp:
                    canonical = resp.geturl()
            except Exception:
                pass

        # 2. If it is a video pin, try yt-dlp first
        try:
            yt_res = self.ytdlp_extractor.analyze(canonical)
            if yt_res and yt_res.get("success") and yt_res.get("video_options"):
                return yt_res
        except Exception:
            pass

        # 3. Handle image / photo pin
        pin_id_m = re.search(r'/pin/(\d+)', canonical)
        pin_id = pin_id_m.group(1) if pin_id_m else "pin"

        page_html = ""
        try:
            req = urllib.request.Request(canonical, headers=DEFAULT_HEADERS)
            with safe_urlopen(req, timeout=10) as resp:
                page_html = resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            # If fetching canonical fails, we will still try oEmbed below
            pass

        # Extract title from HTML
        title = f"Pinterest Pin {pin_id}"
        if page_html:
            title_m = re.search(r'<title>(.*?)</title>', page_html)
            if title_m:
                raw_title = html.unescape(title_m.group(1)).strip()
                clean_title = raw_title.split('|')[0].strip() if '|' in raw_title else raw_title
                if clean_title and clean_title.lower() != "pinterest":
                    title = clean_title

        # Query official Pinterest oEmbed endpoint
        thumb = ""
        author = "Pinterest User"
        oembed_url = f"https://www.pinterest.com/oembed.json?url=https://www.pinterest.com/pin/{pin_id}/"
        try:
            o_req = urllib.request.Request(oembed_url, headers=DEFAULT_HEADERS)
            with safe_urlopen(o_req, timeout=8) as o_resp:
                o_data = json.loads(o_resp.read().decode('utf-8', errors='ignore'))
                thumb = o_data.get('thumbnail_url', '')
                author = o_data.get('author_name', author)
        except Exception:
            pass

        # Extract all pinimg candidates from HTML
        all_imgs = []
        if page_html:
            all_imgs = re.findall(r'https://i\.pinimg\.com/(?:originals|\d+x)/[a-zA-Z0-9/_.-]+\.(?:jpg|jpeg|png|webp)', page_html)

        target_hash = ""
        if thumb:
            hm = re.search(r'https://i\.pinimg\.com/\d+x/([a-zA-Z0-9/_.-]+)\.[a-zA-Z0-9]+', thumb)
            if hm:
                target_hash = hm.group(1)

        chosen_url = ""
        # Match target_hash in originals
        if target_hash and all_imgs:
            for img in all_imgs:
                if target_hash in img and "/originals/" in img:
                    chosen_url = img
                    break
            if not chosen_url:
                for img in all_imgs:
                    if target_hash in img and ("/1200x/" in img or "/736x/" in img):
                        chosen_url = img
                        break

        # Fallback to any originals found on page
        if not chosen_url and all_imgs:
            for img in all_imgs:
                if "/originals/" in img and "button" not in img and "avatar" not in img:
                    chosen_url = img
                    break

        # Fallback to upgrading thumbnail resolution
        if not chosen_url and thumb:
            chosen_url = thumb.replace("/236x/", "/736x/")

        final_img = chosen_url or thumb
        if not final_img:
            return {
                "success": False,
                "error": "Không thể trích xuất hình ảnh hoặc video từ bài đăng Pinterest này.",
                "status_code": 404,
                "retryable": False
            }

        photos = [{
            "id": f"pinterest_{pin_id}",
            "index": 1,
            "url": final_img,
            "thumbnail": thumb or final_img,
            "width": 1080,
            "height": 1080,
        }]

        return {
            "success": True,
            "url": canonical,
            "title": title,
            "thumbnail": thumb or final_img,
            "uploader": author,
            "duration": 0,
            "platform": "pinterest",
            "is_photo_album": True,
            "is_audio_only": False,
            "video_options": [],
            "audio_options": [],
            "photos": photos
        }
