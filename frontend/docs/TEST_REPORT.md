# Báo cáo kiểm thử VibeLoad Web

Ngày kiểm tra: **30/10/2026** (Asia/Saigon). Phạm vi: source trong `web/`, bản build production local và Chromium headless độc lập. **Chưa deploy Vercel, chưa push GitHub.** Không dùng kết quả local để xác nhận URL public hoặc điện thoại thật.

## Kết quả

Kết quả cuối trên đúng source đã bàn giao: **85/85 unit tests, 30/30 E2E**, không skip, không flaky, không lỗi còn mở trong các case đã chạy. Bốn trạng thái dùng để nghiệm thu là **Hoạt động**, **Không hoạt động** (đã thử nhưng lỗi), **Chưa kiểm thử**, **Bị giới hạn bởi nền tảng**. Không gán “Hoạt động” cho một tính năng chỉ mới có giao diện.

| Hạng mục | Trạng thái | Bằng chứng và giới hạn |
|---|---|---|
| Build frontend production | **Hoạt động** | `npm.cmd run build`; TypeScript + Vite + kiểm tra HTML precache/icon/SW. Build đặt `NODE_ENV=production` rõ ràng. |
| TypeScript | **Hoạt động** | `npm.cmd run check`, strict/noUnusedLocals/noUnusedParameters. |
| Unit tests | **Hoạt động** | **85/85** qua `npm.cmd test`: URL, chữ ký/MIME/cấu trúc tệp, stream, cap, timeout, hủy, tên tệp, storage và semantics lưu. |
| Desktop | **Hoạt động** | Chromium 1440×1000, bốn màn hình, refresh deep links, sáng/tối/theo hệ thống, dialog bàn phím. Đã xem ảnh chụp. |
| Mobile responsive | **Hoạt động** | Chromium mô phỏng Pixel 7, viewport 393×727; kiểm tra thêm 320×640, không tràn ngang. Không thay cho điện thoại thật. |
| Manifest + service worker + offline | **Hoạt động** | Icon PNG 192/512/maskable, SW được đăng ký/control, cache có `index.html`; mở Trang chủ/Thư viện/Cài đặt khi offline. Cache chỉ chứa app shell cùng origin. |
| Cài PWA lên hệ điều hành thật | **Chưa kiểm thử** | Có hướng dẫn Android/iOS/desktop và nút install khi browser cung cấp. Chưa bấm cài trên thiết bị vật lý. |
| URL ảnh trực tiếp | **Hoạt động** | PNG 64×48 tạo cho test, CORS HTTPS thật; lưu xuống disk và so SHA-256, mở ảnh kiểm tra kích thước. PNG gzip có encoding bị CORS ẩn cũng tải đúng, tổng không xác định. |
| URL video trực tiếp | **Hoạt động** | WebM VP8 do Chromium MediaRecorder tạo và MP4 CC0 của MDN; lưu xuống disk, đối chiếu SHA-256, `play()` và metadata thành công. |
| URL audio trực tiếp | **Hoạt động** | PCM WAV tạo cho test và MP3 CC0 của MDN; lưu xuống disk, đối chiếu SHA-256, phát audio thành công. |
| M4A, Opus/Ogg, FLAC; JPG/WebP/GIF/AVIF/BMP/TIFF/ICO từ Internet | **Chưa kiểm thử** | Có bộ nhận diện trong source nhưng không coi unit test nhận diện là chứng cứ tải/phát thật từng định dạng. |
| CORS không cho phép đọc | **Hoạt động** | HTTPS fixture không trả ACAO thực sự bị browser chặn; hiển thị lỗi, không có nút lưu và không tạo download. Không dùng `no-cors`. |
| URL không hợp lệ / HTTP / nội bộ / có tài khoản | **Hoạt động** | Từ chối trước request media; social page cũng không gửi request trích xuất. |
| HTML giả ảnh / nguồn đổi nội dung | **Hoạt động** | Từ chối khi inspect hoặc download; không tạo file hoàn thành. |
| Lưu bằng download fallback | **Hoạt động** | Sự kiện download thật, `saveAs()` xuống disk, kiểm tra không lỗi và bytes/hash khớp độc lập với nguồn. Chỉ xác nhận môi trường Chromium test này. |
| Hộp thoại File System Access gốc / lưu trên iPhone | **Chưa kiểm thử** | Unit test kiểm tra chỉ trả `written` sau khi stream đóng; không thay cho bấm hộp thoại hệ điều hành thật. Fallback chỉ báo `requested`. |
| Giới hạn bộ nhớ | **Hoạt động** | Cap 25 MiB và file picker vượt cap bị từ chối; cap cũng được kiểm tra trong từng chunk ở unit test. Không phải benchmark tải 100 MiB trên điện thoại. |
| Tiến trình / hủy | **Hoạt động** | Stream có tổng xác định hiển thị bytes/% thực; chunked/encoding bị ẩn không có %. Hủy dừng tác vụ và không có file hoàn thành. |
| Thư viện / thiết lập / riêng tư | **Hoạt động** | Theme giữ sau refresh; chỉ metadata lịch sử tồn tại; Blob không còn sau refresh; chọn lại tệp local mở được; không lưu URL nguồn trong localStorage. |
| CSP theo cấu hình Vercel | **Hoạt động** | Tái tạo các HTTP header `vercel.json` trong browser local; source MP3 MDN và File Picker PNG thật để kiểm tra app/HTTPS fetch/Blob preview. Không thay cho kiểm tra headers trên deployment. |
| Hiệu năng mô phỏng mobile | **Hoạt động** | CPU chậm 4×, latency 80 ms, download 200.000 B/s; ghi 3 lần đến khi heading hiện. Không phải điểm Lighthouse hay TTI. |
| Hiệu năng điện thoại thật | **Chưa kiểm thử** | Chưa có thiết bị Android/iPhone vật lý, chưa đo bộ nhớ hoặc pin khi tải tệp lớn. |
| YouTube/TikTok/album TikTok | **Bị giới hạn bởi nền tảng** | Đúng thông báo chưa hỗ trợ tải trực tiếp và liên kết mở nguồn. Không scraper/API giả. Xem chi tiết xác minh tại [TIKTOK_FEASIBILITY.md](TIKTOK_FEASIBILITY.md). |
| Nguồn không cho CORS / cần login / DRM | **Bị giới hạn bởi nền tảng** | Không bypass. Không dùng proxy qua Vercel. |
| Tải nền sau đóng tab / chuyển mã FFmpeg | **Bị giới hạn bởi nền tảng** | Không triển khai; không có worker server hoặc nút giả. |
| HTTPS public, truy cập mạng khác, không login trên Vercel | **Chưa kiểm thử** | Chưa deploy theo chỉ thị của chủ project. Cần nghiệm thu trên production domain sau khi được phép. |
| Chức năng thực tế sau deploy | **Chưa kiểm thử** | Cần lặp lại kiểm tra file thực, CORS, refresh, PWA và lưu trên thiết bị từ URL production. |

