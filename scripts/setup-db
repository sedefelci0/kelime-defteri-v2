// Bu script: 1) tabloları oluşturur, 2) data/words.json içindeki kelimeleri words tablosuna yükler.
// Çalıştırmak için: npm run setup-db

const fs = require('fs');
const path = require('path');
const pool = require('../db/pool');

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  const sessionSchema = fs.readFileSync(path.join(__dirname, '../db/session.sql'), 'utf8');

  console.log('Tablolar oluşturuluyor...');
  await pool.query(schema);
  await pool.query(sessionSchema);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM words');
  if (rows[0].count > 0) {
    console.log(`words tablosunda zaten ${rows[0].count} kelime var, yükleme atlanıyor.`);
    console.log('(Yeniden yüklemek istiyorsan önce: DELETE FROM words; çalıştır.)');
    await pool.end();
    return;
  }

  const words = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/words.json'), 'utf8'));
  console.log(`${words.length} kelime yükleniyor...`);

  for (const w of words) {
    await pool.query(
      `INSERT INTO words (english, pronunciation, turkish_meaning, english_explanation, example_sentence)
       VALUES ($1, $2, $3, $4, $5)`,
      [w.english, w.pronunciation, w.turkish_meaning, w.english_explanation, w.example_sentence]
    );
  }

  console.log('Tamamlandı!');
  await pool.end();
}

run().catch((err) => {
  console.error('Hata:', err);
  process.exit(1);
});
