"use client";

import { useEffect } from "react";
import Image from "next/image";

export default function FloatingLauncherPage() {
  useEffect(() => {
    const previousBackground = document.body.style.background;
    document.body.style.background = "transparent";
    return () => {
      document.body.style.background = previousBackground;
    };
  }, []);

  async function openHeather() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("show_heather");
    } catch {
      window.location.href = "/";
    }
  }

  return (
    <main className="floating-heather-root" data-tauri-drag-region>
      <button
        type="button"
        onClick={() => void openHeather()}
        className="floating-heather-button"
        aria-label="Heather AI Assistant 열기"
        title="Heather AI Assistant"
        data-tauri-drag-region
      >
        <Image src="/icons/heather-icon.png" alt="" width={58} height={58} priority />
      </button>
    </main>
  );
}
