# VibeLoad Web

Phiên bản React + TypeScript + Vite + PWA của VibeLoad, dành cho **Vercel Hobby** và mục đích cá nhân phi thương mại. Toàn bộ mã Web nằm trong `web/`; ứng dụng Android hiện có được giữ nguyên.

Web tải **URL tệp media trực tiếp** mà trình duyệt đọc được qua CORS. Dữ liệu đi từ máy chủ nguồn đến thiết bị người dùng. Vercel chỉ phân phối giao diện tĩnh: không API, không proxy, không máy chủ tải nền, không backend ngoài và không cần bật máy tính cá nhân sau khi xuất bản.

**Đã triển khai production:** https://vibeload-web.vercel.app. Chưa push GitHub. Xem [kết quả triển khai](docs/DEPLOYMENT.md) và [báo cáo kiểm thử local](docs/TEST_REPORT.md) để phân biệt phạm vi đã xác minh.

## Chạy trên máy phát triển

Cần Node.js **24.x** và npm. Tại thư mục project:

```powershell
cd web
npm ci --include=dev
npm run dev
```

Mở địa chỉ localhost Vite in trong terminal. Các lệnh kiểm tra:

```powershell
npm run check
npm test
npm run build
npm run preview
```

`check` kiểm tra TypeScript; `test` chạy bộ kiểm thử; `build` tạo thư mục `dist/`; `preview` phục vụ bản build để kiểm tra trước khi xuất bản. Kiểm tra service worker/PWA trên bản build, vì môi trường dev không thể thay thế bản production. Không dùng máy chủ preview làm hosting công khai.

Trên PowerShell nếu `npm.ps1` bị chặn, dùng `npm.cmd` thay `npm` (tương tự `npx.cmd`); không cần đổi Execution Policy. Script build tự đặt `NODE_ENV=production` cho Vite, kể cả khi máy phát triển đang đặt giá trị `development`. Build cũng kiểm tra precache HTML, kích thước icon và mã đăng ký service worker.

