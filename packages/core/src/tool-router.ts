import type { PlatformCapability } from "./types";

export const PLATFORM_CAPABILITIES: PlatformCapability[] = [
  {
    key: "openExternalUrl",
    label: "외부 URL 열기",
    status: "available",
    description: "웹과 데스크톱 모두에서 안전하게 지원할 수 있습니다."
  },
  {
    key: "microphone",
    label: "마이크 권한",
    status: "available",
    description: "웹에서는 브라우저 권한을 통해 요청합니다."
  },
  {
    key: "readLocalFile",
    label: "로컬 파일 읽기",
    status: "desktopOnly",
    description: "웹 보안 모델에서는 직접 경로 접근이 불가능합니다. Tauri/Electron에서 구현합니다."
  },
  {
    key: "writeLocalFile",
    label: "로컬 파일 쓰기",
    status: "desktopOnly",
    description: "사용자 확인 후 데스크톱 어댑터에서만 구현해야 합니다."
  },
  {
    key: "openLocalApp",
    label: "로컬 앱 실행",
    status: "desktopOnly",
    description: "웹에서는 no-op입니다. 데스크톱에서는 허용 목록과 확인 절차가 필요합니다."
  },
  {
    key: "captureScreen",
    label: "화면 캡처",
    status: "desktopOnly",
    description: "웹에서는 제한적 화면 공유만 가능하며, 실제 자동 캡처는 데스크톱 단계 기능입니다."
  },
  {
    key: "clipboard",
    label: "클립보드",
    status: "desktopOnly",
    description: "웹에서는 제한적으로만 가능하므로 데스크톱에서 명시 확인 후 확장합니다."
  }
];
