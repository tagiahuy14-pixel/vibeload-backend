# Báo cáo xác minh tính khả thi: Tải video TikTok trên VibeLoad Web (Vercel-only)

*Thời điểm xác minh: 30/10/2026*  
*Môi trường thử nghiệm: Chromium Headless 1248 (Playwright) & Node.js v24.14.0 trên Windows, source `web/`*

---

## 1. Kết quả kiểm tra trước khi sửa

### 1.1. TikTok đang bị chặn tại đâu trong Web?
- Trong mã nguồn `web/src/lib/media.ts`:
  - `tiktok.com` và `douyin.com` nằm trong danh sách `platformHosts` (dòng 36-37).
  - Hàm `normalizeUrl()` kiểm tra hostname và chủ động ném lỗi:
    ```typescript
    if (platformHosts.some((platform) => host === platform || host.endsWith(`.${platform}`))) {
      throw new MediaError("unsupported", UNSUPPORTED_MESSAGE);
    }
    ```
- **Tuy nhiên, việc chặn này không phải nguyên nhân gốc rễ, mà là cơ chế bảo vệ hợp lý để tránh lỗi không thể khắc phục trên trình duyệt.**
- Nguyên nhân cốt lõi ở tầng giao thức mạng và bảo mật trình duyệt:
  - Khi trình duyệt tại origin `https://vibeload.vercel.app` (hoặc `http://localhost:5173`) gửi `fetch()` đến `https://www.tiktok.com/...` hoặc `https://vt.tiktok.com/...`: máy chủ TikTok **không trả header `Access-Control-Allow-Origin`**.
  - Trình duyệt thực thi **Same-Origin Policy (SOP)** và chặn đứng request ngay lập tức với lỗi:
    `TypeError: Failed to fetch (CORS Error)`.
  - Nếu dùng `mode: "no-cors"`, kết quả trả về là `opaque response` (`type: "opaque"`), trong đó `response.body` bằng `null`, JavaScript hoàn toàn không thể đọc HTML để trích xuất liên kết media.

### 1.2. Engine Android lấy media bằng cách nào?
Trong `app/src/main/python/vibeload_engine.py`:
1. **Môi trường native:** Android chạy mã Python thông qua Chaquopy, sử dụng socket mạng hệ thống và thư viện `urllib` / `OkHttp`. Native runtime **không chịu sự ràng buộc của Same-Origin Policy (CORS)** của trình duyệt.
2. **Quy trình trích xuất Android:**
   - **Lớp 1:** Dùng thư viện Python `yt-dlp` nhúng cục bộ để giải mã token, player signature và trích xuất direct CDN URL.
   - **Lớp 2 (Trích xuất trực tiếp):** Khi yt-dlp gặp lỗi hoặc đối với album ảnh (`/photo/`), gọi `extract_tiktok_photos_direct()`: gửi HTTP GET trực tiếp tới TikTok kèm header giả lập mobile browser và `CookieJar`, cào mã HTML và bóc tách các khối JSON nhúng (`__UNIVERSAL_DATA_FOR_REHYDRATION__`, `SIGI_STATE`).
   - **Lớp 3 (Fallback bên thứ ba):** Nếu TikTok kích hoạt WAF/captcha chống cào, Android gọi `extract_tiktok_via_tikwm()` gửi request HTTP POST tới dịch vụ `https://www.tikwm.com/api/` để nhận URL CDN không watermark (`hdplay` hoặc `play`).
   - **Tải tệp:** Android dùng stream native (`urllib.request.urlopen`) ghi thẳng các bytes vào disk / MediaStore, không phụ thuộc trình duyệt.

### 1.3. Thành phần nào thực sự có thể chuyển sang trình duyệt?
- **Có thể và đã chuyển:**
  - Logic chuẩn hóa URL và làm sạch tên tệp an toàn (sanitize filename).
  - Tải stream theo chunks, đo lường tiến trình từ bytes thực tế nhận được.
  - Hủy tải tức thì bằng `AbortController`.
  - Quản lý Blob RAM, giải phóng Object URL, xuất tệp bằng `showSaveFilePicker` hoặc thẻ `<a>` download fallback.
  - Kiểm tra chữ ký magic bytes nhị phân (PNG, JPEG, WebP, MP4, WebM, MP3, WAV) để từ chối HTML/JSON giả mạo.
