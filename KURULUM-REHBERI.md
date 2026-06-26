[KURULUM-REHBERI.md](https://github.com/user-attachments/files/29381287/KURULUM-REHBERI.md)
# Kelime Defteri — Kurulum Rehberi (Hiç Tecrüben Olmasa Da)

Bu rehber seni şu sıraya göre götürecek:
1. Kodu GitHub'a yükle
2. Neon.com'da kalıcı (süresiz) ücretsiz veritabanı oluştur
3. Render.com'da siteyi oluştur ve veritabanına bağla
4. Kelimeleri veritabanına yükle
5. (İstersen sonra) Kendi domainini al ve siteye bağla

Hiçbir yerde komut satırı bilgisi gerekmiyor; sadece adım 1 için tek seferlik basit bir işlem var, onu da aşağıda anlatıyorum.

> **Neden Neon + Render birlikte?** Render'ın kendi ücretsiz veritabanı 30 gün sonra otomatik siliniyor — bu, kullanıcı hesaplarının ve ilerlemenin kaybolması demek. Neon'un ücretsiz veritabanı ise hiç silinmiyor, süresiz. Render'ı ise sadece siteyi (sunucu kodunu) çalıştırmak için kullanıyoruz, o kısımda sorun yok.

---

## 1. Adım — GitHub'a Yükleme

GitHub, kodunun saklandığı ücretsiz bir site. Render, kodunu oradan alıp sitene dönüştürecek.

1. https://github.com adresine git, ücretsiz bir hesap aç.
2. Sağ üstteki **+** işaretine tıkla → **New repository**.
3. İsim olarak `kelime-defteri` yaz, **Private** seçili kalsın, **Create repository** butonuna bas.
4. Açılan sayfada **"uploading an existing file"** linkine tıkla.
5. Bilgisayarındaki `kelime-app` klasörünün İÇİNDEKİ tüm dosya ve klasörleri (server.js, package.json, public klasörü, vs.) sürükleyip bırak. **node_modules klasörü yoktur zaten, onu yüklemene gerek yok.**
6. Sayfanın altındaki **Commit changes** butonuna bas.

> Not: `.env` dosyası yüklemiyoruz (zaten `.gitignore` bunu engelliyor) — şifreleri GitHub'a değil, Render'a gireceğiz.

---

## 2. Adım — Neon.com'da Kalıcı Veritabanı Oluşturma

1. https://neon.com adresine git, **"Sign up"** ile ücretsiz hesap aç (GitHub hesabınla giriş yapman en kolayı).
2. Karşına çıkan ekranda yeni bir proje oluşturmanı isteyecek: proje adı olarak `kelime-defteri` yaz, bölge (region) olarak Avrupa'ya yakın bir seçenek (örn. Frankfurt/AWS eu-central-1) seç.
3. Proje oluşunca, panelde **"Connection string"** (veya "Connection Details") yazan bir kutu göreceksin. `postgresql://...` ile başlayan uzun metni **kopyala**, bir kenara not et — buna `DATABASE_URL` diyeceğiz, bir sonraki adımda kullanacağız.
4. Bu kadar — Neon tarafında başka bir şey yapmana gerek yok. Veritabanı süresiz olarak ücretsiz kalır, silinmez.

---

## 3. Adım — Render.com'da Siteyi Oluşturma

1. https://render.com adresine git, **"Get Started"** ile ücretsiz hesap aç (GitHub hesabınla giriş yapabilirsin, bu adım 1'i bağlamanı da kolaylaştırır).
2. Render panelinde **New +** → **Web Service** seç.
3. GitHub hesabını bağla, `kelime-defteri` reposunu seç.
4. Ayarlar:
   - **Name**: `guzelamaingilicce` (bu, sitenin adresi olacak: guzelamaingilicce.onrender.com)
   - **Region**: Frankfurt
   - **Branch**: main
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. **"Environment Variables"** bölümüne şunları ekle (Add Environment Variable ile tek tek):
   - `DATABASE_URL` → 2. adımda Neon'dan kopyaladığın connection string
   - `SESSION_SECRET` → rastgele, uzun bir metin (örnek: `kdf-9x7-mZq2-rastgele-bisey-yaz-2026`)
   - `NODE_ENV` → `production`
6. **Create Web Service** butonuna bas. Render kodu çekip kuracak, 2-5 dakika sürer. Loglarda "Sunucu ... çalışıyor" yazısını görürsen hazır.

> Not: Bu ücretsiz Render servisi 15 dakika kullanılmazsa "uyur", bir sonraki ziyaretçi 30-50 saniye bekler — ama site ve hesabın silinmez, sadece geçici bir uyanma süresi olur. Veritabanın (Neon) bundan etkilenmez, kalıcıdır.

---

## 4. Adım — Veritabanını Kurma ve Kelimeleri Yükleme

Bu adım tek seferlik ve tek bir tıklama gerektiriyor:

1. Render panelinde web servisinin sayfasına git → üstte **"Shell"** sekmesine tıkla.
2. Açılan siyah ekrana şunu yaz ve Enter'a bas:
   ```
   npm run setup-db
   ```
3. "617 kelime yükleniyor... Tamamlandı!" yazısını görmelisin.

Tebrikler — siteniz artık `https://guzelamaingilicce.onrender.com` adresinde çalışıyor (Render'ın sana verdiği gerçek adres "Web Service" sayfasının en üstünde yazıyor). Bunu hemen tarayıcında açıp deneyebilirsin, herkes bu adresten erişebilir.

---

## 5. Adım — (İsteğe Bağlı) Kendi Domainini Alma ve Bağlama

Bu adımı atlayabilirsin — Render'ın verdiği `https://guzelamaingilicce.onrender.com` adresi zaten herkesin erişebileceği, çalışan, kalıcı bir adres. Daha sade görünsün istersen aşağıdaki adımları izleyebilirsin:

1. Bir domain satıcısından (örnek: Namecheap, GoDaddy, Turhost) istediğin alan adını satın al (örnek: `kelimedefterim.com`).
2. Render panelinde web servisinin **Settings** sekmesine git → **Custom Domains** bölümü → **Add Custom Domain** → domainini yaz (örnek: `kelimedefterim.com` ve `www.kelimedefterim.com`).
3. Render sana birkaç DNS kaydı verecek (genelde bir **CNAME** ve/veya **A kaydı**). Bunları not al.
4. Domain satıcının panelinde (Namecheap/GoDaddy vs.) **DNS ayarları / DNS Management** bölümüne git.
5. Render'ın verdiği kayıtları oraya ekle (satıcının arayüzünde "Add New Record" gibi bir buton olur; Tip, Host, Value alanlarını Render'ın verdiği bilgilerle doldur).
6. DNS değişikliklerinin yayılması 10 dakika - 24 saat sürebilir. Render, domain doğrulandığında otomatik olarak ücretsiz bir SSL sertifikası (https kilidi) kurar.

Bu adımda satıcı arayüzleri birbirinden farklı göründüğü için, hangi satıcıyı seçtiğini söylersen sana o satıcıya özel ekran görüntülü adımları da çıkarabilirim.

---

## Sonraki Kelimeleri Ekleme (Sayfa2 dolduğunda)

Yeni kelimeler eklemek istediğinde excel dosyasını tekrar bana gönder, ben `data/words.json` dosyasını güncelleyip sana yeni dosyayı veririm. Sen de:
1. GitHub'da `data/words.json` dosyasını yeni haliyle değiştirirsin (dosyaya tıkla → kalem ikonu → içeriği değiştir → Commit),
2. Render Shell'den şunu çalıştırırsın: `node -e "require('./scripts/setup-db')"` — ama bu sadece tablo boşsa kelime ekler, mevcut ilerlemeni bozmaz. İstersen bu adımı senin için otomatikleştiren ayrı bir "kelime ekle" komutu da hazırlayabilirim.

## Bir Sorun Olursa

Render'daki web servisinin **"Logs"** sekmesinde hata mesajlarını görebilirsin. Oradaki kırmızı satırı bana yapıştır, birlikte çözeriz.
