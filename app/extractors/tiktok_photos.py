import http.cookiejar
import json
import re
import urllib.parse
import urllib.request
from typing import Dict, Any, Optional, List
from .base import BaseExtractor
from ..security import SafeRedirectHandler

DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
    'Sec-Fetch-Mode': 'navigate',
}


class TikTokPhotoExtractor(BaseExtractor):
    def can_handle(self, url: str) -> bool:
        parsed = urllib.parse.urlparse(url)
        lower = parsed.path.lower()
        host = (parsed.hostname or "").lower().rstrip(".")
        is_tiktok = any(host == p or host.endswith("." + p) for p in ("tiktok.com", "douyin.com"))
        if not is_tiktok:
            return False
        return "/photo/" in lower or host in ("vt.tiktok.com", "vm.tiktok.com")

    def analyze(self, url: str) -> Optional[Dict[str, Any]]:
        # 1. Try direct HTML extraction first
        res = self._extract_direct(url)
        if res:
            return res

        # 2. Try TikWM fallback
        return self._extract_tikwm(url)

    def _extract_direct(self, url: str) -> Optional[Dict[str, Any]]:
        try:
            cj = http.cookiejar.CookieJar()
            opener = urllib.request.build_opener(SafeRedirectHandler(), urllib.request.HTTPCookieProcessor(cj))
            req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
            with opener.open(req, timeout=12) as resp:
                final_url = resp.geturl()
                html = resp.read(4 * 1024 * 1024).decode('utf-8', errors='ignore')

            if 'id="captcha' in html.lower() or '<title>captcha' in html.lower():
                return {"success": False, "status_code": 403, "error": "Nguồn yêu cầu xác minh CAPTCHA; không thể tải nội dung này."}

            item = {}
            # Check for __UNIVERSAL_DATA_FOR_REHYDRATION__
            m = re.search(r'<script\s+id=[\"\']__UNIVERSAL_DATA_FOR_REHYDRATION__[\"\'][^>]*>(.*?)</script>', html, re.DOTALL)
            if m:
                try:
                    data = json.loads(m.group(1))
                    scope = data.get('__DEFAULT_SCOPE__', {})
                    for k, v in scope.items():
                        if isinstance(v, dict):
                            cand = v.get('itemInfo', {}).get('itemStruct') or v.get('itemStruct') or v.get('photoInfo') or v
                            if isinstance(cand, dict) and ('imagePost' in cand or 'images' in cand):
                                item = cand
                                break
                    if not item:
                        item = scope.get('webapp.video-detail', {}).get('itemInfo', {}).get('itemStruct', {})
                except Exception:
                    pass

            if not item:
                m2 = re.search(r'<script\s+id=[\"\']SIGI_STATE[\"\'][^>]*>(.*?)</script>', html, re.DOTALL)
                if m2:
                    try:
                        data = json.loads(m2.group(1))
                        item_module = data.get('ItemModule', {})
                        if item_module:
                            item = next(iter(item_module.values()))
                    except Exception:
                        pass

            image_post = item.get('imagePost', {}) if isinstance(item, dict) else {}
            images = image_post.get('images', []) or (item.get('images', []) if isinstance(item, dict) else [])

            if not images:
                return None

            desc = item.get('desc') or 'TikTok Ảnh'
            author = item.get('author', {}).get('nickname') or item.get('author', {}).get('uniqueId') or 'TikTok'

            photos: List[Dict[str, Any]] = []
            for idx, img in enumerate(images):
                if isinstance(img, str):
                    img_url = img
                else:
                    url_list = img.get('imageURL', {}).get('urlList', []) or img.get('urlList', [])
                    if not url_list:
                        return None  # Never return a silently truncated album.
                    img_url = url_list[0]

                photos.append({
                    "id": f"photo_{idx + 1}",
                    "index": idx + 1,
                    "url": img_url,
                    "thumbnail": img_url,
                    "width": None,
                    "height": None,
                })

            audio_options = []
            music = item.get('music', {}) if isinstance(item, dict) else {}
            play_url = music.get('playUrl')
            if play_url:
                audio_options.append({
                    "format_id": play_url,
                    "ext": "mp3",
                    "abr": 128,
                    "filesize": 0,
                    "acodec": "mp3"
                })

            return {
                "success": True,
                "url": final_url,
                "title": desc,
                "thumbnail": photos[0]["url"] if photos else "",
                "uploader": author,
                "duration": 0,
                "platform": "tiktok",
                "is_photo_album": True,
                "is_audio_only": False,
                "video_options": [],
                "audio_options": audio_options,
                "photos": photos,
                "error": None
            }
        except Exception:
            return None

    def _extract_tikwm(self, url: str) -> Optional[Dict[str, Any]]:
        endpoints = ["https://www.tikwm.com/api/", "https://tikwm.com/api/"]
        mobile_ua = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        for ep in endpoints:
            try:
                data = urllib.parse.urlencode({"url": url, "hd": 1}).encode("utf-8")
                req = urllib.request.Request(
                    ep,
                    data=data,
                    headers={
                        "User-Agent": mobile_ua,
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "Accept": "application/json"
                    }
                )
                with urllib.request.urlopen(req, timeout=12) as resp:
                    res = json.loads(resp.read().decode("utf-8"))
                    if res.get("code") == 0 and "data" in res:
                        d = res["data"]
                        images = d.get("images", [])
                        music_url = d.get("music")
                        audio_options = []
                        if music_url:
                            audio_options.append({
                                "format_id": music_url,
                                "ext": "mp3",
                                "abr": 128,
                                "filesize": 0,
                                "acodec": "mp3"
                            })

                        if not images:
                            video_options = []
                            hd_url = d.get("hdplay")
                            sd_url = d.get("play")
                            if hd_url:
                                video_options.append({
                                    "format_id": hd_url,
                                    "resolution": "HD 1080p (Không logo)",
                                    "height": 1080,
                                    "width": 1920,
                                    "ext": "mp4",
                                    "filesize": d.get("hd_size") or d.get("size") or 0,
                                    "vcodec": "h264",
                                    "acodec": "aac",
                                    "needs_merge": False
                                })
                            if sd_url and sd_url != hd_url:
                                video_options.append({
                                    "format_id": sd_url,
                                    "resolution": "SD 720p (Không logo)",
                                    "height": 720,
                                    "width": 1280,
                                    "ext": "mp4",
                                    "filesize": d.get("size") or 0,
                                    "vcodec": "h264",
                                    "acodec": "aac",
                                    "needs_merge": False
                                })

                            if not video_options and not audio_options:
                                return None

                            is_audio = len(video_options) == 0 and len(audio_options) > 0
                            return {
                                "success": True,
                                "url": url,
                                "title": d.get("title") or "TikTok Video",
                                "thumbnail": d.get("cover") or "",
                                "uploader": d.get("author", {}).get("nickname") or d.get("author", {}).get("unique_id") or "TikTok",
                                "duration": d.get("duration") or 0,
                                "platform": "tiktok",
                                "is_photo_album": False,
                                "is_audio_only": is_audio,
                                "video_options": video_options if not is_audio else [],
                                "audio_options": audio_options,
                                "photos": [],
                                "error": None
                            }

                        photos = []
                        for idx, img_url in enumerate(images):
                            photos.append({
                                "id": f"photo_{idx + 1}",
                                "index": idx + 1,
                                "url": img_url,
                                "thumbnail": img_url,
                                "width": None,
                                "height": None
                            })

                        return {
                            "success": True,
                            "url": url,
                            "title": d.get("title") or "TikTok Ảnh",
                            "thumbnail": photos[0]["url"] if photos else (d.get("cover") or ""),
                            "uploader": d.get("author", {}).get("nickname") or "TikTok",
                            "duration": 0,
                            "platform": "tiktok",
                            "is_photo_album": True,
                            "is_audio_only": False,
                            "video_options": [],
                            "audio_options": audio_options,
                            "photos": photos,
                            "error": None
                        }
            except Exception:
                pass
        return None
