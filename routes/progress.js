const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const DECKS_CONFIG = require('../db/decks-config');

const router = express.Router();

pool
  .query(`CREATE TABLE IF NOT EXISTS exam_answer_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count   INTEGER NOT NULL DEFAULT 0
  )`)
  .then(() => console.log('[db] exam_answer_stats hazır.'))
  .catch((e) => console.error('[db] exam_answer_stats oluşturulamadı:', e.message));

pool
  .query(`CREATE TABLE IF NOT EXISTS daily_stats (
    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date          DATE    NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  )`)
  .then(() => console.log('[db] daily_stats hazır.'))
  .catch((e) => console.error('[db] daily_stats oluşturulamadı:', e.message));

// Belirli bir deste (ve varsa ünite) için özet: kaç kelime new / learning / known
// Örnek: GET /api/progress/summary?deck=5-sinif&unit=1
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const { deck: deckSlug, unit } = req.query;
    if (!deckSlug) return res.status(400).json({ error: 'deck parametresi zorunludur.' });

    const { rows: deckRows } = await pool.query('SELECT id FROM decks WHERE slug = $1', [deckSlug]);
    const deck = deckRows[0];
    if (!deck) return res.status(404).json({ error: 'Deste bulunamadı.' });

    const params = [deck.id];
    let unitFilter = '';
    if (unit !== undefined && unit !== '') {
      params.push(Number(unit));
      unitFilter = `AND unit = $${params.length}`;
    }
    params.push(req.session.userId);

    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM words WHERE deck_id = $1 ${unitFilter}) AS total,
         COALESCE(SUM(CASE WHEN up.status = 'known' THEN 1 ELSE 0 END), 0)::int AS known,
         COALESCE(SUM(CASE WHEN up.status = 'learning' THEN 1 ELSE 0 END), 0)::int AS learning
       FROM user_progress up
       JOIN words w ON w.id = up.word_id
       WHERE up.user_id = $${params.length} AND w.deck_id = $1 ${unitFilter}`,
      params
    );
    const row = rows[0];
    const known = Number(row.known) || 0;
    const learning = Number(row.learning) || 0;
    const total = Number(row.total) || 0;
    res.json({ total, known, learning, newCount: total - known - learning });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Özet yüklenirken hata oluştu.' });
  }
});

// Çalışma süresi sayacı: tarayıcı periyodik olarak (örn. her 20 saniyede) geçen
// süreyi gönderir, toplam çalışma süresine eklenir. Sekme kapatılsa da en fazla
// son aralık kadar veri kaybolur.
router.post('/heartbeat', requireAuth, async (req, res) => {
  try {
    const { seconds } = req.body || {};
    const inc = Number(seconds);
    if (!Number.isFinite(inc) || inc <= 0 || inc > 120) {
      return res.status(400).json({ error: 'Geçersiz süre.' });
    }
    const { rows } = await pool.query(
      `UPDATE users SET total_study_seconds = total_study_seconds + $1
       WHERE id = $2 RETURNING total_study_seconds`,
      [Math.round(inc), req.session.userId]
    );
    res.json({ totalStudySeconds: rows[0].total_study_seconds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Süre kaydedilirken hata oluştu.' });
  }
});

// Profil sayfası: genel istatistikler + deste bazında ilerleme
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const uid = req.session.userId;

    const [quizResult, examResult, deckResult, userResult, topicResult, wheelResult, dailyResult] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN up.status = 'known' THEN 1 ELSE 0 END), 0)::int AS known,
           COALESCE(SUM(CASE WHEN up.status = 'learning' THEN 1 ELSE 0 END), 0)::int AS learning,
           COALESCE(SUM(up.times_wrong), 0)::int AS total_wrong,
           COALESCE(SUM(up.times_correct), 0)::int AS total_correct,
           COUNT(CASE WHEN up.times_wrong > 0 THEN 1 END)::int AS words_with_wrong
         FROM user_progress up WHERE up.user_id = $1`,
        [uid]
      ),
      pool.query(
        `SELECT COALESCE(correct_count, 0)::int AS exam_correct,
                COALESCE(wrong_count, 0)::int AS exam_wrong
         FROM exam_answer_stats WHERE user_id = $1`,
        [uid]
      ),
      pool.query(
        `SELECT d.slug, d.title,
                COUNT(w.id)::int AS total,
                COALESCE(SUM(CASE WHEN up.status = 'known' THEN 1 ELSE 0 END), 0)::int AS known
         FROM decks d
         JOIN words w ON w.deck_id = d.id
         LEFT JOIN user_progress up ON up.word_id = w.id AND up.user_id = $1
         GROUP BY d.id, d.slug, d.title, d.sort_order
         ORDER BY d.sort_order ASC`,
        [uid]
      ),
      pool.query('SELECT class_name FROM users WHERE id = $1', [uid]),
      pool.query(
        `SELECT deck_slug, unit, best_score, best_total, updated_at FROM topic_progress
         WHERE user_id = $1 ORDER BY updated_at DESC`,
        [uid]
      ),
      pool.query(
        `SELECT prize_key, prize_label, prize_tier, spun_at FROM wheel_spins
         WHERE user_id = $1 AND prize_key != 'respin' ORDER BY spun_at DESC LIMIT 1`,
        [uid]
      ),
      pool.query(
        `SELECT date, correct_count, wrong_count FROM daily_stats
         WHERE user_id = $1 ORDER BY date DESC LIMIT 5`,
        [uid]
      ).catch(() => ({ rows: [] })),
    ]);

    const s = quizResult.rows[0];
    const e = examResult.rows[0] || { exam_correct: 0, exam_wrong: 0 };
    const className = userResult.rows[0]?.class_name;

    const totalAns = s.total_correct + s.total_wrong;
    const quizAccuracy = totalAns > 0 ? Math.round((s.total_correct / totalAns) * 100) : 0;
    const examTotal = e.exam_correct + e.exam_wrong;
    const examAccuracy = examTotal > 0 ? Math.round((e.exam_correct / examTotal) * 100) : 0;

    const decks = deckResult.rows.map((r) => ({
      slug: r.slug,
      title: r.title,
      total: r.total,
      known: r.known,
      pct: r.total > 0 ? Math.round((r.known / r.total) * 100) : 0,
    }));

    // Konu Özetleri özeti — ünite adları db/decks-config.js'den okunur (aynı kaynak,
    // admin panelindeki ile tutarlı kalsın diye).
    const units = topicResult.rows.map((t) => {
      const deck = DECKS_CONFIG.find((d) => d.slug === t.deck_slug);
      const unitName = deck?.unitNames?.[t.unit];
      return {
        deckSlug: t.deck_slug,
        deckTitle: deck ? deck.title : t.deck_slug,
        unit: t.unit,
        unitName: unitName || null,
        bestScore: t.best_score,
        bestTotal: t.best_total,
        pct: t.best_total > 0 ? Math.round((t.best_score / t.best_total) * 100) : 0,
        updatedAt: t.updated_at,
      };
    });
    const topicSummary = {
      unitsCompleted: units.length,
      avgPercent: units.length > 0 ? Math.round(units.reduce((sum, u) => sum + u.pct, 0) / units.length) : 0,
      units,
    };

    const wheelLastPrize = wheelResult.rows[0]
      ? {
          key: wheelResult.rows[0].prize_key,
          label: wheelResult.rows[0].prize_label,
          tier: wheelResult.rows[0].prize_tier,
          spunAt: wheelResult.rows[0].spun_at,
        }
      : null;

    // Kelime hedefi — öğrencinin kendi sınıf seviyesine ait deste varsa onu hedef alır
    // (örn. "6-A" -> "6-sinif" destesi), yoksa tüm destelerin toplamını gösterir.
    const gradeMatch = className && /^([5-8])-[A-F]$/.exec(className);
    const gradeDeck = gradeMatch ? decks.find((d) => d.slug === `${gradeMatch[1]}-sinif`) : null;
    const goal = gradeDeck
      ? { label: gradeDeck.title, current: gradeDeck.known, target: gradeDeck.total, pct: gradeDeck.pct }
      : {
          label: 'Genel Kelime Hedefi',
          current: decks.reduce((sum, d) => sum + d.known, 0),
          target: decks.reduce((sum, d) => sum + d.total, 0),
          pct: (() => {
            const total = decks.reduce((sum, d) => sum + d.total, 0);
            const known = decks.reduce((sum, d) => sum + d.known, 0);
            return total > 0 ? Math.round((known / total) * 100) : 0;
          })(),
        };

    // Son aktiviteler — konu özeti tamamlama, ödül çarkı çevirme ve günlük çalışma
    // kayıtları tek bir zaman çizelgesinde birleştirilir (gerçek veri, uydurma yok).
    const recentActivity = [];
    units.slice(0, 5).forEach((u) => {
      recentActivity.push({
        type: 'topic',
        label: `Konu özeti tamamladı: ${u.deckTitle}${u.unitName ? ` — ${u.unitName}` : ` Ünite ${u.unit}`}`,
        sublabel: `%${u.pct} başarı`,
        at: u.updatedAt,
      });
    });
    if (wheelLastPrize) {
      recentActivity.push({
        type: 'wheel',
        label: `Ödül çarkını çevirdi: ${wheelLastPrize.label}`,
        sublabel: null,
        at: wheelLastPrize.spunAt,
      });
    }
    dailyResult.rows.forEach((d) => {
      const total = d.correct_count + d.wrong_count;
      if (total === 0) return;
      recentActivity.push({
        type: 'study',
        label: `${total} soru çalıştı`,
        sublabel: `${d.correct_count} doğru · ${d.wrong_count} yanlış`,
        at: d.date,
      });
    });
    recentActivity.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({
      stats: {
        known: s.known,
        learning: s.learning,
        wrong: s.words_with_wrong,
        quizCorrect: s.total_correct,
        quizWrong: s.total_wrong,
        quizAccuracy,
        examCorrect: e.exam_correct,
        examWrong: e.exam_wrong,
        examAccuracy,
        totalQuestions: examTotal,
      },
      decks,
      topicSummary,
      wheelLastPrize,
      goal,
      recentActivity: recentActivity.slice(0, 8),
      // Ana ekrandaki mini sparkline için ham günlük veri (en yeni önce).
      dailyStats: dailyResult.rows.map((d) => ({
        date: d.date,
        correct: d.correct_count,
        wrong: d.wrong_count,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Profil yuklenirken hata olustu.' });
  }
});

// Profil sekmesi için kelime listeleri: ?status=wrong|learning|known
router.get('/words', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let condition;
    if (status === 'wrong') condition = 'up.times_wrong > 0';
    else if (status === 'learning') condition = "up.status = 'learning'";
    else if (status === 'known') condition = "up.status = 'known'";
    else return res.status(400).json({ error: 'Geçersiz status parametresi.' });

    const { rows } = await pool.query(
      `SELECT w.english, w.turkish_meaning, up.times_wrong, up.times_correct, up.status, d.title AS deck_title
       FROM user_progress up
       JOIN words w ON w.id = up.word_id
       JOIN decks d ON d.id = w.deck_id
       WHERE up.user_id = $1 AND ${condition}
       ORDER BY up.times_wrong DESC NULLS LAST, w.english ASC
       LIMIT 300`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kelimeler yüklenirken hata oluştu.' });
  }
});

// Aktivite ısı haritası: son 90 günlük günlük çalışma sayısı
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DATE(last_reviewed_at AT TIME ZONE 'Europe/Istanbul') AS date,
              COUNT(*)::int AS count
       FROM user_progress
       WHERE user_id = $1 AND last_reviewed_at >= now() - interval '90 days'
       GROUP BY DATE(last_reviewed_at AT TIME ZONE 'Europe/Istanbul')
       ORDER BY date ASC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Aktivite yüklenirken hata oluştu.' });
  }
});

