// Tüm kelime desteleri burada tanımlanır. Yeni bir sınıf/seviye eklemek için
// buraya yeni bir obje eklemek ve data/ klasörüne ilgili JSON dosyasını koymak yeterli.

module.exports = [
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
