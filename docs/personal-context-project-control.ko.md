# Heather 개인 컨텍스트·프로젝트 통합 관리

## 범위

Phase 10은 기존 개인 메모리, 연구 메모리, Direct Command, 검색, 생산공정관리와 분리된 사용자 승인형 Control Plane이다. 기존 데이터를 이동·삭제하거나 seed를 자동으로 저장하지 않는다.

## 데이터 경계

- `identity_memories`: 안정적인 본인 프로필과 장기 목표
- `preference_memories`: 언어·응답 방식·승인 및 비용 정책
- `context_projects`, `context_project_aliases`: 개인 프로젝트와 별칭
- `project_context_memories`, `operational_contexts`: 프로젝트 맥락과 만료 가능한 운영 상태
- `sensitive_memories`: 일반 resolver와 채팅 프롬프트에서 완전히 제외되는 민감 메모
- `project_resources`: 공개 URL, GitHub 저장소, 웹 리소스의 레지스트리. URL·상태만 저장하며 비밀값은 저장하지 않음
- `context_connectors`, `connector_capabilities`: 연결 상태와 허용 capability. OAuth token, API key, cookie는 저장하지 않음
- `permission_policies`, `approval_requests`, `action_audit_logs`: 권한 수준, 사용자 승인, 안전한 실행 기록
- `context_import_batches`, `context_import_items`: 가져오기 미리보기와 항목별 결과

모든 테이블은 사용자 소유 RLS를 사용한다. 팀 프로젝트는 기존 `research_team_members`의 활성 멤버 검사를 재사용하지만, 민감 메모리는 팀 공유가 불가능하다.

## Seed 가져오기

`data/seed/personal-context/`의 JSON은 코드에 포함된 검토용 데이터다.

1. `/memory/context-import`에서 **seed 미리보기**를 연다.
2. 각 항목을 확인하고 선택한다.
3. **선택 항목 저장**을 눌러야만 저장된다.
4. 민감 항목은 기본 선택되지 않으며, 사용자가 명시적으로 선택해야 한다.
5. 항목 하나가 실패해도 나머지 항목의 결과를 유지하며 summary로 보고한다.

## 권한 수준

- `observe`: 읽기만 가능
- `propose`: 제안만 가능
- `approval_execute`: 실행 전 사용자 승인 필요
- `strong_approval`: 고위험 실행에 별도 강한 승인 필요

현재 구현된 외부 읽기 범위는 공개 HTTPS 리소스와 public GitHub repository metadata/최근 commit 읽기다. GitHub push, Vercel 배포 실행, Google/YouTube 쓰기, 이메일 전송, 결제, 파일 삭제는 이 기능에 포함하지 않는다.

## 채팅 Resolver

로그인 사용자가 프로젝트 별칭을 포함한 요청을 보내면, `/api/chat`은 해당 프로젝트의 최신 비민감 프로젝트 메모리와 유효한 운영 맥락만 작은 범위로 추가한다. 프로젝트가 매칭되지 않거나 Control Plane migration이 아직 적용되지 않았으면 기존 채팅 경로를 그대로 사용한다. `sensitive_memories`는 절대 채팅 컨텍스트로 전달되지 않는다.

## 배포 전 적용

Supabase SQL Editor에서 `supabase/migrations/009_personal_context_project_control.sql`을 적용한다. 이후 Vercel은 추가 환경변수 없이 새 API를 사용한다. 기존 사용자 데이터와 테이블에는 destructive migration이 없다.

## 검증 체크리스트

- 로그인 후 `/memory/context-import`에서 seed preview 확인
- 민감 항목이 기본 미선택인지 확인
- 선택한 프로젝트와 프로젝트 메모리 import 확인
- `/projects`에서 프로젝트·별칭·resource 확인
- `/connections`에서 비밀값 없이 상태만 보이는지 확인
- `/approvals`에서 pending request만 승인/거절 가능한지 확인
- 프로젝트 별칭 질문이 기존 chat에 비민감 컨텍스트만 추가하는지 확인
