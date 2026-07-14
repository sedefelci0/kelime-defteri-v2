require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('./db/pool');
const { ensureDatabaseReady } = require('./db/setup');

let cron;
try { cron = require('node-cron'); } catch (_) { console.warn('[cron] node-cron yuklenemedi, gunluk birinci ozelligi devre disi.'); }

const authRoutes = require('./routes/auth');
const wordsRoutes = require('./routes/words');
const progressRoutes = require('./routes/progress');
const decksRoutes = require('./routes/decks');
const notesRoutes = require('./routes/notes');
const topicsRoutes = require('./routes/topics');
const adminRoutes = require('./routes/admin');
const { router: challengeRoutes, awardDailyMedals } = require('./routes/challenge');

const app = express();
app.set('trust proxy', 1);

app.use(express.json());

const sessionStore = new pgSession({ pool, tableName: 'session', createTableIfMissing: true });
sessionStore.on('error', (err) => {
  console.error('Oturum deposunda hata (göz ardı edildi, sunucu çalışmaya devam ediyor):', err.message);
});

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 gün
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/words', wordsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/decks', decksRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/topics', topicsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/challenge', challengeRoutes);

// Statik dosyalar (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

async function setupDailyChampions() {
  await pool.query(`CREATE TABLE IF NOT EXISTS daily_champions (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    class_grade TEXT    NOT NULL,
    date        DATE    NOT NULL,
    medal_type  TEXT    NOT NULL DEFAULT 'gold',
    UNIQUE (class_grade, date, medal_type)
  )`).catch((e) => console.error('[db] daily_champions hatasi:', e.message));
}

async function runDailyChampion() {
  console.log('[cron] Gunluk birinci hesaplaniyor...');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

  for (const grade of ['5', '6', '7', '8']) {
    try {
      const { rows } = await pool.query(
        `SELECT u.id, SUM(ds.correct_count)::int AS correct
         FROM daily_stats ds
         JOIN users u ON u.id = ds.user_id
         WHERE ds.date = $1
           AND u.class_name ~ ('^' || $2 || '-[A-F]$')
           AND u.is_teacher = FALSE
         GROUP BY u.id
         ORDER BY correct DESC
         LIMIT 3`,
        [today, grade]
      );
      if (!rows.length) continue;

      const medals = ['gold', 'silver', 'bronze'];
      for (let i = 0; i < rows.length; i++) {
        await pool.query(
          `INSERT INTO daily_champions (user_id, class_grade, date, medal_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (class_grade, date, medal_type) DO NOTHING`,
          [rows[i].id, grade, today, medals[i]]
        );
      }
      console.log(`[cron] ${grade}. sinif birincisi islendi.`);
    } catch (e) {
      console.error(`[cron] ${grade}. sinif hatasi:`, e.message);
    }
  }
}

async function start() {
  try {
    await ensureDatabaseReady();
    console.log('[db] Veritabani hazir.');
  } catch (err) {
    console.error('[db] Veritabani kurulurken hata olustu (sunucu yine de baslatiliyor):', err.message);
  }

  await setupDailyChampions();

  if (cron) {
    cron.schedule('59 23 * * *', async () => {
      await runDailyChampion();
      await awardDailyMedals();
    }, { timezone: 'Europe/Istanbul' });
    console.log('[cron] 23:59 Istanbul zamanlanicisi aktif (gunluk birinci + mucadele madalyalari).');
  }

  app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde calisiyor`);
  });
}

start();
