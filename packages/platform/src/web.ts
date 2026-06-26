import type { DesktopOnlyFeature, PlatformAdapter } from "./types";

export const WEB_DESKTOP_ONLY_FEATURES: DesktopOnlyFeature[] = [
  {
    key: "readLocalFile",
    label: "로컬 파일 읽기",
    reason: "브라우저는 사용자가 직접 고른 파일 외의 로컬 경로에 접근할 수 없습니다."
  },
  {
    key: "writeLocalFile",
    label: "로컬 파일 쓰기",
    reason: "파일 시스템 쓰기는 데스크톱 앱 권한 모델에서 사용자 확인 후 처리해야 합니다."
  },
  {
    key: "listDirectory",
    label: "폴더 검색",
    reason: "임의 폴더 탐색은 웹 보안 정책상 제한됩니다."
  },
  {
    key: "openLocalApp",
    label: "로컬 앱 실행",
    reason: "웹에서 로컬 앱 실행은 안전하게 일반화할 수 없습니다."
  },
  {
    key: "captureScreen",
    label: "화면 캡처",
    reason: "자동 화면 캡처는 데스크톱 앱에서 명시 권한과 함께 구현해야 합니다."
  },
  {
    key: "getClipboardText",
    label: "클립보드 읽기",
    reason: "웹 클립보드 접근은 브라우저와 권한 상태에 따라 매우 제한적입니다."
  }
];

export class WebPlatformAdapter implements PlatformAdapter {
  getPlatformName(): "web" {
    return "web";
  }

  async openExternalUrl(url: string): Promise<void> {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async requestMicrophonePermission(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }
}
