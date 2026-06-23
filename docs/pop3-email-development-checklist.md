# POP3 Email Feature Development Checklist

## Goal

Add a POP3-based email management surface to Accomplish for company email accounts that only support POP3. The first version should support connecting an account, syncing messages into local storage, viewing/searching messages, and using AI actions such as summarization and reply drafting.

## 1. Product Scope

- [ ] Confirm MVP scope: POP3 receive-only email ingestion.
- [ ] Exclude server-side email deletion from the MVP.
- [ ] Treat read/unread state as local app state.
- [ ] Treat folders and labels as local app classification, not POP3 server sync.
- [ ] Decide whether MVP stores only attachment metadata or downloads attachment files.
- [ ] Confirm first AI actions: summarize, draft reply, extract tasks.
- [ ] Define privacy expectations for sending email content to LLM providers.
- [ ] Decide whether email body is stored inline in DB or as files (impacts query performance on large mailboxes).

## 2. UI Entry Structure

- [ ] Add a new entry button to the left sidebar.
- [ ] Split the app surface between normal chat and email management.
- [ ] Add route/view structure for chat and email, for example `chat` and `email`.
- [ ] Design the base email layout.
- [ ] Add an email disconnected/empty setup state.
- [ ] Add an email connected state.

## 3. Email Account Connection UI

- [x] Add POP3 host input.
- [x] Add port input.
- [x] Add TLS/SSL toggle.
- [x] Add username input.
- [x] Add password input.
- [x] Add connection test button.
- [x] Display connection success/failure state.
- [x] Add save account action.
- [x] Display saved account list.
- [x] Add account enabled/disabled toggle.
- [x] Add account delete action.
- [x] Never reveal saved passwords back into the UI.

## 4. Security And Secret Storage

- [x] Decide how POP3 passwords are encrypted and stored.
- [x] Reuse the existing secure storage pattern where possible.
- [x] Do not store password plaintext in `email_accounts`.
- [x] Never log POP3 passwords.
- [x] Mask credentials in connection failure logs.
- [ ] Exclude passwords from export/backup flows.
- [x] Limit log exposure of host and username to what is necessary for debugging.

## 5. Database Schema

- [x] Create a new migration.
- [x] Add `email_accounts` table.
- [x] Add `email_messages` table.
- [x] Add `email_attachments` table.
- [x] Add `email_sync_state` table.
- [x] Add unique index for account + UIDL deduplication.
- [x] Add indexes for `account_id`, `sent_at`, `from_address`, and `subject`.
- [x] Decide full-text search strategy: SQLite FTS table, separate search index, or external body-file indexing.
- [ ] Define behavior for disabled or deleted accounts.
- [x] Add migration tests.

Suggested schema:

```text
email_accounts
- id
- display_name
- host
- port
- use_tls
- username
- password_secret_id
- enabled
- created_at
- updated_at

email_messages
- id
- account_id
- uidl
- message_id
- from_address
- from_name
- to_json
- cc_json
- subject
- sent_at
- received_at
- text_body
- html_body
- raw_path
- read_state
- starred
- archived
- created_at

email_attachments
- id
- message_id
- filename
- content_type
- size
- storage_path
- downloaded
- created_at

email_sync_state
- account_id
- last_sync_at
- last_success_at
- last_error
- cursor_json  -- tracks last known UIDL count; UIDL dedup in email_messages is the source of truth
```

> **Note on body storage**: `text_body` and `html_body` stored inline in `email_messages` can degrade query performance on large mailboxes. Consider storing bodies as files under `raw_path` and omitting the inline columns, moving them to a separate `email_bodies` table, or maintaining a dedicated FTS/search index.

## 6. POP3 Sync Service

- [ ] Choose a POP3 client library. Evaluate `node-pop3` and `poplib` using TLS/STARTTLS support, active maintenance, and TypeScript type quality as criteria.
- [ ] Verify TLS and STARTTLS support.
- [x] Implement connection test.
- [x] Implement `USER`/`PASS` authentication.
- [x] Implement `UIDL` listing.
- [ ] Define fallback behavior for servers that do not support stable `UIDL` values.
- [ ] Skip UIDLs already stored locally.
- [ ] Download only new messages.
- [ ] Parse MIME messages.
- [ ] Handle `quoted-printable` and `base64` content transfer encoding.
- [ ] Handle non-UTF-8 charsets in headers and bodies (decode before storage).
- [ ] Extract `text/plain` body.
- [ ] Extract `text/html` body.
- [ ] Extract attachment metadata.
- [ ] Decide whether to store raw `.eml` files and implement if needed.
- [ ] Do not issue POP3 delete commands.
- [x] Add network timeout handling.
- [ ] Add per-account sync lock to prevent concurrent syncs.
- [ ] Add retry policy for transient failures.
- [ ] Add connection rate limiting to respect per-server concurrent connection limits.

