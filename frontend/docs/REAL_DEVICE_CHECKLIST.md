# Kiểm thử VibeLoad trên điện thoại thật

Người dùng đã xác nhận ngày 31/10/2026: **Xiaomi 15 Ultra, Chrome, 4G/5G**, MP4 và MP3 TikTok đạt; album ZIP chưa thử. Các hạng mục khác vẫn chưa kiểm thử. Kết quả Chromium mobile viewport không được điền vào bảng này.

Trong lượt audit cold start, tránh mở app hoặc gọi backend trước khi phép đo nghỉ 17 phút hoàn tất. Nếu có người khác truy cập, ghi nhận để không kết luận sai rằng Render đã ngủ.

## Thông tin mỗi lượt

Ghi mẫu máy, phiên bản Android/iOS, trình duyệt và phiên bản, thời gian theo giờ Việt Nam. Tắt Wi-Fi và xác nhận đang dùng 4G/5G. Không gửi mật khẩu, cookie, token hoặc dữ liệu riêng tư.

Trang đang chạy: https://vibeload-web.vercel.app

## URL mẫu công khai

- Video và MP3: `https://www.tiktok.com/@kn10hd/video/7697035038751231240`
- Album hai ảnh: `https://www.tiktok.com/@hullcity/photo/7553302113757990166`
- Link rút gọn: lấy một link chia sẻ **mới còn hiệu lực** từ chính bài mẫu hoặc bài công khai được phép tải. Không dùng lại link `vm.tiktok.com` cũ đã chuyển về trang chủ.

## Các bước và bằng chứng cần ghi

1. Mở trang bằng dữ liệu di động. Ghi có tải được giao diện và có thấy thông báo cập nhật PWA hay không.
2. Dán URL video, nhấn phân tích. Ghi tiêu đề, tác giả, thời gian chờ và các định dạng thực sự hiển thị. Khi lỗi, ghi thông báo và request ID.
3. Tải video, xác nhận file thực sự xuất hiện trong Downloads/Tệp. Mở file bằng trình phát của máy, kiểm tra có hình, tiếng và tua được. Ghi tên, định dạng, số byte và thời lượng; không chỉ ghi “đã bấm tải”.
4. Chọn MP3, tải và xác nhận file trong Downloads/Tệp, phát được tiếng. Ghi tên và số byte.
5. Phân tích album, xác nhận đúng hai ảnh theo thứ tự. Tải một ảnh tên tiếng Việt, mở được ảnh trong Tệp/Downloads. Tải ZIP, mở/giải nén được và đủ hai ảnh đúng thứ tự. Không tính thumbnail hiển thị là tải thành công.
6. Bắt đầu tải rồi nhấn hủy. Xác nhận giao diện thoát trạng thái tải và không báo hoàn tất cho file chưa xong.
7. Với PWA đã cài, mở lại app; thử mở Thư viện/Cài đặt khi ngoại tuyến. Kiểm tra tải media mới bị từ chối khi ngoại tuyến; không tuyên bố máy chủ làm việc offline.
8. Để backend không nhận request ít nhất 17 phút, mở app và phân tích lại. Ghi thời gian chờ, thông báo đang khởi động và kết quả. Nếu job cũ mất, ứng dụng phải hướng dẫn phân tích/tải lại.

## Bảng kết quả thực tế

| Hạng mục | Android Chrome + 4G/5G | iPhone Safari + 4G/5G |
| --- | --- | --- |
| Mở trang, phân tích URL | Chưa kiểm thử | Chưa kiểm thử |
| Link TikTok rút gọn mới | Chưa kiểm thử | Chưa kiểm thử |
| MP4 lưu thật, có hình và tiếng | Đạt — người dùng xác nhận Xiaomi 15 Ultra/Chrome | Chưa kiểm thử |
| MP3 lưu thật và phát được | Đạt — người dùng xác nhận Xiaomi 15 Ultra/Chrome | Chưa kiểm thử |
| Ảnh tên tiếng Việt lưu/mở được | Chưa kiểm thử | Chưa kiểm thử |
| ZIP đủ ảnh và giải nén được | Chưa kiểm thử | Chưa kiểm thử |
| Hủy tải | Chưa kiểm thử | Chưa kiểm thử |
| PWA/offline | Chưa kiểm thử | Chưa kiểm thử |
| Cold start qua mạng di động | Chưa kiểm thử | Chưa kiểm thử |

Chỉ đổi từng ô thành **Đạt** hoặc **Không đạt** sau khi người kiểm thử xác nhận đúng bước và có bằng chứng tương ứng. Safari/Chrome có thể dùng cơ chế lưu khác nhau; thông báo “đã gửi yêu cầu lưu” không chứng minh file đã được ghi xuống máy.
