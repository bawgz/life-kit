-- life-kit workout tracker/planner schema.
-- JSON columns (target_extra, extra) are stored as TEXT and (de)serialized
-- in application code. Item names are freeform text, not a normalized
-- exercise library.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON plan_items(plan_id);

CREATE TABLE IF NOT EXISTS plan_item_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_item_id INTEGER NOT NULL REFERENCES plan_items(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  target_reps INTEGER,
  target_weight REAL,
  target_duration_seconds INTEGER,
  target_distance_meters REAL,
  target_extra TEXT -- JSON object
);

CREATE INDEX IF NOT EXISTS idx_plan_item_sets_plan_item ON plan_item_sets(plan_item_id);

CREATE TABLE IF NOT EXISTS scheduled_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  scheduled_date TEXT NOT NULL, -- ISO date, e.g. 2026-09-22
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'skipped')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_scheduled_workouts_date ON scheduled_workouts(scheduled_date);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_workout_id INTEGER REFERENCES scheduled_workouts(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date);

CREATE TABLE IF NOT EXISTS session_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_items_session ON session_items(session_id);

CREATE TABLE IF NOT EXISTS session_item_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_item_id INTEGER NOT NULL REFERENCES session_items(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  reps INTEGER,
  weight REAL,
  duration_seconds INTEGER,
  distance_meters REAL,
  extra TEXT, -- JSON object, e.g. {"rpe": 8, "inclinePercent": 5}
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_item_sets_session_item ON session_item_sets(session_item_id);
