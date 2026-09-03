const express = require('express');
const crypto = require('crypto');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const adminRouter = express.Router();

function requireOwner(req, res, next) {
  if (req.session.ownerUnlocked !== true) {
    return res.status(403).json({ error: 'Bu işlem için öğretmen girişi gerekiyor.' });
  }
  next();
}

// Herhangi bir sınıf/deste/ünite kombinasyonu için çalışan, zaman penceresi
// tabanlı yarışma quiz'i. Sorular sabit bir havuzdan değil, o deste+ünitenin
// `words` tablosundan anlık üretilir (bkz. generateQuestions) — bu yüzden
// yeni bir sınıf/ünite eklendiğinde (db/decks-config.js) bu özellik otomatik
// olarak onunla da çalışır, kod değişikliği gerekmez.

pool.query(`CREATE TABLE IF NOT EXISTS quiz_windows (
  id                 SERIAL PRIMARY KEY,
  deck_slug          TEXT NOT NULL,
  unit               INTEGER NOT NULL,
  class_name         TEXT NOT NULL,
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ NOT NULL,
  duration_seconds   INTEGER NOT NULL DEFAULT 300,
  question_count     INTEGER NOT NULL DEFAULT 4,
  allow_auto_match   BOOLEAN NOT NULL DEFAULT TRUE,
  allow_manual_match BOOLEAN NOT NULL DEFAULT TRUE,
  allow_room_match   BOOLEAN NOT NULL DEFAULT TRUE,
  questions          JSONB,
  created_by         INTEGER REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
)`).catch((e) => console.error('[db] quiz_windows:', e.message));

pool.query(`CREATE TABLE IF NOT EXISTS quiz_attempts (
  id            SERIAL PRIMARY KEY,
  window_id     INTEGER NOT NULL REFERENCES quiz_windows(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at   TIMESTAMPTZ NOT NULL,
  answers       JSONB NOT NULL DEFAULT '[]',
  correct_count INTEGER,
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'in_progress'
                CHECK (status IN ('in_progress','finished','expired')),
  match_id      INTEGER,
  UNIQUE (window_id, user_id)
)`).catch((e) => console.error('[db] quiz_attempts:', e.message));

pool.query(`CREATE TABLE IF NOT EXISTS quiz_matches (
  id                 SERIAL PRIMARY KEY,
  window_id          INTEGER NOT NULL REFERENCES quiz_windows(id) ON DELETE CASCADE,
  attempt1_id        INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  attempt2_id        INTEGER REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  match_method       TEXT NOT NULL CHECK (match_method IN ('auto','manual','room')),
  room_code          TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','active','resolved')),
  winner_attempt_id  INTEGER REFERENCES quiz_attempts(id),
  is_tie             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ
)`).catch((e) => console.error('[db] quiz_matches:', e.message));

pool.query(`ALTER TABLE quiz_attempts DROP CONSTRAINT IF EXISTS quiz_attempts_match_fk`)
  .then(() => pool.query(
    `ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_match_fk
     FOREIGN KEY (match_id) REFERENCES quiz_matches(id) ON DELETE SET NULL`
  ))
  .catch((e) => console.error('[db] quiz_attempts_match_fk:', e.message));

// ---------------------------------------------------------------------------
// Yardımcı fonksiyonlar
// ---------------------------------------------------------------------------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// O deste+ünitedeki, birbirinden farklı Türkçe anlamlara sahip kelimeleri
// döner (aynı anlama sahip birden fazla kelime varsa çeldirici olarak yanlışlıkla
// "doğru" görünmesin diye normalize edilip tekilleştirilir).
async function getUsableWordPool(deckSlug, unit) {
  const { rows } = await pool.query(
    `SELECT w.id, w.english, w.turkish_meaning
     FROM words w
     JOIN decks d ON d.id = w.deck_id
     WHERE d.slug = $1 AND w.unit = $2
       AND w.turkish_meaning IS NOT NULL AND trim(w.turkish_meaning) != ''
       AND w.english IS NOT NULL AND trim(w.english) != ''`,
    [deckSlug, unit]
  );
  const seen = new Set();
  const pool_ = [];
  for (const w of rows) {
    const norm = w.turkish_meaning.trim().toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    pool_.push(w);
  }
  return pool_;
}

