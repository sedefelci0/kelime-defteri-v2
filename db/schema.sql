-- Kelime Öğrenme Uygulaması - Veritabanı Şeması

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  class_name TEXT,
  total_study_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_study_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_name TEXT;

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

-- Eski tasarım: tek bir kelimeye sabitlenmiş soru. Genel soru havuzu (exam_questions)
-- ile değiştirildi, hiç veri girilmemişti, güvenle kaldırılabilir.
DROP TABLE IF EXISTS questions;

-- Genel çoktan seçmeli soru havuzu (örn. çıkmış LGS soruları). Belirli bir kelimeye/desteye
-- bağlı değildir; bir kelimenin sorusu var mı diye bakılırken, kelimenin metni soru kökünde
-- veya şıklarda geçiyor mu diye eşleştirilir (bkz. routes/words.js). Böylece yeni üniteler/
-- desteler eklendiğinde mevcut soru havuzu otomatik olarak onlarla da eşleşir.
CREATE TABLE IF NOT EXISTS exam_questions (
  id SERIAL PRIMARY KEY,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  explanation TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- Kullanıcıların kendi serbest notları
CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, updated_at DESC);

-- Oturum (session) verisi için connect-pg-simple bu tabloyu kendisi oluşturur (session.sql ile)
