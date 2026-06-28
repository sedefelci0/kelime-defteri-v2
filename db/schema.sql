-- Kelime Öğrenme Uygulaması - Veritabanı Şeması

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  total_study_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_study_seconds INTEGER NOT NULL DEFAULT 0;

-- Bir "deste": örn. "Benim Kelimelerim" (sahibe özel) veya "5. Sınıf"
CREATE TABLE IF NOT EXISTS decks (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requires_owner BOOLEAN NOT NULL DEFAULT false,
  has_explanation BOOLEAN NOT NULL DEFAULT true,
  has_image BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS words (
  id SERIAL PRIMARY KEY,
  deck_id INTEGER REFERENCES decks(id) ON DELETE CASCADE,
  unit INTEGER,
  english TEXT NOT NULL,
  pronunciation TEXT NOT NULL,
  turkish_meaning TEXT NOT NULL,
  english_explanation TEXT,
  example_sentence TEXT NOT NULL,
  image_url TEXT
);
ALTER TABLE words ADD COLUMN IF NOT EXISTS deck_id INTEGER REFERENCES decks(id) ON DELETE CASCADE;
ALTER TABLE words ADD COLUMN IF NOT EXISTS unit INTEGER;
ALTER TABLE words ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE words ALTER COLUMN english_explanation DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_words_deck ON words(deck_id, unit);

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
