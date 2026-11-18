import type { MediaKind } from "./media";

export type Theme = "system" | "light" | "dark";
export interface Settings {
  theme: Theme;
  maxMiB: 25 | 50 | 100;
  rememberHistory: boolean;
}
export interface HistoryItem {
  id: string;
  fileName: string;
  kind: MediaKind;
  mime: string;
  size: number;
  at: number;
  saved: "received" | "requested" | "written" | "opened";
}
const SETTINGS = "vibeload:settings:v1";
const HISTORY = "vibeload:history:v1";
export const defaults: Settings = {
  theme: "system",
  maxMiB: 50,
  rememberHistory: true,
};

export function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS) || "null");
    if (!value || typeof value !== "object") return defaults;
    return {
      theme: ["light", "dark", "system"].includes(value.theme)
        ? value.theme
        : "system",
      maxMiB: [25, 50, 100].includes(value.maxMiB) ? value.maxMiB : 50,
      rememberHistory: value.rememberHistory !== false,
    };
  } catch {
    return defaults;
  }
}
export function readHistory(): HistoryItem[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(HISTORY) || "[]");
    if (!Array.isArray(items)) return [];
    return items
      .filter(
        (item): item is HistoryItem =>
          !!item &&
          typeof item.id === "string" &&
          typeof item.fileName === "string" &&
          item.fileName.length <= 240 &&
          ["image", "audio", "video"].includes(item.kind) &&
          typeof item.mime === "string" &&
          ["received", "requested", "written", "opened"].includes(item.saved) &&
          Number.isFinite(item.size) &&
          item.size > 0 &&
          Number.isFinite(item.at) &&
          item.at >= 0 &&
          item.at <= 8_640_000_000_000_000,
      )
      .slice(0, 100);
  } catch {
    return [];
  }
}
export function writeSettings(settings: Settings): boolean {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
export function writeHistory(items: HistoryItem[], remember: boolean): boolean {
  try {
    if (remember)
      localStorage.setItem(HISTORY, JSON.stringify(items.slice(0, 100)));
    else localStorage.removeItem(HISTORY);
    return true;
  } catch {
    return false;
  }
}
