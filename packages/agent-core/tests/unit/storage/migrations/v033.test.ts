import { describe, it, expect, beforeAll, afterEach } from 'vitest';

type BetterSqlite3Module = typeof import('better-sqlite3');
type Migration32Module = typeof import('../../../../src/storage/migrations/v032-pop3-email.js');
type Migration33Module =
  typeof import('../../../../src/storage/migrations/v033-email-fts-and-constraints.js');

describe('migration v033: email FTS and constraints', () => {
  let Database: BetterSqlite3Module | null = null;
  let migration32Module: Migration32Module | null = null;
  let migration33Module: Migration33Module | null = null;
  let dbInstances: InstanceType<Awaited<BetterSqlite3Module>['default']>[] = [];

  beforeAll(async () => {
    try {
      const BetterSqlite3 = (await import('better-sqlite3')) as BetterSqlite3Module;
      const tmpDb = new BetterSqlite3.default(':memory:');
      tmpDb.close();
      Database = BetterSqlite3;
      migration32Module = await import('../../../../src/storage/migrations/v032-pop3-email.js');
      migration33Module =
        await import('../../../../src/storage/migrations/v033-email-fts-and-constraints.js');
    } catch (err) {
      if (process.env.REQUIRE_SQLITE_TESTS) {
        throw new Error(
          `REQUIRE_SQLITE_TESTS set but better-sqlite3 failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      console.warn('Skipping v033 migration tests: better-sqlite3 native module not available');
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

  function openMigratedDb() {
    if (!Database || !migration32Module || !migration33Module) {
      throw new Error('better-sqlite3 not available');
    }
    const db = new Database.default(':memory:');
    db.pragma('foreign_keys = ON');
    dbInstances.push(db);
    migration32Module.migration.up(db);
    migration33Module.migration.up(db);
    return db;
  }

  function seedAccount(db: InstanceType<Awaited<BetterSqlite3Module>['default']>) {
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
  }

  it('declares version 33', () => {
    if (!migration33Module) return;
    expect(migration33Module.migration.version).toBe(33);
  });

  it('creates FTS table and indexes inserted rows', () => {
    if (!Database || !migration32Module || !migration33Module) return;

    const db = openMigratedDb();
    seedAccount(db);
    db.prepare(
      `INSERT INTO email_messages
        (id, account_id, uidl, from_name, subject, text_body, received_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'message_1',
      'account_1',
      'uidl_1',
      'Finance Team',
      'Quarterly invoice',
      'Payment due next week',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    );

    const rows = db
      .prepare('SELECT rowid FROM email_messages_fts WHERE email_messages_fts MATCH ?')
      .all('"Finance"') as Array<{ rowid: number }>;

    expect(rows).toHaveLength(1);
  });

  it('rejects invalid read_state values', () => {
    if (!Database || !migration32Module || !migration33Module) return;

    const db = openMigratedDb();
    seedAccount(db);

    expect(() => {
      db.prepare(
        `INSERT INTO email_messages
          (id, account_id, uidl, read_state, received_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        'message_1',
        'account_1',
        'uidl_1',
        'maybe',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      );
    }).toThrow();
  });
});
