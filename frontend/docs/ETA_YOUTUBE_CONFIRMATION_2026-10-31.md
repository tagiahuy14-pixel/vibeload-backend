# Xác minh ETA SoundCloud và YouTube — 31/10/2026

**Cập nhật sau xác nhận deploy:** bản sửa backend đã được triển khai và SoundCloud đã qua kiểm tra production. Xem [báo cáo triển khai mới nhất](DEPLOYMENT_ETA_2026-10-31.md). Phần dưới ghi lại giai đoạn kiểm thử trước deploy.

**Chưa push/deploy bản sửa mới.** Không thay dịch vụ, gói Render/Vercel hoặc billing. Frontend Vercel hiện tại được giữ nguyên.

## Kết luận từ Runtime Logs người dùng cung cấp

### SoundCloud

Traceback của request `cc1cf628-18b2-4ce4-a89f-d312351ba5a2` xác nhận `GET /api/downloads/{id}` lỗi khi `job.to_response()` tạo `DownloadJobResponse`:

```text
eta_seconds
Input should be a valid integer, got a number with a fractional part
input_value=0.3710743243961664
input_type=float
```

**Đây là trường gây lỗi trong traceback production cụ thể này.** Lượt tái hiện local trước còn tìm thấy `total_bytes_estimate` dạng số thập phân; đó là một lỗi cùng nhóm, không thay thế kết luận ETA từ log Render.

Bản sửa chuẩn hóa ngay trong `DownloadJob.update_progress()`, trước khi dữ liệu đi vào schema API:

- ETA hữu hạn, không âm → số nguyên bằng phép cắt phần thập phân.
- `0.3710743243961664` và ETA dưới một giây → `0`.
- ETA âm, `None`, NaN, ±Infinity, chuỗi rác, chuỗi rỗng, list/dict và boolean → `0`.
- Giữ schema `eta_seconds: int`, phù hợp frontend hiện tại; không đổi thành `None` và không dùng cách chỉ che lỗi HTTP.
- Byte count cũng được chuẩn hóa; snapshot job được khóa đồng bộ; khi hoàn tất dùng kích thước file thật và ETA bằng 0.

### YouTube

Log Render lúc 23:34:45 ngày 30/10 ghi:

```text
ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you’re not a bot.
```

Đã đối chiếu bằng **thời gian và video ID**. Request ID `d67d9875-5292-472f-8a61-b048583eabe2` không xuất hiện nguyên văn trong log người dùng tìm được; không tuyên bố đã đối chiếu trực tiếp chuỗi ID đó trong log.

Kết luận: nguồn yêu cầu xác minh bot đối với request này; thông báo “nội dung riêng tư hoặc yêu cầu đăng nhập” trên ứng dụng hiện tại quá chung. Log này **không chứng minh nguyên nhân gốc là IP trung tâm dữ liệu**, và cũng không chứng minh video riêng tư hay thiếu FFmpeg.

Source mới phân loại trước nhánh đăng nhập, trả HTTP 403:

```json
{
  "success": false,
  "error": {
    "code": "BOT_VERIFICATION_REQUIRED",
    "message": "Nguồn yêu cầu xác minh bot/CAPTCHA. Backend hiện không thể truy cập nội dung này.",
    "retryable": false,
    "requestId": "<ID thực của request>"
  }
}
```

Không dùng cookie cá nhân, không đổi proxy/client để vượt xác minh, không vượt CAPTCHA/DRM. Giữ cấu hình client đang có vì chưa chứng minh thay cấu hình sẽ khôi phục truy cập hợp lệ từ Render. Phiên bản dùng để đối chiếu local là yt-dlp **2026.10.26**; Dockerfile và requirements không đổi. Log mới người dùng gửi chưa có dòng version của container hiện tại, nên chưa xác nhận lại trực tiếp phiên bản runtime production.

## Kiểm thử bản sửa cục bộ

| Kiểm tra | Kết quả |
| --- | --- |
| Đúng ETA `0.3710743243961664` trong log Render | Đạt, chuẩn hóa thành số nguyên 0 |
| ETA <1, âm, None, NaN, infinity, dữ liệu không hợp lệ | Đạt |
| 100 lần GET liên tục trong khi worker cập nhật progress | Đạt, mọi response 200 và ETA nguyên không âm |
| SoundCloud upstream thật qua server Uvicorn local | Đạt, **77 lần poll HTTP 200** |
| File MP3 SoundCloud sau sửa | Đạt, **4.788.179 byte**, giải mã toàn bộ không lỗi |
| Log YouTube đi qua extractor → API | Đạt: 403 `BOT_VERIFICATION_REQUIRED`, không nhầm riêng tư, không retry xác minh |
| Request ID trong log lỗi extractor | Đạt, khớp ID trả về API |
| Bộ test backend | **69 qua** |
| Frontend unit/TypeScript | **96 qua**, TypeScript qua |

