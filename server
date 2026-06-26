require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('./db/pool');

const authRoutes = require('./routes/auth');
const wordsRoutes = require('./routes/words');
const progressRoutes = require('./routes/progress');

const app = express();
app.set('trust proxy', 1);

app.use(express.json());

app.use(
  session({
    store: new pgSession({ pool, tableName: 'session' }),
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

// Statik dosyalar (HTML/CSS/JS)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
