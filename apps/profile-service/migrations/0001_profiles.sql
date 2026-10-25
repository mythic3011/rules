CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  read_token_hash TEXT NOT NULL UNIQUE,
  manage_token_hash TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS profiles_read_token_hash_idx
  ON profiles(read_token_hash);
