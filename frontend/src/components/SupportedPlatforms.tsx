import { useState } from "react";
import {
  TikTokIcon,
  YouTubeIcon,
  SoundCloudIcon,
  InstagramIcon,
  FacebookIcon,
  ThreadsIcon,
  PinterestIcon,
  RedditIcon,
} from "./BrandIcons";
import {
  CheckCircle2,
  Download,
  FolderArchive,
  Music,
  Video,
  Layers,
  ArrowRight,
} from "lucide-react";

export interface PlatformItem {
  id: string;
  name: string;
  category: string;
  tag: string;
  color: string;
  bgGlow: string;
  borderColor: string;
  icon: typeof TikTokIcon;
  capabilities: { icon: typeof Video; text: string }[];
  description: string;
  exampleUrl: string;
}

export const PLATFORMS: PlatformItem[] = [
  {
    id: "tiktok",
    name: "TikTok",
    category: "Video ngắn & Album ảnh",
    tag: "Không Logo Watermark",
    color: "#25F4EE",
    bgGlow: "rgba(37, 244, 238, 0.08)",
    borderColor: "rgba(37, 244, 238, 0.25)",
    icon: TikTokIcon,
    capabilities: [
      { icon: Video, text: "Video Full HD sạch không dính logo" },
      { icon: FolderArchive, text: "Tải trọn bộ Album ảnh (.ZIP 1 lần bấm)" },
      { icon: Music, text: "Trích xuất nhạc nền gốc MP3" },
    ],
    description: "Hỗ trợ link tiktok.com, vt.tiktok.com và douyin. Tự động nhận diện video hoặc album ảnh rời.",
    exampleUrl: "https://www.tiktok.com/@tiktok/video/...",
  },
  {
    id: "youtube",
    name: "YouTube",
    category: "Video & Nhạc",
    tag: "Full HD / 4K & MP3",
    color: "#FF0000",
    bgGlow: "rgba(255, 0, 0, 0.08)",
    borderColor: "rgba(255, 0, 0, 0.25)",
    icon: YouTubeIcon,
    capabilities: [
      { icon: Video, text: "Video Full HD / 2K / 4K 60fps" },
      { icon: Music, text: "Chuyển đổi âm thanh MP3 192k/320k" },
      { icon: Video, text: "Hỗ trợ trọn vẹn YouTube Shorts & youtu.be" },
    ],
    description: "Giải mã trực tiếp luồng stream chất lượng cao nhất, tối ưu máy chủ không lo dính chặn bot.",
    exampleUrl: "https://youtu.be/...",
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    category: "Âm nhạc chất lượng cao",
    tag: "MP3 Siêu Tốc",
    color: "#FF5500",
    bgGlow: "rgba(255, 85, 0, 0.08)",
    borderColor: "rgba(255, 85, 0, 0.25)",
    icon: SoundCloudIcon,
    capabilities: [
      { icon: Music, text: "Tải bài hát chuẩn MP3 bitrate cao" },
      { icon: CheckCircle2, text: "Hỗ trợ link rút gọn mobile on.soundcloud.com" },
      { icon: Layers, text: "Giữ trọn thông tin nghệ sĩ & ảnh bìa" },
    ],
    description: "Hỗ trợ link web soundcloud.com và link chia sẻ từ điện thoại. Xử lý chuyển đổi MP3 cực nhanh.",
    exampleUrl: "https://on.soundcloud.com/...",
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "Reels & Hình ảnh",
    tag: "Reels & Carousels",
    color: "#E1306C",
    bgGlow: "rgba(225, 48, 108, 0.08)",
    borderColor: "rgba(225, 48, 108, 0.25)",
    icon: InstagramIcon,
    capabilities: [
      { icon: Video, text: "Tải Instagram Reels độ nét cao" },
      { icon: FolderArchive, text: "Bài đăng nhiều ảnh (Carousel)" },
      { icon: Video, text: "Video bài viết & Story công khai" },
    ],
    description: "Lưu trữ video Reels và bài đăng hình ảnh nguyên gốc không bị giảm chất lượng nén.",
    exampleUrl: "https://www.instagram.com/reel/...",
  },
  {
    id: "facebook",
    name: "Facebook",
    category: "Reels & Watch Video",
    tag: "SD & HD Đa định dạng",
    color: "#1877F2",
    bgGlow: "rgba(24, 119, 242, 0.08)",
    borderColor: "rgba(24, 119, 242, 0.25)",
    icon: FacebookIcon,
    capabilities: [
      { icon: Video, text: "Facebook Reels & fb.watch di động" },
      { icon: CheckCircle2, text: "Video công khai chất lượng HD sắc nét" },
      { icon: Music, text: "Trích xuất MP3 nhanh chóng" },
    ],
    description: "Hỗ trợ facebook.com/share/, fb.watch và liên kết video bài đăng công khai trên Facebook.",
    exampleUrl: "https://fb.watch/...",
  },
  {
    id: "threads",
    name: "Threads & Tệp Trực tiếp",
    category: "Mạng xã hội & Direct Link",
    tag: "MP4 / MP3 / Direct",
    color: "#8B5CF6",
    bgGlow: "rgba(139, 92, 246, 0.08)",
    borderColor: "rgba(139, 92, 246, 0.25)",
    icon: ThreadsIcon,
    capabilities: [
      { icon: Video, text: "Tải video & ảnh đính kèm từ Threads" },
      { icon: Download, text: "Tải trực tiếp mọi URL MP4, MP3, JPG, PNG" },
      { icon: CheckCircle2, text: "Bảo toàn dữ liệu gốc, không nén lại" },
    ],
    description: "Bên cạnh các mạng xã hội, VibeLoad có thể tải trực tiếp bất kỳ tệp media nào từ Internet.",
    exampleUrl: "https://www.threads.net/...",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    category: "Video & Ý tưởng hình ảnh",
    tag: "Video HD & Ảnh Gốc",
    color: "#E60023",
    bgGlow: "rgba(230, 0, 35, 0.08)",
    borderColor: "rgba(230, 0, 35, 0.25)",
    icon: PinterestIcon,
    capabilities: [
      { icon: Video, text: "Tải video Pinterest 1080p sắc nét" },
      { icon: Download, text: "Hỗ trợ link rút gọn pin.it" },
      { icon: CheckCircle2, text: "Bảo toàn độ phân giải ảnh gốc" },
    ],
    description: "Lưu trữ video và hình ảnh ý tưởng từ Pinterest nhanh chóng và giữ trọn độ nét cao.",
    exampleUrl: "https://pin.it/...",
  },
  {
    id: "reddit",
    name: "Reddit",
    category: "Video & GIF cộng đồng",
    tag: "Audio + Video Ghép Sẵn",
    color: "#FF4500",
    bgGlow: "rgba(255, 69, 0, 0.08)",
    borderColor: "rgba(255, 69, 0, 0.25)",
    icon: RedditIcon,
    capabilities: [
      { icon: Video, text: "Tự động ghép tiếng và hình video v.redd.it" },
      { icon: CheckCircle2, text: "Tải ảnh và ảnh động GIF" },
      { icon: Download, text: "Hỗ trợ link reddit.com & redd.it" },
    ],
    description: "Giải quyết triệt để vấn đề video Reddit tải về bị mất tiếng nhờ bộ ghép luồng tự động.",
    exampleUrl: "https://reddit.com/r/...",
  },
];