async function generateQuestions(deckSlug, unit, count) {
  const wordPool = await getUsableWordPool(deckSlug, unit);
  if (wordPool.length < Math.max(count, 4)) return null;

  const questionWords = shuffle(wordPool).slice(0, count);
  return questionWords.map((qw) => {
    const distractorPool = wordPool.filter((w) => w.id !== qw.id);
    const distractors = shuffle(distractorPool).slice(0, 3).map((d) => d.turkish_meaning);
    const options = shuffle([qw.turkish_meaning, ...distractors]);
    return {
      wordId: qw.id,
      prompt: qw.english,
      options,
      correctIndex: options.indexOf(qw.turkish_meaning),
    };
  });
}

function publicQuestions(questions) {
  return questions.map((q) => ({ prompt: q.prompt, options: q.options }));
}

function gradeAnswers(questions, answers) {
  let correct = 0;
  questions.forEach((q, i) => {
    if (Number.isInteger(answers[i]) && answers[i] === q.correctIndex) correct++;
  });
  return correct;
}

function durationOf(attempt) {
  if (!attempt.finished_at) return null;
  return Math.max(0, Math.round((new Date(attempt.finished_at) - new Date(attempt.started_at)) / 1000));
}

// a ve b: { id, correct_count, started_at, finished_at }. Doğru sayısı yüksek
// olan kazanır; eşitse süresi kısa olan kazanır; ikisi de eşitse berabere.
function decideWinner(a, b) {
  if (a.correct_count !== b.correct_count) {
    return { winnerAttemptId: a.correct_count > b.correct_count ? a.id : b.id, isTie: false };
  }
  const durA = durationOf(a);
  const durB = durationOf(b);
  if (durA === durB) return { winnerAttemptId: null, isTie: true };
  return { winnerAttemptId: durA < durB ? a.id : b.id, isTie: false };
}

// Bu penceredeki, süresi geçmiş ama hâlâ 'in_progress' görünen denemeleri
// mevcut cevaplarıyla puanlayıp kapatır. Ayrı bir cron gerektirmez — her
// endpoint çağrısında bu penceredeki "sahipsiz kalmış" denemeleri temizler,
// böylece rakibi bekleyen bir öğrenci onları otomatik olarak yakalayabilir.
async function finalizeExpiredInWindow(client, windowId) {
  const { rows: expired } = await client.query(
    `SELECT * FROM quiz_attempts
     WHERE window_id = $1 AND status = 'in_progress' AND deadline_at < now()
     FOR UPDATE SKIP LOCKED`,
    [windowId]
  );
  for (const attempt of expired) {
    await finishAttempt(client, windowId, attempt, 'expired');
  }
}

async function finishAttempt(client, windowId, attempt, status) {
  const { rows: winRows } = await client.query('SELECT questions, ends_at FROM quiz_windows WHERE id = $1', [windowId]);
  const questions = winRows[0].questions || [];
  const correctCount = gradeAnswers(questions, attempt.answers || []);

  const { rows: updated } = await client.query(
    `UPDATE quiz_attempts SET correct_count = $1, finished_at = now(), status = $2
     WHERE id = $3 RETURNING *`,
    [correctCount, status, attempt.id]
  );
  const finished = { ...updated[0], ends_at: winRows[0].ends_at };
  const match = await tryAutoMatch(client, windowId, finished);
  if (match) finished.match_id = match.id;
  return finished;
}

