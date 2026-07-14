const params = new URLSearchParams(window.location.search);
const deckSlug = params.get('deck');
const unitParam = params.get('unit');

if (!deckSlug || !unitParam) {
  window.location.href = '/decks.html';
}

const loadingEl = document.getElementById('loading');
const comingSoonEl = document.getElementById('coming-soon');
const contentEl = document.getElementById('topics-content');
const titleEl = document.getElementById('topics-title');
const listEl = document.getElementById('activities-list');
const finishZoneEl = document.getElementById('finish-zone');
const finishBtn = document.getElementById('finish-btn');
const scoreResultEl = document.getElementById('score-result');
const scoreTitleEl = document.getElementById('score-title');
const scoreDetailEl = document.getElementById('score-detail');
const scoreEmojiEl = document.getElementById('score-emoji');
const progressPillEl = document.getElementById('progress-pill');
const progressPillTextEl = document.getElementById('progress-pill-text');

let activities = [];
// Her aktivite için: { scorable, done, correct, points, correctPoints }
let activityMeta = [];

function showOnly(el) {
  [loadingEl, comingSoonEl, contentEl].forEach((e) => { e.style.display = e === el ? '' : 'none'; });
}

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
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

function goToUnits() {
  window.location.href = `/decks.html`;
}

document.getElementById('back-btn').addEventListener('click', goToUnits);
document.getElementById('coming-soon-back').addEventListener('click', goToUnits);
document.getElementById('score-back-btn').addEventListener('click', goToUnits);
document.getElementById('score-retry-btn').addEventListener('click', () => window.location.reload());
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

function updateProgress() {
  const totalAttempted = activityMeta.filter((m) => m.done).length;
  progressPillTextEl.textContent = `${totalAttempted} / ${activityMeta.length} tamamlandı`;
  progressPillEl.style.display = '';

  const scorableItems = activityMeta.filter((m) => m.scorable);
  const allScorableDone = scorableItems.length === 0 || scorableItems.every((m) => m.done);
  finishBtn.disabled = !allScorableDone;
  finishBtn.textContent = allScorableDone ? 'Skoru Gör' : 'Önce tüm soruları tamamla';
}

