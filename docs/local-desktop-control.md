# Heather Local Desktop Control

Heather AI Assistant의 로컬 데스크톱 제어는 “생각하는 AI”와 “실행하는 어댑터”를 분리한다. Ollama는 사용자의 요청을 이해하고 응답을 생성하는 두뇌 역할만 맡고, 실제 컴퓨터 상태 조회와 제한된 조작은 Tauri 기반 `DesktopPlatformAdapter`가 allowlisted action으로만 수행한다.

## Ollama의 역할

- 로컬 LLM 서버 기본 주소는 `http://localhost:11434`이다.
- 기본 모델은 `OLLAMA_MODEL` 환경변수 또는 앱 설정의 `ollamaModel` 값으로 선택한다.
- 설정 모델이 설치되어 있지 않으면 `/api/tags`의 설치 모델 목록에서 가장 가까운 모델을 자동 선택한다.
- Ollama는 채팅, 요약, 의도 해석, 실행 결과 설명을 담당한다.
- Ollama는 shell command, 파일 시스템 직접 접근, 브라우저 쿠키 접근, 결제, 이메일 전송 같은 실제 작업을 직접 실행하지 않는다.
- 연결 실패 시 UI와 API는 “Ollama가 실행 중인지 확인하세요”라고 안내한다.

## Tauri DesktopPlatformAdapter의 역할

`DesktopPlatformAdapter`는 데스크톱 앱에서만 활성화되는 실행 계층이다. 웹 배포 환경에서는 기존 `WebPlatformAdapter`를 유지하고, Tauri runtime이 감지될 때만 로컬 제어 도구를 노출한다.

데스크톱 앱은 시스템 트레이, `Command+Shift+H`/`Ctrl+Shift+H` 전역 단축키, 작은 항상-위 플로팅 런처 창을 제공한다. 플로팅 런처는 Heather를 호출하는 입구일 뿐이며, 컴퓨터 조작은 여전히 allowlisted action과 사용자 확인 흐름을 통과해야 한다.

Tauri command는 다음 원칙을 따른다.

- 사용자가 선택한 폴더만 접근한다.
- 임의 경로 문자열 입력으로 파일 시스템을 탐색하지 않는다.
- 파일 목록은 파일명, 확장자, 크기, 수정일 같은 최소 정보만 반환한다.
- URL 열기는 `http://`와 `https://`만 허용한다.
- 앱 실행은 allowlist에 있는 앱만 허용한다.
- Terminal은 열 수 있지만 command 자동 실행은 금지한다.
- 클립보드와 스크린샷은 사용자 확인 후에만 실행한다.

## AI에게 shell command를 직접 주면 안 되는 이유

개인 비서 AI는 사용자의 컴퓨터와 개인 데이터에 가까운 위치에서 동작한다. AI에게 임의 shell command 실행 권한을 주면 의도 분석 오류, prompt injection, 잘못된 파일 경로, 악성 웹 콘텐츠, 자동화 실수 하나만으로 파일 삭제, 토큰 유출, 결제, 계정 침해 같은 피해가 발생할 수 있다.

Heather는 이 위험을 줄이기 위해 자연어 요청을 바로 실행하지 않고 다음 흐름을 사용한다.

1. intent 분석
2. 필요한 tool 후보 생성
3. risk level 판단
4. 사용자 확인 필요 여부 판단
5. allowlisted tool 실행
6. 결과 요약
7. 민감정보를 제거한 실행 로그 저장

## 허용된 action 목록

| Action | 역할 | 위험도 | 사용자 확인 |
| --- | --- | --- | --- |
| `check_ollama_status` | Ollama 연결 상태와 모델 확인 | low | 불필요 |
| `get_system_info` | OS, 앱 버전, 홈 디렉토리 label 확인 | low | 불필요 |
| `open_external_url` | 기본 브라우저에서 http/https URL 열기 | medium | 필요 |
| `choose_directory` | 사용자가 폴더를 직접 선택 | medium | 필요 |
| `list_directory` | 선택된 폴더의 파일 목록 조회 | medium | 필요 |
| `search_files` | 선택된 폴더 내부에서 허용 확장자 검색 | medium | 필요 |
| `read_text_file` | 선택된 폴더 내부의 안전한 텍스트 파일 읽기 | medium | 필요 |
| `get_clipboard_text` | 클립보드 텍스트 읽기 및 민감정보 마스킹 | high | 필요 |
| `set_clipboard_text` | 클립보드 텍스트 변경 | high | 필요 |
| `capture_screen` | 화면 캡처 후 사용자 미리보기 제공 | high | 필요 |
| `open_app` | allowlisted 앱 실행 | medium | 필요 |

## 1차 버전 금지 작업

- 파일 삭제
- 파일 덮어쓰기
- 폴더 전체 이동
- shell command 자동 실행
- 이메일 자동 전송
- 결제 또는 구매
- 비밀번호나 토큰 읽기
- 브라우저 쿠키 접근
- 전체 디스크 스캔
- 사용자 확인 없는 스크린샷
- 사용자 확인 없는 클립보드 읽기

## 위험도 분류

- `low`: 상태 확인처럼 읽기 전용이고 민감정보 노출 가능성이 낮은 작업
- `medium`: 사용자가 선택한 폴더, 외부 URL, 앱 실행처럼 대상이 제한되어 있지만 사용자 환경에 영향을 줄 수 있는 작업
- `high`: 클립보드, 스크린샷처럼 민감정보가 포함될 가능성이 높은 작업
- `critical`: 현재 1차 버전에서 금지되는 작업 또는 allowlist 밖의 시스템 조작

## 사용자 확인이 필요한 작업

다음 작업은 항상 실행 전 확인 모달을 표시한다.

- 외부 URL 열기
- 폴더 선택, 폴더 목록 조회, 파일 검색, 텍스트 파일 읽기
- 클립보드 읽기/쓰기
- 스크린샷 캡처
- 앱 실행
- `medium`, `high`, `critical` risk action

스크린샷은 캡처 후 바로 AI 분석으로 넘기지 않는다. 먼저 사용자에게 미리보기를 보여주고, 사용자가 승인한 뒤에만 분석 단계로 넘기는 구조로 확장한다.

## 로컬 실행

```bash
npm install
npm run tauri:dev
```

Ollama를 사용하려면 별도 터미널에서 다음처럼 실행한다.

```bash
ollama serve
ollama pull llama3.2
```

앱 설정 또는 환경변수로 모델을 바꿀 수 있다.

```bash
OLLAMA_MODEL=llama3.2:latest
OLLAMA_BASE_URL=http://localhost:11434
```

## 향후 확장 계획

- wake word: 사용자가 부를 때만 음성 모드 활성화
- double clap detection: 박수 두 번으로 로컬 제어 모드 호출
- local file indexing: 사용자가 명시적으로 허용한 폴더만 색인화
- automation recipes: 반복 작업을 사용자가 승인한 recipe 단위로 저장
- per-action permission memory: 특정 action과 대상에 대한 세분화된 권한 관리
- local-only summarization: 민감 문서는 외부 API 없이 Ollama로만 요약
