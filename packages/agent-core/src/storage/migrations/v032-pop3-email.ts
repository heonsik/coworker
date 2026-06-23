import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Creates the local POP3 email storage schema.
 *
 * WHY: POP3 only exposes a mailbox stream; it does not provide folders,
 * server-side read state, or reliable search. The app needs local tables for
 * account metadata, UIDL-based deduplication, local read/star/archive state,
 * attachment metadata, and per-account sync cursors. Passwords are deliberately
 * excluded from SQLite and stored via SecureStorage using password_secret_id.
 */
export const migration: Migration = {
  version: 32,
  up: (db: Database) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_accounts (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        use_tls INTEGER NOT NULL DEFAULT 1,
        username TEXT NOT NULL,
        password_secret_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS email_messages (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
        uidl TEXT NOT NULL,
        message_id TEXT,
        from_address TEXT,
        from_name TEXT,
        to_json TEXT NOT NULL DEFAULT '[]',
        cc_json TEXT NOT NULL DEFAULT '[]',
        subject TEXT NOT NULL DEFAULT '',
        sent_at TEXT,
        received_at TEXT NOT NULL,
        text_body TEXT,
        html_body TEXT,
        raw_path TEXT,
        read_state TEXT NOT NULL DEFAULT 'unread' CHECK(read_state IN ('unread', 'read')),
        starred INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(account_id, uidl)
      );

      CREATE TABLE IF NOT EXISTS email_attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        content_type TEXT,
        detected_type TEXT,
        size INTEGER NOT NULL DEFAULT 0,
        storage_path TEXT,
        downloaded INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS email_sync_state (
        account_id TEXT PRIMARY KEY REFERENCES email_accounts(id) ON DELETE CASCADE,
        last_sync_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        cursor_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_email_messages_account_id
        ON email_messages(account_id);
      CREATE INDEX IF NOT EXISTS idx_email_messages_sent_at
        ON email_messages(sent_at);
      CREATE INDEX IF NOT EXISTS idx_email_messages_from_address
        ON email_messages(from_address);
      CREATE INDEX IF NOT EXISTS idx_email_messages_subject
        ON email_messages(subject);
      CREATE INDEX IF NOT EXISTS idx_email_attachments_message_id
        ON email_attachments(message_id);
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_email_attachments_message_id;
      DROP INDEX IF EXISTS idx_email_messages_subject;
      DROP INDEX IF EXISTS idx_email_messages_from_address;
      DROP INDEX IF EXISTS idx_email_messages_sent_at;
      DROP INDEX IF EXISTS idx_email_messages_account_id;
      DROP TABLE IF EXISTS email_sync_state;
      DROP TABLE IF EXISTS email_attachments;
      DROP TABLE IF EXISTS email_messages;
      DROP TABLE IF EXISTS email_accounts;
    `);
  },
};
