# VibeLoad Media Backend Service

Backend Python FastAPI chuyên dụng cho VibeLoad Web, thực hiện phân tích và trích xuất phương tiện từ **TikTok, YouTube, Facebook, Instagram và SoundCloud**, xử lý âm thanh/video bằng **FFmpeg/FFprobe** và đóng gói album ảnh ZIP.

---

## 1. Kiến trúc hệ thống

```text
Trình duyệt người dùng (PWA / Vercel)
         │
         ├─── (1) Tải direct media URLs (CORS cho phép) ───> Máy chủ nguồn
         │
         └─── (2) Phân tích & Tải TikTok / YouTube / FB / IG / SC
                     │
                     ▼
       VibeLoad Media Backend (FastAPI + yt-dlp + FFmpeg)
                     │
                     ├── Phân tích metadata (Title, Thumb, Formats)
                     ├── Hàng đợi Download Job (Tracking %, Bytes, Speed, ETA)
                     ├── Ghép luồng Video + Audio (H264 + AAC)
                     ├── Chuyển đổi MP3 chuẩn (128 - 320 kbps)
                     ├── Đóng gói Album ảnh TikTok/Instagram thành ZIP
                     ├── Xác minh stream bằng ffprobe
                     └── Dọn dẹp tệp tạm tự động theo TTL (30 phút)
```

---

## 2. Yêu cầu hệ thống

- Python 3.10+ (đã kiểm thử trên Python 3.11, 3.12, 3.14).
- FFmpeg & FFprobe có sẵn trong PATH hệ thống.

---

## 3. Chạy cục bộ (Local Development)

```powershell
cd web/backend

# Tạo môi trường ảo (tùy chọn)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Cài đặt thư viện
pip install -r requirements.txt

# Chạy test
pytest

# Khởi chạy server FastAPI
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs Swagger: `http://localhost:8000/docs`  
Health check: `http://localhost:8000/api/health`

---

## 4. Chạy bằng Docker

```bash
cd web/backend

# Build image (hỗ trợ cả AMD64 và ARM64)
docker build -t vibeload-backend .

# Chạy container
docker run -d -p 8000:8000 --name vibeload-backend \
  -e CORS_ORIGINS='["https://vibeload-web.vercel.app","http://localhost:5173"]' \
  vibeload-backend
```

---

## 5. Đánh giá các phương án Hosting triển khai

| Nền tảng | Hạn mức & Chi phí | Đánh giá tính phù hợp với VibeLoad |
|---|---|---|
| **Hugging Face Spaces (Docker)** | **Miễn phí** (2 vCPU, 16 GB RAM, 50 GB disk) | **Khuyến nghị cao nhất cho 0đ**. Dung lượng RAM và CPU rất lớn, chạy mượt FFmpeg và yt-dlp. Hỗ trợ HTTPS tự động. Không bị giới hạn 512 MB như Render. |
| **Koyeb** | **Miễn phí** (1 Nano service, 512 MB RAM, 0.1 vCPU) | Phù hợp trích xuất link, nhưng RAM 512 MB có thể bị quá tải khi ghép video 1080p/4K nặng. |
| **Render.com** | **Miễn phí** (512 MB RAM, tự động ngủ sau 15 phút) | Khởi động lại (cold start) mất 40-50s sau khi ngủ. Dung lượng đĩa tạm bị giới hạn. |
| **Railway.app** | Tặng $5 credit dùng thử, sau đó tính theo tài nguyên thực tế (~$3 - $5/tháng) | Rất nhanh, ổn định, hỗ trợ Dockerfile tự động từ Git. |
| **Oracle Cloud Always Free** | **Miễn phí vĩnh viễn** (Lên tới 4 OCPU ARM64, 24 GB RAM, 200 GB SSD) | Lựa chọn tự host mạnh nhất nếu người dùng có thẻ thanh toán quốc tế để xác minh tài khoản. |
| **VPS Linux (Hetzner / OVH)** | ~$4 / tháng | Toàn quyền kiểm soát, băng thông không giới hạn, không lo bị chặn hoặc giới hạn thời gian chạy. |

---

## 6. Kết nối Frontend Vercel với Backend

Trong cài đặt project Vercel (`vibeload-web`):
1. Vào **Settings → Environment Variables**.
2. Thêm biến:
   - `VITE_API_URL` = `https://<ten-backend-cua-ban>.domain.com`
3. Nhấn **Redeploy**. Frontend sẽ tự động chuyển các yêu cầu phân tích mạng xã hội sang backend này.
