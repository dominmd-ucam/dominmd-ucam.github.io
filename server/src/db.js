import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** SQLite integrado en Node: sin dependencias nativas ni otro contenedor de base de datos. */
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS guestbook (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      message     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at  INTEGER NOT NULL,
      ip_hash     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_guestbook_status ON guestbook(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS contact (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      email       TEXT,
      message     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      handled     INTEGER NOT NULL DEFAULT 0,
      ip_hash     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_contact_created ON contact(created_at DESC);
  `);
  return db;
}
