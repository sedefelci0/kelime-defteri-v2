const loadingEl = document.getElementById('loading');
const contentEl = document.getElementById('wheel-content');
const wheelCanvasEl = document.getElementById('wheel-canvas');
const wheelCtx = wheelCanvasEl.getContext('2d');
const spinBtn = document.getElementById('spin-btn');
const lockedEl = document.getElementById('wheel-locked');
const countdownEl = document.getElementById('wheel-countdown');
const lastPrizeEl = document.getElementById('wheel-last-prize');

const revealOverlayEl = document.getElementById('reveal-overlay');
const revealCardEl = document.getElementById('reveal-card');
const revealEmojiEl = document.getElementById('reveal-emoji');
const revealHeadingEl = document.getElementById('reveal-heading');
const revealLabelEl = document.getElementById('reveal-label');
const revealContinueBtn = document.getElementById('reveal-continue-btn');
const revealRespinBtn = document.getElementById('reveal-respin-btn');

const confettiLayerEl = document.getElementById('confetti-layer');

let prizes = [];
let currentRotation = 0;
let countdownInterval = null;

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) { window.location.href = '/'; throw new Error('401'); }
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'İstek başarısız');
  return data;
}

document.getElementById('back-btn').addEventListener('click', () => { window.location.href = '/decks.html'; });
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

// --- Çarkı Canvas ile çiz (sadece emoji — metin yok) ---
// Dilimler GÖRSEL olarak her zaman eşit boyutta (360° / ödül sayısı) — kazanma olasılığı
// bununla ilgisiz, tamamen sunucudaki ağırlıklı seçime dayanıyor (bkz. doSpin). Çark sadece
// sunucunun döndürdüğü sonucun (eşit) diliminde durana kadar CSS transition ile döner —
// canvas da normal bir DOM elemanı olduğu için transform/transition sorunsuz çalışır.
//
// Canvas'ın GERÇEK render boyutu getBoundingClientRect() ile ölçülüyor (sabit bir sayı
// varsaymak yerine) — bu fonksiyon artık #wheel-content görünür olduktan SONRA çağrılıyor
// (bkz. init()), aksi halde display:none iken ölçüm 0 çıkar ve çark yamulurdu.
//
// Canvas açı sistemi: 0 rad = saat 3 yönü, açı arttıkça saat yönünde döner (y ekseni aşağı
// baktığı için). Dilim 0'ı üstten (saat 12, -90°) başlatıp saat yönünde ilerletiyoruz —
// böylece p._midAngle (derece, üstten saat yönünde) eski conic-gradient ile aynı sözleşmeyi
// korur ve spinWheelTo'nun açı hesabı değişmeden çalışır.
function buildWheel() {
  const size = wheelCanvasEl.getBoundingClientRect().width;
  const dpr = window.devicePixelRatio || 1;
  wheelCanvasEl.width = size * dpr;
  wheelCanvasEl.height = size * dpr;
  wheelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2;
  const sliceRad = (2 * Math.PI) / prizes.length;
  const sliceDeg = 360 / prizes.length;

  wheelCtx.clearRect(0, 0, size, size);

  prizes.forEach((p, i) => {
    const startRad = i * sliceRad - Math.PI / 2;
    const endRad = startRad + sliceRad;
    const midRad = startRad + sliceRad / 2;
    p._midAngle = i * sliceDeg + sliceDeg / 2;

    // Dilim (kama şeklinde: merkezden dışa)
    wheelCtx.beginPath();
    wheelCtx.moveTo(cx, cy);
    wheelCtx.arc(cx, cy, radius, startRad, endRad);
    wheelCtx.closePath();
    wheelCtx.fillStyle = p.color;
    wheelCtx.fill();
    wheelCtx.strokeStyle = 'rgba(255,255,255,0.65)';
    wheelCtx.lineWidth = 2;
    wheelCtx.stroke();

    // Sadece emoji — dilimin orta açısında, dış kenara yakın
    wheelCtx.save();
    wheelCtx.translate(cx, cy);
    wheelCtx.rotate(midRad);
    wheelCtx.textAlign = 'center';
    wheelCtx.textBaseline = 'middle';
    wheelCtx.font = `${Math.round(radius * 0.17)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    wheelCtx.fillText(p.emoji, radius * 0.68, 0);
    wheelCtx.restore();
  });
}

function findMidAngle(prizeKey) {
  const p = prizes.find((x) => x.key === prizeKey);
  return p ? p._midAngle : 0;
}

function spinWheelTo(prizeKey) {
  const mid = findMidAngle(prizeKey);
  const targetMod = (360 - mid + 360) % 360;
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const delta = ((targetMod - currentMod) + 360) % 360;
  currentRotation += 8 * 360 + delta;
  wheelCanvasEl.style.transform = `rotate(${currentRotation}deg)`;
}

// --- Geri sayım ---
function formatCountdown(ms) {
  if (ms <= 0) return 'Hazır! 🎉';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days} gün`);
  if (hours > 0 || days > 0) parts.push(`${hours} saat`);
  parts.push(`${minutes} dakika`);
  return parts.join(' ');
}

function startCountdown(nextSpinAt) {
  clearInterval(countdownInterval);
  const target = new Date(nextSpinAt).getTime();

  function tick() {
    const remaining = target - Date.now();
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      showReadyState();
      return;
    }
    countdownEl.textContent = formatCountdown(remaining);
  }
  tick();
  countdownInterval = setInterval(tick, 1000 * 30);
}

