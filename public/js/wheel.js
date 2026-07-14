const loadingEl = document.getElementById('loading');
const contentEl = document.getElementById('wheel-content');
const wheelDiscEl = document.getElementById('wheel-disc');
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

// --- Çarkı çiz (conic-gradient dilimler + emoji'ler) ---
function buildWheel() {
  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  let cum = 0;
  const gradientParts = [];
  wheelDiscEl.innerHTML = '';

  prizes.forEach((p) => {
    const width = (p.weight / total) * 360;
    const start = cum;
    const end = cum + width;
    p._midAngle = start + width / 2;
    gradientParts.push(`${p.color} ${start}deg ${end}deg`);

    const emojiEl = document.createElement('span');
    emojiEl.className = 'wheel-slice-emoji';
    emojiEl.textContent = p.emoji;
    emojiEl.style.transform = `rotate(${p._midAngle}deg) translate(0, -128px) rotate(${-p._midAngle}deg)`;
    wheelDiscEl.appendChild(emojiEl);

    cum = end;
  });

  wheelDiscEl.style.background = `conic-gradient(from 0deg, ${gradientParts.join(', ')})`;
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
  wheelDiscEl.style.transform = `rotate(${currentRotation}deg)`;
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
    buildWheel();

    const status = await getJSON('/api/wheel/status');
    loadingEl.style.display = 'none';
    contentEl.style.display = '';

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
