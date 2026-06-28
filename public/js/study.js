const params = new URLSearchParams(window.location.search);
const deckSlug = params.get('deck');
const unitParam = params.get('unit');

if (!deckSlug) {
  window.location.href = '/decks.html';
}

let allWords = [];
let currentIndex = 0;
let deckInfo = { hasExplanation: true, hasImage: false, title: 'Kelime Defteri' };

let totalStudySeconds = 0;
let sessionSeconds = 0; // bu sayfa açıldığından beri geçen, henüz sunucuya gönderilmemiş süre

const loadingEl = document.getElementById('loading');
const cardZoneEl = document.getElementById('card-zone');
const emptyStateEl = document.getElementById('empty-state');

const flipCardEl = document.getElementById('flip-card');
const cardCounterEl = document.getElementById('card-counter');
const wordImageEl = document.getElementById('word-image');
const wordEnglishEl = document.getElementById('word-english');
const wordPronEl = document.getElementById('word-pron');
const wordExplanationEl = document.getElementById('word-explanation');
const wordMeaningEl = document.getElementById('word-meaning');
const wordExampleEl = document.getElementById('word-example');

const btnAgain = document.getElementById('btn-again');
const btnKnow = document.getElementById('btn-know');
const navFirst = document.getElementById('nav-first');
const navPrev = document.getElementById('nav-prev');
const navNext = document.getElementById('nav-next');
const navLast = document.getElementById('nav-last');

function showOnly(el) {
  [loadingEl, cardZoneEl, emptyStateEl].forEach((e) => {
    e.style.display = e === el ? '' : 'none';
  });
}

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('Giriş gerekli');
  }
  if (res.status === 403) {
    window.location.href = '/decks.html';
    throw new Error('Erişim yok');
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

function buildQueryString(extra) {
  const p = new URLSearchParams({ deck: deckSlug });
  if (unitParam) p.set('unit', unitParam);
  if (extra) Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p.toString();
}

function formatDuration(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) return `⏱ ${mins} dk`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `⏱ ${hours} sa ${rem} dk`;
}

function updateTimerDisplay() {
  document.getElementById('study-timer').textContent = formatDuration(totalStudySeconds + sessionSeconds);
}

async function loadSummary() {
  const summary = await getJSON(`/api/progress/summary?${buildQueryString()}`);
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-text');
  const total = summary.total || 1;
  bar.innerHTML = `
    <div class="seg-known" style="width:${(summary.known / total) * 100}%"></div>
    <div class="seg-learning" style="width:${(summary.learning / total) * 100}%"></div>
  `;
  text.textContent = `${summary.known}/${summary.total} öğrenildi`;
}

function renderCard() {
  const word = allWords[currentIndex];
  if (!word) return;
  flipCardEl.classList.remove('is-flipped');

  if (deckInfo.hasImage && word.image_url) {
    wordImageEl.src = word.image_url;
    wordImageEl.style.display = '';
  } else {
    wordImageEl.style.display = 'none';
  }

  wordEnglishEl.textContent = word.english;
  wordPronEl.textContent = word.pronunciation;

  if (deckInfo.hasExplanation && word.english_explanation) {
    wordExplanationEl.textContent = word.english_explanation;
    wordExplanationEl.style.display = '';
  } else {
    wordExplanationEl.style.display = 'none';
  }

  wordMeaningEl.textContent = word.turkish_meaning;
  wordExampleEl.textContent = word.example_sentence;

  cardCounterEl.textContent = `${currentIndex + 1} / ${allWords.length}`;
  navFirst.disabled = navPrev.disabled = currentIndex === 0;
  navLast.disabled = navNext.disabled = currentIndex === allWords.length - 1;

  showOnly(cardZoneEl);
}

flipCardEl.addEventListener('click', () => {
  flipCardEl.classList.toggle('is-flipped');
});

navFirst.addEventListener('click', () => { currentIndex = 0; renderCard(); });
navPrev.addEventListener('click', () => { currentIndex = Math.max(0, currentIndex - 1); renderCard(); });
navNext.addEventListener('click', () => { currentIndex = Math.min(allWords.length - 1, currentIndex + 1); renderCard(); });
navLast.addEventListener('click', () => { currentIndex = allWords.length - 1; renderCard(); });

async function answer(knewIt) {
  const word = allWords[currentIndex];
  if (!word) return;
  btnAgain.disabled = true;
  btnKnow.disabled = true;
  try {
    const result = await postJSON(`/api/progress/${word.id}`, { knewIt });
    word.status = result.status;
    word.times_correct = result.timesCorrect;
    word.times_wrong = result.timesWrong;
    await loadSummary();
    if (currentIndex < allWords.length - 1) {
      currentIndex += 1;
    }
    renderCard();
  } catch (err) {
    alert('Bir hata oluştu, lütfen tekrar dene.');
  } finally {
    btnAgain.disabled = false;
    btnKnow.disabled = false;
  }
}

btnAgain.addEventListener('click', () => answer(false));
btnKnow.addEventListener('click', () => answer(true));

document.getElementById('back-to-decks-btn').addEventListener('click', () => {
  window.location.href = '/decks.html';
});
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

// --- Süre sayacı ---
// Her saniye ekrandaki sayacı güncelle; her 20 saniyede sunucuya gönderip sıfırla.
setInterval(() => {
  sessionSeconds += 1;
  updateTimerDisplay();
  if (sessionSeconds >= 20) {
    const toSend = sessionSeconds;
    sessionSeconds = 0;
    postJSON('/api/progress/heartbeat', { seconds: toSend })
      .then((res) => { totalStudySeconds = res.totalStudySeconds; updateTimerDisplay(); })
      .catch(() => { sessionSeconds += toSend; }); // başarısız olursa kaybetmeyelim, tekrar dene
  }
}, 1000);

window.addEventListener('beforeunload', () => {
  if (sessionSeconds > 0) {
    // Sayfa kapanırken kalan süreyi göndermeyi dene (garanti değildir ama denemeye değer)
    navigator.sendBeacon && navigator.sendBeacon(
      '/api/progress/heartbeat',
      new Blob([JSON.stringify({ seconds: sessionSeconds })], { type: 'application/json' })
    );
  }
});

async function init() {
  try {
    const me = await getJSON('/api/auth/me');
    document.getElementById('user-name').textContent = me.displayName;
    totalStudySeconds = me.totalStudySeconds || 0;
    updateTimerDisplay();

    const data = await getJSON(`/api/words?${buildQueryString()}`);
    deckInfo = data.deck;
    allWords = data.words;
    document.getElementById('deck-brand').textContent = deckInfo.title;

    if (allWords.length === 0) {
      showOnly(emptyStateEl);
      return;
    }

    const firstUnknown = allWords.findIndex((w) => w.status !== 'known');
    currentIndex = firstUnknown === -1 ? 0 : firstUnknown;

    await loadSummary();
    renderCard();
  } catch (err) {
    // getJSON zaten 401/403'te yönlendiriyor
  }
}

init();
