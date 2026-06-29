// Kayıt formunda seçilebilecek geçerli sınıflar. Yeni bir sınıf eklemek/çıkarmak
// için sadece bu listeyi düzenlemek yeterli (hem kayıt doğrulaması hem öğretmen
// paneli filtrelemesi burayı kullanır).

const GRADES = [5, 6, 7, 8];
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

const CLASS_LIST = [];
for (const grade of GRADES) {
  for (const section of SECTIONS) {
    CLASS_LIST.push(`${grade}-${section}`);
  }
}

module.exports = CLASS_LIST;
