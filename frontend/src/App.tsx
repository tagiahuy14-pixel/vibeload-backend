import {

  useCallback,

  useEffect,

  useRef,

  useState,

  type FormEvent,

  type ReactNode,

} from "react";

import {

  ArrowDown,

  ArrowDownToLine,

  ArrowRight,

  ArrowUpRight,

  Check,

  CheckCheck,

  ChevronRight,

  Clipboard,

  CloudLightning,

  Download,

  ExternalLink,

  FileAudio,

  FileImage,

  FileVideo,

  FolderArchive,

  FolderOpen,

  HardDrive,

  HelpCircle,

  Home,

  Image,

  Info,

  Laptop,

  Library,

  Link,

  ListPlus,

  LoaderCircle,

  LockKeyhole,

  Monitor,

  Moon,

  Music2,

  Plus,

  QrCode,

  Scissors,

  Search,

  Settings2,

  Share2,

  ShieldCheck,

  Smartphone,

  Sparkles,

  Sun,

  Trash2,

  Upload,

  Wifi,

  WifiOff,

  X,

  type LucideIcon,

} from "lucide-react";

import { AudioTrimmerModal } from "./components/AudioTrimmerModal";

import { QRCodeModal } from "./components/QRCodeModal";

import {
  LiquidTouchSpecularLayer,
} from "./components/LiquidGlassShowcase";

import { triggerHaptic } from "./lib/haptic";

import {

  isPlatformUrl,

  checkIncompleteUrl,

  cleanTrackingParams,

  getAppDeepLink,

  normalizeUrl,

  downloadMedia,

  formatBytes,

  inspectLocalFile,

  inspectMedia,

  MediaError,

  sanitizeFileName,

  type MediaInfo,

  type MediaKind,

  type Progress,

} from "./lib/media";

import {
  analyzeWithBackend,
  BackendError,
  fetchTikTokEdge,
  fetchYouTubeOEmbed,
  getCachedAnalysis,
  getInFlightAnalysis,
  prefetchAnalysis,
  startBackendDownload,
  pollBackendJob,
  cancelBackendJob,
  getApiBaseUrl,
  getBackendFileUrl,
  getBackendPhotoDownloadUrl,
  waitForBackend,
  type BackendAnalyzeResponse,
} from "./lib/api";

import {

  defaults,

  readHistory,

  readSettings,

  writeHistory,

  writeSettings,

  type HistoryItem,

  type Settings,

  type Theme,

} from "./lib/storage";

import { canNativeShareBlob, saveBlob, shareBlobNative } from "./lib/save";

import { usePwa } from "./lib/pwa";

import { SupportedPlatforms, PlatformQuickChips } from "./components/SupportedPlatforms";



type Route = "home" | "downloads" | "library" | "settings";

type TaskStatus = "downloading" | "complete" | "failed" | "cancelled";

interface Task extends Progress {

  id: string;

  info: MediaInfo;

  status: TaskStatus;

  error?: string;

}

interface Managed {

  blob: Blob;

  info: MediaInfo;

}

const routes: { id: Route; path: string; label: string; icon: LucideIcon }[] = [

  { id: "home", path: "/", label: "Trang chủ", icon: Home },

  { id: "downloads", path: "/downloads", label: "Tải xuống", icon: Download },

  { id: "library", path: "/library", label: "Thư viện", icon: Library },

  { id: "settings", path: "/settings", label: "Cài đặt", icon: Settings2 },

];

const kindLabels: Record<MediaKind, string> = {

  image: "Ảnh",

  video: "Video",

  audio: "Âm thanh",

};

const kindIcons: Record<MediaKind, LucideIcon> = {

  image: FileImage,

  video: FileVideo,

  audio: FileAudio,

};

const date = (at: number) =>

  new Intl.DateTimeFormat("vi-VN", {

    day: "2-digit",

    month: "2-digit",

    hour: "2-digit",

    minute: "2-digit",

  }).format(at);

const currentRoute = () =>

  routes.find(

    (item) =>

      item.path === window.location.pathname.replace(/\/$/, "") ||

      (item.id === "home" && window.location.pathname === "/"),

  )?.id ?? "home";

const errorText = (error: unknown) =>

  error instanceof MediaError || error instanceof Error

    ? error.message

    : "Đã có lỗi xảy ra. Vui lòng thử lại.";



function useBlobUrl(blob?: Blob) {

  const [url, setUrl] = useState("");

  useEffect(() => {

    if (!blob) {

      setUrl("");

      return;

    }

    const value = URL.createObjectURL(blob);

    setUrl(value);

    return () => URL.revokeObjectURL(value);

  }, [blob]);

  return url;

}

function FileBadge({

  kind,

  small = false,

}: {

  kind: MediaKind;

  small?: boolean;

}) {

  const Icon = kindIcons[kind];

  return (

    <span className={`file-badge ${kind} ${small ? "small" : ""}`}>

      <Icon size={small ? 21 : 30} strokeWidth={1.7} />

    </span>

  );

}

function EmptyState({

  icon: Icon,

  title,

  children,

  action,

}: {

  icon: LucideIcon;

  title: string;

  children: ReactNode;

  action?: ReactNode;

}) {

  return (

    <div className="empty-state">

      <span className="empty-icon">

        <Icon size={30} strokeWidth={1.5} />

      </span>

      <h3>{title}</h3>

      <p>{children}</p>

      {action}

    </div>

  );

}

function MediaPreview({ managed }: { managed: Managed }) {

  const url = useBlobUrl(managed.blob);

  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [managed.blob]);

  if (!url) return null;

  if (failed)

    return (

      <div className="inline-note">

        <Info size={20} />

        Trình duyệt không xem trước được codec này. Bạn vẫn có thể lưu tệp gốc

        đã nhận.

      </div>

    );

  if (managed.info.kind === "image")

    return (

      <img

        className="image-preview"

        src={url}

        alt={managed.info.fileName}

        onError={() => setFailed(true)}

      />

    );

  if (managed.info.kind === "video")

    return (

      <video

        className="video-preview"

        src={url}

        controls

        preload="metadata"

        playsInline

        onError={() => setFailed(true)}

      />

    );

  return (

    <div className="audio-preview">

      <Music2 size={42} />

      <audio

        src={url}

        controls

        preload="metadata"

        onError={() => setFailed(true)}

      />

    </div>

  );

}



function setupMediaSession(title?: string, artist?: string, artwork?: string) {

  if (typeof navigator !== "undefined" && "mediaSession" in navigator) {

    try {

      navigator.mediaSession.metadata = new MediaMetadata({

        title: title || "VibeLoad Media",

        artist: artist || "VibeLoad",

        album: "VibeLoad Web",

        artwork: artwork

          ? [

              { src: artwork, sizes: "512x512", type: "image/jpeg" },

              { src: artwork, sizes: "192x192", type: "image/jpeg" },

            ]

          : undefined,

      });

    } catch {

      // ignore errors if unsupported or security exception

    }

  }

}



function detectApplePlatform() {
  if (typeof navigator === "undefined") {
    return { isIOS: false, isMac: false, isApple: false };
  }
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMac = !isIOS && /Macintosh|Mac OS X/i.test(ua);
  return { isIOS, isMac, isApple: isIOS || isMac };
}

function syncThemeColorMeta(theme: Theme) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const resolvedDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const color = resolvedDark ? "#050811" : "#edf2f9";
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      if (theme === "system") {
        const media = meta.getAttribute("media");
        if (media?.includes("dark")) meta.content = "#050811";
        else if (media?.includes("light")) meta.content = "#edf2f9";
        else meta.content = color;
      } else {
        meta.content = color;
      }
    });
}

