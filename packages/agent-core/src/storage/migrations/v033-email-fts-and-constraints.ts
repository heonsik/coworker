import type { Database } from 'better-sqlite3';
import type { Migration } from './index.js';

/**
 * Adds email full-text search and runtime DB validation for read_state.
 *
 * WHY: LIKE '%query%' over message bodies does not use indexes and degrades
 * quickly on real mailboxes. FTS5 keeps subject, sender, and text-body search
 * indexed while preserving the email_messages table as the source of truth.
 * The validation triggers cover databases that already applied v032 before
 * the fresh-install CHECK constraint was added.
 */
export const migration: Migration = {
  version: 33,
  up: (db: Database) => {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS email_messages_fts USING fts5(
        subject,
        from_address,
        from_name,
        text_body,
        content='email_messages',
        content_rowid='rowid'
      );

      INSERT INTO email_messages_fts(email_messages_fts)
      VALUES('rebuild');

      CREATE TRIGGER IF NOT EXISTS trg_email_messages_read_state_insert
      BEFORE INSERT ON email_messages
      WHEN NEW.read_state NOT IN ('unread', 'read')
      BEGIN
        SELECT RAISE(ABORT, 'invalid email read_state');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_email_messages_read_state_update
      BEFORE UPDATE OF read_state ON email_messages
      WHEN NEW.read_state NOT IN ('unread', 'read')
      BEGIN
        SELECT RAISE(ABORT, 'invalid email read_state');
      END;

      CREATE TRIGGER IF NOT EXISTS trg_email_messages_fts_insert
      AFTER INSERT ON email_messages
      BEGIN
        INSERT INTO email_messages_fts(rowid, subject, from_address, from_name, text_body)
        VALUES (NEW.rowid, NEW.subject, NEW.from_address, NEW.from_name, NEW.text_body);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_email_messages_fts_delete
      AFTER DELETE ON email_messages
      BEGIN
        INSERT INTO email_messages_fts(
          email_messages_fts,
          rowid,
          subject,
          from_address,
          from_name,
          text_body
        )
        VALUES (
          'delete',
          OLD.rowid,
          OLD.subject,
          OLD.from_address,
          OLD.from_name,
          OLD.text_body
        );
      END;

      CREATE TRIGGER IF NOT EXISTS trg_email_messages_fts_update
      AFTER UPDATE OF subject, from_address, from_name, text_body ON email_messages
      BEGIN
        INSERT INTO email_messages_fts(
          email_messages_fts,
          rowid,
          subject,
          from_address,
          from_name,
          text_body
        )
        VALUES (
          'delete',
          OLD.rowid,
          OLD.subject,
          OLD.from_address,
          OLD.from_name,
          OLD.text_body
        );
        INSERT INTO email_messages_fts(rowid, subject, from_address, from_name, text_body)
        VALUES (NEW.rowid, NEW.subject, NEW.from_address, NEW.from_name, NEW.text_body);
      END;
    `);
  },
  down: (db: Database) => {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_email_messages_fts_update;
      DROP TRIGGER IF EXISTS trg_email_messages_fts_delete;
      DROP TRIGGER IF EXISTS trg_email_messages_fts_insert;
      DROP TRIGGER IF EXISTS trg_email_messages_read_state_update;
      DROP TRIGGER IF EXISTS trg_email_messages_read_state_insert;
      DROP TABLE IF EXISTS email_messages_fts;
    `);
  },
};
