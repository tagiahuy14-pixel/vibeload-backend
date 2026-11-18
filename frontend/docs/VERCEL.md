# Triển khai VibeLoad Web lên Vercel Hobby

Tài liệu nền tảng được mở và đối chiếu ngày **30/10/2026**. Project được chuẩn bị để deploy tĩnh. Chưa tạo deployment, chưa giữ chỗ tên miền và chưa push GitHub.

## Kiến trúc

```text
Trình duyệt trên Internet ──HTTPS──> Vercel CDN: HTML/CSS/JS/PWA
          │
          └──HTTPS + CORS──> URL tệp media được nguồn cho phép
          │
          └──Blob trong RAM──> Cơ chế lưu tệp của trình duyệt
```

Không có thư mục API, Vercel Functions, scraper, media proxy, database Cloud, máy chủ ngoài hoặc tiến trình worker thường trực. Service worker chỉ cache giao diện và tài nguyên tĩnh của ứng dụng.

## Tài liệu và giới hạn đã kiểm tra

| Chủ đề | Nội dung cần lưu ý | Nguồn chính thức |
|---|---|---|
| Vercel Functions | Chạy theo invocation, có hạn thời gian; không phải VPS. Với Hobby + Fluid compute: mặc định và tối đa **300 giây**, **2 GB / 1 vCPU**, request/response body **4,5 MB**. | [Functions limits](https://vercel.com/docs/functions/limitations), cập nhật 24/08/2026 |
| Quota miễn phí | Hobby gồm **4 CPU giờ**, **360 GB giờ** bộ nhớ, **1 triệu function invocations** và **100 GB Fast Data Transfer**. Đây là các loại tài nguyên khác nhau, không cộng thành thời gian chạy tùy ý. | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Fair Use | Frontend tĩnh/SPA là ví dụ phù hợp. Proxy/VPN, scraper và media hosting để hot-link thuộc nhóm không phù hợp. | [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines), cập nhật 14/09/2026 |
| Phi thương mại | Hobby dành cho sử dụng cá nhân phi thương mại. Không quảng cáo, bán dịch vụ hoặc thêm cơ chế kinh doanh rồi mặc định vẫn đủ điều kiện Hobby. | [Hobby plan](https://vercel.com/docs/plans/hobby), [Terms of Service](https://vercel.com/legal/terms) |
| Routing Vite SPA | Deep link cần rewrite về `index.html`. `web/vercel.json` chứa cấu hình tương ứng. | [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), cập nhật 26/08/2026 |
| HTTPS/domain | Vercel cấp domain `*.vercel.app`; tên miền tùy còn trống. SSL được hạ tầng quản lý. | [Working with domains](https://vercel.com/docs/domains/working-with-domains), [Working with SSL](https://vercel.com/docs/domains/working-with-ssl) |
| Node.js | Chọn **24.x** và giữ khớp `engines.node` trong package.json. | [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) |

Các số Functions ở trên dành cho **Fluid compute** và chỉ dùng để đánh giá lựa chọn kiến trúc. Bản Web này không gọi Functions nên không phụ thuộc các ngân sách xử lý đó để tải media. Tài liệu search/cache cũ có thể ghi Hobby 10s/60s; không áp dụng con số cũ cho bảng Fluid hiện tại. Trước khi xuất bản về sau, kiểm tra lại chính sách và quota vì Vercel có thể thay đổi.

## Kiểm tra trước deploy

Tại `D:\VibeLoad\web`:

```powershell
npm ci --include=dev
npm run check
npm test
npm run build
npm run preview
```

Đọc [TEST_REPORT.md](TEST_REPORT.md). Kiểm tra desktop/mobile, nội dung cảnh báo, hủy tải, tệp thực tế và PWA trên bản build. Thư mục cần xuất bản là `web/`; không tải keystore, token, `.git`, `local.properties`, APK hoặc các dữ liệu riêng ở gốc project lên Vercel.

## Cách 1: Dashboard và Git repository

Thao tác này chỉ thực hiện khi bạn đã quyết định xuất bản và cho phép push source tương ứng. Tạo repository chứa source phù hợp hoặc dùng repository có sẵn; không cần làm repository Android public.

1. Đăng nhập Vercel bằng tài khoản cá nhân, chọn plan **Hobby**; không cần bật trial Pro.
2. Chọn **Add New → Project**, nhập Git repository bạn đã cho phép kết nối.
3. Nếu repository chứa toàn bộ VibeLoad, đặt **Root Directory = `web`**. Nếu repository chỉ chứa nội dung bên trong `web/`, dùng root mặc định.
4. Chọn **Framework Preset = Vite**; Node.js **24.x**.
5. Dùng **Install Command = `npm ci --include=dev`**, **Build Command = `npm run build`**, **Output Directory = `dist`**. Không cần biến môi trường.
6. Chọn project name còn khả dụng. `vibeload.vercel.app` là ví dụ, chưa phải địa chỉ đã được cấp.
7. Kiểm tra cấu hình rồi chủ động nhấn **Deploy**. Chỉ sau khi build thành công mới có URL để kiểm thử công khai.

Git integration thường tự tạo deployment khi có push tiếp theo. Kiểm tra cài đặt automation nếu bạn muốn mỗi lần xuất bản đều do mình chủ động quyết định. Source Web có lockfile để `npm ci --include=dev` cài đúng cây dependency đã kiểm thử.

## Cách 2: CLI từ thư mục web

Không cần đưa source lên GitHub. Các lệnh dưới đây là **hướng dẫn để bạn tự chạy sau khi cho phép xuất bản**, chưa được agent thực thi:

```powershell
cd D:\VibeLoad\web
npx vercel login
npx vercel --prod
```

Khi CLI hỏi, chọn tài khoản Hobby của bạn, project phù hợp và thư mục hiện tại `./`. Đọc phần tóm tắt cấu hình trước khi xác nhận. CLI upload source trong ngữ cảnh project Web và Vercel thực hiện build. Không chạy lệnh ở thư mục gốc Android. Không cần duy trì terminal hay PC sau khi deployment đã thành công.

## Kiểm tra sau deploy

Những mục sau **chưa được coi là đã kiểm thử** chỉ vì local build thành công:

- Mở **production domain** bằng cửa sổ ẩn danh, xác nhận HTTPS và truy cập không cần đăng nhập. Xem [Deployment Protection](https://vercel.com/docs/deployment-protection): URL preview hoặc URL deployment riêng có thể được bảo vệ khác production domain.
- Mở trên điện thoại dùng 4G/5G hoặc mạng khác PC. Không dùng localhost/LAN để kết luận website đã công khai.
- Làm mới trực tiếp từng trang Trang chủ/Tải xuống/Thư viện/Cài đặt; kiểm tra routing và tài nguyên không 404.
- Kiểm tra manifest, service worker, icon, mở app shell khi offline và cài PWA khi trình duyệt hỗ trợ. Offline không tải được media mới.
- Tải một ảnh, một video và một audio hợp lệ từ nguồn cho phép CORS; lưu rồi mở tệp thực tế trên thiết bị. Ghi URL mẫu, ngày kiểm tra, MIME và dung lượng vào báo cáo.
- Thử URL sai, nguồn CORS chặn, YouTube, TikTok/album, URL hết hạn, tệp quá giới hạn và thao tác hủy. Lỗi cần rõ, không tạo tệp HTML hoặc tệp rỗng giả media.
- Kiểm tra hiệu năng và bộ nhớ trên điện thoại thật, đặc biệt khi đổi giới hạn lên 100 MiB. Mô phỏng viewport không thay cho phép đo thiết bị thật.

## Khi gặp lỗi

| Hiện tượng | Kiểm tra |
|---|---|
| Build không tìm package.json | Root Directory phải trỏ đúng thư mục Web. |
| Refresh trang bị 404 | `vercel.json` phải nằm trong root Web được deploy, có rewrite về `/index.html`. |
| Trang hỏi Vercel login | Kiểm tra đang mở production domain hay URL preview/deployment; đọc scope Deployment Protection. |
| Media lỗi fetch | Kiểm tra URL, quyền truy cập và CORS của nguồn. Vercel không thể tự sửa CORS của website khác. |
| Tải trên điện thoại bị dừng | Giữ tab hoạt động, thử tệp nhỏ hơn. Browser có thể đóng tab khi thiếu RAM hoặc app chuyển nền. |
| Quota Hobby hết | Xem Usage và chính sách hiện tại. Không thêm tài khoản/proxy để né giới hạn. |

Không có bước cấu hình VPS, bật máy tính, đánh thức server hay mua dịch vụ bên ngoài trong quy trình này.
