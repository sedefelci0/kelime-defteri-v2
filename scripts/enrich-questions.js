// scripts/enrich-questions.js
// Soru verisini temizler ve zenginleştirir: passage etiketleri, soru tipleri, cloze grupları.

const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/exam_questions.json');

const questions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// ─── Kaynak (source) alanı temizleme ─────────────────────────────────────────
function fixSource(src) {
  if (!src) return src;
  // Bozuk Türkçe karakter düzeltme: YÃ–KDÄ°L → YOKDIL
  return src
    .replace(/YÃ–KDÄ°L/g, 'YOKDIL')
    .replace(/YÃ–KDÄ/g,   'YOKDI')
    .replace(/Ã–/g, 'Ö')
    .replace(/Ä°/g, 'İ');
}

// ─── Regex desenleri ──────────────────────────────────────────────────────────

// Passage etiketi — köşeli parantez: [Foo passage] veya [Foo passage: snippet...]
// "passage" içeren köşeli parantez bloğundan adı çıkarır (snippet'i atar).
const SQUARE_PASSAGE_RE = /\s*\[([^\]:]+?passage[^\]:]*?)(?:\s*:[^\]]*)?\]\s*$/i;

// Passage etiketi — yuvarlak parantez: (Foo passage)
const PAREN_PASSAGE_RE = /\s*\(([^)]+?passage[^)]*?)\)\s*$/i;

// Anlam bütünlüğü soruları — 3 farklı biçim:
//   1) düz ASCII: "Anlam butunlugunu bozan cumleyi bulunuz."
//   2) bozuk encoding ile köşeli parantez: [Anlam bütünlüğünü bozan cümle]
const COHERENCE_RES = [
  /\s*Anlam butunlugunu bozan cumleyi bulunuz\.?\s*$/,
  /\s*\[Anlam[^\]]+bozan[^\]]+[cC][^\]]*le\]\s*$/i,
];

// Çeviri: Türkçe karşılığını bulunuz (İngilizce → Türkçe)
const TRANS_EN_TR_RE = /\s*\(Turkce karsiligini bulunuz\)\s*$/i;

// Çeviri: İngilizce karşılığını bulunuz (Türkçe → İngilizce)
//   Hem ASCII (Ingilizce) hem bozuk encoding formlarını (Ã§eviriyi) yakalar.
const TRANS_TR_EN_RES = [
  /\s*\(Ingilizce karsiligini bulunuz\)\s*$/i,
  /\s*\[En[^\]]+ngilizce[^\]]*eviriyi bulunuz\]\s*$/i,
];

// Cloze: metinde (21)---- … (30)---- kalıbı
const CLOZE_NUM_RE  = /\(\d{2}\)----/;
const CLOZE_IDX_RE  = /\((\d{2})\)----/;

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function testAny(text, res) {
  return res.some(re => re.test(text));
}

function removeAll(text, res) {
  return res.reduce((t, re) => t.replace(re, ''), text).trim();
}

function extractPassageTag(text) {
  let m = text.match(SQUARE_PASSAGE_RE);
  if (m) return { tag: m[1].trim(), cleaned: text.replace(SQUARE_PASSAGE_RE, '').trim() };
  m = text.match(PAREN_PASSAGE_RE);
  if (m) return { tag: m[1].trim(), cleaned: text.replace(PAREN_PASSAGE_RE, '').trim() };
  return null;
}

// Ortalama şık uzunluğu: vocabulary (kısa) vs sentence_completion (uzun) ayrımı
function avgOptionLen(q) {
  const vals = ['option_a','option_b','option_c','option_d','option_e']
    .filter(k => q[k]).map(k => q[k]);
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v.length, 0) / vals.length;
}

// ─── İstatistik sayaçları ────────────────────────────────────────────────────
const stats = {
  passage_tags:      0,
  coherence:         0,
  cloze:             0,
  reading:           0,
  translation_en_tr: 0,
  translation_tr_en: 0,
  sentence_completion: 0,
  vocabulary:        0,
  sources_fixed:     0,
};

// Cloze gruplandırması için: source → [{idx, cloeNum, passageTag, ref}]
const clozeBySource = {};

