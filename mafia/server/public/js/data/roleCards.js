/* بيانات بطاقات الأدوار — يطابق مفتاح كل بطاقة (حقل card القادم من الخادم) بصورة الشخصية ونصوصها */
const ROLE_CARD_DATA = {
  '01-mafia.png': {
    photo: 'mafia.webp', nameAr: 'مافيا', faction: 'evil',
    ability: 'الأيادي الملطخة. يقتل ليلاً ويخفي أثره نهاراً.',
  },
  '02-elcapo.png': {
    photo: 'zaeem.webp', nameAr: 'الزعيم', faction: 'evil',
    ability: 'قائد المافيا، يتحرك مع العصابة ليلاً ويقتل مثلهم تمامًا.',
  },
  '03-heiress.png': {
    photo: 'heiress.webp', nameAr: 'الوريثة', faction: 'evil',
    ability: 'تتحرك مع العصابة ليلاً لاختيار ضحية، وإذا أُقصيت نهاراً تعطّل قدرات الخير في الليلة التالية.',
  },
  '04-doctor.png': {
    photo: 'doctor.webp', nameAr: 'الطبيب', faction: 'good',
    ability: 'يحمي لاعباً من القتل ليلاً، ويمكنه حماية نفسه، لكن لا يحمي نفس اللاعب في ليلتين متتاليتين.',
  },
  '05-sheikh.png': {
    photo: 'sheikh.webp', nameAr: 'الشيخ', faction: 'good',
    ability: 'بالعدسة المكبرة، يكشف حقيقة لاعب واحد كل ليلة، إن كان من العصابة أو بريئاً.',
  },
  '06-villager.png': {
    photo: 'villager.webp', nameAr: 'القروي', faction: 'good',
    ability: 'صوت الحق. لا يملك قدرة خاصة، ويعتمد على النقاش والتحليل لاكتشاف الشر.',
  },
  '07-mayor.png': {
    photo: 'mayor.webp', nameAr: 'العمدة', faction: 'good',
    ability: 'لأنه العمدة، صوته في النهار يُحسب بصوتين.',
  },
  '08-princess.png': {
    photo: 'princess.webp', nameAr: 'الأميرة', faction: 'good',
    ability: 'محبوبة الجميع، عندما يتم التصويت عليها لا تُقصى ولكن تكشف بطاقتها للجميع.',
  },
  '09-shapeshifter.png': {
    photo: 'shapeshifter.webp', nameAr: 'المتحول', faction: 'good',
    ability: 'القناع جاهز. مواطن بريء، لكن إذا قُتل ليلاً يتحول سراً إلى فريق الشر.',
  },
  '13-shifted.png': {
    photo: 'shifted.webp', nameAr: 'المتحول', faction: 'evil', badgeLabel: 'تحوّل',
    ability: 'تسلل الشر إلى قلبه… أصبح من فريق الشر سراً بعد أن نجا من القتل.',
  },
  '10-joker.png': {
    photo: 'joker.webp', nameAr: 'المهرج', faction: 'neutral', badgeLabel: 'بطاقة فوضى',
    ability: 'ملك الفوضى. لا يفوز إلا إذا أُقصي أو قُتل، ويفوز حينها مع الفريق الفائز.',
  },
  '11-thief.png': {
    photo: 'thief.webp', nameAr: 'الحرامي', faction: 'good',
    ability: 'يسرق صوت لاعب مرة واحدة طوال اللعبة، فيفقد صاحبه حق التصويت باليوم التالي فقط، دون كشف هويته.',
  },
  '12-fighter.png': {
    photo: 'fighter.webp', nameAr: 'المصارع', faction: 'good',
    ability: 'يختار ليلة واحدة لتفعيل النجاة. إذا فعّلها تُستهلك تلك الليلة حتى لو لم يُقتل.',
  },
};

function roleCardData(cardKey) {
  return ROLE_CARD_DATA[cardKey] || { photo: '', nameAr: '؟', faction: 'neutral', ability: '' };
}