## Mẫu media đã lưu thật

Các sample dưới đây không được bundle vào website hay cache PWA.

| Tệp | Nguồn | Bytes | SHA-256 sau lưu |
|---|---|---:|---|
| `image.png` | Fixture PNG tự tạo, HTTPS/CORS local | 226 | `9055d07750353c5692f700e2faae27b4700db8875c3cca858891e45f0bde52f9` |
| `tone.wav` | Fixture sóng sin 440 Hz, PCM 16 kHz mono, 1 giây | 32.044 | `78112ce72576feab43cdb556c28d1df4fd1e32fc23936cf5d4d896a0d5b03b63` |
| `clip.webm` | Video VP8 canvas do Chromium tạo khi test | Khoảng 804, tùy lượt encode | Hash so với fixture tương ứng trong cùng lượt; bytes encode có thể khác giữa hai project. |
| `t-rex-roar.mp3` | [MDN CC0 audio](https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3) | 39.868 | `41191d0727073bf848bcc8f0bd851d71a0b0058e901abb1c1b236ad327bda52e` |
| `flower.mp4` | [MDN CC0 video](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4) | 1.128.375 | `0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451` |

Mỗi mẫu chạy trên project desktop và mobile giả lập. Với MDN, browser tải thẳng từ Internet; phép fetch độc lập lấy bytes để đối chiếu. Test public dùng TLS validation bình thường. Địa chỉ/thời hạn/quyền CORS của nguồn ngoài có thể thay đổi sau ngày kiểm tra; kết quả không đại diện cho mọi URL trên cùng host.

## Hiệu năng

Bản production đã đo có tổng JavaScript khoảng **89 KB gzip**, CSS khoảng **8 KB gzip**, không có FFmpeg WASM hoặc font mạng. Mẫu heading-visible trong lượt full cuối:

| Môi trường | Lần đầu | Lần 2 | Lần 3 |
|---|---:|---:|---:|
| Desktop, CPU 1× | 266 ms | 127 ms | 139 ms |
| Mobile mô phỏng, CPU 4× + mạng nêu trên | 2.179 ms | 578 ms | 605 ms |

Đây là thời gian từ điều hướng tới assertion heading hiện, bao gồm chi phí test runner; các lượt sau có cache/SW. Cold resource transfer là 142.242 bytes trong phép đo này (không phải tổng dung lượng toàn precache). Không phải benchmark khoa học, không suy ra hiệu năng Android/iOS vật lý. File đo được tạo tại `.qa/performance-*.json`.

## Chạy lại

```powershell
cd D:\VibeLoad\web
npm.cmd ci --include=dev
npm.cmd run check
npm.cmd test
npm.cmd run build
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.cache/ms-playwright"
npx.cmd playwright install chromium
$env:VIBELOAD_LIVE_MEDIA = "1"
npm.cmd run test:e2e
```