- **Không thể chuyển sang kiến trúc Vercel-only tĩnh:**
  - `yt-dlp` và engine Python: Yêu cầu Python runtime đầy đủ và các lệnh socket native.
  - Bộ cào HTML trực tiếp từ client: Bị chặn bởi Same-Origin Policy (CORS) của TikTok.
  - Cơ chế bypass chống bot (WAF, Akamai, Arkose Labs) của TikTok.

### 1.4. Bộ kiểm thử hiện tại đã xác minh điều gì?
- **85/85 unit tests** (Vitest): Kiểm tra logic URL validation, cấu trúc chữ ký tệp, stream cap, semantics lưu và storage.
- **24 tests local + 6 tests live** (Playwright Chromium):
  - Xác nhận liên kết `tiktok.com` và `youtube.com` bị từ chối an toàn với thông báo chưa hỗ trợ và hiển thị liên kết mở nội dung gốc.
  - Tải thành công video/audio/ảnh từ các nguồn trực tiếp có CORS hợp lệ (fixtures và MDN CC0).
  - **Khẳng định:** Bộ kiểm thử hiện tại không chứa bất kỳ ca kiểm thử nào tuyên bố đã tải được video TikTok.

---

## 2. Bằng chứng thực nghiệm (Empirical Verification)

### Thử nghiệm 1: Gửi Fetch từ môi trường trình duyệt Chromium thật
Thực hiện chạy mã JavaScript trong bối cảnh Chromium headless:
```javascript
// Test 1: Fetch trang web TikTok
try {
  await fetch('https://www.tiktok.com/@tiktok/video/7106594312292453678');
} catch (e) {
  console.log(e.name + ': ' + e.message); // TypeError: Failed to fetch
}

// Test 2: Fetch TikTok oEmbed API chính thức
const res = await fetch('https://www.tiktok.com/oembed?url=https://www.tiktok.com/@tiktok/video/7106594312292453678');
const data = await res.json();
```
**Kết quả ghi nhận:**
1. Trang TikTok (`https://www.tiktok.com/...`): Lỗi `TypeError: Failed to fetch` (CORS Error). Header HTTP phản hồi không có `Access-Control-Allow-Origin`.
2. Shortlink TikTok (`https://vt.tiktok.com/...`): Trả về HTTP 301 Redirect và cũng không có CORS header. Trình duyệt chặn ngay tại chuyển hướng.
3. TikTok oEmbed API (`https://www.tiktok.com/oembed`):
   - Có trả về `Access-Control-Allow-Origin: *`.
   - **Nhưng nội dung chỉ là:**
     ```json
     {
       "version": "1.0",
       "type": "video",
       "width": "325",
       "height": "578",
       "html": "<iframe height=\"578\" width=\"325\" src=\"https://www.tiktok.com/player/v1/7106594312292453678?embed_from=oembed...\" ...></iframe>",
       "provider_name": "TikTok",
       "embed_product_id": "7106594312292453678"
     }
     ```
   - **Không chứa bất kỳ URL tệp video `.mp4` hoặc audio nào.**
   - Khung `<iframe>` tải player web nhúng của TikTok, được cô lập bởi chính sách Cross-Origin Frame; script của trang web không thể thâm nhập DOM iframe để lấy stream video.

---

## 3. Kết luận về tính khả thi trên Vercel-only

**Kết luận:** Dưới kiến trúc **Vercel-only (Frontend tĩnh trên Vercel Hobby, không có máy chủ backend, không dùng proxy/scraper vi phạm chính sách Vercel, không gửi dữ liệu tới dịch vụ bên thứ ba lạ)**, việc **dán liên kết trang TikTok rồi tải được tệp video thực tế là KHÔNG KHẢ THI**.

