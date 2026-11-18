export const config = {
  runtime: "edge",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface TikWMResponse {
  code: number;
  msg?: string;
  data?: {
    id?: string;
    title?: string;
    cover?: string;
    origin_cover?: string;
    duration?: number;
    play?: string;
    hdplay?: string;
    size?: number;
    hd_size?: number;
    music?: string;
    music_info?: {
      title?: string;
      play?: string;
      author?: string;
    };
    images?: string[];
    author?: {
      nickname?: string;
      unique_id?: string;
      avatar?: string;
    };
  };
}

function cleanTikTokUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    // Strip common tracking parameters
    const keepParams = new Set(["id", "mid"]);
    const keysToDelete: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (!keepParams.has(key)) keysToDelete.push(key);
    });
    for (const k of keysToDelete) {
      u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return rawUrl.trim();
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let targetUrl = "";
  if (req.method === "GET") {
    const u = new URL(req.url);
    targetUrl = u.searchParams.get("url") || "";
  } else if (req.method === "POST") {
    try {
      const body = (await req.json()) as { url?: string };
      targetUrl = body.url || "";
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Định dạng yêu cầu không hợp lệ (JSON required)." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
  }

  if (!targetUrl || typeof targetUrl !== "string") {
    return new Response(
      JSON.stringify({ success: false, error: "Thiếu liên kết TikTok cần phân tích." }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const cleanUrl = cleanTikTokUrl(targetUrl);
  const isTikTok = /tiktok\.com|douyin\.com/i.test(cleanUrl);
  if (!isTikTok) {
    return new Response(
      JSON.stringify({ success: false, error: "Liên kết không thuộc TikTok hoặc Douyin." }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const endpoints = ["https://www.tikwm.com/api/", "https://tikwm.com/api/"];
  let tikwmData: TikWMResponse | null = null;
  let lastError: string | null = null;

  const queryEndpoint = async (endpoint: string): Promise<TikWMResponse> => {
    const form = new URLSearchParams();
    form.append("url", cleanUrl);
    form.append("hd", "1");

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as TikWMResponse;
    if (json.code === 0 && json.data) {
      return json;
    }
    throw new Error(json.msg || "Nguồn không trả về dữ liệu hợp lệ");
  };

  try {
    tikwmData = await Promise.any(endpoints.map((ep) => queryEndpoint(ep)));
  } catch (err) {
    if (err instanceof AggregateError && err.errors?.length) {
      const firstErr = err.errors[0];
      lastError = firstErr instanceof Error ? firstErr.message : String(firstErr);
    } else {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!tikwmData || !tikwmData.data) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Không thể phân tích video TikTok qua Vercel Edge: ${lastError || "Nguồn không phản hồi"}.`,
      }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const d = tikwmData.data;
  const isPhotoAlbum = Array.isArray(d.images) && d.images.length > 0;
  const photos = isPhotoAlbum
    ? (d.images || []).map((imgUrl, idx) => ({
        id: `photo_${idx + 1}`,
        index: idx + 1,
        url: imgUrl,
        thumbnail: imgUrl,
        width: null,
        height: null,
      }))
    : [];

  const videoOptions = [];
  if (!isPhotoAlbum) {
    if (d.hdplay) {
      videoOptions.push({
        format_id: d.hdplay,
        resolution: "HD 1080p (Nén HEVC Siêu Nét)",
        height: 1080,
        width: 1920,
        ext: "mp4",
        filesize: d.hd_size || 0,
        vcodec: "hevc",
        acodec: "aac",
        needs_merge: false,
      });
    }
    if (d.play && d.play !== d.hdplay) {
      videoOptions.push({
        format_id: d.play,
        resolution: "SD 720p (Chuẩn H.264)",
        height: 720,
        width: 1280,
        ext: "mp4",
        filesize: d.size || 0,
        vcodec: "h264",
        acodec: "aac",
        needs_merge: false,
      });
    }
  }

  const audioOptions = [];
  const musicUrl = d.music || d.music_info?.play;
  if (musicUrl) {
    audioOptions.push({
      format_id: musicUrl,
      resolution: "Âm thanh gốc (MP3)",
      ext: "mp3",
      abr: 128,
      filesize: 0,
      acodec: "mp3",
    });
  }

  const responsePayload = {
    success: true,
    url: cleanUrl,
    title: d.title || "TikTok Media",
    thumbnail: d.cover || d.origin_cover || (photos[0] ? photos[0].url : ""),
    uploader: d.author?.nickname || d.author?.unique_id || "TikTok Creator",
    duration: d.duration || 0,
    platform: "tiktok",
    is_photo_album: isPhotoAlbum,
    is_audio_only: !isPhotoAlbum && videoOptions.length === 0 && audioOptions.length > 0,
    video_options: videoOptions,
    audio_options: audioOptions,
    photos: photos,
    error: null,
  };

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