Test 100 GET dùng dữ liệu progress fixture trong worker, nhằm kiểm tra regression của API; không được tính là tải media thật. Bằng chứng tải thật là lượt server local SoundCloud và các file production bên dưới.

MP3 local: [soundcloud-fixed-local.mp3](../.qa/eta-confirmation/soundcloud-fixed-local.mp3).
SHA-256: `b434b32043a4d7583341e3f7f3bb62fe71be7e1c03fba1c040de321b14747751`.
[HTTP/ETA và kết quả giải mã](../.qa/eta-confirmation/soundcloud-fixed-local.json), [log server local](../.qa/eta-confirmation/fixed-soundcloud-server.log).

## Kiểm tra lại production hiện có

Các kiểm tra này không deploy code mới và không chứng minh bản sửa ETA đã chạy trên Render.

| Hạng mục | Trạng thái | Bằng chứng |
| --- | --- | --- |
| YouTube | **Không đạt** | Lúc 00:08:50 ngày 31/10, analyze vẫn 403; ID `08066121-c91b-4230-85db-28524997d13d`. Thông báo cũ vẫn hiện vì chưa deploy bản sửa phân loại lỗi. |
| TikTok MP4 | **Đạt** | 2.786.173 byte, H.264/AAC, giải mã toàn bộ không lỗi |
| TikTok MP3 | **Đạt** | 1.292.163 byte, codec MP3, giải mã toàn bộ không lỗi |
| Ảnh Unicode và ZIP TikTok | **Đạt** | Ảnh trả 200 với tên Unicode hợp lệ; ZIP 275.793 byte đủ hai ảnh, đúng thứ tự, CRC/ảnh hợp lệ |
| Bản sửa ETA SoundCloud trên Render | **Chưa kiểm thử** | Chưa được phép triển khai bản sửa mới; triệu chứng 500 trước sửa đã có log production |

[Metadata, request IDs, codec, hashes và file thật](../.qa/eta-confirmation/production/).

## Điện thoại thật — người dùng xác nhận

Thiết bị **Xiaomi 15 Ultra**, trình duyệt **Chrome**, dùng **4G/5G**. Người dùng báo MP4 và MP3 TikTok **Đạt**, “đã ổn”; album ZIP **Chưa thử**. Chưa cung cấp phiên bản Chrome hoặc hash/kích thước file trên máy; không tự bổ sung các thông tin đó.

| Thiết bị/hạng mục | Trạng thái |
| --- | --- |
| Xiaomi 15 Ultra / Chrome: MP4 TikTok | **Đạt — theo kiểm thử thật của người dùng** |
| Xiaomi 15 Ultra / Chrome: MP3 TikTok | **Đạt — theo kiểm thử thật của người dùng** |
| Xiaomi 15 Ultra: album ZIP, ảnh Unicode riêng, PWA/offline | **Chưa kiểm thử** |
| iPhone | **Chưa kiểm thử** |
| YouTube trên Android | **Không đạt**, còn hiện thông báo chung về riêng tư/đăng nhập |

## File code và test liên quan

- [workers/jobs.py](../backend/app/workers/jobs.py): chuẩn hóa ETA/byte/speed/progress tại nguồn, khóa trạng thái và số byte khi hoàn tất; bổ sung xử lý boolean không hợp lệ.
- [test_job_progress.py](../backend/tests/test_job_progress.py): giá trị ETA đúng traceback, các biên dữ liệu và 100 GET trong lúc worker cập nhật.
- [services/extractor_diagnostics.py](../backend/app/services/extractor_diagnostics.py), [extractors/ytdlp_extractor.py](../backend/app/extractors/ytdlp_extractor.py): phân biệt xác minh bot, đăng nhập, riêng tư, DRM và lỗi HTTP; log phiên bản/request ID, che dữ liệu nhạy cảm.
- [errors.py](../backend/app/errors.py), [main.py](../backend/app/main.py): giữ JSON lỗi thống nhất và truyền đúng mã/lý do upstream.
- [services/downloader.py](../backend/app/services/downloader.py): diagnostics và dừng fallback khi nguồn từ chối xác thực/quyền truy cập.
- [test_extractor_diagnostics.py](../backend/tests/test_extractor_diagnostics.py): log YouTube thực đã cung cấp được đưa qua extractor/API, kiểm tra thông báo và tương quan request ID.
- Script local `.qa/verify_fixed_soundcloud.py`: lưu ETA và HTTP status từng lần poll cho lượt tải thật; không được deploy.

Các sửa đổi diagnostics và phần chính chuẩn hóa progress đã được chuẩn bị từ lượt audit trước. Lượt này bổ sung đối chiếu Runtime Logs, xử lý dữ liệu invalid và regression đúng trường hợp production. Không có sửa đổi frontend mới trong lượt này. Chờ người dùng xác nhận trước khi triển khai.
