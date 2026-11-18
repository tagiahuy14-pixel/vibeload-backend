export interface VideoOption {
  format_id: string;
  resolution: string;
  height: number;
  width: number;
  ext: string;
  filesize: number;
  vcodec?: string;
  acodec?: string;
  needs_merge: boolean;
}

export interface AudioOption {
  format_id: string;
  ext: string;
  abr: number;
  filesize: number;
  acodec?: string;
}

export interface PhotoItem {
  id: string;
  index: number;
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
}

export interface BackendAnalyzeResponse {
  success: boolean;
  url: string;
  title: string;
  thumbnail: string;
  uploader: string;
  duration: number;
  platform: string;
  is_photo_album: boolean;
  is_audio_only: boolean;
  video_options: VideoOption[];
  audio_options: AudioOption[];
  photos: PhotoItem[];
  error?: string;
}

export interface FileInfo {
  filename: string;
  filesize: number;
  content_type: string;
  has_video: boolean;
  has_audio: boolean;
  is_zip: boolean;
}

export interface BackendJobResponse {
  id: string;
  status: "queued" | "downloading" | "processing" | "completed" | "failed" | "cancelled";
  progress_percent: number;
  downloaded_bytes: number;
  total_bytes: number;
  speed_bytes_sec: number;
  eta_seconds: number;
  error?: string;
  file_info?: FileInfo;
  created_at: number;
  updated_at: number;
}

export interface BackendDownloadRequest {
  url: string;
  download_type: "video" | "audio" | "photos" | "single_photo";
  format_id?: string;
  audio_bitrate?: number;
  photo_indices?: number[];
}

export interface HealthResponse {
  status: string;
  yt_dlp_version: string;
  has_ffmpeg: boolean;
  has_ffprobe: boolean;
  active_jobs: number;
  storage_used_mb: number;
  storage_free_mb: number;
}

export class BackendError extends Error {
  constructor(message: string, readonly status = 0, readonly code = "", readonly retryable = false) {
    super(message);
    this.name = "BackendError";
  }
}

function retryDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", aborted); resolve(); }, milliseconds);
    signal?.addEventListener("abort", aborted, { once: true });
  });
}

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (envUrl && typeof envUrl === "string") {
    const parsed = new URL(envUrl.trim());
    if (parsed.username || parsed.password || parsed.search || parsed.hash ||
        (parsed.protocol !== "https:" && !(import.meta.env.DEV && parsed.protocol === "http:"))) {
      throw new Error("Cấu hình địa chỉ backend không hợp lệ; cần URL HTTPS.");
    }
    return parsed.href.replace(/\/+$/, "");
  }
  if (import.meta.env.PROD) throw new Error("Chưa cấu hình backend. Cần đặt VITE_API_URL trên Vercel và build lại frontend.");
  return "";
}

export async function requireApiResponse(res: Response, context: "api" | "job" = "api"): Promise<void> {
  if (res.ok && res.headers.get("content-type")?.includes("application/json")) return;
  let message = res.status === 404
    ? "Nội dung hoặc endpoint không tồn tại."
    : res.status >= 500
      ? "Backend đang gặp lỗi. Vui lòng thử lại sau."
      : "Yêu cầu tới backend không thành công.";
  let code = "";
  let retryable = [429, 502, 503, 504].includes(res.status);
  try {
    const data = await res.json();
    code = typeof data?.error?.code === "string" ? data.error.code : "";
    if (typeof data?.error?.retryable === "boolean") retryable = data.error.retryable;
    if (typeof data?.error?.message === "string") message = data.error.message;
    else if (typeof data?.detail === "string") message = data.detail;
    if (data?.error?.requestId) message += ` (Mã: ${data.error.requestId})`;
  } catch { /* Render can return HTML while waking up or failing. */ }
  if (context === "job" && res.status === 404) {
    message += " Tác vụ hoặc tệp tạm đã mất/hết hạn; backend có thể đã khởi động lại. Hãy phân tích và tải lại.";
  }
  throw new BackendError(message, res.status, code, retryable);
}

