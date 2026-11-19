import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeWithBackend, getApiBaseUrl, pollBackendJob, prefetchAnalysis, waitForBackend } from "./api";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("backend connection", () => {
  it("uses the configured HTTPS URL and trims whitespace", () => {
    vi.stubEnv("VITE_API_BASE_URL", " https://backend.example/ ");
    expect(getApiBaseUrl()).toBe("https://backend.example");
  });

  it("prefetches analysis for a YouTube URL before the download action", async () => {
    vi.stubEnv("VITE_API_URL", "https://backend.example");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, url: "https://youtu.be/abcdefghijk", title: "Video", thumbnail: "", uploader: "Creator", duration: 1, platform: "youtube", is_photo_album: false, is_audio_only: false, video_options: [], audio_options: [], photos: [] }));
    vi.stubGlobal("fetch", fetcher);

    prefetchAnalysis("https://youtu.be/abcdefghijk");
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0][0]).toBe("https://backend.example/api/analyze");
  });

  it("fails explicitly if production backend is missing", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_API_BASE_URL", "");
    expect(getApiBaseUrl).toThrow("Chưa cấu hình backend");
  });

  it("waits through Render wakeup and sends short TikTok URLs to analyze", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_API_URL", "https://backend.example");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("Starting", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: "ok" }))
      .mockResolvedValueOnce(Response.json({ success: true, platform: "tiktok" }));
    vi.stubGlobal("fetch", fetcher);
    const pending = waitForBackend();
    await vi.advanceTimersByTimeAsync(1100);
    await pending;
    await analyzeWithBackend("https://vt.tiktok.com/abc/");
    expect(fetcher.mock.calls[2][0]).toBe("https://backend.example/api/analyze");
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ url: "https://vt.tiktok.com/abc/" });
  });

  it("keeps internal errors distinct from unsupported sources", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false, error: { message: "Lỗi nội bộ", requestId: "request-1" } }, { status: 500 })));
    await expect(waitForBackend()).rejects.toThrow("Lỗi nội bộ (Mã: request-1)");
  });

  it("cancels health checks", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(waitForBackend(controller.signal)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("explains a lost job after a backend restart", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })));
    await expect(pollBackendJob("job")).rejects.toThrow("khởi động lại");
  });

  it("rejects Vercel HTML rewrites as API responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>app</html>", { headers: { "content-type": "text/html" } })));
    await expect(analyzeWithBackend("https://vt.tiktok.com/abc/")).rejects.toThrow();
  });

  it("bounds Render wakeup retries to exactly 90 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Network unavailable")));
    const started = Date.now();
    const rejected = expect(waitForBackend()).rejects.toThrow("90 giây");
    await vi.advanceTimersByTimeAsync(90_000);
    await rejected;
    expect(Date.now() - started).toBe(90_000);
  });

  it("explains real JSON job loss without treating media 404 as a restart", async () => {
    const missing = () => Response.json({ error: { message: "Không tìm thấy tác vụ.", code: "NOT_FOUND", retryable: false } }, { status: 404 });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(missing));
    await expect(pollBackendJob("job")).rejects.toThrow("Hãy phân tích và tải lại");
    await expect(analyzeWithBackend("https://youtu.be/example")).rejects.not.toThrow("khởi động lại");
  });

  it("retries an interrupted status GET, without creating another job", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(Response.json({ id: "job", status: "completed" }));
    vi.stubGlobal("fetch", fetcher);
    const pending = pollBackendJob("job");
    await vi.advanceTimersByTimeAsync(500);
    expect((await pending).status).toBe("completed");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });

  it("does not retry authentication failures", async () => {
    const fetcher = vi.fn().mockImplementation(() => Response.json({ error: { message: "Nguồn yêu cầu xác minh bot.", code: "BOT_VERIFICATION_REQUIRED", retryable: false } }, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(pollBackendJob("job")).rejects.toMatchObject({ status: 403, code: "BOT_VERIFICATION_REQUIRED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
