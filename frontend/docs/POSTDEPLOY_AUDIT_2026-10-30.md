# VibeLoad Web — kiểm tra sau triển khai, 30/10/2026

**Cập nhật 31/10:** người dùng đã cung cấp Runtime Logs xác nhận ETA SoundCloud và xác minh bot YouTube, cùng kết quả Android thật. Xem [báo cáo xác minh mới nhất](ETA_YOUTUBE_CONFIRMATION_2026-10-31.md). Các mục chưa xác định/chưa kiểm thử trong báo cáo bên dưới phản ánh thời điểm audit ban đầu.

Phạm vi: hai dịch vụ hiện có. **Không push, không deploy bản sửa mới, không đổi gói/billing.** Các kết quả production bên dưới thuộc bản đã triển khai ở lượt trước; sửa đổi mới chỉ có trong workspace.

## Trạng thái từng nền tảng

“Đạt” trong bảng là kết quả mẫu được ghi rõ, không phải cam kết mọi URL của nền tảng. Kết quả thiết bị thật được tách riêng.

| Nền tảng/hạng mục | Trạng thái production | Bằng chứng và giới hạn |
| --- | --- | --- |
| YouTube | **Không đạt** | Analyze 403 `ACCESS_DENIED`; không có file mới. Chưa có Runtime Logs Render để xác định chính xác xác thực hay hạn chế IP. |
| Facebook | **Không đạt** | Metadata độ phân giải sai: API SD=480p nhưng ffprobe đo 400×224. Tải, codec và phát file **Đạt**. |
| Instagram | **Không đạt** | Hai lần analyze mẫu trả 502 `MEDIA_EXTRACTION_FAILED`; không có file production để xác minh codec/phát. |
| SoundCloud | **Không đạt** | Metadata có, file MP3 hợp lệ và phát được, nhưng endpoint polling job trả 500. Đã tái hiện và sửa cục bộ. |
| TikTok video | **Đạt** | MP4 thật, có hình/tiếng, giải mã toàn file và phát trong Chromium. |
| TikTok MP3 | **Đạt** | MP3 thật, giải mã toàn file và phát trong Chromium. |
| TikTok ảnh Unicode/album ZIP | **Đạt** | Ảnh tên tiếng Việt trả 200, JPEG hợp lệ; ZIP đủ hai ảnh đúng thứ tự, CRC và ảnh bên trong hợp lệ. |
| Android qua 4G/5G | **Chưa kiểm thử** | Người dùng xác nhận có Android; chưa có kết quả thao tác lưu/phát thực tế. |
| iPhone qua 4G/5G | **Chưa kiểm thử** | Chưa có thiết bị thật/kết quả. |
| Render hồi phục sau nghỉ 17 phút | **Đạt** | Health 200 sau 22,49 giây; job/file marker cũ trả 404 trước TTL. Phù hợp với sleep/restart; nguyên nhân vòng đời cần xác nhận bằng Render logs. |

## YouTube: điều đã biết và điều chưa thể kết luận

Mẫu: `https://www.youtube.com/watch?v=jNQXAC9IVRw`.

