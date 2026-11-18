# Đối chiếu mã Android và VibeLoad Web

Đối chiếu ngày **30/10/2026** trước khi triển khai Web. Việc đọc source nhằm xác định giao diện, luồng nghiệp vụ và phần nào phù hợp với trình duyệt. Source Android, cấu hình Gradle, Python engine và quy trình phát hành Android được giữ nguyên; chỉ thêm mã trong `web/`.

## Cấu trúc Android hiện có

| Khu vực | Vai trò trong source |
|---|---|
| `app/src/main/java/com/vibeload/app/presentation/` | Jetpack Compose Material 3, màn hình, navigation, theme và ViewModel. |
| `app/src/main/java/com/vibeload/app/domain/` | Metadata, format, task, trạng thái tải và interface repository/engine. |
| `app/src/main/java/com/vibeload/app/data/` | Room history, thiết lập, MediaStore và triển khai repository. |
| `app/src/main/java/com/vibeload/app/platform/` | Engine Chaquopy, xử lý FFmpeg, ảnh, foreground service, coordinator và cập nhật APK. |
| `app/src/main/python/` | Logic Python tích hợp cho phân tích/tải nguồn media trên Android. |
| `app/src/test/`, `app/src/androidTest/` | Kiểm thử nghiệp vụ và kiểm tra tích hợp Android. |
| `docs/`, `scripts/`, `.github/`, Gradle | Tài liệu, build và quy trình phát hành Android; không phải hạ tầng Web. |

`app/build.gradle.kts` khai báo Android minSdk 29, compile/targetSdk 35, phiên bản `1.0.11`, Kotlin/JVM 21, Compose, Chaquopy/Python 3.11, yt-dlp, FFmpegKit, Room, OkHttp và Media3. Đây là phụ thuộc Android/native; không thể chuyển nguyên bộ sang Vercel Functions hoặc browser bundle.

## Thiết kế được tái sử dụng

Màu thương hiệu lấy từ `presentation/theme/Color.kt`: xanh chính **#2563EB**, xanh phụ **#3B82F6**, cyan **#38BDF8**, tím **#7C3AED**. `HomeScreen.kt` dùng CTA gradient xanh–tím và tiêu đề gradient cyan–tím nhạt **#A78BFA**. Nền tối **#090D16**, surface **#131926**, variant **#1C2438**, border **#26324B**; nền sáng **#F8FAFC**, surface trắng, variant **#F1F5F9**, border **#E2E8F0**. `Theme.kt` dùng hai bộ Material 3 sáng/tối theo lựa chọn hoặc hệ thống.

`presentation/navigation/BottomNavItem.kt` xác định bốn mục **Trang chủ**, **Tải xuống**, **Thư viện**, **Cài đặt**. Home có tiêu đề **Tải Media**, input URL, dán/phân tích, preview và tên tệp; thư viện có tìm kiếm/lọc/sắp xếp. Web dùng cùng tên và phân cấp; bố cục thích ứng màn hình điện thoại và desktop. Logo gốc `app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` 192 px có dấu play/mũi tên trắng trên nền xanh–tím bo góc; bản sao và các kích thước PWA được tạo trong Web, không di chuyển hoặc sửa tài nguyên Android.

| Android | Ánh xạ trên Web |
|---|---|
| `HomeScreen.kt`, `HomeViewModel.kt` | Nhập/dán liên kết, kiểm tra nguồn, xem thông tin khả dụng, đặt tên tệp và bắt đầu tải. |
| `DownloadingScreen.kt`, `DownloadingViewModel.kt` | Theo dõi trạng thái và bytes thực, hủy hoặc thử lại khi phù hợp. |
| `LibraryScreen.kt`, `LibraryViewModel.kt` | Thư viện và lọc metadata; mở tệp qua lựa chọn rõ ràng của người dùng. |
| `SettingsScreen.kt`, `SettingsViewModel.kt` | Chọn theme, quản lý dữ liệu cục bộ; thêm giới hạn RAM/tệp phù hợp Web. |
| `PlayerScreen.kt` dùng Media3 | Preview bằng khả năng giải mã của `<img>`, `<audio>`, `<video>` trong trình duyệt. |

## Logic được chuyển thể

`domain/model/DownloadStatus.kt` phân biệt resolving, ready, downloading, processing, saving và các trạng thái kết thúc completed/failed/cancelled. `DownloadCoordinator.kt` điều phối một tác vụ native. Web giữ nguyên tắc chuyển trạng thái rõ ràng và chỉ báo tiến trình khi có dữ liệu đo được; không chuyển các mốc giao diện 92% processing/99% saving của coordinator Android thành phần trăm truyền dữ liệu Web, không tạo bước chuyển mã giả.

Luồng ảnh native trong `platform/image/` cung cấp nguyên tắc kiểm tra loại nội dung, nhận diện định dạng và không lưu HTML thành ảnh. Web triển khai kiểm tra phù hợp bằng Fetch/bytes cùng giới hạn dung lượng; không sử dụng OkHttp hoặc giả định có quyền network tương đương native.

`MediaStoreStorageManager.kt` và các kiểm thử sanitization cung cấp nguyên tắc làm sạch tên tệp, kiểm tra dữ liệu trước khi xuất bản và chỉ báo thành công sau thao tác có thật. Web áp dụng chuẩn hóa tên, kiểm tra tệp, hủy request; vị trí lưu và kết quả ghi cuối cùng do trình duyệt quản lý.

## Các phần không chuyển sang Web

| Thành phần Android | Quyết định Web và lý do |
|---|---|
| Chaquopy/yt-dlp, TikWM fallback và extractor nền tảng trong `vibeload_engine.py` | Không đóng gói hoặc gọi lại private API. Browser bị CORS và chính sách nguồn; Vercel Fair Use không phù hợp scraper/proxy. YouTube/TikTok báo chưa hỗ trợ tải trực tiếp. |
| Extractor album ảnh TikTok | Không mặc định `/photo/{id}` là ảnh. Chưa có phương thức browser hợp lệ và đã xác minh nên không trích xuất album. |
| FFmpegKit/native conversion | Không chuyển mã/ghép luồng. FFmpeg WASM chưa được thêm khi chưa kiểm chứng RAM/CPU trên điện thoại. |
| `DownloadForegroundService.kt` | Không mô phỏng service thường trực. Tải chỉ trong tab hiện tại, không bảo đảm chạy khi đóng tab/khóa máy. |
| `MediaStoreStorageManager.kt` | Thay bằng Blob download và File Picker; không truy cập tự động thư mục Downloads/Movies/Music. |
| Room và `HistoryRepositoryImpl.kt` | Chỉ metadata history trong localStorage, Blob trong RAM; không Cloud database. |
| Media3 | Dùng media element của trình duyệt, codec tùy thiết bị. |
| `AppUpdateManager.kt`, scripts publish APK | Không dùng cho Web. Bản Web cập nhật qua deployment và service worker; không tự gọi quy trình phát hành Android/GitHub. |

## Ranh giới nghiệm thu

Đây là phân tích source và quyết định ánh xạ, không phải chứng nhận mọi chức năng Android hiện hoạt động trên mọi nguồn. Không suy diễn từ nút tải, extractor có sẵn hoặc báo cáo Android rằng phiên bản Web đã tải được YouTube/TikTok.

Kết quả chức năng Web phải dựa trên [TEST_REPORT.md](TEST_REPORT.md). Build local không chứng minh deployment public, HTTPS production hoặc hiệu năng điện thoại thật đã đạt. Xem thêm [LIMITATIONS.md](LIMITATIONS.md) và [VERCEL.md](VERCEL.md).
