/**
 * High-precision, zero-overhead Haptic Feedback utility for mobile browsers.
 * Synchronized with native VibeHaptic in VibeLoad Android.
 */
export function triggerHaptic(pattern: number | number[] = 25): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported or restricted environments
  }
}