// Liderlik tablosu: sinif bazinda ilk 3 ogrenci
router.get('/leaderboard', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         u.id, u.display_name, u.class_name,
         COALESCE(SUM(up.times_correct), 0)::int AS correct_count,
         COALESCE(SUM(up.times_wrong),   0)::int AS wrong_count,
         MAX(up.last_reviewed_at) AS last_activity
       FROM users u
       LEFT JOIN user_progress up ON up.user_id = u.id
       WHERE u.class_name ~ '^[5-8]-[A-F]$' AND u.is_teacher = FALSE
       GROUP BY u.id, u.display_name, u.class_name`
    );

    const byGrade = {};
    rows.forEach((r) => {
      const grade = r.class_name[0];
      if (!byGrade[grade]) byGrade[grade] = [];
      byGrade[grade].push(r);
    });

    const result = {};
    for (const grade of Object.keys(byGrade).sort()) {
      const students = byGrade[grade].sort((a, b) => {
        if (b.correct_count !== a.correct_count) return b.correct_count - a.correct_count;
        const accA = a.correct_count + a.wrong_count > 0 ? a.correct_count / (a.correct_count + a.wrong_count) : 0;
        const accB = b.correct_count + b.wrong_count > 0 ? b.correct_count / (b.correct_count + b.wrong_count) : 0;
        if (accB !== accA) return accB - accA;
        const tA = a.last_activity ? new Date(a.last_activity).getTime() : Infinity;
        const tB = b.last_activity ? new Date(b.last_activity).getTime() : Infinity;
        return tA - tB;
      });
      result[grade] = students.slice(0, 3).map((s, i) => ({
        rank: i + 1,
        displayName: s.display_name,
        className: s.class_name,
        correctCount: s.correct_count,
        wrongCount: s.wrong_count,
      }));
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Liderlik tablosu yüklenirken hata oluştu.' });
  }
});

// Madalyalar: kullanicinin gunluk mucadeleden kazandigi madalyalar
router.get('/medals', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT medal_type, COUNT(*)::int AS count
       FROM daily_medals
       WHERE user_id = $1
       GROUP BY medal_type`,
      [req.session.userId]
    );
    const medals = { gold: 0, silver: 0, bronze: 0 };
    rows.forEach((r) => { if (r.medal_type in medals) medals[r.medal_type] = r.count; });
    res.json(medals);
  } catch (err) {
    return res.json({ gold: 0, silver: 0, bronze: 0 });
  }
});

