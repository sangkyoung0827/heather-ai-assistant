# 해커톤 시연 순서

1. Researcher의 `생산공정관리`를 연다.
2. 기본 예시 자연어 지시를 확인하고 `조건 해석`을 누른다.
3. 성장 48시간, 28°C/DO 유지와 축적 25°C/질소 제한의 구조화 plan 및 자동 보완값을 설명한다.
4. 연구용 시뮬레이션 고지를 확인한 뒤 실행을 승인한다.
5. 발효조 digital twin에서 단계·온도·pH·DO·기포·교반 상태가 시간 가속으로 바뀌는 것을 보여준다.
6. DHA, biomass, 생산성, 권장 수확시점과 시뮬레이션 한계를 설명한다.
7. 실험 기록과 다음 실험 탭에서 사용자 승인 전에는 자동 실행되지 않는 후보를 보여준다.

Supabase SQL Editor에서 `008_phase9_production_process.sql`을 실행한 뒤, Agent Runtime과 Vercel에 기존 `SUPABASE_*`, `AGENT_RUNTIME_URL`, `AGENT_RUNTIME_INTERNAL_TOKEN`을 유지해야 합니다. 별도 API 키는 필요하지 않습니다.
