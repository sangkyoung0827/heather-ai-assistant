# Heather 검색 공급자 설정

Heather의 검색은 무료 우선, 허용 목록 방식입니다. `SEARCH_PAID_FALLBACK_ENABLED`와 `SEARCH_ALLOW_PAID_PROVIDER`가 모두 `true`인 경우를 제외하면 유료 API를 호출하지 않습니다. 기본값은 모두 `false`입니다.

## 개인 웹 검색

비공개 SearXNG 인스턴스를 운영하고 내부 HTTPS 주소를 `SEARXNG_URL`에 설정하세요. 토큰이 필요하면 `SEARXNG_INTERNAL_TOKEN`도 설정합니다. Heather는 JSON 결과만 요청합니다. Production에는 공용 공유 SearXNG 주소를 사용하지 마세요.

## 학술 발견

OpenAlex, Crossref, PubMed, Europe PMC는 무료 경로입니다. 일반 학술 검색은 OpenAlex, 생의학 관련 질의는 Europe PMC를 우선 사용합니다. OpenAlex 결과가 없을 때만 Crossref를 사용합니다. PubMed, Unpaywall, Semantic Scholar는 명시적 또는 향후 허용 라우팅을 위한 어댑터이며, 선택 설정이 없으면 유료 공급자로 대체하지 않고 제한적으로 비활성화됩니다.

Crossref에는 `CROSSREF_MAILTO`와 식별 가능한 `CROSSREF_USER_AGENT`를 설정하세요. PubMed에는 `NCBI_CONTACT_EMAIL` 및 선택적으로 `NCBI_API_KEY`를 설정합니다. DOI 오픈 액세스 위치 조회를 사용할 때만 `UNPAYWALL_EMAIL`을 설정하세요. `SEMANTIC_SCHOLAR_API_KEY`는 선택 사항이며, 없으면 낮은 호출 한도로 취급해야 합니다.

## 배포 순서

1. Supabase SQL Editor에서 `supabase/migrations/007_phase4_search_discovery.sql`을 실행합니다.
2. 별도 배포된 Agent Runtime에 환경변수를 넣습니다. `NEXT_PUBLIC_*` 또는 브라우저 환경변수에는 넣지 않습니다.
3. Runtime의 HTTPS `/health`가 확인된 뒤에만 웹 배포 환경변수 `AGENT_RUNTIME_URL`을 설정합니다.
4. Heather에 로그인한 뒤 명시적인 검색 요청을 보냅니다. Direct Command는 항상 검색보다 먼저 처리됩니다.

검색 결과는 후보일 뿐입니다. Heather가 메모리나 연구자료에 자동 저장하지 않습니다.
