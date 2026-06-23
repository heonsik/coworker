# MOA (Manufacturing Office by AI Portal) — 설치 & 실행 가이드

처음 git에서 클론한 사람이 환경을 세팅하고 앱을 실행하기까지의 전체 과정을 정리한 문서입니다.

---

## 1. 사전 준비 (Prerequisites)

| 도구        | 권장 버전        | 비고                                      |
| ----------- | ---------------- | ----------------------------------------- |
| **Git**     | 최신             | 저장소 클론                               |
| **Node.js** | **24.x 이상**    | `engines`가 `>=24.0.0` 요구. nvm/fnm 권장 |
| **pnpm**    | **10.33.0 이상** | 패키지 매니저 (npm/yarn 아님)             |

> ⚠️ Node 22 이하에서도 `pnpm dev`는 동작할 수 있지만, `Unsupported engine` 경고가 뜨고
> 일부 테스트(`better-sqlite3` 네이티브 ABI)가 깨집니다. **개발은 Node 24 이상을 쓰세요.**

### pnpm 설치 (둘 중 하나)

```bash
# 방법 A) corepack (Node에 내장)
corepack enable
corepack prepare pnpm@10.33.0 --activate

# 방법 B) npm 전역 설치
npm install -g pnpm@10.33.0
```

### 플랫폼별 추가 사항

- **Windows**: 별도 빌드 도구 없이 동작합니다(네이티브 모듈은 prebuilt 사용). 셸은 PowerShell 또는 Git Bash 모두 가능.
- **macOS / Linux**: 표준 빌드 도구(Xcode CLT / build-essential)가 있으면 충분합니다.

---

## 2. 클론 & 의존성 설치

```bash
git clone <REPO_URL> coworker
cd coworker

# 워크스페이스 전체 의존성 설치 (postinstall로 lockfile 해시 저장까지)
pnpm install
```

---

## 3. 빌드 (최초 1회 필수)

데스크톱 앱(`pnpm dev`)은 시작 전에 `agent-core` / `daemon` / MCP 도구의 **빌드 산출물(dist)**이
있는지 검사합니다. 클론 직후에는 dist가 없으므로 **반드시 한 번 전체 빌드**를 하세요.

```bash
pnpm build
```

- `pnpm build` = 전 워크스페이스 빌드 (web · desktop · daemon · agent-core · MCP 도구)
- 빌드가 끝나면 `predev` 단계에서 다음과 같이 확인됩니다:
  ```
  Native SQLite bindings match daemon Node (v24.15.0 ABI 137)
  ✓ @accomplish/daemon build output found
  ```

---

## 4. 실행

### 데스크톱 앱 실행 (권장)

```bash
pnpm dev
```

- Vite 개발 서버(`http://localhost:5173`)가 뜨고, 이어서 Electron 데스크톱 창이 열립니다.
- 창 제목은 **"MOA (Manufacturing Office by AI Portal)"** 로 표시됩니다.
- 종료는 창을 닫거나 터미널에서 `Ctrl+C`.

### 데이터 초기화 후 실행

```bash
pnpm dev:clean      # CLEAN_START=1 — 저장된 모든 데이터 삭제 후 시작
```

### 웹 UI만 실행 (디버깅용)

```bash
pnpm dev:web        # http://localhost:5173
```

> 웹 단독 모드는 Electron 프리로드(`window.accomplish`)가 없어 데몬·이메일 등
> 네이티브 기능은 동작하지 않습니다. UI 확인 용도로만 사용하세요.

---

## 5. 이메일(POP3) 기능 사용법

이 빌드에는 POP3 수신 동기화 + 받은편지함이 포함돼 있습니다.

1. 우하단 **설정(⚙️)** → **Email** 탭으로 이동
2. 계정 정보 입력 (표시 이름 / 사용자명 / POP3 호스트 / 포트 / 비밀번호 / TLS)
   - TLS 사용 시 기본 포트 **995**, 미사용 시 **110**
3. **연결 테스트** → 성공 확인 후 **저장**
4. 좌측 사이드바의 **메일 아이콘(✉️)** 클릭 → 받은편지함으로 이동
5. **Sync** 버튼으로 메일을 받아오고, 목록에서 메일을 선택해 본문/첨부 확인
   - 검색, 전체/안읽음/별표 필터, 별표·아카이브 동작 지원
   - HTML 본문은 스크립트·원격 리소스가 차단된 샌드박스로 안전하게 렌더링

---

## 6. 자주 쓰는 점검 명령

```bash
# 타입체크 · 린트 · 포맷 검사
pnpm typecheck
pnpm lint:eslint
pnpm format:check        # 자동 수정: pnpm format

# 워크스페이스별 테스트 (루트 통합 테스트 명령은 없음)
pnpm -F @accomplish/web test:unit
pnpm -F @accomplish/desktop test:unit
pnpm -F @accomplish_ai/agent-core test
pnpm -F @accomplish/daemon test
```

---

## 7. 문제 해결 (Troubleshooting)

| 증상                                                       | 원인 / 해결                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Unsupported engine ... wanted node >=24`                  | Node 22 이하 사용 중. Node 24+로 전환                                        |
| `better-sqlite3 ... NODE_MODULE_VERSION mismatch` (테스트) | 실행 Node ABI와 prebuilt 불일치. Node 24로 실행하거나 `pnpm install --force` |
| `daemon build output not found` / dist 관련 오류           | `pnpm build`를 먼저 실행                                                     |
| 포트 5173 사용 중                                          | `pnpm dev:kill` 로 정리 후 재실행                                            |
| Electron 창이 안 뜸                                        | 터미널 로그에서 `[dev]` / Vite / 데몬 오류 확인                              |

---

## 참고

- 아키텍처: [AGENTS.md](../AGENTS.md), [docs/architecture.md](architecture.md)
- 개발 규칙: [.claude/PROJECT_RULES.md](../.claude/PROJECT_RULES.md), [CLAUDE.md](../CLAUDE.md)
- 이메일 기능 상세: [docs/pop3-email-development-checklist.md](pop3-email-development-checklist.md)

> 참고: 내부 식별자(데이터 폴더명, OAuth `accomplish://` 스킴, 패키지명 등)는 호환성을 위해
> 그대로 두었고, **사용자에게 보이는 표시 이름만 "MOA"로 변경**되어 있습니다.
