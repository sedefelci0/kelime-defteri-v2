// Kayıt formunda seçilebilecek geçerli sınıflar. Yeni bir sınıf eklemek/çıkarmak
// için sadece bu listeyi düzenlemek yeterli (hem kayıt doğrulaması hem öğretmen
// paneli filtrelemesi burayı kullanır).
//
// STUDENT_CLASSES: gerçek öğrenci sınıfları (öğretmen paneli filtresinde kullanılır)
// ALL_CLASSES: kayıt formunda gösterilen tam liste ("Öğretmen" dahil)

const GRADES = [5, 6, 7, 8];
const SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

const STUDENT_CLASSES = ['YOKDIL'];
for (const grade of GRADES) {
  for (const section of SECTIONS) {
    STUDENT_CLASSES.push(`${grade}-${section}`);
  }
}

const TEACHER_LABEL = 'Öğretmen';
const ALL_CLASSES = [TEACHER_LABEL, ...STUDENT_CLASSES];

module.exports = { STUDENT_CLASSES, ALL_CLASSES, TEACHER_LABEL };
