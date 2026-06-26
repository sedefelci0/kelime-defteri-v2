// Veritabanı tablolarını oluşturur ve words tablosu boşsa data/words.json'daki
// kelimeleri yükler. Hem sunucu açılışında (server.js) hem de elle çalıştırılan
// script'te (scripts/setup-db.js) kullanılır. Birden fazla çalıştırılması güvenlidir
// (tablo zaten varsa CREATE TABLE IF NOT EXISTS atlar, kelimeler zaten yüklüyse tekrar eklemez).

const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function ensureDatabaseReady() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const sessionSchema = fs.readFileSync(path.join(__dirname, 'session.sql'), 'utf8');

  await pool.query(schema);
  await pool.query(sessionSchema);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM words');
  if (rows[0].count > 0) {
    console.log(`[db] words tablosunda zaten ${rows[0].count} kelime var, yükleme atlanıyor.`);
    return;
  }

  const words = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../data/words.json'), 'utf8')
  );
  console.log(`[db] ${words.length} kelime yükleniyor...`);

  for (const w of words) {
    await pool.query(
      `INSERT INTO words (english, pronunciation, turkish_meaning, english_explanation, example_sentence)
       VALUES ($1, $2, $3, $4, $5)`,
      [w.english, w.pronunciation, w.turkish_meaning, w.english_explanation, w.example_sentence]
    );
  }

  console.log('[db] Kelime yükleme tamamlandı.');
}

module.exports = { ensureDatabaseReady };