export async function waitForBackend(
  signal?: AbortSignal,
  onProgress?: (secondsWaited: number) => void,
): Promise<void> {
  const base = getApiBaseUrl();
  const startTime = Date.now();
  const deadline = startTime + 90_000;
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    signal?.throwIfAborted();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (onProgress && elapsed >= 1) {
      onProgress(elapsed);
    }
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now())))]) : AbortSignal.timeout(Math.max(1, Math.min(15_000, deadline - Date.now()))),
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        if (["ok", "healthy"].includes(data.status)) return;
      } else if (![502, 503, 504].includes(response.status)) {
        await requireApiResponse(response);
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof BackendError) throw error;
    }
    await retryDelay(Math.max(0, Math.min(1000 * 2 ** attempt, 5000, deadline - Date.now())), signal);
  }
  throw new Error("Không kết nối được backend sau 90 giây. Render có thể đang khởi động hoặc gặp sự cố; hãy thử lại.");
}

export async function fetchTikTokEdge(
  url: string,
  signal?: AbortSignal
): Promise<BackendAnalyzeResponse | null> {
  try {
    const isTikTok = /tiktok\.com|douyin\.com/i.test(url);
    if (!isTikTok) return null;

    const endpoint = typeof window !== "undefined" ? "/api/tiktok" : "";
    if (!endpoint) return null;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(7000)]) : AbortSignal.timeout(7000),
    });

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;

    const data = (await res.json()) as BackendAnalyzeResponse;
    if (data && data.success) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function analyzeWithBackend(
  url: string,
  signal?: AbortSignal
): Promise<BackendAnalyzeResponse> {
  // 1. Zero-Cold-Start Vercel Edge Bypass for TikTok (Active in Browser)
  if (typeof window !== "undefined" && /tiktok\.com|douyin\.com/i.test(url)) {
    const edgeResult = await fetchTikTokEdge(url, signal);
    if (edgeResult) {
      return edgeResult;
    }
  }

  // 2. Standard Render Backend Flow (with cold-start retry)
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
  });

  await requireApiResponse(res);
  return (await res.json()) as BackendAnalyzeResponse;
}

export async function startBackendDownload(
  req: BackendDownloadRequest,
  signal?: AbortSignal
): Promise<BackendJobResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/downloads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
  });

  await requireApiResponse(res);
  return (await res.json()) as BackendJobResponse;
}

export async function pollBackendJob(
  jobId: string,
  signal?: AbortSignal
): Promise<BackendJobResponse> {
  const base = getApiBaseUrl();
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${base}/api/downloads/${jobId}`, {
        method: "GET",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
      });
      await requireApiResponse(res, "job");
      return (await res.json()) as BackendJobResponse;
    } catch (error) {
      signal?.throwIfAborted();
      const retryable = error instanceof BackendError ? error.retryable :
        error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError");
      if (!retryable || attempt >= 2) throw error;
      await retryDelay(500 * 2 ** attempt, signal);
    }
  }
}

export async function cancelBackendJob(jobId: string): Promise<boolean> {
  const base = getApiBaseUrl();
  try {
    const res = await fetch(`${base}/api/downloads/${jobId}/cancel`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getBackendFileUrl(jobId: string): string {
  const base = getApiBaseUrl();
  return `${base}/api/downloads/${jobId}/file`;
}

export function getBackendPhotoDownloadUrl(url: string, filename: string): string {
  const base = getApiBaseUrl();
  return `${base}/api/download-photo?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
}

export async function fetchYouTubeOEmbed(url: string): Promise<BackendAnalyzeResponse | null> {
  try {
    const oembedUrl = "https://www.youtube.com/oembed?url=" + encodeURIComponent(url) + "&format=json";
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      success: true,
      url,
      title: data.title || "YouTube Video",
      thumbnail:
        (data.thumbnail_url as string | undefined)?.replace(
          "/hqdefault.",
          "/maxresdefault.",
        ) ||
        data.thumbnail_url ||
        "",
      uploader: data.author_name || "YouTube Creator",
      duration: 0,
      platform: "youtube",
      is_photo_album: false,
      is_audio_only: false,
      video_options: [],
      audio_options: [],
      photos: [],
      error:
        "YouTube đang yêu cầu xác minh bot đối với máy chủ Web. Bạn có thể tải ngay ảnh bìa HD bên dưới, hoặc dùng ứng dụng VibeLoad Android để tải video và âm thanh tốc độ cao.",
    };
  } catch {
    return null;
  }
}