## 7. Daemon And API

- [x] Add an email service in `apps/daemon`.
- [x] Add shared email types in `packages/agent-core`.
- [x] Add storage repositories for accounts, messages, attachments, and sync state.
- [x] Add daemon RPC methods.
- [x] Add desktop IPC/preload wrappers.
- [x] Add web `accomplish` client wrappers.

Suggested RPC methods:

- [x] `email.account.testConnection`
- [x] `email.account.create`
- [x] `email.account.update`
- [x] `email.account.delete`
- [x] `email.account.list`
- [ ] `email.sync.run`
- [ ] `email.sync.status`
- [x] `email.message.list`
- [x] `email.message.get`
- [x] `email.message.markRead`
- [x] `email.message.archive`
- [x] `email.message.star`
- [ ] `email.message.search`

## 7a. MCP Tools For Agent Access

Coworker agents interact with features through MCP tools. Without these, the AI agent cannot read or search email autonomously. AI Actions in section 11 will be limited to manual UI buttons only.

- [ ] Add `email_list` MCP tool (list messages with filters: account, unread, starred, date range).
- [ ] Add `email_read` MCP tool (get full message content by id).
- [ ] Add `email_search` MCP tool (search by subject, body, sender).
- [ ] Add `email_mark_read` MCP tool.
- [ ] Add `email_sync` MCP tool (trigger manual sync for an account).
- [ ] Register all email MCP tools in the daemon MCP server.
- [ ] Add tool descriptions and parameter schemas so the agent can discover and invoke them correctly.

> **MCP scope note**: Avoid adding LLM-wrapper MCP tools such as `email_summarize` or `email_draft_reply` in the first pass. The agent can call `email_read` or `email_search`, then summarize or draft directly in its normal response. UI buttons can still implement summary and reply-draft actions separately.

## 8. Sync Scheduling

- [ ] Add manual sync button.
- [ ] Add automatic sync interval, configurable through a Settings > Email entry.
- [ ] Schedule sync for enabled accounts on app startup.
- [ ] Persist sync status per account.
- [ ] Display sync in progress state.
- [ ] Display last sync time.
- [ ] Display last sync error.
- [ ] Distinguish offline, timeout, and authentication failure states.

## 9. Email List UI

- [ ] Build message list component.
- [ ] Display sender.
- [ ] Display subject.
- [ ] Display preview text.
- [ ] Display sent/received date.
- [ ] Style read and unread messages.
- [ ] Add starred indicator.
- [ ] Add search input.
- [ ] Add account filter.
- [ ] Add unread filter.
- [ ] Add starred filter.
- [ ] Add pagination or virtualized list.
- [ ] Add empty state.
- [ ] Add loading state.
- [ ] Add error state.

## 10. Email Detail UI

- [ ] Display subject.
- [ ] Display sender, recipients, and date.
- [ ] Render text body.
- [ ] Sanitize and render HTML body.
- [ ] Display attachment list.
- [ ] Mark message as read when opened.
- [ ] Add starred toggle.
- [ ] Add archive action.
- [ ] Add raw source view option.
- [ ] Open links in the external browser (never open inline).
- [ ] Show full URL on hover before opening (guard against misleading link text / phishing).

## 11. AI Actions

- [ ] Add summarize email action.
- [ ] Add draft reply action.
- [ ] Add extract tasks action.
- [ ] Strip or sanitize HTML before sending content to the model (remove `<script>`, `<style>`, inline base64 images, and event attributes).
- [ ] Add truncation policy for long emails.
- [ ] Avoid sending attachments to the model unless the user explicitly requests it.
- [ ] Ensure quoted-printable / base64 encoded body is fully decoded before sending to LLM.
- [ ] Decide where reply drafts are stored.
- [ ] Keep actual sending out of MVP unless SMTP support is added.

## 12. Search And Classification

