# Heather 검색 Production 배포

Heather 웹앱은 브라우저에서 Runtime을 직접 호출하지 않습니다. Vercel의 `/api/intent/resolve`가 로그인 세션의 Bearer token과 서버 전용 내부 토큰을 Runtime에 전달하고, Runtime이 private SearXNG와 학술 provider를 호출합니다.

## 1. 서비스 배포

1. Railway(또는 동등한 컨테이너 호스트)에 `agent-runtime` 서비스를 만들고 Root Directory를 `apps/agent-runtime`으로 설정합니다.
2. 같은 프로젝트에 `searxng` 서비스를 만들고 Root Directory를 `infra/searxng`으로 설정합니다. 공개 도메인은 만들지 않습니다.
3. `agent-runtime`만 HTTPS 공개 도메인을 생성합니다.
4. Runtime의 `SEARXNG_URL`은 플랫폼 private DNS와 포트(예: `http://searxng.railway.internal:8080`)로 설정합니다.

## 2. 환경변수

Runtime에는 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AGENT_RUNTIME_INTERNAL_TOKEN`, `NVIDIA_API_KEY`, `NVIDIA_API_BASE_URL`, `NVIDIA_MODEL_GENERAL`, `SEARXNG_URL`, 필요 시 `SEARXNG_INTERNAL_TOKEN` 및 학술 provider 환경변수를 등록합니다. `SEARCH_PAID_FALLBACK_ENABLED=false`와 `SEARCH_ALLOW_PAID_PROVIDER=false`를 유지합니다.

SearXNG에는 `SEARXNG_SECRET_KEY`를 등록합니다. 새 값은 `openssl rand -hex 32`로 만들고, `PORT`는 호스트가 주입하도록 둡니다. Vercel에는 `AGENT_RUNTIME_URL`과 Runtime과 동일한 `AGENT_RUNTIME_INTERNAL_TOKEN`만 등록합니다. URL·토큰을 `NEXT_PUBLIC_*` 변수에 넣지 않습니다.

## 3. 검증 및 장애 점검

1. 외부에서 `curl -s https://<runtime-domain>/health`를 실행해 `providers.searxng.status`가 `configured`인지 확인합니다.
2. Vercel 환경변수를 저장한 뒤 Production을 Redeploy합니다.
3. Heather에 로그인한 후 “전북대학교의 최신 공식 정보를 검색해줘”와 “미세조류 DHA 생산 관련 최신 연구 논문을 찾아줘”를 실행합니다.
4. 답변 본문과 출처 제목·URL을 확인합니다. Runtime 장애 시에는 기존 LLM fallback만 사용됩니다.

`configured`가 아니면 Runtime 로그에서 `SEARXNG_URL`의 private DNS/포트와 SearXNG 컨테이너 상태를 먼저 확인합니다. 외부 공개 전에 노출 가능성이 있었던 Supabase 세션, 외부 API 키, 내부 토큰과 SearXNG secret을 회전합니다. 로그·문서·커밋에는 실제 키를 남기지 않습니다.
