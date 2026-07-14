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
-- NULL = hiç çevirmedi / hemen çevirebilir. Dolu ve gelecekte bir tarihse çark kilitli demektir.
ALTER TABLE users ADD COLUMN IF NOT EXISTS wheel_next_spin_at TIMESTAMPTZ;

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
ALTER TABLE words ADD COLUMN IF NOT EXISTS part_of_speech TEXT;
ALTER TABLE words ALTER COLUMN english_explanation DROP NOT NULL;
ALTER TABLE words ALTER COLUMN pronunciation DROP NOT NULL;

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
  option_e TEXT,
  correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D', 'E')),
  explanation TEXT,
  source TEXT,
  restrict_deck_slug TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- option_e: YDS/YÖKDİL gibi 5 şıklı sınavlar için (LGS soruları 4 şıklı kalır, E boş).
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS option_e TEXT;
ALTER TABLE exam_questions DROP CONSTRAINT IF EXISTS exam_questions_correct_option_check;
ALTER TABLE exam_questions ADD CONSTRAINT exam_questions_correct_option_check
  CHECK (correct_option IN ('A', 'B', 'C', 'D', 'E'));
-- restrict_deck_slug: NULL ise soru tüm destelerde eşleşebilir (örn. LGS soruları — 5./8. sınıf
-- ve Benim Kelimelerim'de geçerli). Bir deste slug'ı verilirse (örn. 'benim-kelimelerim'),
-- soru SADECE o destede eşleşir (örn. YDS/YÖKDİL soruları diğer sınıflara sızmasın diye).
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS restrict_deck_slug TEXT;
-- data/exam_questions.json zaman içinde büyüyecek (LGS + YDS/YÖKDİL); seed script'i her
-- başlangıçta tüm dosyayı bu unique index'e ON CONFLICT DO NOTHING ile yazar, böylece
-- sadece yeni eklenen sorular eklenir, mevcutlar tekrar eklenmez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_questions_text ON exam_questions(question_text);

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

-- Konu Özetleri: bir kullanıcının bir destenin bir ünitesindeki interaktif aktivite
-- setini (gramer/soru-cevap alıştırmaları) en iyi ve son skoru. words/user_progress'ten
-- ayrı tutulur çünkü kelime kartı ilerlemesiyle ilgisi yok.
CREATE TABLE IF NOT EXISTS topic_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_slug TEXT NOT NULL,
  unit INTEGER NOT NULL,
  best_score INTEGER NOT NULL,
  best_total INTEGER NOT NULL,
  last_score INTEGER NOT NULL,
  last_total INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, deck_slug, unit)
);

-- Konu Özetleri'ndeki kişisel (açık uçlu) sorulara öğrencinin gönderdiği cevaplar.
-- Öğretmen admin panelinden görebilsin diye kalıcı saklanır. Aynı soruya tekrar
-- gönderim yapılırsa (question üzerinden) en son cevap eskisinin üstüne yazılır.
CREATE TABLE IF NOT EXISTS topic_personal_answers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_slug TEXT NOT NULL,
  unit INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, deck_slug, unit, question)
);
CREATE INDEX IF NOT EXISTS idx_topic_personal_user ON topic_personal_answers(user_id);

-- Konu Özetleri'ndeki "kaç denemede doğru yapıldı" takibi — hem boşluk doldurma hem
-- eşleştirme aktiviteleri için ortak tablo (admin panelinde ünite bazında "ilk denemede
-- doğru %" istatistiği için). Bir aktivite öğrenci doğru yapana kadar tekrar tekrar
-- denenebildiğinden, sadece doğru yapıldığı andaki toplam deneme sayısı kaydedilir.
-- activity_type: 'fill_blank' | 'matching' (eşleştirmede: yanlış eşleştirme sayısı + 1).
CREATE TABLE IF NOT EXISTS topic_fillblank_attempts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_slug TEXT NOT NULL,
  unit INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, deck_slug, unit, prompt)
);
ALTER TABLE topic_fillblank_attempts ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'fill_blank';
CREATE INDEX IF NOT EXISTS idx_fillblank_user ON topic_fillblank_attempts(user_id);

-- Ödül Çarkı: her çevirmenin sonucu (geçmiş listesi + öğretmenin "verildi" işaretlemesi için).
-- Kilit/geri sayım mantığı burada değil, users.wheel_next_spin_at'te tutulur — "respin"
-- (tekrar çevir) ödülü çıktığında bu tabloya kaydedilir ama cooldown'ı GÜNCELLEMEZ, böylece
-- öğrenci beklemeden bir kez daha çevirebilir.
CREATE TABLE IF NOT EXISTS wheel_spins (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prize_key TEXT NOT NULL,
  prize_label TEXT NOT NULL,
  prize_tier TEXT NOT NULL DEFAULT 'common',
  spun_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  given BOOLEAN NOT NULL DEFAULT false,
  given_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_wheel_spins_user ON wheel_spins(user_id, spun_at DESC);

-- Konu Özetleri ünite detay popup'ı için: bir çevirmede her tek tek aktivitenin (çoktan
-- seçmeli/doğru-yanlış/boşluk doldurma/eşleştirme) doğru mu yanlış mı yapıldığı. Her
-- ünite gönderiminde o ünitenin aktivite_index'leri ON CONFLICT ile üzerine yazılır —
-- yani her zaman en SON denemenin soru bazlı dökümü saklanır (best_score'un aksine).
CREATE TABLE IF NOT EXISTS topic_activity_results (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_slug TEXT NOT NULL,
  unit INTEGER NOT NULL,
  activity_index INTEGER NOT NULL,
  activity_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  explanation TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, deck_slug, unit, activity_index)
);
CREATE INDEX IF NOT EXISTS idx_topic_activity_results_user ON topic_activity_results(user_id, deck_slug, unit);

-- Oturum (session) verisi için connect-pg-simple bu tabloyu kendisi oluşturur (session.sql ile)
