import { describe, it, expect, beforeAll, afterEach } from 'vitest';

type BetterSqlite3Module = typeof import('better-sqlite3');
type MigrationModule = typeof import('../../../../src/storage/migrations/v032-pop3-email.js');

describe('migration v032: POP3 email storage', () => {
  let Database: BetterSqlite3Module | null = null;
  let migrationModule: MigrationModule | null = null;
  let dbInstances: InstanceType<Awaited<BetterSqlite3Module>['default']>[] = [];

  beforeAll(async () => {
    try {
      const BetterSqlite3 = (await import('better-sqlite3')) as BetterSqlite3Module;
      const tmpDb = new BetterSqlite3.default(':memory:');
      tmpDb.close();
      Database = BetterSqlite3;
      migrationModule = await import('../../../../src/storage/migrations/v032-pop3-email.js');
    } catch (err) {
      if (process.env.REQUIRE_SQLITE_TESTS) {
        throw new Error(
          `REQUIRE_SQLITE_TESTS set but better-sqlite3 failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      console.warn('Skipping v032 migration tests: better-sqlite3 native module not available');
    }
  });

  afterEach(() => {
    for (const db of dbInstances) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
    dbInstances = [];
  });

  function openDb() {
    if (!Database) {
      throw new Error('better-sqlite3 not available');
    }
    const db = new Database.default(':memory:');
    db.pragma('foreign_keys = ON');
    dbInstances.push(db);
    return db;
  }

  it('declares version 32', () => {
    if (!migrationModule) return;
    expect(migrationModule.migration.version).toBe(32);
  });

  it('creates email tables and indexes', () => {
    if (!Database || !migrationModule) return;

    const db = openDb();
    migrationModule.migration.up(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;

    expect(tables.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'email_accounts',
        'email_messages',
        'email_attachments',
        'email_sync_state',
      ]),
    );
    expect(indexes.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        'idx_email_messages_account_id',
        'idx_email_messages_sent_at',
        'idx_email_messages_from_address',
        'idx_email_messages_subject',
        'idx_email_attachments_message_id',
      ]),
    );

    const columns = db.prepare('PRAGMA table_info(email_messages)').all() as Array<{
      name: string;
      dflt_value: string | null;
    }>;
    expect(columns.find((column) => column.name === 'read_state')?.dflt_value).toBe("'unread'");
  });

  it('enforces account and UIDL uniqueness', () => {
    if (!Database || !migrationModule) return;

    const db = openDb();
    migrationModule.migration.up(db);
    db.prepare(
      `INSERT INTO email_accounts
        (id, display_name, host, port, use_tls, username, password_secret_id, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'account_1',
      'Work',
      'mail.example.com',
      995,
      1,
      'user@example.com',
      'secret_1',
      1,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );
    db.prepare(
      `INSERT INTO email_messages
        (id, account_id, uidl, received_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'message_1',
      'account_1',
      'uidl_1',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );

    expect(() => {
      db.prepare(
        `INSERT INTO email_messages
          (id, account_id, uidl, received_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        'message_2',
        'account_1',
        'uidl_1',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );
    }).toThrow();
  });
});
