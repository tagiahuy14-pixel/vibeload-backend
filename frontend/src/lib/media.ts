export type MediaKind = "image" | "video" | "audio";

export interface MediaInfo {
  url: string;
  fileName: string;
  mime: string;
  kind: MediaKind;
  size: number | null;
  extension: string;
}

export interface Progress {
  received: number;
  total: number | null;
}

export class MediaError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MediaError";
    this.code = code;
  }
}

export const UNSUPPORTED_MESSAGE =
  "Nguồn này chưa có bộ trích xuất được tích hợp trong VibeLoad Web.";

const SAMPLE_BYTES = 4096;
const IDLE_TIMEOUT_MS = 30_000;
const platformHosts = [
  "youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "tiktok.com",
  "douyin.com",
  "iesdouyin.com",
  "facebook.com",
  "fb.watch",
  "instagram.com",
  "threads.com",
  "threads.net",
  "soundcloud.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "pin.it",
  "reddit.com",
  "v.redd.it",
  "redd.it",
];

function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) {
    // Accept global unicast only. This also excludes loopback, mapped IPv4,
    // link-local and unique-local IPv6 addresses without DNS requests.
    const address = host.slice(1, -1);
    const first = Number.parseInt(address.split(":")[0], 16);
    return (first & 0xe000) === 0x2000 && !address.startsWith("2001:db8:");
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b, c] = host.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  return (
    host.includes(".") &&
    ![
      "localhost",
      "local",
      "localdomain",
      "internal",
      "intranet",
      "lan",
      "home",
      "onion",
      "arpa",
    ].some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
  );
}

