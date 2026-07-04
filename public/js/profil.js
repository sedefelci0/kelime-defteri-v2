const DECK_THEME_ORDER = ['purple', 'green', 'orange', 'yellow'];

async function getJSON(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) { window.location.href = '/'; throw new Error('401'); }
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

function formatMemberSince(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `Üye: ${d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}`;
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function statusBadge(status) {
  if (status === 'known')    return '<span class="status-badge status-badge--known">Öğrendim</span>';
  if (status === 'learning') return '<span class="status-badge status-badge--learning">Tekrarda</span>';
  return '<span class="status-badge status-badge--new">Yeni</span>';
}

function activityLevel(count) {
  if (count === 0) return 0;
  if (count <= 5)  return 1;
  if (count <= 15) return 2;
  if (count <= 30) return 3;
  return 4;
}

function buildHeatmap(activityData) {
  const activityMap = {};
  activityData.forEach(r => { activityMap[r.date] = r.count; });

  const container = document.getElementById('heatmap-container');
  container.innerHTML = '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from 12 weeks ago, aligned to Monday
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 89);
  // Go back to Monday
  const dow = startDate.getDay(); // 0=Sun, 1=Mon...
  const daysBack = (dow === 0 ? 6 : dow - 1);
  startDate.setDate(startDate.getDate() - daysBack);

  const cells = [];
  const d = new Date(startDate);
  while (d <= today) {
    const dateStr = d.toISOString().slice(0, 10);
    const count = activityMap[dateStr] || 0;
    const level = activityLevel(count);
    const cell = document.createElement('div');
    cell.className = `heatmap-cell heatmap-cell--${level}`;
    cell.title = count > 0
      ? `${new Date(dateStr).toLocaleDateString('tr-TR')}: ${count} kelime`
      : new Date(dateStr).toLocaleDateString('tr-TR');
    cells.push(cell);
    d.setDate(d.getDate() + 1);
  }

  cells.forEach(c => container.appendChild(c));
}

async function loadWords(status) {
  const panel    = document.getElementById('tab-panel-words');
  const loadEl   = document.getElementById('words-loading');
  const emptyEl  = document.getElementById('words-empty');
  const tableEl  = document.getElementById('words-table');
  const tbodyEl  = document.getElementById('words-tbody');

  panel.style.display = '';
  document.getElementById('tab-panel-activity').style.display = 'none';
  loadEl.style.display   = '';
  emptyEl.style.display  = 'none';
  tableEl.style.display  = 'none';

  const words = await getJSON(`/api/progress/words?status=${status}`);

  loadEl.style.display = 'none';
  if (!words.length) {
    emptyEl.style.display = '';
    return;
  }

  tbodyEl.innerHTML = words.map(w => `
    <tr>
      <td class="word-en">${w.english}</td>
      <td class="word-tr">${w.turkish_meaning}</td>
      <td style="font-size:12px;color:var(--muted)">${w.deck_title}</td>
      <td>${w.times_wrong > 0 ? `<span class="wrong-count">${w.times_wrong}×</span>` : '<span style="color:var(--muted)">—</span>'}</td>
      <td>${statusBadge(w.status)}</td>
    </tr>
  `).join('');
  tableEl.style.display = '';
}

async function loadActivity() {
  document.getElementById('tab-panel-words').style.display = 'none';
  document.getElementById('tab-panel-activity').style.display = '';

  const data = await getJSON('/api/progress/activity');
  buildHeatmap(data);
}

function setActiveTab(activeBtn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
  activeBtn.classList.add('tab-btn--active');
}

(async function init() {
  try {
    const [me, profile] = await Promise.all([
      getJSON('/api/auth/me'),
      getJSON('/api/progress/profile'),
    ]);

    // Madalyalar (hata olursa sessizce gec)
    getJSON('/api/progress/medals').then((medals) => {
      const total = medals.gold + medals.silver + medals.bronze;
      if (total > 0) {
        document.getElementById('medal-gold').textContent  = medals.gold;
        document.getElementById('medal-total').textContent = total;
        document.getElementById('medals-section').style.display = '';
      }
    }).catch(() => {});

    // Avatar
    document.getElementById('avatar-circle').textContent = initials(me.displayName);
    document.getElementById('avatar-name').textContent   = me.displayName;
    document.getElementById('avatar-meta').textContent   = formatMemberSince(me.createdAt);

    // Stats
    document.getElementById('stat-known').textContent    = profile.stats.known.toLocaleString('tr-TR');
    document.getElementById('stat-learning').textContent = profile.stats.learning.toLocaleString('tr-TR');
    document.getElementById('stat-wrong').textContent    = profile.stats.wrong.toLocaleString('tr-TR');
    document.getElementById('stat-success').textContent  = `%${profile.stats.successRate}`;

    // Deck progress
    const listEl = document.getElementById('deck-progress-list');
    profile.decks.forEach((deck, i) => {
      const themeClass = DECK_THEME_ORDER[i] || 'purple';
      listEl.innerHTML += `
        <div class="deck-progress-item">
          <div class="deck-progress-header">
            <span class="deck-progress-name">${deck.title}</span>
            <span class="deck-progress-pct">%${deck.pct}</span>
          </div>
          <div class="deck-progress-bar-track">
            <div class="deck-progress-bar-fill" style="width:${deck.pct}%"></div>
          </div>
        </div>
      `;
    });

    document.getElementById('loading').style.display       = 'none';
    document.getElementById('profil-content').style.display = '';

    // Load first tab
    await loadWords('wrong');

    // Tab click handlers
    document.getElementById('tab-wrong').addEventListener('click', async (e) => {
      setActiveTab(e.currentTarget);
      await loadWords('wrong');
    });
    document.getElementById('tab-learning').addEventListener('click', async (e) => {
      setActiveTab(e.currentTarget);
      await loadWords('learning');
    });
    document.getElementById('tab-known').addEventListener('click', async (e) => {
      setActiveTab(e.currentTarget);
      await loadWords('known');
    });
    document.getElementById('tab-activity').addEventListener('click', async (e) => {
      setActiveTab(e.currentTarget);
      await loadActivity();
    });

    // Navbar buttons
    document.getElementById('notes-btn').addEventListener('click', () => {
      window.location.href = '/notes.html';
    });
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
      window.location.href = '/';
    });

  } catch (err) {
    // getJSON 401'de yönlendiriyor
  }
})();
