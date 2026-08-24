const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'evoting.db'));

function initDB() {
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'voter',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS elections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      start_at TEXT,
      end_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      max_votes INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      photo_url TEXT,
      bio TEXT,
      party TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      election_id INTEGER NOT NULL REFERENCES elections(id),
      position_id INTEGER NOT NULL REFERENCES positions(id),
      candidate_id INTEGER NOT NULL REFERENCES candidates(id),
      voted_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, election_id, position_id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      detail TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrate databases created before votes were scoped to an election.
  const voteSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='votes'").get();
  if (voteSchema && voteSchema.sql.includes('UNIQUE(user_id, position_id)')) {
    db.exec(`
      ALTER TABLE votes RENAME TO votes_legacy;
      CREATE TABLE votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        election_id INTEGER NOT NULL REFERENCES elections(id),
        position_id INTEGER NOT NULL REFERENCES positions(id),
        candidate_id INTEGER NOT NULL REFERENCES candidates(id),
        voted_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, election_id, position_id)
      );
      INSERT INTO votes (id, user_id, election_id, position_id, candidate_id, voted_at)
        SELECT id, user_id, election_id, position_id, candidate_id, voted_at FROM votes_legacy;
      DROP TABLE votes_legacy;
    `);
  }

  // Seed default admin account
  const adminExists = db.prepare("SELECT id FROM users WHERE student_id = 'admin'").get();
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (student_id, name, email, password_hash, role)
      VALUES ('admin', 'System Administrator', 'admin@lourdes.edu.ph', ?, 'admin')
    `).run(hash);
    console.log('✅ Default admin created: student_id=admin, password=admin123');
  }

  console.log('✅ Database initialized');
}

module.exports = { db, initDB };