// Aynı pencerede, henüz kimseyle eşleşmemiş başka bitmiş bir deneme varsa
// otomatik eşleştirir. Bulamazsa deneme eşleşmemiş kalır — bir sonraki
// öğrenci bitirdiğinde onun çağrısı bunu bulup eşleştirecektir.
async function tryAutoMatch(client, windowId, selfAttempt) {
  const { rows: winRows } = await client.query('SELECT allow_auto_match FROM quiz_windows WHERE id = $1', [windowId]);
  if (!winRows[0] || !winRows[0].allow_auto_match) return null;
  if (selfAttempt.match_id) return null;

  const { rows: candidates } = await client.query(
    `SELECT * FROM quiz_attempts
     WHERE window_id = $1 AND id != $2 AND match_id IS NULL AND status IN ('finished','expired')
     ORDER BY finished_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
    [windowId, selfAttempt.id]
  );
  if (!candidates.length) return null;
  const other = candidates[0];

  const { winnerAttemptId, isTie } = decideWinner(selfAttempt, other);
  const { rows: matchRows } = await client.query(
    `INSERT INTO quiz_matches (window_id, attempt1_id, attempt2_id, match_method, status, winner_attempt_id, is_tie, resolved_at)
     VALUES ($1, $2, $3, 'auto', 'resolved', $4, $5, now()) RETURNING *`,
    [windowId, selfAttempt.id, other.id, winnerAttemptId, isTie]
  );
  const match = matchRows[0];
  await client.query('UPDATE quiz_attempts SET match_id = $1 WHERE id IN ($2, $3)', [match.id, selfAttempt.id, other.id]);
  return match;
}

async function getUserClassName(userId) {
  const { rows } = await pool.query('SELECT class_name FROM users WHERE id = $1', [userId]);
  return rows[0]?.class_name || null;
}

async function loadAttemptWithWindow(client, attemptId) {
  const { rows } = await client.query(
    `SELECT a.*, w.questions AS window_questions, w.question_count, w.ends_at, w.class_name, w.deck_slug, w.unit
     FROM quiz_attempts a JOIN quiz_windows w ON w.id = a.window_id
     WHERE a.id = $1`,
    [attemptId]
  );
  return rows[0] || null;
}

async function matchSummaryFor(client, attempt) {
  if (!attempt.match_id) return { status: 'waiting', opponent: null, result: null };
  const { rows } = await client.query(
    `SELECT m.*,
            a1.user_id AS a1_user_id, a1.correct_count AS a1_correct, a1.started_at AS a1_started, a1.finished_at AS a1_finished,
            a2.user_id AS a2_user_id, a2.correct_count AS a2_correct, a2.started_at AS a2_started, a2.finished_at AS a2_finished,
            u1.display_name AS a1_name, u2.display_name AS a2_name
     FROM quiz_matches m
     JOIN quiz_attempts a1 ON a1.id = m.attempt1_id
     LEFT JOIN quiz_attempts a2 ON a2.id = m.attempt2_id
     JOIN users u1 ON u1.id = a1.user_id
     LEFT JOIN users u2 ON u2.id = a2.user_id
     WHERE m.id = $1`,
    [attempt.match_id]
  );
  const m = rows[0];
  if (!m) return { status: 'waiting', opponent: null, result: null };

  const selfIsA1 = m.attempt1_id === attempt.id;
  const oppUserId = selfIsA1 ? m.a2_user_id : m.a1_user_id;
  if (m.status !== 'resolved' || !oppUserId) {
    return { status: m.status === 'pending' ? 'waiting' : 'active', opponent: null, result: null, roomCode: m.room_code };
  }

  const opponent = {
    displayName: selfIsA1 ? m.a2_name : m.a1_name,
    correctCount: selfIsA1 ? m.a2_correct : m.a1_correct,
    durationSeconds: durationOf({ started_at: selfIsA1 ? m.a2_started : m.a1_started, finished_at: selfIsA1 ? m.a2_finished : m.a1_finished }),
  };
  let result = 'tie';
  if (!m.is_tie) result = m.winner_attempt_id === attempt.id ? 'win' : 'lose';

  return { status: 'resolved', opponent, result, method: m.match_method };
}

function attemptResponse(attempt, matchSummary, windowEndsAt) {
  return {
    attemptId: attempt.id,
    status: attempt.status,
    correctCount: attempt.correct_count,
    durationSeconds: durationOf(attempt),
    deadlineAt: attempt.deadline_at,
    windowEndsAt: windowEndsAt || attempt.ends_at || null,
    match: matchSummary,
  };
}

// ---------------------------------------------------------------------------
// Öğrenci endpoint'leri
// ---------------------------------------------------------------------------

// GET /api/quiz/active?deckSlug=&unit= — öğrencinin kendi sınıfına açık,
// şu an aktif bir yarışma penceresi var mı?
router.get('/active', requireAuth, async (req, res) => {
  try {
    const { deckSlug, unit } = req.query;
    const unitNum = Number(unit);
    if (!deckSlug || !Number.isInteger(unitNum)) return res.status(400).json({ error: 'Geçersiz parametreler.' });

    const className = await getUserClassName(req.session.userId);
    if (!className) return res.json({ active: false });

    const { rows } = await pool.query(
      `SELECT id, ends_at FROM quiz_windows
       WHERE deck_slug = $1 AND unit = $2 AND class_name = $3
         AND starts_at <= now() AND ends_at >= now()
       ORDER BY starts_at DESC LIMIT 1`,
      [deckSlug, unitNum, className]
    );
    if (!rows.length) return res.json({ active: false });

    const window_ = rows[0];
    const { rows: attemptRows } = await pool.query(
      'SELECT id FROM quiz_attempts WHERE window_id = $1 AND user_id = $2',
      [window_.id, req.session.userId]
    );
    res.json({ active: true, windowId: window_.id, endsAt: window_.ends_at, alreadyAttempted: attemptRows.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Yarışma testi bilgisi alınırken hata oluştu.' });
  }
});

// POST /api/quiz/attempts { windowId } — teste başlar (veya yarım kalmış
// denemeyi devam ettirir).
router.post('/attempts', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const windowId = Number(req.body?.windowId);
    if (!Number.isInteger(windowId)) return res.status(400).json({ error: 'Geçersiz pencere.' });

    await client.query('BEGIN');

    const { rows: winRows } = await client.query('SELECT * FROM quiz_windows WHERE id = $1 FOR UPDATE', [windowId]);
    const window_ = winRows[0];
    if (!window_) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pencere bulunamadı.' }); }

    const className = await getUserClassName(req.session.userId);
    if (className !== window_.class_name) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Bu yarışma testi senin sınıfına açık değil.' });
    }

    const now = new Date();
    if (now < new Date(window_.starts_at) || now > new Date(window_.ends_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bu yarışma testinin zamanı değil.' });
    }

    // Zaten bir denemesi varsa (sayfa yenilendi/kapandı) onu döndür.
    const { rows: existingRows } = await client.query(
      'SELECT * FROM quiz_attempts WHERE window_id = $1 AND user_id = $2',
      [windowId, req.session.userId]
    );
    if (existingRows.length) {
      await finalizeExpiredInWindow(client, windowId);
      const { rows: refreshed } = await client.query('SELECT * FROM quiz_attempts WHERE id = $1', [existingRows[0].id]);
      const attempt = refreshed[0];
      await client.query('COMMIT');
      const matchSummary = attempt.status === 'in_progress' ? null : await matchSummaryFor(pool, attempt);
      return res.json({
        ...attemptResponse(attempt, matchSummary, window_.ends_at),
        questions: publicQuestions(window_.questions || []),
        answers: attempt.answers,
      });
    }

    let questions = window_.questions;
    if (!questions) {
      questions = await generateQuestions(window_.deck_slug, window_.unit, window_.question_count);
      if (!questions) {
        await client.query('ROLLBACK');
        return res.status(503).json({ error: 'Bu ünite için yeterli kelime yok, yarışma testi oluşturulamadı.' });
      }
      await client.query('UPDATE quiz_windows SET questions = $1 WHERE id = $2', [JSON.stringify(questions), windowId]);
    }

    const deadlineAt = new Date(Math.min(
      now.getTime() + window_.duration_seconds * 1000,
      new Date(window_.ends_at).getTime()
    ));

    const { rows: created } = await client.query(
      `INSERT INTO quiz_attempts (window_id, user_id, deadline_at) VALUES ($1, $2, $3) RETURNING *`,
      [windowId, req.session.userId, deadlineAt]
    );

    await client.query('COMMIT');
    res.json({
      ...attemptResponse(created[0], null, window_.ends_at),
      questions: publicQuestions(questions),
      answers: created[0].answers,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Test başlatılırken hata oluştu.' });
  } finally {
    client.release();
  }
});

// GET /api/quiz/attempts/:id — ilerleme/sonuç durumunu döner (polling için).
router.get('/attempts/:id', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz deneme id.' });

    await client.query('BEGIN');
    let attempt = await loadAttemptWithWindow(client, id);
    if (!attempt || attempt.user_id !== req.session.userId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Deneme bulunamadı.' });
    }

    await finalizeExpiredInWindow(client, attempt.window_id);
    attempt = await loadAttemptWithWindow(client, id);

    if (attempt.status !== 'in_progress' && !attempt.match_id) {
      await tryAutoMatch(client, attempt.window_id, attempt);
      attempt = await loadAttemptWithWindow(client, id);
    }

    const matchSummary = attempt.status === 'in_progress' ? null : await matchSummaryFor(client, attempt);
    await client.query('COMMIT');

    res.json({
      ...attemptResponse(attempt, matchSummary),
      questions: publicQuestions(attempt.window_questions || []),
      answers: attempt.answers,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Deneme bilgisi alınırken hata oluştu.' });
  } finally {
    client.release();
  }
});

// POST /api/quiz/attempts/:id/answer { questionIndex, selectedIndex }
router.post('/attempts/:id/answer', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const { questionIndex, selectedIndex } = req.body || {};
    if (!Number.isInteger(id) || !Number.isInteger(questionIndex) || !Number.isInteger(selectedIndex)) {
      return res.status(400).json({ error: 'Geçersiz parametreler.' });
    }

    await client.query('BEGIN');
    let attempt = await loadAttemptWithWindow(client, id);
    if (!attempt || attempt.user_id !== req.session.userId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Deneme bulunamadı.' });
    }

    await finalizeExpiredInWindow(client, attempt.window_id);
    attempt = await loadAttemptWithWindow(client, id);

    if (attempt.status !== 'in_progress') {
      const matchSummary = await matchSummaryFor(client, attempt);
      await client.query('COMMIT');
      return res.status(409).json({ error: 'Bu deneme zaten sona erdi.', ...attemptResponse(attempt, matchSummary) });
    }

    const questions = attempt.window_questions || [];
    if (questionIndex < 0 || questionIndex >= questions.length || selectedIndex < 0 || selectedIndex >= questions[questionIndex].options.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Geçersiz soru/şık.' });
    }

    const answers = Array.isArray(attempt.answers) ? attempt.answers.slice() : [];
    while (answers.length < questions.length) answers.push(null);
    answers[questionIndex] = selectedIndex;

    await client.query('UPDATE quiz_attempts SET answers = $1 WHERE id = $2', [JSON.stringify(answers), id]);

    const isCorrect = selectedIndex === questions[questionIndex].correctIndex;
    const allAnswered = answers.every((a) => Number.isInteger(a));

    let finalAttempt = { ...attempt, answers };
    let matchSummary = null;
    if (allAnswered) {
      finalAttempt = await finishAttempt(client, attempt.window_id, finalAttempt, 'finished');
      matchSummary = await matchSummaryFor(client, finalAttempt);
    }

    await client.query('COMMIT');
    res.json({ isCorrect, correctIndex: questions[questionIndex].correctIndex, ...attemptResponse(finalAttempt, matchSummary) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Cevap kaydedilirken hata oluştu.' });
  } finally {
    client.release();
  }
});

// POST /api/quiz/rooms { windowId } — oda açar, kod döner.
router.post('/rooms', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const windowId = Number(req.body?.windowId);
    if (!Number.isInteger(windowId)) return res.status(400).json({ error: 'Geçersiz pencere.' });

    await client.query('BEGIN');
    const { rows: winRows } = await client.query('SELECT * FROM quiz_windows WHERE id = $1 FOR UPDATE', [windowId]);
    const window_ = winRows[0];
    if (!window_ || !window_.allow_room_match) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bu pencerede oda kodu ile katılım kapalı.' });
    }

    const className = await getUserClassName(req.session.userId);
    const now = new Date();
    if (className !== window_.class_name || now < new Date(window_.starts_at) || now > new Date(window_.ends_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bu yarışma testine şu an katılamazsın.' });
    }

    const { rows: existingRows } = await client.query(
      'SELECT * FROM quiz_attempts WHERE window_id = $1 AND user_id = $2',
      [windowId, req.session.userId]
    );
    if (existingRows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Bu yarışma testine zaten katıldın.' });
    }

    let questions = window_.questions;
    if (!questions) {
      questions = await generateQuestions(window_.deck_slug, window_.unit, window_.question_count);
      if (!questions) {
        await client.query('ROLLBACK');
        return res.status(503).json({ error: 'Bu ünite için yeterli kelime yok.' });
      }
      await client.query('UPDATE quiz_windows SET questions = $1 WHERE id = $2', [JSON.stringify(questions), windowId]);
    }

    const deadlineAt = new Date(Math.min(now.getTime() + window_.duration_seconds * 1000, new Date(window_.ends_at).getTime()));
    const { rows: attemptRows } = await client.query(
      `INSERT INTO quiz_attempts (window_id, user_id, deadline_at) VALUES ($1, $2, $3) RETURNING *`,
      [windowId, req.session.userId, deadlineAt]
    );
    const attempt = attemptRows[0];

    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let roomCode;
    for (let tries = 0; tries < 10; tries++) {
      const candidate = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
      const { rows: clash } = await client.query(
        `SELECT 1 FROM quiz_matches WHERE room_code = $1 AND status != 'resolved'`, [candidate]
      );
      if (!clash.length) { roomCode = candidate; break; }
    }
    if (!roomCode) { await client.query('ROLLBACK'); return res.status(500).json({ error: 'Oda kodu üretilemedi, tekrar dene.' }); }

    const { rows: matchRows } = await client.query(
      `INSERT INTO quiz_matches (window_id, attempt1_id, match_method, status, room_code)
       VALUES ($1, $2, 'room', 'pending', $3) RETURNING *`,
      [windowId, attempt.id, roomCode]
    );
    await client.query('UPDATE quiz_attempts SET match_id = $1 WHERE id = $2', [matchRows[0].id, attempt.id]);

    await client.query('COMMIT');
    res.json({
      ...attemptResponse({ ...attempt, match_id: matchRows[0].id }, { status: 'waiting', opponent: null, result: null, roomCode }, window_.ends_at),
      questions: publicQuestions(questions),
      answers: attempt.answers,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Oda açılırken hata oluştu.' });
  } finally {
    client.release();
  }
});

// POST /api/quiz/rooms/:code/join — oda koduyla ikinci öğrenci katılır.
router.post('/rooms/:code/join', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    await client.query('BEGIN');

    const { rows: matchRows } = await client.query(
      `SELECT * FROM quiz_matches WHERE room_code = $1 AND status = 'pending' FOR UPDATE`, [code]
    );
    if (!matchRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Geçersiz veya süresi dolmuş oda kodu.' });
    }
    const match = matchRows[0];

    const { rows: winRows } = await client.query('SELECT * FROM quiz_windows WHERE id = $1', [match.window_id]);
    const window_ = winRows[0];

    const { rows: hostRows } = await client.query('SELECT user_id FROM quiz_attempts WHERE id = $1', [match.attempt1_id]);
    if (hostRows[0]?.user_id === req.session.userId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Kendi odana katılamazsın.' });
    }

    const className = await getUserClassName(req.session.userId);
    const now = new Date();
    if (className !== window_.class_name || now < new Date(window_.starts_at) || now > new Date(window_.ends_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Bu yarışma testine şu an katılamazsın.' });
    }

    const { rows: existingRows } = await client.query(
      'SELECT * FROM quiz_attempts WHERE window_id = $1 AND user_id = $2',
      [match.window_id, req.session.userId]
    );
    if (existingRows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Bu yarışma testine zaten katıldın.' });
    }

    const deadlineAt = new Date(Math.min(now.getTime() + window_.duration_seconds * 1000, new Date(window_.ends_at).getTime()));
    const { rows: attemptRows } = await client.query(
      `INSERT INTO quiz_attempts (window_id, user_id, deadline_at, match_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [match.window_id, req.session.userId, deadlineAt, match.id]
    );
    const attempt = attemptRows[0];

    await client.query(
      `UPDATE quiz_matches SET attempt2_id = $1, status = 'active' WHERE id = $2`,
      [attempt.id, match.id]
    );

    await client.query('COMMIT');
    res.json({
      ...attemptResponse(attempt, { status: 'active', opponent: null, result: null }, window_.ends_at),
      questions: publicQuestions(window_.questions || []),
      answers: attempt.answers,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Odaya katılırken hata oluştu.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------------------------
// Öğretmen (admin) endpoint'leri — /api/admin/quiz altında mount edilir.
// ---------------------------------------------------------------------------

// POST /api/admin/quiz/windows — yeni test penceresi oluştur.
adminRouter.post('/windows', requireAuth, requireOwner, async (req, res) => {
  try {
    const { deckSlug, unit, className, startsAt, endsAt, durationSeconds, questionCount, allowAutoMatch, allowManualMatch, allowRoomMatch } = req.body || {};
    const unitNum = Number(unit);
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!deckSlug || !Number.isInteger(unitNum) || !className) {
      return res.status(400).json({ error: 'Deste, ünite ve sınıf zorunlu.' });
    }
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: 'Geçersiz başlangıç/bitiş zamanı.' });
    }

    const qCount = Number.isInteger(questionCount) && questionCount > 0 ? questionCount : 4;
    const duration = Number.isInteger(durationSeconds) && durationSeconds > 0 ? durationSeconds : 300;

    const wordPool = await getUsableWordPool(deckSlug, unitNum);
    if (wordPool.length < Math.max(qCount, 4)) {
      return res.status(400).json({ error: `Bu ünitede yeterli kelime yok (en az ${Math.max(qCount, 4)} farklı anlamlı kelime gerekli, ${wordPool.length} bulundu).` });
    }

    const { rows } = await pool.query(
      `INSERT INTO quiz_windows (deck_slug, unit, class_name, starts_at, ends_at, duration_seconds, question_count,
                                  allow_auto_match, allow_manual_match, allow_room_match, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [deckSlug, unitNum, className, start, end, duration, qCount,
        allowAutoMatch !== false, allowManualMatch !== false, allowRoomMatch !== false, req.session.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Pencere oluşturulurken hata oluştu.' });
  }
});

// GET /api/admin/quiz/windows?class=&deckSlug=&unit= — pencere listesi (özet).
adminRouter.get('/windows', requireAuth, requireOwner, async (req, res) => {
  try {
    const { class: classFilter, deckSlug, unit } = req.query;
    const conditions = [];
    const params = [];
    if (classFilter) { params.push(classFilter); conditions.push(`w.class_name = $${params.length}`); }
    if (deckSlug) { params.push(deckSlug); conditions.push(`w.deck_slug = $${params.length}`); }
    if (unit) { params.push(Number(unit)); conditions.push(`w.unit = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT w.id, w.deck_slug, w.unit, w.class_name, w.starts_at, w.ends_at, w.duration_seconds, w.question_count,
              COUNT(a.id)::int AS attempt_count,
              COUNT(a.id) FILTER (WHERE a.status != 'in_progress')::int AS finished_count
       FROM quiz_windows w
       LEFT JOIN quiz_attempts a ON a.window_id = w.id
       ${where}
       GROUP BY w.id ORDER BY w.starts_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Pencereler yüklenirken hata oluştu.' });
  }
});

// GET /api/admin/quiz/windows/:id — pencere detayı: tüm denemeler + eşleşmeler.
adminRouter.get('/windows/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz pencere id.' });

    const { rows: winRows } = await pool.query('SELECT * FROM quiz_windows WHERE id = $1', [id]);
    if (!winRows.length) return res.status(404).json({ error: 'Pencere bulunamadı.' });

    const { rows: attempts } = await pool.query(
      `SELECT a.id, a.user_id, u.display_name, a.status, a.correct_count, a.started_at, a.finished_at, a.match_id
       FROM quiz_attempts a JOIN users u ON u.id = a.user_id
       WHERE a.window_id = $1 ORDER BY a.started_at ASC`,
      [id]
    );
    const { rows: matches } = await pool.query(
      `SELECT m.*, u1.display_name AS a1_name, u2.display_name AS a2_name
       FROM quiz_matches m
       JOIN quiz_attempts a1 ON a1.id = m.attempt1_id
       LEFT JOIN quiz_attempts a2 ON a2.id = m.attempt2_id
       JOIN users u1 ON u1.id = a1.user_id
       LEFT JOIN users u2 ON u2.id = a2.user_id
       WHERE m.window_id = $1 ORDER BY m.created_at ASC`,
      [id]
    );

    res.json({
      window: winRows[0],
      attempts: attempts.map((a) => ({
        id: a.id, userId: a.user_id, displayName: a.display_name, status: a.status,
        correctCount: a.correct_count, matchId: a.match_id,
        durationSeconds: durationOf(a),
      })),
      matches: matches.map((m) => ({
        id: m.id, method: m.match_method, status: m.status, isTie: m.is_tie,
        attempt1: { id: m.attempt1_id, displayName: m.a1_name },
        attempt2: m.attempt2_id ? { id: m.attempt2_id, displayName: m.a2_name } : null,
        winnerAttemptId: m.winner_attempt_id,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Pencere detayı yüklenirken hata oluştu.' });
  }
});

// POST /api/admin/quiz/windows/:id/match { attempt1Id, attempt2Id } — manuel eşleştirme.
adminRouter.post('/windows/:id/match', requireAuth, requireOwner, async (req, res) => {
  const client = await pool.connect();
  try {
    const windowId = Number(req.params.id);
    const attempt1Id = Number(req.body?.attempt1Id);
    const attempt2Id = Number(req.body?.attempt2Id);
    if (!Number.isInteger(windowId) || !Number.isInteger(attempt1Id) || !Number.isInteger(attempt2Id) || attempt1Id === attempt2Id) {
      return res.status(400).json({ error: 'Geçersiz parametreler.' });
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM quiz_attempts WHERE id IN ($1, $2) AND window_id = $3 FOR UPDATE`,
      [attempt1Id, attempt2Id, windowId]
    );
    if (rows.length !== 2) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Denemeler bulunamadı.' });
    }
    if (rows.some((a) => a.match_id)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Bu denemelerden biri zaten eşleşmiş.' });
    }
    if (rows.some((a) => a.status === 'in_progress')) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Öğrenci testi bitirmeden eşleştirilemez.' });
    }

    const a = rows.find((r) => r.id === attempt1Id);
    const b = rows.find((r) => r.id === attempt2Id);
    const { winnerAttemptId, isTie } = decideWinner(a, b);

    const { rows: matchRows } = await client.query(
      `INSERT INTO quiz_matches (window_id, attempt1_id, attempt2_id, match_method, status, winner_attempt_id, is_tie, resolved_at)
       VALUES ($1, $2, $3, 'manual', 'resolved', $4, $5, now()) RETURNING *`,
      [windowId, attempt1Id, attempt2Id, winnerAttemptId, isTie]
    );
    await client.query('UPDATE quiz_attempts SET match_id = $1 WHERE id IN ($2, $3)', [matchRows[0].id, attempt1Id, attempt2Id]);

    await client.query('COMMIT');
    res.json({ ok: true, match: matchRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Eşleştirme yapılırken hata oluştu.' });
  } finally {
    client.release();
  }
});

module.exports = { router, adminRouter };
