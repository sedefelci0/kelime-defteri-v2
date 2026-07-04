const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

pool.query(`CREATE TABLE IF NOT EXISTS daily_challenges (
  id          SERIAL PRIMARY KEY,
  class_grade TEXT NOT NULL,
  date        DATE NOT NULL,
  question_ids INTEGER[] NOT NULL,
  UNIQUE (class_grade, date)
)`).catch((e) => console.error('[db] daily_challenges:', e.message));

pool.query(`CREATE TABLE IF NOT EXISTS daily_challenge_results (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
  challenge_id     INTEGER REFERENCES daily_challenges(id) ON DELETE CASCADE,
  score            INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, challenge_id)
)`).catch((e) => console.error('[db] daily_challenge_results:', e.message));

pool.query(`CREATE TABLE IF NOT EXISTS daily_medals (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  class_grade TEXT NOT NULL,
  medal_type  TEXT NOT NULL,
  UNIQUE (user_id, date, class_grade)
)`).catch((e) => console.error('[db] daily_medals:', e.message));

function todayIstanbul() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

async function getOrCreateChallenge(classGrade) {
  const today = todayIstanbul();
  const { rows: existing } = await pool.query(
    'SELECT id, question_ids FROM daily_challenges WHERE class_grade = $1 AND date = $2',
    [classGrade, today]
  );
  if (existing.length) return existing[0];

  const deckSlug = `${classGrade}-sinif`;
  let { rows: questions } = await pool.query(
    `SELECT id FROM exam_questions
     WHERE (restrict_deck_slug = $1 OR restrict_deck_slug IS NULL)
     ORDER BY RANDOM() LIMIT 5`,
    [deckSlug]
  );
  if (questions.length < 5) {
    const { rows: all } = await pool.query(
      'SELECT id FROM exam_questions ORDER BY RANDOM() LIMIT 5'
    );
    questions = all;
  }
  if (!questions.length) return null;

  const { rows: created } = await pool.query(
    `INSERT INTO daily_challenges (class_grade, date, question_ids)
     VALUES ($1, $2, $3)
     ON CONFLICT (class_grade, date) DO UPDATE SET question_ids = EXCLUDED.question_ids
     RETURNING id, question_ids`,
    [classGrade, today, questions.map((q) => q.id)]
  );
  return created[0];
}

