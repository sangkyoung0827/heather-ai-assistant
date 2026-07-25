import type { DirectCommandRepository } from "./direct-command-repository";

export const AUTO_PROMOTION_COUNT = 3;
export const AUTO_LEARNING_WINDOW_DAYS = 30;
export const AUTO_RECREATE_COOLDOWN_DAYS = 90;
export const REPEATED_QUERY_SIMILARITY_THRESHOLD = 0.9;
export const RESPONSE_CONSISTENCY_THRESHOLD = 0.92;
export const MIN_QUERY_LENGTH = 5;
export const MAX_QUERY_LENGTH = 500;
export const MAX_AUTO_RESPONSE_LENGTH = 4000;
export const MAX_QUERY_VARIANTS = 12;
export const PATTERN_RETENTION_DAYS = 180;

const EXCLUDED_QUERY = /(?:^|\s)(안녕|고마워|응|아니|그래|계속해|다시|왜|뭐|확인|테스트)(?:[!?。. ]|$)|\b(hello|thanks|yes|no|continue|again|why|what|test)\b/i;
const DYNAMIC_OR_RISKY_QUERY = /현재\s*(시간|날짜|날씨|기온|시스템|배포|상태|재고)|오늘\s*일정|내일\s*일정|날씨|주가|환율|가상자산|가격|최신\s*(뉴스|법률|정책|제품|결과)|실시간|검색|이메일|메일|파일.*(삭제|이동|수정)|삭제해|보내줘|결제|주문|계정|권한|매수|매도|설치|제거|의료|진단|법률|투자|글.*(써|작성)|아이디어|추천|요약|비밀번호|인증번호|api\s*key|주민등록|금융/i;
const ERROR_RESPONSE = /오류|error|실패|실행할 수 없|확인하세요|not available|unable to/i;
const SENSITIVE_RESPONSE = /password|비밀번호|api[_\s-]?key|인증번호|주민등록|카드\s*번호|account\s*number/i;

export function classifyAutoLearningEligibility(message: string, response: string) {
  const query = message.trim();
  if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) return false;
  if (!response.trim() || response.length > MAX_AUTO_RESPONSE_LENGTH) return false;
  if (EXCLUDED_QUERY.test(query) || DYNAMIC_OR_RISKY_QUERY.test(query)) return false;
  if (ERROR_RESPONSE.test(response) || SENSITIVE_RESPONSE.test(query) || SENSITIVE_RESPONSE.test(response)) return false;
  return true;
}

export class RepeatedQueryLearningService {
  constructor(private readonly repository: DirectCommandRepository) {}

  async recordSuccessfulFallback(input: { message: string; response: string; messageId?: string }) {
    if (!classifyAutoLearningEligibility(input.message, input.response)) return;
    await this.repository.recordRepeatedFallback(input);
  }
}