- [x] Implement DB-backed search.
- [x] Search by subject.
- [x] Search by body.
- [x] Search by sender.
- [ ] Filter by date range.
- [x] Use the body storage decision from section 5 to determine whether body search reads DB columns, an FTS table, or files.
- [ ] Design local labels.
- [ ] Assign labels to messages.
- [ ] Defer rule-based auto-classification to a later phase.

## 12a. Attachments And File Safety

- [ ] Sanitize attachment filenames before storing them on disk.
- [ ] Validate and store declared MIME type and detected file type separately.
- [ ] Warn before opening executable or script-like attachments.
- [ ] Avoid auto-opening downloaded attachments.
- [ ] Store attachments under an app-controlled directory, not user-selected arbitrary paths.
- [ ] Prevent path traversal in attachment filenames.
- [ ] Add attachment size limits.
- [ ] Defer attachment content analysis until the user explicitly requests it.

## 13. Tests

- [x] POP3 connection test unit coverage.
- [x] UIDL deduplication tests.
- [ ] UIDL fallback behavior tests.
- [ ] MIME parsing tests.
- [x] Attachment metadata tests.
- [ ] Attachment filename sanitization tests.
- [x] DB repository tests.
- [ ] Daemon RPC tests.
- [ ] Web email UI tests.
- [x] Authentication failure tests.
- [x] Network timeout tests.
- [ ] Large mailbox/list performance tests.

## 14. Verification Scenarios

- [x] Invalid password shows a clear error.
- [x] Valid account connects successfully.
- [ ] First sync stores messages.
- [ ] Second sync does not duplicate messages.
- [ ] New messages are added on later sync.
- [ ] Account and messages survive app restart.
- [ ] Email detail view opens correctly.
- [ ] Search returns expected messages.
- [ ] AI summary works.
- [x] Logs do not expose passwords.

## 15. Follow-up Features

- [ ] SMTP sending support.
- [ ] Reply and forward support.
- [ ] Attachment download.
- [ ] Rule-based automatic classification.
- [ ] Create tasks from email.
- [ ] Thread grouping.
- [ ] Multiple account management.
- [ ] Optional IMAP support if a future account supports it.
- [ ] WhatsApp notification on new email arrival (leverage existing Baileys integration).
- [ ] Trigger agent tasks from email (e.g., auto-summarize on receipt, route to workspace).

## Code Review Findings (2026-06-23)

스토리지 레이어(마이그레이션 → 레포지토리 → 데몬 서비스 → RPC → IPC → 프리로드) 1차 리뷰 결과.

### 🚨 버그 수정 필수

- [ ] **`createAccount` 원자성 문제** (`apps/daemon/src/email-service.ts`)
  - 계정 생성 → 비밀번호 저장 → 계정 업데이트 3단계 중 2단계에서 실패 시 `passwordSecretId: 'pending'`인 고립 계정이 DB에 남음
  - 수정: 계정 생성 전에 secretId를 미리 생성하고 비밀번호를 먼저 저장, 그 후 계정을 한 번에 생성

- [ ] **`upsertEmailMessage` ON CONFLICT에서 `received_at` 덮어씀** (`packages/agent-core/src/storage/repositories/email.ts`)
  - `read_state`, `starred`, `archived`는 보존하면서 `received_at`은 재동기화 시 덮어쓰는 일관성 오류
  - 메일 목록 정렬 순서가 재동기화 때마다 변경될 수 있음
  - 수정: ON CONFLICT DO UPDATE 절에서 `received_at = excluded.received_at` 제거

- [ ] **`text_body LIKE '%query%'` 풀 스캔 성능 문제** (`packages/agent-core/src/storage/repositories/email.ts`)
  - 앞에 `%`가 붙은 LIKE는 인덱스를 사용하지 못해 메일 수천 건부터 검색이 느려짐
  - 수정: SQLite FTS5 가상 테이블 추가 (별도 마이그레이션)
  ```sql
  CREATE VIRTUAL TABLE email_messages_fts USING fts5(
    subject, from_address, from_name, text_body,
    content='email_messages', content_rowid='rowid'
  );
  ```

### ⚠️ 개선 권장

- [ ] **마이그레이션 WHY 주석 없음** (`packages/agent-core/src/storage/migrations/v032-pop3-email.ts`)
  - CLAUDE.md 규칙: `up()` 안에 스키마 변경 이유 주석 필수

