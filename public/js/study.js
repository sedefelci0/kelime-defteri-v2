const params = new URLSearchParams(window.location.search);
const deckSlug = params.get('deck');
const unitParam = params.get('unit');

if (!deckSlug) {
  window.location.href = '/decks.html';
}

let allWords = [];
let currentIndex = 0;
let deckInfo = { hasExplanation: true, title: 'Kelime Defteri' };

let totalStudySeconds = 0;
let sessionSeconds = 0; // bu sayfa açıldığından beri geçen, henüz sunucuya gönderilmemiş süre

let quizActive = false;
let quizQueue = [];
let quizPos = 0;

const loadingEl = document.getElementById('loading');
const cardZoneEl = document.getElementById('card-zone');
const emptyStateEl = document.getElementById('empty-state');
const quizZoneEl = document.getElementById('quiz-zone');

const flipCardEl = document.getElementById('flip-card');
const cardCounterEl = document.getElementById('card-counter');
const wordEnglishEl = document.getElementById('word-english');
const wordPronEl = document.getElementById('word-pron');
const wordExplanationEl = document.getElementById('word-explanation');
const wordMeaningEl = document.getElementById('word-meaning');
const wordExampleEl = document.getElementById('word-example');

const questionsAccordionEl = document.getElementById('questions-accordion');

const btnAgain = document.getElementById('btn-again');
const btnKnow = document.getElementById('btn-know');
const navFirst = document.getElementById('nav-first');
const navPrev = document.getElementById('nav-prev');
const navNext = document.getElementById('nav-next');
const navLast = document.getElementById('nav-last');