Đã chạy lại cài đặt từ lockfile: `npm.cmd ci --include=dev --offline` thành công (cache npm đã có), audit không báo lỗ hổng tại thời điểm kiểm tra; `check`, 85 unit tests và build đều thành công. Build cuối xác minh JavaScript **89.194 bytes gzip**, HTML offline, ba icon manifest đúng kích thước và mã đăng ký SW được giữ trong production.

Lượt E2E cuối với `VIBELOAD_LIVE_MEDIA=1`: **30 passed**, exit 0, 78 giây. Có regression chuyển audio đang phát → ảnh File Picker, không dùng lại Blob URL cũ. Báo cáo đầy đủ `.qa/last-full30-results.json`; phần hashes/số đo `.qa/last-full30-evidence.json`. Test server 4173/8443 đã dừng sau khi hoàn tất.

Nếu không bật `VIBELOAD_LIVE_MEDIA`, bốn case MDN và hai case CSP có Internet được đánh dấu skip; 24 case local không phụ thuộc các website mẫu này. Xem yêu cầu OpenSSL và chứng thư test-only trong [README](../README.md). Source production không tắt CORS/TLS; quyền bỏ qua cert tự ký chỉ dùng cho local fixtures trong test.

Ảnh giao diện ở `.qa/screenshots/`; báo cáo JSON, hashes và tệp lưu ở `.qa/`/`test-results/`. Các thư mục kết quả/cert/browser tạm được `.gitignore` và `.vercelignore` bỏ qua, không đưa vào sản phẩm deploy.

## Android và Git

So sánh SHA-256 của **103 tệp đã được Git theo dõi** với snapshot đầu phiên: không tệp nào thay đổi. `version.json` vốn đã có chỉnh sửa của người dùng từ trước; nội dung đó được giữ nguyên. Chỉ có thư mục `web/` là phần thêm mới. Không commit, push, đăng ký Site hay deploy.

## Nghiệm thu public còn lại

Sau khi chủ project cho phép deploy, thực hiện checklist trong [VERCEL.md](VERCEL.md#kiểm-tra-sau-deploy). Chỉ đổi trạng thái các mục public/thiết bị thật sau khi có bằng chứng. Local build thành công không chứng minh `vibeload.vercel.app` đã tồn tại hoặc tên đó còn trống.

---

## Nghiệm thu Media Đa nền tảng (Backend FastAPI + yt-dlp + FFmpeg)

Ngày kiểm nghiệm: **30/10/2026**.
Backend độc lập: `web/backend` (Python FastAPI, yt-dlp 2026.10.21, FFmpeg/FFprobe 9.0.1, TikWM fallback).
Kiểm thử trực tiếp qua `web/backend/tests/verify_platforms.py` và `pytest web/backend/tests`: **11/11 unit tests passed**, toàn bộ 5 nền tảng đều **tải được tệp thực tế và xác minh qua FFprobe**.

| Nền tảng | URL kiểm nghiệm | Loại tải | Trạng thái | Tệp đã lưu | Dung lượng | Xác minh FFprobe |
|---|---|---|:---:|---|---:|---|
| **TikTok** | `https://www.tiktok.com/@kn10hd/video/7697035038751231240` | Video (không logo) | **PASSED (VERIFIED)** | `Neymar vs Roma 💫 ...mp4` | 2.786.173 B (2,66 MiB) | `has_video=True, has_audio=True, vcodec=h264, acodec=aac, duration=53.8s` |
| **YouTube Video** | `https://www.youtube.com/watch?v=jNQXAC9IVRw` | MP4 (Video + Audio) | **PASSED (VERIFIED)** | `Me at the zoo.mp4` | 629.172 B (614 KiB) | `has_video=True, has_audio=True, vcodec=h264, acodec=aac, duration=18.9s` |
| **YouTube Audio** | `https://www.youtube.com/watch?v=jNQXAC9IVRw` | Audio (MP3 192k) | **PASSED (VERIFIED)** | `Me at the zoo.mp3` | 456.547 B (446 KiB) | `has_video=False, has_audio=True, vcodec=None, acodec=mp3, duration=18.9s` |
| **Facebook** | `https://www.facebook.com/watch/?v=10153231379946729` | Video MP4 | **PASSED (VERIFIED)** | `How to Share With Just Friends.mp4` | 1.180.614 B (1,13 MiB) | `has_video=True, has_audio=True, vcodec=h264, acodec=aac, duration=74.3s` |
| **Instagram** | `https://www.instagram.com/p/DZN3mhZBQ_Q/` | Video MP4 | **PASSED (VERIFIED)** | `Video by nasawebb.mp4` | 6.116.781 B (5,83 MiB) | `has_video=True, has_audio=True, vcodec=vp9, acodec=aac, duration=228.0s` |
| **SoundCloud** | `https://soundcloud.com/nocopyrightsounds/sace-caramel-ncs-release` | Audio MP3 | **PASSED (VERIFIED)** | `Sace - caramel [NCS Release].mp3` | 4.788.179 B (4,56 MiB) | `has_video=False, has_audio=True, vcodec=None, acodec=mp3, duration=199.4s` |