export default function App() {

  const [applePlatform] = useState(detectApplePlatform);

  const [route, setRoute] = useState<Route>(currentRoute);

  const [settings, setSettings] = useState<Settings>(readSettings);

  const [history, setHistory] = useState<HistoryItem[]>(() =>

    readSettings().rememberHistory ? readHistory() : [],

  );

  const [url, setUrl] = useState("");

  const [checking, setChecking] = useState(false);

  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);

  const [source, setSource] = useState<MediaInfo | null>(null);

  const [backendData, setBackendData] = useState<BackendAnalyzeResponse | null>(null);

  const [selectedFormat, setSelectedFormat] = useState<string>("");

  const [selectedBitrate, setSelectedBitrate] = useState<number>(192);

  const [selectedDownloadType, setSelectedDownloadType] = useState<"video" | "audio" | "photos">("video");

  const [selectedPhotoIndices, setSelectedPhotoIndices] = useState<number[]>([]);

  const [backendDownloading, setBackendDownloading] = useState(false);

  const [backendProgressText, setBackendProgressText] = useState<string | null>(null);

  const [backendDownloadSuccess, setBackendDownloadSuccess] = useState(false);

  const [sourceError, setSourceError] = useState<{

    message: string;

    unsupported: boolean;

    code?: string;

  } | null>(null);

  const [checkCancelled, setCheckCancelled] = useState(false);

  const [fileName, setFileName] = useState("");

  const [task, setTask] = useState<Task | null>(null);

  const [managed, setManaged] = useState<Map<string, Managed>>(new Map());

  const [preview, setPreview] = useState<string | null>(null);

  const [search, setSearch] = useState("");

  const [filter, setFilter] = useState<MediaKind | "all">("all");

  const [sort, setSort] = useState("newest");

  const [online, setOnline] = useState(navigator.onLine);

  const [notice, setNotice] = useState("");

  const [dialog, setDialog] = useState<"clear" | "install" | "help" | null>(

    null,

  );

  const [saving, setSaving] = useState(false);

  const [opening, setOpening] = useState(false);

  const [wakeSeconds, setWakeSeconds] = useState(0);

  const [trimmerTarget, setTrimmerTarget] = useState<{ blob: Blob; fileName: string } | null>(null);

  const [qrModalData, setQrModalData] = useState<{ url: string; title: string } | null>(null);

  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);

  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);

  const [showInstallBanner, setShowInstallBanner] = useState(true);

  const [showIosBanner, setShowIosBanner] = useState(() => {
    try {
      return sessionStorage.getItem("vibeload:ios-banner-dismissed") !== "1";
    } catch {
      return true;
    }
  });

  const [showVideoPreview, setShowVideoPreview] = useState(false);

  const [isBatchMode, setIsBatchMode] = useState(false);

  const [batchText, setBatchText] = useState("");

  const [batchQueue, setBatchQueue] = useState<{

    id: string;

    url: string;

    status: "pending" | "processing" | "ready" | "failed";

    title?: string;

    error?: string;

  }[]>([]);

  const [batchProcessing, setBatchProcessing] = useState(false);

  const [libraryPlatformFilter, setLibraryPlatformFilter] = useState<string>("all");

  const platformFiltersRef = useRef<HTMLDivElement>(null);

  const jsonBackupInputRef = useRef<HTMLInputElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const pickerRef = useRef<HTMLInputElement>(null);

  const checkController = useRef<AbortController | null>(null);

  const downloadController = useRef<AbortController | null>(null);

  const busyRef = useRef(false);

  const dialogRef = useRef<HTMLDialogElement>(null);

  const pwa = usePwa();

  const busy =

    checking ||

    task?.status === "downloading" ||

    saving ||

    opening ||

    backendDownloading;

  busyRef.current = busy;



  useEffect(() => {

    const onPop = () => setRoute(currentRoute());

    const onOnline = () => setOnline(navigator.onLine);

    const beforeUnload = (event: BeforeUnloadEvent) => {

      if (busyRef.current) {

        event.preventDefault();

        event.returnValue = "";

      }

    };

    window.addEventListener("popstate", onPop);

    window.addEventListener("online", onOnline);

    window.addEventListener("offline", onOnline);

    window.addEventListener("beforeunload", beforeUnload);

    // Check if launched via PWA Web Share Target

    try {

      const searchParams = new URLSearchParams(window.location.search);

      const rawShared = searchParams.get("url") || searchParams.get("text") || searchParams.get("title");

      if (rawShared) {

        const urlMatch = rawShared.match(/https?:\/\/[^\s]+/i);

        const targetUrl = urlMatch ? urlMatch[0] : (rawShared.startsWith("http") ? rawShared : null);

        if (targetUrl) {

          setUrl(targetUrl);

          window.history.replaceState({}, "", window.location.pathname);

          // Auto prewarm and analyze

          triggerPrewarm();

        }

      }

    } catch {

      // Ignore URL search params error

    }



    return () => {

      window.removeEventListener("popstate", onPop);

      window.removeEventListener("online", onOnline);

      window.removeEventListener("offline", onOnline);

      window.removeEventListener("beforeunload", beforeUnload);

      checkController.current?.abort();

      downloadController.current?.abort();

    };

  }, []);

  useEffect(() => {

    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.apple = applePlatform.isApple ? "true" : "false";
    syncThemeColorMeta(settings.theme);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => syncThemeColorMeta(settings.theme);
    mq.addEventListener?.("change", onSchemeChange);

    if (!writeSettings(settings))

      setNotice(

        "Trình duyệt chặn lưu thiết lập. Thay đổi chỉ áp dụng trong phiên này.",

      );

    return () => mq.removeEventListener?.("change", onSchemeChange);

  }, [settings, applePlatform.isApple]);

  useEffect(() => {

    if (!writeHistory(history, settings.rememberHistory))

      setNotice(

        "Không thể ghi lịch sử cục bộ. Tệp vẫn có thể tải và lưu trong phiên này.",

      );

  }, [history, settings.rememberHistory]);

  useEffect(() => {

    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(""), 7000);

    return () => clearTimeout(timeout);

  }, [notice]);

  useEffect(() => {

    if (dialog) dialogRef.current?.showModal();

    else dialogRef.current?.close();

  }, [dialog]);

  useEffect(() => {

    document.title = `VibeLoad — ${routes.find((item) => item.id === route)?.label}`;

  }, [route]);



  function navigate(next: Route) {

    if (next === route) return;

    window.history.pushState(

      null,

      "",

      routes.find((item) => item.id === next)!.path,

    );

    setRoute(next);

    window.scrollTo({ top: 0 });

  }

  function changeUrl(value: string) {

    checkController.current?.abort();

    checkController.current = null;

    setChecking(false);

    setSource(null);

    setBackendData(null);

    setSourceError(null);

    setCheckCancelled(false);



    const matches = value.match(/https?:\/\/[^\s]+/g);

    if (matches && matches.length >= 2) {

      setIsBatchMode(true);

      setBatchText(value);

      setNotice(`Phát hiện ${matches.length} liên kết! Đã tự động mở chế độ tải hàng loạt.`);

      return;

    }



    const cleaned = (matches && matches.length === 1) ? cleanTrackingParams(value.trim()) : value;

    triggerHaptic(10);

    setUrl(cleaned);

    if (matches && matches.length === 1 && isPlatformUrl(cleaned) && !checkIncompleteUrl(cleaned)) {
      triggerPrewarm();
      try {
        const normalized = normalizeUrl(cleaned, true).href;
        // Start extraction as soon as a valid link is pasted so analysis is
        // already in flight when the user presses the download button.
        prefetchAnalysis(normalized);
      } catch {
        // Ignore URL normalize errors during typing
      }
    }

  }



  function handleStartBatch() {

    const rawLines = batchText

      .split("\n")

      .map((l) => l.trim())

      .filter((l) => l.startsWith("http"));

    if (rawLines.length === 0) {

      setNotice("Vui lòng dán ít nhất một liên kết hợp lệ (bắt đầu bằng http).");

      return;

    }

    const newQueue = rawLines.map((u, idx) => ({

      id: `${Date.now()}_${idx}`,

      url: u,

      status: "pending" as const,

    }));

    setBatchQueue(newQueue);

    setNotice(`Đã thêm ${newQueue.length} liên kết vào hàng đợi! Bấm "Bắt đầu phân tích tất cả" để xử lý.`);

  }



  async function processBatchQueue() {

    if (batchProcessing || batchQueue.length === 0) return;

    setBatchProcessing(true);

    for (let i = 0; i < batchQueue.length; i++) {

      if (batchQueue[i].status === "ready") continue;

      setBatchQueue((prev) =>

        prev.map((item, idx) => (idx === i ? { ...item, status: "processing" } : item)),

      );

      try {

        const normalized = normalizeUrl(batchQueue[i].url, true).href;

        const res = await analyzeWithBackend(normalized);

        setBatchQueue((prev) =>

          prev.map((item, idx) =>

            idx === i ? { ...item, status: "ready", title: res.title } : item,

          ),

        );

      } catch (err) {

        setBatchQueue((prev) =>

          prev.map((item, idx) =>

            idx === i ? { ...item, status: "failed", error: errorText(err) } : item,

          ),

        );

      }

      await new Promise((r) => setTimeout(r, 400));

    }

    setBatchProcessing(false);

    setNotice("Đã phân tích xong toàn bộ hàng đợi!");

  }



  const triggerPrewarm = useCallback(() => {

    try {

      const base = getApiBaseUrl();

      if (base) {

        fetch(`${base}/api/health`, { cache: "no-store", priority: "low" as RequestPriority }).catch(() => {});

      }

    } catch {

      // Ignore if unconfigured

    }

  }, []);



  useEffect(() => {

    // Proactively pre-warm backend on initial mount

    triggerPrewarm();

  }, [triggerPrewarm]);



  useEffect(() => {

    const handleBeforeInstall = (e: Event) => {

      e.preventDefault();

      setDeferredInstallPrompt(e);

    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);

  }, []);



  useEffect(() => {

    let lastChecked = "";

    const checkClipboard = async () => {

      try {

        if (!navigator.clipboard?.readText) return;

        const text = (await navigator.clipboard.readText()).trim();

        if (text && text !== lastChecked && text !== url && isPlatformUrl(text)) {

          lastChecked = text;

          setClipboardUrl(text);

        }

      } catch {

        // clipboard read not permitted or denied

      }

    };



    window.addEventListener("focus", checkClipboard);

    const handleVisibility = () => {

      if (document.visibilityState === "visible") void checkClipboard();

    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {

      window.removeEventListener("focus", checkClipboard);

      document.removeEventListener("visibilitychange", handleVisibility);

    };

  }, [url]);



  async function paste() {

    triggerHaptic(20);

    try {

      if (!navigator.clipboard?.readText) throw new Error();

      const text = await navigator.clipboard.readText();

      if (!text.trim()) {

        setNotice("Khay nhớ tạm đang trống.");

        return;

      }

      changeUrl(text.trim());

      triggerPrewarm();

      inputRef.current?.focus();

    } catch {

      setNotice(

        "Không đọc được khay nhớ tạm. Nhấn giữ ô liên kết hoặc dùng Ctrl+V để dán.",

      );

      inputRef.current?.focus();

    }

  }

  async function analyze(event?: FormEvent) {

    event?.preventDefault();

    if (checking || task?.status === "downloading") return;



    const incompleteMsg = checkIncompleteUrl(url);

    if (incompleteMsg) {

      setSourceError({

        message: incompleteMsg,

        unsupported: false,

        code: "INCOMPLETE_URL",

      });

      return;

    }



    const controller = new AbortController();

    checkController.current?.abort();

    checkController.current = controller;

    setChecking(true);

    setCheckingStatus("Đang kiểm tra kết nối máy chủ...");

    setSource(null);

    setBackendData(null);

    setSourceError(null);

    setCheckCancelled(false);

    try {

      if (isPlatformUrl(url)) {
        const normalized = normalizeUrl(url, true).href;
        const isTikTok = /tiktok\.com|douyin\.com/i.test(normalized);
        const isYouTube = /youtube\.com|youtu\.be/i.test(normalized);

        let beResult: BackendAnalyzeResponse | null = getCachedAnalysis(normalized);

        if (!beResult) {
          const inFlight = getInFlightAnalysis(normalized);
          if (inFlight) {
            setCheckingStatus("Đang hoàn tất phân tích siêu tốc...");
            beResult = await inFlight.catch(() => null);
          }
        }

        if (!beResult && isTikTok) {
          setCheckingStatus("Đang trích xuất siêu tốc qua máy chủ biên (Vercel Edge)...");
          triggerPrewarm();
          beResult = await fetchTikTokEdge(normalized, controller.signal);
        }

        if (!beResult) {
          const ytOEmbedPromise = isYouTube ? fetchYouTubeOEmbed(url) : Promise.resolve(null);

          setCheckingStatus("Đang phân tích phương tiện tốc độ cao...");
          const analyzeTimer = setInterval(() => {
            setCheckingStatus((prev) => {
              if (prev?.includes("Đang phân tích")) return "Đang trích xuất luồng video/âm thanh chất lượng cao...";
              if (prev?.includes("Đang trích xuất")) return "Đang hoàn tất danh sách định dạng phương tiện...";
              return prev;
            });
          }, 1800);

          try {
            try {
              beResult = await analyzeWithBackend(normalized, controller.signal);
            } catch (firstErr) {
              const isColdOrNetwork =
                firstErr instanceof TypeError ||
                (firstErr instanceof BackendError && [502, 503, 504].includes(firstErr.status));
              if (!isColdOrNetwork) {
                throw firstErr;
              }
              await waitForBackend(controller.signal, (seconds) => {
                setWakeSeconds(seconds);
                setCheckingStatus(
                  `Máy chủ Render đang thức giấc từ chế độ ngủ đông (${seconds}s)... Lần tải đầu tiên sau 15 phút cần chút thời gian để khởi động.`,
                );
              });
              setWakeSeconds(0);
              setCheckingStatus("Đã kết nối máy chủ! Đang phân tích phương tiện...");
              beResult = await analyzeWithBackend(normalized, controller.signal);
            }
          } catch (err) {
            if (isYouTube) {
              const oembedResult = await ytOEmbedPromise;
              if (oembedResult) {
                beResult = oembedResult;
              } else {
                throw err;
              }
            } else {
              throw err;
            }
          } finally {
            clearInterval(analyzeTimer);
          }
        }

        if (checkController.current !== controller) return;

        setBackendData(beResult);

        if (beResult.is_photo_album) {

          setSelectedDownloadType("photos");

          setFileName(sanitizeFileName(beResult.title, "zip"));

          setSelectedPhotoIndices(beResult.photos.map((p) => p.index));

        } else if (beResult.is_audio_only) {

          setSelectedDownloadType("audio");

          setSelectedBitrate(192);

          setFileName(sanitizeFileName(beResult.title, "mp3"));

        } else {

          setSelectedDownloadType("video");

          const defaultFmt =

            beResult.video_options.length > 0

              ? beResult.video_options[beResult.video_options.length - 1].format_id

              : "best";

          setSelectedFormat(defaultFmt);

          setFileName(sanitizeFileName(beResult.title, "mp4"));

        }

      } else {

        const info = await inspectMedia(url, controller.signal);

        if (checkController.current !== controller) return;

        setSource(info);

        setFileName(info.fileName);

      }

    } catch (error) {

      if (checkController.current !== controller) return;

      if (controller.signal.aborted) setCheckCancelled(true);

      else

        setSourceError({

          message: errorText(error),

          unsupported:

            error instanceof MediaError && error.code === "unsupported",

        });

    } finally {

      if (checkController.current === controller) {

        setWakeSeconds(0);

        setChecking(false);

        setCheckingStatus(null);

        checkController.current = null;

      }

    }

  }



  function togglePhotoSelection(index: number) {

    setSelectedPhotoIndices((prev) =>

      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],

    );

  }



  function selectAllPhotos() {

    if (backendData?.photos) {

      setSelectedPhotoIndices(backendData.photos.map((p) => p.index));

    }

  }



  function deselectAllPhotos() {

    setSelectedPhotoIndices([]);

  }



  async function downloadThumbnail(thumbUrl: string, title: string) {

    if (!thumbUrl) return;

    triggerHaptic(20);

    try {

      let targetUrl = thumbUrl;

      // Upgrade YouTube thumbnails to MaxRes (1920x1080)

      if (targetUrl.includes("ytimg.com") || targetUrl.includes("youtube.com")) {

        targetUrl = targetUrl.replace(/\/(?:hq|sd|mq|default)\.(jpg|webp)/i, "/maxresdefault.jpg");

      }

      setNotice("Đang tải ảnh bìa chất lượng cao...");

      const response = await fetch(targetUrl, { mode: "cors" }).catch(() => null);

      if (response && response.ok) {

        const blob = await response.blob();

        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement("a");

        a.href = blobUrl;

        a.download = `${sanitizeFileName(title, "jpg")}_thumbnail.jpg`;

        document.body.appendChild(a);

        a.click();

        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);

        triggerHaptic([20, 40, 20]);

        setNotice("Đã tải xong ảnh bìa HD!");

      } else {

        const a = document.createElement("a");

        a.href = targetUrl;

        a.target = "_blank";

        a.rel = "noreferrer noopener";

        a.download = `${sanitizeFileName(title, "jpg")}_thumbnail.jpg`;

        document.body.appendChild(a);

        a.click();

        document.body.removeChild(a);

        triggerHaptic([20, 40, 20]);

        setNotice("Đã mở ảnh bìa để lưu!");

      }

    } catch {

      window.open(thumbUrl, "_blank", "noreferrer,noopener");

    }

  }



  async function downloadSinglePhoto(

    photoUrl: string,

    index: number,

    signal?: AbortSignal,

    options?: { skipPicker?: boolean },

  ) {

    const baseTitle = sanitizeFileName(backendData?.title || "TikTok_Photo", "jpg");

    const cleanBase = baseTitle.replace(/\.(zip|mp4|mp3|jpg|jpeg|png)$/i, "");

    const photoFilename = `${cleanBase}_${String(index).padStart(2, "0")}.jpg`;

    let blob: Blob | null = null;

    // Direct client-side fetch attempt (0-wait bypass for Pinterest & open CDN images)

    try {

      const directResp = await fetch(photoUrl, { mode: "cors", signal: AbortSignal.timeout(6000) });

      if (directResp.ok && directResp.headers.get("content-type")?.startsWith("image/")) {

        blob = await directResp.blob();

      }

    } catch {

      // Direct CORS restricted, seamless fallback to backend proxy

    }



    if (!blob) {

      const downloadUrl = getBackendPhotoDownloadUrl(photoUrl, photoFilename);

      const response = await fetch(downloadUrl, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });

      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {

        throw new Error(`Không tải được ảnh #${index}. Hãy phân tích lại liên kết.`);

      }

      blob = await response.blob();

    }

    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" } as Record<string, string>)[blob.type] || "jpg";

    await saveBlob(blob, `${cleanBase}_${String(index).padStart(2, "0")}.${ext}`, options);

    setNotice(`Đã gửi ảnh #${index} tới trình duyệt để lưu.`);

  }



  async function downloadMultiplePhotos(indices?: number[]) {

    if (!backendData || !backendData.photos || backendData.photos.length === 0) return;

    if (busyRef.current || downloadController.current) return;

    const list =

      indices !== undefined

        ? backendData.photos.filter((p) => indices.includes(p.index))

        : backendData.photos;



    if (list.length === 0) {

      setNotice("Chưa chọn ảnh nào để tải.");

      return;

    }



    setBackendDownloading(true);

    setBackendDownloadSuccess(false);

    busyRef.current = true;

    const controller = new AbortController();

    downloadController.current = controller;

    let completed = 0;

    setBackendProgressText(`Đang tải 0/${list.length} ảnh rời...`);

    try {

      for (let i = 0; i < list.length; i++) {

        const p = list[i];

        setBackendProgressText(`Đang tải ảnh ${i + 1}/${list.length}...`);

        controller.signal.throwIfAborted();

        await downloadSinglePhoto(p.url, p.index, controller.signal, { skipPicker: true });

        completed++;

        if (i < list.length - 1) {

          await new Promise((r) => setTimeout(r, 350));

        }

      }

      setBackendDownloadSuccess(true);

      triggerHaptic([20, 50, 20]);

      setNotice(`Đã gửi ${list.length} ảnh tới trình duyệt để lưu. Hãy kiểm tra mục Tải xuống.`);

    } catch (err) {

      setNotice(`${controller.signal.aborted ? "Đã hủy tải ảnh" : `Lỗi tải ảnh: ${errorText(err)}`}. Đã gửi ${completed}/${list.length} ảnh tới trình duyệt để lưu.`);

    } finally {

      setBackendDownloading(false);

      setBackendProgressText(null);

      busyRef.current = false;

      downloadController.current = null;

    }

  }



  async function startBackendMediaDownload() {

    if (!backendData || busyRef.current || downloadController.current) return;

    busyRef.current = true;

    const controller = new AbortController();

    downloadController.current = controller;

    const tempId = crypto.randomUUID();



    const ext =

      selectedDownloadType === "photos"

        ? "zip"

        : selectedDownloadType === "audio"

          ? "mp3"

          : "mp4";

    const kind: MediaKind =

      selectedDownloadType === "photos"

        ? "image"

        : selectedDownloadType === "audio"

          ? "audio"

          : "video";

    const finalName = sanitizeFileName(fileName || backendData.title, ext);



    const mediaInfo: MediaInfo = {

      url: backendData.url,

      fileName: finalName,

      mime:

        selectedDownloadType === "photos"

          ? "application/zip"

          : selectedDownloadType === "audio"

            ? "audio/mpeg"

            : "video/mp4",

      kind,

      size: null,

      extension: ext,

    };



    setBackendDownloading(true);

    setBackendProgressText("Đang chuẩn bị tệp...");

    setBackendDownloadSuccess(false);



    setTask({

      id: tempId,

      info: mediaInfo,

      status: "downloading",

      received: 0,

      total: null,

    });

    setPreview(null);

    setManaged(new Map());



    let activeJobId: string | null = null;

    try {

      // Direct Client-Side Stream Bypass for TikTok & Direct CDN Streams (Zero Render Cold-Start & Zero Server Bandwidth)

      const directStreamUrl =

        selectedDownloadType === "video" && selectedFormat?.startsWith("http")

          ? selectedFormat

          : selectedDownloadType === "audio"

            ? (backendData.audio_options.find((a) => a.format_id?.startsWith("http"))?.format_id ||

               (backendData.is_audio_only && backendData.video_options[0]?.format_id?.startsWith("http")

                 ? backendData.video_options[0].format_id

                 : null))

            : null;



      if (directStreamUrl) {

        try {

          setBackendProgressText("Đang tải luồng media trực tiếp từ CDN siêu tốc...");

          const resp = await fetch(directStreamUrl, {

            signal: controller.signal,

          });

          if (resp.ok) {

            const blob = await resp.blob();

            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement("a");

            a.href = blobUrl;

            a.download = finalName;

            document.body.appendChild(a);

            a.click();

            a.remove();

            setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);



            setBackendDownloadSuccess(true);

            triggerHaptic([20, 50, 20]);

            setNotice("Tải hoàn tất! Tệp đã được lưu trực tiếp vào máy của bạn.");



            const completedSize = blob.size;

            const completedInfo: MediaInfo = {

              ...mediaInfo,

              size: completedSize,

            };



            setTask({

              id: tempId,

              info: completedInfo,

              status: "complete",

              received: completedSize,

              total: completedSize,

            });



            upsertHistory({

              id: tempId,

              fileName: completedInfo.fileName,

              kind: completedInfo.kind,

              size: completedSize,

              at: Date.now(),

              saved: "requested",

              mime: completedInfo.mime,

            });



            return;

          }

        } catch (directErr) {

          if (controller.signal.aborted) throw new Error("DOWNLOAD_CANCELLED");

          // Direct fetch failed (e.g. CORS or network restriction), seamlessly continue to backend job below

        }

      }



      const job = await startBackendDownload(

        {

          url: backendData.url,

          download_type: selectedDownloadType,

          format_id:

            selectedDownloadType === "video" ? selectedFormat : undefined,

          audio_bitrate:

            selectedDownloadType === "audio" ? selectedBitrate : undefined,

          photo_indices: selectedDownloadType === "photos" ? selectedPhotoIndices : undefined,

        },

        controller.signal,

      );



      activeJobId = job.id;

      let jobStatus = job.status;

      let lastJob = job;



      while (

        jobStatus === "queued" ||

        jobStatus === "downloading" ||

        jobStatus === "processing"

      ) {

        if (controller.signal.aborted) {

          if (activeJobId) void cancelBackendJob(activeJobId);

          throw new Error("DOWNLOAD_CANCELLED");

        }

        await new Promise((r) => setTimeout(r, 600));

        if (controller.signal.aborted) {

          if (activeJobId) void cancelBackendJob(activeJobId);

          throw new Error("DOWNLOAD_CANCELLED");

        }

        lastJob = await pollBackendJob(job.id, controller.signal);

        jobStatus = lastJob.status;



        if (lastJob.total_bytes && lastJob.total_bytes > 0) {

          const pct = Math.min(99, Math.round((lastJob.downloaded_bytes / lastJob.total_bytes) * 100));

          setBackendProgressText(`Đang tải (${pct}%)...`);

        } else if (jobStatus === "processing") {

          setBackendProgressText(

            selectedDownloadType === "photos"

              ? "Đang đóng gói Album (.ZIP)..."

              : selectedDownloadType === "audio"

                ? "Đang chuyển đổi sang MP3 chất lượng cao..."

                : "Đang xử lý và ghép luồng media..."

          );

        } else if (jobStatus === "queued") {

          setBackendProgressText("Đang xếp hàng chờ xử lý...");

        } else {

          setBackendProgressText("Đang tải luồng dữ liệu từ nguồn...");

        }



        setTask((prev) =>

          prev

            ? {

                ...prev,

                received: lastJob.downloaded_bytes,

                total: lastJob.total_bytes || null,

              }

            : prev,

        );

      }



      if (jobStatus === "cancelled") {

        throw new Error("DOWNLOAD_CANCELLED");

      }



      if (jobStatus === "failed") {

        throw new Error(lastJob.error || "Tải phương tiện thất bại");

      }



      // KÍCH HOẠT TẢI XUỐNG THẲNG VỀ THIẾT BỊ NGAY LẬP TỨC:

      const fileUrl = getBackendFileUrl(job.id);

      const downloadLink = document.createElement("a");

      downloadLink.href = fileUrl;

      downloadLink.download = finalName;

      downloadLink.rel = "noopener";

      document.body.appendChild(downloadLink);

      downloadLink.click();

      downloadLink.remove();



      setBackendDownloadSuccess(true);

      triggerHaptic([20, 50, 20]);

      setNotice("Tệp đã sẵn sàng và đã gửi yêu cầu lưu tới trình duyệt. Hãy kiểm tra mục Tải xuống.");



      const completedSize = lastJob.file_info?.filesize || lastJob.downloaded_bytes || 0;

      const completedInfo: MediaInfo = {

        ...mediaInfo,

        size: completedSize,

      };



      setTask({

        id: tempId,

        info: completedInfo,

        status: "complete",

        received: completedSize,

        total: completedSize,

      });



      upsertHistory({

        id: tempId,

        fileName: completedInfo.fileName,

        kind: completedInfo.kind,

        size: completedSize,

        at: Date.now(),

        saved: "requested",

        mime: completedInfo.mime,

      });



      // Tải ngầm blob vào memory để xem trước nếu mở Thư viện

      fetch(fileUrl, { signal: controller.signal })

        .then((r) => (r.ok ? r.blob() : null))

        .then((blob) => {

          if (blob) {

            setManaged(new Map([[tempId, { blob, info: completedInfo }]]));

          }

        })

        .catch(() => {});

    } catch (err: unknown) {

      if (activeJobId) void cancelBackendJob(activeJobId);

      const isAbort =

        controller.signal.aborted ||

        (err instanceof Error && err.message === "DOWNLOAD_CANCELLED");

      if (isAbort) {

        setTask((prev) => (prev ? { ...prev, status: "cancelled" } : null));

        setNotice("Đã hủy tác vụ tải.");

      } else {

        setTask((prev) =>

          prev ? { ...prev, status: "failed", error: errorText(err) } : null,

        );

        setNotice(`Không tải được tệp: ${errorText(err)}`);

      }

    } finally {

      setBackendDownloading(false);

      setBackendProgressText(null);

      busyRef.current = false;

      downloadController.current = null;

    }

  }

  function upsertHistory(item: HistoryItem) {

    setHistory((items) =>

      [item, ...items.filter((old) => old.id !== item.id)].slice(0, 100),

    );

  }

  async function startDownload(info: MediaInfo) {

    if (busyRef.current || downloadController.current) return;

    busyRef.current = true;

    const controller = new AbortController();

    downloadController.current = controller;

    const id = crypto.randomUUID();

    setTask({ id, info, status: "downloading", received: 0, total: null });

    setPreview(null);

    setManaged(new Map());

    navigate("downloads");

    let lastUpdate = 0;

    try {

      const result = await downloadMedia(

        info,

        controller.signal,

        (progress) => {

          const now = performance.now();

          if (now - lastUpdate < 100 && progress.received !== progress.total)

            return;

          lastUpdate = now;

          setTask((previous) =>

            previous?.id === id ? { ...previous, ...progress } : previous,

          );

        },

        { maxBytes: settings.maxMiB * 1024 * 1024 },

      );

      setManaged(new Map([[id, result]]));

      setTask((previous) =>

        previous?.id === id

          ? {

              ...previous,

              info: result.info,

              received: result.blob.size,

              status: "complete",

            }

          : previous,

      );



      let savedState: "written" | "requested" | "received" = "received";

      try {

        const resultSave = await saveBlob(result.blob, result.info.fileName);

        savedState = resultSave.state;

        setNotice("Đã tải tệp về thiết bị. Hãy kiểm tra thư mục Tải xuống.");

      } catch {

        // Trình duyệt chặn tự động lưu thì vẫn để người dùng bấm Lưu tệp

      }



      upsertHistory({

        id,

        fileName: result.info.fileName,

        kind: result.info.kind,

        mime: result.info.mime,

        size: result.blob.size,

        at: Date.now(),

        saved: savedState,

      });

    } catch (error) {

      setTask((previous) =>

        previous?.id === id

          ? {

              ...previous,

              status: controller.signal.aborted ? "cancelled" : "failed",

              error: controller.signal.aborted ? undefined : errorText(error),

            }

          : previous,

      );

    } finally {

      downloadController.current = null;

    }

  }

  async function save(id: string) {

    const item = managed.get(id);

    if (!item || saving) return;

    setSaving(true);

    try {

      const result = await saveBlob(item.blob, item.info.fileName);

      setHistory((items) =>

        items.map((old) =>

          old.id === id ? { ...old, saved: result.state } : old,

        ),

      );

      setNotice(

        result.state === "written"

          ? "Đã ghi tệp vào vị trí bạn chọn."

          : "Đã gửi yêu cầu lưu tới trình duyệt. Kiểm tra danh sách tải xuống; iPhone có thể mở bảng xem trước để bạn chọn Lưu vào Tệp.",

      );

    } catch (error) {

      setNotice(

        error instanceof DOMException && error.name === "AbortError"

          ? "Bạn đã hủy hộp thoại lưu. Tệp vẫn sẵn sàng trong phiên này."

          : `Không lưu được tệp. ${errorText(error)}`,

      );

    } finally {

      setSaving(false);

    }

  }

  function dismissIosBanner() {
    setShowIosBanner(false);
    try {
      sessionStorage.setItem("vibeload:ios-banner-dismissed", "1");
    } catch {
      // ignore sessionStorage block
    }
  }

  async function shareManaged(id: string) {
    const item = managed.get(id);
    if (!item || saving) return;
    triggerHaptic(15);
    try {
      const shared = await shareBlobNative(
        item.blob,
        item.info.fileName,
        item.info.fileName,
      );
      if (shared) {
        setNotice("Đã mở bảng Chia sẻ hệ thống. Chọn Lưu video / Lưu hình ảnh hoặc Lưu vào Tệp.");
      }
    } catch (error) {
      setNotice(`Không mở được bảng chia sẻ. ${errorText(error)}`);
    }
  }

  async function openFile(file?: File) {

    if (!file || busyRef.current) return;

    if (file.size > settings.maxMiB * 1024 * 1024) {

      setNotice(`Tệp vượt giới hạn ${settings.maxMiB} MiB đang chọn.`);

      return;

    }

    setOpening(true);

    try {

      const info = await inspectLocalFile(file);

      const id = crypto.randomUUID();

      setManaged(new Map([[id, { blob: file, info }]]));

      setTask(null);

      upsertHistory({

        id,

        fileName: info.fileName,

        kind: info.kind,

        mime: info.mime,

        size: file.size,

        at: Date.now(),

        saved: "opened",

      });

      setPreview(id);

      navigate("library");

    } catch (error) {

      setNotice(errorText(error));

    } finally {

      setOpening(false);

      if (pickerRef.current) pickerRef.current.value = "";

    }

  }

  function removeHistory(id: string) {

    setHistory((items) => items.filter((item) => item.id !== id));

    setManaged((items) => {

      const next = new Map(items);

      next.delete(id);

      return next;

    });

    if (preview === id) setPreview(null);

    setNotice(

      "Đã xóa mục khỏi lịch sử VibeLoad. Tệp trên thiết bị không bị xóa.",

    );

  }

  function changeTheme(theme: Theme) {

    setSettings((previous) => ({ ...previous, theme }));

  }



  function getItemPlatform(fileName: string): string {

    const name = fileName.toLowerCase();

    if (name.includes("tiktok")) return "tiktok";

    if (name.includes("youtube") || name.includes("youtu")) return "youtube";

    if (name.includes("pinterest") || name.includes("pinimg")) return "pinterest";

    if (name.includes("soundcloud")) return "soundcloud";

    if (name.includes("facebook") || name.includes("fb")) return "facebook";

    if (name.includes("threads")) return "threads";

    if (name.includes("douyin")) return "douyin";

    if (name.includes("reddit")) return "reddit";

    return "other";

  }



  function exportHistoryToJson() {

    triggerHaptic(20);

    if (history.length === 0) {

      setNotice("Thư viện đang trống, không có mục nào để sao lưu.");

      return;

    }

    const data = JSON.stringify(history, null, 2);

    const blob = new Blob([data], { type: "application/json" });

    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = blobUrl;

    a.download = `vibeload_history_${new Date().toISOString().slice(0, 10)}.json`;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);

    setNotice(`Đã xuất ${history.length} mục trong thư viện sang file JSON!`);

  }



  function importHistoryFromJson(event: React.ChangeEvent<HTMLInputElement>) {

    const file = event.target.files?.[0];

    if (!file) return;

    triggerHaptic(20);

    const reader = new FileReader();

    reader.onload = (e) => {

      try {

        const parsed = JSON.parse(e.target?.result as string);

        if (!Array.isArray(parsed)) throw new Error("Format không hợp lệ");

        const existingIds = new Set(history.map((h) => h.id));

        const newItems: HistoryItem[] = parsed.filter(

          (item: any): item is HistoryItem =>

            item &&

            typeof item.id === "string" &&

            typeof item.fileName === "string" &&

            !existingIds.has(item.id),

        );

        if (newItems.length === 0) {

          setNotice("Tất cả các mục trong tệp sao lưu đã có sẵn trong thư viện.");

          return;

        }

        const updated = [...newItems, ...history].slice(0, 100);

        setHistory(updated);

        writeHistory(updated, settings.rememberHistory);

        triggerHaptic([20, 50, 20]);

        setNotice(`Đã khôi phục thành công ${newItems.length} mục vào thư viện!`);

      } catch {

        setNotice("Tệp sao lưu không đúng định dạng JSON.");

      }

    };

    reader.readAsText(file);

    event.target.value = "";

  }



  const visibleItems = history

    .filter(

      (item) =>

        (filter === "all" || item.kind === filter) &&

        (libraryPlatformFilter === "all" || getItemPlatform(item.fileName) === libraryPlatformFilter) &&

        item.fileName

          .toLocaleLowerCase("vi")

          .includes(search.toLocaleLowerCase("vi")),

    )

    .sort((a, b) =>

      sort === "name"

        ? a.fileName.localeCompare(b.fileName, "vi")

        : sort === "size"

          ? b.size - a.size

          : sort === "oldest"

            ? a.at - b.at

            : b.at - a.at,

    );

  const active = task?.status === "downloading";

  const percent =

    task?.total && task.received <= task.total

      ? Math.min(100, Math.floor((task.received / task.total) * 100))

      : null;

  const selected = preview ? managed.get(preview) : undefined;

  let originalLink: string | null = null;

  try {

    originalLink = normalizeUrl(url, true).href;

  } catch {

    /* no valid source link */

  }



  const historyRow = (item: HistoryItem) => (

    <div className="file-row" key={item.id}>

      <FileBadge kind={item.kind} small />

      <div className="file-row-info">

        <strong title={item.fileName}>{item.fileName}</strong>

        <span>

          {kindLabels[item.kind]}

          <i />

          {formatBytes(item.size)}

          <i />

          {date(item.at)}

        </span>

        <span className="file-state">

          {item.saved === "written"

            ? "Đã ghi tệp"

            : item.saved === "requested"

              ? "Đã gửi yêu cầu lưu"

              : item.saved === "opened"

                ? "Đã chọn từ thiết bị"

                : "Đã nhận đủ dữ liệu"}

          {!managed.has(item.id) && " · Chọn lại tệp để mở"}

        </span>

      </div>

      {managed.has(item.id) ? (

        <button

          className="icon-button"

          title="Xem tệp"

          aria-label={`Xem ${item.fileName}`}

          onClick={() => {

            setPreview(item.id);

            navigate("library");

          }}

        >

          <FolderOpen size={19} />

        </button>

      ) : (

        <button

          className="icon-button"

          title="Chọn lại tệp từ thiết bị"

          aria-label={`Chọn lại ${item.fileName}`}

          disabled={busy}

          onClick={() => pickerRef.current?.click()}

        >

          <FolderOpen size={19} />

        </button>

      )}

      {managed.has(item.id) && item.kind === "audio" && (

        <button

          className="icon-button"

          title="Cắt đoạn 30s làm nhạc chuông"

          aria-label={`Cắt nhạc chuông ${item.fileName}`}

          onClick={() => {

            const m = managed.get(item.id);

            if (m) setTrimmerTarget({ blob: m.blob, fileName: item.fileName });

          }}

        >

          <Scissors size={18} />

        </button>

      )}

      {route === "library" && (

        <button

          className="icon-button danger-hover"

          aria-label={`Xóa lịch sử ${item.fileName}`}

          title="Chỉ xóa mục lịch sử"

          onClick={() => removeHistory(item.id)}

        >

          <Trash2 size={17} />

        </button>

      )}

    </div>

  );



  return (

    <div className="app-shell">

      <div className="liquid-ambient" aria-hidden="true">
        <span className="liquid-orb orb-sapphire" />
        <span className="liquid-orb orb-aqua" />
        <span className="liquid-orb orb-indigo" />
      </div>

      <a className="skip-link" href="#main">

        Đến nội dung chính

      </a>

      <aside className="sidebar">

        <a

          className="brand"

          href="/"

          onClick={(event) => {

            event.preventDefault();

            navigate("home");

          }}

        >

          <img src="/icons/icon-192.png" width="40" height="40" alt="" />

          <span>

            VibeLoad<small>WEB EDITION</small>

          </span>

        </a>

        <p className="nav-label">KHÔNG GIAN CỦA BẠN</p>

        <nav
          className="nav-group"
          aria-label="Điều hướng chính"
          data-active-route={route}
        >
          <div className="sidebar-glass-slider" aria-hidden="true" />
          {routes.map((item) => (

            <a

              key={item.id}

              href={item.path}

              className={`nav-item ${route === item.id ? "active" : ""}`}

              aria-current={route === item.id ? "page" : undefined}

              onClick={(event) => {

                if (

                  !event.ctrlKey &&

                  !event.metaKey &&

                  !event.shiftKey &&

                  event.button === 0

                ) {

                  event.preventDefault();

                  navigate(item.id);

                }

              }}

            >

              <item.icon size={21} strokeWidth={1.8} />

              <span>{item.label}</span>

              {item.id === "downloads" && active && (

                <b className="nav-count">1</b>

              )}

            </a>

          ))}

        </nav>

        <div className="sidebar-bottom">

          <div className="privacy-card">

            <span className="privacy-icon">

              <ShieldCheck size={23} />

            </span>

            <strong>

              Tệp của bạn.

              <br />

              Quyền riêng tư của bạn.

            </strong>

            <p>

              Không tài khoản, không quảng cáo.

              <br />

              Media đi thẳng đến thiết bị.

            </p>

            <button onClick={() => setDialog("help")}>

              Tìm hiểu thêm <ArrowUpRight size={15} />

            </button>

          </div>

          <button

            className="install-sidebar"

            onClick={() =>

              pwa.canInstall ? void pwa.install() : setDialog("install")

            }

          >

            <Smartphone size={19} />

            <span>

              {pwa.installed ? "VibeLoad đã được cài" : "Cài đặt VibeLoad"}

              <small>Trải nghiệm như ứng dụng</small>

            </span>

            <Plus size={17} />

          </button>

          <span className="version">

            VibeLoad Web <span>v1.0.16</span>

          </span>

        </div>

      </aside>

      <div className="workspace">

        <header className="topbar">

          <div className="mobile-brand">

            <img src="/icons/icon-192.png" alt="" width="30" height="30" />

            <strong>VibeLoad</strong>

          </div>

          <div className="breadcrumb">

            Không gian làm việc <ChevronRight size={14} />

            <strong>{routes.find((item) => item.id === route)?.label}</strong>

          </div>

          <div className="topbar-actions">

            <span className={`connection ${online ? "" : "offline"}`}>

              {online ? <Wifi size={14} /> : <WifiOff size={14} />}

              <span>{online ? "Đang trực tuyến" : "Ngoại tuyến"}</span>

            </span>

            <span className="topbar-divider" />

            <button

              className="icon-button"

              aria-label="Đổi chế độ sáng tối"

              title="Đổi chế độ sáng tối"

              onClick={() =>

                changeTheme(

                  document.documentElement.dataset.theme === "dark" ||

                    (settings.theme === "system" &&

                      matchMedia("(prefers-color-scheme: dark)").matches)

                    ? "light"

                    : "dark",

                )

              }

            >

              <Sun className="theme-sun" size={20} />

              <Moon className="theme-moon" size={20} />

            </button>

            <button

              className="icon-button"

              aria-label="Hướng dẫn sử dụng"

              onClick={() => setDialog("help")}

            >

              <HelpCircle size={20} />

            </button>

          </div>

        </header>

        {!online && (

          <div className="network-banner">

            <WifiOff size={17} />

            Bạn đang ngoại tuyến. Có thể mở tệp từ thiết bị; tải liên kết cần

            Internet.

          </div>

        )}

        {pwa.update && (

          <div className="update-banner">

            <Sparkles size={17} />

            <span>Có bản cập nhật VibeLoad mới.</span>

            <button disabled={busy} onClick={pwa.applyUpdate}>

              Cập nhật và tải lại

            </button>

          </div>

        )}

        <main id="main" className={`main-content page-${route}`}>

          {route === "home" && (

            <>

              <section className="hero">

                <div className="hero-copy">

                  <span className="eyebrow">

                    <span /> ĐƠN GIẢN. RIÊNG TƯ. MIỄN PHÍ.

                  </span>

                  <h1>

                    Tải <span>Media</span>

                  </h1>

                  <p>

                    Một liên kết. Tệp của bạn.

                    <br />

                    <span>

                      Lưu ảnh, video và âm thanh trực tiếp về thiết bị.

                    </span>

                  </p>

                  <div className="hero-tags">

                    <span>

                      <Check size={14} /> Không cần đăng nhập

                    </span>

                    <span>

                      <Check size={14} /> Tệp trực tiếp trên thiết bị

                    </span>

                  </div>

                </div>

                <div className="hero-art" aria-hidden="true">

                  <span className="orbit orbit-one" />

                  <span className="orbit orbit-two" />

                  <div className="art-file art-image">

                    <Image size={26} />

                    <span>Ảnh</span>

                  </div>

                  <div className="art-file art-audio">

                    <Music2 size={25} />

                    <span>Âm thanh</span>

                  </div>

                  <div className="art-main">

                    <img src="/icons/icon-192.png" alt="" />

                    <span>VibeLoad</span>

                    <div>

                      <ArrowDown size={16} />

                      <span>Đến thiết bị của bạn</span>

                    </div>

                  </div>

                  <div className="art-file art-video">

                    <FileVideo size={25} />

                    <span>Video</span>

                  </div>

                  <span className="art-spark spark-one">+</span>

                  <span className="art-spark spark-two">+</span>

                </div>

              </section>



              {clipboardUrl && (

                <div className="smart-clipboard-banner" role="status">

                  <div className="clipboard-banner-left">

                    <Clipboard size={16} className="text-accent" />

                    <span>

                      Phát hiện liên kết trong khay nhớ tạm:{" "}

                      <strong>

                        {clipboardUrl.length > 40 ? `${clipboardUrl.slice(0, 40)}...` : clipboardUrl}

                      </strong>

                    </span>

                  </div>

                  <div className="clipboard-banner-actions">

                    <button

                      type="button"

                      className="button primary small"

                      onClick={() => {

                        changeUrl(clipboardUrl);

                        setClipboardUrl(null);

                        setTimeout(() => {

                          inputRef.current?.form?.requestSubmit();

                        }, 80);

                      }}

                    >

                      <Sparkles size={13} /> Phân tích ngay

                    </button>

                    <button

                      type="button"

                      className="icon-button close-banner"

                      onClick={() => setClipboardUrl(null)}

                      aria-label="Đóng gợi ý"

                    >

                      <X size={15} />

                    </button>

                  </div>

                </div>

              )}



              {deferredInstallPrompt && showInstallBanner && (

                <div className="smart-install-banner">

                  <div className="install-banner-header">

                    <div className="install-banner-left">

                      <div className="install-icon-wrap">

                        <Smartphone size={18} className="text-accent" />

                      </div>

                      <div>

                        <strong>Cài đặt VibeLoad (PWA)</strong>

                        <p>Mở từ màn hình chính & nhận liên kết chia sẻ 1-chạm</p>

                      </div>

                    </div>

                    <button

                      type="button"

                      className="icon-button close-banner mobile-close-btn"

                      onClick={() => setShowInstallBanner(false)}

                      aria-label="Bỏ qua"

                    >

                      <X size={15} />

                    </button>

                  </div>

                  <div className="install-banner-actions">

                    <button

                      type="button"

                      className="button primary small"

                      onClick={async () => {

                        if (deferredInstallPrompt) {

                          deferredInstallPrompt.prompt();

                          const { outcome } = await deferredInstallPrompt.userChoice;

                          if (outcome === "accepted") {

                            setDeferredInstallPrompt(null);

                          }

                        }

                      }}

                    >

                      Cài đặt ngay

                    </button>

                    <button

                      type="button"

                      className="icon-button close-banner desktop-close-btn"

                      onClick={() => setShowInstallBanner(false)}

                      aria-label="Bỏ qua"

                    >

                      <X size={15} />

                    </button>

                  </div>

                </div>

              )}

              {applePlatform.isIOS && !pwa.installed && !deferredInstallPrompt && showIosBanner && (
                <div className="smart-install-banner apple-ios-banner">
                  <div className="install-banner-header">
                    <div className="install-banner-left">
                      <div className="install-icon-wrap">
                        <Share2 size={18} className="text-accent" />
                      </div>
                      <div>
                        <strong>Mở VibeLoad chuẩn ứng dụng iOS</strong>
                        <p>
                          Nhấn nút <strong>Chia sẻ</strong> trên Safari rồi chọn{" "}
                          <strong>Thêm vào MH chính</strong> để dùng toàn màn hình Liquid Glass.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="icon-button close-banner mobile-close-btn"
                      onClick={dismissIosBanner}
                      aria-label="Bỏ qua"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="install-banner-actions">
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => setDialog("install")}
                    >
                      Xem hướng dẫn
                    </button>
                    <button
                      type="button"
                      className="icon-button close-banner desktop-close-btn"
                      onClick={dismissIosBanner}
                      aria-label="Bỏ qua"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              )}



              <section className="link-card card" aria-labelledby="link-title">

                <div className="section-title">

                  <span className="title-icon">

                    <Link size={21} />

                  </span>

                  <div>

                    <h2 id="link-title">Bạn muốn tải gì hôm nay?</h2>

                    <p>Dán liên kết media hoặc bài đăng từ nguồn được hỗ trợ.</p>

                  </div>

                  <span className="pill neutral">TẢI TRỰC TIẾP</span>

                </div>

                <form onSubmit={analyze} noValidate>

                  <label className="sr-only" htmlFor="media-url">

                    Liên kết media

                  </label>

                  <div

                    className={`url-field ${

                      sourceError

                        ? sourceError.unsupported

                          ? "has-warning"

                          : "has-error"

                        : ""

                    }`}

                  >

                    <Link size={21} />

                    <input

                      ref={inputRef}

                      id="media-url"

                      type="text"

                      inputMode="url"

                      autoCapitalize="none"

                      autoCorrect="off"

                      spellCheck={false}

                      autoComplete="off"

                      placeholder="https://example.com/video.mp4"

                      value={url}

                      onFocus={triggerPrewarm}

                      onChange={(event) => {

                        changeUrl(event.target.value);

                        triggerPrewarm();

                      }}

                      aria-describedby="url-help"

                      disabled={active}

                    />

                    <button

                      type="button"

                      className="paste-button"

                      disabled={active}

                      onClick={paste}

                    >

                      <Clipboard size={17} />

                      <span>Dán liên kết</span>

                    </button>

                    {url && (

                      <button

                        type="button"

                        className="icon-button clear-url"

                        aria-label="Xóa liên kết"

                        disabled={active}

                        onClick={() => changeUrl("")}

                      >

                        <X size={17} />

                      </button>

                    )}

                  </div>

                  <PlatformQuickChips

                    onSelect={(name) => {

                      setNotice(`Hỗ trợ tải từ ${name}. Hãy dán liên kết vào ô trên để phân tích.`);

                      inputRef.current?.focus();

                    }}

                  />



                  <div className="batch-toggle-bar">

                    <button

                      type="button"

                      className="batch-toggle-btn"

                      onClick={() => setIsBatchMode((prev) => !prev)}

                    >

                      <ListPlus size={15} />

                      {isBatchMode ? "Đóng tải hàng loạt" : "Dán hàng loạt nhiều link"}

                    </button>

                  </div>



                  {isBatchMode && (

                    <div className="batch-textarea-box">

                      <textarea

                        className="batch-textarea"

                        placeholder="Dán danh sách các liên kết vào đây (mỗi link 1 dòng)...&#10;https://www.tiktok.com/@...&#10;https://youtu.be/...&#10;https://on.soundcloud.com/..."

                        value={batchText}

                        onChange={(e) => setBatchText(e.target.value)}

                      />

                      <div className="batch-stats-bar">

                        <span>

                          {batchText.trim()

                            ? `Tìm thấy ${batchText.split("\n").filter((l) => l.trim().startsWith("http")).length} liên kết`

                            : "Hỗ trợ TikTok, YouTube, SoundCloud, Instagram, Facebook, Threads..."}

                        </span>

                        <button

                          type="button"

                          className="button secondary"

                          disabled={!batchText.trim() || batchProcessing}

                          onClick={handleStartBatch}

                        >

                          <ListPlus size={15} /> Thêm vào hàng đợi

                        </button>

                      </div>

                      {batchQueue.length > 0 && (

                        <div className="batch-queue-list">

                          <div className="batch-stats-bar" style={{ marginBottom: 4 }}>

                            <strong>Hàng đợi ({batchQueue.length} liên kết):</strong>

                            <button

                              type="button"

                              className="button primary"

                              style={{ padding: "4px 12px", fontSize: "11px", minHeight: "32px" }}

                              disabled={batchProcessing}

                              onClick={() => void processBatchQueue()}

                            >

                              {batchProcessing ? "Đang xử lý..." : "Bắt đầu phân tích tất cả"}

                            </button>

                          </div>

                          {batchQueue.map((item, idx) => (

                            <div key={item.id} className="batch-queue-item">

                              <span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--muted)" }}>#{idx + 1}</span>

                              <div className="batch-item-url" title={item.url}>

                                {item.title ? item.title : item.url}

                              </div>

                              <span style={{ fontSize: "11px" }}>

                                {item.status === "processing" ? (

                                  <span style={{ color: "var(--blue)" }}>Đang phân tích...</span>

                                ) : item.status === "ready" ? (

                                  <button

                                    type="button"

                                    className="text-button"

                                    style={{ color: "var(--green)", fontWeight: 700 }}

                                    onClick={() => {

                                      setUrl(item.url);

                                      setIsBatchMode(false);

                                      void analyze();

                                    }}

                                  >

                                    ✓ Mở tải

                                  </button>

                                ) : item.status === "failed" ? (

                                  <span style={{ color: "var(--warning)" }}>Lỗi</span>

                                ) : (

                                  <span style={{ color: "var(--muted)" }}>Chờ</span>

                                )}

                              </span>

                            </div>

                          ))}

                        </div>

                      )}

                    </div>

                  )}



                  <div className="input-actions">

                    <p id="url-help">

                      <LockKeyhole size={14} />

                      Liên kết mạng xã hội được gửi tới máy chủ để phân tích.

                    </p>

                    <button

                      type="submit"

                      className="button primary"

                      disabled={!url.trim() || checking || active || !online}

                    >

                      {checking ? (

                        <LoaderCircle size={18} className="spin" />

                      ) : (

                        <ArrowDownToLine size={19} />

                      )}

                      <span>

                        {checking ? "Đang kiểm tra URL…" : "Phân tích liên kết"}

                      </span>

                      {!checking && <ArrowRight size={18} className="btn-arrow-icon" />}

                    </button>

                  </div>

                </form>

                {checking && (

                  <>

                    <div className="source-feedback" role="status">

                      <LoaderCircle className="spin" size={18} />

                      <span>

                        {checkingStatus ||

                          (isPlatformUrl(url)

                            ? "Đang kết nối backend và phân tích nội dung..."

                            : "Đang kiểm tra URL, loại tệp và quyền đọc từ nguồn…")}

                      </span>

                      <button

                        className="text-button"

                        onClick={() => checkController.current?.abort()}

                      >

                        Hủy

                      </button>

                    </div>



                    {wakeSeconds >= 3 && (

                      <div className="wakeup-card" role="status">

                        <div className="wakeup-header">

                          <div className="wakeup-icon-pulse">

                            <CloudLightning size={20} />

                          </div>

                          <div className="wakeup-title-box">

                            <span className="wakeup-title">

                              Máy chủ đám mây đang thức dậy từ chế độ ngủ đông ({wakeSeconds}s)

                            </span>

                            <span className="wakeup-subtitle">

                              Đang khởi tạo môi trường cho lượt tải đầu tiên sau 15 phút không hoạt động...

                            </span>

                          </div>

                        </div>

                        <div className="wakeup-progress-bar">

                          <div

                            className="wakeup-progress-fill"

                            style={{ width: `${Math.min(95, Math.round((wakeSeconds / 35) * 100))}%` }}

                          />

                        </div>

                        <div className="wakeup-explain">

                          💡 <strong>Vì sao cần một chút thời gian?</strong> Máy chủ đám mây miễn phí tự động chuyển sang chế độ ngủ đông khi không có lượt truy cập để tiết kiệm năng lượng. Lượt tải đầu tiên mất khoảng <strong>25–40s</strong> để khởi động. Các lượt tải tiếp theo sẽ được xử lý siêu tốc!

                        </div>

                        <div className="wakeup-footer">

                          <a

                            href="https://github.com/tagiahuy14-pixel/vibeload-app/releases/download/v1.0.16/app-release.apk"

                            target="_blank"

                            rel="noopener noreferrer"

                            className="wakeup-android-pill"

                          >

                            <Smartphone size={13} /> Dùng App Android (Tải trực tiếp không cần máy chủ)

                          </a>

                          <button

                            type="button"

                            className="text-button"

                            onClick={() => checkController.current?.abort()}

                          >

                            Hủy kiểm tra

                          </button>

                        </div>

                      </div>

                    )}

                  </>

                )}

                {checkCancelled && (

                  <div className="source-feedback" role="status">

                    <Info size={18} />

                    Đã hủy kiểm tra URL.

                  </div>

                )}

                {sourceError && (

                  <div

                    className={`feedback ${sourceError.unsupported ? "warning" : "error"}`}

                    role="alert"

                  >

                    <Info size={21} />

                    <div>

                      <strong>

                        {sourceError.unsupported

                          ? "Nguồn chưa được hỗ trợ"

                          : "Không thể phân tích liên kết"}

                      </strong>

                      <p>{sourceError.message}</p>

                      {(sourceError.unsupported ||

                        sourceError.message.includes("riêng tư") ||

                        sourceError.message.includes("đăng nhập") ||

                        sourceError.message.includes("bot") ||

                        sourceError.message.includes("CAPTCHA") ||

                        isPlatformUrl(url)) && (

                        <>

                          <div className="unsupported-actions glass-action-group">

                            {getAppDeepLink(url) && (

                              <a

                                href={getAppDeepLink(url)!}

                                className="deep-link-action glass-secondary-btn"

                                title="Mở trực tiếp liên kết trong ứng dụng gốc"

                              >

                                <span className="btn-icon-col" aria-hidden="true">
                                  <Smartphone size={13} />
                                </span>
                                <span className="btn-label-col">Mở trong App gốc</span>

                              </a>

                            )}

                            {originalLink && (

                              <a

                                href={originalLink}

                                target="_blank"

                                rel="noopener noreferrer"

                                className="web-fallback-action glass-secondary-btn"

                              >

                                <span className="btn-icon-col" aria-hidden="true">
                                  <ExternalLink size={13} />
                                </span>
                                <span className="btn-label-col">Mở nội dung gốc</span>

                              </a>

                            )}

                            <a

                              href="https://github.com/tagiahuy14-pixel/vibeload-app/releases/download/v1.0.16/app-release.apk"

                              target="_blank"

                              rel="noopener noreferrer"

                              className="apk-bridge-action glass-secondary-btn"

                            >

                              <span className="btn-icon-col" aria-hidden="true">
                                <Download size={13} />
                              </span>
                              <span className="btn-label-col">Tải VibeLoad Android APK (v1.0.16)</span>

                            </a>

                          </div>

                          <div className="unsupported-guide">

                            <Smartphone size={16} />

                            <div className="unsupported-guide-content">

                              <span>

                                {url.toLowerCase().includes("youtu") ? (

                                  <>

                                    YouTube có thể đang giới hạn truy cập hoặc yêu cầu xác minh đối với máy chủ đám mây Web.

                                    Bạn hãy sử dụng ứng dụng <strong>VibeLoad Android</strong> (chạy trực tiếp trên mạng thiết bị của bạn) để tải video và âm thanh mượt mà không bị giới hạn.

                                  </>

                                ) : (

                                  <>

                                    Nếu nguồn có cơ chế giới hạn IP máy chủ, bạn có thể kiểm tra nội dung gốc hoặc dùng ứng dụng{" "}

                                    <strong>VibeLoad Android</strong>{" "}

                                    để phân tích trực tiếp trên thiết bị.

                                  </>

                                )}

                              </span>

                            </div>

                          </div>

                        </>

                      )}

                    </div>

                  </div>

                )}

                {source && (

                  <div className="source-result">

                    <div className="source-result-header">

                      <FileBadge kind={source.kind} small />

                      <div>

                        <span className="supported-label">

                          <CheckCheck size={15} /> Nguồn được hỗ trợ

                        </span>

                        <strong>{source.fileName}</strong>

                        <p>

                          {kindLabels[source.kind]} · {source.mime} ·{" "}

                          {source.size

                            ? formatBytes(source.size)

                            : "Chưa biết dung lượng"}

                        </p>

                      </div>

                    </div>

                    <label className="field-label" htmlFor="file-name">

                      Tên tệp khi lưu

                    </label>

                    <input

                      id="file-name"

                      className="text-input"

                      value={fileName}

                      maxLength={180}

                      onChange={(event) => setFileName(event.target.value)}

                    />

                    <div className="result-actions">

                      <p>

                        Giữ định dạng gốc. Giới hạn {settings.maxMiB} MiB / tệp.

                      </p>

                      <button

                        className="button primary"

                        disabled={busy || !online || !fileName.trim()}

                        onClick={() =>

                          void startDownload({

                            ...source,

                            fileName: sanitizeFileName(

                              fileName,

                              source.extension,

                            ),

                          })

                        }

                      >

                        <ArrowDownToLine size={18} />

                        Tải tệp gốc

                      </button>

                    </div>

                  </div>

                )}

                {backendData && (

                  <div className="source-result backend-result">

                    <div className="backend-head">

                      {backendData.thumbnail ? (

                        <img

                          src={backendData.thumbnail}

                          alt=""

                          className="media-thumb-preview"

                          onError={(e) => {

                            (e.target as HTMLElement).style.display = "none";

                          }}

                        />

                      ) : (

                        <FileBadge

                          kind={

                            backendData.is_photo_album

                              ? "image"

                              : backendData.is_audio_only

                                ? "audio"

                                : "video"

                          }

                          small

                        />

                      )}

                      <div className="backend-head-info">

                        <span className="supported-label">

                          <CheckCheck size={15} /> {backendData.platform.toUpperCase()}

                        </span>

                        <strong>{backendData.title}</strong>

                        <p>

                          {backendData.uploader}

                          {backendData.duration > 0

                            ? ` · ${Math.floor(backendData.duration / 60)}:${String(backendData.duration % 60).padStart(2, "0")}`

                            : ""}

                        </p>

                        <div className="backend-head-actions">

                          {backendData.thumbnail && (

                            <button

                              type="button"

                              className="qr-chip-button glass-secondary-btn"

                              onClick={() => void downloadThumbnail(backendData.thumbnail, backendData.title)}

                              title="Tải ảnh bìa chất lượng cao về máy"

                            >

                              <span className="btn-icon-col" aria-hidden="true">
                                <Image size={13} />
                              </span>
                              <span className="btn-label-col">Tải ảnh bìa HD</span>

                            </button>

                          )}

                          <button

                            type="button"

                            className="qr-chip-button glass-secondary-btn"

                            onClick={() => setQrModalData({ url: backendData.url, title: backendData.title })}

                            title="Quét mã QR để mở và tải trực tiếp trên điện thoại"

                          >

                            <span className="btn-icon-col" aria-hidden="true">
                              <QrCode size={13} />
                            </span>
                            <span className="btn-label-col">Quét sang điện thoại</span>

                          </button>

                          {getAppDeepLink(backendData.url) && (

                            <a

                              href={getAppDeepLink(backendData.url)!}

                              className="qr-chip-button glass-secondary-btn"

                              title="Mở nội dung trong ứng dụng di động gốc"

                            >

                              <span className="btn-icon-col" aria-hidden="true">
                                <Smartphone size={13} />
                              </span>
                              <span className="btn-label-col">Mở trong App gốc</span>

                            </a>

                          )}

                        </div>

                      </div>

                    </div>



                    {(() => {

                      const previewAudioUrl =

                        backendData.audio_options.find((a) => a.format_id?.startsWith("http"))?.format_id ||

                        (backendData.is_audio_only && backendData.video_options[0]?.format_id?.startsWith("http")

                          ? backendData.video_options[0].format_id

                          : null);



                      const h264Option = backendData.video_options.find(

                        (v) =>

                          v.format_id?.startsWith("http") &&

                          !v.format_id?.includes(".m3u8") &&

                          (v.vcodec === "h264" || v.vcodec?.toLowerCase().includes("avc"))

                      );

                      const fallbackVideoOption = backendData.video_options.find(

                        (v) => v.format_id?.startsWith("http") && !v.format_id?.includes(".m3u8")

                      );

                      const previewVideoUrl =

                        !backendData.is_audio_only && !backendData.is_photo_album

                          ? (h264Option || fallbackVideoOption)?.format_id || null

                          : null;



                      if (!previewAudioUrl && !previewVideoUrl) return null;



                      return (

                        <div className="inline-media-preview">

                          {previewAudioUrl && (

                            <>

                              <div className="inline-preview-header">

                                <span>🎵 Nghe thử trước khi tải:</span>

                              </div>

                              <audio

                                controls

                                src={previewAudioUrl}

                                className="inline-preview-audio"

                                preload="none"

                                crossOrigin="anonymous"


                                onPlay={() =>

                                  setupMediaSession(backendData.title, backendData.uploader, backendData.thumbnail)

                                }

                              />

                            </>

                          )}



                          {previewVideoUrl && (

                            <>

                              <div className={`inline-preview-header ${previewAudioUrl ? "has-top-gap" : ""}`}>

                                <span>🎬 Xem trước video:</span>

                                <button

                                  type="button"

                                  className="text-button"

                                  onClick={() => setShowVideoPreview((prev) => !prev)}

                                >

                                  {showVideoPreview ? "Thu gọn" : "Phát thử video"}

                                </button>

                              </div>

                              {showVideoPreview && (

                                <div className="inline-preview-video-box">

                                  <video

                                    controls

                                    playsInline

                                    crossOrigin="anonymous"

    
                                    src={previewVideoUrl}

                                    preload="metadata"

                                    onPlay={() =>

                                      setupMediaSession(backendData.title, backendData.uploader, backendData.thumbnail)

                                    }

                                  />

                                </div>

                              )}

                            </>

                          )}

                        </div>

                      );

                    })()}



                    {backendData.video_options.length === 0 && backendData.audio_options.length === 0 ? (

                      <div className="zero-options-container">

                        <div className="feedback warning zero-options-warning">

                          <Info size={19} />

                          <div>

                            <strong>Nguồn yêu cầu môi trường thiết bị di động</strong>

                            <p>

                              {backendData.error || "YouTube đang áp dụng cơ chế xác minh bot đối với IP máy chủ Web. Bạn có thể tải ngay ảnh bìa Full HD bên dưới, hoặc sử dụng ứng dụng VibeLoad Android (chạy trực tiếp trên thiết bị của bạn) để tải trọn bộ video & âm thanh tốc độ cao."}

                            </p>

                            <div className="unsupported-actions glass-action-group">

                              {getAppDeepLink(backendData.url) && (

                                <a

                                  href={getAppDeepLink(backendData.url)!}

                                  className="deep-link-action glass-secondary-btn"

                                >

                                  <span className="btn-icon-col" aria-hidden="true">
                                    <Smartphone size={14} />
                                  </span>
                                  <span className="btn-label-col">Mở trong App YouTube</span>

                                </a>

                              )}

                              <a

                                href="https://github.com/tagiahuy14-pixel/vibeload-app/releases/download/v1.0.16/app-release.apk"

                                target="_blank"

                                rel="noopener noreferrer"

                                className="apk-bridge-action glass-secondary-btn"

                              >

                                <span className="btn-icon-col" aria-hidden="true">
                                  <Download size={14} />
                                </span>
                                <span className="btn-label-col">Tải VibeLoad Android APK (v1.0.16)</span>

                              </a>

                              {backendData.platform === "youtube" && (

                                <a

                                  href={`https://cobalt.tools/#${encodeURIComponent(backendData.url)}`}

                                  target="_blank"

                                  rel="noopener noreferrer"

                                  className="web-fallback-action glass-secondary-btn"

                                  title="Mở trình tải video dự phòng trên trình duyệt web"

                                >

                                  <span className="btn-icon-col" aria-hidden="true">
                                    <ExternalLink size={13} />
                                  </span>
                                  <span className="btn-label-col">Tải video trên Web (Dự phòng)</span>

                                </a>

                              )}

                            </div>

                          </div>

                        </div>



                        <div className="thumbnail-feature-card">

                          <div className="thumb-feature-meta">

                            <span className="thumb-badge">Ảnh bìa chất lượng cao</span>

                            <span className="thumb-res">1920 × 1080 (MaxRes Full HD)</span>

                          </div>

                          <button

                            type="button"

                            className="button primary full-width thumb-cta-button"

                            disabled={!backendData.thumbnail}

                            onClick={() => void downloadThumbnail(backendData.thumbnail, backendData.title)}

                          >

                            <span className="btn-icon-col" aria-hidden="true">
                              <Image size={18} />
                            </span>
                            <span className="btn-label-col">Tải ảnh bìa Full HD</span>

                          </button>

                        </div>

                      </div>

                    ) : (

                      <>

                        <div className="format-controls">

                          {backendData.is_photo_album ? (

                            <div>

                              <div className="photo-album-header">

                                <label className="field-label" style={{ marginBottom: 0 }}>

                                  Album ảnh ({backendData.photos.length} ảnh)

                                </label>

                                <div className="photo-select-actions">

                                  <button

                                    type="button"

                                    onClick={selectAllPhotos}

                                    title="Chọn tất cả ảnh"

                                  >

                                    Chọn tất cả

                                  </button>

                                  <span>·</span>

                                  <button

                                    type="button"

                                    onClick={deselectAllPhotos}

                                    title="Bỏ chọn tất cả"

                                  >

                                    Bỏ chọn

                                  </button>

                                </div>

                              </div>

                              <div className="photos-scroll-row">

                                {backendData.photos.map((p) => {

                                  const isSelected = selectedPhotoIndices.includes(p.index);

                                  return (

                                    <div

                                      key={p.id}

                                      className={`photo-item-card ${isSelected ? "selected" : ""}`}

                                      onClick={() => togglePhotoSelection(p.index)}

                                      role="button"

                                      tabIndex={0}

                                    >

                                      <div className="photo-preview-wrap">

                                        <img

                                          src={p.thumbnail || p.url}

                                          alt={`Ảnh ${p.index}`}

                                          className="photo-thumb-card"

                                        />

                                        <span className="photo-index-badge">#{p.index}</span>

                                        <label

                                          className="photo-checkbox-label"

                                          title="Chọn ảnh này để tải"

                                          onClick={(e) => e.stopPropagation()}

                                        >

                                          <input

                                            type="checkbox"

                                            checked={isSelected}

                                            onChange={() => togglePhotoSelection(p.index)}

                                          />

                                        </label>

                                      </div>

                                      <button

                                        type="button"

                                        className="photo-download-btn"

                                        onClick={(e) => {

                                          e.stopPropagation();

                                          void downloadSinglePhoto(p.url, p.index, undefined, { skipPicker: true }).catch((error) => setNotice(errorText(error)));

                                        }}

                                        title={`Tải riêng ảnh #${p.index} dạng .JPG`}

                                      >

                                        <ArrowDownToLine size={12} /> Tải lẻ

                                      </button>

                                    </div>

                                  );

                                })}

                              </div>

                              {backendData.audio_options.length > 0 && (

                                <div

                                  className={`photo-music-card ${selectedDownloadType === "audio" ? "selected" : ""}`}

                                  onClick={() => {

                                    if (selectedDownloadType === "audio") {

                                      setSelectedDownloadType("photos");

                                      setFileName(sanitizeFileName(backendData.title, "zip"));

                                    } else {

                                      setSelectedDownloadType("audio");

                                      setSelectedBitrate(192);

                                      setFileName(sanitizeFileName(backendData.title, "mp3"));

                                    }

                                  }}

                                >

                                  <FileAudio size={20} className="music-icon" />

                                  <div className="photo-music-info">

                                    <strong>Nhạc nền bài đăng (MP3)</strong>

                                    <span>Tải riêng tệp âm thanh MP3 đính kèm của bài viết</span>

                                  </div>

                                  <div className="format-chip-badge" aria-hidden="true">

                                    {selectedDownloadType === "audio" ? (

                                      <div className="format-check-circle">

                                        <Check size={12} strokeWidth={3} />

                                      </div>

                                    ) : (

                                      <div className="format-empty-circle" />

                                    )}

                                  </div>

                                </div>

                              )}

                            </div>

                          ) : (

                            <>

                              <div
                                className="type-toggle-group"
                                data-active-type={selectedDownloadType}
                              >
                                {backendData.video_options.length > 0 && backendData.audio_options.length > 0 && (
                                  <div className="type-toggle-glass-slider" aria-hidden="true" />
                                )}
                                {backendData.video_options.length > 0 && (

                                  <button

                                    type="button"

                                    className={`type-toggle-btn ${selectedDownloadType === "video" ? "active" : ""}`}

                                    onClick={() => setSelectedDownloadType("video")}

                                  >

                                    <FileVideo size={15} /> Video (MP4)

                                  </button>

                                )}

                                {backendData.audio_options.length > 0 && (

                                  <button

                                    type="button"

                                    className={`type-toggle-btn ${selectedDownloadType === "audio" ? "active" : ""}`}

                                    onClick={() => setSelectedDownloadType("audio")}

                                  >

                                    <FileAudio size={15} /> Âm thanh (MP3)

                                  </button>

                                )}

                              </div>



                              {selectedDownloadType === "video" &&

                                backendData.video_options.length > 0 && (

                                  <div>

                                    <label

                                      className="field-label"

                                      style={{ marginBottom: 8 }}

                                    >

                                      Độ phân giải video

                                    </label>

                                    <div className="format-chips-grid">

                                      {backendData.video_options.map((opt) => {

                                        const isSelected = selectedFormat === opt.format_id;

                                        return (

                                          <button

                                            type="button"

                                            key={opt.format_id}

                                            className={`format-chip ${isSelected ? "selected" : ""}`}

                                            onClick={() => setSelectedFormat(opt.format_id)}

                                          >

                                            <div className="format-chip-content">

                                              <span className="format-chip-title">{opt.resolution}</span>

                                              <span className="format-chip-sub">

                                                {opt.filesize > 0

                                                  ? `~${formatBytes(opt.filesize)}`

                                                  : (opt.ext?.toUpperCase() || "MP4")}

                                              </span>

                                            </div>

                                            <div className="format-chip-badge" aria-hidden="true">

                                              {isSelected ? (

                                                <div className="format-check-circle">

                                                  <Check size={12} strokeWidth={3} />

                                                </div>

                                              ) : (

                                                <div className="format-empty-circle" />

                                              )}

                                            </div>

                                          </button>

                                        );

                                      })}

                                    </div>

                                    {backendData.video_options.some((v) => v.vcodec === "hevc" || v.resolution?.toLowerCase().includes("hevc")) && (

                                      <div className="codec-hint-tip">

                                        <span className="codec-hint-icon">💡</span>

                                        <span>

                                          <strong>Tại sao bản HD lại nhẹ hơn SD?</strong> Bản HD sử dụng chuẩn nén <strong>HEVC (H.265)</strong> thế hệ mới giúp tăng độ sắc nét nhưng tối ưu dung lượng nhẹ hơn ~40% so với bản SD (dùng chuẩn nén H.264 cũ hơn).

                                        </span>

                                      </div>

                                    )}

                                  </div>

                                )}



                              {selectedDownloadType === "audio" && (

                                <div>

                                  <label

                                    className="field-label"

                                    style={{ marginBottom: 8 }}

                                  >

                                    Chất lượng âm thanh MP3

                                  </label>

                                  <div className="format-chips-grid">

                                    {[

                                      { bitrate: 320, title: "320 kbps", label: "Cực cao (Studio)" },

                                      { bitrate: 256, title: "256 kbps", label: "Rất tốt (HQ)" },

                                      { bitrate: 192, title: "192 kbps", label: "Tiêu chuẩn (Khuyên dùng)" },

                                      { bitrate: 128, title: "128 kbps", label: "Tiết kiệm dung lượng" },

                                    ].map((item) => {

                                      const isSelected = selectedBitrate === item.bitrate;

                                      return (

                                        <button

                                          type="button"

                                          key={item.bitrate}

                                          className={`format-chip ${isSelected ? "selected" : ""}`}

                                          onClick={() => setSelectedBitrate(item.bitrate)}

                                        >

                                          <div className="format-chip-content">

                                            <span className="format-chip-title">{item.title}</span>

                                            <span className="format-chip-sub">{item.label}</span>

                                          </div>

                                          <div className="format-chip-badge" aria-hidden="true">

                                            {isSelected ? (

                                              <div className="format-check-circle">

                                                <Check size={12} strokeWidth={3} />

                                              </div>

                                            ) : (

                                              <div className="format-empty-circle" />

                                            )}

                                          </div>

                                        </button>

                                      );

                                    })}

                                  </div>

                                </div>

                              )}

                            </>

                          )}

                        </div>



                        <label className="field-label" htmlFor="backend-file-name">

                          Tên tệp khi lưu

                        </label>

                        <input

                          id="backend-file-name"

                          className="text-input"

                          value={fileName}

                          maxLength={180}

                          onChange={(event) => setFileName(event.target.value)}

                        />

                        <div className="result-actions">

                          <p>

                            {selectedDownloadType === "photos"

                              ? "Tải từng ảnh theo định dạng gốc hoặc đóng gói vào file nén .ZIP"

                              : selectedDownloadType === "audio"

                                ? "Trích xuất và chuyển đổi sang MP3"

                                : "Ghép luồng video + audio chất lượng cao"}

                          </p>

                          {selectedDownloadType === "photos" ? (

                            <>

                              <div className="photo-actions-row">

                                <button

                                  type="button"

                                  className="button primary"

                                  disabled={backendDownloading || !online || !fileName.trim() || selectedPhotoIndices.length === 0}

                                  onClick={() => void startBackendMediaDownload()}

                                  title="Đóng gói tất cả ảnh vào 1 tệp ZIP duy nhất (chỉ lưu 1 lần)"

                                >

                                  {backendDownloading ? (

                                    <>

                                      <LoaderCircle className="spin" size={18} />

                                      {backendProgressText || "Đang đóng gói ZIP..."}

                                    </>

                                  ) : backendDownloadSuccess ? (

                                    <>

                                      <Check size={18} />

                                      Đã tải ZIP (Bấm để tải lại)

                                    </>

                                  ) : (

                                    <>

                                      <FolderArchive size={18} />

                                      Tải trọn bộ Album (.ZIP) — Khuyên dùng

                                    </>

                                  )}

                                </button>

                                <button

                                  type="button"

                                  className="button secondary"

                                  disabled={backendDownloading || !online || selectedPhotoIndices.length === 0}

                                  onClick={() => void downloadMultiplePhotos(selectedPhotoIndices)}

                                  title="Tải ảnh rời theo định dạng gốc về thiết bị (trình duyệt có thể hỏi lưu từng ảnh)"

                                >

                                  <ArrowDownToLine size={16} />

                                  {selectedPhotoIndices.length > 0 &&

                                  selectedPhotoIndices.length < backendData.photos.length

                                    ? `Tải ${selectedPhotoIndices.length} ảnh rời`

                                    : "Tải từng ảnh rời (.JPG)"}

                                </button>

                              </div>

                              <div className="album-tip-note">

                                <span>💡 <strong>Mẹo:</strong> Chọn <strong>Tải trọn bộ Album (.ZIP)</strong> để chỉ cần lưu 1 lần cho tất cả ảnh, không bị trình duyệt mở cửa sổ chọn thư mục lặp đi lặp lại nhiều lần.</span>

                              </div>

                            </>

                          ) : (

                            <button

                              className="button primary"

                              disabled={backendDownloading || !online || !fileName.trim()}

                              onClick={() => void startBackendMediaDownload()}

                            >

                              {backendDownloading ? (

                                <>

                                  <LoaderCircle className="spin" size={18} />

                                  {backendProgressText || "Đang tải về máy..."}

                                </>

                              ) : backendDownloadSuccess ? (

                                <>

                                  <Check size={18} />

                                  Tệp đã sẵn sàng (Bấm để tải lại)

                                </>

                              ) : (

                                <>

                                  <ArrowDownToLine size={18} />

                                  Tải xuống

                                </>

                              )}

                            </button>

                          )}

                          {backendDownloading && (

                            <button type="button" className="button secondary" onClick={() => downloadController.current?.abort()}>

                              <X size={17} /> Hủy tải

                            </button>

                          )}

                          {selectedDownloadType === "audio" && !backendDownloading && (

                            <button

                              type="button"

                              className="button secondary"

                              disabled={!online}

                              onClick={async () => {

                                const audioUrl =

                                  backendData.audio_options.find((a) => a.format_id?.startsWith("http"))?.format_id ||

                                  (backendData.is_audio_only && backendData.video_options[0]?.format_id?.startsWith("http")

                                    ? backendData.video_options[0].format_id

                                    : null);

                                if (audioUrl) {

                                  try {

                                    setNotice("Đang tải dữ liệu âm thanh để mở bộ cắt nhạc chuông...");

                                    const res = await fetch(audioUrl);

                                    const b = await res.blob();

                                    setTrimmerTarget({ blob: b, fileName: sanitizeFileName(backendData.title, "wav") });

                                  } catch {

                                    setNotice("Không thể lấy luồng âm thanh trực tiếp. Bạn hãy bấm Tải xuống trước rồi cắt từ Thư viện.");

                                  }

                                } else {

                                  setNotice("Hãy tải tệp âm thanh về trước, sau đó bấm biểu tượng Cắt trong Thư viện.");

                                }

                              }}

                            >

                              <Scissors size={16} /> Cắt nhạc chuông 30s

                            </button>

                          )}

                        </div>

                      </>

                    )}

                  </div>

                )}

              </section>

              <SupportedPlatforms

                onSelectPlatform={(platform) => {

                  setNotice(`Đã chọn ${platform.name}: Hãy dán link để tải ${platform.tag}.`);

                  inputRef.current?.focus();

                }}

              />

              <section className="recent-section card">

                <div className="section-heading">

                  <h2>

                    <span className="dot-icon" />

                    Gần đây của bạn

                  </h2>

                  <button

                    className="text-button"

                    onClick={() => navigate("library")}

                  >

                    Mở thư viện <ArrowRight size={16} />

                  </button>

                </div>

                {history.length ? (

                  history.slice(0, 3).map(historyRow)

                ) : (

                  <div className="recent-empty">

                    <span>

                      <FolderOpen size={26} strokeWidth={1.4} />

                    </span>

                    <div>

                      <strong>Mọi cảm hứng đều bắt đầu từ một liên kết</strong>

                      <p>Những tệp bạn đã nhận sẽ xuất hiện tại đây.</p>

                    </div>

                    <ArrowDownToLine size={22} />

                  </div>

                )}

              </section>

              <div className="how-it-works">

                <span>

                  <b>01</b>Dán liên kết

                </span>

                <ChevronRight size={15} />

                <span>

                  <b>02</b>Kiểm tra nguồn

                </span>

                <ChevronRight size={15} />

                <span>

                  <b>03</b>Tải & lưu tệp

                </span>

              </div>

            </>

          )}



          {route === "downloads" && (

            <>

              <div className="page-heading">

                <div>

                  <span className="eyebrow">TỆP ĐI THẲNG ĐẾN BẠN</span>

                  <h1>Tải xuống</h1>

                  <p>Theo dõi tác vụ đang mở trong trình duyệt này.</p>

                </div>

                <span className="pill neutral">

                  {active ? "1 tác vụ đang tải" : "Không có tác vụ chạy"}

                </span>

              </div>

              {!task ? (

                <section className="card">

                  <EmptyState

                    icon={Download}

                    title="Sẵn sàng cho liên kết đầu tiên"

                    action={

                      <button

                        className="button primary"

                        onClick={() => navigate("home")}

                      >

                        <Plus size={18} />

                        Thêm liên kết

                      </button>

                    }

                  >

                    Dán một liên kết tệp trực tiếp ở Trang chủ để bắt đầu.

                  </EmptyState>

                </section>

              ) : (

                <section className="task-card card">

                  <div className="task-head">

                    <FileBadge kind={task.info.kind} />

                    <div>

                      <span

                        className={`pill ${task.status === "complete" ? "success" : task.status === "failed" ? "error" : "neutral"}`}

                      >

                        {task.status === "downloading"

                          ? "Đang tải"

                          : task.status === "complete"

                            ? "Hoàn thành truyền dữ liệu"

                            : task.status === "failed"

                              ? "Thất bại"

                              : "Đã hủy"}

                      </span>

                      <h2>{task.info.fileName}</h2>

                      <p>

                        {kindLabels[task.info.kind]} · {task.info.mime}

                      </p>

                    </div>

                  </div>

                  {active && (

                    <>

                      <div className="progress-heading">

                        <span>

                          {percent !== null

                            ? "Đang nhận dữ liệu từ nguồn"

                            : "Đang nhận dữ liệu · Chưa biết tổng dung lượng"}

                        </span>

                        {percent !== null && <strong>{percent}%</strong>}

                      </div>

                      <progress

                        className="download-progress"

                        max={task.total ?? undefined}

                        value={task.total ? task.received : undefined}

                        aria-label="Tiến trình tải"

                      />

                      <div className="progress-meta">

                        <span>

                          {formatBytes(task.received)}

                          {task.total

                            ? ` / ${formatBytes(task.total)}`

                            : " đã nhận"}

                        </span>

                        <span>

                          <ShieldCheck size={14} /> Truyền trực tiếp

                        </span>

                      </div>

                      <div className="task-actions">

                        <button

                          className="button secondary"

                          onClick={() => downloadController.current?.abort()}

                        >

                          <X size={17} />

                          Hủy tải

                        </button>

                      </div>

                    </>

                  )}

                  {task.status === "complete" && (

                    <>

                      <div className="completion-note">

                        <span>

                          <Check size={24} />

                        </span>

                        <div>

                          <strong>

                            Đã tải xong {formatBytes(task.received)}

                          </strong>

                          <p>

                            Tệp đã được lưu xuống thiết bị. Bạn có thể bấm “Lưu tệp” để tải lại nếu cần.

                          </p>

                        </div>

                      </div>

                      {managed.has(task.id) ? (

                        <div className="task-actions">

                          <button

                            className="button secondary"

                            onClick={() => {

                              setPreview(task.id);

                              navigate("library");

                            }}

                          >

                            <FolderOpen size={18} />

                            Xem tệp

                          </button>

                          {canNativeShareBlob(
                            managed.get(task.id)!.blob,
                            managed.get(task.id)!.info.fileName,
                          ) && (
                            <button
                              type="button"
                              className="button secondary"
                              disabled={saving}
                              onClick={() => void shareManaged(task.id)}
                            >
                              <Share2 size={17} />
                              Chia sẻ / Lưu Ảnh
                            </button>
                          )}

                          <button

                            className="button primary"

                            disabled={saving}

                            onClick={() => void save(task.id)}

                          >

                            {saving ? (

                              <LoaderCircle className="spin" size={18} />

                            ) : (

                              <ArrowDownToLine size={18} />

                            )}

                            Lưu tệp

                          </button>

                        </div>

                      ) : (

                        <div className="inline-note">

                          <Info size={18} />

                          Tệp không còn trong bộ nhớ phiên. Bạn có thể chọn lại

                          tệp từ thiết bị.

                        </div>

                      )}

                    </>

                  )}

                  {task.status === "failed" && (

                    <div className="feedback error" role="alert">

                      <Info size={21} />

                      <div>

                        <strong>Không nhận được tệp hợp lệ</strong>

                        <p>{task.error}</p>

                      </div>

                    </div>

                  )}

                  {task.status === "cancelled" && (

                    <div className="inline-note">

                      <Info size={19} />

                      Đã hủy tác vụ. Dữ liệu tải dở được bỏ, không tạo tệp hoàn

                      thành.

                    </div>

                  )}

                  {(task.status === "failed" ||

                    task.status === "cancelled") && (

                    <div className="task-actions">

                      <button

                        className="button primary"

                        disabled={busy || !online}

                        onClick={() => void startDownload(task.info)}

                      >

                        Thử lại <ArrowRight size={17} />

                      </button>

                    </div>

                  )}

                </section>

              )}

              <div className="info-grid">

                <div className="info-card">

                  <Monitor size={23} />

                  <h3>Giữ ứng dụng đang mở</h3>

                  <p>

                    Đóng tab, khóa màn hình hoặc hệ điều hành thu hồi bộ nhớ có

                    thể làm dừng tải. Không có hàng đợi tải nền.

                  </p>

                </div>

                <div className="info-card">

                  <HardDrive size={23} />

                  <h3>Chủ động lưu tệp</h3>

                  <p>

                    VibeLoad giữ một tệp trong RAM. Tải tệp mới hoặc tải lại

                    trang sẽ giải phóng tệp cũ. Giới hạn hiện tại:{" "}

                    {settings.maxMiB} MiB.

                  </p>

                </div>

              </div>

            </>

          )}



          {route === "library" && (

            <>

              <div className="page-heading">

                <div>

                  <span className="eyebrow">NHỮNG GÌ BẠN ĐÃ LƯU GIỮ</span>

                  <h1>Thư viện</h1>

                  <p>

                    Lịch sử trên trình duyệt này. Mở lại media bằng tệp từ thiết

                    bị.

                  </p>

                </div>

                <button

                  className="button primary"

                  disabled={busy}

                  onClick={() => pickerRef.current?.click()}

                >

                  {opening ? (

                    <LoaderCircle size={18} className="spin" />

                  ) : (

                    <FolderOpen size={18} />

                  )}

                  Mở từ thiết bị

                </button>

              </div>

              <div className="inline-note library-note">

                <ShieldCheck size={19} />

                <span>

                  Tệp bạn chọn được xử lý cục bộ. Website không tự đọc thư mục

                  Downloads và không tải tệp lên Cloud.

                </span>

              </div>

              {selected && (

                <section className="card preview-card">

                  <div className="section-heading">

                    <h2>{selected.info.fileName}</h2>

                    <button

                      className="icon-button"

                      aria-label="Đóng xem trước"

                      onClick={() => setPreview(null)}

                    >

                      <X size={19} />

                    </button>

                  </div>

                  <MediaPreview key={preview} managed={selected} />

                  <div className="result-actions">

                    <span>

                      {kindLabels[selected.info.kind]} ·{" "}

                      {formatBytes(selected.blob.size)}

                    </span>

                    <div className="preview-action-group">
                      {preview &&
                        canNativeShareBlob(
                          selected.blob,
                          selected.info.fileName,
                        ) && (
                          <button
                            type="button"
                            className="button secondary"
                            disabled={saving}
                            onClick={() => void shareManaged(preview)}
                          >
                            <Share2 size={17} />
                            Chia sẻ / Lưu Ảnh
                          </button>
                        )}

                      <button

                        className="button secondary"

                        disabled={saving}

                        onClick={() => preview && void save(preview)}

                      >

                        <ArrowDownToLine size={17} />

                        Lưu tệp

                      </button>
                    </div>

                  </div>

                </section>

              )}

              <section className="card library-card">

                <div className="library-backup-bar">

                  <button

                    type="button"

                    className="library-backup-btn"

                    onClick={exportHistoryToJson}

                    title="Xuất file JSON sao lưu lịch sử thư viện"

                  >

                    <Download size={13} /> Xuất sao lưu (.JSON)

                  </button>

                  <button

                    type="button"

                    className="library-backup-btn"

                    onClick={() => jsonBackupInputRef.current?.click()}

                    title="Khôi phục thư viện từ file JSON đã sao lưu"

                  >

                    <Upload size={13} /> Khôi phục thư viện

                  </button>

                  <input

                    ref={jsonBackupInputRef}

                    type="file"

                    accept=".json"

                    style={{ display: "none" }}

                    onChange={importHistoryFromJson}

                  />

                </div>

                <div className="library-toolbar">

                  <div className="search-field">

                    <Search size={18} />

                    <input

                      aria-label="Tìm trong thư viện"

                      placeholder="Tìm tên tệp…"

                      value={search}

                      onChange={(event) => setSearch(event.target.value)}

                    />

                  </div>

                  <label className="sort-field">

                    <span className="sr-only">Sắp xếp</span>

                    <select

                      aria-label="Sắp xếp"

                      value={sort}

                      onChange={(event) => setSort(event.target.value)}

                    >

                      <option value="newest">Mới nhất</option>

                      <option value="oldest">Cũ nhất</option>

                      <option value="name">Tên A–Z</option>

                      <option value="size">Dung lượng</option>

                    </select>

                  </label>

                </div>

                <div
                  className="filters"
                  aria-label="Lọc loại tệp"
                  data-active-filter={filter}
                >
                  <div className="filters-glass-slider" aria-hidden="true" />
                  {(["all", "video", "audio", "image"] as const).map((kind) => (

                    <button

                      key={kind}

                      className={filter === kind ? "selected" : ""}

                      aria-pressed={filter === kind}

                      onClick={() => {

                        triggerHaptic(10);

                        setFilter(kind);

                      }}

                    >

                      {kind === "all" ? "Tất cả" : kindLabels[kind]}

                      <span>

                        {

                          history.filter(

                            (item) => kind === "all" || item.kind === kind,

                          ).length

                        }

                      </span>

                    </button>

                  ))}

                </div>

                <div
                  ref={platformFiltersRef}
                  className="filters platform-filters"
                  aria-label="Lọc theo nền tảng"
                  data-active-platform={libraryPlatformFilter}
                >
                  <div className="platform-filters-glass-slider" aria-hidden="true" />
                  {[
                    { id: "all", label: "Tất cả nguồn" },
                    { id: "tiktok", label: "TikTok" },
                    { id: "youtube", label: "YouTube" },
                    { id: "pinterest", label: "Pinterest" },
                    { id: "soundcloud", label: "SoundCloud" },
                    { id: "threads", label: "Threads" },
                    { id: "facebook", label: "Facebook" },
                  ].map((p) => {
                    const count = history.filter(
                      (item) => p.id === "all" || getItemPlatform(item.fileName) === p.id,
                    ).length;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={libraryPlatformFilter === p.id ? "selected" : ""}
                        aria-pressed={libraryPlatformFilter === p.id}
                        onClick={(e) => {
                          triggerHaptic(10);
                          setLibraryPlatformFilter(p.id);
                          const container = platformFiltersRef.current;
                          const btn = e.currentTarget;
                          if (container && btn) {
                            const targetScrollLeft =
                              btn.offsetLeft - container.clientWidth / 2 + btn.offsetWidth / 2;
                            container.scrollTo({
                              left: Math.max(0, targetScrollLeft),
                              behavior: "smooth",
                            });
                          }
                        }}
                      >
                        {p.label}
                        <span>{count}</span>
                      </button>
                    );
                  })}
                </div>

                {visibleItems.length ? (

                  <div>{visibleItems.map(historyRow)}</div>

                ) : (

                  <EmptyState

                    icon={Library}

                    title={

                      history.length

                        ? "Chưa tìm thấy tệp phù hợp"

                        : "Thư viện đang chờ bạn"

                    }

                  >

                    {history.length

                      ? "Thử tìm tên khác hoặc đổi bộ lọc."

                      : "Tải một tệp trực tiếp hoặc chọn media từ thiết bị để bắt đầu."}

                  </EmptyState>

                )}

              </section>

            </>

          )}



          {route === "settings" && (

            <>

              <div className="page-heading">

                <div>

                  <span className="eyebrow">THEO CÁCH CỦA BẠN</span>

                  <h1>Cài đặt</h1>

                  <p>Một chút tinh chỉnh cho trải nghiệm của bạn.</p>

                </div>

                <Settings2 size={35} className="heading-icon" />

              </div>

              <section className="card settings-card">

                <div className="setting-section-title">

                  <Sun size={21} />

                  <h2>Giao diện hiển thị</h2>

                </div>

                <div
                  className="theme-options"
                  data-active-theme={settings.theme}
                >
                  <div className="theme-options-glass-slider" aria-hidden="true" />
                  {(

                    [

                      { id: "light", icon: Sun, title: "Sáng" },

                      { id: "dark", icon: Moon, title: "Tối" },

                      { id: "system", icon: Laptop, title: "Theo hệ thống" },

                    ] as const

                  ).map((item) => (

                    <button

                      key={item.id}

                      aria-pressed={settings.theme === item.id}

                      className={`theme-option ${item.id} ${settings.theme === item.id ? "selected" : ""}`}

                      onClick={() => changeTheme(item.id)}

                    >

                      <span className="theme-mini">

                        <span />

                        <span />

                        <span />

                      </span>

                      <span>

                        <item.icon size={17} />

                        {item.title}

                        {settings.theme === item.id && <Check size={17} />}

                      </span>

                    </button>

                  ))}

                </div>

              </section>

              <section className="card settings-card">

                <div className="setting-section-title">

                  <HardDrive size={21} />

                  <h2>Tải xuống & dữ liệu cục bộ</h2>

                </div>

                <div className="setting-row">

                  <div>

                    <strong>Giới hạn dung lượng mỗi tệp</strong>

                    <p>

                      Tệp được nhận vào RAM. Chọn mức thấp hơn trên điện thoại

                      ít bộ nhớ.

                    </p>

                  </div>

                  <select

                    aria-label="Giới hạn dung lượng mỗi tệp"

                    value={settings.maxMiB}

                    disabled={busy}

                    onChange={(event) =>

                      setSettings((previous) => ({

                        ...previous,

                        maxMiB: Number(

                          event.target.value,

                        ) as Settings["maxMiB"],

                      }))

                    }

                  >

                    <option value={25}>25 MiB</option>

                    <option value={50}>50 MiB</option>

                    <option value={100}>100 MiB</option>

                  </select>

                </div>

                <div className="setting-row">

                  <div>

                    <strong>Ghi nhớ lịch sử trong trình duyệt</strong>

                    <p>

                      Chỉ lưu tên, loại, dung lượng và thời gian. Không lưu liên

                      kết nguồn hoặc nội dung tệp.

                    </p>

                  </div>

                  <button

                    className={`toggle ${settings.rememberHistory ? "on" : ""}`}

                    role="switch"

                    aria-label="Ghi nhớ lịch sử"

                    aria-checked={settings.rememberHistory}

                    onClick={() =>

                      setSettings((previous) => ({

                        ...previous,

                        rememberHistory: !previous.rememberHistory,

                      }))

                    }

                  >

                    <span />

                  </button>

                </div>

                <div className="setting-row">

                  <div>

                    <strong>Xóa lịch sử VibeLoad</strong>

                    <p>

                      Xóa danh sách và giải phóng tệp đang giữ trong RAM. Không

                      xóa tệp đã lưu trên thiết bị.

                    </p>

                  </div>

                  <button

                    className="button danger-button"

                    disabled={busy || !history.length}

                    onClick={() => setDialog("clear")}

                  >

                    <Trash2 size={17} />

                    Xóa lịch sử

                  </button>

                </div>

              </section>

              <section className="card settings-card">

                <div className="setting-section-title">

                  <Smartphone size={21} />

                  <h2>Ứng dụng Web (PWA)</h2>

                </div>

                <div className="setting-row">

                  <div>

                    <strong>

                      {pwa.installed

                        ? "Đang mở ở chế độ ứng dụng"

                        : "Mang VibeLoad ra màn hình chính"}

                    </strong>

                    <p>

                      {pwa.failure

                        ? "Chưa đăng ký được service worker. Hãy kiểm tra kết nối hoặc quyền của trình duyệt."

                        : pwa.ready

                          ? "Giao diện đã sẵn sàng ngoại tuyến. Tải media vẫn cần Internet."

                          : import.meta.env.DEV

                            ? "PWA chỉ bật trên bản build production và HTTPS hoặc localhost."

                            : "Trạng thái cache ngoại tuyến chưa được xác nhận trên trình duyệt này."}

                    </p>

                  </div>

                  <button

                    className="button secondary glass-secondary-btn"

                    onClick={() =>

                      pwa.canInstall ? void pwa.install() : setDialog("install")

                    }

                  >

                    <span className="btn-icon-col" aria-hidden="true">
                      <Plus size={17} />
                    </span>
                    <span className="btn-label-col">
                      {pwa.installed ? "Hướng dẫn" : "Cài ứng dụng"}
                    </span>

                  </button>

                </div>

              </section>

              {!applePlatform.isApple && (
                <section className="card settings-card">

                  <div className="setting-section-title">

                    <Smartphone size={21} />

                    <h2>Ứng dụng Android (VibeLoad App)</h2>

                    <span className="pill neutral settings-badge-right">v1.0.16</span>

                  </div>

                  <div className="setting-row">

                    <div>

                      <strong>Tải trực tiếp trên thiết bị (100% On-Device)</strong>

                      <p>

                        Bản cập nhật <strong>v1.0.16</strong>: Cải tiến giao diện nút chọn chất lượng siêu nổi bật (viền 2dp, badge tích xanh), bộ làm sạch tên file lưu trữ thông minh và cài làm nhạc chuông/báo thức 1 chạm.

                      </p>

                    </div>

                    <a

                      href="https://github.com/tagiahuy14-pixel/vibeload-app/releases/download/v1.0.16/app-release.apk"

                      className="button secondary glass-secondary-btn"

                      target="_blank"

                      rel="noopener noreferrer"

                    >

                      <span className="btn-icon-col" aria-hidden="true">
                        <Download size={17} />
                      </span>
                      <span className="btn-label-col">Tải APK v1.0.16</span>

                    </a>

                  </div>

                </section>
              )}

              <section className="about-card">

                <img src="/icons/icon-192.png" width="52" height="52" alt="" />

                <div>

                  <h2>

                    VibeLoad Web <span>v1.0.16</span>

                  </h2>

                  <p>Không tài khoản · Không quảng cáo · Không analytics</p>

                  <p>

                    Tải tệp trực tiếp từ nguồn hoặc dùng máy chủ phân tích liên kết,

                    xử lý video 4K/HD, MP3 320k và album ảnh từ TikTok, YouTube, SoundCloud, Instagram, Facebook, Threads.

                  </p>

                </div>

                <button

                  className="icon-button"

                  aria-label="Giới hạn và quyền riêng tư"

                  onClick={() => setDialog("help")}

                >

                  <ArrowUpRight size={20} />

                </button>

              </section>

              <button

                className="text-button reset-theme"

                onClick={() => setSettings(defaults)}

              >

                Khôi phục thiết lập mặc định

              </button>

            </>

          )}

          <footer className="page-footer">

            <span>

              <ShieldCheck size={14} />

              Được tạo để tôn trọng quyền riêng tư

            </span>

            <span>Chỉ tải nội dung bạn có quyền sử dụng.</span>

          </footer>

        </main>

      </div>

      <nav
        className="mobile-nav"
        aria-label="Điều hướng di động"
        data-active-route={route}
      >
        <div className="mobile-nav-glass-slider" aria-hidden="true" />
        {routes.map((item) => (

          <a

            href={item.path}

            key={item.id}

            className={route === item.id ? "active" : ""}

            aria-current={route === item.id ? "page" : undefined}

            onClick={(event) => {

              event.preventDefault();

              navigate(item.id);

            }}

          >

            <span>

              <item.icon size={22} />

              {item.id === "downloads" && active && <b />}

            </span>

            {item.label}

          </a>

        ))}

      </nav>

      <input

        ref={pickerRef}

        className="sr-only"

        type="file"

        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/tiff,image/x-icon,video/mp4,video/webm,audio/*"

        aria-label="Chọn media từ thiết bị"

        onChange={(event) => void openFile(event.target.files?.[0])}

      />

      {notice && (

        <div className="toast" role="status">

          <Info size={20} />

          <span>{notice}</span>

          <button

            className="icon-button"

            aria-label="Đóng thông báo"

            onClick={() => setNotice("")}

          >

            <X size={17} />

          </button>

        </div>

      )}

      <dialog

        ref={dialogRef}

        className="dialog"

        onCancel={() => setDialog(null)}

        onClick={(event) => {

          if (event.target === dialogRef.current) setDialog(null);

        }}

        aria-labelledby="dialog-title"

      >

        <div className="dialog-head">

          <h2 id="dialog-title">

            {dialog === "clear"

              ? "Xóa lịch sử VibeLoad?"

              : dialog === "install"

                ? "Cài VibeLoad trên thiết bị"

                : "VibeLoad Web có thể làm gì?"}

          </h2>

          <button

            className="icon-button"

            aria-label="Đóng hộp thoại"

            onClick={() => setDialog(null)}

          >

            <X size={20} />

          </button>

        </div>

        {dialog === "clear" ? (

          <>

            <p>

              Danh sách lịch sử và tệp trong bộ nhớ phiên sẽ được bỏ. Những tệp

              đã lưu trên thiết bị vẫn giữ nguyên.

            </p>

            <div className="dialog-actions">

              <button

                className="button secondary"

                onClick={() => setDialog(null)}

              >

                Giữ lại

              </button>

              <button

                className="button danger-button"

                onClick={() => {

                  setHistory([]);

                  setManaged(new Map());

                  setPreview(null);

                  setTask(null);

                  setDialog(null);

                  setNotice("Đã xóa lịch sử cục bộ.");

                }}

              >

                Xóa lịch sử

              </button>

            </div>

          </>

        ) : dialog === "install" ? (

          <>

            <p>

              Khả năng cài đặt tùy thuộc hệ điều hành và trình duyệt. Website

              cần chạy trên HTTPS hoặc localhost.

            </p>

            <div className="instruction-row">

              <Share2 size={22} />

              <div>

                <strong>iPhone / iPad · Safari</strong>

                <p>
                  Nhấn biểu tượng Chia sẻ trên thanh Safari → “Thêm vào MH chính” → Thêm để mở toàn màn hình chuẩn Liquid Glass.
                </p>

              </div>

            </div>

            <div className="instruction-row">

              <Laptop size={22} />

              <div>

                <strong>Mac · Safari (macOS Sonoma / Tahoe+)</strong>

                <p>
                  Chọn menu Tệp (File) → “Thêm vào Dock…” (Add to Dock) để chạy VibeLoad như ứng dụng độc lập trên macOS.
                </p>

              </div>

            </div>

            <div className="instruction-row">

              <Smartphone size={22} />

              <div>

                <strong>Android & Máy tính · Chrome / Edge</strong>

                <p>

                  Mở menu ⋮ hoặc biểu tượng cài đặt trên thanh địa chỉ → “Cài đặt ứng dụng” / “Thêm vào màn hình chính”.

                </p>

              </div>

            </div>

            <div className="inline-note">

              <Info size={19} />

              PWA chỉ cache giao diện. Tải media cần Internet và giữ ứng dụng

              mở.

            </div>

          </>

        ) : (

          <>

            <p>

              VibeLoad Web tải tệp trực tiếp từ nguồn về trình duyệt, không dùng

              máy chủ trung gian.

            </p>

            <ul className="help-list">

              <li>

                <Check size={18} />

                <span>

                  Ảnh raster, MP4/WebM và audio trực tiếp, khi nguồn cho phép

                  CORS. Kiểm tra chữ ký, MIME và dung lượng trước khi cung cấp

                  tệp lưu.

                </span>

              </li>

              <li>

                <Info size={18} />

                <span>

                  Trang YouTube, TikTok, album TikTok và các trang mạng xã hội

                  chưa hỗ trợ tải trực tiếp. Không có scraper, vượt DRM hoặc

                  chuyển đổi MP3.

                </span>

              </li>

              <li>

                <Smartphone size={18} />

                <span>

                  Để tải video từ TikTok, YouTube, Instagram hay Facebook, hãy sử

                  dụng ứng dụng <strong>VibeLoad Android</strong> để trích xuất

                  video chất lượng cao, âm thanh MP3 và album ảnh.

                </span>

              </li>

              <li>

                <HardDrive size={18} />

                <span>

                  Giữ một tệp tối đa {settings.maxMiB} MiB trong RAM. Lưu trước

                  khi đóng tab hoặc tải tệp mới. Lịch sử không phải bản sao lưu

                  tệp.

                </span>

              </li>

              <li>

                <ShieldCheck size={18} />

                <span>

                  Không tài khoản, mật khẩu, quảng cáo hay analytics. Thiết lập

                  và lịch sử ở trình duyệt. Nguồn nhận yêu cầu tải sẽ thấy IP

                  của bạn như khi truy cập trực tiếp.

                </span>

              </li>

            </ul>

            <div className="inline-note">

              <Info size={19} />

              Khi không đọc được nguồn, có thể do CORS, mạng, TLS, URL hết hạn

              hoặc quyền truy cập. VibeLoad không bỏ qua bảo vệ của nguồn.

            </div>

          </>

        )}

      </dialog>

      {trimmerTarget && (

        <AudioTrimmerModal

          blob={trimmerTarget.blob}

          fileName={trimmerTarget.fileName}

          onClose={() => setTrimmerTarget(null)}

          onNotice={setNotice}

        />

      )}

      {qrModalData && (

        <QRCodeModal

          url={qrModalData.url}

          title={qrModalData.title}

          onClose={() => setQrModalData(null)}

        />

      )}

      <LiquidTouchSpecularLayer />

    </div>

  );

}