function showOnly(el) {
  [loadingEl, cardZoneEl, emptyStateEl, quizZoneEl].forEach((e) => {
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

function resetQuestions() {
  questionsAccordionEl.style.display = 'none';
  questionsAccordionEl.innerHTML = '';
}

function buildAccordionItem(q, index) {
  const item = document.createElement('div');
  item.className = 'accordion-item';

  const header = document.createElement('button');
  header.className = 'accordion-header';
  header.type = 'button';
  const sourceLabel = q.source ? `<span class="accordion-source">${q.source}</span>` : '';
  header.innerHTML = `<span class="accordion-num">Soru ${index + 1}</span>${sourceLabel}<span class="accordion-arrow">›</span>`;

  const body = document.createElement('div');
  body.className = 'accordion-body';
  body.hidden = true;

  const qText = document.createElement('div');
  qText.className = 'question-text';
  qText.textContent = q.question_text;
  body.appendChild(qText);

  const optionsEl = document.createElement('div');
  optionsEl.className = 'question-options';

  const opts = [['A', q.option_a], ['B', q.option_b], ['C', q.option_c], ['D', q.option_d]];
  if (q.option_e) opts.push(['E', q.option_e]);

  let answered = false;
  opts.forEach(([letter, text]) => {
    const btn = document.createElement('button');
    btn.className = 'question-option';
    btn.type = 'button';
    btn.textContent = text;
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const allBtns = Array.from(optionsEl.querySelectorAll('.question-option'));
      allBtns.forEach((b, i) => {
        b.disabled = true;
        if (opts[i][0] === q.correct_option) b.classList.add('is-correct');
        else if (b === btn) b.classList.add('is-wrong');
      });
      if (q.explanation) {
        const expEl = document.createElement('div');
        expEl.className = 'question-explanation';
        expEl.textContent = q.explanation;
        body.appendChild(expEl);
      }
    });
    optionsEl.appendChild(btn);
  });
  body.appendChild(optionsEl);

  header.addEventListener('click', () => {
    const isOpen = !body.hidden;
    body.hidden = isOpen;
    header.classList.toggle('is-open', !isOpen);
  });

  item.appendChild(header);
  item.appendChild(body);
  return item;
}

function showQuestionsAccordion(questions) {
  if (!questions || questions.length === 0) return;
  questionsAccordionEl.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'accordion-heading';
  heading.textContent = `Sınav Soruları (${questions.length})`;
  questionsAccordionEl.appendChild(heading);

  questions.forEach((q, i) => questionsAccordionEl.appendChild(buildAccordionItem(q, i)));

  const nextBtn = document.createElement('button');
  nextBtn.className = 'accordion-next-btn';
  nextBtn.type = 'button';
  nextBtn.textContent = 'Sonraki kelime →';
  nextBtn.addEventListener('click', () => {
    if (currentIndex < allWords.length - 1) {
      currentIndex += 1;
    }
    renderCard();
  });
  questionsAccordionEl.appendChild(nextBtn);

  questionsAccordionEl.style.display = '';
}

function renderCard() {
  const word = allWords[currentIndex];
  if (!word) return;
  flipCardEl.classList.remove('is-flipped');
  resetQuestions();

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

// --- Sesli okuma (tarayıcının kendi text-to-speech özelliği, dosya gerektirmez) ---
function speakEnglish(text) {
  if (!text) return;
  if (!('speechSynthesis' in window)) {
    alert('Tarayıcın sesli okumayı desteklemiyor.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

document.getElementById('speak-word-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const word = allWords[currentIndex];
  if (word) speakEnglish(word.english);
});
document.getElementById('speak-example-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const word = allWords[currentIndex];
  if (word) speakEnglish(word.example_sentence);
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
    if (knewIt && word.questions && word.questions.length > 0) {
      showQuestionsAccordion(word.questions);
      questionsAccordionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      if (currentIndex < allWords.length - 1) currentIndex += 1;
      renderCard();
    }
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
document.getElementById('notes-btn').addEventListener('click', () => {
  const sidebar = document.querySelector('.notes-sidebar');
  if (sidebar) sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

// --- Notlar (sağ panel + modal) ---
const sidebarNotesListEl = document.getElementById('sidebar-notes-list');
const noteModal = document.getElementById('note-modal');
const noteModalTitleEl = document.getElementById('note-modal-title');
const noteModalContentEl = document.getElementById('note-modal-content');
const noteModalDeleteBtn = document.getElementById('note-modal-delete');
let sidebarNotes = [];
let currentNoteId = null;

async function sendJSON(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error('İstek başarısız');
  return res.json();
}

function noteSnippet(note) {
  return (note.content || '').replace(/\n/g, ' ').slice(0, 50);
}

function renderSidebarNotes() {
  sidebarNotesListEl.innerHTML = '';
  if (sidebarNotes.length === 0) {
    sidebarNotesListEl.innerHTML = '<p class="notes-empty-hint">Henüz not yok. "+" ile ekle.</p>';
    return;
  }
  sidebarNotes.forEach((note) => {
    const item = document.createElement('button');
    item.className = 'sidebar-note-item';
    const title = note.title && note.title.trim() ? note.title : '(Başlıksız not)';
    item.innerHTML = `
      <div class="sidebar-note-title">${title}</div>
      <div class="sidebar-note-snippet">${noteSnippet(note)}</div>
    `;
    item.addEventListener('click', () => openNoteModal(note));
    sidebarNotesListEl.appendChild(item);
  });
}

async function loadSidebarNotes() {
  try {
    sidebarNotes = await getJSON('/api/notes');
    renderSidebarNotes();
  } catch (err) {
    sidebarNotesListEl.innerHTML = '<p class="notes-empty-hint">Notlar yüklenemedi.</p>';
  }
}

function openNoteModal(note) {
  if (note) {
    currentNoteId = note.id;
    noteModalTitleEl.value = note.title || '';
    noteModalContentEl.value = note.content || '';
    noteModalDeleteBtn.style.display = '';
  } else {
    currentNoteId = null;
    noteModalTitleEl.value = '';
    noteModalContentEl.value = '';
    noteModalDeleteBtn.style.display = 'none';
  }
  noteModal.style.display = 'flex';
  noteModalContentEl.focus();
}

document.getElementById('sidebar-add-note-btn').addEventListener('click', () => openNoteModal(null));
document.getElementById('note-modal-cancel').addEventListener('click', () => {
  noteModal.style.display = 'none';
});

document.getElementById('note-modal-save').addEventListener('click', async () => {
  const title = noteModalTitleEl.value;
  const content = noteModalContentEl.value;
  try {
    if (currentNoteId) {
      await sendJSON(`/api/notes/${currentNoteId}`, 'PUT', { title, content });
    } else {
      await sendJSON('/api/notes', 'POST', { title, content });
    }
    noteModal.style.display = 'none';
    await loadSidebarNotes();
  } catch (err) {
    alert('Not kaydedilemedi, tekrar dene.');
  }
});

noteModalDeleteBtn.addEventListener('click', async () => {
  if (!currentNoteId) return;
  if (!confirm('Bu notu silmek istediğine emin misin?')) return;
  try {
    await sendJSON(`/api/notes/${currentNoteId}`, 'DELETE');
    noteModal.style.display = 'none';
    await loadSidebarNotes();
  } catch (err) {
    alert('Not silinemedi, tekrar dene.');
  }
});

// --- Quiz modu ---
const QUIZ_SESSION_SIZE = 15;
const quizToggleBtn = document.getElementById('quiz-toggle-btn');
const quizCounterEl = document.getElementById('quiz-counter');
const quizEyebrowEl = document.getElementById('quiz-eyebrow');
const quizPromptEl = document.getElementById('quiz-prompt');
const quizPromptSubEl = document.getElementById('quiz-prompt-sub');
const quizOptionsEl = document.getElementById('quiz-options');
const quizNextBtn = document.getElementById('quiz-next-btn');
const quizDoneEl = document.getElementById('quiz-done');
const quizDoneScoreEl = document.getElementById('quiz-done-score');

let quizCorrectCount = 0;
let quizWrongCount = 0;

function shuffleQuiz(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function quizStorageKey() {
  return `quizRemaining:${deckSlug}:${unitParam || 'all'}`;
}

function loadRemainingIds() {
  try {
    const raw = localStorage.getItem(quizStorageKey());
    const ids = raw ? JSON.parse(raw) : null;
    return Array.isArray(ids) && ids.length > 0 ? ids : null;
  } catch (err) {
    return null;
  }
}

function saveRemainingIds(ids) {
  try {
    localStorage.setItem(quizStorageKey(), JSON.stringify(ids));
  } catch (err) {
    // localStorage kullanılamıyorsa (gizli sekme vs.) sessizce geç, quiz yine çalışır
  }
}

function startQuizSession() {
  let remainingIds = loadRemainingIds();
  if (!remainingIds) {
    remainingIds = shuffleQuiz(allWords.map((w) => w.id));
  }

  const sessionIds = remainingIds.slice(0, QUIZ_SESSION_SIZE);
  const leftoverIds = remainingIds.slice(QUIZ_SESSION_SIZE);
  saveRemainingIds(leftoverIds);

  quizQueue = sessionIds.map((id) => allWords.find((w) => w.id === id)).filter(Boolean);
  quizPos = 0;
  quizCorrectCount = 0;
  quizWrongCount = 0;

  quizDoneEl.style.display = 'none';
  quizOptionsEl.style.display = '';
  document.querySelector('.quiz-prompt-card').style.display = '';

  showOnly(quizZoneEl);
  renderQuizQuestion();
}

quizToggleBtn.addEventListener('click', () => {
  if (allWords.length < 4) {
    alert('Quiz için en az 4 kelime gerekiyor.');
    return;
  }
  quizActive = !quizActive;
  if (quizActive) {
    quizToggleBtn.textContent = 'Kart modu';
    startQuizSession();
  } else {
    quizToggleBtn.textContent = 'Quiz modu';
    renderCard();
  }
});

function renderQuizQuestion() {
  const word = quizQueue[quizPos];
  const direction = Math.random() < 0.5 ? 'en-to-tr' : 'tr-to-en';

  let correctAnswer, promptText, promptSub, optionPool;
  if (direction === 'en-to-tr') {
    quizEyebrowEl.textContent = 'Bu kelimenin Türkçesi ne?';
    promptText = word.english;
    promptSub = word.pronunciation;
    correctAnswer = word.turkish_meaning;
    optionPool = allWords.filter((w) => w.id !== word.id).map((w) => w.turkish_meaning);
  } else {
    quizEyebrowEl.textContent = 'Bunun İngilizcesi ne?';
    promptText = word.turkish_meaning;
    promptSub = '';
    correctAnswer = word.english;
    optionPool = allWords.filter((w) => w.id !== word.id).map((w) => w.english);
  }

  quizPromptEl.textContent = promptText;
  quizPromptSubEl.textContent = promptSub;
  quizCounterEl.textContent = `Soru ${quizPos + 1} / ${quizQueue.length}`;

  const distractors = shuffleQuiz([...new Set(optionPool.filter((o) => o !== correctAnswer))]).slice(0, 3);
  const options = shuffleQuiz([correctAnswer, ...distractors]);

  quizOptionsEl.innerHTML = '';
  quizNextBtn.style.display = 'none';
  document.getElementById('quiz-roast').style.display = 'none';

  options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => handleQuizAnswer(word, opt, correctAnswer, btn));
    quizOptionsEl.appendChild(btn);
  });
}

async function handleQuizAnswer(word, chosen, correctAnswer, chosenBtn) {
  const allButtons = Array.from(quizOptionsEl.querySelectorAll('.quiz-option'));
  allButtons.forEach((b) => { b.disabled = true; });

  const isCorrect = chosen === correctAnswer;
  if (isCorrect) quizCorrectCount += 1; else quizWrongCount += 1;

  allButtons.forEach((b) => {
    if (b.textContent === correctAnswer) {
      b.classList.add('is-correct');
    } else if (b === chosenBtn && !isCorrect) {
      b.classList.add('is-wrong');
    } else {
      b.classList.add('is-dimmed');
    }
  });

  const roastEl = document.getElementById('quiz-roast');
  if (!isCorrect && deckSlug === 'benim-kelimelerim') {
    roastEl.textContent = 'Slk mısın? Bunu mu çözemedin? 😅';
    roastEl.style.display = '';
  } else {
    roastEl.style.display = 'none';
  }

  try {
    const result = await postJSON(`/api/progress/${word.id}`, { knewIt: isCorrect });
    word.status = result.status;
    word.times_correct = result.timesCorrect;
    word.times_wrong = result.timesWrong;
    await loadSummary();
  } catch (err) {
    // sessizce geç, quiz akışını bozmayalım
  }

  if (quizPos < quizQueue.length - 1) {
    quizNextBtn.style.display = '';
  } else {
    quizNextBtn.style.display = 'none';
    showQuizDone();
  }
}

function showQuizDone() {
  quizOptionsEl.style.display = 'none';
  document.querySelector('.quiz-prompt-card').style.display = 'none';
  quizDoneScoreEl.textContent = `${quizCorrectCount} doğru, ${quizWrongCount} yanlış (${quizQueue.length} soru)`;
  const remaining = loadRemainingIds();
  document.getElementById('quiz-done-again').textContent = remaining
    ? `Devam et (${Math.min(QUIZ_SESSION_SIZE, remaining.length)} soru daha)`
    : 'Yeni tur başlat (baştan, 15 soru)';
  quizDoneEl.style.display = '';
}

quizNextBtn.addEventListener('click', () => {
  quizPos += 1;
  renderQuizQuestion();
});

document.getElementById('quiz-done-cards').addEventListener('click', () => {
  quizActive = false;
  quizToggleBtn.textContent = 'Quiz modu';
  renderCard();
});
document.getElementById('quiz-done-again').addEventListener('click', () => {
  startQuizSession();
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

    await loadSidebarNotes();

    if (allWords.length === 0) {
      showOnly(emptyStateEl);
      return;
    }
    if (allWords.length < 4) {
      quizToggleBtn.disabled = true;
      quizToggleBtn.title = 'Quiz için en az 4 kelime gerekiyor';
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
