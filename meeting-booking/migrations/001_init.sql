CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('member','admin')),
  timezone      TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  email         TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id              INTEGER PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  organizer_id    INTEGER NOT NULL REFERENCES users(id),
  start_utc       TEXT NOT NULL,
  end_utc         TEXT NOT NULL,
  timezone        TEXT NOT NULL,
  join_url        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('scheduled','cancelled')),
  sequence        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meetings_organizer ON meetings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_meetings_start ON meetings(start_utc);

CREATE TABLE IF NOT EXISTS participants (
  meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT,
  PRIMARY KEY (meeting_id, email)
);

CREATE TABLE IF NOT EXISTS email_send_log (
  id           INTEGER PRIMARY KEY,
  meeting_id   INTEGER REFERENCES meetings(id),
  recipient    TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('invite','update','cancel')),
  status       TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error        TEXT,
  sent_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_log_meeting ON email_send_log(meeting_id);
CREATE INDEX IF NOT EXISTS idx_email_log_sent_at ON email_send_log(sent_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