export function isPlatformUrl(input: string): boolean {
  try {
    const raw = input.trim().replace(/^(["'])(.*)\1$/, "$2");
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return [
      "youtube.com",
      "youtu.be",
      "youtube-nocookie.com",
      "tiktok.com",
      "douyin.com",
      "iesdouyin.com",
      "facebook.com",
      "fb.watch",
      "instagram.com",
      "soundcloud.com",
      "threads.net",
      "threads.com",
      "pinterest.com",
      "pin.it",
      "reddit.com",
      "v.redd.it",
      "redd.it",
      "twitter.com",
      "x.com",
    ].some(
      (platform) => host === platform || host.endsWith(`.${platform}`),
    );
  } catch {
    return false;
  }
}

export function checkIncompleteUrl(input: string): string | null {
  const raw = input.trim().replace(/^(["'])(.*)\1$/, "$2");
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      const id = url.pathname.replace(/^\/+/, "").split(/[?#&/]/)[0];
      if (id && id.length < 11) {
        return "Đường dẫn YouTube chưa đầy đủ (mã video thường gồm 11 ký tự). Vui lòng sao chép lại toàn bộ liên kết từ YouTube.";
      }
    } else if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && v.length < 11) {
        return "Đường dẫn YouTube chưa đầy đủ (mã video thường gồm 11 ký tự). Vui lòng sao chép lại toàn bộ liên kết từ YouTube.";
      }
      if (url.pathname.includes("/shorts/")) {
        const id = url.pathname.split("/shorts/")[1]?.split(/[?#&/]/)[0];
        if (id && id.length < 11) {
          return "Đường dẫn YouTube Shorts chưa đầy đủ (mã video thường gồm 11 ký tự). Vui lòng sao chép lại toàn bộ liên kết từ YouTube.";
        }
      }
    }
  } catch {
    // ignore parsing errors
  }
  return null;
}

export function cleanTrackingParams(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    const trackingParams = [
      "si", "fbclid", "utm_source", "utm_medium", "utm_campaign", "utm_term",
      "utm_content", "ref", "feature", "xmt", "slof", "is_from_webapp", "sender_device"
    ];
    for (const p of trackingParams) {
      url.searchParams.delete(p);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function getAppDeepLink(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "").split(/[?#&]/)[0];
      return id ? `vnd.youtube://${id}` : null;
    }
    if (host.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return `vnd.youtube://${v}`;
      if (u.pathname.includes("/shorts/")) {
        const id = u.pathname.split("/shorts/")[1]?.split(/[?#&]/)[0];
        if (id) return `vnd.youtube://${id}`;
      }
    }
    if (host.includes("tiktok.com") || host.includes("douyin.com")) {
      const segs = u.pathname.split("/").filter(Boolean);
      const last = segs[segs.length - 1];
      return last ? `snssdk1233://aweme/detail/${last}` : null;
    }
    if (host.includes("instagram.com")) {
      return `instagram://`;
    }
    if (host.includes("threads.net") || host.includes("threads.com")) {
      return `barcelona://`;
    }
    if (host.includes("pinterest.com") || host.includes("pin.it")) {
      return `pinterest://`;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Keep query parameters intact: direct media URLs can contain signatures. */
export function normalizeUrl(input: string, allowPlatform: boolean = false): URL {
  const raw = input.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!raw || /[\u0000-\u0020\u007f]/.test(raw)) {
    throw new MediaError(
      "invalid_url",
      "Liên kết không hợp lệ. Hãy nhập URL tệp HTTPS đầy đủ.",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MediaError(
      "invalid_url",
      "Liên kết không hợp lệ. Hãy nhập URL tệp HTTPS đầy đủ.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !isPublicHost(url.hostname)
  ) {
    throw new MediaError(
      "invalid_url",
      "Chỉ chấp nhận URL HTTPS công khai, không chứa tài khoản hoặc địa chỉ mạng nội bộ.",
    );
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !allowPlatform &&
    platformHosts.some(
      (platform) => host === platform || host.endsWith(`.${platform}`),
    )
  ) {
    throw new MediaError("unsupported", UNSUPPORTED_MESSAGE);
  }
  url.hash = "";
  return url;
}

export function sanitizeFileName(input: string, extension?: string): string {
  // 1. Smart prefix cleaner (synchronized with Android MediaStoreStorageManager)
  let cleaned = input.trim();
  const prefixRegex = /^(?:Âm thanh|Video|Nhạc|Sound|Audio|Music)\s*[:\-_|]\s*/i;
  cleaned = cleaned.replace(prefixRegex, "").trim();

  let name = cleaned
    .normalize("NFC")
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\\/:*?"<>|]/g,
      "_",
    )
    .replace(/\.{2,}/g, "_")
    .replace(/^[.\s]+|[.\s]+$/g, "");
  let ext = extension?.replace(/^\./, "").toLowerCase();
  if (ext && !/^[a-z0-9]{1,10}$/.test(ext)) ext = undefined;
  const existing = name.match(/\.([a-zA-Z0-9]{1,10})$/);
  if (existing) {
    name = name.slice(0, -existing[0].length);
    ext ??= existing[1].toLowerCase();
  }
  name = name.replace(/[.\s]+$/g, "");
  if (!name || /^_+$/.test(name)) name = "VibeLoad_Media";
  // Windows reserves the first component even with extra extensions (CON.foo.mp4).
  if (
    /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i.test(
      name.split(".")[0].trimEnd(),
    )
  )
    name = `VibeLoad_${name}`;
  const suffix = ext ? `.${ext}` : "";
  const encoder = new TextEncoder();
  const budget = 180 - encoder.encode(suffix).length;
  let safeName = "";
  let byteLength = 0;
  for (const character of Array.from(name).slice(0, 100)) {
    const length = encoder.encode(character).length;
    if (byteLength + length > budget) break;
    safeName += character;
    byteLength += length;
  }
  return `${safeName.replace(/[.\s]+$/g, "") || "VibeLoad_Media"}${suffix}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** power;
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: power === 0 ? 0 : 1 }).format(value)} ${units[power]}`;
}

interface Format {
  kind: MediaKind;
  mime: string;
  extension: string;
  aliases: readonly string[];
}

const format = (
  kind: MediaKind,
  mime: string,
  extension: string,
  ...aliases: string[]
): Format => ({ kind, mime, extension, aliases: [mime, ...aliases] });

const ascii = (bytes: Uint8Array, start: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(start, start + length));
const starts = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  bytes.length >= signature.length &&
  signature.every((value, index) => bytes[index] === value);
const u32 = (bytes: Uint8Array, offset: number, littleEndian = false): number =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    littleEndian,
  );

function isMp3Frame(bytes: Uint8Array, offset = 0): boolean {
  if (bytes.length < offset + 4) return false;
  const a = bytes[offset + 1];
  const b = bytes[offset + 2];
  return (
    bytes[offset] === 0xff &&
    (a & 0xe0) === 0xe0 &&
    ((a >> 3) & 3) !== 1 &&
    (a & 6) === 2 &&
    b >> 4 !== 0 &&
    b >> 4 !== 15 &&
    ((b >> 2) & 3) !== 3
  );
}

function mp3FrameLength(bytes: Uint8Array): number | null {
  if (!isMp3Frame(bytes)) return null;
  const version = (bytes[1] >> 3) & 3;
  const mpeg1 = version === 3;
  const bitrates = mpeg1
    ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRate =
    [44100, 48000, 32000][(bytes[2] >> 2) & 3] /
    (mpeg1 ? 1 : version === 2 ? 2 : 4);
  return (
    Math.floor(
      ((mpeg1 ? 144000 : 72000) * bitrates[bytes[2] >> 4]) / sampleRate,
    ) +
    ((bytes[2] >> 1) & 1)
  );
}

function id3Length(bytes: Uint8Array): number | null {
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") return null;
  if (
    bytes[3] < 2 ||
    bytes[3] > 4 ||
    bytes[4] === 255 ||
    bytes.subarray(6, 10).some((b) => b >= 128)
  )
    return null;
  const length =
    ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]) + 10;
  return length + (bytes[3] === 4 && (bytes[5] & 0x10) !== 0 ? 10 : 0);
}

/** Signature detection is adapted from Android ImageFormatDetector; URL suffixes are never evidence. */
function sniff(bytes: Uint8Array, declaredMime: string): Format {
  if (
    bytes.length >= 33 &&
    starts(bytes, [137, 80, 78, 71, 13, 10, 26, 10]) &&
    u32(bytes, 8) === 13 &&
    ascii(bytes, 12, 4) === "IHDR" &&
    u32(bytes, 16) > 0 &&
    u32(bytes, 20) > 0
  ) {
    return format("image", "image/png", "png", "image/x-png");
  }
  if (
    bytes.length >= 4 &&
    starts(bytes, [255, 216, 255]) &&
    bytes[3] !== 0 &&
    bytes[3] !== 255
  ) {
    return format("image", "image/jpeg", "jpg", "image/jpg", "image/pjpeg");
  }
  if (
    bytes.length >= 13 &&
    ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6)) &&
    (bytes[6] | (bytes[7] << 8)) > 0 &&
    (bytes[8] | (bytes[9] << 8)) > 0
  ) {
    return format("image", "image/gif", "gif");
  }
  if (
    bytes.length >= 20 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(ascii(bytes, 12, 4))
  ) {
    return format("image", "image/webp", "webp");
  }
  if (
    bytes.length >= 26 &&
    ascii(bytes, 0, 2) === "BM" &&
    u32(bytes, 14, true) >= 12
  ) {
    return format("image", "image/bmp", "bmp", "image/x-ms-bmp");
  }
  if (
    bytes.length >= 8 &&
    (starts(bytes, [73, 73, 42, 0]) || starts(bytes, [77, 77, 0, 42]))
  ) {
    return format("image", "image/tiff", "tiff", "image/x-tiff");
  }
  if (
    bytes.length >= 22 &&
    starts(bytes, [0, 0, 1, 0]) &&
    (bytes[4] | (bytes[5] << 8)) > 0
  ) {
    return format(
      "image",
      "image/x-icon",
      "ico",
      "image/vnd.microsoft.icon",
      "image/ico",
    );
  }
  if (
    bytes.length >= 16 &&
    ascii(bytes, 4, 4) === "ftyp" &&
    u32(bytes, 0) >= 16
  ) {
    const boxEnd = Math.min(u32(bytes, 0), bytes.length);
    const brands: string[] = [ascii(bytes, 8, 4)];
    for (let i = 16; i + 4 <= boxEnd; i += 4) brands.push(ascii(bytes, i, 4));
    if (brands.some((brand) => ["avif", "avis"].includes(brand)))
      return format("image", "image/avif", "avif");
    if (
      brands.some((brand) =>
        [
          "heic",
          "heix",
          "hevc",
          "heim",
          "heis",
          "mif1",
          "msf1",
          "M4P ",
        ].includes(brand),
      )
    ) {
      throw new MediaError(
        "invalid_media",
        "Tệp HEIC/HEIF hoặc nội dung được bảo vệ hiện chưa được hỗ trợ.",
      );
    }
    if (
      brands.some((brand) => ["M4A ", "M4B "].includes(brand)) ||
      ["audio/mp4", "audio/x-m4a", "audio/m4a"].includes(declaredMime)
    ) {
      return format("audio", "audio/mp4", "m4a", "audio/x-m4a", "audio/m4a");
    }
    if (
      brands.some((brand) =>
        [
          "isom",
          "iso2",
          "iso3",
          "iso4",
          "iso5",
          "iso6",
          "mp41",
          "mp42",
          "avc1",
          "M4V ",
          "dash",
        ].includes(brand),
      )
    ) {
      return format("video", "video/mp4", "mp4", "application/mp4");
    }
  }
  if (
    bytes.length >= 12 &&
    starts(bytes, [26, 69, 223, 163]) &&
    ascii(bytes, 4, Math.min(1024, bytes.length - 4)).includes("webm")
  ) {
    return declaredMime === "audio/webm"
      ? format("audio", "audio/webm", "webm")
      : format("video", "video/webm", "webm");
  }
  if (isMp3Frame(bytes) || id3Length(bytes) !== null)
    return format("audio", "audio/mpeg", "mp3", "audio/mp3", "audio/x-mp3");
  if (bytes.length >= 27 && ascii(bytes, 0, 4) === "OggS" && bytes[4] === 0) {
    const packetStart = 27 + bytes[26];
    if (ascii(bytes, packetStart, 8) === "OpusHead")
      return format(
        "audio",
        "audio/ogg",
        "opus",
        "audio/opus",
        "application/ogg",
      );
    if (
      bytes[packetStart] === 1 &&
      ascii(bytes, packetStart + 1, 6) === "vorbis"
    )
      return format("audio", "audio/ogg", "ogg", "application/ogg");
  }
  if (
    bytes.length >= 44 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WAVE" &&
    ascii(bytes, 12, bytes.length - 12).includes("fmt ")
  ) {
    return format(
      "audio",
      "audio/wav",
      "wav",
      "audio/x-wav",
      "audio/wave",
      "audio/vnd.wave",
    );
  }
  if (
    bytes.length >= 42 &&
    ascii(bytes, 0, 4) === "fLaC" &&
    (bytes[4] & 0x7f) === 0 &&
    bytes[5] === 0 &&
    bytes[6] === 0 &&
    bytes[7] === 34
  )
    return format("audio", "audio/flac", "flac", "audio/x-flac");
  throw new MediaError(
    "invalid_media",
    "Dữ liệu nguồn không phải tệp ảnh, video hoặc âm thanh được hỗ trợ. HTML, JSON, SVG và tệp rỗng bị từ chối.",
  );
}

function validateMime(bytes: Uint8Array, response: Response): Format {
  const mime = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const detected = sniff(bytes, mime);
  const generic = [
    "",
    "application/octet-stream",
    "binary/octet-stream",
    "application/binary",
    "application/download",
    "application/x-download",
  ];
  if (!generic.includes(mime) && !detected.aliases.includes(mime)) {
    throw new MediaError(
      "invalid_media",
      "Loại nội dung máy chủ khai báo không khớp dữ liệu tệp. VibeLoad đã dừng để tránh lưu tệp sai định dạng.",
    );
  }
  return detected;
}

function responseSize(response: Response): number | null {
  const rawEncoding = response.headers.get("content-encoding");
  // CORS exposes Content-Length by default, but can hide Content-Encoding.
  // Without it, wire length cannot safely become a decoded-byte percentage.
  if (response.type === "cors" && rawEncoding === null) return null;
  const encoding = rawEncoding?.toLowerCase().trim();
  if (encoding && encoding !== "identity") return null;
  const raw =
    response.status === 206
      ? response.headers
          .get("content-range")
          ?.match(/^bytes 0-\d+\/(\d+)$/i)?.[1]
      : response.headers.get("content-length");
  if (!raw || !/^\d+$/.test(raw)) return null;
  const size = Number(raw);
  return Number.isSafeInteger(size) && size > 0 ? size : null;
}

function responseName(response: Response, url: URL, extension: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(
    /filename\*\s*=\s*UTF-8''([^;\r\n]+)/i,
  )?.[1];
  let name: string | undefined;
  if (encoded) {
    try {
      name = decodeURIComponent(encoded.trim().replace(/^"|"$/g, ""));
    } catch {
      /* URL fallback */
    }
  }
  name ??=
    disposition.match(/filename\s*=\s*"([^"\r\n]*)"/i)?.[1] ??
    disposition.match(/filename\s*=\s*([^;\r\n]+)/i)?.[1]?.trim();
  if (!name) {
    const segment =
      url.pathname.split("/").filter(Boolean).at(-1) ?? "VibeLoad_Media";
    try {
      name = decodeURIComponent(segment);
    } catch {
      name = segment;
    }
  }
  return sanitizeFileName(name, extension);
}

interface RequestContext {
  signal: AbortSignal;
  check: () => void;
  resetTimeout: () => void;
}

async function request<T>(
  url: URL,
  signal: AbortSignal,
  action: (response: Response, context: RequestContext) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout>;
  const resetTimeout = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IDLE_TIMEOUT_MS);
  };
  const cancel = () => controller.abort();
  const check = () => {
    if (signal.aborted) throw new MediaError("aborted", "Tác vụ đã được hủy.");
    if (timedOut)
      throw new MediaError(
        "timeout",
        "Nguồn không phản hồi dữ liệu trong 30 giây. Hãy kiểm tra kết nối và thử lại.",
      );
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    check();
    resetTimeout();
    const response = await fetch(url.href, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal: controller.signal,
    });
    check();
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new MediaError(
        "http",
        `Nguồn trả về HTTP ${response.status}. Liên kết có thể hết hạn hoặc không cho phép tải.`,
      );
    }
    return await action(response, {
      signal: controller.signal,
      check,
      resetTimeout,
    });
  } catch (error) {
    check();
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "network",
      "Không đọc được nguồn. Máy chủ có thể chặn CORS, chuyển hướng hoặc kết nối bị lỗi. Hãy dùng URL tệp HTTPS trực tiếp.",
    );
  } finally {
    clearTimeout(timer!);
    signal.removeEventListener("abort", cancel);
  }
}

function openReader(response: Response, context: RequestContext) {
  if (!response.body)
    throw new MediaError(
      "invalid_media",
      "Máy chủ trả về tệp rỗng hoặc không có nội dung có thể đọc.",
    );
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  context.signal.addEventListener("abort", cancel, { once: true });
  return {
    reader,
    close: async () => {
      context.signal.removeEventListener("abort", cancel);
      try {
        await reader.cancel();
      } catch {
        /* The stream can already be aborted. */
      }
      reader.releaseLock();
    },
  };
}

export async function inspectMedia(
  input: string,
  signal: AbortSignal,
): Promise<MediaInfo> {
  const url = normalizeUrl(input);
  return request(url, signal, async (response, context) => {
    const { reader, close } = openReader(response, context);
    const sample = new Uint8Array(SAMPLE_BYTES);
    let count = 0;
    try {
      while (count < SAMPLE_BYTES) {
        context.check();
        const { done, value } = await reader.read();
        context.check();
        if (done) break;
        context.resetTimeout();
        const length = Math.min(value.length, SAMPLE_BYTES - count);
        sample.set(value.subarray(0, length), count);
        count += length;
      }
      const detected = validateMime(sample.subarray(0, count), response);
      return {
        url: url.href,
        fileName: responseName(response, url, detected.extension),
        mime: detected.mime,
        kind: detected.kind,
        size: responseSize(response),
        extension: detected.extension,
      };
    } finally {
      await close();
    }
  });
}

/** A picker grants access to this file only; it does not expose the Downloads folder. */
export async function inspectLocalFile(file: File): Promise<MediaInfo> {
  const sample = new Uint8Array(
    await file.slice(0, SAMPLE_BYTES).arrayBuffer(),
  );
  const detected = validateMime(
    sample,
    new Response(null, {
      headers: file.type ? { "content-type": file.type } : undefined,
    }),
  );
  await validateContainer(file, detected, sample);
  return {
    url: "",
    fileName: sanitizeFileName(file.name, detected.extension),
    mime: detected.mime,
    kind: detected.kind,
    size: file.size,
    extension: detected.extension,
  };
}

async function validateContainer(
  blob: Blob,
  detected: Format,
  sample: Uint8Array,
): Promise<void> {
  const fail = () => {
    throw new MediaError(
      "invalid_media",
      "Tệp bị cắt ngắn, hỏng cấu trúc hoặc không chứa dữ liệu media hợp lệ. Chưa có tệp nào được lưu.",
    );
  };
  const tail = new Uint8Array(
    await blob.slice(Math.max(0, blob.size - 16)).arrayBuffer(),
  );
  if (
    detected.extension === "png" &&
    (tail.length < 12 || ascii(tail, tail.length - 8, 4) !== "IEND")
  )
    fail();
  if (
    detected.extension === "jpg" &&
    !(tail.at(-2) === 255 && tail.at(-1) === 217)
  )
    fail();
  if (detected.extension === "gif" && tail.at(-1) !== 59) fail();
  if (
    ["webp", "wav"].includes(detected.extension) &&
    u32(sample, 4, true) + 8 !== blob.size
  )
    fail();
  if (detected.extension === "wav") {
    let offset = 12;
    let hasFormat = false;
    let hasData = false;
    let chunks = 0;
    while (offset + 8 <= blob.size && chunks < 1024) {
      const header = new Uint8Array(
        await blob.slice(offset, offset + 24).arrayBuffer(),
      );
      const type = ascii(header, 0, 4);
      const length = u32(header, 4, true);
      const end = offset + 8 + length;
      if (end > blob.size) fail();
      if (type === "fmt ") {
        const view = new DataView(
          header.buffer,
          header.byteOffset,
          header.byteLength,
        );
        if (
          length < 16 ||
          header.length < 24 ||
          view.getUint16(8, true) === 0 ||
          view.getUint16(10, true) === 0 ||
          u32(header, 12, true) === 0 ||
          view.getUint16(20, true) === 0
        )
          fail();
        hasFormat = true;
      }
      if (type === "data" && length > 0) hasData = true;
      offset = end + (length % 2);
      chunks += 1;
    }
    if (offset !== blob.size || !hasFormat || !hasData) fail();
  }
  if (
    detected.extension === "bmp" &&
    (u32(sample, 2, true) !== blob.size || u32(sample, 10, true) >= blob.size)
  )
    fail();
  if (
    detected.extension === "ico" &&
    u32(sample, 18, true) + u32(sample, 14, true) > blob.size
  )
    fail();
  if (
    detected.extension === "tiff" &&
    u32(sample, 4, sample[0] === 73) >= blob.size
  )
    fail();
  if (detected.extension === "mp3") {
    const offset = id3Length(sample) ?? 0;
    const frame = new Uint8Array(
      await blob.slice(offset, offset + 4).arrayBuffer(),
    );
    const length = mp3FrameLength(frame);
    if (length === null || blob.size < offset + length) fail();
  }
  // These guards exclude header-only containers; codec decoding remains the
  // browser's responsibility and is reported separately by the preview UI.
  if (detected.extension === "webm" && blob.size < 64) fail();
  if (["opus", "ogg"].includes(detected.extension)) {
    const headerSize = 27 + sample[26];
    const firstPayload = sample
      .subarray(27, headerSize)
      .reduce((sum, length) => sum + length, 0);
    if (blob.size <= headerSize + firstPayload + 27) fail();
  }
  if (detected.extension === "flac") {
    let offset = 4;
    let last = false;
    let blocks = 0;
    while (!last && blocks < 128) {
      const header = new Uint8Array(
        await blob.slice(offset, offset + 4).arrayBuffer(),
      );
      if (header.length < 4) fail();
      last = (header[0] & 128) !== 0;
      const length = header[1] * 65536 + header[2] * 256 + header[3];
      offset += 4 + length;
      if (offset > blob.size) fail();
      blocks += 1;
    }
    const frame = new Uint8Array(
      await blob.slice(offset, offset + 6).arrayBuffer(),
    );
    if (
      !last ||
      frame.length < 6 ||
      frame[0] !== 255 ||
      (frame[1] & 254) !== 248
    )
      fail();
  }
  if (["mp4", "m4a", "avif"].includes(detected.extension)) {
    let offset = 0;
    let mediaData = false;
    let metadata = false;
    let boxes = 0;
    while (offset < blob.size && boxes < 512) {
      const header = new Uint8Array(
        await blob.slice(offset, offset + 16).arrayBuffer(),
      );
      if (header.length < 8) fail();
      let size = u32(header, 0);
      const type = ascii(header, 4, 4);
      const headerSize = size === 1 ? 16 : 8;
      if (size === 1) {
        if (header.length < 16) fail();
        size = u32(header, 8) * 2 ** 32 + u32(header, 12);
      }
      if (size === 0) size = blob.size - offset;
      if (
        !Number.isSafeInteger(size) ||
        size < headerSize ||
        offset + size > blob.size
      )
        fail();
      if (type === "mdat" && size > headerSize) mediaData = true;
      if (["moov", "moof", "meta"].includes(type) && size > headerSize)
        metadata = true;
      offset += size;
      boxes += 1;
    }
    if (offset !== blob.size || !mediaData || !metadata) fail();
  }
}

export async function downloadMedia(
  info: MediaInfo,
  signal: AbortSignal,
  onProgress: (progress: Progress) => void,
  options: { maxBytes: number },
): Promise<{ blob: Blob; info: MediaInfo }> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new MediaError("too_large", "Giới hạn dung lượng tải không hợp lệ.");
  }
  const url = normalizeUrl(info.url);
  return request(url, signal, async (response, context) => {
    const { reader, close } = openReader(response, context);
    try {
      // A partial response is never saved as a complete file.
      if (response.status === 206)
        throw new MediaError(
          "invalid_media",
          "Nguồn chỉ trả về một phần tệp. VibeLoad đã dừng để tránh lưu tệp thiếu dữ liệu.",
        );
      const total = responseSize(response);
      const tooLarge = () =>
        new MediaError(
          "too_large",
          `Tệp vượt giới hạn ${formatBytes(options.maxBytes)} để bảo vệ bộ nhớ trình duyệt. Hãy mở nguồn gốc để tải tệp lớn.`,
        );
      if (total !== null && total > options.maxBytes) throw tooLarge();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      const sample = new Uint8Array(SAMPLE_BYTES);
      let sampleSize = 0;
      let received = 0;
      onProgress({ received, total });
      while (true) {
        context.check();
        const { done, value } = await reader.read();
        context.check();
        if (done) break;
        context.resetTimeout();
        received += value.byteLength;
        if (received > options.maxBytes) throw tooLarge();
        if (total !== null && received > total) {
          throw new MediaError(
            "invalid_media",
            "Dung lượng nhận được không khớp thông tin của nguồn. Tệp chưa được lưu.",
          );
        }
        if (sampleSize < SAMPLE_BYTES) {
          const length = Math.min(value.length, SAMPLE_BYTES - sampleSize);
          sample.set(value.subarray(0, length), sampleSize);
          sampleSize += length;
        }
        // Copy only the view, never retain a potentially oversized backing buffer.
        chunks.push(new Uint8Array(value));
        onProgress({ received, total });
      }
      if (total !== null && received !== total) {
        throw new MediaError(
          "invalid_media",
          "Tệp tải về chưa đủ dung lượng máy chủ khai báo. Tệp chưa được lưu.",
        );
      }
      const prefix = sample.subarray(0, sampleSize);
      const detected = validateMime(prefix, response);
      if (
        detected.kind !== info.kind ||
        detected.mime !== info.mime ||
        detected.extension !== info.extension
      ) {
        throw new MediaError(
          "invalid_media",
          "Nguồn đã đổi định dạng kể từ lúc kiểm tra. Hãy phân tích lại liên kết trước khi tải.",
        );
      }
      const blob = new Blob(chunks, { type: detected.mime });
      await validateContainer(blob, detected, prefix);
      context.check();
      return {
        blob,
        info: {
          ...info,
          url: url.href,
          fileName: sanitizeFileName(info.fileName, detected.extension),
          size: blob.size,
        },
      };
    } finally {
      await close();
    }
  });
}