## Kiểm thử trình duyệt của project

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.cache/ms-playwright"
npx.cmd playwright install chromium
npm.cmd run build
npm.cmd run test:e2e
```

Bộ E2E dùng Chromium headless tạm, không dùng profile trình duyệt cá nhân. Cần OpenSSL (`openssl` trong PATH hoặc Git for Windows; có thể đặt `OPENSSL_BIN`). Test server HTTPS chỉ nghe trên loopback để kiểm tra CORS thật; chứng thư tự ký và fixtures được tạo trong `.qa/`, không thuộc `dist/` hay bản deploy. Việc bỏ qua lỗi chứng thư chỉ nằm trong cấu hình test này; ứng dụng production không bỏ qua TLS. Kết quả, file đã lưu, ảnh màn hình và số đo mô phỏng nằm ở `.qa/` và `test-results/`, được Git/Vercel bỏ qua.

Mặc định suite chỉ chạy các case local. Đặt `$env:VIBELOAD_LIVE_MEDIA = "1"` rồi chạy lại `npm.cmd run test:e2e` để bật thêm mẫu MP3/MP4 công khai MDN và kiểm thử CSP có Internet. Các case public dùng kiểm tra TLS bình thường; nguồn mẫu ngoài có thể thay đổi quyền truy cập/CORS theo thời gian.

## Cách sử dụng

1. Ở **Trang chủ**, dán URL HTTPS trỏ đến một tệp ảnh, video hoặc audio. Nút dán cần quyền clipboard; có thể dán thủ công khi trình duyệt từ chối.
2. Kiểm tra nguồn. URL trang YouTube/TikTok, kể cả album `/photo/{id}`, được thông báo chưa hỗ trợ tải trực tiếp.
3. Khi nguồn phù hợp, bắt đầu tải. Màn hình **Tải xuống** hiển thị bytes nhận thực tế và cho phép hủy; chỉ có phần trăm khi xác định được tổng dung lượng.
4. Sau khi nhận đủ tệp, chọn **Lưu tệp**. Trình duyệt quyết định thư mục đích và có thể yêu cầu xác nhận. Việc gửi yêu cầu lưu không chứng minh tệp đã được ghi vào thiết bị.
5. **Thư viện** lưu thông tin lịch sử. Muốn mở lại một tệp đã tải trong phiên trước, dùng nút chọn tệp từ thiết bị.

Trong **Cài đặt**, chọn giao diện sáng/tối/theo hệ thống và giới hạn tệp 25, 50 hoặc 100 MiB. Mặc định **50 MiB**; 1 MiB = 1.048.576 bytes. Nên dùng mức thấp trên điện thoại có ít RAM.

## Khả năng và giới hạn

| Chức năng | Phạm vi thực tế |
|---|---|
| Ảnh trực tiếp | Các định dạng raster được nhận diện và trình duyệt/nguồn cho phép, như JPG, PNG, WebP, GIF. SVG không được hỗ trợ. |
| Video trực tiếp | MP4/WebM hợp lệ, nguồn cho phép đọc bằng CORS. Khả năng phát phụ thuộc codec của trình duyệt. |
| Audio trực tiếp | MP3/M4A/Opus và các loại audio được hỗ trợ. Giữ nguyên nội dung gốc, không chuyển mã. |
| YouTube, TikTok, Facebook, Instagram, SoundCloud | Khi kết nối Media Backend (`web/backend`): phân tích và tải trực tiếp video không logo, MP3, album ảnh ZIP. Khi chưa kết nối backend: hiển thị hướng dẫn sử dụng VibeLoad Android. |
| Tiến trình | Tính theo bytes truyền thực tế; không mô phỏng phần trăm. |
| Thư viện | Metadata cục bộ; không quét thư mục Downloads, không đồng bộ Cloud. |
| PWA | Cài đặt khi trình duyệt hỗ trợ; mở lại giao diện offline sau lần tải app shell thành công. Tải media vẫn cần mạng. |
| Tải nền, tiếp tục sau khi đóng tab | Không hỗ trợ. Giữ tab mở trong lúc tải. |

URL bị CORS chặn, yêu cầu đăng nhập, hết hạn, trả HTML hoặc sai loại nội dung sẽ không được coi là tệp đã tải thành công. Không theo redirect: hãy dùng URL HTTPS cuối cùng của tệp. Không có FFmpeg WebAssembly, chuyển MP3, ghép luồng, DASH/HLS, CAPTCHA hoặc DRM bypass.

## Dữ liệu và riêng tư

- Không có tài khoản, quảng cáo hay analytics trong ứng dụng; không upload tệp lên Cloud.
- Thiết lập và lịch sử metadata nằm trong localStorage của trình duyệt. URL tải, bao gồm query/token của URL ký, chỉ nằm trong RAM và không được ghi vào lịch sử.
- Blob tệp tải chỉ tồn tại trong phiên hiện tại. Tải lại/đóng trang làm mất Blob; có thể chọn lại tệp đã lưu từ thiết bị.
- Chỉ đọc tệp người dùng tự chọn bằng File Picker. Website không tự đọc thư mục Downloads trên Android/iPhone.
- Xóa dữ liệu website hoặc dùng chế độ riêng tư có thể làm mất thiết lập và lịch sử. Nguồn media vẫn nhận request trực tiếp từ thiết bị; Vercel xử lý request hosting theo chính sách hạ tầng của họ.

## Deploy Vercel

Xem [hướng dẫn Vercel](docs/VERCEL.md). Cấu hình cần dùng:

| Thiết lập | Giá trị |
|---|---|
| Plan | Hobby, cá nhân phi thương mại |
| Root Directory | `web` nếu nhập toàn bộ repository |
| Framework Preset | Vite |
| Node.js | 24.x |
| Install Command | `npm ci --include=dev` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Biến môi trường / database | Không cần |

Sau khi bạn chủ động deploy, Vercel cấp URL HTTPS dạng `*.vercel.app`; tên chính xác tùy khả dụng. Bản production hoạt động qua Internet mà không cần máy phát triển chạy. Free vẫn có hạn mức và chính sách sử dụng, không phải hosting không giới hạn.

## Tài liệu

- [Hướng dẫn cấu hình và triển khai Backend Media](backend/README.md)
- [Phân tích Android và quyết định tái sử dụng](docs/ANDROID_REVIEW.md)
- [Hướng dẫn deploy và tài liệu Vercel đã kiểm tra](docs/VERCEL.md)
- [Giới hạn chức năng, CORS, bộ nhớ và PWA](docs/LIMITATIONS.md)
- [Kết quả kiểm thử và checklist sau deploy](docs/TEST_REPORT.md)

Chỉ đánh dấu nghiệm thu sau khi có bằng chứng tương ứng: build/TypeScript/test, giao diện desktop/mobile, PWA, tệp tải thực tế và kiểm tra trên URL production. Việc chuẩn bị source không đồng nghĩa đã kiểm tra HTTPS công khai hoặc điện thoại thật.
