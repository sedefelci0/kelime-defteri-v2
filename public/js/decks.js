const DECK_THEMES = {
  'yokdil':             { theme: 'purple', icon: '🏆', badge: 'Popüler' },
  'benim-kelimelerim':  { theme: 'green',  icon: '⭐' },
  '5-sinif':            { theme: 'orange', icon: '📗' },
  '8-sinif':            { theme: 'yellow', icon: '📘' },
};

const loadingEl       = document.getElementById('loading');
const deckListViewEl  = document.getElementById('deck-list-view');
const unitListViewEl  = document.getElementById('unit-list-view');
const deckGridEl      = document.getElementById('deck-grid');
const unitButtonsEl   = document.getElementById('unit-buttons');
const unitDeckTitleEl = document.getElementById('unit-deck-title');
const unitDeckIconEl  = document.getElementById('unit-deck-icon');

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) { window.location.href = '/'; throw new Error('401'); }
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

function showView(view) {
  loadingEl.style.display      = view === 'loading' ? '' : 'none';
  deckListViewEl.style.display = view === 'decks'   ? '' : 'none';
  unitListViewEl.style.display = view === 'units'   ? '' : 'none';
}

function goToStudy(deckSlug, unit) {
  const params = new URLSearchParams({ deck: deckSlug });
  if (unit !== undefined && unit !== null) params.set('unit', unit);
  window.location.href = `/study.html?${params.toString()}`;
}

function goToTopics(deckSlug, unit) {
  window.location.href = `/topics.html?${new URLSearchParams({ deck: deckSlug, unit }).toString()}`;
}

let currentDeck = null;
let currentUnits = [];
let currentMode = 'words';
let topicsProgress = {};

const unitModeTabsEl = document.getElementById('unit-mode-tabs');
const tabWordsEl = document.getElementById('tab-words');
const tabTopicsEl = document.getElementById('tab-topics');

function renderUnitButtons() {
  unitButtonsEl.innerHTML = '';
  currentUnits.forEach((u) => {
    const btn = document.createElement('button');
    btn.className = 'unit-btn';
    const label = u.name || `Ünite ${u.unit}`;
    if (currentMode === 'topics') {
      const prog = topicsProgress[u.unit];
      btn.innerHTML = `${label}${prog ? `<span class="unit-btn-badge">${prog.bestScore}/${prog.bestTotal}</span>` : ''}`;
      btn.addEventListener('click', () => goToTopics(currentDeck.slug, u.unit));
    } else {
      btn.textContent = label;
      btn.addEventListener('click', () => goToStudy(currentDeck.slug, u.unit));
    }
    unitButtonsEl.appendChild(btn);
  });
}

tabWordsEl.addEventListener('click', () => {
  currentMode = 'words';
  tabWordsEl.classList.add('is-active');
  tabTopicsEl.classList.remove('is-active');
  renderUnitButtons();
});
tabTopicsEl.addEventListener('click', () => {
  currentMode = 'topics';
  tabTopicsEl.classList.add('is-active');
  tabWordsEl.classList.remove('is-active');
  renderUnitButtons();
});

async function openDeck(deck) {
  currentDeck = deck;
  currentMode = 'words';
  tabWordsEl.classList.add('is-active');
  tabTopicsEl.classList.remove('is-active');

  if (deck.unitCount > 0) {
    const t = DECK_THEMES[deck.slug] || { theme: 'purple', icon: '📚' };
    unitDeckTitleEl.textContent = deck.title;
    unitDeckIconEl.textContent  = t.icon;
    unitDeckIconEl.className    = `unit-deck-icon unit-deck-icon--${t.theme}`;

    showView('loading');
    currentUnits = await getJSON(`/api/decks/${deck.slug}/units`);

    if (deck.slug === '5-sinif') {
      unitModeTabsEl.style.display = '';
      topicsProgress = await getJSON(`/api/topics/${deck.slug}/progress`).catch(() => ({}));
    } else {
      unitModeTabsEl.style.display = 'none';
    }

    renderUnitButtons();
    showView('units');
  } else {
    goToStudy(deck.slug);
  }
}

