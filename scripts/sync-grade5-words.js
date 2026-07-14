// 5. Sınıf destesine, data/grade5_words.json içinde olup veritabanında henüz bulunmayan
// üniteleri ekler. Artık sunucu her açılışında (db/setup.js > syncGrade5Units) otomatik
// çalışıyor, bu yüzden Shell erişimi olan ortamlarda bu script'i elle çalıştırmaya normalde
// gerek yok — sadece yerelde manuel test etmek istersen veya sunucuyu yeniden başlatmadan
// hemen eklemek istersen kullanışlıdır. Birden fazla çalıştırılması güvenlidir.
//
// Kullanım:
//   node scripts/sync-grade5-words.js

'use strict';

const pool = require('../db/pool');
const { syncGrade5Units } = require('../db/setup');

syncGrade5Units()
  .then(() => {
    console.log('✓ Senkronizasyon tamamlandı (eksik ünite yoksa hiçbir şey eklenmemiş olabilir).');
    return pool.end();
  })
  .catch((err) => {
    console.error('Hata:', err.message);
    process.exit(1);
  });
