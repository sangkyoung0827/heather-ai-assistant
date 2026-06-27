import type {
  AllowedDirectory,
  FileItem,
  FileSearchOptions,
  PlatformAdapter,
  SystemInfo,
  TextFileReadResult
} from "./types";

type TauriWindow = Window & {
  __TAURI__?: {
    core?: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
  };
};

export const DESKTOP_APP_ALLOWLIST = [
  "Safari",
  "Google Chrome",
  "Finder",
  "Cursor",
  "VS Code",
  "Notes",
  "Calendar",
  "Music",
  "Zoom",
  "Terminal"
];

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as TauriWindow).__TAURI__?.core?.invoke);
}

export async function invokeTauriCommand<T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
  if (!invoke) {
    throw new Error("Tauri Desktop bridge가 연결되어 있지 않습니다.");
  }

  return invoke<T>(command, args);
}

export class TauriDesktopPlatformAdapter implements PlatformAdapter {
  getPlatformName(): "desktop" {
    return "desktop";
  }

  async isBridgeAvailable(): Promise<boolean> {
    if (!isTauriRuntime()) return false;
    try {
      await this.getSystemInfo();
      return true;
    } catch {
      return false;
    }
  }

  async getSystemInfo(): Promise<SystemInfo> {
    return invokeTauri<SystemInfo>("get_system_info");
  }

  async chooseDirectory(): Promise<AllowedDirectory | null> {
    return invokeTauri<AllowedDirectory | null>("choose_directory");
  }

  async listDirectory(folderId: string): Promise<FileItem[]> {
    return invokeTauri<FileItem[]>("list_directory", { folderId });
  }

  async searchFiles(options: FileSearchOptions): Promise<FileItem[]> {
    return invokeTauri<FileItem[]>("search_files", { ...options });
  }

  async readTextFile(fileId: string): Promise<TextFileReadResult> {
    return invokeTauri<TextFileReadResult>("read_text_file", { fileId });
  }

  async readLocalFile(path: string): Promise<string> {
    const result = await this.readTextFile(path);
    return result.content;
  }

  async writeLocalFile(): Promise<void> {
    throw new Error("파일 쓰기는 Heather 1차 데스크톱 제어 버전에서 금지되어 있습니다.");
  }

  async openExternalUrl(url: string): Promise<void> {
    await invokeTauri("open_external_url", { url });
  }

  async openLocalApp(appName: string): Promise<void> {
    await invokeTauri("open_app", { appName });
  }

  async getClipboardText(): Promise<string> {
    const result = await invokeTauri<{ text: string }>("get_clipboard_text");
    return result.text;
  }

  async setClipboardText(text: string): Promise<void> {
    await invokeTauri("set_clipboard_text", { text });
  }

  async captureScreen(): Promise<Blob> {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("이 환경은 화면 캡처 미리보기를 지원하지 않습니다.");
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    try {
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("화면 캡처 canvas를 만들 수 없습니다.");
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        throw new Error("화면 캡처 이미지를 만들 수 없습니다.");
      }
      return blob;
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  async requestMicrophonePermission(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }
}

async function invokeTauri<T = unknown>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  return invokeTauriCommand<T>(command, args);
}
