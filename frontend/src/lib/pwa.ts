import { useEffect, useState } from "react";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export function usePwa() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [update, setUpdate] = useState(false);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState(false);
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches,
  );
  useEffect(() => {
    const onInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    let live = true;
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => {
          if (!live) return;
          setRegistration(reg);
          setUpdate(!!reg.waiting);
          reg.addEventListener("updatefound", () => {
            reg.installing?.addEventListener("statechange", () => {
              if (reg.waiting && navigator.serviceWorker.controller)
                setUpdate(true);
            });
          });
          navigator.serviceWorker.ready.then(() => {
            if (live) setReady(true);
          });
        })
        .catch(() => {
          if (live) setFailure(true);
        });
    }
    return () => {
      live = false;
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  async function install() {
    if (!prompt) return false;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    return true;
  }
  function applyUpdate() {
    if (!registration?.waiting) return;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    registration.waiting.postMessage("ACTIVATE_UPDATE");
  }
  return {
    canInstall: !!prompt,
    installed,
    install,
    update,
    ready,
    failure,
    applyUpdate,
  };
}
