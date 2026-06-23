import type { EmailAccount, EmailSyncRunResult, StorageAPI } from '@accomplish_ai/agent-core';
import { Pop3Session } from './pop3/session.js';
import { sanitizePop3Error } from './pop3/connection.js';
import { parseEmail } from './mime/parse.js';

/** Cap messages fetched per sync so a large mailbox cannot stall the first run. */
const MAX_MESSAGES_PER_SYNC = 50;

const emailPasswordKey = (accountId: string): string => `email:pop3-password:${accountId}`;

/**
 * Drives POP3 receive-only synchronization: enumerate the mailbox, download only
 * UIDLs not already stored, parse MIME into local records, and persist sync
 * state. Receive-only by design — no DELE is ever issued.
 */
export class EmailSyncService {
  private readonly inProgress = new Set<string>();

  constructor(private readonly storage: StorageAPI) {}

  async syncAccount(accountId: string): Promise<EmailSyncRunResult> {
    const account = this.storage.getEmailAccount(accountId);
    if (!account) {
      return { ok: false, newCount: 0, totalOnServer: 0, error: 'Account not found.' };
    }
    if (this.inProgress.has(accountId)) {
      return { ok: false, newCount: 0, totalOnServer: 0, error: 'A sync is already running.' };
    }

    this.inProgress.add(accountId);
    try {
      return await this.runSync(account);
    } finally {
      this.inProgress.delete(accountId);
    }
  }

  async syncAllEnabled(): Promise<void> {
    for (const account of this.storage.listEmailAccounts()) {
      if (account.enabled) {
        await this.syncAccount(account.id).catch(() => undefined);
      }
    }
  }

  private async runSync(account: EmailAccount): Promise<EmailSyncRunResult> {
    const password = this.storage.get(emailPasswordKey(account.id));
    if (!password) {
      const error = 'POP3 password is missing for this account.';
      this.recordFailure(account.id, error);
      return { ok: false, newCount: 0, totalOnServer: 0, error };
    }

    const startedAt = new Date().toISOString();
    let session: Pop3Session | null = null;
    try {
      session = await Pop3Session.connect({
        host: account.host,
        port: account.port,
        useTls: account.useTls,
        username: account.username,
        password,
      });

      const refs = await session.list();
      const fresh = refs
        .filter((ref) => !this.storage.getEmailMessageByUidl(account.id, ref.uidl))
        .sort((a, b) => b.msgNumber - a.msgNumber)
        .slice(0, MAX_MESSAGES_PER_SYNC);

      let newCount = 0;
      for (const ref of fresh) {
        const raw = await session.retrieve(ref.msgNumber);
        this.storeMessage(account.id, ref.uidl, raw);
        newCount += 1;
      }

      await session.quit();
      this.storage.upsertEmailSyncState({
        accountId: account.id,
        lastSyncAt: startedAt,
        lastSuccessAt: new Date().toISOString(),
        lastError: null,
        cursor: { uidlCount: refs.length },
      });
      return { ok: true, newCount, totalOnServer: refs.length };
    } catch (err) {
      session?.close();
      const error = sanitizePop3Error(err);
      this.recordFailure(account.id, error, startedAt);
      return { ok: false, newCount: 0, totalOnServer: 0, error };
    }
  }

  private storeMessage(accountId: string, uidl: string, raw: string): void {
    const parsed = parseEmail(raw);
    const message = this.storage.upsertEmailMessage({
      accountId,
      uidl,
      messageId: parsed.messageId,
      fromAddress: parsed.fromAddress,
      fromName: parsed.fromName,
      to: parsed.to,
      cc: parsed.cc,
      subject: parsed.subject,
      sentAt: parsed.sentAt,
      textBody: parsed.textBody,
      htmlBody: parsed.htmlBody,
    });
    for (const attachment of parsed.attachments) {
      this.storage.createEmailAttachment({
        messageId: message.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size: attachment.size,
        downloaded: false,
      });
    }
  }

  private recordFailure(accountId: string, error: string, startedAt?: string): void {
    this.storage.upsertEmailSyncState({
      accountId,
      lastSyncAt: startedAt ?? new Date().toISOString(),
      lastError: error,
    });
  }
}
