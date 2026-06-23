import { randomUUID } from 'node:crypto';
import type {
  EmailAccount,
  EmailAccountSettingsUpdateInput,
  EmailAccountWithPasswordInput,
  EmailAttachment,
  EmailConnectionTestInput,
  EmailConnectionTestResult,
  EmailMessage,
  EmailMessageListFilters,
  EmailSyncRunResult,
  EmailSyncState,
  StorageAPI,
} from '@accomplish_ai/agent-core';
import { testPop3Connection } from './pop3-client.js';
import { EmailSyncService } from './email-sync-service.js';

const emailPasswordKey = (accountId: string): string => `email:pop3-password:${accountId}`;
const createEmailAccountId = (): string => `email_account_${randomUUID()}`;

export class EmailService {
  private readonly syncService: EmailSyncService;

  constructor(private readonly storage: StorageAPI) {
    this.syncService = new EmailSyncService(storage);
  }

  listAccounts(): EmailAccount[] {
    return this.storage.listEmailAccounts();
  }

  getAccount(accountId: string): EmailAccount | null {
    return this.storage.getEmailAccount(accountId);
  }

  createAccount(input: EmailAccountWithPasswordInput): EmailAccount {
    const accountId = createEmailAccountId();
    const passwordSecretId = emailPasswordKey(accountId);
    this.storage.set(passwordSecretId, input.password);

    try {
      return this.storage.createEmailAccount({
        id: accountId,
        displayName: input.displayName,
        host: input.host,
        port: input.port,
        useTls: input.useTls,
        username: input.username,
        passwordSecretId,
        enabled: input.enabled,
      });
    } catch (err) {
      this.storage.delete(passwordSecretId);
      throw err;
    }
  }

  updateAccount(accountId: string, input: EmailAccountSettingsUpdateInput): EmailAccount | null {
    const existing = this.storage.getEmailAccount(accountId);
    if (!existing) {
      return null;
    }

    const { password, ...accountInput } = input;
    let passwordSecretId = existing.passwordSecretId;
    if (password !== undefined) {
      passwordSecretId = emailPasswordKey(accountId);
      this.storage.set(passwordSecretId, password);
    }

    return this.storage.updateEmailAccount(accountId, {
      ...accountInput,
      passwordSecretId,
    });
  }

  deleteAccount(accountId: string): void {
    const existing = this.storage.getEmailAccount(accountId);
    if (existing) {
      this.storage.delete(existing.passwordSecretId);
    }
    this.storage.deleteEmailAccount(accountId);
  }

  async testConnection(input: EmailConnectionTestInput): Promise<EmailConnectionTestResult> {
    const password =
      input.password ??
      (input.accountId ? this.storage.get(emailPasswordKey(input.accountId)) : null);

    if (!password) {
      return {
        ok: false,
        uidlSupported: false,
        error: 'POP3 password is required to test this account.',
      };
    }

    return await testPop3Connection({
      ...input,
      password,
    });
  }

  listMessages(filters?: EmailMessageListFilters): EmailMessage[] {
    return this.storage.listEmailMessages(filters);
  }

  getMessage(messageId: string): EmailMessage | null {
    return this.storage.getEmailMessage(messageId);
  }

  markMessageRead(messageId: string, read: boolean): void {
    this.storage.markEmailMessageRead(messageId, read);
  }

  setMessageStarred(messageId: string, starred: boolean): void {
    this.storage.setEmailMessageStarred(messageId, starred);
  }

  setMessageArchived(messageId: string, archived: boolean): void {
    this.storage.setEmailMessageArchived(messageId, archived);
  }

  listAttachments(messageId: string): EmailAttachment[] {
    return this.storage.listEmailAttachments(messageId);
  }

  getSyncState(accountId: string): EmailSyncState | null {
    return this.storage.getEmailSyncState(accountId);
  }

  async runSync(accountId: string): Promise<EmailSyncRunResult> {
    return await this.syncService.syncAccount(accountId);
  }
}
