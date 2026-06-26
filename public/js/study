let queue = [];      // çalışılacak kelime kuyruğu (new + learning, known hariç)
let currentWord = null;
let isFlipped = false;

const loadingEl = document.getElementById('loading');
const cardZoneEl = document.getElementById('card-zone');
const emptyStateEl = document.getElementById('empty-state');
const doneStateEl = document.getElementById('done-state');

const flipCardEl = document.getElementById('flip-card');
const cardCounterEl = document.getElementById('card-counter');
const wordEnglishEl = document.getElementById('word-english');
const wordPronEl = document.getElementById('word-pron');
const wordExplanationEl = document.getElementById('word-explanation');
const wordMeaningEl = document.getElementById('word-meaning');
const wordExampleEl = document.getElementById('word-example');

const btnAgain = document.getElementById('btn-again');
const btnKnow = document.getElementById('btn-know');

function showOnly(el) {
  [loadingEl, cardZoneEl, emptyStateEl, doneStateEl].forEach((e) => {
    e.style.display = e === el ? '' : 'none';
  });
}

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Giriş gerekli');
  }
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadSummary() {
  const summary = await getJSON('/api/progress/summary');
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-text');
  const total = summary.total || 1;
  bar.innerHTML = `
    <div class="seg-known" style="width:${(summary.known / total) * 100}%"></div>
    <div class="seg-learning" style="width:${(summary.learning / total) * 100}%"></div>
  `;
  text.textContent = `${summary.known}/${summary.total} öğrenildi`;
}

function renderCurrentCard() {
  if (!currentWord) return;
  isFlipped = false;
  flipCardEl.classList.remove('is-flipped');

  wordEnglishEl.textContent = currentWord.english;
  wordPronEl.textContent = currentWord.pronunciation;
  wordExplanationEl.textContent = currentWord.english_explanation;
  wordMeaningEl.textContent = currentWord.turkish_meaning;
  wordExampleEl.textContent = currentWord.example_sentence;

  cardCounterEl.textContent = `Kalan kart: ${queue.length}`;
  showOnly(cardZoneEl);
}

function nextCard() {
  if (queue.length === 0) {
    showOnly(doneStateEl);
    loadSummary();
    return;
  }
  currentWord = queue.shift();
  renderCurrentCard();
}

flipCardEl.addEventListener('click', () => {
  isFlipped = !isFlipped;
  flipCardEl.classList.toggle('is-flipped', isFlipped);
});

async function answer(knewIt) {
  if (!currentWord) return;
  btnAgain.disabled = true;
  btnKnow.disabled = true;
  try {
    await postJSON(`/api/progress/${currentWord.id}`, { knewIt });
    if (!knewIt) {
      // bilinmeyen kelimeyi kuyruğun biraz sonrasına geri koy
      const reinsertAt = Math.min(queue.length, 3);
      queue.splice(reinsertAt, 0, currentWord);
    }
    await loadSummary();
    nextCard();
  } catch (err) {
    alert('Bir hata oluştu, lütfen tekrar dene.');
  } finally {
    btnAgain.disabled = false;
    btnKnow.disabled = false;
  }
}

btnAgain.addEventListener('click', () => answer(false));
btnKnow.addEventListener('click', () => answer(true));

document.getElementById('restart-btn').addEventListener('click', async () => {
  showOnly(loadingEl);
  await buildQueue({ includeKnown: true });
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

async function buildQueue({ includeKnown = false } = {}) {
  const words = await getJSON('/api/words');
  if (words.length === 0) {
    showOnly(emptyStateEl);
    return;
  }
  const pool = includeKnown ? words : words.filter((w) => w.status !== 'known');
  if (pool.length === 0) {
    showOnly(doneStateEl);
    return;
  }
  // Önce hiç görülmemiş + öğrenilmekte olanlar; "learning" olanlar biraz öne alınır
  // ki kullanıcı zorlandığı kelimeleri daha sık görsün, ardından karıştırılır.
  const learning = shuffle(pool.filter((w) => w.status === 'learning'));
  const fresh = shuffle(pool.filter((w) => w.status !== 'learning'));
  queue = [...learning, ...fresh];
  await loadSummary();
  nextCard();
}

(async function init() {
  try {
    const me = await getJSON('/api/auth/me');
    document.getElementById('user-name').textContent = me.displayName;
    await buildQueue();
  } catch (err) {
    // getJSON zaten 401'de yönlendiriyor
  }
})();