// ─── 1. GEÇİŞ: her soruyu işle ──────────────────────────────────────────────
const processed = questions.map((q, idx) => {
  const r = { ...q };

  // Kaynak alanını temizle
  const cleanedSrc = fixSource(r.source || '');
  if (cleanedSrc !== r.source) { r.source = cleanedSrc; stats.sources_fixed++; }

  let text = r.question_text || '';
  let passageTag  = null;
  let questionType = null;

  // — Anlam bütünlüğü (coherence) —
  if (testAny(text, COHERENCE_RES)) {
    text = removeAll(text, COHERENCE_RES);
    r.question_text = text;
    questionType = 'coherence';
    stats.coherence++;
  }
  // — Çeviri: EN → TR —
  else if (TRANS_EN_TR_RE.test(text)) {
    text = text.replace(TRANS_EN_TR_RE, '').trim();
    r.question_text = text;
    questionType = 'translation_en_tr';
    stats.translation_en_tr++;
  }
  // — Çeviri: TR → EN —
  else if (testAny(text, TRANS_TR_EN_RES)) {
    text = removeAll(text, TRANS_TR_EN_RES);
    r.question_text = text;
    questionType = 'translation_tr_en';
    stats.translation_tr_en++;
  }
  // — Diğer tipler —
  else {
    // Passage etiketi çıkar (cloze + reading soruları için)
    const pt = extractPassageTag(text);
    if (pt) {
      passageTag      = pt.tag;
      text            = pt.cleaned;
      r.question_text = text;
      r.passage_tag   = passageTag;
      r.passage_text  = null;
      stats.passage_tags++;
    }

    // Cloze: (NN)----
    if (CLOZE_NUM_RE.test(text)) {
      questionType = 'cloze';
      stats.cloze++;
      const numMatch = text.match(CLOZE_IDX_RE);
      const cloeNum  = numMatch ? parseInt(numMatch[1], 10) : null;
      const srcKey   = r.source || '__unknown__';
      if (!clozeBySource[srcKey]) clozeBySource[srcKey] = [];
      clozeBySource[srcKey].push({ idx, cloeNum, passageTag, ref: r });
    }
    // Reading: passage etiketi var, cloze değil
    else if (passageTag) {
      questionType = 'reading';
      stats.reading++;
    }
    // YOKDIL/YDS sorusu + boşluk içeriyor → vocab veya sentence_completion
    else if (r.restrict_deck_slug && text.includes('----')) {
      if (avgOptionLen(q) > 50) {
        questionType = 'sentence_completion';
        stats.sentence_completion++;
      } else {
        questionType = 'vocabulary';
        stats.vocabulary++;
      }
    }
    // LGS soruları: soru tipi atanmaz (çok çeşitli, ayrıca tasnif edilebilir)
  }

  if (questionType) r.question_type = questionType;
  return r;
});

// ─── 2. GEÇİŞ: cloze gruplarını yay ─────────────────────────────────────────
// Her kaynak içindeki cloze sorularını dosyadaki sıraya göre diz,
// passage etiketini ileriye taşı; büyük idx boşluğu yeni gruba işaret eder.

for (const srcKey of Object.keys(clozeBySource)) {
  const items = clozeBySource[srcKey].sort((a, b) => a.idx - b.idx);

  let currentGroupTag = null;
  let prevIdx         = null;

  for (const item of items) {
    // Büyük idx boşluğu (>10) = farklı soru seti, grup sıfırla
    if (prevIdx !== null && item.idx > prevIdx + 10) {
      currentGroupTag = null;
    }

    // Bu sorunun kendi passage etiketi varsa grubu güncelle
    if (item.passageTag) {
      currentGroupTag = item.passageTag;
    }

    item.ref.cloze_group = currentGroupTag;

    // passage_tag ve passage_text'i gruba dahil tüm sorulara ekle
    if (currentGroupTag) {
      if (!item.ref.passage_tag) {
        item.ref.passage_tag  = currentGroupTag;
        item.ref.passage_text = null;
      }
    }

    prevIdx = item.idx;
  }
}

// ─── Yaz ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(DATA_FILE, JSON.stringify(processed, null, 4), 'utf8');

// ─── Özet ─────────────────────────────────────────────────────────────────────
const typed = processed.filter(q => q.question_type).length;
const untyped = processed.length - typed;

console.log('\n=== exam_questions.json temizlendi ===');
console.log(`Toplam soru             : ${processed.length}`);
console.log(`Kaynak (source) düzeltme: ${stats.sources_fixed}`);
console.log(`Passage etiketi çıkarma : ${stats.passage_tags}`);
console.log('');
console.log('Soru tipleri:');
console.log(`  vocabulary           : ${stats.vocabulary}`);
console.log(`  sentence_completion  : ${stats.sentence_completion}`);
console.log(`  cloze                : ${stats.cloze}`);
console.log(`  reading              : ${stats.reading}`);
console.log(`  coherence            : ${stats.coherence}`);
console.log(`  translation_en_tr    : ${stats.translation_en_tr}`);
console.log(`  translation_tr_en    : ${stats.translation_tr_en}`);
console.log(`  Toplam etiketlenen   : ${typed}`);
console.log(`  Etiket verilmedi (LGS): ${untyped}`);
