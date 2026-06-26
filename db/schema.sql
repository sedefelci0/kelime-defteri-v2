-- Kelime Öğrenme Uygulaması - Veritabanı Şeması

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS words (
  id SERIAL PRIMARY KEY,
  english TEXT NOT NULL,
  pronunciation TEXT NOT NULL,
  turkish_meaning TEXT NOT NULL,
  english_explanation TEXT NOT NULL,
  example_sentence TEXT NOT NULL
);

-- Her kullanıcının her kelimeyle ilişkisi: hiç görmedi / öğreniyor / öğrendi
CREATE TABLE IF NOT EXISTS user_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'learning', 'known')),
  times_correct INTEGER NOT NULL DEFAULT 0,
  times_wrong INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_status ON user_progress(user_id, status);

-- Oturum (session) verisi için connect-pg-simple bu tabloyu kendisi oluşturur (session.sql ile)