- [ ] **`read_state` DB 레벨 CHECK 제약 없음** (migration v032)
  - TypeScript 타입은 `'unread' | 'read'`로 제한하지만 DB 자체 제약이 없음
  - 수정: `CHECK(read_state IN ('unread', 'read'))` 추가 (신규 마이그레이션으로)

- [ ] **검색 시 `from_name` 누락** (`packages/agent-core/src/storage/repositories/email.ts`)
  - `listEmailMessages` 쿼리에서 `from_address`는 검색하면서 발신자 표시 이름(`from_name`)은 제외
  - 이름으로 검색 시 결과 없음

- [ ] **`listMessages()` 기본 동작이 아카이브 메일 포함**
  - 필터 없이 호출 시 `archived = 1`인 메일까지 반환됨
  - 일반 받은편지함 동작과 다름 — `archived: false` 기본값 적용 검토

### 미구현 (다음 개발 단계)

- [ ] POP3 실제 연결 및 동기화 서비스 (섹션 6)
- [x] 계정 연결 테스트 (`email.account.testConnection` RPC)
- [ ] 자동 sync 스케줄링 (섹션 8)
- [ ] 웹 UI — 메일 목록 / 상세 (섹션 9, 10)
- [ ] 에이전트용 MCP 툴 (섹션 7a)

---

## Code Review Findings — 2차 (2026-06-23)

POP3 클라이언트, FTS 마이그레이션, 계정 관리 UI 추가 후 2차 리뷰 결과.

### ✅ 1차 지적사항 전부 수정 확인

- [x] `createAccount` 원자성 — 비밀번호 먼저 저장 + try/catch 롤백으로 수정
- [x] `received_at` ON CONFLICT 덮어쓰기 — UPDATE 목록에서 제거
- [x] LIKE 풀 스캔 — v033 마이그레이션으로 FTS5 + 트리거 구현
- [x] 마이그레이션 WHY 주석 — v033에 상세 주석 추가
- [x] `read_state` CHECK 제약 — v033 BEFORE 트리거로 구현
- [x] `from_name` 검색 누락 — FTS 컬럼에 포함
- [x] 아카이브 메일 기본 포함 — `archived = 0` 기본값 적용

### 🚨 버그 수정 필수 (→ 직접 수정 완료)

- [x] **FTS 쿼리 특수문자 미처리** (`packages/agent-core/src/storage/repositories/email.ts`)
  - `*`, `^` 등 FTS5 예약 문자가 포함된 검색어 입력 시 쿼리 파싱 에러 발생
  - 수정: `buildEmailFtsQuery`에서 `*`, `^` 제거 후 구문 quote 처리

- [x] **`testConnection`에서 비밀번호 공백 제거** (`apps/web/src/client/components/settings/email/EmailSettingsPanel.tsx`)
  - `form.password.trim() || undefined`가 비밀번호 앞뒤 공백을 삭제
  - 수정: `.trim()` 제거 → `form.password || undefined`

- [x] **`handleToggleEnabled` 에러 메시지 타이밍 오류** (`EmailSettingsPanel.tsx`)
  - `setError()` 후 `loadAccounts()`가 `setError(null)` 호출해 에러가 즉시 사라짐
  - 수정: `loadAccounts()` 완료 후 `setError()` 호출하도록 순서 변경

- [x] **`handleDelete` 확인 없이 즉시 삭제** (`EmailSettingsPanel.tsx`)
  - Trash 버튼 한 번에 모든 메시지 CASCADE 삭제됨 (복구 불가)
  - 수정: `deleteTarget` state + `Dialog` 컴포넌트로 확인 다이얼로그 추가
  - i18n 키 `email.deleteDialog.title/description` 4개 언어(en/zh-CN/fr/ru) 추가

### ⚠️ 개선 권장 (다음 작업 시 반영)

- [ ] **`readMultiline` 라인별 타임아웃** (`apps/daemon/src/pop3-client.ts`)
  - 타임아웃이 라인당 재설정돼 대용량 UIDL 응답 시 전체 소요 시간이 `N × timeoutMs`까지 허용
  - 수정: 연결 시작 시점 기준 절대 타임아웃 추가

---

## Sync Service + Inbox UI Implementation (2026-06-24)

POP3 수신 동기화와 받은편지함 UI를 구현해 "계정만 등록되던" 상태에서 "실제 메일을 받아 읽는" 단계로 전환.

### 추가/변경된 것

