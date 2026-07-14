// 5. Sınıf destesine, data/grade5_words.json içinde olup veritabanında henüz bulunmayan
// üniteleri ekler. db/setup.js normal akışta bir deste zaten kelime içeriyorsa o desteyi
// tamamen atlar (ilerlemeyi bozmamak için) — bu yüzden 5-sinif destesine yeni ünite (2, 3, ...)
// eklemek için bu ayrı script gerekiyor. Ünite bazında kontrol eder, sadece eksik olanları
// yükler; birden fazla çalıştırılması güvenlidir.
//
// Kullanım:
//   node scripts/sync-grade5-words.js

'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

async function main() {
  const words = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/grade5_words.json'), 'utf8'));

  const { rows: deckRows } = await pool.query("SELECT id FROM decks WHERE slug = '5-sinif'");
  if (deckRows.length === 0) {
    console.error("Hata: '5-sinif' destesi veritabanında bulunamadı.");
    console.error('Önce sunucuyu bir kez başlatın (npm start) veya: node scripts/setup-db.js');
    process.exit(1);
  }
  const deckId = deckRows[0].id;

  const byUnit = {};
  for (const w of words) {
    const unit = w.unit || 0;
    if (!byUnit[unit]) byUnit[unit] = [];
    byUnit[unit].push(w);
  }

  const units = Object.keys(byUnit).map(Number).sort((a, b) => a - b);
  let totalInserted = 0;

  for (const unit of units) {
    const { rows: existing } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM words WHERE deck_id = $1 AND unit = $2',
      [deckId, unit]
    );
    if (existing[0].count > 0) {
      console.log(`[sync] Ünite ${unit}: zaten ${existing[0].count} kelime var, atlanıyor.`);
      continue;
    }

    const unitWords = byUnit[unit];
    for (const w of unitWords) {
      await pool.query(
        `INSERT INTO words (deck_id, unit, english, pronunciation, turkish_meaning, english_explanation, example_sentence, part_of_speech)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          deckId,
          unit,
          w.english,
          w.pronunciation || null,
          w.turkish_meaning,
          w.english_explanation || null,
          w.example_sentence,
          w.part_of_speech || null,
        ]
      );
    }
    totalInserted += unitWords.length;
    console.log(`[sync] Ünite ${unit}: ${unitWords.length} kelime eklendi.`);
  }

  console.log(totalInserted > 0 ? `✓ Toplam ${totalInserted} kelime eklendi.` : 'Eklenecek yeni ünite yok, her şey güncel.');
  await pool.end();
}

main().catch((err) => {
  console.error('Hata:', err.message);
  process.exit(1);
});
