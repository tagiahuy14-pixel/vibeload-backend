import { afterEach, describe, expect, it, vi } from "vitest";
import { canNativeShareBlob, saveBlob, shareBlobNative } from "./save";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("save handoff semantics", () => {
  it("only reports a written file after the writable stream closes", async () => {
    const steps: string[] = [];
    const blob = new Blob(["media"], { type: "audio/wav" });
    const picker = vi.fn(async () => ({
      createWritable: async () => ({
        write: async (data: Blob) => {
          expect(data).toBe(blob);
          steps.push("write");
        },
        close: async () => {
          steps.push("close");
        },
        abort: vi.fn(),
      }),
    }));
    vi.stubGlobal("window", {
      isSecureContext: true,
      showSaveFilePicker: picker,
    });
    expect(await saveBlob(blob, "âm thanh.wav")).toEqual({ state: "written" });
    expect(steps).toEqual(["write", "close"]);
    expect(picker).toHaveBeenCalledWith({ suggestedName: "âm thanh.wav" });
  });
  it("aborts on write failure and propagates the error", async () => {
    const abort = vi.fn(async () => {});
    vi.stubGlobal("window", {
      isSecureContext: true,
      showSaveFilePicker: async () => ({
        createWritable: async () => ({
          write: async () => {
            throw new Error("disk full");
          },
          close: vi.fn(),
          abort,
        }),
      }),
    });
    await expect(saveBlob(new Blob(["media"]), "file.wav")).rejects.toThrow(
      "disk full",
    );
    expect(abort).toHaveBeenCalledOnce();
  });
  it("keeps user cancellation distinct from a successful save", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      showSaveFilePicker: async () => {
        throw new DOMException("cancel", "AbortError");
      },
    });
    await expect(
      saveBlob(new Blob(["media"]), "file.wav"),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("fallback hands a Blob URL to the browser without claiming a disk write", async () => {
    vi.useFakeTimers();
    const click = vi.fn(),
      remove = vi.fn(),
      append = vi.fn(),
      revoke = vi.fn();
    const anchor = { href: "", download: "", rel: "", click, remove };
    const nativeUrl = URL;
    vi.stubGlobal("window", { isSecureContext: true, setTimeout });
    vi.stubGlobal("document", {
      createElement: () => anchor,
      body: { append },
    });
    vi.stubGlobal(
      "URL",
      Object.assign(class extends nativeUrl {}, {
        createObjectURL: vi.fn(() => "blob:local-media"),
        revokeObjectURL: revoke,
      }),
    );
    expect(await saveBlob(new Blob(["media"]), "ảnh.png")).toEqual({
      state: "requested",
    });
    expect(anchor.href).toBe("blob:local-media");
    expect(anchor.download).toBe("ảnh.png");
    expect(click).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(anchor);
    expect(remove).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith("blob:local-media");
  });
  it("detects and executes native Web Share file handoff for iOS/macOS Safari", async () => {
    const share = vi.fn(async () => {});
    const canShare = vi.fn((data?: ShareData) => Boolean(data?.files?.length));
    vi.stubGlobal("navigator", { share, canShare });
    const blob = new Blob(["video-bytes"], { type: "video/mp4" });
    expect(canNativeShareBlob(blob, "clip.mp4")).toBe(true);
    expect(await shareBlobNative(blob, "clip.mp4", "Clip Demo")).toBe(true);
    expect(share).toHaveBeenCalledOnce();
  });
});

