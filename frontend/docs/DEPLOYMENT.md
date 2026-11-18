# Vercel production

**Backend mới nhất:** [triển khai ETA/YouTube ngày 31/10/2026](DEPLOYMENT_ETA_2026-10-31.md); frontend Vercel được giữ nguyên trong lượt này.

**Bản mới nhất:** xem [triển khai bản sửa Render + Vercel ngày 30/10/2026](DEPLOYMENT_2026-10-30_REPAIR.md). Các thông tin dưới đây thuộc lần triển khai trước đó.

Triển khai ngày **30/10/2026** (Asia/Saigon).

- URL public: https://vibeload-web.vercel.app
- Project: `vibeload-web` (Hobby).
- Deployment: `dpl_AywoeimzurDFpWcKGDvwHEmBBa2A`.
- Vercel trả trạng thái `READY`, target `production`.
- Triển khai bằng CLI từ `D:\VibeLoad\web`, không push GitHub.

## Đã xác minh

- 85/85 unit tests thành công.
- TypeScript và production build thành công; build xác minh HTML offline, ba icon PWA và mã đăng ký service worker.
- HTTP GET không xác thực tới `/`, `/library`, `/manifest.webmanifest` và `/sw.js` trên production domain đều trả 200 qua HTTPS.
- Manifest và service worker trả đúng Content-Type; CSP được áp dụng trên production.

## Giới hạn xác minh

Tabbit không khởi tạo được vì `CLI_REGISTRATION_UNAVAILABLE`; chưa kiểm tra giao diện, tải media hay PWA offline bằng trình duyệt trên production. Kết quả E2E local trước đó được ghi riêng trong `TEST_REPORT.md`. Chưa kiểm tra điện thoại thật hoặc mạng di động.

## Triển khai lại

```powershell
cd D:\VibeLoad\web
npx.cmd vercel --prod --yes --scope tagiahuy14-8074s-projects
```

Liên kết project nằm trong `.vercel/` được Git bỏ qua. Không chia sẻ `.env.local` hay đưa nó vào source công khai.
