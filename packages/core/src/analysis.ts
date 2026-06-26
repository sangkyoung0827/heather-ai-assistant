import type { PersonOrgAnalysis } from "./types";

export function analyzePersonOrOrganization(input: string): PersonOrgAnalysis {
  const target = input.trim() || "대상";
  const isWorkLike = /일|업무|프로젝트|책임|교수|대표|팀|조직|학교|회사/.test(target);

  return {
    visibleBehavior: isWorkLike
      ? "겉으로는 기회 제공, 신뢰, 성장 경험 부여처럼 보일 수 있습니다."
      : "겉으로는 호의, 관심, 친밀감, 또는 반복적인 요청처럼 보일 수 있습니다.",
    actualStructure:
      "실제로는 누가 결정권을 갖고, 누가 실행 부담을 지며, 결과 책임이 누구에게 돌아가는지의 구조가 핵심입니다.",
    possibleMotives:
      "가능한 동기는 선의의 기대, 비용 절감, 책임 회피, 사용자의 능력 활용, 관계 유지 욕구가 섞여 있을 수 있습니다. 하나로 단정하지 말고 반복 패턴을 봐야 합니다.",
    userRole:
      "사용자는 문제 해결자 또는 완충재 역할로 배치될 가능성이 있습니다. 이 역할이 자발적 선택인지, 분위기상 떠밀린 것인지 구분해야 합니다.",
    authorityResponsibilityBalance:
      "경계선은 여기입니다: '능력 있는 사람에게 좋은 기회를 준다'는 권한, 보상, 학습 기회가 함께 옵니다. 반대로 '능력 있는 사람에게 일을 계속 넘긴다'는 권한은 제한되고 책임과 노동만 늘어납니다.",
    riskSignals:
      "위험 신호는 감사 표현은 많지만 권한이 없을 때, 마감만 있고 범위가 없을 때, 거절하면 관계 손상처럼 느껴질 때, 성과가 나도 공식 인정이 희미할 때입니다.",
    responseStrategy:
      "대응은 감정 대립보다 구조 확인이 좋습니다. 기대 결과, 결정권자, 마감, 보상/인정, 거절 가능한 범위를 문장으로 확인하고, 반복 요청은 프로젝트나 역할 단위로 재협상하세요."
  };
}
