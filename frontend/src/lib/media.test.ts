import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadMedia,
  checkIncompleteUrl,
  formatBytes,
  inspectLocalFile,
  inspectMedia,
  MediaError,
  normalizeUrl,
  sanitizeFileName,
  UNSUPPORTED_MESSAGE,
  type MediaInfo,
} from "./media";

const source =
  "https://media.example.com/file?signature=keep%2Bthis&expires=999";
const signal = () => new AbortController().signal;
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLxkAAAAASUVORK5CYII=",
    "base64",
  ),
);
// A container header for structural rejection tests; this is not a playable video.
const mp4Header = Uint8Array.from([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0, 105, 115,
  111, 109, 105, 115, 111, 50,
]);

// A real little-endian PCM WAV container with eight 16-bit mono samples.
function wav(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(60);
  const view = new DataView(bytes.buffer);
  const write = (text: string, offset: number) =>
    bytes.set(new TextEncoder().encode(text), offset);
  write("RIFF", 0);
  view.setUint32(4, bytes.length - 8, true);
  write("WAVEfmt ", 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write("data", 36);
  view.setUint32(40, 16, true);
  return bytes;
}

const audioInfo: MediaInfo = {
  url: source,
  fileName: "âm thanh.wav",
  mime: "audio/wav",
  kind: "audio",
  size: null,
  extension: "wav",
};
const imageInfo: MediaInfo = {
  url: source,
  fileName: "ảnh.png",
  mime: "image/png",
  kind: "image",
  size: null,
  extension: "png",
};

function mockResponse(
  bytes: Uint8Array<ArrayBuffer>,
  headers: Record<string, string> = {},
) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(bytes, { headers }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("URL validation and privacy", () => {
  it.each([
    "",
    "abc",
    "javascript:alert(1)",
    "file:///tmp/photo.png",
    "data:image/png;base64,AAAA",
    "http://example.com/image.png",
    "https://user:secret@example.com/image.png",
    "https://127.0.0.1/x",
    "https://0x7f000001/x",
    "https://2130706433/x",
    "https://10.1.2.3/x",
    "https://172.16.2.3/x",
    "https://192.168.1.2/x",
    "https://169.254.169.254/x",
    "https://100.64.0.1/x",
    "https://0.0.0.0/x",
    "https://[::1]/x",
    "https://[::ffff:127.0.0.1]/x",
    "https://[fc00::1]/x",
    "https://[fe80::1]/x",
    "https://localhost/x",
    "https://localhost./x",
    "https://device.local/x",
    "https://server.internal/x",
    "https://intranet/x",
    "https://example.com/with space.png",
  ])("rejects unsafe or invalid input %s", (input) => {
    expect(() => normalizeUrl(input)).toThrowError(
      expect.objectContaining({ code: "invalid_url" }),
    );
  });

  it("preserves signed queries and only removes a fragment", () => {
    const input =
      "https://cdn.example.com/photo?X-Amz-Signature=a%2Bb+c&part=2&part=1#preview";
    expect(normalizeUrl(` "${input}" `).href).toBe(input.split("#")[0]);
  });

  it.each([
    "https://www.youtube.com/watch?v=123",
    "https://youtu.be/123",
    "https://vt.tiktok.com/abcdef",
    "https://www.tiktok.com/@u/photo/123",
    "https://facebook.com/share/abc",
    "https://instagram.com/reel/abc",
    "https://soundcloud.com/artist/track",
  ])("reports platform pages without making a request: %s", async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(inspectMedia(url, signal())).rejects.toMatchObject({
      code: "unsupported",
      message: UNSUPPORTED_MESSAGE,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches platform hostnames on domain boundaries", () => {
    expect(
      normalizeUrl("https://youtube.com.other.example.com/file.mp4").hostname,
    ).toBe("youtube.com.other.example.com");
    expect(normalizeUrl("https://cdn.tiktokcdn.com/image.jpg").hostname).toBe(
      "cdn.tiktokcdn.com",
    );
  });
});

describe("safe filenames", () => {
  it("removes traversal, forbidden characters, control and bidirectional text", () => {
    const name = sanitizeFileName(
      "../../bad\\name:\u0000\u202efile.html",
      "png",
    );
    expect(name).toMatch(/bad_name_+file\.png$/);
    expect(name).not.toMatch(/[\\/:*?"<>|\u0000\u202e]/);
    expect(name).not.toContain("..");
  });

  it("uses the verified extension, preserves Vietnamese and handles reserved names", () => {
    expect(sanitizeFileName("Bình minh.mp4", "png")).toBe("Bình minh.png");
    expect(sanitizeFileName(" CON ", "mp3")).toBe("VibeLoad_CON.mp3");
    expect(sanitizeFileName("   ", "mp4")).toBe("VibeLoad_Media.mp4");
    expect(sanitizeFileName("Bình minh.PNG", "png")).toBe("Bình minh.png");
    expect(sanitizeFileName("Âm thanh: Bài Hát Hay.mp3", "mp3")).toBe("Bài Hát Hay.mp3");
    expect(sanitizeFileName("Video - Mùa Thu Hà Nội", "mp4")).toBe("Mùa Thu Hà Nội.mp4");
    expect(sanitizeFileName("Music: Viral Beat", "mp3")).toBe("Viral Beat.mp3");
    const emojiName = sanitizeFileName("🌅".repeat(150), "png");
    expect(new TextEncoder().encode(emojiName).length).toBeLessThanOrEqual(180);
    expect(emojiName).toMatch(/^(?:🌅)+\.png$/u);
    expect(sanitizeFileName("CON.foo.mp4", "mp4")).toBe("VibeLoad_CON.foo.mp4");
    expect(sanitizeFileName("LPT¹.backup.wav", "wav")).toBe(
      "VibeLoad_LPT¹.backup.wav",
    );
  });

  it("formats measured byte counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 ** 2)).toBe("1 MB");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("source inspection", () => {
  it("inspects real PNG bytes without relying on extension and uses private request settings", async () => {
    const fetchMock = mockResponse(png, {
      "content-type": "application/octet-stream",
      "content-length": String(png.length),
      "content-disposition":
        "attachment; filename*=UTF-8''B%C3%ACnh%20minh.exe",
    });
    const info = await inspectMedia(source, signal());
    expect(info).toMatchObject({
      kind: "image",
      mime: "image/png",
      extension: "png",
      fileName: "Bình minh.png",
      size: png.length,
      url: source,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        method: "GET",
        mode: "cors",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      }),
    );
  });

  it("keeps only a bounded sample and cancels the rest of the network body", async () => {
    const first = new Uint8Array(8192);
    first.set(png);
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first);
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(stream, { headers: { "content-type": "image/png" } }),
        ),
    );
    await expect(inspectMedia(source, signal())).resolves.toMatchObject({
      kind: "image",
      size: null,
    });
    expect(cancelled).toBe(true);
  });

  it.each([
    [
      "HTML disguised as PNG",
      new TextEncoder().encode("<!DOCTYPE html><html>not an image</html>"),
      "image/png",
    ],
    [
      "JSON disguised as audio",
      new TextEncoder().encode('{"error":"denied"}'),
      "audio/mpeg",
    ],
    [
      "SVG active document",
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
      "image/svg+xml",
    ],
    ["empty body", new Uint8Array(), "image/png"],
    ["MIME mismatch", png, "image/jpeg"],
  ])("rejects %s", async (_name, bytes, mime) => {
    mockResponse(bytes, { "content-type": mime });
    await expect(inspectMedia(source, signal())).rejects.toMatchObject({
      code: "invalid_media",
    });
  });

  it("does not use compressed wire size as decoded file size", async () => {
    mockResponse(png, {
      "content-type": "image/png",
      "content-length": "30",
      "content-encoding": "gzip",
    });
    await expect(inspectMedia(source, signal())).resolves.toMatchObject({
      size: null,
    });
  });

  it("keeps CORS length unknown when Content-Encoding is hidden", async () => {
    const response = new Response(png, {
      headers: { "content-type": "image/png", "content-length": "30" },
    });
    Object.defineProperty(response, "type", { value: "cors" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(inspectMedia(source, signal())).resolves.toMatchObject({
      size: null,
    });
  });

  it("uses cross-origin Content-Length only with exposed identity encoding", async () => {
    const response = new Response(png, {
      headers: {
        "content-type": "image/png",
        "content-length": String(png.length),
        "content-encoding": "identity",
      },
    });
    Object.defineProperty(response, "type", { value: "cors" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(inspectMedia(source, signal())).resolves.toMatchObject({
      size: png.length,
    });
  });

  it("reports HTTP errors separately from browser network/CORS restrictions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Denied", { status: 403 })),
    );
    await expect(inspectMedia(source, signal())).rejects.toMatchObject({
      code: "http",
      message: expect.stringContaining("403"),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(inspectMedia(source, signal())).rejects.toMatchObject({
      code: "network",
      message: expect.stringContaining("CORS"),
    });
  });
});

describe("downloading verified files", () => {
  it("returns actual PCM file bytes and reports only received bytes", async () => {
    const bytes = wav();
    mockResponse(bytes, {
      "content-type": "audio/x-wav",
      "content-length": String(bytes.length),
    });
    const updates: { received: number; total: number | null }[] = [];
    const result = await downloadMedia(
      audioInfo,
      signal(),
      (p) => updates.push(p),
      { maxBytes: 1024 },
    );
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(bytes);
    expect(result.blob.type).toBe("audio/wav");
    expect(result.info).toMatchObject({ size: 60, fileName: "âm thanh.wav" });
    expect(updates).toEqual([
      { received: 0, total: 60 },
      { received: 60, total: 60 },
    ]);
  });

  it("validates PNG structure and the sanitized output name", async () => {
    mockResponse(png, { "content-type": "image/png" });
    const result = await downloadMedia(
      { ...imageInfo, fileName: "../ảnh.html" },
      signal(),
      () => undefined,
      { maxBytes: 1024 },
    );
    expect(result.info.fileName).toMatch(/ảnh\.png$/);
    expect(result.info.fileName).not.toMatch(/[./\\]{2}|\.html$/);
    expect(result.blob.size).toBe(png.length);
  });

  it("keeps unknown length indeterminate, including compressed responses", async () => {
    mockResponse(wav(), {
      "content-type": "audio/wav",
      "content-length": "20",
      "content-encoding": "gzip",
    });
    const progress = vi.fn();
    await downloadMedia(audioInfo, signal(), progress, { maxBytes: 1024 });
    expect(progress.mock.calls.every(([value]) => value.total === null)).toBe(
      true,
    );
    expect(progress).toHaveBeenLastCalledWith({ received: 60, total: null });
  });

  it("does not reject decoded CORS bytes using an exposed compressed wire count", async () => {
    const response = new Response(wav(), {
      headers: { "content-type": "audio/wav", "content-length": "20" },
    });
    Object.defineProperty(response, "type", { value: "cors" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const progress = vi.fn();
    const result = await downloadMedia(audioInfo, signal(), progress, {
      maxBytes: 1024,
    });
    expect(result.blob.size).toBe(60);
    expect(progress).toHaveBeenLastCalledWith({ received: 60, total: null });
  });

  it("rejects excessive declared size before retaining body data", async () => {
    mockResponse(wav(), {
      "content-type": "audio/wav",
      "content-length": "999999",
    });
    const progress = vi.fn();
    await expect(
      downloadMedia(audioInfo, signal(), progress, { maxBytes: 100 }),
    ).rejects.toMatchObject({ code: "too_large" });
    expect(progress).not.toHaveBeenCalled();
  });

  it("enforces the cap even when the source omits its size", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(wav());
        controller.enqueue(new Uint8Array(50));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(stream, { headers: { "content-type": "audio/wav" } }),
        ),
    );
    await expect(
      downloadMedia(audioInfo, signal(), () => undefined, { maxBytes: 80 }),
    ).rejects.toMatchObject({ code: "too_large" });
    expect(cancelled).toBe(true);
  });

  it.each(["10", "100"])(
    "rejects mismatched declared size %s",
    async (length) => {
      mockResponse(wav(), {
        "content-type": "audio/wav",
        "content-length": length,
      });
      await expect(
        downloadMedia(audioInfo, signal(), () => undefined, { maxBytes: 1024 }),
      ).rejects.toMatchObject({ code: "invalid_media" });
    },
  );

  it("never saves an unsolicited partial response as a complete file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(wav(), {
          status: 206,
          headers: {
            "content-type": "audio/wav",
            "content-range": "bytes 0-59/600",
          },
        }),
      ),
    );
    await expect(
      downloadMedia(audioInfo, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects files whose real format changed since inspection", async () => {
    mockResponse(png, { "content-type": "image/png" });
    await expect(
      downloadMedia(audioInfo, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects a truncated image even when the media signature is present", async () => {
    mockResponse(png.slice(0, -12), { "content-type": "image/png" });
    await expect(
      downloadMedia(imageInfo, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects an MP4 header without metadata and actual media data", async () => {
    mockResponse(mp4Header, { "content-type": "video/mp4" });
    const info = await inspectMedia(source, signal());
    expect(info).toMatchObject({
      kind: "video",
      mime: "video/mp4",
      extension: "mp4",
    });
    mockResponse(mp4Header, { "content-type": "video/mp4" });
    await expect(
      downloadMedia(info, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects an MP4 box whose declared extent runs beyond the file", async () => {
    const bytes = new Uint8Array(40);
    bytes.set(mp4Header);
    new DataView(bytes.buffer).setUint32(24, 9999);
    bytes.set(new TextEncoder().encode("mdat"), 28);
    mockResponse(bytes, { "content-type": "video/mp4" });
    const info: MediaInfo = {
      ...audioInfo,
      kind: "video",
      mime: "video/mp4",
      extension: "mp4",
      fileName: "video.mp4",
    };
    await expect(
      downloadMedia(info, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects an ID3 metadata-only file without an MP3 audio frame", async () => {
    const metadata = Uint8Array.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]);
    mockResponse(metadata, { "content-type": "audio/mpeg" });
    const info: MediaInfo = {
      ...audioInfo,
      mime: "audio/mpeg",
      extension: "mp3",
      fileName: "track.mp3",
    };
    await expect(
      downloadMedia(info, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("requires a complete MPEG audio frame, rather than four header bytes", async () => {
    mockResponse(Uint8Array.from([255, 251, 144, 100]), {
      "content-type": "audio/mpeg",
    });
    const info: MediaInfo = {
      ...audioInfo,
      mime: "audio/mpeg",
      extension: "mp3",
      fileName: "track.mp3",
    };
    await expect(
      downloadMedia(info, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects WAV metadata without an actual data payload", async () => {
    const bytes = wav().slice(0, 44);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, bytes.length - 8, true);
    view.setUint32(40, 0, true);
    mockResponse(bytes, { "content-type": "audio/wav" });
    await expect(
      downloadMedia(audioInfo, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects a WAV chunk that points beyond the RIFF container", async () => {
    const bytes = wav();
    new DataView(bytes.buffer).setUint32(40, 2048, true);
    mockResponse(bytes, { "content-type": "audio/wav" });
    await expect(
      downloadMedia(audioInfo, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects a WebM signature without container payload", async () => {
    const bytes = Uint8Array.from([
      26, 69, 223, 163, 119, 101, 98, 109, 0, 0, 0, 0,
    ]);
    mockResponse(bytes, { "content-type": "video/webm" });
    const info: MediaInfo = {
      ...audioInfo,
      kind: "video",
      mime: "video/webm",
      extension: "webm",
      fileName: "video.webm",
    };
    await expect(
      downloadMedia(info, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects an Opus identification page without subsequent audio pages", async () => {
    const bytes = new Uint8Array(47);
    bytes.set(new TextEncoder().encode("OggS"), 0);
    bytes[5] = 2;
    bytes[26] = 1;
    bytes[27] = 19;
    bytes.set(new TextEncoder().encode("OpusHead"), 28);
    bytes[36] = 1;
    bytes[37] = 1;
    mockResponse(bytes, { "content-type": "audio/ogg" });
    const info: MediaInfo = {
      ...audioInfo,
      mime: "audio/ogg",
      extension: "opus",
      fileName: "track.opus",
    };
    await expect(
      downloadMedia(info, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects FLAC STREAMINFO metadata without a frame", async () => {
    const bytes = new Uint8Array(42);
    bytes.set(new TextEncoder().encode("fLaC"), 0);
    bytes[4] = 128;
    bytes[7] = 34;
    mockResponse(bytes, { "content-type": "audio/flac" });
    const info: MediaInfo = {
      ...audioInfo,
      mime: "audio/flac",
      extension: "flac",
      fileName: "track.flac",
    };
    await expect(
      downloadMedia(info, signal(), () => undefined, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "invalid_media" });
  });

  it("rejects invalid maxBytes configuration", async () => {
    await expect(
      downloadMedia(audioInfo, signal(), () => undefined, { maxBytes: -1 }),
    ).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("cancellation and timeout", () => {
  it("does not fetch an already cancelled operation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(inspectMedia(source, controller.signal)).rejects.toMatchObject(
      { code: "aborted" },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels a running stream and preserves cancelled state", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(wav());
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(stream, { headers: { "content-type": "audio/wav" } }),
        ),
    );
    await expect(
      downloadMedia(
        audioInfo,
        controller.signal,
        ({ received }) => {
          if (received > 0) controller.abort();
        },
        { maxBytes: 1024 },
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(cancelled).toBe(true);
  });

  it("times out a stalled response without claiming CORS or cancellation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const promise = expect(
      inspectMedia(source, signal()),
    ).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;
  });
});

describe("local picker inspection", () => {
  it("verifies a selected local file without network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const info = await inspectLocalFile(
      new File([png], "ảnh.png", { type: "image/png" }),
    );
    expect(info).toMatchObject({
      url: "",
      fileName: "ảnh.png",
      mime: "image/png",
      size: png.length,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects local HTML disguised with an image extension and MIME", async () => {
    await expect(
      inspectLocalFile(
        new File(["<html>error</html>"], "image.png", { type: "image/png" }),
      ),
    ).rejects.toBeInstanceOf(MediaError);
  });

  describe("checkIncompleteUrl", () => {
    it("flags truncated youtu.be IDs", () => {
      expect(checkIncompleteUrl("https://youtu.be/_DmN8")).toContain("chưa đầy đủ");
      expect(checkIncompleteUrl("https://youtu.be/mn5sst")).toContain("chưa đầy đủ");
      expect(checkIncompleteUrl("https://youtu.be/mn5sstko1Xw")).toBeNull();
    });

    it("flags truncated youtube.com watch IDs", () => {
      expect(checkIncompleteUrl("https://www.youtube.com/watch?v=123")).toContain("chưa đầy đủ");
      expect(checkIncompleteUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    });

    it("flags truncated youtube shorts IDs", () => {
      expect(checkIncompleteUrl("https://www.youtube.com/shorts/short")).toContain("chưa đầy đủ");
      expect(checkIncompleteUrl("https://www.youtube.com/shorts/12345678901")).toBeNull();
    });
  });
});
