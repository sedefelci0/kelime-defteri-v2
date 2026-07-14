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

## 5. Sınıf üniteleri ve Konu Özetleri

`data/grade5_words.json` 8 ünitenin tamamını içerir (Ünite 1 dışındakiler zaten `words` tablosunda mevcutsa `setup-db` atlar); yeni/eksik üniteleri eklemek için `node scripts/sync-grade5-words.js` çalıştırılır — canlıda nasıl yapılacağı KURULUM-REHBERI.md içinde anlatılıyor.

Her ünitenin gramer/soru-cevap içeriğinden üretilen interaktif alıştırmalar `data/grade5_topics.json`'da (kişisel soru / çoktan seçmeli / doğru-yanlış / boşluk doldurma / eşleştirme), API'si `routes/topics.js`'de, arayüzü `public/topics.html` + `public/js/topics.js`'de. Skorlar `topic_progress` tablosunda öğrenci bazında saklanır ve `routes/admin.js`'deki öğrenci listesinde görünür.
