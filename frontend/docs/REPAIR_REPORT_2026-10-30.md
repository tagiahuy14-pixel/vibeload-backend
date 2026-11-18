# VibeLoad Web — báo cáo sửa lỗi 30/10/2026

**Cập nhật sau khi người dùng cho phép:** bản sửa đã triển khai lên Render và Vercel. Xem [báo cáo triển khai và kiểm thử production](DEPLOYMENT_2026-10-30_REPAIR.md). Nội dung kiểm thử local bên dưới ghi nhận giai đoạn chuẩn bị source.

## Nguyên nhân đã xác minh

**BUG-01:** `App.tsx` gọi health check với timeout 4 giây. Khi timeout/mất mạng/500, code ném `MediaError("unsupported", ...)` kèm thông báo Vercel-only. Bundle Vercel đang chạy có đúng URL `https://vibeload-backend.onrender.com`; lỗi không phải do thiếu hostname trong bundle được kiểm tra. Chưa có đầy đủ URL `vt.tiktok.com` trong ảnh để kiểm thử chính xác liên kết của người dùng.

**BUG-02 và BUG-03:** Runtime logs người dùng cung cấp chỉ tới `/app/app/main.py`, hàm `download_single_photo`, tại bước tạo `Response`. Header chứa `filename="TikTok Ảnh_01.jpg"` chưa mã hóa; Starlette mã hóa header bằng Latin-1 nên ném `UnicodeEncodeError` cho ký tự `Ả`. Đây là lỗi route tải ảnh, không phải bằng chứng thiếu FFmpeg hay thiếu RAM.

Kiểm tra HTTP production khoảng 23:04–23:08 giờ Việt Nam ngày 30/10: `/api/health` trả 200, có FFmpeg/FFprobe, yt-dlp 2026.10.26; `/` trả 404; `/api/analyze` phân tích video TikTok mẫu thành công. Không tái hiện được lỗi 500 ở route `/`. Logs xác nhận Python 3.12; chưa truy cập được cấu hình thực tế Root Directory/Build Command/Start Command của service.

Một lỗi cấu hình riêng được tái hiện cục bộ: môi trường host có `DEBUG=WARN`, khiến `Settings()` thất bại khi import. Đã đổi biến của ứng dụng thành `VIBELOAD_DEBUG`. Không gán lỗi này cho production.

## Thay đổi source

| File | Thay đổi |
| --- | --- |
| `src/App.tsx` | Xác minh URL trước khi gửi, chờ backend khởi động, tải ảnh qua fetch có kiểm tra phản hồi, báo số ảnh xử lý, giữ định dạng gốc, truyền ảnh đã chọn cho ZIP, nút hủy, thông báo phân biệt tệp sẵn sàng và yêu cầu lưu trình duyệt. |
| `src/lib/api.ts` | Kiểm tra cấu hình HTTPS; hỗ trợ `VITE_API_URL` và alias `VITE_API_BASE_URL`; health retry hữu hạn/backoff và hủy; timeout analyze; đọc JSON lỗi/request ID; thông báo job hết hạn/restart. |
| `src/lib/media.ts` | Chỉ chuyển các nền tảng backend đã tích hợp; giữ luồng direct media và chặn nguồn chưa tích hợp. |
| `backend/app/main.py` | Route `/`; health nhẹ; diagnostics bảo vệ; `FileResponse` cho ảnh Unicode; JSON lỗi; file chưa xong trả 409; giới hạn công việc phân tích/ảnh; dọn file sau gửi. |
| `backend/app/errors.py`, `limits.py` | Mã lỗi, request ID, traceback, CORS cho lỗi; giới hạn công việc đồng thời. |
| `backend/app/config.py` | Thư mục tạm theo hệ điều hành; mặc định 1 download job, 1 analysis và 1 photo proxy đồng thời; giới hạn mỗi ảnh 20 MB; `VIBELOAD_DEBUG`; tùy chọn `SYSTEM_STATUS_TOKEN`. |
| `backend/app/security.py` | URL lỗi trả 400, chặn credentials/ký tự điều khiển, IP không public, allowlist nền tảng, xác minh redirect HTTP. |
| `backend/app/services/photos.py`, `zip_service.py` | Ghi ảnh xuống đĩa theo chunk, kiểm tra MIME và định dạng thực tế bằng Pillow, giới hạn dung lượng, giữ thứ tự ZIP, thất bại rõ ảnh nào và bao nhiêu ảnh đã xong. |
| `backend/app/services/downloader.py`, `ffmpeg_service.py` | Xác minh stream thật; không báo hợp lệ khi thiếu ffprobe; giới hạn download; chuyển MP3 thật cho direct stream; xử lý lỗi tạo thư mục; cleanup do worker thực hiện khi hủy. |
| `backend/app/extractors/registry.py`, `tiktok_photos.py`, `ytdlp_extractor.py` | Redirect link TikTok ngắn; so hostname đúng; không bỏ qua ảnh thiếu URL; phân loại lỗi upstream; dừng khi gặp yêu cầu xác thực/CAPTCHA/DRM được nhận diện. |
| `backend/app/workers/jobs.py`, `storage.py` | Kiểm tra concurrency trong lock; không hoàn tất lại job đã hủy; không dọn job đang chạy; dọn ảnh proxy hết TTL. |
| `backend/requirements.txt` | Thêm Pillow để xác minh ảnh. |
| Các test trong `src/lib`, `tests`, `backend/tests` | Regression Unicode, health, CORS, URL, MIME/ảnh hỏng, ZIP thiếu ảnh, timeout/hủy và hợp đồng frontend/API. |

Không sửa source Android, không push hoặc deploy, không đổi khóa ký/token/billing. Các thay đổi có sẵn ngoài `web/` được giữ nguyên.