function markDone(index, correctPoints, totalPoints, extra) {
  activityMeta[index].done = true;
  activityMeta[index].correctPoints = correctPoints;
  activityMeta[index].points = totalPoints;
  if (extra) Object.assign(activityMeta[index], extra);
  updateProgress();
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// --- Aktivite tipleri ---

function renderPersonal(activity, index) {
  const card = document.createElement('div');
  card.className = 'activity-card activity-personal';

  card.innerHTML = `
    <div class="activity-badge activity-badge-personal">Kişisel Soru</div>
    <div class="activity-question">${activity.question}</div>
    <div class="activity-question-tr">${activity.questionTr || ''}</div>
    <textarea class="personal-answer-input" placeholder="Cevabını buraya yaz…" rows="2"></textarea>
    <div class="personal-answer-actions">
      <button class="btn btn-primary submit-btn" type="button">Gönder</button>
    </div>
    <div class="personal-submit-feedback" hidden></div>
    <div class="reveal-zone" hidden>
      <button class="btn btn-secondary reveal-btn" type="button">Örnek Cevabı Gör</button>
      <div class="model-answer" hidden>
        <div class="model-answer-en">${activity.modelAnswer}</div>
        <div class="model-answer-tr">${activity.modelAnswerTr || ''}</div>
      </div>
    </div>
  `;

  const textareaEl = card.querySelector('.personal-answer-input');
  const submitBtn = card.querySelector('.submit-btn');
  const feedbackEl = card.querySelector('.personal-submit-feedback');
  const revealZoneEl = card.querySelector('.reveal-zone');
  const revealBtn = card.querySelector('.reveal-btn');
  const modelAnswerEl = card.querySelector('.model-answer');

  submitBtn.addEventListener('click', async () => {
    const answer = textareaEl.value.trim();
    if (!answer) {
      feedbackEl.hidden = false;
      feedbackEl.className = 'personal-submit-feedback is-wrong';
      feedbackEl.textContent = 'Göndermeden önce bir cevap yaz.';
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Gönderiliyor…';
    try {
      await postJSON(`/api/topics/${deckSlug}/${unitParam}/personal-answer`, {
        question: activity.question,
        answer,
      });
      textareaEl.disabled = true;
      submitBtn.textContent = '✓ Gönderildi';
      feedbackEl.hidden = false;
      feedbackEl.className = 'personal-submit-feedback is-correct';
      feedbackEl.textContent = 'Cevabın öğretmenine gönderildi.';
      revealZoneEl.hidden = false;
      markDone(index, 0, 0);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Gönder';
      feedbackEl.hidden = false;
      feedbackEl.className = 'personal-submit-feedback is-wrong';
      feedbackEl.textContent = 'Gönderilemedi, tekrar dene.';
    }
  });

  revealBtn.addEventListener('click', () => {
    modelAnswerEl.hidden = false;
    revealBtn.disabled = true;
    revealBtn.textContent = '✓ Örnek cevap gösterildi';
  });

  return card;
}

function renderMC(activity, index) {
  const card = document.createElement('div');
  card.className = 'activity-card';
  card.innerHTML = `
    <div class="activity-badge activity-badge-mc">Çoktan Seçmeli</div>
    <div class="activity-question">${activity.prompt}</div>
    <div class="quiz-options activity-mc-options"></div>
    <div class="activity-explanation" hidden></div>
  `;

  const optionsEl = card.querySelector('.activity-mc-options');
  const explanationEl = card.querySelector('.activity-explanation');
  let answered = false;

  // Şıklar her gösterimde karıştırılır, doğru cevap her zaman ilk şıkta olmasın diye.
  const order = shuffleArray(activity.options.map((_, i) => i));

  order.forEach((originalIndex) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option activity-option';
    btn.type = 'button';
    btn.textContent = activity.options[originalIndex];
    btn.dataset.originalIndex = String(originalIndex);
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const isCorrect = originalIndex === activity.correctIndex;
      const allBtns = Array.from(optionsEl.querySelectorAll('.activity-option'));
      allBtns.forEach((b) => {
        b.disabled = true;
        if (Number(b.dataset.originalIndex) === activity.correctIndex) b.classList.add('is-correct');
        else if (b === btn) b.classList.add('is-wrong');
      });
      if (activity.explanation) {
        explanationEl.textContent = activity.explanation;
        explanationEl.hidden = false;
      }
      markDone(index, isCorrect ? 1 : 0, 1, { explanation: !isCorrect ? (activity.explanation || null) : null });
    });
    optionsEl.appendChild(btn);
  });

  return card;
}

function renderTF(activity, index) {
  const card = document.createElement('div');
  card.className = 'activity-card';
  card.innerHTML = `
    <div class="activity-badge activity-badge-tf">Doğru / Yanlış</div>
    <div class="activity-question">${activity.statement}</div>
    <div class="quiz-options activity-tf-options"></div>
    <div class="activity-explanation" hidden></div>
  `;

  const optionsEl = card.querySelector('.activity-tf-options');
  const explanationEl = card.querySelector('.activity-explanation');
  let answered = false;

  [['Doğru', true], ['Yanlış', false]].forEach(([label, value]) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option activity-option';
    btn.type = 'button';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const isCorrect = value === activity.correct;
      const allBtns = Array.from(optionsEl.querySelectorAll('.activity-option'));
      allBtns.forEach((b) => {
        b.disabled = true;
        const bIsTrueBtn = b.textContent === 'Doğru';
        if (bIsTrueBtn === activity.correct) b.classList.add('is-correct');
        else if (b === btn) b.classList.add('is-wrong');
      });
      if (activity.explanation) {
        explanationEl.textContent = activity.explanation;
        explanationEl.hidden = false;
      }
      markDone(index, isCorrect ? 1 : 0, 1, { explanation: !isCorrect ? (activity.explanation || null) : null });
    });
    optionsEl.appendChild(btn);
  });

  return card;
}

