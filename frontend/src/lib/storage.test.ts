import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaults,
  readHistory,
  readSettings,
  writeHistory,
  writeSettings,
  type HistoryItem,
} from "./storage";

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
const item: HistoryItem = {
  id: "file-id",
  fileName: "ảnh.png",
  kind: "image",
  mime: "image/png",
  size: 100,
  at: 1000,
  saved: "received",
};

describe("local preferences and history", () => {
  it("recovers from invalid or partially incompatible preferences", () => {
    values.set("vibeload:settings:v1", "{broken");
    expect(readSettings()).toEqual(defaults);
    values.set(
      "vibeload:settings:v1",
      JSON.stringify({
        theme: "untrusted",
        maxMiB: 99999,
        rememberHistory: false,
      }),
    );
    expect(readSettings()).toEqual({ ...defaults, rememberHistory: false });
  });
  it("restores valid settings", () => {
    expect(
      writeSettings({ theme: "dark", maxMiB: 25, rememberHistory: false }),
    ).toBe(true);
    expect(readSettings()).toEqual({
      theme: "dark",
      maxMiB: 25,
      rememberHistory: false,
    });
  });
  it("ignores malformed history without crashing the date renderer", () => {
    values.set(
      "vibeload:history:v1",
      JSON.stringify([
        null,
        {},
        { ...item, at: 1e100 },
        { ...item, size: -5 },
        { ...item, saved: "completed" },
        item,
      ]),
    );
    expect(readHistory()).toEqual([item]);
  });
  it("removes persisted history when remembering is turned off", () => {
    expect(writeHistory([item], true)).toBe(true);
    expect(readHistory()).toEqual([item]);
    writeHistory([item], false);
    expect(readHistory()).toEqual([]);
    expect(values.has("vibeload:history:v1")).toBe(false);
  });
  it("bounds persisted history and never stores payloads or source URLs", () => {
    writeHistory(
      Array.from({ length: 120 }, (_, i) => ({ ...item, id: String(i) })),
      true,
    );
    const stored = values.get("vibeload:history:v1")!;
    expect(JSON.parse(stored)).toHaveLength(100);
    expect(stored).not.toMatch(/https:|blob:|signature|password/);
  });
  it("reports blocked storage while keeping safe defaults", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readSettings()).toEqual(defaults);
    expect(readHistory()).toEqual([]);
    expect(writeSettings(defaults)).toBe(false);
    expect(writeHistory([], false)).toBe(false);
  });
});
