export interface SaveResult {
  state: "written" | "requested";
}
interface SaveHandle {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}
type SaveWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
  }) => Promise<SaveHandle>;
};

export async function saveBlob(
  blob: Blob,
  fileName: string,
  options?: { skipPicker?: boolean },
): Promise<SaveResult> {
  const picker = !options?.skipPicker ? (window as SaveWindow).showSaveFilePicker : undefined;
  if (picker && window.isSecureContext) {
    let handle: SaveHandle | null = null;
    try {
      handle = await picker.call(window, { suggestedName: fileName });
    } catch (pickerError) {
      if (
        pickerError instanceof DOMException &&
        pickerError.name === "AbortError"
      ) {
        throw pickerError;
      }
      // Fall through to link download if gesture expired or picker not permitted
    }
    if (handle) {
      const writer = await handle.createWritable();
      try {
        await writer.write(blob);
        await writer.close();
        return { state: "written" };
      } catch (error) {
        await writer.abort().catch(() => {});
        throw error;
      }
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Safari may still be consuming the object URL when the click returns.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return { state: "requested" };
}

export function canNativeShareBlob(blob: Blob, fileName: string): boolean {
  if (
    typeof navigator === "undefined" ||
    typeof File === "undefined" ||
    typeof navigator.canShare !== "function" ||
    typeof navigator.share !== "function"
  ) {
    return false;
  }
  try {
    const file = new File([blob], fileName, {
      type: blob.type || "application/octet-stream",
    });
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareBlobNative(
  blob: Blob,
  fileName: string,
  title?: string,
): Promise<boolean> {
  if (!canNativeShareBlob(blob, fileName)) return false;
  try {
    const file = new File([blob], fileName, {
      type: blob.type || "application/octet-stream",
    });
    await navigator.share({
      files: [file],
      title: title || fileName,
    });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return false;
    }
    throw err;
  }
}
