// YÖKDİL deste kelimelerini Excel dosyasından okuyup veritabanına yükler.
//
// Kullanım:
//   node scripts/seed-yokdil.js --file <excel_yolu> --unit <1|2|3|4>
//
// Örnek:
//   node scripts/seed-yokdil.js --file data/karma.xlsx --unit 1
//   node scripts/seed-yokdil.js --file data/baglaclar.xlsx --unit 2
//
// Excel sütun sırası (1. satır başlık):
//   A: No | B: İngilizce | C: Türkçe | D: Tür | E: Örnek Cümle (İngilizce)
//
// Önce yokdil destesinin veritabanında mevcut olması gerekir.
// Sunucu bir kez çalıştırılmışsa (npm start) otomatik oluşur.
// Ya da: node scripts/setup-db.js

'use strict';

const path = require('path');
const XLSX = require('xlsx');
const pool = require('../db/pool');

const UNIT_NAMES = {
  1: 'Karma Kelimeler',
  2: 'Bağlaçlar',
  3: 'Sıfatlar',
  4: 'Zarflar',
};

function parseArgs() {
  const args = process.argv.slice(2);
  let file = null;
  let unit = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') file = args[++i];
    else if (args[i] === '--unit') unit = parseInt(args[++i], 10);
  }
  return { file, unit };
}

async function main() {
  const { file, unit } = parseArgs();

  if (!file || !unit || !UNIT_NAMES[unit]) {
    console.error('Kullanım: node scripts/seed-yokdil.js --file <excel_yolu> --unit <1|2|3|4>');
    console.error('Üniteler: 1=Karma Kelimeler, 2=Bağlaçlar, 3=Sıfatlar, 4=Zarflar');
    process.exit(1);
  }

  const filePath = path.resolve(file);
  console.log(`\nDosya: ${filePath}`);
  console.log(`Ünite: ${unit} — ${UNIT_NAMES[unit]}\n`);

  // Excel oku
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // İlk satır başlık, atla
  const dataRows = rows.slice(1).filter((r) => r[1] && String(r[1]).trim());

  console.log(`${dataRows.length} kelime bulundu.`);

  // yokdil deste id'sini bul
  const { rows: deckRows } = await pool.query("SELECT id FROM decks WHERE slug = 'yokdil'");
  if (deckRows.length === 0) {
    console.error("Hata: 'yokdil' destesi veritabanında bulunamadı.");
    console.error("Önce sunucuyu bir kez başlatın (npm start) veya: node scripts/setup-db.js");
    process.exit(1);
  }
  const deckId = deckRows[0].id;

  // Aynı ünitenin daha önce yüklenip yüklenmediğini kontrol et
  const { rows: existing } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM words WHERE deck_id = $1 AND unit = $2',
    [deckId, unit]
  );
  if (existing[0].count > 0) {
    console.warn(`Uyarı: Ünite ${unit} (${UNIT_NAMES[unit]}) için zaten ${existing[0].count} kelime var.`);
    console.warn('Devam etmek için önce bu üniteyi silin:');
    console.warn(`  DELETE FROM words WHERE deck_id = ${deckId} AND unit = ${unit};`);
    process.exit(1);
  }

  // Kelimeleri ekle
  let inserted = 0;
  for (const row of dataRows) {
    const english      = String(row[1] || '').trim();
    const turkish      = String(row[2] || '').trim();
    const partOfSpeech = String(row[3] || '').trim() || null;
    const example      = String(row[4] || '').trim() || null;

    if (!english || !turkish) continue;

    await pool.query(
      `INSERT INTO words (deck_id, unit, english, pronunciation, turkish_meaning, english_explanation, example_sentence, part_of_speech)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [deckId, unit, english, null, turkish, null, example, partOfSpeech]
    );
    inserted++;
  }

  console.log(`✓ ${inserted} kelime eklendi → Ünite ${unit}: ${UNIT_NAMES[unit]}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Hata:', err.message);
  process.exit(1);
});
