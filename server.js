require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('./db/pool');
const { ensureDatabaseReady } = require('./db/setup');

const authRoutes = require('./routes/auth');
const wordsRoutes = require('./routes/words');
const progressRoutes = require('./routes/progress');
const decksRoutes = require('./routes/decks');

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

// Statik dosyalar (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await ensureDatabaseReady();
    console.log('[db] Veritabanı hazır.');
  } catch (err) {
    console.error('[db] Veritabanı kurulurken hata oluştu (sunucu yine de başlatılıyor):', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
  });
}

start();
