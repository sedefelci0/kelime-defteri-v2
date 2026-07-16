// Her destenin words dosyasına sonradan eklenen üniteleri (örn. Ünite 2, 3, ...)
// veritabanına ekler. Artık sunucu her açılışında (db/setup.js > ensureDatabaseReady,
// tüm desteler için syncDeckUnits) otomatik çalışıyor, bu yüzden Shell erişimi olan
// ortamlarda bu script'i elle çalıştırmaya normalde gerek yok — sadece yerelde manuel
// test etmek istersen veya sunucuyu yeniden başlatmadan hemen eklemek istersen
// kullanışlıdır. Birden fazla çalıştırılması güvenlidir.
//
// Kullanım:
//   node scripts/sync-deck-words.js

'use strict';

const pool = require('../db/pool');
const DECKS = require('../db/decks-config');
const { syncDeckUnits } = require('../db/setup');

(async () => {
  try {
    for (const deck of DECKS) {
      await syncDeckUnits(deck.slug, deck.wordsFile, deck.title);
    }
    console.log('✓ Senkronizasyon tamamlandı (eksik ünite yoksa hiçbir şey eklenmemiş olabilir).');
    await pool.end();
  } catch (err) {
    console.error('Hata:', err.message);
    process.exit(1);
  }
})();