// Sınav sorusu (çıkmış soru) cevabını kaydet
router.post('/exam-answer', requireAuth, async (req, res) => {
  try {
    const { isCorrect } = req.body || {};
    if (typeof isCorrect !== 'boolean') {
      return res.status(400).json({ error: 'isCorrect (true/false) zorunludur.' });
    }
    await pool.query(
      `INSERT INTO exam_answer_stats (user_id, correct_count, wrong_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         correct_count = exam_answer_stats.correct_count + $2,
         wrong_count   = exam_answer_stats.wrong_count   + $3`,
      [req.session.userId, isCorrect ? 1 : 0, isCorrect ? 0 : 1]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sınav cevabı kaydedilemedi.' });
  }
});

// Bir kelimeyi "biliyorum" veya "tekrar göster" olarak işaretle
router.post('/:wordId', requireAuth, async (req, res) => {
  try {
    const wordId = Number(req.params.wordId);
    const { knewIt } = req.body || {};

    if (!Number.isInteger(wordId)) {
      return res.status(400).json({ error: 'Geçersiz kelime id.' });
    }
    if (typeof knewIt !== 'boolean') {
      return res.status(400).json({ error: 'knewIt alanı (true/false) zorunludur.' });
    }

    // Basit kural: art arda 2 kez doğru bilinirse "known" olur.
    // Bir kere bile yanlış bilinirse "learning"e döner.
    const existing = await pool.query(
      'SELECT times_correct, times_wrong FROM user_progress WHERE user_id = $1 AND word_id = $2',
      [req.session.userId, wordId]
    );

    let timesCorrect = existing.rows[0]?.times_correct || 0;
    let timesWrong = existing.rows[0]?.times_wrong || 0;

    if (knewIt) {
      timesCorrect += 1;
    } else {
      timesWrong += 1;
    }

    const status = !knewIt ? 'learning' : timesCorrect >= 2 ? 'known' : 'learning';

    await pool.query(
      `INSERT INTO user_progress (user_id, word_id, status, times_correct, times_wrong, last_reviewed_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id, word_id)
       DO UPDATE SET status = $3, times_correct = $4, times_wrong = $5, last_reviewed_at = now()`,
      [req.session.userId, wordId, status, timesCorrect, timesWrong]
    );

    pool.query(
      `INSERT INTO daily_stats (user_id, date, correct_count, wrong_count)
       VALUES ($1, (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, $2, $3)
       ON CONFLICT (user_id, date) DO UPDATE SET
         correct_count = daily_stats.correct_count + $2,
         wrong_count   = daily_stats.wrong_count   + $3`,
      [req.session.userId, knewIt ? 1 : 0, knewIt ? 0 : 1]
    ).catch(() => {});

    res.json({ wordId, status, timesCorrect, timesWrong });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İlerleme kaydedilirken hata oluştu.' });
  }
});

module.exports = router;