### Lý do kỹ thuật và pháp lý/chính sách:
1. **CORS trên trình duyệt:** Trình duyệt web không thể bypass CORS của TikTok nếu không có máy chủ trung gian hoặc extension.
2. **TikTok không có API công khai tải media:** API nhà phát triển chính thức của TikTok (Display API) yêu cầu người dùng đăng nhập OAuth 2.0 và chỉ cho phép truy cập video của chính chủ tài khoản, không cho phép công chúng dán URL bất kỳ để tải file.
3. **Giới hạn và Chính sách Vercel Fair Use:**
   - [Vercel Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines): Nghiêm cấm rõ ràng việc vận hành **Proxy/VPN** và **Scraper** trên Vercel.
   - [Vercel Serverless Function Limits](https://vercel.com/docs/functions/limitations): Giới hạn kích thước payload request/response body là **4.5 MB**. Video TikTok thông thường từ 10 MB đến 60 MB, sẽ bị lỗi HTTP 413 Payload Too Large nếu truyền tải qua Function.
   - Dải IP Datacenter của Vercel (AWS/GCP) bị hệ thống WAF/chống bot của TikTok (Akamai Bot Manager, Arkose Labs) tự động chặn hoặc trả trang thử thách CAPTCHA.
4. **Ràng buộc an toàn dữ liệu:** Không được tùy tiện gửi liên kết của người dùng sang các API không chính thức (như TikWM) vì không đảm bảo quyền riêng tư, rủi ro bảo mật và không có cam kết SLA.

---

## 4. Các phương án khả thi để đạt mục tiêu (Cần người dùng phê duyệt trước khi triển khai)

Nếu muốn đạt được mục tiêu tải video từ liên kết trang TikTok, cần thay đổi một số ràng buộc ban đầu. Dưới đây là 3 phương án cụ thể:

### Phương án 1: Trình duyệt Companion Extension (Khuyến nghị cho giải pháp 0đ, không cần server)
- **Ràng buộc thay đổi:** Người dùng cài thêm một tiện ích mở rộng trình duyệt (VibeLoad Web Extension) trên Chrome/Edge/Firefox.
- **Thành phần bổ sung:** Mã nguồn extension nhỏ (manifest v3) nằm trong thư mục `web/extension/`.
- **Cơ chế hoạt động:**
  - Extension có quyền truy cập host (`*://*.tiktok.com/*`) nên **không bị hạn chế bởi CORS**.
  - Khi người dùng mở trang TikTok hoặc dán URL vào VibeLoad Web, extension tự động trích xuất stream URL gốc hoặc nạp cookie phiên hợp lệ của người dùng để tải tệp.
- **Chi phí & Quota:** **0 VNĐ**, không tốn chi phí hạ tầng, không phụ thuộc quota máy chủ.
- **Dữ liệu gửi ra ngoài:** **Không có**. Dữ liệu chỉ lưu chuyển giữa máy người dùng và máy chủ TikTok.
- **Rủi ro:** Không hoạt động trên các trình duyệt di động không hỗ trợ extension (như Safari iOS hoặc Chrome Android mặc định).

### Phương án 2: Máy chủ Backend riêng biệt (Dedicated Worker/Self-hosted API)
- **Ràng buộc thay đổi:** Cho phép bổ sung một backend bên ngoài Vercel (ví dụ VPS Linux nhỏ hoặc Docker container).
- **Thành phần bổ sung:** Dịch vụ backend viết bằng Node.js hoặc Python (chạy `yt-dlp` cập nhật thường xuyên).
- **Chi phí & Quota:**
  - VPS cá nhân (Hetzner, OVH, DigitalOcean, v.v.): khoảng $4 - $6 / tháng.
  - Cần xoay vòng User-Agent hoặc IP dân cư (residential proxy) nếu TikTok kích hoạt chặn IP datacenter.
- **Dữ liệu gửi ra ngoài:** URL TikTok người dùng yêu cầu được gửi tới backend riêng này để bóc tách.
- **Rủi ro:** Chi phí duy trì; TikTok liên tục thay đổi cấu trúc mã chống cào, đòi hỏi cập nhật engine định kỳ.

### Phương án 3: Tích hợp API bên thứ ba được ủy quyền / thương mại
- **Ràng buộc thay đổi:** Cho phép VibeLoad Web gọi API trích xuất media bên ngoài.
- **Thành phần bổ sung:** Tích hợp client gọi API trích xuất (ví dụ qua RapidAPI TikTok Scraper uy tín hoặc dịch vụ trích xuất chuyên dụng).
- **Chi phí & Quota:**
  - Bản miễn phí thường giới hạn 50 - 100 lượt/ngày.
  - Bản trả phí: $10 - $30 / tháng.
- **Dữ liệu gửi ra ngoài:** URL trang TikTok được gửi sang máy chủ dịch vụ bên thứ ba.
- **Rủi ro:** Phụ thuộc vào độ ổn định của nhà cung cấp dịch vụ; rủi ro dịch vụ bị TikTok khởi kiện hoặc chấm dứt hoạt động bất ngờ.