- **POP3 fetch 레이어** (`apps/daemon/src/pop3/`)
  - `connection.ts` — 저수준 소켓/라인/멀티라인 리더 (기존 `pop3-client.ts`에서 추출, dot-unstuffing + 절대 타임아웃)
  - `session.ts` — 인증 후 `LIST`/`UIDL`/`RETR`로 메시지 열거·다운로드. DELE 미사용(수신 전용)
- **MIME 파서** (`apps/daemon/src/mime/`)
  - `decode.ts` — quoted-printable / base64 / charset(euc-kr 별칭 포함) / RFC 2047 헤더 디코딩
  - `headers.ts` — 헤더 언폴딩, 주소 리스트, Content-Type/Disposition 파싱
  - `parse.ts` — multipart 트리 워크 → text/html 본문 + 첨부 메타데이터 추출
- **동기화 서비스** (`apps/daemon/src/email-sync-service.ts`)
  - UIDL 중복 제거(이미 저장된 건 스킵), 회당 최대 50건, 계정별 동시성 락, sync state 갱신(성공/실패/커서)
- **RPC/IPC/preload/web 체인**: `email.sync.run` 추가 (daemon-routes → email-handlers → preload → accomplish.ts `EmailAPI.runSync`), `DaemonMethodMap`·`EmailSyncRunResult` 타입 포함
- **받은편지함 UI** (`apps/web/src/client/pages/email/` + `pages/Email.tsx`)
  - `/email` 라우트 + 사이드바 진입 버튼
  - 2-pane(목록/상세): 계정 필터, 검색(FTS), all/unread/starred 필터, 수동 Sync 버튼
  - 상세: 헤더/수신자/날짜, **샌드박스 iframe + 엄격 CSP로 HTML 본문 안전 렌더**(스크립트·원격 리소스 차단), 첨부 목록, 별표/아카이브, 열람 시 읽음 처리
  - i18n 키 `email.inbox.*` 4개 언어(en/zh-CN/fr/ru) 추가

### 검증

- typecheck(4개 워크스페이스) / eslint(0 errors) / prettier / `build:web` / daemon·agent-core 빌드 통과
- 신규 daemon 테스트 통과: MIME 파싱 6건(plain·QP·RFC2047 한글 subject·multipart+첨부 등) + POP3 5건
- 비고: 환경상 `better-sqlite3` NODE_MODULE_VERSION 불일치(node v22 vs v24)와 일부 Windows 경로/asset 로딩으로 인한 기존 테스트 실패는 본 작업과 무관

### 남은 항목(다음 단계)

- 자동 sync 스케줄링(앱 시작 시/주기), sync 진행·마지막 동기화 시각 UI 표시
- 에이전트용 이메일 MCP 툴(`email_list`/`email_read`/`email_search`/`email_sync`)
- 첨부 실제 다운로드 + 파일 안전성(파일명 살균/경로 traversal 방지/크기 제한)
- AI 액션(요약/회신 초안/태스크 추출), SMTP 발신

## Recommended Implementation Order

### Review Implementation Status (2026-06-23)

- [x] Fix `createAccount` atomicity by storing the final password secret before creating the DB row.
- [x] Preserve `received_at` during `upsertEmailMessage` conflict updates.
- [x] Replace message body `LIKE '%query%'` search with SQLite FTS5.
- [x] Add a migration WHY comment for POP3 email schema creation.
- [x] Add DB-level `read_state` validation.
- [x] Include `from_name` in email search.
- [x] Exclude archived messages from `listMessages()` by default.
- [x] Add `email.account.testConnection` RPC, IPC/preload, web API, and settings UI wiring.
- [x] Add POP3 connection tests for success, authentication failure, UIDL unsupported, and timeout cases.
- [ ] Full POP3 sync, MIME parsing, MCP tools, and email list/detail UI remain open.

1. DB migration and repositories.
2. POP3 connection test and sync service.
3. Daemon RPC surface.
4. Email MCP tools from section 7a. This enables agent access in parallel with UI work.
5. Account connection UI.
6. Email list and detail UI.
7. Manual sync.
8. Automatic sync.
9. AI summary and reply draft actions.

## MVP Cut

Keep the first version focused:

- POP3 account connection.
- Manual sync.
- Local message storage.
- Message list.
- Message detail.
- AI summary.

Defer SMTP sending, attachment downloads, advanced classification, and automation rules until the receive-only flow is stable.
