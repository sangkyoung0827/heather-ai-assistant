export interface FileItem {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  updatedAt?: string;
}

export interface PlatformAdapter {
  getPlatformName(): "web" | "desktop";
  readLocalFile?(path: string): Promise<string>;
  writeLocalFile?(path: string, content: string): Promise<void>;
  listDirectory?(path: string): Promise<FileItem[]>;
  openExternalUrl(url: string): Promise<void>;
  openLocalApp?(appName: string): Promise<void>;
  captureScreen?(): Promise<Blob>;
  getClipboardText?(): Promise<string>;
  setClipboardText?(text: string): Promise<void>;
  requestMicrophonePermission(): Promise<boolean>;
}

export interface DesktopOnlyFeature {
  key: keyof PlatformAdapter;
  label: string;
  reason: string;
}
