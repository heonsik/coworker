/** @vitest-environment node */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Email repository', () => {
  let testDir: string;
  let dbPath: string;
  let databaseModule: typeof import('../../../src/storage/database.js') | null = null;
  let emailModule: typeof import('../../../src/storage/repositories/email.js') | null = null;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    if (process.env.SKIP_SQLITE_TESTS) {
      console.warn('Skipping email tests: better-sqlite3 native module not available');
      return;
    }
    try {
      const BetterSqlite3 = await import('better-sqlite3');
      const probe = new (
        BetterSqlite3 as unknown as { default: new (p: string) => { close(): void } }
      ).default(':memory:');
      probe.close();
      databaseModule = await import('../../../src/storage/database.js');
      emailModule = await import('../../../src/storage/repositories/email.js');
    } catch (_err) {
      console.warn('Skipping email tests: better-sqlite3 native module not available');
      console.warn('To fix: pnpm install --force');
    }
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  beforeEach(() => {
    if (!databaseModule || !emailModule) {
      return;
    }
    testDir = path.join(
      os.tmpdir(),
      `email-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    fs.mkdirSync(testDir, { recursive: true });
    dbPath = path.join(testDir, 'test.db');
    databaseModule.initializeDatabase({ databasePath: dbPath });
  });

  afterEach(() => {
    if (databaseModule) {
      databaseModule.resetDatabaseInstance();
    }
    if (testDir && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createAccount() {
    if (!emailModule) {
      throw new Error('email module not available');
    }
    return emailModule.createEmailAccount({
      displayName: 'Work',
      host: 'mail.example.com',
      port: 995,
      useTls: true,
      username: 'user@example.com',
      passwordSecretId: 'email-password:work',
    });
  }

  it('creates, lists, updates, and deletes accounts', () => {
    if (!emailModule) return;

    const account = createAccount();
    expect(account.enabled).toBe(true);
    expect(account.passwordSecretId).toBe('email-password:work');
    expect(emailModule.listEmailAccounts()).toHaveLength(1);

    const updated = emailModule.updateEmailAccount(account.id, {
      displayName: 'Company Mail',
      enabled: false,
    });
    expect(updated?.displayName).toBe('Company Mail');
    expect(updated?.enabled).toBe(false);

    emailModule.deleteEmailAccount(account.id);
    expect(emailModule.listEmailAccounts()).toHaveLength(0);
  });

  it('upserts messages by account and UIDL without overwriting user flags', () => {
    if (!emailModule) return;

    const account = createAccount();
    const first = emailModule.upsertEmailMessage({
      accountId: account.id,
      uidl: 'uidl_1',
      fromAddress: 'sender@example.com',
      to: [{ address: 'user@example.com', name: 'User' }],
      subject: 'First subject',
      textBody: 'Hello',
      receivedAt: '2026-01-01T00:00:00.000Z',
    });
    emailModule.markEmailMessageRead(first.id, true);
    emailModule.setEmailMessageStarred(first.id, true);

    const second = emailModule.upsertEmailMessage({
      accountId: account.id,
      uidl: 'uidl_1',
      fromAddress: 'sender@example.com',
      subject: 'Updated subject',
      textBody: 'Updated',
      receivedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(second.id).toBe(first.id);
    expect(second.subject).toBe('Updated subject');
    expect(second.receivedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(second.readState).toBe('read');
    expect(second.starred).toBe(true);
    expect(emailModule.listEmailMessages()).toHaveLength(1);
  });

  it('filters messages and stores attachments', () => {
    if (!emailModule) return;

    const account = createAccount();
    const message = emailModule.upsertEmailMessage({
      accountId: account.id,
      uidl: 'uidl_2',
      fromAddress: 'finance@example.com',
      fromName: 'Finance Team',
      subject: 'Invoice',
      textBody: 'Invoice details',
    });
    emailModule.createEmailAttachment({
      messageId: message.id,
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      detectedType: 'application/pdf',
      size: 1234,
      storagePath: 'attachments/invoice.pdf',
      downloaded: true,
    });

    const filtered = emailModule.listEmailMessages({
      accountId: account.id,
      query: 'Invoice',
      archived: false,
    });
    const attachments = emailModule.listEmailAttachments(message.id);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].fromAddress).toBe('finance@example.com');
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe('invoice.pdf');
    expect(attachments[0].downloaded).toBe(true);
  });

  it('searches sender names and excludes archived messages by default', () => {
    if (!emailModule) return;

    const account = createAccount();
    const visible = emailModule.upsertEmailMessage({
      accountId: account.id,
      uidl: 'uidl_visible',
      fromName: 'Payroll Desk',
      subject: 'Payslip',
      textBody: 'Monthly payroll statement',
    });
    const archived = emailModule.upsertEmailMessage({
      accountId: account.id,
      uidl: 'uidl_archived',
      fromName: 'Payroll Archive',
      subject: 'Old Payslip',
      textBody: 'Archived payroll statement',
      archived: true,
    });

    expect(
      emailModule.listEmailMessages({ query: 'Payroll' }).map((message) => message.id),
    ).toEqual([visible.id]);
    expect(emailModule.listEmailMessages({ archived: true }).map((message) => message.id)).toEqual([
      archived.id,
    ]);
  });

  it('upserts sync state', () => {
    if (!emailModule) return;

    const account = createAccount();
    emailModule.upsertEmailSyncState({
      accountId: account.id,
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      cursor: { lastUidl: 'uidl_1' },
    });
    const updated = emailModule.upsertEmailSyncState({
      accountId: account.id,
      lastSuccessAt: '2026-01-01T00:01:00.000Z',
      lastError: null,
    });

    expect(updated.lastSyncAt).toBe('2026-01-01T00:00:00.000Z');
    expect(updated.lastSuccessAt).toBe('2026-01-01T00:01:00.000Z');
    expect(updated.cursor).toEqual({ lastUidl: 'uidl_1' });
    expect(emailModule.getEmailSyncState(account.id)?.lastError).toBeUndefined();
  });
});