- Production lúc **23:34:45** trả 403, request ID `d67d9875-5292-472f-8a61-b048583eabe2`. Thông báo hiện tại gom “riêng tư hoặc yêu cầu đăng nhập”, nên chưa đủ để xác định phản hồi upstream cụ thể.
- Bản yt-dlp stable mới nhất tại thời điểm audit là **2026.10.26** theo [release chính thức](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.10.26). Đã cài riêng bản này vào cache workspace để đối chiếu, không nâng cấp production. Backend từng công bố 2026.10.26 trước lần deploy gần nhất; endpoint health mới không công bố phiên bản. Chưa có build/runtime log mới để xác nhận lại phiên bản trong container hiện tại.
- Source ép client `ios/android`, tắt warnings. Dockerfile hiện không cài JavaScript runtime hoặc gói EJS. Đây là các điểm cấu hình cần đối chiếu; **chưa có bằng chứng chúng là nguyên nhân trực tiếp của 403 trên Render**.
- Đối chiếu local với yt-dlp 2026.10.26: cấu hình client `ios/android` trả metadata và một format; có warning missing URLs/SABR. Mặc định thư viện trả `LOGIN_REQUIRED` và “Sign in to confirm you’re not a bot”, cùng cảnh báo không có JS runtime. Hai lượt chỉ so sánh lựa chọn client, không phải phép thử cùng toàn bộ headers/network/IP với Render. Không dùng kết quả này để kết luận chắc chắn Render bị chặn IP.
- [Tài liệu yt-dlp](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#youtube) mô tả giới hạn client/PO token; [hướng dẫn EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS) mô tả runtime cho player JavaScript. Không tự triển khai thay đổi runtime/client vì chưa chứng minh được nó giải quyết lỗi hiện tại.
- Không dùng mật khẩu/cookie người dùng, không đổi proxy/IP, không giải CAPTCHA, không tải nội dung DRM. Sau phản hồi yêu cầu xác thực trong phép đối chiếu local, không tiếp tục thử các cách vượt yêu cầu đó.

**Kết nối log:** người dùng xác nhận đã kết nối Render; công cụ quản lý plugin xác nhận `installed:true`. Tuy nhiên nhóm công cụ đọc Render logs chưa được cấp vào phiên đang chạy. Không yêu cầu kết nối lại. Cần cập nhật công cụ của phiên hoặc người dùng cung cấp đúng log cho request ID ở trên để chốt nguyên nhân upstream.

Log local:

- [Client đang cấu hình](../.qa/postdeploy-audit/youtube-local-deployed-clients-2026.10.26.json)
- [Mặc định thư viện](../.qa/postdeploy-audit/youtube-local-official-defaults-2026.10.26.json)
- [Phản hồi production](../.qa/postdeploy-audit/youtube.json)

## File thật và kết quả phát

| Mẫu production | File | Byte | Codec/thông tin đo được | Kết quả |
| --- | --- | ---: | --- | --- |
| Facebook `watch/?v=10153231379946729` | [facebook.mp4](../.qa/postdeploy-audit/facebook.mp4) | 1.180.614 | MP4, H.264 400×224 + AAC 48 kHz stereo; khoảng 74,31 giây | Giải mã toàn bộ và Chromium phát được; metadata 480p sai |
| SoundCloud `nocopyrightsounds/sace-caramel-ncs-release` | [soundcloud-recovered.mp3](../.qa/postdeploy-audit/soundcloud-recovered.mp3) | 4.788.179 | MP3 44,1 kHz stereo; khoảng 199,4 giây | Giải mã toàn bộ và Chromium phát được; polling 500 |
| TikTok `@kn10hd/video/7697035038751231240` | [tiktok.mp4](../.qa/postdeploy-audit/tiktok.mp4) | 2.786.173 | MP4, H.264 768×576 + AAC | Giải mã toàn bộ và Chromium phát được |
| TikTok cùng bài → MP3 | [tiktok-mp3.mp3](../.qa/postdeploy-audit/tiktok-mp3.mp3) | 1.292.163 | MP3 44,1 kHz stereo | Giải mã toàn bộ và Chromium phát được |
| TikTok `@hullcity/photo/7553302113757990166` | [album.zip](../.qa/postdeploy-audit/album.zip) | 275.793 | Hai JPEG theo đúng thứ tự | CRC và ảnh hợp lệ |
| Ảnh đầu album, tên `TikTok Ảnh_01.jpg` | [unicode-photo.jpg](../.qa/postdeploy-audit/unicode-photo.jpg) | 87.345 | JPEG; `filename*=utf-8''...` | HTTP 200, ảnh hợp lệ |

SHA-256, ffprobe đầy đủ, metadata, timestamps, HTTP statuses và request IDs nằm trong [thư mục bằng chứng](../.qa/postdeploy-audit/). Kết quả giải mã dùng toàn bộ file, không chỉ đếm stream. Test phát trình duyệt dùng đúng file production lưu trên đĩa, kiểm tra `play()`, `currentTime > 0.1`, không có `media.error`. Âm thanh bị mute trong test tự động; chưa kiểm tra bằng loa trên điện thoại.

**Instagram:** mẫu `https://www.instagram.com/p/DZN3mhZBQ_Q/` trả 502 lúc 23:34 và 23:39. Request ID lần sau `7f4bd026-6681-41a8-949d-3cc181745f73`. [Log API](../.qa/postdeploy-audit/instagram.json). Chưa kết luận bài bị xóa, yêu cầu login hay IP bị hạn chế khi chưa có extractor log Render.

## SoundCloud: lỗi mới được tái hiện và sửa cục bộ

Production tạo job `3284d885-e424-4680-ad43-687997adabc3`, polling bắt đầu trả 500 với request ID `cc1cf628-18b2-4ce4-a89f-d312351ba5a2`. Endpoint file của chính job này vẫn trả 200 và MP3 hợp lệ. Vì giao diện phụ thuộc polling, toàn luồng production vẫn **Không đạt**.

Tải thật cục bộ với yt-dlp 2026.10.26 ghi nhận:

```text
total_bytes_estimate = 2708966.666666667
DownloadJobResponse.total_bytes: int
ValidationError: int_from_float
```

[Bằng chứng tái hiện](../.qa/postdeploy-audit/soundcloud-local-reproduction.json). Đây là nguyên nhân đã chứng minh được từ source và progress thực, phù hợp với triệu chứng production; chưa đối chiếu traceback Render của chính request 500.

Bản sửa chuẩn hóa byte/ETA sang số nguyên không âm, loại NaN/Infinity, khóa snapshot trạng thái job và cập nhật số byte cuối theo kích thước file thật. Sau sửa, [kiểm thử server local thật](../.qa/postdeploy-audit/soundcloud-fixed-local.json) tải MP3 4.788.179 byte, **81 lượt poll đều thành công**, giải mã toàn bộ không lỗi. Chưa deploy nên không đổi trạng thái SoundCloud production thành Đạt.

## Ổn định, regression và PWA

- Production: hủy job, chặn tải file chưa hoàn tất (409), URL SSRF/credentials (400/403), job ID sai (400), CORS origin hợp lệ/không hợp lệ đều đạt. [Log](../.qa/postdeploy-audit/regression.json).
- Lượt đầu, tác vụ SoundCloud chưa hoàn tất chiếm slot download duy nhất; các lượt TikTok đồng thời nhận 429. Đã lưu riêng [log lượt đầu](../.qa/postdeploy-audit/first-pass/) và thử lại sau khi slot trống: TikTok video/MP3/ZIP đều đạt. Không coi 429 lúc máy bận là extractor TikTok bị hỏng.
- Local: khởi động một tiến trình Uvicorn thật, tạo fixture lifecycle, dừng và khởi động lại. Job hoàn tất và job đang tải không còn trong registry, status/file đều 404. Fixture không được tính là bằng chứng tải media thật. Bản frontend mới giải thích mất job và hướng dẫn phân tích/tải lại.
- Local: health retry được giới hạn đúng 90 giây; hủy được lúc chờ. Status GET retry tối đa hai lần với backoff khi lỗi mạng/tạm thời; không tự lặp POST tạo download và không retry lỗi xác thực.
- **52 test backend**, **96 test frontend**, TypeScript và build/PWA verification đều qua.
- Regression Chromium: **28 qua, 6 bỏ qua** (các test live MDN/CSP tùy chọn không bật). PWA manifest, offline deep routes, cache chỉ chứa app shell, không cache media đều qua. Sau đó **10 test bổ sung qua** cho mất job và phát file production. Các lượt mobile Chromium đều là giả lập, không tính Android/iPhone thật.
- Tabbit vẫn báo `CLI_REGISTRATION_UNAVAILABLE`; không dùng kết quả suite headless để tuyên bố đã thao tác trên trình duyệt Tabbit hay điện thoại thật.

## Source đã chuẩn bị, chưa triển khai

- `backend/app/workers/jobs.py`: sửa lỗi số thập phân/NaN trong progress, snapshot đồng bộ và kích thước file hoàn tất.
- `backend/app/services/extractor_diagnostics.py`, `errors.py`, `extractors/ytdlp_extractor.py`, `main.py`, `services/downloader.py`: phân loại lý do upstream, log có phiên bản yt-dlp/request ID và che URL query/header nhạy cảm; giữ cấu hình client hiện tại; dừng fallback khi bị từ chối truy cập/xác thực.
- `backend/app/extractors/ytdlp_extractor.py`: bỏ giả định SD=480p/HD=720p khi nguồn không cung cấp kích thước. Không tự suy ra codec khi không có dữ liệu.
- `src/lib/api.ts`: lỗi có status/code/retryable; thông báo job mất sau restart; timeout/backoff hữu hạn.
- `src/App.tsx`: sửa link nội dung gốc cho nguồn chưa hỗ trợ và các nhãn Vercel-only còn sót để mô tả đúng việc dùng máy chủ phân tích.
- Thêm test regression và script audit; Dockerfile/requirements/gói dịch vụ không đổi trong lượt này.

## Điện thoại thật và bước tiếp theo

Người dùng có Android. Thực hiện [checklist thiết bị thật](REAL_DEVICE_CHECKLIST.md) sau khi cold-start probe hoàn tất, với Wi-Fi tắt và dùng 4G/5G. Cần kết quả file thực trong Downloads/Tệp và phát bằng trình phát của máy, không chỉ thông báo “đã gửi yêu cầu lưu”. Chưa có iPhone để kiểm thử.

Trước khi deploy bản sửa mới, cần người dùng cho phép. Việc đọc Render logs và kiểm thử tiếp không đòi hỏi nâng gói hoặc dịch vụ mới.

## Kết quả cold start

Phép đo bắt đầu **23:40:19**, không gửi request từ agent trong **17 phút**. Request health đầu gửi khoảng **23:57:19**, nhận 200 lúc **23:57:42**, mất **22,49 giây**. Request ID `817eac21-e9eb-4b26-862e-efd6655720cb`; CORS vẫn đúng origin.

Ngay sau đó, job marker `2ec28e6e-81c0-4152-9189-e9c798f4479d` và endpoint file đều trả 404. Job được tạo lúc 23:38, mới khoảng 19 phút, chưa đến TTL 30 phút. Đây là bằng chứng registry cũ không còn và file không thể được truy xuất qua API sau khoảng nghỉ, phù hợp với service ngủ/restart. Chưa có Render runtime logs để loại trừ một restart vì nguyên nhân khác; không khẳng định đã quan sát trực tiếp filesystem vật lý bị xóa.

Kết luận: **Đạt** khả năng hồi phục API trong lần đo này; không có cam kết lưu job/file qua restart. Việc frontend mới giải thích và yêu cầu phân tích/tải lại đã qua unit test và UI test local, chưa deploy và chưa xác minh tình huống này trên Android thật.

[Log cold start đầy đủ](../.qa/postdeploy-audit/cold-start.json). Sau phép đo đã thông báo người dùng có thể bắt đầu kiểm thử Android qua mạng di động.
