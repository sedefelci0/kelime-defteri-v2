const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const PRIZES = require('../data/wheel_prizes.json');

const router = express.Router();

const WHEEL_COOLDOWN_HOURS = 60;

function drawPrize() {
  const total = PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const p of PRIZES) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }
  return PRIZES[PRIZES.length - 1]; // yuvarlama payı için güvenlik ağı
}

// Çark için sabit dilim listesi (anahtar/etiket/renk/ağırlık) — hem çizim hem animasyon
// açısı hesabı için client'ın aynı sırayı bilmesi gerekiyor.
router.get('/prizes', requireAuth, (req, res) => {
  res.json(PRIZES);
});

// Öğrencinin çark durumu: çevirebilir mi, ne zaman hazır olur, en son (respin hariç) ne kazandı.
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query(
      'SELECT wheel_next_spin_at FROM users WHERE id = $1',
      [req.session.userId]
    );
    const nextSpinAt = userRows[0]?.wheel_next_spin_at || null;
    const canSpin = !nextSpinAt || new Date(nextSpinAt) <= new Date();

    const { rows: lastRows } = await pool.query(
      `SELECT prize_key, prize_label, prize_tier, spun_at FROM wheel_spins
       WHERE user_id = $1 AND prize_key != 'respin'
       ORDER BY spun_at DESC LIMIT 1`,
      [req.session.userId]
    );

    res.json({
      canSpin,
      nextSpinAt,
      lastPrize: lastRows[0]
        ? {
            key: lastRows[0].prize_key,
            label: lastRows[0].prize_label,
            tier: lastRows[0].prize_tier,
            spunAt: lastRows[0].spun_at,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Çark durumu yüklenirken hata oluştu.' });
  }
});

// Çarkı çevir: sunucu tarafında ağırlıklı rastgele seçim yapar, "respin" dışında
// cooldown'ı 60 saate ayarlar. Cooldown kontrolü de sunucuda yapılır — istemci
// sadece görsel geri sayım gösterir, gerçek kısıtlama burada.
router.post('/spin', requireAuth, async (req, res) => {
  try {
    const { rows: userRows } = await pool.query(
      'SELECT wheel_next_spin_at FROM users WHERE id = $1',
      [req.session.userId]
    );
    const nextSpinAt = userRows[0]?.wheel_next_spin_at || null;
    if (nextSpinAt && new Date(nextSpinAt) > new Date()) {
      return res.status(403).json({ error: 'Çark henüz hazır değil.', nextSpinAt });
    }

    const prize = drawPrize();

    await pool.query(
      `INSERT INTO wheel_spins (user_id, prize_key, prize_label, prize_tier)
       VALUES ($1, $2, $3, $4)`,
      [req.session.userId, prize.key, prize.label, prize.tier]
    );

    let newNextSpinAt = nextSpinAt;
    if (prize.key !== 'respin') {
      const { rows } = await pool.query(
        `UPDATE users SET wheel_next_spin_at = now() + make_interval(hours => $2)
         WHERE id = $1 RETURNING wheel_next_spin_at`,
        [req.session.userId, WHEEL_COOLDOWN_HOURS]
      );
      newNextSpinAt = rows[0].wheel_next_spin_at;
    }

    res.json({
      prizeKey: prize.key,
      prizeLabel: prize.label,
      prizeTier: prize.tier,
      isRespin: prize.key === 'respin',
      nextSpinAt: newNextSpinAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Çark çevrilirken hata oluştu.' });
  }
});

module.exports = router;
