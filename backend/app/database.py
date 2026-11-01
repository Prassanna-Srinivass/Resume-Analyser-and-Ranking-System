"""Small, transactional SQLite repository. Connections are never shared across threads."""
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = os.getenv('DATABASE_PATH', str(Path(__file__).resolve().parents[1] / 'data' / 'playground.db'))

@contextmanager
def connection():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    try:
        with db:
            yield db
    finally:
        db.close()

def initialize():
    with connection() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS prompts (
          id INTEGER PRIMARY KEY, title TEXT NOT NULL, prompt_text TEXT NOT NULL,
          technique TEXT NOT NULL, category TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS runs (
          id INTEGER PRIMARY KEY, prompt_id INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
          title TEXT NOT NULL, prompt_text TEXT NOT NULL, technique TEXT NOT NULL,
          category TEXT NOT NULL, model_name TEXT NOT NULL, input_text TEXT NOT NULL,
          response_text TEXT NOT NULL, rendered_prompt TEXT NOT NULL, is_demo INTEGER NOT NULL,
          latency_ms INTEGER NOT NULL, created_at TEXT NOT NULL,
          relevance_rating INTEGER CHECK(relevance_rating BETWEEN 1 AND 5),
          clarity_rating INTEGER CHECK(clarity_rating BETWEEN 1 AND 5),
          completeness_rating INTEGER CHECK(completeness_rating BETWEEN 1 AND 5),
          feedback_note TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS templates (
          id INTEGER PRIMARY KEY, title TEXT NOT NULL, template_text TEXT NOT NULL,
          technique TEXT NOT NULL, category TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS runs_created ON runs(created_at);
        ''')
