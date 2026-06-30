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
        `INSERT INTO words (deck_id, unit, english, pronunciation, turkish_meaning, english_explanation, example_sentence)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          deckId,
          w.unit || null,
          w.english,
          w.pronunciation,
          w.turkish_meaning,
          w.english_explanation || null,
          w.example_sentence,
        ]
      );
    }
    console.log(`[db] "${deck.title}" yükleme tamamlandı.`);
  }
}

module.exports = { ensureDatabaseReady };
