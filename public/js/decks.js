const DECK_THEMES = {
  'yokdil':             { theme: 'purple', icon: '🏆', badge: { label: 'En Çok Çalışılan', style: 'gold' } },
  'yan-anlam':          { theme: 'pink',   icon: '🔑', badge: { label: 'Yeni', style: 'new' } },
  'benim-kelimelerim':  { theme: 'green',  icon: '⭐' },
  '5-sinif':            { theme: 'orange', icon: '🚀', badge: { label: 'Yeni', style: 'new' } },
  '6-sinif':            { theme: 'blue',   icon: '🏰', badge: { label: 'Critical', style: 'critical' } },
  '7-sinif':            { theme: 'pink',   icon: '📕' },
  '8-sinif':            { theme: 'yellow', icon: '💎', badge: { label: 'LGS Özel', style: 'info' } },
};

// Kullanıcının deste bazında ilerlemesi (/api/progress/profile'dan gelir,
// deck kartlarındaki progress bar için). Ünite/kelime verisini bozmadan
// sadece "known/total kelime (%pct)" gösterimini besler.
let deckProgressBySlug = {};

// Konu Özetleri (Topic aktiviteleri) verisi olan desteler — bu listedeki desteler için
// "Kelimeler / Konu Özetleri" sekmesi gösterilir. 7. sınıf henüz kaynak içerik eklenmediği
// için listede yok; içerik eklenince buraya da eklenmesi yeterli.
const TOPICS_ENABLED_DECKS = ['5-sinif', '6-sinif', '8-sinif'];

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

function goToQuiz(deckSlug, unit) {
  window.location.href = `/quiz.html?${new URLSearchParams({ deck: deckSlug, unit }).toString()}`;
}

// Öğrenci düellosu — öğretmenin açtığı bir yarışma penceresi gerekmez,
// her zaman kullanılabilir (bkz. POST /api/quiz/duels).
function goToDuel(deckSlug, unit) {
  window.location.href = `/quiz.html?${new URLSearchParams({ deck: deckSlug, unit, mode: 'duel' }).toString()}`;
}

let currentDeck = null;
let currentUnits = [];
let currentMode = 'words';
let topicsProgress = {};
let quizActiveByUnit = {};

const unitModeTabsEl = document.getElementById('unit-mode-tabs');
const tabWordsEl = document.getElementById('tab-words');
const tabTopicsEl = document.getElementById('tab-topics');

// Her ünite için, öğrencinin kendi sınıfına açık aktif bir yarışma testi
// penceresi olup olmadığını sorar. Herhangi bir sınıf/ünite/deste için
// çalışır — deste bazlı bir whitelist gerekmez (bkz. GET /api/quiz/active).
async function loadQuizActiveState(deckSlug, units) {
  quizActiveByUnit = {};
  await Promise.all(units.map(async (u) => {
    try {
      const info = await getJSON(`/api/quiz/active?deckSlug=${encodeURIComponent(deckSlug)}&unit=${encodeURIComponent(u.unit)}`);
      if (info.active) quizActiveByUnit[u.unit] = info;
    } catch (_) { /* sessiz geç */ }
  }));
}

const UNIT_BTN_COLOR_COUNT = 8;

