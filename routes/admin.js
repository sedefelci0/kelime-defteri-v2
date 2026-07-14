const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { STUDENT_CLASSES, TEACHER_LABEL } = require('../db/classes-config');

const router = express.Router();

function requireOwner(req, res, next) {
  if (req.session.ownerUnlocked !== true) {
    return res.status(403).json({ error: 'Bu sayfa için öğretmen girişi gerekiyor.' });
  }
  next();
}

// Sınıf listesi (öğretmen hariç, sadece gerçek öğrenci sınıfları — filtre dropdown'u için)
router.get('/classes', requireAuth, requireOwner, (req, res) => {
  res.json(STUDENT_CLASSES);
});

// Tüm öğrencileri (öğretmen hesapları hariç, ve istersen tek bir sınıfı) ilerleme özetiyle listele
router.get('/students', requireAuth, requireOwner, async (req, res) => {
  try {
    const { class: classFilter } = req.query;

    const params = [TEACHER_LABEL];
    let classWhere = 'WHERE (u.class_name IS DISTINCT FROM $1)';
    if (classFilter) {
      params.push(classFilter);
      classWhere += ` AND u.class_name = $${params.length}`;
    }

    const { rows: students } = await pool.query(
      `SELECT u.id, u.display_name, u.email, u.class_name, u.total_study_seconds,
              u.wheel_next_spin_at,
              COALESCE(SUM(up.times_correct), 0)::int AS quiz_correct,
              COALESCE(SUM(up.times_wrong), 0)::int AS quiz_wrong,
              COALESCE(eas.correct_count, 0)::int AS exam_correct,
              COALESCE(eas.wrong_count, 0)::int AS exam_wrong,
              COALESCE(tp.units_completed, 0)::int AS topic_units_completed,
              tp.avg_percent AS topic_avg_percent
       FROM users u
       LEFT JOIN user_progress up ON up.user_id = u.id
       LEFT JOIN exam_answer_stats eas ON eas.user_id = u.id
       LEFT JOIN (
         SELECT user_id, COUNT(*)::int AS units_completed,
                ROUND(AVG(best_score::numeric / NULLIF(best_total, 0)) * 100)::int AS avg_percent
         FROM topic_progress
         GROUP BY user_id
       ) tp ON tp.user_id = u.id
       ${classWhere}
       GROUP BY u.id, eas.correct_count, eas.wrong_count, tp.units_completed, tp.avg_percent
       ORDER BY u.class_name ASC, u.display_name ASC`,
      params
    );

    if (students.length === 0) return res.json([]);

    const ids = students.map((s) => s.id);
    const { rows: notes } = await pool.query(
      `SELECT id, user_id, title, content, updated_at FROM notes
       WHERE user_id = ANY($1) ORDER BY updated_at DESC`,
      [ids]
    );
    const { rows: personalAnswers } = await pool.query(
      `SELECT user_id, deck_slug, unit, question, answer, submitted_at FROM topic_personal_answers
       WHERE user_id = ANY($1) ORDER BY unit ASC, submitted_at DESC`,
      [ids]
    );
    const { rows: topicDetail } = await pool.query(
      `SELECT user_id, unit, best_score, best_total, attempts FROM topic_progress
       WHERE user_id = ANY($1) ORDER BY unit ASC`,
      [ids]
    );
    const { rows: fillBlankStats } = await pool.query(
      `SELECT user_id, COUNT(*)::int AS total,
              SUM(CASE WHEN attempts = 1 THEN 1 ELSE 0 END)::int AS first_try,
              ROUND(AVG(attempts)::numeric, 1) AS avg_attempts
       FROM topic_fillblank_attempts
       WHERE user_id = ANY($1) GROUP BY user_id`,
      [ids]
    );
    const { rows: fillBlankRows } = await pool.query(
      `SELECT user_id, unit, prompt, attempts FROM topic_fillblank_attempts
       WHERE user_id = ANY($1) ORDER BY unit ASC, submitted_at DESC`,
      [ids]
    );
    const { rows: activityResults } = await pool.query(
      `SELECT user_id, unit, activity_index, activity_type, prompt, is_correct, explanation
       FROM topic_activity_results
       WHERE user_id = ANY($1) ORDER BY unit ASC, activity_index ASC`,
      [ids]
    );
    const { rows: wheelHistory } = await pool.query(
      `SELECT id, user_id, prize_key, prize_label, prize_tier, spun_at, given, given_at
       FROM wheel_spins
       WHERE user_id = ANY($1) AND spun_at >= now() - interval '7 days'
       ORDER BY spun_at DESC`,
      [ids]
    );

    const notesByUser = {};
    for (const n of notes) {
      if (!notesByUser[n.user_id]) notesByUser[n.user_id] = [];
      notesByUser[n.user_id].push({ id: n.id, title: n.title, content: n.content, updatedAt: n.updated_at });
    }
    const personalAnswersByUser = {};
    for (const a of personalAnswers) {
      if (!personalAnswersByUser[a.user_id]) personalAnswersByUser[a.user_id] = [];
      personalAnswersByUser[a.user_id].push({
        deckSlug: a.deck_slug,
        unit: a.unit,
        question: a.question,
        answer: a.answer,
        submittedAt: a.submitted_at,
      });
    }
    const topicDetailByUser = {};
    for (const t of topicDetail) {
      if (!topicDetailByUser[t.user_id]) topicDetailByUser[t.user_id] = [];
      topicDetailByUser[t.user_id].push({
        unit: t.unit,
        bestScore: t.best_score,
        bestTotal: t.best_total,
        attempts: t.attempts,
      });
    }
    const fillBlankByUser = {};
    for (const f of fillBlankStats) {
      fillBlankByUser[f.user_id] = {
        total: f.total,
        firstTry: f.first_try,
        avgAttempts: f.avg_attempts !== null ? Number(f.avg_attempts) : null,
      };
    }
    const fillBlankDetailByUser = {};
    for (const f of fillBlankRows) {
      if (!fillBlankDetailByUser[f.user_id]) fillBlankDetailByUser[f.user_id] = [];
      fillBlankDetailByUser[f.user_id].push({ unit: f.unit, prompt: f.prompt, attempts: f.attempts });
    }
    const activityResultsByUser = {};
    for (const r of activityResults) {
      if (!activityResultsByUser[r.user_id]) activityResultsByUser[r.user_id] = [];
      activityResultsByUser[r.user_id].push({
        unit: r.unit,
        index: r.activity_index,
        type: r.activity_type,
        prompt: r.prompt,
        isCorrect: r.is_correct,
        explanation: r.explanation,
      });
    }
    const wheelHistoryByUser = {};
    for (const w of wheelHistory) {
      if (!wheelHistoryByUser[w.user_id]) wheelHistoryByUser[w.user_id] = [];
      wheelHistoryByUser[w.user_id].push({
        id: w.id,
        prizeKey: w.prize_key,
        prizeLabel: w.prize_label,
        prizeTier: w.prize_tier,
        spunAt: w.spun_at,
        given: w.given,
        givenAt: w.given_at,
      });
    }

    res.json(
      students.map((s) => ({
        id: s.id,
        displayName: s.display_name,
        email: s.email,
        className: s.class_name,
        totalStudySeconds: s.total_study_seconds,
        quizCorrect: s.quiz_correct,
        quizWrong: s.quiz_wrong,
        examCorrect: s.exam_correct,
        examWrong: s.exam_wrong,
        topicUnitsCompleted: s.topic_units_completed,
        topicAvgPercent: s.topic_avg_percent,
        topicProgressDetail: topicDetailByUser[s.id] || [],
        fillBlank: fillBlankByUser[s.id] || null,
        fillBlankDetail: fillBlankDetailByUser[s.id] || [],
        topicActivityResults: activityResultsByUser[s.id] || [],
        notes: notesByUser[s.id] || [],
        personalAnswers: personalAnswersByUser[s.id] || [],
        wheelNextSpinAt: s.wheel_next_spin_at,
        wheelHistory: wheelHistoryByUser[s.id] || [],
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Öğrenciler yüklenirken hata oluştu.' });
  }
});

// --- Öğrenci verisini sıfırlama ---

// Bir veya birden çok öğrencinin quiz/sınav/çalışma süresi/konu özeti/kişisel cevap/
// boşluk doldurma/notlar/günlük mücadele verisinin tamamını siler. Kelime desteleri,
// kullanıcı hesabı ve şifresi ETKİLENMEZ — sadece ilerleme/aktivite verisi temizlenir.
// Tek tek satır satır değil, tüm id'ler için TEK bir toplu sorgu (WHERE ... = ANY($1))
// kullanılır — öğrenci sayısı arttıkça sorgu sayısı artmaz, "Tümünü Sıfırla" büyük
// sınıflarda da zaman aşımına uğramadan çalışır.
async function resetStudentsData(client, userIds) {
  if (!userIds || userIds.length === 0) return;
  await client.query('DELETE FROM user_progress WHERE user_id = ANY($1)', [userIds]);
  await client.query('DELETE FROM exam_answer_stats WHERE user_id = ANY($1)', [userIds]);
  await client.query('UPDATE users SET total_study_seconds = 0 WHERE id = ANY($1)', [userIds]);
  await client.query('DELETE FROM topic_progress WHERE user_id = ANY($1)', [userIds]);
  await client.query('DELETE FROM topic_personal_answers WHERE user_id = ANY($1)', [userIds]);
  await client.query('DELETE FROM topic_fillblank_attempts WHERE user_id = ANY($1)', [userIds]);
  await client.query('DELETE FROM topic_activity_results WHERE user_id = ANY($1)', [userIds]).catch(() => {});
  await client.query('DELETE FROM daily_stats WHERE user_id = ANY($1)', [userIds]);
  await client.query('DELETE FROM notes WHERE user_id = ANY($1)', [userIds]);
  await client.query('DELETE FROM daily_challenge_results WHERE user_id = ANY($1)', [userIds]).catch(() => {});
  await client.query('DELETE FROM daily_medals WHERE user_id = ANY($1)', [userIds]).catch(() => {});
  await client.query('DELETE FROM daily_champions WHERE user_id = ANY($1)', [userIds]).catch(() => {});
  await client.query('DELETE FROM wheel_spins WHERE user_id = ANY($1)', [userIds]).catch(() => {});
  await client.query('UPDATE users SET wheel_next_spin_at = NULL WHERE id = ANY($1)', [userIds]).catch(() => {});
}

router.post('/students/:id/reset', requireAuth, requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz öğrenci id.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await resetStudentsData(client, [id]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Sıfırlanırken hata oluştu.' });
  } finally {
    client.release();
  }
});

router.post('/students/reset-all', requireAuth, requireOwner, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id FROM users WHERE is_teacher = FALSE');
    const ids = rows.map((r) => r.id);
    await resetStudentsData(client, ids);
    await client.query('COMMIT');
    res.json({ ok: true, count: ids.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Toplu sıfırlama sırasında hata oluştu.' });
  } finally {
    client.release();
  }
});

// --- Ödül Çarkı yönetimi ---

// Bir çevirmenin ödülünün fiziksel/uygulamada verilip verilmediğini işaretler (toggle).
router.post('/wheel/:spinId/given', requireAuth, requireOwner, async (req, res) => {
  try {
    const spinId = Number(req.params.spinId);
    if (!Number.isInteger(spinId)) return res.status(400).json({ error: 'Geçersiz kayıt id.' });

    const { rows } = await pool.query(
      `UPDATE wheel_spins SET given = NOT given, given_at = CASE WHEN NOT given THEN now() ELSE NULL END
       WHERE id = $1 RETURNING given, given_at`,
      [spinId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Kayıt bulunamadı.' });
    res.json({ given: rows[0].given, givenAt: rows[0].given_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İşaretlenirken hata oluştu.' });
  }
});

// Bir öğrencinin çark bekleme süresini kaldırır — "bugün tekrar açabilsin" (özel gün/bayram).
router.post('/students/:id/wheel-reset', requireAuth, requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz öğrenci id.' });
    await pool.query('UPDATE users SET wheel_next_spin_at = NULL WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Çark sıfırlanırken hata oluştu.' });
  }
});

// Tüm öğrencilerin çark bekleme süresini aynı anda kaldırır.
router.post('/wheel-reset-all', requireAuth, requireOwner, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET wheel_next_spin_at = NULL WHERE is_teacher = FALSE`
    );
    res.json({ ok: true, count: rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Toplu çark sıfırlama sırasında hata oluştu.' });
  }
});

// --- Soru havuzu yönetimi (exam_questions: kelimeye bağlı değil, genel havuz) ---

// Havuzdaki tüm soruları listele (en yeni önce)
router.get('/questions', requireAuth, requireOwner, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, question_text, option_a, option_b, option_c, option_d, option_e,
              correct_option, explanation, source, restrict_deck_slug, created_at
       FROM exam_questions
       ORDER BY created_at DESC`
    );
    res.json(
      rows.map((q) => ({
        id: q.id,
        questionText: q.question_text,
        optionA: q.option_a,
        optionB: q.option_b,
        optionC: q.option_c,
        optionD: q.option_d,
        optionE: q.option_e,
        correctOption: q.correct_option,
        explanation: q.explanation,
        source: q.source,
        restrictDeckSlug: q.restrict_deck_slug,
        createdAt: q.created_at,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sorular yüklenirken hata oluştu.' });
  }
});

function validateQuestionBody(body) {
  const { questionText, optionA, optionB, optionC, optionD, correctOption } = body || {};
  if (!questionText || !questionText.trim()) return 'Soru metni zorunludur.';
  if (!optionA || !optionB || !optionC || !optionD) return '4 şıkkın hepsi doldurulmalı.';
  if (!['A', 'B', 'C', 'D', 'E'].includes(correctOption)) return 'Doğru şık A/B/C/D/E olmalı.';
  return null;
}

router.post('/questions', requireAuth, requireOwner, async (req, res) => {
  try {
    const error = validateQuestionBody(req.body);
    if (error) return res.status(400).json({ error });

    const { questionText, optionA, optionB, optionC, optionD, optionE, correctOption, explanation, source, restrictDeckSlug } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO exam_questions (question_text, option_a, option_b, option_c, option_d, option_e, correct_option, explanation, source, restrict_deck_slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        questionText.trim(),
        optionA.trim(),
        optionB.trim(),
        optionC.trim(),
        optionD.trim(),
        optionE && optionE.trim() ? optionE.trim() : null,
        correctOption,
        explanation ? explanation.trim() : null,
        source ? source.trim() : null,
        restrictDeckSlug ? restrictDeckSlug.trim() : null,
      ]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Soru kaydedilirken hata oluştu.' });
  }
});

router.put('/questions/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz soru id.' });

    const error = validateQuestionBody(req.body);
    if (error) return res.status(400).json({ error });

    const { questionText, optionA, optionB, optionC, optionD, optionE, correctOption, explanation, source, restrictDeckSlug } = req.body;
    const { rowCount } = await pool.query(
      `UPDATE exam_questions SET question_text = $1, option_a = $2, option_b = $3, option_c = $4,
              option_d = $5, option_e = $6, correct_option = $7, explanation = $8, source = $9, restrict_deck_slug = $10
       WHERE id = $11`,
      [
        questionText.trim(),
        optionA.trim(),
        optionB.trim(),
        optionC.trim(),
        optionD.trim(),
        optionE && optionE.trim() ? optionE.trim() : null,
        correctOption,
        explanation ? explanation.trim() : null,
        source ? source.trim() : null,
        restrictDeckSlug ? restrictDeckSlug.trim() : null,
        id,
      ]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Soru bulunamadı.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Soru güncellenirken hata oluştu.' });
  }
});

// --- Kelime talepleri ---

router.get('/word-requests', requireAuth, requireOwner, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT wr.id, wr.word, wr.requested_at, wr.status,
              u.display_name AS user_name, u.class_name
       FROM word_requests wr
       LEFT JOIN users u ON u.id = wr.requested_by
       WHERE wr.status = 'pending'
       ORDER BY wr.requested_at DESC`
    );
    res.json(rows.map((r) => ({
      id: r.id,
      word: r.word,
      requestedAt: r.requested_at,
      status: r.status,
      userName: r.user_name,
      className: r.class_name,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Talepler yüklenirken hata oluştu.' });
  }
});

router.post('/word-requests/:id/approve', requireAuth, requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz id.' });
    const { rowCount } = await pool.query(
      `UPDATE word_requests SET status = 'approved' WHERE id = $1 AND status = 'pending'`,
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Talep bulunamadı.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Onaylanırken hata oluştu.' });
  }
});

router.post('/word-requests/:id/reject', requireAuth, requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz id.' });
    const { rowCount } = await pool.query(
      `DELETE FROM word_requests WHERE id = $1`,
      [id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Talep bulunamadı.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Reddedilirken hata oluştu.' });
  }
});

// --- Analitik ---

router.get('/analytics', requireAuth, requireOwner, async (req, res) => {
  try {
    const [userStatsRes, classDistRes, wordStatsRes, hardestRes, easiestRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(CASE WHEN EXISTS (
            SELECT 1 FROM user_progress up2
            WHERE up2.user_id = u.id AND up2.last_reviewed_at >= NOW() - INTERVAL '7 days'
          ) THEN 1 END)::int AS active_7d,
          COUNT(CASE WHEN EXISTS (
            SELECT 1 FROM user_progress up3
            WHERE up3.user_id = u.id AND up3.last_reviewed_at >= CURRENT_DATE
          ) THEN 1 END)::int AS active_today
        FROM users u WHERE u.is_teacher = FALSE
      `),
      pool.query(`
        SELECT class_name, COUNT(*)::int AS count
        FROM users WHERE is_teacher = FALSE AND class_name IS NOT NULL
        GROUP BY class_name ORDER BY class_name
      `),
      pool.query(`
        SELECT w.english, w.turkish_meaning, d.title AS deck_title,
               COALESCE(SUM(up.times_correct + up.times_wrong), 0)::int AS times_studied,
               COALESCE(SUM(up.times_correct), 0)::int AS total_correct,
               COALESCE(SUM(up.times_wrong), 0)::int AS total_wrong
        FROM words w
        JOIN decks d ON d.id = w.deck_id
        LEFT JOIN user_progress up ON up.word_id = w.id
        GROUP BY w.id, w.english, w.turkish_meaning, d.title
        ORDER BY times_studied DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT w.english, w.turkish_meaning, d.title AS deck_title,
               SUM(up.times_wrong)::int AS total_wrong,
               SUM(up.times_correct)::int AS total_correct,
               ROUND(SUM(up.times_correct)::numeric / NULLIF(SUM(up.times_correct + up.times_wrong), 0) * 100)::int AS accuracy
        FROM words w
        JOIN decks d ON d.id = w.deck_id
        JOIN user_progress up ON up.word_id = w.id
        GROUP BY w.id, w.english, w.turkish_meaning, d.title
        HAVING SUM(up.times_wrong) > 0
        ORDER BY total_wrong DESC
        LIMIT 10
      `),
      pool.query(`
        SELECT w.english, w.turkish_meaning, d.title AS deck_title,
               SUM(up.times_correct)::int AS total_correct,
               SUM(up.times_wrong)::int AS total_wrong
        FROM words w
        JOIN decks d ON d.id = w.deck_id
        JOIN user_progress up ON up.word_id = w.id
        GROUP BY w.id, w.english, w.turkish_meaning, d.title
        ORDER BY total_correct DESC
        LIMIT 10
      `),
    ]);

    res.json({
      users: userStatsRes.rows[0],
      classDistribution: classDistRes.rows,
      mostStudied: wordStatsRes.rows,
      hardestWords: hardestRes.rows,
      easiestWords: easiestRes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analitik yuklenirken hata olustu.' });
  }
});

router.delete('/questions/:id', requireAuth, requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz soru id.' });
    const { rowCount } = await pool.query('DELETE FROM exam_questions WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Soru bulunamadı.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Soru silinirken hata oluştu.' });
  }
});

module.exports = router;
