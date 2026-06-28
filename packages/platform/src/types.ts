export interface FileItem {
  id?: string;
  name: string;
  path?: string;
  relativePath?: string;
  extension?: string;
  type: "file" | "directory";
  size?: number;
  updatedAt?: string;
}

export interface SystemInfo {
  osName: string;
  appVersion: string;
  homeLabel: string;
  cpuSummary: string;
  memorySummary: string;
}

export interface AllowedDirectory {
  id: string;
  label: string;
}

export interface FileSearchOptions {
  folderId: string;
  query?: string;
  extensions?: string[];
}

export interface TextFileReadResult {
  fileId: string;
  name: string;
  content: string;
  truncated: boolean;
}

export interface MediaActionResult {
  service: "youtube_music";
  query: string;
  url: string;
  attemptedAutoplay: boolean;
  message: string;
}

export interface PlatformAdapter {
  getPlatformName(): "web" | "desktop";
  getSystemInfo?(): Promise<SystemInfo>;
  chooseDirectory?(): Promise<AllowedDirectory | null>;
  readLocalFile?(path: string): Promise<string>;
  writeLocalFile?(path: string, content: string): Promise<void>;
  listDirectory?(path: string): Promise<FileItem[]>;
  searchFiles?(options: FileSearchOptions): Promise<FileItem[]>;
  readTextFile?(fileId: string): Promise<TextFileReadResult>;
  openExternalUrl(url: string): Promise<void>;
  openLocalApp?(appName: string): Promise<void>;
  playYouTubeMusic?(query: string): Promise<MediaActionResult>;
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
