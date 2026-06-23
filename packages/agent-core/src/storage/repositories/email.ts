import { randomUUID } from 'node:crypto';
import type {
  EmailAccount,
  EmailAccountCreateInput,
  EmailAccountUpdateInput,
  EmailAddress,
  EmailAttachment,
  EmailAttachmentCreateInput,
  EmailMessage,
  EmailMessageCreateInput,
  EmailMessageListFilters,
  EmailSyncState,
  EmailSyncStateUpdateInput,
} from '../../common/types/email.js';
import { safeParseJsonWithFallback } from '../../utils/json.js';
import { getDatabase } from '../database.js';

interface EmailAccountRow {
  id: string;
  display_name: string;
  host: string;
  port: number;
  use_tls: number;
  username: string;
  password_secret_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface EmailMessageRow {
  id: string;
  account_id: string;
  uidl: string;
  message_id: string | null;
  from_address: string | null;
  from_name: string | null;
  to_json: string;
  cc_json: string;
  subject: string;
  sent_at: string | null;
  received_at: string;
  text_body: string | null;
  html_body: string | null;
  raw_path: string | null;
  read_state: 'unread' | 'read';
  starred: number;
  archived: number;
  created_at: string;
}

interface EmailAttachmentRow {
  id: string;
  message_id: string;
  filename: string;
  content_type: string | null;
  detected_type: string | null;
  size: number;
  storage_path: string | null;
  downloaded: number;
  created_at: string;
}

interface EmailSyncStateRow {
  account_id: string;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  cursor_json: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToAccount(row: EmailAccountRow): EmailAccount {
  return {
    id: row.id,
    displayName: row.display_name,
    host: row.host,
    port: row.port,
    useTls: row.use_tls === 1,
    username: row.username,
    passwordSecretId: row.password_secret_id,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseAddresses(value: string): EmailAddress[] {
  return safeParseJsonWithFallback<EmailAddress[]>(value, []) ?? [];
}

function rowToMessage(row: EmailMessageRow): EmailMessage {
  return {
    id: row.id,
    accountId: row.account_id,
    uidl: row.uidl,
    messageId: row.message_id ?? undefined,
    fromAddress: row.from_address ?? undefined,
    fromName: row.from_name ?? undefined,
    to: parseAddresses(row.to_json),
    cc: parseAddresses(row.cc_json),
    subject: row.subject,
    sentAt: row.sent_at ?? undefined,
    receivedAt: row.received_at,
    textBody: row.text_body ?? undefined,
    htmlBody: row.html_body ?? undefined,
    rawPath: row.raw_path ?? undefined,
    readState: row.read_state,
    starred: row.starred === 1,
    archived: row.archived === 1,
    createdAt: row.created_at,
  };
}

function rowToAttachment(row: EmailAttachmentRow): EmailAttachment {
  return {
    id: row.id,
    messageId: row.message_id,
    filename: row.filename,
    contentType: row.content_type ?? undefined,
    detectedType: row.detected_type ?? undefined,
    size: row.size,
    storagePath: row.storage_path ?? undefined,
    downloaded: row.downloaded === 1,
    createdAt: row.created_at,
  };
}

function rowToSyncState(row: EmailSyncStateRow): EmailSyncState {
  return {
    accountId: row.account_id,
    lastSyncAt: row.last_sync_at ?? undefined,
    lastSuccessAt: row.last_success_at ?? undefined,
    lastError: row.last_error ?? undefined,
    cursor: safeParseJsonWithFallback<Record<string, unknown>>(row.cursor_json, {}) ?? {},
  };
}

function buildEmailFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => {
      // Strip FTS5 reserved operators/characters before wrapping in a phrase
      // quote so user input cannot inject query syntax. Double-quote any
      // remaining literal quotes per the SQLite FTS5 phrase quoting rules.
      const sanitized = term.replace(/[*^]/g, '').replace(/"/g, '""');
      return sanitized ? `"${sanitized}"` : null;
    })
    .filter((term): term is string => term !== null)
    .join(' ');
}

export function createEmailAccount(input: EmailAccountCreateInput): EmailAccount {
  const db = getDatabase();
  const id = input.id ?? `email_account_${randomUUID()}`;
  const now = nowIso();

  db.prepare(
    `INSERT INTO email_accounts
      (id, display_name, host, port, use_tls, username, password_secret_id, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.displayName,
    input.host,
    input.port,
    input.useTls ? 1 : 0,
    input.username,
    input.passwordSecretId,
    input.enabled === false ? 0 : 1,
    now,
    now,
  );

  return {
    id,
    displayName: input.displayName,
    host: input.host,
    port: input.port,
    useTls: input.useTls,
    username: input.username,
    passwordSecretId: input.passwordSecretId,
    enabled: input.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
}

export function listEmailAccounts(): EmailAccount[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM email_accounts ORDER BY created_at ASC')
    .all() as EmailAccountRow[];
  return rows.map(rowToAccount);
}

export function getEmailAccount(id: string): EmailAccount | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM email_accounts WHERE id = ?').get(id) as
    | EmailAccountRow
    | undefined;
  return row ? rowToAccount(row) : null;
}

export function updateEmailAccount(
  id: string,
  input: EmailAccountUpdateInput,
): EmailAccount | null {
  const existing = getEmailAccount(id);
  if (!existing) {
    return null;
  }

  const db = getDatabase();
  const updated = {
    displayName: input.displayName ?? existing.displayName,
    host: input.host ?? existing.host,
    port: input.port ?? existing.port,
    useTls: input.useTls ?? existing.useTls,
    username: input.username ?? existing.username,
    passwordSecretId: input.passwordSecretId ?? existing.passwordSecretId,
    enabled: input.enabled ?? existing.enabled,
    updatedAt: nowIso(),
  };

  db.prepare(
    `UPDATE email_accounts
     SET display_name = ?, host = ?, port = ?, use_tls = ?, username = ?,
       password_secret_id = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    updated.displayName,
    updated.host,
    updated.port,
    updated.useTls ? 1 : 0,
    updated.username,
    updated.passwordSecretId,
    updated.enabled ? 1 : 0,
    updated.updatedAt,
    id,
  );

  return { ...existing, ...updated };
}

export function deleteEmailAccount(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM email_accounts WHERE id = ?').run(id);
}

export function upsertEmailMessage(input: EmailMessageCreateInput): EmailMessage {
  const db = getDatabase();
  const id = input.id ?? `email_message_${randomUUID()}`;
  const receivedAt = input.receivedAt ?? nowIso();
  const createdAt = nowIso();
  const subject = input.subject ?? '';
  const readState = input.readState ?? 'unread';
  const toJson = JSON.stringify(input.to ?? []);
  const ccJson = JSON.stringify(input.cc ?? []);

  db.prepare(
    `INSERT INTO email_messages
      (id, account_id, uidl, message_id, from_address, from_name, to_json, cc_json,
       subject, sent_at, received_at, text_body, html_body, raw_path, read_state,
       starred, archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, uidl) DO UPDATE SET
       message_id = excluded.message_id,
       from_address = excluded.from_address,
       from_name = excluded.from_name,
       to_json = excluded.to_json,
       cc_json = excluded.cc_json,
       subject = excluded.subject,
       sent_at = excluded.sent_at,
       text_body = excluded.text_body,
       html_body = excluded.html_body,
       raw_path = excluded.raw_path`,
  ).run(
    id,
    input.accountId,
    input.uidl,
    input.messageId ?? null,
    input.fromAddress ?? null,
    input.fromName ?? null,
    toJson,
    ccJson,
    subject,
    input.sentAt ?? null,
    receivedAt,
    input.textBody ?? null,
    input.htmlBody ?? null,
    input.rawPath ?? null,
    readState,
    input.starred ? 1 : 0,
    input.archived ? 1 : 0,
    createdAt,
  );

  const stored = getEmailMessageByUidl(input.accountId, input.uidl);
  if (!stored) {
    throw new Error('Failed to persist email message');
  }
  return stored;
}

export function listEmailMessages(filters: EmailMessageListFilters = {}): EmailMessage[] {
  const db = getDatabase();
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.accountId) {
    clauses.push('account_id = ?');
    params.push(filters.accountId);
  }
  if (filters.unreadOnly) {
    clauses.push("read_state = 'unread'");
  }
  if (filters.starredOnly) {
    clauses.push('starred = 1');
  }
  clauses.push('archived = ?');
  params.push(filters.archived === true ? 1 : 0);
  if (filters.query?.trim()) {
    clauses.push(
      'rowid IN (SELECT rowid FROM email_messages_fts WHERE email_messages_fts MATCH ?)',
    );
    params.push(buildEmailFtsQuery(filters.query));
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  const rows = db
    .prepare(
      `SELECT * FROM email_messages
       ${where}
       ORDER BY COALESCE(sent_at, received_at) DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as EmailMessageRow[];

  return rows.map(rowToMessage);
}

export function getEmailMessage(id: string): EmailMessage | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM email_messages WHERE id = ?').get(id) as
    | EmailMessageRow
    | undefined;
  return row ? rowToMessage(row) : null;
}

export function getEmailMessageByUidl(accountId: string, uidl: string): EmailMessage | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM email_messages WHERE account_id = ? AND uidl = ?')
    .get(accountId, uidl) as EmailMessageRow | undefined;
  return row ? rowToMessage(row) : null;
}

export function markEmailMessageRead(id: string, read: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE email_messages SET read_state = ? WHERE id = ?').run(
    read ? 'read' : 'unread',
    id,
  );
}

export function setEmailMessageStarred(id: string, starred: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE email_messages SET starred = ? WHERE id = ?').run(starred ? 1 : 0, id);
}

export function setEmailMessageArchived(id: string, archived: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE email_messages SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
}

export function createEmailAttachment(input: EmailAttachmentCreateInput): EmailAttachment {
  const db = getDatabase();
  const id = input.id ?? `email_attachment_${randomUUID()}`;
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO email_attachments
      (id, message_id, filename, content_type, detected_type, size, storage_path, downloaded, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.messageId,
    input.filename,
    input.contentType ?? null,
    input.detectedType ?? null,
    input.size ?? 0,
    input.storagePath ?? null,
    input.downloaded ? 1 : 0,
    createdAt,
  );

  return {
    id,
    messageId: input.messageId,
    filename: input.filename,
    contentType: input.contentType,
    detectedType: input.detectedType,
    size: input.size ?? 0,
    storagePath: input.storagePath,
    downloaded: input.downloaded === true,
    createdAt,
  };
}

export function listEmailAttachments(messageId: string): EmailAttachment[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM email_attachments WHERE message_id = ? ORDER BY created_at ASC')
    .all(messageId) as EmailAttachmentRow[];
  return rows.map(rowToAttachment);
}

export function getEmailSyncState(accountId: string): EmailSyncState | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM email_sync_state WHERE account_id = ?').get(accountId) as
    | EmailSyncStateRow
    | undefined;
  return row ? rowToSyncState(row) : null;
}

export function upsertEmailSyncState(input: EmailSyncStateUpdateInput): EmailSyncState {
  const db = getDatabase();
  const existing = getEmailSyncState(input.accountId);
  const next: EmailSyncState = {
    accountId: input.accountId,
    lastSyncAt: input.lastSyncAt ?? existing?.lastSyncAt,
    lastSuccessAt: input.lastSuccessAt ?? existing?.lastSuccessAt,
    lastError: input.lastError === null ? undefined : (input.lastError ?? existing?.lastError),
    cursor: input.cursor ?? existing?.cursor ?? {},
  };

  db.prepare(
    `INSERT INTO email_sync_state
      (account_id, last_sync_at, last_success_at, last_error, cursor_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       last_sync_at = excluded.last_sync_at,
       last_success_at = excluded.last_success_at,
       last_error = excluded.last_error,
       cursor_json = excluded.cursor_json`,
  ).run(
    next.accountId,
    next.lastSyncAt ?? null,
    next.lastSuccessAt ?? null,
    next.lastError ?? null,
    JSON.stringify(next.cursor),
  );

  return next;
}
