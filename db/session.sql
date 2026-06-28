-- connect-pg-simple paketinin resmi session tablosu şeması
-- Kaynak: https://github.com/voxpelli/node-connect-pg-simple

CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
)
WITH (OIDS=FALSE);

-- Birincil anahtar zaten varsa tekrar eklemeye çalışma (sunucu her açılışta bu dosyayı
-- çalıştırdığı için, bu kontrol olmadan ikinci açılışta hata verirdi).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
  ) THEN
    ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
