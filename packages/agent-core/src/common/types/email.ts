export type EmailReadState = 'unread' | 'read';

export interface EmailAddress {
  address: string;
  name?: string;
}

export interface EmailAccount {
  id: string;
  displayName: string;
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  passwordSecretId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailAccountCreateInput {
  id?: string;
  displayName: string;
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  passwordSecretId: string;
  enabled?: boolean;
}

export interface EmailAccountWithPasswordInput {
  displayName: string;
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  password: string;
  enabled?: boolean;
}

export interface EmailAccountUpdateInput {
  displayName?: string;
  host?: string;
  port?: number;
  useTls?: boolean;
  username?: string;
  passwordSecretId?: string;
  enabled?: boolean;
}

export interface EmailAccountSettingsUpdateInput {
  displayName?: string;
  host?: string;
  port?: number;
  useTls?: boolean;
  username?: string;
  password?: string;
  enabled?: boolean;
}

export interface EmailConnectionTestInput {
  accountId?: string;
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  password?: string;
  timeoutMs?: number;
}

export interface EmailConnectionTestResult {
  ok: boolean;
  uidlSupported: boolean;
  messageCount?: number;
  error?: string;
}

export interface EmailMessage {
  id: string;
  accountId: string;
  uidl: string;
  messageId?: string;
  fromAddress?: string;
  fromName?: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  sentAt?: string;
  receivedAt: string;
  textBody?: string;
  htmlBody?: string;
  rawPath?: string;
  readState: EmailReadState;
  starred: boolean;
  archived: boolean;
  createdAt: string;
}

export interface EmailMessageCreateInput {
  id?: string;
  accountId: string;
  uidl: string;
  messageId?: string;
  fromAddress?: string;
  fromName?: string;
  to?: EmailAddress[];
  cc?: EmailAddress[];
  subject?: string;
  sentAt?: string;
  receivedAt?: string;
  textBody?: string;
  htmlBody?: string;
  rawPath?: string;
  readState?: EmailReadState;
  starred?: boolean;
  archived?: boolean;
}

export interface EmailMessageListFilters {
  accountId?: string;
  query?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export interface EmailAttachment {
  id: string;
  messageId: string;
  filename: string;
  contentType?: string;
  detectedType?: string;
  size: number;
  storagePath?: string;
  downloaded: boolean;
  createdAt: string;
}

export interface EmailAttachmentCreateInput {
  id?: string;
  messageId: string;
  filename: string;
  contentType?: string;
  detectedType?: string;
  size?: number;
  storagePath?: string;
  downloaded?: boolean;
}

export interface EmailSyncState {
  accountId: string;
  lastSyncAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  cursor: Record<string, unknown>;
}

export interface EmailSyncRunResult {
  ok: boolean;
  newCount: number;
  totalOnServer: number;
  error?: string;
}

export interface EmailSyncStateUpdateInput {
  accountId: string;
  lastSyncAt?: string;
  lastSuccessAt?: string;
  lastError?: string | null;
  cursor?: Record<string, unknown>;
}
