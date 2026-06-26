import type { PlatformAdapter } from "./types";

export interface DesktopPlatformAdapter extends PlatformAdapter {
  getPlatformName(): "desktop";
  readLocalFile(path: string): Promise<string>;
  writeLocalFile(path: string, content: string): Promise<void>;
  listDirectory(path: string): Promise<Array<{ name: string; path: string; type: "file" | "directory" }>>;
  openLocalApp(appName: string): Promise<void>;
  captureScreen(): Promise<Blob>;
  getClipboardText(): Promise<string>;
  setClipboardText(text: string): Promise<void>;
}
