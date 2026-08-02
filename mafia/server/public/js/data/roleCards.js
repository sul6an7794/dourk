/* بيانات بطاقات الأدوار — يطابق مفتاح كل بطاقة (حقل card القادم من الخادم) بصورة الشخصية ونصوصها */
const ROLE_CARD_DATA = {
  '01-mafia.png': {
    photo: 'mafia.webp', nameAr: 'مافيـا', faction: 'evil',
    ability: 'الأيادي الملطخة. يقتل ليلاً ويخفي أثره نهاراً.',
  },
  '02-elcapo.png': {
    photo: 'zaeem.webp', nameAr: 'الزعيـم', faction: 'evil',
    ability: 'الكلمة الأخيرة له، قائد المافيا يظهر للشيخ كأنه مواطن بريء ولا يُقتل أبداً.',
  },
  '03-heiress.png': {
    photo: 'heiress.webp', nameAr: 'الوريثـه', faction: 'evil',
    ability: 'تتحرك مع العصابة ليلاً لاختيار ضحية، وإذا أُقصيت نهاراً تعطّل قدرات الخير في الليلة التالية.',
  },
  '04-doctor.png': {
    photo: 'doctor.webp', nameAr: 'الطبيـب', faction: 'good',
    ability: 'يحمي لاعباً من القتل ليلاً، ويمكنه حماية نفسه، لكن لا يحمي نفس اللاعب في ليلتين متتاليتين.',
  },
  '05-sheikh.png': {
    photo: 'sheikh.webp', nameAr: 'الشيـخ', faction: 'good',
    ability: 'بالعدسة المكبرة، يكشف حقيقة لاعب واحد كل ليلة، إن كان من العصابة أو بريئاً.',
  },
  '06-villager.png': {
    photo: 'villager.webp', nameAr: 'القروـي', faction: 'good',
    ability: 'صوت الحق. لا يملك قدرة خاصة، ويعتمد على النقاش والتحليل لاكتشاف الشر.',
  },
  '07-mayor.png': {
    photo: 'mayor.webp', nameAr: 'العمدـه', faction: 'good',
    ability: 'لأنه العمدة، صوته في النهار يُحسب بصوتين.',
  },
  '08-princess.png': {
    photo: 'princess.webp', nameAr: 'الأميرـة', faction: 'good',
    ability: 'محبوبة الجميع، عندما يتم التصويت عليها لا تُقصى ولكن تكشف بطاقتها للجميع.',
  },
  '09-shapeshifter.png': {
    photo: 'shapeshifter.webp', nameAr: 'المتحوـل', faction: 'good',
    ability: 'القناع جاهز. مواطن بريء، لكن إذا قُتل ليلاً يتحول سراً إلى فريق الشر.',
  },
  '13-shifted.png': {
    photo: 'shifted.webp', nameAr: 'المتحوـل', faction: 'evil', badgeLabel: 'تحوّل',
    ability: 'تسلل الشر إلى قلبه… أصبح من فريق الشر سراً بعد أن نجا من القتل.',
  },
  '10-joker.png': {
    photo: 'joker.webp', nameAr: 'المهرـج', faction: 'neutral', badgeLabel: 'بطاقة فوضى',
    ability: 'ملك الفوضى. لا يفوز إلا إذا أُقصي أو قُتل، ويفوز حينها مع الفريق الفائز.',
  },
  '11-thief.png': {
    photo: 'thief.webp', nameAr: 'الحرامـي', faction: 'good',
    ability: 'يسرق صوت لاعب مرة واحدة طوال اللعبة، فيفقد صاحبه حق التصويت باليوم التالي فقط، دون كشف هويته.',
  },
  '12-fighter.png': {
    photo: 'fighter.webp', nameAr: 'المصارـع', faction: 'good',
    ability: 'يختار ليلة واحدة لتفعيل النجاة. إذا فعّلها تُستهلك تلك الليلة حتى لو لم يُقتل.',
  },
};

function roleCardData(cardKey) {
  return ROLE_CARD_DATA[cardKey] || { photo: '', nameAr: '؟', faction: 'neutral', ability: '' };
}
