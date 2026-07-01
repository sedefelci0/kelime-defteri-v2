// Veritabanı tablolarını oluşturur ve db/decks-config.js'de tanımlı her deste için
// ilgili JSON dosyasındaki kelimeleri yükler. Hem sunucu açılışında (server.js) hem de
// elle çalıştırılan script'te (scripts/setup-db.js) kullanılır. Birden fazla çalıştırılması
// güvenlidir: zaten var olan desteler/kelimeler atlanır, sadece yeni olanlar eklenir.

const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const DECKS = require('./decks-config');

async function ensureDatabaseReady() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const sessionSchema = fs.readFileSync(path.join(__dirname, 'session.sql'), 'utf8');

  await pool.query(schema);
  await pool.query(sessionSchema);

  for (const deck of DECKS) {
    const deckResult = await pool.query(
      `INSERT INTO decks (slug, title, description, requires_owner, has_explanation, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         requires_owner = EXCLUDED.requires_owner,
         has_explanation = EXCLUDED.has_explanation,
         sort_order = EXCLUDED.sort_order
       RETURNING id`,
      [deck.slug, deck.title, deck.description, deck.requiresOwner, deck.hasExplanation, deck.sortOrder]
    );
    const deckId = deckResult.rows[0].id;

    const { rows: existing } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM words WHERE deck_id = $1',
      [deckId]
    );
    if (existing[0].count > 0) {
      console.log(`[db] "${deck.title}" destesinde zaten ${existing[0].count} kelime var, atlanıyor.`);
      continue;
    }

    const words = JSON.parse(fs.readFileSync(path.join(__dirname, deck.wordsFile), 'utf8'));
    console.log(`[db] "${deck.title}" destesine ${words.length} kelime yükleniyor...`);

    for (const w of words) {
      await pool.query(
        `INSERT INTO words (deck_id, unit, english, pronunciation, turkish_meaning, english_explanation, example_sentence, part_of_speech)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          deckId,
          w.unit || null,
          w.english,
          w.pronunciation || null,
          w.turkish_meaning,
          w.english_explanation || null,
          w.example_sentence,
          w.part_of_speech || null,
        ]
      );
    }
    console.log(`[db] "${deck.title}" yükleme tamamlandı.`);
  }

  await ensureExamQuestionsReady();
  await fixTypos();
}

async function fixTypos() {
  const fixes = [
    { wrong: 'ablolition', correct: 'Abolition' },
  ];
  for (const { wrong, correct } of fixes) {
    const { rowCount } = await pool.query(
      'UPDATE words SET english = $1 WHERE english = $2',
      [correct, wrong]
    );
    if (rowCount > 0) console.log(`[db] Typo düzeltildi: "${wrong}" → "${correct}"`);
  }
}

// data/exam_questions.json içindeki genel soru havuzunu (örn. çıkmış LGS/YDS/YÖKDİL soruları)
// yükler. Bu sorular belirli bir kelimeye/desteye bağlı değildir; routes/words.js her kelime
// için metin eşleştirmesiyle uygun bir soru arar. Dosya zamanla büyüyebileceği için her
// başlangıçta tüm liste taranır, ama question_text üzerindeki unique index sayesinde zaten
// var olan sorular ON CONFLICT DO NOTHING ile atlanır — sadece yeni eklenenler işlenir.
async function ensureExamQuestionsReady() {
  const filePath = path.join(__dirname, '../data/exam_questions.json');
  if (!fs.existsSync(filePath)) return;

  const questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let inserted = 0;

  for (const q of questions) {
    const { rowCount } = await pool.query(
      `INSERT INTO exam_questions (question_text, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, source, restrict_deck_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (question_text) DO NOTHING`,
      [
        q.question_text,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.option_e || null,
        q.correct_option,
        q.explanation || null,
        q.source || null,
        q.restrict_deck_slug || null,
      ]
    );
    inserted += rowCount;
  }
  if (inserted > 0) {
    console.log(`[db] exam_questions havuzuna ${inserted} yeni soru eklendi (toplam ${questions.length} taranan).`);
  } else {
    console.log(`[db] exam_questions havuzunda yeni soru yok, ${questions.length} soru zaten mevcut.`);
  }
}

module.exports = { ensureDatabaseReady };
