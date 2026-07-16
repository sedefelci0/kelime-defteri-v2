[README.md](https://github.com/user-attachments/files/29381315/README.md)
# Kelime Defteri

İngilizce kelime öğrenme kartları uygulaması. Quizlet tarzı çift yüzlü kartlar:

- **Ön yüz:** İngilizce kelime, Türkçe okunuşu, İngilizce açıklama
- **Arka yüz:** Türkçe karşılığı, örnek kullanım cümlesi

Kullanıcı hesabı oluşturur, ilerlemesi (öğrendim / öğreniyorum / yeni) veritabanında saklanır, istediği zaman kaldığı yerden devam eder.

## Canlıya alma

Adım adım, teknik bilgi gerektirmeyen kurulum için **KURULUM-REHBERI.md** dosyasına bak.

## Yerel geliştirme (teknik kullanıcılar için)

Gereksinimler: Node.js 18+, yerel veya uzak bir PostgreSQL.

```bash
npm install
cp .env.example .env   # .env içine kendi DATABASE_URL ve SESSION_SECRET'ını yaz
npm run setup-db        # tabloları kurar ve data/words.json'daki kelimeleri yükler
npm start                # http://localhost:3000
```

## Klasör yapısı

```
server.js              Express sunucu giriş noktası
routes/auth.js          kayıt / giriş / çıkış
routes/words.js         kelime listesi + kullanıcının durumu
routes/progress.js      ilerleme kaydı, özet istatistik
middleware/auth.js      oturum kontrolü
db/schema.sql            tablo tanımları
db/session.sql           oturum tablosu (connect-pg-simple)
scripts/setup-db.js     veritabanı kurulum + kelime yükleme scripti
data/words.json         excel'den dönüştürülmüş kelime verisi
public/                  frontend (giriş sayfası + çalışma ekranı)
```

## Yeni kelime eklemek

`data/words.json` dosyasını güncelle, ardından `words` tablosu boşsa `npm run setup-db` otomatik yükler. Tablo zaten doluysa script atlar (mevcut ilerlemeyi korumak için); sadece yeni kelimeleri eklemek istersen haber ver, ayrı bir script hazırlanabilir.

## Sınıf üniteleri ve Konu Özetleri

Her sınıf destesinin (5, 6, 8. sınıf) kelimeleri kendi `data/gradeN_words.json` dosyasında ünite ünite tutulur. Bir destenin ilk ünitesi kurulumla birlikte yüklendiği için `setup-db`'nin genel "deste dolu mu?" kontrolü sonradan eklenen üniteleri atlar — bu yüzden `db/setup.js` içinde genel bir `syncDeckUnits(deckSlug, wordsFile)` fonksiyonu var ve bu, sunucu her açıldığında (her deploy'da) **tüm desteler için** eksik üniteleri ünite ünite kontrol edip otomatik ekliyor. Elle çalıştırmak istersen (yerelde veya Shell erişimi olan ortamlarda) `node scripts/sync-deck-words.js` de aynı işi yapar.

Her ünitenin gramer/soru-cevap içeriğinden üretilen interaktif alıştırmalar `data/topics.json`'da deckSlug'a göre anahtarlanmış şekilde tutulur (kişisel soru / çoktan seçmeli / doğru-yanlış / boşluk doldurma / eşleştirme), API'si `routes/topics.js`'de, arayüzü `public/topics.html` + `public/js/topics.js`'de. Bir üniteye ait konu özeti kaynağı yoksa o ünite `{ comingSoon: true }` olarak işaretlenir. Hangi destelerde "Konu Özetleri" sekmesinin gösterileceği `public/js/decks.js`'deki `TOPICS_ENABLED_DECKS` listesiyle kontrol edilir. Skorlar `topic_progress` tablosunda öğrenci bazında saklanır ve `routes/admin.js`'deki öğrenci listesinde görünür.