function showReadyState() {
  lockedEl.style.display = 'none';
  spinBtn.style.display = '';
  spinBtn.disabled = false;
  spinBtn.textContent = 'Çarkı Çevir!';
}

function showLockedState(nextSpinAt, lastPrize) {
  spinBtn.style.display = 'none';
  lockedEl.style.display = '';
  lastPrizeEl.textContent = lastPrize ? `Son kazandığın: ${lastPrize.label}` : '';
  startCountdown(nextSpinAt);
}

// --- Konfeti ---
const CONFETTI_COLORS = ['#FF6B6B', '#4DABF7', '#FFD43B', '#94D82D', '#DA77F2', '#20C997', '#FF922B'];

function launchConfetti(big) {
  const count = big ? 220 : 110;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.animationDuration = `${2 + Math.random() * 1.8}s`;
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    piece.style.width = piece.style.height = `${6 + Math.random() * 6}px`;
    confettiLayerEl.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove());
  }
}

// --- Çevirme akışı ---
async function doSpin() {
  spinBtn.disabled = true;
  spinBtn.textContent = 'Çevriliyor…';
  try {
    const result = await postJSON('/api/wheel/spin');
    spinWheelTo(result.prizeKey);

    await new Promise((resolve) => setTimeout(resolve, 4600));

    showReveal(result);
  } catch (err) {
    alert(err.message || 'Çark çevrilirken bir hata oluştu.');
    spinBtn.disabled = false;
    spinBtn.textContent = 'Çarkı Çevir!';
  }
}

function showReveal(result) {
  const isLegendary = result.prizeTier === 'legendary';
  revealEmojiEl.textContent = prizes.find((p) => p.key === result.prizeKey)?.emoji || '🎉';
  revealHeadingEl.textContent = isLegendary ? '✨ İNANILMAZ! ✨' : 'Kazandın!';
  revealLabelEl.textContent = result.prizeLabel;
  revealCardEl.classList.toggle('is-legendary', isLegendary);

  revealRespinBtn.style.display = result.isRespin ? '' : 'none';
  revealContinueBtn.style.display = result.isRespin ? 'none' : '';

  revealOverlayEl.style.display = 'flex';
  launchConfetti(isLegendary);

  revealContinueBtn.onclick = () => {
    revealOverlayEl.style.display = 'none';
    showLockedState(result.nextSpinAt, { key: result.prizeKey, label: result.prizeLabel });
  };
  revealRespinBtn.onclick = () => {
    revealOverlayEl.style.display = 'none';
    doSpin();
  };
}

spinBtn.addEventListener('click', doSpin);

async function init() {
  try {
    await getJSON('/api/auth/me');
    prizes = await getJSON('/api/wheel/prizes');
    const status = await getJSON('/api/wheel/status');

    loadingEl.style.display = 'none';
    contentEl.style.display = '';
    // Çark ancak konteyner görünür olduktan (display:none kalkınca) sonra çizilmeli,
    // yoksa getBoundingClientRect() 0 döner ve çark yamulur/taşar.
    buildWheel();

    if (status.canSpin) {
      showReadyState();
    } else {
      showLockedState(status.nextSpinAt, status.lastPrize);
    }
  } catch (err) {
    // getJSON zaten 401'de yönlendiriyor
  }
}

init();
