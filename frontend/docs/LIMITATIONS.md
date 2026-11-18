# Phạm vi và giới hạn VibeLoad Web

Bản Web dùng Vercel làm hosting tĩnh. Khả năng tải do URL nguồn, CORS và trình duyệt quyết định. Có nút tải không có nghĩa mọi website đều tải được.

## Loại nguồn

| Nguồn | Cách xử lý |
|---|---|
| URL HTTPS của ảnh raster trực tiếp | Kiểm tra phản hồi và nội dung; cho tải khi định dạng được hỗ trợ và đọc được bằng CORS. |
| URL HTTPS MP4/WebM trực tiếp | Nhận nguyên tệp; không ghép video/audio, không thay đổi độ phân giải. |
| URL HTTPS audio trực tiếp | Nhận nguyên tệp; không đổi audio gốc sang MP3 hoặc đổi bitrate. |
| Trang HTML, trang đăng nhập, JSON trả lỗi | Từ chối; đuôi `.mp4` hoặc `.jpg` không đủ để xác nhận là media. |
| YouTube, TikTok, TikTok `/photo/{id}` | Chưa hỗ trợ trích xuất; có thể mở nội dung gốc. Không gọi API downloader hoặc scraper bên ngoài. Xem chi tiết [báo cáo xác minh tính khả thi TikTok](TIKTOK_FEASIBILITY.md). |
| Playlist DASH/HLS, live stream, DRM | Chưa hỗ trợ tải/ghép/chuyển mã. |
| SVG | Không hỗ trợ như media tải/xem trong phiên bản này. |
| HEIC/HEIF | Chưa hỗ trợ. |
| Nguồn cần cookie đăng nhập, CAPTCHA, TLS không hợp lệ | Không vượt cơ chế bảo vệ của nguồn. |

Thông báo cho nền tảng không hỗ trợ:

> Nguồn này hiện chưa hỗ trợ tải trực tiếp trên phiên bản VibeLoad Web chỉ sử dụng Vercel.

Trình phát `<audio>`/`<video>` sử dụng decoder của trình duyệt. Một container hợp lệ có thể chứa codec thiết bị không phát được; việc tải nguyên tệp thành công không chứng minh mọi thiết bị đều phát được codec đó. Kiểm tra định dạng chỉ bảo vệ luồng sử dụng cơ bản, không phải công cụ quét malware hoặc chứng minh quyền tác giả.

## CORS và URL

Website công khai dùng HTTPS nên chỉ chấp nhận URL HTTPS hợp lệ. Không xử lý `javascript:`, `data:`, `file:`, URL chứa tài khoản/mật khẩu hoặc địa chỉ nội bộ bị chặn bởi bộ kiểm tra URL. Không có endpoint proxy tùy ý.

