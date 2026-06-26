import type { SafetyRisk } from "./types";

const HIGH_RISK_PATTERNS = [
  /delete|remove|erase|wipe|rm -rf/i,
  /결제|송금|이체|구매|환불/i,
  /메일.*보내|email.*send|send.*email/i,
  /게시|post|publish|upload/i,
  /파일.*삭제|폴더.*삭제|계정.*삭제/i,
  /앱.*실행|프로그램.*실행|run.*app/i
];

const MEDIUM_RISK_PATTERNS = [
  /수정|변경|update|edit/i,
  /캡처|screenshot|clipboard|클립보드/i,
  /연락|문자|카톡|slack|discord/i
];

export function classifyActionRisk(input: string): SafetyRisk {
  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(input))) {
    return {
      level: "high",
      requiresConfirmation: true,
      reason: "되돌리기 어렵거나 외부에 영향을 주는 작업이 포함될 수 있습니다."
    };
  }

  if (MEDIUM_RISK_PATTERNS.some((pattern) => pattern.test(input))) {
    return {
      level: "medium",
      requiresConfirmation: true,
      reason: "개인 데이터나 외부 커뮤니케이션에 영향을 줄 수 있어 확인이 필요합니다."
    };
  }

  return {
    level: "low",
    requiresConfirmation: false,
    reason: "일반적인 사고 정리 또는 정보 요청으로 보입니다."
  };
}
