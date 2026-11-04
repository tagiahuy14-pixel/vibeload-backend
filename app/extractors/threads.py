import re
import html
import urllib.parse
import urllib.request
from typing import Dict, Any, List
from .base import BaseExtractor
from ..security import safe_urlopen

CRAWLER_HEADERS = {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
}


class ThreadsExtractor(BaseExtractor):
    def can_handle(self, url: str) -> bool:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
        return "threads.net" in host or "threads.com" in host

    def analyze(self, raw_url: str) -> Dict[str, Any]:
        url = raw_url.strip()
        req = urllib.request.Request(url, headers=CRAWLER_HEADERS)
        try:
            with safe_urlopen(req, timeout=10) as resp:
                page_html = resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            return {
                "success": False,
                "error": f"Không thể kết nối tới Threads: {str(e)}",
                "status_code": 502,
                "retryable": True
            }

        def get_meta(prop: str) -> str:
            m = re.search(r'<meta[^>]+(?:property|name)=["\']' + re.escape(prop) + r'["\'][^>]+content=["\']([^"\']*)["\']', page_html, re.IGNORECASE)
            return html.unescape(m.group(1)).strip() if m else ""

        og_title = get_meta('og:title') or get_meta('twitter:title') or "Threads Post"
        og_desc = get_meta('og:description') or get_meta('description') or ""
        og_image = get_meta('og:image') or get_meta('twitter:image')
        og_video = get_meta('og:video') or get_meta('og:video:secure_url')

        # Fallback for video in scripts/html if not in meta tags
        if not og_video:
            mp4_matches = re.findall(r'https?:[\\/]+[^\s"\'<>]+\.mp4[^\s"\'<>]*', page_html)
            for m in mp4_matches:
                clean_m = m.replace(r'\/', '/').replace(r'\u0026', '&')
                if 'static.cdninstagram.com' not in clean_m:
                    og_video = clean_m
                    break

        # Extract author
        author_match = re.search(r'\(@([^)]+)\)', og_title)
        if not author_match:
            author_match = re.search(r'/@([^/?#]+)', url)
        uploader = author_match.group(1) if author_match else "threads_user"

        title = og_desc if og_desc else og_title

        # Check for photos
        photo_urls: List[str] = []
        if og_image and 'static.cdninstagram.com' not in og_image:
            photo_urls.append(og_image)

        # If video is found
        if og_video:
            video_options = [{
                "format_id": og_video,
                "resolution": "HD",
                "height": 720,
                "width": 1280,
                "ext": "mp4",
                "filesize": 0,
                "vcodec": "h264",
                "acodec": "aac",
                "needs_merge": False,
            }]
            audio_options = [{
                "format_id": og_video,
                "ext": "mp3",
                "abr": 192,
                "filesize": 0,
            }]
            return {
                "success": True,
                "url": url,
                "title": title,
                "thumbnail": og_image or "",
                "uploader": uploader,
                "duration": 0,
                "platform": "threads",
                "is_photo_album": False,
                "is_audio_only": False,
                "video_options": video_options,
                "audio_options": audio_options,
                "photos": []
            }

        # If photos found
        if photo_urls:
            photos = []
            for i, p_url in enumerate(photo_urls, 1):
                photos.append({
                    "id": f"threads_photo_{i}",
                    "index": i,
                    "url": p_url,
                    "thumbnail": p_url,
                    "width": 1080,
                    "height": 1080,
                })
            return {
                "success": True,
                "url": url,
                "title": title,
                "thumbnail": photo_urls[0],
                "uploader": uploader,
                "duration": 0,
                "platform": "threads",
                "is_photo_album": True,
                "is_audio_only": False,
                "video_options": [],
                "audio_options": [],
                "photos": photos
            }

        return {
            "success": False,
            "error": "Không tìm thấy nội dung ảnh hoặc video công khai từ bài đăng Threads này.",
            "status_code": 404,
            "retryable": False
        }
