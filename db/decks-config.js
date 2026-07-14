// Tüm kelime desteleri burada tanımlanır. Yeni bir sınıf/seviye eklemek için
// buraya yeni bir obje eklemek ve data/ klasörüne ilgili JSON dosyasını koymak yeterli.

module.exports = [
  {
    slug: 'yokdil',
    title: 'YÖKDİL',
    description: 'YÖKDİL / YDS sınav hazırlık kelimeleri',
    requiresOwner: false,
    hasExplanation: true,
    sortOrder: 0,
    wordsFile: '../data/yokdil_words.json',
    unitNames: {
      1: 'Karma Kelimeler',
      2: 'Bağlaçlar',
      3: 'Sıfatlar',
      4: 'Zarflar',
    },
  },
  {
    slug: 'benim-kelimelerim',
    title: 'Benim Kelimelerim',
    description: '617 kelime',
    requiresOwner: true,
    hasExplanation: true,
    sortOrder: 1,
    wordsFile: '../data/words.json',
  },
  {
    slug: '5-sinif',
    title: '5. Sınıf',
    description: 'Üniteler halinde kelimeler',
    requiresOwner: false,
    hasExplanation: false,
    sortOrder: 2,
    wordsFile: '../data/grade5_words.json',
    unitNames: {
      1: 'Okul Hayatı',
      2: 'Sınıf Hayatı',
      3: 'Kişisel Hayat',
      4: 'Aile Hayatı',
      5: 'Mahalle ve Şehir Hayatı',
      6: 'Dünyada Hayat',
      7: 'Doğada Hayat',
      8: 'Evren ve Gelecekte Hayat',
    },
  },
  {
    slug: '8-sinif',
    title: '8. Sınıf',
    description: 'Üniteler halinde kelimeler',
    requiresOwner: false,
    hasExplanation: false,
    sortOrder: 3,
    wordsFile: '../data/grade8_unit1.json',
  },
];
