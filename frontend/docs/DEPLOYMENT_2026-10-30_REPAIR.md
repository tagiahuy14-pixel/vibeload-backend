# Triển khai bản sửa VibeLoad Web — 30/10/2026

Người dùng đã cho phép triển khai. Hoàn tất trên hai dịch vụ hiện có, khoảng 23:20–23:25 giờ Việt Nam.

## Backend Render

- URL: https://vibeload-backend.onrender.com
- Repository riêng: `tagiahuy14-pixel/vibeload-backend`, branch `main`.
- Commit: [547533e46eefce31d590093e6e2d96d1015a6e54](https://github.com/tagiahuy14-pixel/vibeload-backend/commit/547533e46eefce31d590093e6e2d96d1015a6e54).
- Đưa 20 file sửa/test lên repo qua GitHub API, dựa trên HEAD hiện tại và cập nhật ref không force. Không push checkout Android.
- Render tự triển khai sau khi cập nhật repo. Xác nhận code mới bằng `/` và `/api/health` trả JSON `status:ok`, header request ID và hành vi tải ảnh Unicode mới.
- Không cần plugin Render để hoàn tất lần triển khai này. Chưa truy cập được dashboard/deploy ID và runtime logs mới; không tuyên bố đã đo CPU/RAM trên Render.

## Frontend Vercel

- URL public: https://vibeload-web.vercel.app
- Project hiện có: `vibeload-web`, scope `tagiahuy14-8074s-projects`.
- Deployment: `dpl_7Ue8okAVnHMYf4HbYEytswRYfUNL`, trạng thái READY.
- URL deployment: https://vibeload-2mnqj7v7l-tagiahuy14-8074s-projects.vercel.app
- Build production với `VITE_API_URL=https://vibeload-backend.onrender.com`; ban đầu `--skip-domain`, sau khi backend vượt kiểm tra TikTok/ảnh/album thì `vercel promote` thành công.
- Đọc URL public không dùng xác thực: `/`, `/library`, `/manifest.webmanifest`, `/sw.js` đều 200. JavaScript `/assets/index-BKoDqzjv.js` trên tên miền public giống từng byte với bản build local đã kiểm thử và chứa URL backend đúng.
- `vercel curl` tự tạo token bypass theo cơ chế CLI khi kiểm tra URL deployment có bảo vệ. Token không được in hoặc lưu vào báo cáo. Việc xác minh tên miền public sau promote dùng HTTP không xác thực, độc lập với bypass.

## Kiểm thử production bằng network thật

| Kiểm tra | Kết quả |
| --- | --- |
| Root và health Render | 200, `status:ok` |
| Preflight và CORS từ frontend production | 200, `Access-Control-Allow-Origin` đúng origin |
| Analyze album TikTok mẫu | 200, 2 ảnh |
| Tải ảnh với tên `TikTok Ảnh_01.jpg` | 200, JPEG hợp lệ, 87.345 byte, header `filename*=utf-8''TikTok%20%E1%BA%A2nh_01.jpg` |
| Tải album bằng job và lấy file | 200, ZIP 275.793 byte, đúng 2 ảnh, CRC và ảnh bên trong hợp lệ |
| Video TikTok | 200, MP4 2.786.173 byte, ffprobe xác nhận H.264 và AAC |
| MP3 TikTok | 200, 1.292.163 byte, ffprobe xác nhận codec MP3 |
| Hủy job đang chạy | Trạng thái `cancelled` |
| URL SSRF `127.0.0.1` | 403 JSON có mã lỗi và request ID |
| YouTube `jNQXAC9IVRw` trên Render | FAIL: analyze trả 403 `ACCESS_DENIED` với thông báo nguồn yêu cầu đăng nhập; job tải thất bại. Không tính kết quả local thành PASS production. |

Mẫu ảnh/album: `https://www.tiktok.com/@hullcity/photo/7553302113757990166`.
Mẫu video/audio: `https://www.tiktok.com/@kn10hd/video/7697035038751231240`.

Bằng chứng có file thật, SHA-256 và kết quả JSON tại `web/.qa/production-repair/`. Không dùng mock upstream cho các kiểm tra trên.

## Phần chưa xác minh

- Chưa kiểm thử giao diện và thao tác lưu trên điện thoại thật; chưa thử cold start sau 15 phút ngủ trên Render.
- Chưa có URL TikTok rút gọn mới đầy đủ từ ảnh người dùng. Mẫu `vm.tiktok.com` cũ trong kiểm thử local đã chuyển về trang chủ.
- Chưa kiểm thử toàn bộ Facebook/Instagram/SoundCloud trên Render trong lượt triển khai này; các mẫu tải local đã qua được ghi riêng trong báo cáo sửa lỗi.
- Job/file tạm không được khôi phục sau restart; frontend yêu cầu phân tích/tải lại khi job không còn tồn tại.
- Không đổi billing, không tạo dịch vụ mới, không sửa Android. GitHub cho thấy repo backend còn liên kết một project Vercel backend có sẵn và có auto-deployment khi branch cập nhật; frontend chính vẫn trỏ Render.

Nếu PWA còn hiển thị giao diện cũ, mở lại trang và nhận bản cập nhật ứng dụng khi được thông báo. Không coi việc HTTP/bundle đã cập nhật là bằng chứng điện thoại thật đã lưu file thành công.