const MEDAL_ICONS = ['🥇', '🥈', '🥉'];

function renderLeaderboard(data) {
  const section = document.getElementById('leaderboard-section');
  const gradesEl = document.getElementById('leaderboard-grades');
  const grades = Object.keys(data).sort();
  if (!grades.length) return;

  gradesEl.innerHTML = grades.map((grade) => {
    const students = data[grade];
    if (!students.length) return '';
    const rows = students.map((s, i) => `
      <div class="lb-row lb-row--${i + 1}">
        <span class="lb-medal">${MEDAL_ICONS[i]}</span>
        <span class="lb-name">${s.displayName}</span>
        <span class="lb-class">${s.className}</span>
        <span class="lb-score">${s.correctCount.toLocaleString('tr-TR')} doğru</span>
      </div>
    `).join('');
    return `
      <div class="lb-grade-card">
        <div class="lb-grade-title">${grade}. Sınıf</div>
        ${rows}
      </div>
    `;
  }).join('');

  section.style.display = '';
}

async function loadLeaderboard() {
  try {
    const data = await getJSON('/api/progress/leaderboard');
    renderLeaderboard(data);
  } catch (_) {}
}

async function loadDecks() {
  showView('loading');
  const decks = await getJSON('/api/decks');
  deckGridEl.innerHTML = '';

  decks.forEach((deck) => {
    const t = DECK_THEMES[deck.slug] || { theme: 'purple', icon: '📚' };

    const card = document.createElement('button');
    card.className = `deck-card deck-card--${t.theme}`;
    card.type = 'button';

    const metaText = deck.wordCount
      ? `${deck.wordCount.toLocaleString('tr-TR')} kelime${deck.unitCount > 0 ? ` · ${deck.unitCount} ünite` : ''}`
      : '';

    card.innerHTML = `
      <div class="deck-card-top">
        <div class="deck-icon-circle">${t.icon}</div>
        ${t.badge ? `<span class="deck-badge">${t.badge}</span>` : ''}
      </div>
      <div class="deck-title">${deck.title}</div>
      ${deck.description ? `<div class="deck-desc">${deck.description}</div>` : ''}
      ${metaText ? `<div class="deck-meta">${metaText}</div>` : ''}
    `;
    card.addEventListener('click', () => openDeck(deck));
    deckGridEl.appendChild(card);
  });

  showView('decks');
}

document.getElementById('back-to-decks').addEventListener('click', loadDecks);

document.getElementById('notes-btn').addEventListener('click', () => {
  window.location.href = '/notes.html';
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

document.getElementById('profil-btn').addEventListener('click', () => {
  window.location.href = '/profil.html';
});

document.getElementById('admin-panel-btn').addEventListener('click', () => {
  window.location.href = '/admin.html';
});

(async function init() {
  try {
    const me = await getJSON('/api/auth/me');
    const userBtn = document.getElementById('user-name-btn');
    userBtn.textContent = me.displayName;
    userBtn.addEventListener('click', () => { window.location.href = '/profil.html'; });

    if (me.isOwner) {
      document.getElementById('admin-panel-btn').style.display = '';
    }
    // Gunluk mucadele butonu — sadece 5-8. sinif ogrencileri
    if (me.className && /^[5-8]-[A-F]$/.test(me.className)) {
      const challengeBtn = document.getElementById('challenge-btn');
      challengeBtn.style.display = '';
      challengeBtn.addEventListener('click', () => { window.location.href = '/challenge.html'; });
      // Bugun katildiysa butonu guncelle
      fetch('/api/challenge/today', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((d) => {
          if (d.alreadyPlayed) {
            document.getElementById('challenge-desc').textContent = `Bugün katıldın · ${d.result.score}/5`;
          }
        }).catch(() => {});
    }

    await loadDecks();
    await loadLeaderboard();
  } catch (err) {
    // getJSON 401'de zaten yönlendiriyor
  }
})();