function renderFillBlank(activity, index) {
  const card = document.createElement('div');
  card.className = 'activity-card';
  card.innerHTML = `
    <div class="activity-badge activity-badge-fill">Boşluk Doldurma</div>
    <div class="activity-question">${activity.prompt}</div>
    <div class="fill-blank-row">
      <input type="text" class="fill-blank-input" autocomplete="off" placeholder="Cevabını yaz…" />
      <button class="btn btn-secondary fill-blank-check" type="button">Kontrol Et</button>
    </div>
    <div class="fill-blank-feedback" hidden></div>
  `;

  const inputEl = card.querySelector('.fill-blank-input');
  const checkBtn = card.querySelector('.fill-blank-check');
  const feedbackEl = card.querySelector('.fill-blank-feedback');
  let solved = false;
  let attemptCount = 0;

  function normalize(s) {
    return s.trim().toLowerCase().replace(/['’]/g, "'");
  }

  function check() {
    if (solved) return;
    attemptCount += 1;
    const candidates = [activity.answer, ...(activity.altAnswers || [])].map(normalize);
    const isCorrect = candidates.includes(normalize(inputEl.value));
    feedbackEl.hidden = false;
    if (isCorrect) {
      solved = true;
      inputEl.disabled = true;
      checkBtn.disabled = true;
      inputEl.classList.add('is-correct');
      feedbackEl.className = 'fill-blank-feedback is-correct';
      feedbackEl.textContent = '✓ Doğru!';
      markDone(index, 1, 1);
      postJSON(`/api/topics/${deckSlug}/${unitParam}/fillblank-attempt`, {
        prompt: activity.prompt,
        attempts: attemptCount,
        type: 'fill_blank',
      }).catch(() => {});
    } else {
      feedbackEl.className = 'fill-blank-feedback is-wrong';
      feedbackEl.textContent = 'Tekrar dene…';
      inputEl.classList.add('is-wrong');
      setTimeout(() => inputEl.classList.remove('is-wrong'), 600);
    }
  }

  checkBtn.addEventListener('click', check);
  inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });

  return card;
}

function renderMatching(activity, index) {
  const card = document.createElement('div');
  card.className = 'activity-card activity-matching-card';
  card.innerHTML = `
    <div class="activity-badge activity-badge-matching">Eşleştirme</div>
    <div class="activity-question">İngilizceyi Türkçesiyle eşleştir</div>
    <div class="matching-grid">
      <div class="matching-col matching-col-en"></div>
      <div class="matching-col matching-col-tr"></div>
    </div>
  `;

  const pairs = activity.pairs;
  const leftOrder = pairs.map((_, i) => i);
  const rightOrder = shuffleArray(pairs.map((_, i) => i));

  const leftColEl = card.querySelector('.matching-col-en');
  const rightColEl = card.querySelector('.matching-col-tr');

  let selectedLeft = null;
  let selectedRight = null;
  let matchedCount = 0;
  let wrongAttempts = 0; // yanlış eşleştirme denemesi sayısı — "kaçıncı denemede tamamladı" için

  function makeItem(pairIndex, text, side) {
    const btn = document.createElement('button');
    btn.className = 'matching-item';
    btn.type = 'button';
    btn.textContent = text;
    btn.dataset.pairIndex = String(pairIndex);
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-matched')) return;
      if (side === 'left') {
        if (selectedLeft) selectedLeft.classList.remove('is-selected');
        selectedLeft = btn;
      } else {
        if (selectedRight) selectedRight.classList.remove('is-selected');
        selectedRight = btn;
      }
      btn.classList.add('is-selected');

      if (selectedLeft && selectedRight) {
        const isMatch = selectedLeft.dataset.pairIndex === selectedRight.dataset.pairIndex;
        if (isMatch) {
          selectedLeft.classList.remove('is-selected');
          selectedRight.classList.remove('is-selected');
          selectedLeft.classList.add('is-matched');
          selectedRight.classList.add('is-matched');
          matchedCount += 1;
          selectedLeft = null;
          selectedRight = null;
          if (matchedCount === pairs.length) {
            markDone(index, pairs.length, pairs.length);
            postJSON(`/api/topics/${deckSlug}/${unitParam}/fillblank-attempt`, {
              prompt: activityMeta[index].promptText,
              attempts: wrongAttempts + 1,
              type: 'matching',
            }).catch(() => {});
          }
        } else {
          wrongAttempts += 1;
          const wrongLeft = selectedLeft;
          const wrongRight = selectedRight;
          wrongLeft.classList.add('is-wrong-flash');
          wrongRight.classList.add('is-wrong-flash');
          setTimeout(() => {
            wrongLeft.classList.remove('is-selected', 'is-wrong-flash');
            wrongRight.classList.remove('is-selected', 'is-wrong-flash');
          }, 500);
          selectedLeft = null;
          selectedRight = null;
        }
      }
    });
    return btn;
  }

  leftOrder.forEach((pairIndex) => leftColEl.appendChild(makeItem(pairIndex, pairs[pairIndex].en, 'left')));
  rightOrder.forEach((pairIndex) => rightColEl.appendChild(makeItem(pairIndex, pairs[pairIndex].tr, 'right')));

  return card;
}