// GET /api/challenge/today
router.get('/today', requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query(
      'SELECT class_name FROM users WHERE id = $1',
      [req.session.userId]
    );
    const className = userRows[0]?.class_name;
    if (!className || !/^[5-8]-[A-F]$/.test(className)) {
      return res.status(400).json({ error: 'Gunluk mucadele sadece 5-8. sinif ogrencilerine acik.' });
    }

    const classGrade = className[0];
    const today = todayIstanbul();

    const { rows: played } = await pool.query(
      `SELECT dcr.score, dcr.duration_seconds, dcr.completed_at
       FROM daily_challenge_results dcr
       JOIN daily_challenges dc ON dc.id = dcr.challenge_id
       WHERE dcr.user_id = $1 AND dc.class_grade = $2 AND dc.date = $3`,
      [req.session.userId, classGrade, today]
    );
    if (played.length) {
      return res.json({
        alreadyPlayed: true,
        result: { score: played[0].score, durationSeconds: played[0].duration_seconds, completedAt: played[0].completed_at },
      });
    }

    const challenge = await getOrCreateChallenge(classGrade);
    if (!challenge) return res.status(503).json({ error: 'Bugun icin soru bulunamadi.' });

    const { rows: questions } = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, option_e, correct_option, explanation
       FROM exam_questions WHERE id = ANY($1)
       ORDER BY array_position($1, id)`,
      [challenge.question_ids]
    );

    res.json({
      alreadyPlayed: false,
      challengeId: challenge.id,
      classGrade,
      date: today,
      totalSeconds: 180,
      questions: questions.map((q) => ({
        id: q.id,
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        optionE: q.option_e,
        correctOption: q.correct_option,
        explanation: q.explanation,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Mucadele yuklenirken hata olustu.' });
  }
});

// POST /api/challenge/submit
router.post('/submit', requireAuth, async (req, res) => {
  try {
    const { challengeId, score, durationSeconds } = req.body || {};
    if (!challengeId || typeof score !== 'number' || typeof durationSeconds !== 'number') {
      return res.status(400).json({ error: 'Eksik parametreler.' });
    }

    const { rows: userRows } = await pool.query('SELECT class_name FROM users WHERE id = $1', [req.session.userId]);
    const classGrade = userRows[0]?.class_name?.[0];
    const today = todayIstanbul();

    const { rows: cRows } = await pool.query(
      'SELECT id FROM daily_challenges WHERE id = $1 AND class_grade = $2 AND date = $3',
      [challengeId, classGrade, today]
    );
    if (!cRows.length) return res.status(400).json({ error: 'Gecersiz mucadele.' });

    const safeScore = Math.max(0, Math.min(5, Math.round(score)));
    const safeDur   = Math.max(0, Math.min(180, Math.round(durationSeconds)));

    try {
      await pool.query(
        `INSERT INTO daily_challenge_results (user_id, challenge_id, score, duration_seconds)
         VALUES ($1, $2, $3, $4)`,
        [req.session.userId, challengeId, safeScore, safeDur]
      );
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Bu mucadeleye zaten katildin.' });
      throw e;
    }

    const { rows: rankRows } = await pool.query(
      `SELECT COUNT(*)::int + 1 AS rank
       FROM daily_challenge_results dcr
       WHERE dcr.challenge_id = $1
         AND (dcr.score > $2 OR (dcr.score = $2 AND dcr.duration_seconds < $3))
         AND dcr.user_id != $4`,
      [challengeId, safeScore, safeDur, req.session.userId]
    );

    res.json({ ok: true, score: safeScore, rank: rankRows[0].rank });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sonuc kaydedilirken hata olustu.' });
  }
});

// GET /api/challenge/leaderboard
router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query('SELECT class_name FROM users WHERE id = $1', [req.session.userId]);
    const classGrade = userRows[0]?.class_name?.[0];
    const today = todayIstanbul();

    if (!classGrade || !/^[5-8]$/.test(classGrade)) return res.json([]);

    const { rows } = await pool.query(
      `SELECT u.display_name, u.class_name, dcr.score, dcr.duration_seconds
       FROM daily_challenge_results dcr
       JOIN daily_challenges dc ON dc.id = dcr.challenge_id
       JOIN users u ON u.id = dcr.user_id
       WHERE dc.class_grade = $1 AND dc.date = $2
       ORDER BY dcr.score DESC, dcr.duration_seconds ASC, dcr.completed_at ASC
       LIMIT 20`,
      [classGrade, today]
    );

    res.json(rows.map((r, i) => ({
      rank: i + 1,
      displayName: r.display_name,
      className: r.class_name,
      score: r.score,
      durationSeconds: r.duration_seconds,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Siralama yuklenirken hata olustu.' });
  }
});

async function awardDailyMedals() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
  console.log('[cron] Gunluk mucadele madalyalari hesaplaniyor...');
  const medalTypes = ['gold', 'silver', 'bronze'];

  for (const grade of ['5', '6', '7', '8']) {
    try {
      const { rows } = await pool.query(
        `SELECT dcr.user_id
         FROM daily_challenge_results dcr
         JOIN daily_challenges dc ON dc.id = dcr.challenge_id
         WHERE dc.class_grade = $1 AND dc.date = $2
         ORDER BY dcr.score DESC, dcr.duration_seconds ASC, dcr.completed_at ASC
         LIMIT 3`,
        [grade, today]
      );
      for (let i = 0; i < rows.length; i++) {
        await pool.query(
          `INSERT INTO daily_medals (user_id, date, class_grade, medal_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, date, class_grade) DO NOTHING`,
          [rows[i].user_id, today, grade, medalTypes[i]]
        ).catch(() => {});
      }
    } catch (e) {
      console.error(`[cron] ${grade}. sinif mucadele madalya hatasi:`, e.message);
    }
  }
}

module.exports = { router, awardDailyMedals };
