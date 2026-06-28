"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import Image from "next/image";

type FloatingWindowHandle = {
  outerPosition(): Promise<{ x: number; y: number }>;
  setPosition(position: unknown): Promise<void>;
};

type PhysicalPositionConstructor = new (x: number, y: number) => unknown;

type DragState = {
  window: FloatingWindowHandle;
  PhysicalPosition: PhysicalPositionConstructor;
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startWindowX: number;
  startWindowY: number;
  moved: boolean;
};

export default function FloatingLauncherPage() {
  const dragStateRef = useRef<DragState | null>(null);

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

  async function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    try {
      const [{ getCurrentWindow }, { PhysicalPosition }] = await Promise.all([
        import("@tauri-apps/api/window"),
        import("@tauri-apps/api/dpi")
      ]);
      const currentWindow = getCurrentWindow() as FloatingWindowHandle;
      const position = await currentWindow.outerPosition();
      dragStateRef.current = {
        window: currentWindow,
        PhysicalPosition,
        pointerId: event.pointerId,
        startPointerX: event.screenX,
        startPointerY: event.screenY,
        startWindowX: position.x,
        startWindowY: position.y,
        moved: false
      };
    } catch {
      dragStateRef.current = null;
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const deltaX = event.screenX - state.startPointerX;
    const deltaY = event.screenY - state.startPointerY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
      state.moved = true;
    }

    void state.window.setPosition(
      new state.PhysicalPosition(
        Math.round(state.startWindowX + deltaX),
        Math.round(state.startWindowY + deltaY)
      )
    );
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const state = dragStateRef.current;
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!state?.moved) {
      void openHeather();
    }
  }

  return (
    <main className="floating-heather-root">
      <button
        type="button"
        onPointerDown={(event) => void handlePointerDown(event)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStateRef.current = null;
        }}
        className="floating-heather-button"
        aria-label="Heather AI Assistant 열기"
        title="Heather AI Assistant"
      >
        <Image src="/icons/heather-avatar.png" alt="" width={68} height={68} priority unoptimized />
      </button>
    </main>
  );
}