const RENDERERS = {
  personal: renderPersonal,
  mc: renderMC,
  tf: renderTF,
  fill_blank: renderFillBlank,
  matching: renderMatching,
};

function scorablePointsFor(activity) {
  if (activity.type === 'personal') return 0;
  if (activity.type === 'matching') return activity.pairs.length;
  return 1;
}

function promptTextFor(activity, index) {
  if (activity.type === 'tf') return activity.statement;
  // Bir ünitede birden fazla eşleştirme aktivitesi olabilir (Ünite 3'te olduğu gibi),
  // bu yüzden index ile ayırt ediyoruz — hem etiket için hem deneme kaydı için tekil olsun.
  if (activity.type === 'matching') return `Eşleştirme #${index + 1}`;
  return activity.prompt || '';
}

function renderActivities() {
  listEl.innerHTML = '';
  activityMeta = activities.map((a, index) => ({
    scorable: a.type !== 'personal',
    done: false,
    correctPoints: 0,
    points: scorablePointsFor(a),
    activityType: a.type,
    promptText: promptTextFor(a, index),
    explanation: null,
  }));

  activities.forEach((activity, index) => {
    const renderer = RENDERERS[activity.type];
    if (!renderer) return;
    listEl.appendChild(renderer(activity, index));
  });

  updateProgress();
}

finishBtn.addEventListener('click', async () => {
  const totalScore = activityMeta.reduce((sum, m) => sum + m.points, 0);
  const correctScore = activityMeta.reduce((sum, m) => sum + m.correctPoints, 0);

  const details = activityMeta
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => m.scorable)
    .map(({ m, index }) => ({
      index,
      type: m.activityType,
      prompt: m.promptText,
      isCorrect: m.points > 0 ? m.correctPoints === m.points : true,
      explanation: m.explanation || null,
    }));

  finishBtn.disabled = true;
  try {
    if (totalScore > 0) {
      await postJSON(`/api/topics/${deckSlug}/${unitParam}/complete`, { score: correctScore, total: totalScore, details });
    }
  } catch (err) {
    // Skor kaydedilemese bile öğrenciye sonucu göstermeye devam ederiz.
  }

  finishZoneEl.style.display = 'none';
  progressPillEl.style.display = 'none';
  const pct = totalScore > 0 ? Math.round((correctScore / totalScore) * 100) : 100;
  scoreEmojiEl.textContent = pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪';
  scoreTitleEl.textContent = totalScore > 0 ? `${correctScore} / ${totalScore} doğru` : 'Tamamlandı!';
  scoreDetailEl.textContent = totalScore > 0
    ? `%${pct} başarı — harika çalıştın!`
    : 'Kişisel sorularını gözden geçirdin.';
  scoreResultEl.style.display = '';
});

async function init() {
  try {
    await getJSON('/api/auth/me');

    const data = await getJSON(`/api/topics/${deckSlug}/${unitParam}`);
    if (data.comingSoon) {
      showOnly(comingSoonEl);
      return;
    }

    activities = data.activities;
    titleEl.textContent = data.theme ? `Ünite ${unitParam} — ${data.theme}` : `Ünite ${unitParam}`;
    renderActivities();
    showOnly(contentEl);
  } catch (err) {
    // getJSON zaten 401'de yönlendiriyor
  }
}

init();
