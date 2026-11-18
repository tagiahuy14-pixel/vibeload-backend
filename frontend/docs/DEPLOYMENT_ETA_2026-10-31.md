# Triển khai bản sửa ETA và lỗi upstream — 31/10/2026

Người dùng đã xác nhận deploy. Hoàn tất kiểm tra production khoảng **00:34–00:37 giờ Việt Nam**.

## Bản đã triển khai

- Service Render hiện có: https://vibeload-backend.onrender.com
- Repo `tagiahuy14-pixel/vibeload-backend`, branch `main`.
- Commit mới: [4f55c5a866523290aebffe1135592b90857592fc](https://github.com/tagiahuy14-pixel/vibeload-backend/commit/4f55c5a866523290aebffe1135592b90857592fc).
- Commit trước: `547533e46eefce31d590093e6e2d96d1015a6e54`.
- Cập nhật ref không force, chỉ 13 file backend/test đã đối chiếu. Render tự triển khai sau cập nhật repo.
- Xác nhận code mới qua metadata Facebook không còn gán SD=480p/HD=720p, mã lỗi YouTube mới và polling SoundCloud hoạt động đúng.
- Không đổi Dockerfile, requirements, biến môi trường, gói dịch vụ hoặc billing.
- **Không deploy frontend mới.** `https://vibeload-web.vercel.app` vẫn trả 200 với bundle `/assets/index-BKoDqzjv.js`, giống trước khi triển khai backend. Những sửa đổi frontend local từ audit trước vẫn chưa được đưa lên Vercel.

## SoundCloud: xác minh bản sửa trên production

URL công khai: `https://soundcloud.com/nocopyrightsounds/sace-caramel-ncs-release`.

- Analyze trả metadata và các tùy chọn audio.
- Job `e37df0de-c3ae-40f2-82fd-53a9df597c54` hoàn tất.
- **46 lần GET theo dõi job đều HTTP 200**, không ghi nhận 500.
- ETA trong mọi snapshot là số nguyên không âm; các mẫu lần này đều có giá trị 0.
- Khi hoàn tất, `total_bytes` và `downloaded_bytes` cùng bằng kích thước file thật **4.788.179 byte**.
- MP3 44,1 kHz stereo; giải mã toàn bộ file không lỗi.
- SHA-256 `d2681eb0eb027ffc27959f2efc061429812131e30c6d0affdcda17a260429dd2`.

**Đạt** cho mẫu kiểm thử này. Các giá trị ETA biên cụ thể, gồm `0.3710743243961664`, đã được xác minh trong regression local trước deploy; không tuyên bố chúng đều xuất hiện trong lượt tải production này.

[Log HTTP, ETA, metadata và codec](../.qa/deploy-eta-production/soundcloud.json) · [MP3 production](../.qa/deploy-eta-production/soundcloud.mp3).

## YouTube

Mẫu `jNQXAC9IVRw` vẫn **Không đạt** cho toàn luồng tải.

Analyze ghi nhận HTTP 403 lúc **00:35:18**, request ID `9820ad13-9886-4827-a7ad-ae46c80993f7`, với phản hồi mới:

```json
{
  "success": false,
  "error": {
    "code": "BOT_VERIFICATION_REQUIRED",
    "message": "Nguồn yêu cầu xác minh bot/CAPTCHA. Backend hiện không thể truy cập nội dung này.",
    "retryable": false,
    "requestId": "9820ad13-9886-4827-a7ad-ae46c80993f7"
  }
}
```

Có lượt phân tích khác trả được metadata, nhưng job audio sau đó thất bại và không tạo file. Vì vậy không coi metadata thành công là bằng chứng tải được YouTube. Không sử dụng cookie cá nhân, đổi proxy/client để vượt xác minh, giải CAPTCHA hoặc vượt DRM. Không kết luận nguyên nhân gốc là IP trung tâm dữ liệu chỉ từ các phản hồi này.

[Log analyze 403](../.qa/deploy-eta-production/youtube.json) · [Lượt metadata thành công nhưng audio thất bại](../.qa/deploy-eta-production/youtube-mp3.json).

## Regression sau triển khai

| Kiểm tra | Trạng thái | Bằng chứng |
| --- | --- | --- |
| TikTok video | **Đạt** | MP4 8.198.279 byte, H.264 768×576 + AAC, giải mã toàn bộ không lỗi |
| TikTok MP3 | **Đạt** | MP3 1.292.163 byte, giải mã toàn bộ không lỗi |
| Ảnh tên tiếng Việt | **Đạt** | JPEG 87.345 byte, HTTP 200, header Unicode đúng |
| Album ZIP | **Đạt** | 275.793 byte, đủ hai JPEG đúng thứ tự, CRC và ảnh hợp lệ |
| Facebook | **Đạt** cho mẫu | MP4 1.180.614 byte, H.264 400×224 + AAC; metadata ghi chưa rõ độ phân giải khi nguồn thiếu kích thước |
| Health | **Đạt** | 200 `status:ok` |
| File chưa hoàn tất | **Đạt** | 409 |
| Hủy job | **Đạt** | Trạng thái `cancelled` |
| CORS | **Đạt** | Origin Vercel hợp lệ được cho phép; origin khác không có allow-origin |
| URL loopback/SSRF | **Đạt** | 403 JSON có request ID |
| Frontend Vercel | **Đạt** kiểm tra HTTP/bundle | 200, bundle giữ nguyên; không tuyên bố đã kiểm thử lại điện thoại sau deploy |
| Instagram | **Chưa kiểm thử lại** | Lỗi 502 ở audit trước được giữ nguyên trong báo cáo lịch sử |

[File thật và JSON từng lượt](../.qa/deploy-eta-production/) · [Log regression](../.qa/deploy-eta-production/regression.json) · [Dấu hiệu code mới đã chạy](../.qa/deploy-eta-production/readiness.json).

Trước khi xuất bản, **69 test backend qua**. Các thay đổi mới xử lý normalization/serialization và thông báo lỗi trong backend; response envelope giữ tương thích frontend. Android Xiaomi 15 Ultra/Chrome từng được người dùng xác nhận MP4/MP3 TikTok đạt trước lượt deploy này; ZIP trên điện thoại thật vẫn chưa thử.

## Giới hạn

Chưa có quyền đọc trực tiếp deploy ID/runtime logs mới của Render trong phiên công cụ này. Trạng thái đã chạy được xác minh qua API mới và tải file thật. Không nâng gói hay tạo dịch vụ mới. Không hứa khôi phục job/file tạm sau restart; người dùng cần phân tích và tải lại khi job hết hạn hoặc không còn tồn tại.