interface SupportedPlatformsProps {
  onSelectPlatform?: (platform: PlatformItem) => void;
}

export function SupportedPlatforms({ onSelectPlatform }: SupportedPlatformsProps) {
  const [activePlatform, setActivePlatform] = useState<string | null>(null);

  return (
    <section className="supported-platforms-section" aria-labelledby="platforms-heading">
      <div className="section-header-animated">
        <div className="header-badge-pulse">
          <span className="pulse-dot"></span>
          <span>HỖ TRỢ ĐA NỀN TẢNG</span>
        </div>
        <h2 id="platforms-heading" className="animated-gradient-title">
          VibeLoad Tải Được Những Gì?
        </h2>
        <p className="section-subtitle">
          Một công cụ duy nhất cho tất cả nhu cầu lưu trữ video, âm nhạc và album ảnh từ các nền tảng phổ biến nhất hiện nay.
        </p>
      </div>

      <div className="platform-grid-animated">
        {PLATFORMS.map((platform) => {
          const Icon = platform.icon;
          const isSelected = activePlatform === platform.id;

          return (
            <div
              key={platform.id}
              className={`platform-card-animated ${isSelected ? "is-active" : ""}`}
              style={{
                "--platform-glow": platform.bgGlow,
                "--platform-border": platform.borderColor,
                "--platform-color": platform.color,
              } as React.CSSProperties}
              onClick={() => {
                setActivePlatform(platform.id);
                onSelectPlatform?.(platform);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setActivePlatform(platform.id);
                  onSelectPlatform?.(platform);
                }
              }}
            >
              <div className="platform-card-glow-bg" />
              
              <div className="platform-card-top">
                <div className="platform-icon-wrap" style={{ color: platform.color }}>
                  <Icon size={30} />
                </div>
                <div className="platform-header-text">
                  <div className="platform-title-row">
                    <h3 className="platform-name">{platform.name}</h3>
                    <span className="platform-tag-badge">{platform.tag}</span>
                  </div>
                  <span className="platform-category">{platform.category}</span>
                </div>
              </div>

              <div className="platform-capabilities-list">
                {platform.capabilities.map((cap, i) => {
                  const CapIcon = cap.icon;
                  return (
                    <div key={i} className="platform-cap-item">
                      <span className="cap-icon-bullet">
                        <CapIcon size={14} />
                      </span>
                      <span>{cap.text}</span>
                    </div>
                  );
                })}
              </div>

              <div className="platform-card-footer">
                <p className="platform-desc-text">{platform.description}</p>
                <div className="platform-action-hint">
                  <span>Dán link để tải</span>
                  <ArrowRight size={14} className="hint-arrow" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PlatformQuickChips({ onSelect }: { onSelect?: (platformName: string) => void }) {
  return (
    <div className="quick-platform-chips-container" aria-label="Nền tảng hỗ trợ nhanh">
      <span className="chips-lead-label">Hỗ trợ:</span>
      <div className="quick-chips-scroll">
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              type="button"
              className="quick-chip-button"
              style={{ "--chip-color": p.color } as React.CSSProperties}
              onClick={() => onSelect?.(p.name)}
              title={`Hỗ trợ tải từ ${p.name}`}
            >
              <span className="chip-icon-box">
                <Icon size={15} />
              </span>
              <span className="chip-name">{p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