function renderUnitButtons() {
  unitButtonsEl.innerHTML = '';
  currentUnits.forEach((u, i) => {
    const cell = document.createElement('div');
    cell.className = 'unit-cell';

    const btn = document.createElement('button');
    btn.className = `unit-btn unit-btn--${i % UNIT_BTN_COLOR_COUNT}`;
    const label = u.name || `Ünite ${u.unit}`;
    if (currentMode === 'topics') {
      const prog = topicsProgress[u.unit];
      btn.innerHTML = `${label}${prog ? `<span class="unit-btn-badge">${prog.bestScore}/${prog.bestTotal}</span>` : ''}`;
      btn.addEventListener('click', () => goToTopics(currentDeck.slug, u.unit));
    } else {
      btn.textContent = label;
      btn.addEventListener('click', () => goToStudy(currentDeck.slug, u.unit));
    }
    cell.appendChild(btn);

    const quizInfo = quizActiveByUnit[u.unit];
    if (quizInfo) {
      const quizLink = document.createElement('button');
      quizLink.type = 'button';
      quizLink.className = 'unit-quiz-link';
      quizLink.textContent = quizInfo.alreadyAttempted ? '🏆 Sonucunu gör' : '🏆 Yarışma Testi';
      quizLink.addEventListener('click', (e) => { e.stopPropagation(); goToQuiz(currentDeck.slug, u.unit); });
      cell.appendChild(quizLink);
    }

    // Düello, öğretmen penceresinden bağımsız olarak her zaman kullanılabilir.
    const duelLink = document.createElement('button');
    duelLink.type = 'button';
    duelLink.className = 'unit-duel-link';
    duelLink.textContent = '⚔️ Düello';
    duelLink.addEventListener('click', (e) => { e.stopPropagation(); goToDuel(currentDeck.slug, u.unit); });
    cell.appendChild(duelLink);

    unitButtonsEl.appendChild(cell);
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

    if (TOPICS_ENABLED_DECKS.includes(deck.slug)) {
      unitModeTabsEl.style.display = '';
      topicsProgress = await getJSON(`/api/topics/${deck.slug}/progress`).catch(() => ({}));
    } else {
      unitModeTabsEl.style.display = 'none';
    }

    await loadQuizActiveState(deck.slug, currentUnits);
    renderUnitButtons();
    showView('units');
  } else {
    goToStudy(deck.slug);
  }
}

const MEDAL_ICONS = ['🥇', '🥈', '🥉'];

// Kullanıcı fotoğrafı yok — admin.js'teki baş harf + renkli daire avatar
// deseninin aynısı (aynı renk paleti, aynı mantık), liderlik podyumunda
// kullanmak için burada da tanımlandı.
const AVATAR_COLORS = [
  { bg: '#7C3AED', fg: '#fff' },
  { bg: '#06B6D4', fg: '#fff' },
  { bg: '#F59E0B', fg: '#241a04' },
  { bg: '#EC4899', fg: '#fff' },
  { bg: '#3B82F6', fg: '#fff' },
  { bg: '#16A34A', fg: '#fff' },
];
function getInitials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
function avatarColorFor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function renderLeaderboard(data) {
  const section = document.getElementById('leaderboard-section');
  const gradesEl = document.getElementById('leaderboard-grades');
  const grades = Object.keys(data).sort();
  if (!grades.length) return;

  gradesEl.innerHTML = grades.map((grade) => {
    const students = data[grade];
    if (!students.length) return '';

    // İlk 3'ü podyum olarak (2.-1.-3. sırayla, ortada en yüksek), varsa
    // 3'ten fazlası (backend şu an en fazla 3 döndürüyor) düz liste olarak.
    const podium = students.slice(0, 3);
    const rest = students.slice(3);

    const podiumHtml = podium.map((s, i) => {
      const color = avatarColorFor(s.displayName);
      return `
        <div class="lb-podium-slot lb-podium-slot--${i + 1}">
          <span class="lb-podium-medal">${MEDAL_ICONS[i]}</span>
          <div class="lb-podium-avatar" style="background:${color.bg};color:${color.fg}">${getInitials(s.displayName)}</div>
          <div class="lb-podium-name">${s.displayName}</div>
          <div class="lb-podium-score">${s.correctCount.toLocaleString('tr-TR')} doğru</div>
          <div class="lb-podium-bar"></div>
        </div>`;
    }).join('');

    const restHtml = rest.map((s, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i + 4}.</span>
        <span class="lb-name">${s.displayName}</span>
        <span class="lb-class">${s.className}</span>
        <span class="lb-score">${s.correctCount.toLocaleString('tr-TR')}</span>
      </div>
    `).join('');

    return `
      <div class="lb-grade-card">
        <div class="lb-grade-title">${grade}. Sınıf</div>
        <div class="lb-podium">${podiumHtml}</div>
        ${restHtml}
      </div>
    `;
  }).join('');

  section.style.display = '';
}

// Son 5 günün doğru/yanlış sayısına göre basit bir çubuk sparkline (gerçek
// veri — /api/progress/profile'ın dailyStats alanından, bkz. routes/progress.js).
function renderSparkline(dailyStats) {
  const el = document.getElementById('stat-sparkline');
  if (!dailyStats || !dailyStats.length) {
    el.innerHTML = '<span class="stat-sparkline-empty">Henüz çalışma verisi yok</span>';
    return;
  }
  const days = dailyStats.slice(0, 5).reverse();
  const max = Math.max(1, ...days.map((d) => d.correct + d.wrong));
  el.innerHTML = days.map((d) => {
    const total = d.correct + d.wrong;
    const heightPct = Math.max(8, Math.round((total / max) * 100));
    return `<div class="stat-sparkline-bar" style="height:${heightPct}%" title="${total} soru"></div>`;
  }).join('');
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
    const progress = deckProgressBySlug[deck.slug];

    const card = document.createElement('button');
    card.className = `deck-card deck-card--${t.theme}`;
    card.type = 'button';

    let metaText = deck.wordCount
      ? `${deck.wordCount.toLocaleString('tr-TR')} kelime${deck.unitCount > 0 ? ` · ${deck.unitCount} ünite` : ''}`
      : '';
    let progressBarHtml = '';
    if (progress && progress.total > 0) {
      metaText = `${progress.known}/${progress.total} kelime (%${progress.pct})${deck.unitCount > 0 ? ` · ${deck.unitCount} ünite` : ''}`;
      progressBarHtml = `<div class="deck-progress-track"><div class="deck-progress-fill" style="width:${progress.pct}%"></div></div>`;
    }

    card.innerHTML = `
      <div class="deck-card-top">
        <div class="deck-icon-circle">${t.icon}</div>
        ${t.badge ? `<span class="deck-badge deck-badge--${t.badge.style}">${t.badge.label}</span>` : ''}
      </div>
      <div class="deck-title">${deck.title}</div>
      ${deck.description ? `<div class="deck-desc">${deck.description}</div>` : ''}
      ${metaText ? `<div class="deck-meta">${metaText}</div>` : ''}
      ${progressBarHtml}
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

    const firstName = (me.displayName || '').split(' ')[0];
    document.getElementById('dash-greeting').textContent = `Selam ${firstName}! 👋`;

    // Deste bazlı ilerleme (progress bar) ve son 5 günlük sparkline — gerçek
    // veri, /api/progress/profile'dan (bkz. routes/progress.js:91). loadDecks()
    // çağrılmadan önce çözülmesi beklenir ki progress bar'lar ilk çizimde gelsin.
    try {
      const profile = await getJSON('/api/progress/profile');
      (profile.decks || []).forEach((d) => { deckProgressBySlug[d.slug] = d; });
      renderSparkline(profile.dailyStats);
    } catch (_) {
      renderSparkline(null);
    }

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

    // Ödül Çarkı butonu — herkese (öğretmen dahil) görünür, öğretmen de test/deneme amaçlı çevirebilir
    {
      const wheelBtn = document.getElementById('wheel-btn');
      wheelBtn.style.display = '';
      wheelBtn.addEventListener('click', () => { window.location.href = '/wheel.html'; });
      fetch('/api/wheel/status', { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((d) => {
          const descEl = document.getElementById('wheel-desc');
          if (d.canSpin) {
            descEl.textContent = 'Çark hazır, çevir! 🎉';
          } else {
            const remaining = new Date(d.nextSpinAt).getTime() - Date.now();
            const totalMinutes = Math.max(0, Math.floor(remaining / 60000));
            const days = Math.floor(totalMinutes / (60 * 24));
            const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
            descEl.textContent = days > 0 ? `${days}g ${hours}s sonra hazır` : `${hours}s sonra hazır`;
          }
        }).catch(() => {});
    }

    await loadDecks();
    await loadLeaderboard();
  } catch (err) {
    // getJSON 401'de zaten yönlendiriyor
  }
})();
