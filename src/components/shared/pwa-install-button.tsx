"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isAppInstalled() {
  if (typeof window === "undefined") return false;

  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function PwaInstallButton({ className }: { className?: string }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState("");
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isAppInstalled());

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMessage("App installed successfully.");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installed || isAppInstalled()) {
      setInstalled(true);
      setMessage("You already installed the app.");
      return;
    }

    if (!installPrompt) {
      setMessage("Use your browser menu to install this app.");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      setInstalled(true);
      setMessage("App installed successfully.");
    }
  };

  return (
    <div className={cn("relative inline-flex flex-col items-end", className)}>
      <Button
        className="h-9 shrink-0 px-3 text-xs sm:px-3.5"
        onClick={handleInstall}
        size="sm"
        type="button"
        variant="secondary"
      >
        <Download aria-hidden="true" size={15} />
        Install app
      </Button>
      {message ? (
        <p
          aria-live="polite"
          className="absolute right-0 top-11 z-20 w-48 rounded-xl border border-line bg-surface px-3 py-2 text-right text-xs font-semibold text-muted shadow-sm"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