`fetch` cross-origin cần nguồn trả header CORS phù hợp. VibeLoad không thể thêm header vào máy chủ của người khác. `mode: no-cors` trả opaque response nên không dùng làm cách tạo tệp. Xem [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) và [Request.mode](https://developer.mozilla.org/en-US/docs/Web/API/Request/mode).

JavaScript không được biết đầy đủ chi tiết lỗi CORS. Lỗi mạng, TLS, DNS và CORS có thể biểu hiện giống nhau; thông báo tổng quát cần giữ sự không chắc chắn này. Chỉ console/network của trình duyệt mới cung cấp thêm bằng chứng chẩn đoán. Xem [MDN CORS errors](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors).

URL ký có thể hết hạn giữa lúc kiểm tra và lúc tải. Query/token chỉ giữ trong RAM; tải lại trang yêu cầu dán lại URL. Nguồn có thể thay đổi nội dung, CORS, MIME hoặc quyền truy cập theo thời gian. Một mẫu thành công không bảo đảm mọi URL cùng nền tảng hoạt động.

Request chủ động **không theo chuyển hướng** (`redirect: error`). Cần dùng URL HTTPS cuối cùng của tệp, không dùng link rút gọn hoặc URL trung gian. Request không gửi cookie đăng nhập và không gửi referrer. Nguồn yêu cầu các thông tin đó có thể từ chối tải.

## Tiến trình, hủy và lưu tệp

- Các trạng thái kiểm tra, nguồn được hỗ trợ/không hỗ trợ, đang tải, hoàn tất nhận dữ liệu, thất bại và đã hủy phản ánh luồng thực tế.
- Chỉ hiển thị phần trăm khi biết tổng dung lượng có thể dùng để đối chiếu với bytes đang nhận. Khi tổng không xác định được, hiển thị bytes và trạng thái đang truyền.
- Tải và hủy diễn ra ở tab hiện tại. Hủy dừng request và bỏ tệp chưa hoàn chỉnh; không có hàng đợi server, resume qua phiên khác hoặc tải sau khi đóng trang.
- Khi đã nhận đủ dữ liệu, Blob có thể được chuyển cho cơ chế download của trình duyệt. **Đã gửi yêu cầu lưu không có nghĩa đã xác nhận tệp được ghi xuống ổ đĩa.** Người dùng có thể hủy hộp thoại hoặc trình duyệt có thể mở preview.
- Không bảo đảm vị trí lưu, đổi tên tự động hoặc quyền mở tệp giống nhau giữa Android, iOS, desktop và chế độ PWA. Chọn thư mục/tên cuối cùng theo giao diện trình duyệt.

Thuộc tính `download` không ép tải được mọi URL khác origin. VibeLoad tạo Blob cục bộ từ dữ liệu đã đọc thay vì giả định liên kết ngoài luôn được lưu. Xem [MDN anchor download](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a). File System Access API cũng [chưa hỗ trợ đồng đều](https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker); website không hứa có cùng hộp thoại lưu trên mọi máy.

## Bộ nhớ và xử lý media

Mặc định giới hạn **50 MiB mỗi tệp**, có thể chọn **25 / 50 / 100 MiB** trong Cài đặt. Đây là giới hạn của ứng dụng để giảm áp lực RAM, không phải giới hạn 4,5 MB của Vercel Functions. Không Functions nào nhận tệp media này.

Trong quá trình tải, chunks và Blob dùng RAM của thiết bị; bộ nhớ thực tế có thể lớn hơn dung lượng tệp. Thiết bị ít RAM vẫn có thể đóng tab với tệp nằm dưới giới hạn. Mức 100 MiB không phải cam kết hiệu năng trên điện thoại. Nên giữ tab mở và dùng giới hạn thấp khi cần.

Không tích hợp FFmpeg WebAssembly. Tài liệu chính thức [FAQ](https://ffmpegwasm.netlify.app/docs/faq/) và [benchmark](https://ffmpegwasm.netlify.app/docs/performance/) cho thấy chi phí RAM/CPU và độ chậm so với native; benchmark của họ không đại diện cho điện thoại của người dùng. Chưa có kiểm thử thiết bị thật để nhận trách nhiệm tính năng chuyển mã.

## Thư viện và dữ liệu cục bộ

- localStorage giữ thiết lập và tối đa 100 bản ghi metadata lịch sử, không giữ tệp media và không giữ URL tải/query token. Có thể tắt ghi nhớ lịch sử trong Cài đặt.
- Blob của phiên chỉ nằm trong RAM. Sau refresh hoặc đóng tab, lịch sử còn lại không phải bản sao có thể phát của tệp.
- File Picker chỉ mở những tệp người dùng tự chọn. Website không quét hoặc tự đọc toàn bộ Downloads.
- Không có Cloud database, đồng bộ nhiều máy, tài khoản, phân tích hành vi, quảng cáo hoặc upload tệp người dùng.
- Trình duyệt có thể chặn hoặc xóa localStorage; chế độ riêng tư có thể không giữ dữ liệu sau khi đóng cửa sổ.

## PWA và môi trường thực tế

Manifest và service worker hỗ trợ cài đặt/offline trên trình duyệt phù hợp. Service worker chỉ cache app shell cùng origin, không cache media từ URL bên ngoài hoặc tạo tác vụ tải nền. PWA không bổ sung quyền MediaStore, Foreground Service hay WakeLock của ứng dụng Android.

Cài đặt PWA phụ thuộc trình duyệt và hệ điều hành; trên iOS thao tác thêm vào màn hình chính có thể do người dùng thực hiện thủ công. Cần HTTPS ở production; localhost là ngoại lệ phục vụ phát triển. Xem [MDN Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

Xem [TEST_REPORT.md](TEST_REPORT.md) để biết bằng chứng đã có. Điện thoại thật, việc ghi tệp thực tế trên từng hệ điều hành và chức năng trên URL Vercel sau deploy phải được ghi **Chưa kiểm thử** cho đến khi có phép thử tương ứng. Không dùng local build hoặc mobile viewport để thay thế các kết quả đó.