## API và cấu hình

- `GET /` → 200 JSON tên service.
- `GET /api/health` → `{"status":"ok","service":"vibeload-backend"}`; không gọi mạng xã hội, FFmpeg hay thống kê đĩa.
- `GET /api/system/status` → 403 mặc định. Nếu chủ dịch vụ tự cấu hình `SYSTEM_STATUS_TOKEN`, gửi header `X-Status-Token` tương ứng để đọc chẩn đoán. Không đưa token này vào frontend.
- Analyze/download/status/cancel/file giữ các đường dẫn hiện tại. Lỗi trả `success:false` và `error:{code,message,retryable,requestId}`.
- Frontend production cần URL HTTPS backend thật trong `VITE_API_URL`. Alias `VITE_API_BASE_URL` được ưu tiên nếu cùng tồn tại. Phải build lại sau khi thay biến.

## Kết quả kiểm thử

- TypeScript và production build/PWA verification: PASS.
- Vitest: 92 test PASS.
- Pytest: 32 test PASS. Có cảnh báo thư viện TestClient/httpx deprecated; không phải lỗi test.
- Test regression `TikTok Ảnh_01.jpg`: 200, `filename*=utf-8''...`, header ASCII hợp lệ; ảnh theo MIME thực tế; file tạm được xóa sau phản hồi.
- API tải ảnh thật trên source đã sửa: 200 `image/jpeg`, 189.999 byte, JPEG 1080×1920, tên Unicode đúng. Dùng FastAPI TestClient với network/extractor thật, không mock upstream.

Các file và JSON/hash của lần tải thật được giữ ở `web/.qa/repair-live/` (không đưa vào Git):

| Mẫu | Kết quả | Byte đầu ra |
| --- | --- | ---: |
| TikTok `@kn10hd/video/7697035038751231240` | MP4 H.264/AAC, ffprobe xác nhận hình và tiếng | 2.786.173 |
| TikTok `@hullcity/photo/7557376330036153622` | Ảnh đơn JPEG hợp lệ; ZIP 1 ảnh hợp lệ | 189.999 / 189.528 |
| TikTok `@hullcity/photo/7553302113757990166` | ZIP 2 ảnh đúng thứ tự, CRC hợp lệ | 276.389 |
| YouTube `jNQXAC9IVRw` | MP4 có hình và tiếng | 629.172 |
| YouTube cùng mẫu → MP3 | ffprobe codec MP3, có audio | 456.547 |
| Facebook `watch/?v=10153231379946729` | MP4 có hình và tiếng | 1.180.614 |
| Instagram `p/DZN3mhZBQ_Q/` | MP4 có hình và tiếng; VP9/AAC | 6.116.781 |
| SoundCloud `nocopyrightsounds/sace-caramel-ncs-release` | MP3 có audio | 4.788.179 |
| `vm.tiktok.com/ZGdhVtER2/` | FAIL: link cũ chuyển về trang chủ TikTok, không còn nội dung bài | — |

URL ảnh mẫu lấy từ [test của gallery-dl](https://github.com/mikf/gallery-dl/blob/master/test/results/tiktok.py). Kết quả tải trên máy này không bảo đảm mọi URL hoặc IP Render đều truy cập được.

## Giới hạn và bước triển khai còn chờ

Tại thời điểm hoàn tất source, bản sửa chưa được deploy; lần triển khai được cho phép sau đó có báo cáo riêng ở trên. Chưa kiểm thử trực tiếp trên điện thoại thật, chưa đo RAM/CPU của bản sửa trên Render, chưa thử Docker image cục bộ vì máy không có Docker. Tabbit CLI báo `CLI_REGISTRATION_UNAVAILABLE`, nên chưa kiểm tra giao diện bằng Tabbit. Các test Playwright giao diện đã cập nhật nhưng chưa chạy trong lượt này; mock API chỉ kiểm tra giao diện, không được tính là bằng chứng tải thật.

Render Free có thể ngủ và xóa filesystem khi restart; job chỉ lưu RAM không được khôi phục. Frontend hiện thông báo phân tích/tải lại khi job không tồn tại. [Tài liệu Render](https://render.com/docs/free).

Sau khi được người dùng cho phép, cập nhật **service Render hiện có**, rồi build/redeploy **project Vercel hiện có**:

1. Đối chiếu cấu hình service: Root Directory `web/backend`, Dockerfile `Dockerfile` nếu đang dùng Docker. Source Dockerfile dùng Python 3.12, cài FFmpeg/FFprobe, chạy `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`. Nếu service dùng Python runtime, đối chiếu build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT` và phải bảo đảm FFmpeg/FFprobe có sẵn; không tự đổi runtime của service.
2. Health path `/api/health`; CORS origins chỉ chứa frontend hợp lệ. Không tạo service mới.
3. Xác nhận `VITE_API_URL=https://vibeload-backend.onrender.com` trên Vercel rồi build lại. Kiểm tra frontend nhận bản PWA mới.
4. Kiểm thử health, analyze, ảnh tên tiếng Việt, ZIP, MP4/MP3, hủy, CORS; đối chiếu runtime logs và tài nguyên.
5. Trên điện thoại thật: dùng link TikTok mới còn hiệu lực; kiểm tra file được lưu/mở, thử lại sau cold start. Không ghi PASS trước khi hoàn tất.

Lệnh kiểm thử từ `web/backend`: `python -m pytest tests -q`; live theo từng mẫu: `python tests/verify_repair.py photo album tiktok youtube mp3 facebook instagram soundcloud`. Cài requirements trong môi trường ảo trước. Từ `web`: `npm.cmd test`, `npm.cmd run build`. Build hiện tại ở `web/dist/`.
