// أرقام لاتينية دائمًا (لا تحويل لعربية) — اتساقًا مع وصّلها ومافيا وحقول الأكواد/OTP
// اللي أصلاً لاتينية بكل الموقع؛ إبقاء الدالة بنفس الاسم يجنّبنا تعديل كل نقاط الاستخدام.
const AR = (v) => String(v);
// ختم "متجر موثّق" يفرض ارتفاعه الأصلي (٤٤px) أكبر من أيقونة تيك توك المجاورة له بالفوتر
// (٣٦px) — نصغّره بصريًا (scale) لنفس ارتفاعها بالحالة الافتراضية بس. لما ينبثق تفاصيله
// بالتحويم يكبر فعليًا بشكل واضح (ليصير قابل للقراءة) — نتجاهل التصغير بهذي الحالة (نعتبر
// أي ارتفاع أكبر من الحد الأدنى انبثاقًا) حتى ما يصير المنبثق نفسه صغير جدًا وغير مقروء.
const SBC_SEAL_TARGET_HEIGHT = 36;
const SBC_SEAL_EXPANDED_THRESHOLD = 60; // أي ارتفاع فوقه نعتبره منبثقًا (تفاصيل الختم)، لا نصغّره
function sbcApplyScale(frame, naturalHeight) {
  const h = naturalHeight || SBC_SEAL_TARGET_HEIGHT;
  const scale = h > SBC_SEAL_EXPANDED_THRESHOLD ? 1 : Math.min(1, SBC_SEAL_TARGET_HEIGHT / h);
  frame.style.transform = 'translateX(-50%) scale(' + scale + ')';
}
const PHONE_RE = /^\+[1-9]\d{7,14}$/;
// السعودية أول اختيار افتراضي (الجمهور الأساسي)، وباقي دول الخليج بعدها.
const COUNTRY_CODES = [
  { code: '+966', label: '🇸🇦 ‎+966' },
  { code: '+971', label: '🇦🇪 ‎+971' },
  { code: '+965', label: '🇰🇼 ‎+965' },
  { code: '+973', label: '🇧🇭 ‎+973' },
  { code: '+974', label: '🇶🇦 ‎+974' },
  { code: '+968', label: '🇴🇲 ‎+968' },
];

const ICONS = {
  ticket: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4z"/><path d="M13 7v10"/></svg>',
  ticketLg: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4z"/><path d="M13 7v10"/></svg>',
  bolt: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  users: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  tiktok: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.59 6.69A4.79 4.79 0 0 1 15.82 2h-3.45v12.64a2.9 2.9 0 1 1-2.01-2.76V8.37a6.42 6.42 0 1 0 5.46 6.35V9.08a8.16 8.16 0 0 0 4.77 1.53V7.16a4.83 4.83 0 0 1-1-.47z"/></svg>',
  whatsapp: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.93 11.93 0 0 0 12.05 0C5.46 0 .1 5.36.1 11.95c0 2.1.55 4.14 1.59 5.94L0 24l6.28-1.65a11.94 11.94 0 0 0 5.76 1.47h.01c6.59 0 11.95-5.36 11.95-11.95 0-3.19-1.24-6.19-3.48-8.39zm-8.47 18.3h-.01a9.91 9.91 0 0 1-5.06-1.39l-.36-.21-3.73.98 1-3.63-.24-.37a9.88 9.88 0 0 1-1.52-5.25c0-5.46 4.44-9.9 9.91-9.9 2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.9 6.99c0 5.47-4.44 9.91-9.88 9.91zm5.43-7.43c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.66.15-.19.3-.76.97-.93 1.17-.17.2-.34.22-.63.07-.3-.15-1.25-.46-2.38-1.47a8.93 8.93 0 0 1-1.65-2.05c-.17-.3-.02-.45.13-.6.13-.13.3-.34.45-.5.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.66-1.6-.91-2.19-.24-.58-.48-.5-.66-.5h-.56c-.2 0-.52.08-.8.38-.27.3-1.05 1.03-1.05 2.51s1.08 2.92 1.23 3.12c.15.2 2.12 3.24 5.14 4.55.72.31 1.28.5 1.72.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.18-1.42-.08-.13-.27-.2-.57-.35z"/></svg>',
  back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="M14 6l6 6-6 6"/></svg>',
  chevron: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>',
};

// بيانات بطاقات أدوار مافيا (لعرضها قبل اللعب بخطوة "شوف كل البطاقات") — نفس بيانات
// mafia/server/public/js/data/roleCards.js، منسوخة هنا لأن هذي الصفحة (المنصة) لا تحمّل
// حزمة جافاسكربت مافيا الداخلية. الصور نفسها تُخدَّم من /mafia/assets/... (نفس التطبيق
// المُركَّب تحت بادئة /mafia بسيرفر المنصة، انظر server.js: app.use('/mafia', ...)).
const ROLE_CARDS_INFO = [
  { file: '01-mafia.png', photo: 'mafia.webp', nameAr: 'مافيا', faction: 'evil', ability: 'الأيادي الملطخة. يقتل ليلاً ويخفي أثره نهاراً.' },
  { file: '02-elcapo.png', photo: 'zaeem.webp', nameAr: 'الزعيم', faction: 'evil', ability: 'الكلمة الأخيرة له، قائد المافيا يظهر للشيخ كأنه مواطن بريء ولا يُقتل أبداً.' },
  { file: '03-heiress.png', photo: 'heiress.webp', nameAr: 'الوريثة', faction: 'evil', ability: 'تتحرك مع العصابة ليلاً لاختيار ضحية، وإذا أُقصيت نهاراً تعطّل قدرات الخير بالليلة التالية.' },
  { file: '04-doctor.png', photo: 'doctor.webp', nameAr: 'الطبيب', faction: 'good', ability: 'يحمي لاعباً من القتل ليلاً، ويمكنه حماية نفسه، لكن لا يحمي نفس اللاعب ليلتين متتاليتين.' },
  { file: '05-sheikh.png', photo: 'sheikh.webp', nameAr: 'الشيخ', faction: 'good', ability: 'بالعدسة المكبرة، يكشف حقيقة لاعب واحد كل ليلة، إن كان من العصابة أو بريئاً.' },
  { file: '06-villager.png', photo: 'villager.webp', nameAr: 'القروي', faction: 'good', ability: 'صوت الحق. لا يملك قدرة خاصة، ويعتمد على النقاش والتحليل لاكتشاف الشر.' },
  { file: '07-mayor.png', photo: 'mayor.webp', nameAr: 'العمدة', faction: 'good', ability: 'لأنه العمدة، صوته بالنهار يُحسب بصوتين.' },
  { file: '08-princess.png', photo: 'princess.webp', nameAr: 'الأميرة', faction: 'good', ability: 'محبوبة الجميع، عندما يتم التصويت عليها لا تُقصى ولكن تكشف بطاقتها للجميع.' },
  { file: '09-shapeshifter.png', photo: 'shapeshifter.webp', nameAr: 'المتحول', faction: 'good', ability: 'القناع جاهز. مواطن بريء، لكن إذا قُتل ليلاً يتحول سراً إلى فريق الشر.' },
  { file: '10-joker.png', photo: 'joker.webp', nameAr: 'المهرج', faction: 'neutral', ability: 'ملك الفوضى. لا يفوز إلا إذا أُقصي أو قُتل، ويفوز حينها مع الفريق الفائز.' },
  { file: '11-thief.png', photo: 'thief.webp', nameAr: 'الحرامي', faction: 'good', ability: 'بالليل يسرق صوت لاعب مرة واحدة طوال اللعبة، فيفقد صاحبه حق التصويت باليوم التالي فقط.' },
  { file: '12-fighter.png', photo: 'fighter.webp', nameAr: 'المصارع', faction: 'good', ability: 'يختار ليلة واحدة لتفعيل النجاة. إذا فعّلها تُستهلك تلك الليلة حتى لو لم يُقتل.' },
];

const GAMES = {
  mafia: {
    name: 'مافيا', kicker: 'لعبة الخداع الاجتماعي', cls: 'mafia',
    desc: 'كل ليلة تختفي ضحية، وكل نهار تشتعل الاتهامات. اكتشف المافيا قبل ما يطلعونك من المدينة.',
    cardDesc: 'اقرأ الوجوه، دافع عن نفسك، وصوّت قبل ما يفوت الوقت.',
    meta: ['6–13 لاعبًا', '20–40 دقيقة', 'جهاز لكل لاعب'],
    cardMeta: ['6–13 لاعبًا', '20–40 دقيقة', { hi: 'خير ضد شر' }],
    steps: [
      { n: '1', t: 'افتح الغرفة وشارك رابطها — كل لاعب يدخل من جواله ويعرف دوره بسرية.' },
      { n: '2', t: 'بالليل المافيا تختار ضحية، والطبيب يحمي، والشيخ يفحص ويشك.' },
      { n: '3', t: 'بالنهار الكل يتكلم ويتّهم، والتصويت يقرر مين يطلع — آخر فريق يبقى يكسب.' },
      { n: '4', t: 'شوف كل بطاقات الأدوار وقدراتها قبل ما تبدأ.', action: 'cards' },
    ],
    counts: null, countLabel: 'عدد اللاعبين المتوقّع', countUnit: 'لاعبًا',
  },
  wslha: {
    name: 'وصّلها', kicker: 'لعبة الوصف الجماعي', cls: 'wslha',
    desc: 'كل فريق من 3 لاعبين يشوف 3 صور مختلفة. نقاش واحد يوصلكم للإجابة، وغلطة وحدة توقفكم 15 ثانية… فمافي مجال للهبد.',
    cardDesc: '3 لاعبين، 3 صور، وجواب واحد. صفوا اللي تشوفونه ووصلوا للحل قبل ما يوقفكم الغلط.',
    meta: ['3 لاعبين في كل فريق', 'وصف حي، بلا كتابة', 'الوقت ضدكم'],
    cardMeta: ['3 لاعبين في كل فريق', 'وصف حي، بلا كتابة', { hi: 'الوقت ضدكم' }],
    steps: [
      { n: '1', t: 'افتح الغرفة وقسّم اللاعبين إلى فرق — كل فريق من ثلاثة.' },
      { n: '2', t: 'كل واحد بالفريق يشوف صورة مختلفة، وتوصفون اللي تشوفونه لبعض بالكلام فقط.' },
      { n: '3', t: 'اكتبوا جوابكم المشترك — تغلطون ثلاث مرات وتأخذون تلميح، وكل ثانية تفرق.' },
    ],
    counts: [1, 2, 3, 4, 5], countLabel: 'عدد الفرق', countUnit: 'فرق',
  },
};

const App = {
  state: {
    screen: 'home',
    user: null,
    otpStage: 'phone',
    otpCountryCode: '+966',
    otpLocalDraft: '',
    otpPhone: '',
    otpSending: false,
    otpVerifying: false,
    authError: '',
    pendingCreate: false,
    pendingGuestJoin: '',
    guestNameError: '',
    game: 'mafia',
    joinCode: '',
    teamCount: 1,
    createError: '',
    creating: false,
    deleteConfirm: false,
  },

  async api(path, opts) {
    const res = await fetch(path, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts));
    let body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((body && body.error) || 'صار خطأ، حاول مرة ثانية');
    return body || {};
  },

  async refreshMe() {
    try {
      const { user } = await this.api('/api/auth/me');
      this.state.user = user;
    } catch (e) {
      this.state.user = null;
    }
  },

  showToast(msg) {
    clearTimeout(this._toastTimer);
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  },

  setLoading(on) {
    document.getElementById('loadingOverlay').classList.toggle('show', !!on);
  },

  go(screen, extra) {
    const page = window.location.hash.slice(1);
    if (screen === 'home' && (page === 'privacy' || page === 'terms')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    clearTimeout(this._goTimer);
    Object.assign(this.state, { screen }, extra || {});
    this.render();
    window.scrollTo(0, 0);
  },

  requireLogin(next) {
    if (this.state.user) return true;
    this.state.pendingCreate = next || false;
    this.state.authError = '';
    this.go('auth');
    return false;
  },

  openGame(game) { this.go('game', { game }); },

  submitJoinCode() {
    const code = document.getElementById('joinCodeInput').value.replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) return this.showToast('رقم الغرفة 6 أرقام');
    this.beginJoin(code);
  },

  beginJoin(code) {
    // الانضمام مجاني ومباشر بلا حساب دورك — نفس تجربة فتح رابط الغرفة مباشرة، بلا فرق
    // إذا كتب اللاعب الرقم يدويًا هنا أو ضغط رابطًا جاهزًا.
    this.continueJoin(code);
  },

  async continueJoin(code) {
    try {
      const { game } = await this.api('/api/rooms/' + code);
      // مافيا تحتاج اسم يميّز كل لاعب بالغرفة (يُستخدم بالاتهام/التصويت). الضيف اللي بلا
      // حساب دورك ما نقدر نعبّي له اسمًا تلقائيًا، فنسأله قبل ما نكمّل للغرفة.
      if (game === 'mafia' && !this.state.user) {
        this.state.pendingGuestJoin = code;
        this.go('joinName');
        return;
      }
      const name = this.state.user ? '&name=' + encodeURIComponent(this.state.user.username) : '';
      window.location.href = '/' + game + '/?room=' + code + (game === 'mafia' ? name : '');
    } catch (e) {
      this.setLoading(false);
      this.render();
      this.showToast('ما لقينا غرفة بهذا الرقم');
    }
  },

  confirmGuestName() {
    const raw = (document.getElementById('guestNameInput').value || '').trim().slice(0, 20);
    if (!raw) { this.state.guestNameError = 'اكتب اسمك عشان يميّزك ربعك بالغرفة'; this.render(); return; }
    const code = this.state.pendingGuestJoin;
    this.state.pendingGuestJoin = '';
    this.state.guestNameError = '';
    window.location.href = '/mafia/?room=' + code + '&name=' + encodeURIComponent(raw);
  },

  normalizeJoinCode(input) {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
  },

  backToPhoneStep() { this.state.otpStage = 'phone'; this.state.authError = ''; this.render(); },

  // كل رقم بمربع مستقل: نكتب رقم وحد فيه وننتقل تلقائيًا للي بعده، ولو الجوال حط الرمز
  // كامل بمربع وحد (تعبئة تلقائية من رسالة SMS) نوزّعه على بقية المربعات بدل ما يتوقف عليه.
  onOtpBoxInput(input, index) {
    const boxes = Array.from(document.querySelectorAll('.otp-box'));
    const raw = input.value.replace(/\D/g, '');
    if (raw.length > 1) {
      raw.slice(0, boxes.length - index).split('').forEach((d, i) => { if (boxes[index + i]) boxes[index + i].value = d; });
      const nextEmpty = boxes.findIndex((b, i) => i > index && !b.value);
      (nextEmpty === -1 ? boxes[boxes.length - 1] : boxes[nextEmpty]).focus();
    } else {
      input.value = raw;
      if (raw && boxes[index + 1]) boxes[index + 1].focus();
    }
    const code = boxes.map((b) => b.value).join('');
    if (code.length === boxes.length && !this.state.otpVerifying) this.verifyOtpCode(code);
  },

  // Backspace بمربع فاضي يرجع للمربع اللي قبله ويمسحه، بدل ما يعلق المؤشر بمكانه.
  onOtpBoxKeydown(e, index) {
    if (e.key !== 'Backspace' || e.target.value || index === 0) return;
    const boxes = Array.from(document.querySelectorAll('.otp-box'));
    boxes[index - 1].value = '';
    boxes[index - 1].focus();
  },

  onCountryCodeChange(select) {
    this.state.otpCountryCode = select.value;
    // إعادة رسم لازمة عشان نظهر/نخفي حقل رمز الدولة اليدوي — نحافظ على الرقم المكتوب
    // عبر otpLocalDraft (يتحدّث بـoninput) بدل ما يُمسح بإعادة الرسم.
    this.render();
  },

  async requestOtp() {
    let code;
    if (this.state.otpCountryCode === 'custom') {
      const customDigits = (document.getElementById('authCustomCode').value || '').replace(/\D/g, '');
      if (!customDigits) return this.setAuthError('أدخل رمز الدولة (بدون +)');
      code = '+' + customDigits;
    } else {
      code = this.state.otpCountryCode || '+966';
    }
    // نقبل الرقم المحلي بأي شكل (بمسافات أو بصفر بالبداية) ونطبّعه بأنفسنا بدل ما نحمّل
    // المستخدم هم الصيغة الدولية — نحذف كل شي غير رقمي، وأي أصفار بالبداية (٠٥ محليًا = ٥ دوليًا).
    const localDigits = document.getElementById('authPhone').value.replace(/\D/g, '').replace(/^0+/, '');
    const phone = code + localDigits;
    if (!PHONE_RE.test(phone)) return this.setAuthError('أدخل رقم جوال صحيح (بدون صفر بالبداية)');
    this.state.otpPhone = phone;
    this.state.otpSending = true;
    this.setAuthError('');
    // تحديث مباشر لزر الإرسال بدل render() كامل — render() يستبدل <main> بعنصر جديد
    // فيعيد تشغيل حركة الدخول (dwrkUp) وتصير ومضة واضحة قبل ما تظهر شاشة الكود فعليًا.
    const sendBtn = document.getElementById('otpSendBtn');
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'جارِ الإرسال...'; }
    try {
      await this.api('/api/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
      this.state.otpStage = 'code';
      this.state.otpSending = false;
      this.render();
      const firstBox = document.querySelector('.otp-box');
      if (firstBox) firstBox.focus();
    } catch (e) {
      this.state.otpSending = false;
      this.setAuthError(e.message);
      this.render();
    }
  },

  async verifyOtpCode(otpArg) {
    if (this.state.otpVerifying) return;
    const otp = otpArg || Array.from(document.querySelectorAll('.otp-box')).map((b) => b.value).join('').trim();
    if (!otp || otp.length < 4) return this.setAuthError('أدخل رمز التحقق كامل');
    this.state.otpVerifying = true;
    this.setAuthError('');
    // نفس فكرة requestOtp — تحديث مباشر بدل render() كامل حتى ما تنعاد حركة الدخول
    // وتصير ومضة، وحتى ما تنمسح خانات الرمز المكتوبة بإعادة الرسم وهي لسا قيد التحقق.
    document.querySelectorAll('.otp-box').forEach((b) => { b.disabled = true; });
    const verifyBtn = document.getElementById('otpVerifyBtn');
    if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.textContent = 'جارِ التحقق...'; }
    try {
      const { user, isNew } = await this.api('/api/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: this.state.otpPhone, otp }),
      });
      this.state.user = user;
      this.state.otpVerifying = false;
      // حساب جديد فعلاً؟ نعرض خطوة اختيار اسم مرة وحدة بس — لو حساب قديم يكمل دخوله على طول
      // بدون ما يشوف أي حقل اسم (ما له داعي، وممكن يلخبطه إذا كتب شي مختلف عن اسمه المسجّل).
      if (isNew) {
        this.state.otpStage = 'name';
        this.render();
        return;
      }
      this.finishLogin();
    } catch (e) {
      this.state.otpVerifying = false;
      this.setAuthError(e.message);
      this.render();
    }
  },

  async confirmDisplayName() {
    const name = (document.getElementById('authDisplayName').value || '').trim();
    if (name) {
      try {
        const { user } = await this.api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ username: name }) });
        this.state.user = user;
      } catch (e) {
        return this.setAuthError(e.message);
      }
    }
    this.finishLogin();
  },

  skipDisplayName() { this.finishLogin(); },

  finishLogin() {
    const user = this.state.user;
    this.state.otpStage = 'phone';
    this.state.otpPhone = '';
    this.state.otpLocalDraft = '';
    this.state.authError = '';
    this.showToast('حيّاك يا ' + user.username);
    const pendingCreate = this.state.pendingCreate;
    this.state.pendingCreate = false;
    if (pendingCreate === 'mafia') return this.createRoom();
    this.go(pendingCreate ? 'create' : 'home');
  },

  setAuthError(msg) {
    this.state.authError = msg;
    const el = document.getElementById('authErrorSlot');
    if (!el) return;
    el.replaceChildren();
    if (msg) {
      const banner = document.createElement('div');
      banner.className = 'error-banner';
      banner.textContent = msg;
      el.appendChild(banner);
    }
  },

  async logout() {
    try { await this.api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    this.state.user = null;
    this.showToast('تم تسجيل الخروج');
    this.go('home');
  },

  goCreate() {
    if (this.state.game === 'mafia') {
      if (this.requireLogin('mafia')) this.createRoom();
      return;
    }
    if (this.requireLogin('create')) this.go('create');
  },

  decCount() {
    const g = GAMES[this.state.game];
    if (!g.counts) return;
    const i = g.counts.indexOf(this.state.teamCount);
    if (i > 0) this.setTeamCount(g.counts[i - 1]);
  },
  incCount() {
    const g = GAMES[this.state.game];
    if (!g.counts) return;
    const i = g.counts.indexOf(this.state.teamCount);
    if (i < g.counts.length - 1) this.setTeamCount(g.counts[i + 1]);
  },

  setTeamCount(nextCount) {
    const g = GAMES[this.state.game];
    if (!g.counts || !g.counts.includes(nextCount)) return;
    this.state.teamCount = nextCount;
    const value = document.getElementById('teamCountValue');
    const unit = document.getElementById('teamCountUnit');
    const dec = document.getElementById('teamCountDec');
    const inc = document.getElementById('teamCountInc');
    const index = g.counts.indexOf(nextCount);
    if (value) value.textContent = AR(nextCount);
    if (unit) unit.textContent = nextCount === 1 ? 'فريق' : g.countUnit;
    if (dec) dec.disabled = index === 0;
    if (inc) inc.disabled = index === g.counts.length - 1;
  },

  async createRoom() {
    const user = this.state.user;
    if (!user) return this.go('auth');
    if ((user.credits || 0) <= 0) { this.showToast('ما عندك تذاكر كافية'); return this.go('tickets'); }
    if (this.state.creating) return;
    this.state.creating = true;
    this.render();
    // إنشاء الغرفة يشمل طلب شبكة ثم تحويل كامل لصفحة اللعبة — قد يتأخر شوي (خصوصًا مافيا).
    // بدون هذا، الزر يتغيّر نصه بس والشاشة تحس وكأنها متجمّدة لثانيتين قبل التحويل الفعلي.
    this.setLoading(true);
    try {
      if (this.state.game === 'mafia') {
        const { credits, rt } = await this.api('/api/rooms/mafia', { method: 'POST' });
        this.state.user = Object.assign({}, user, { credits });
        window.location.href = '/mafia/?autoCreate=1&name=' + encodeURIComponent(user.username) + '&rt=' + encodeURIComponent(rt || '');
      } else {
        const maxPlayers = this.state.teamCount * 3;
        window.location.href = '/wslha/?autoCreate=1&maxPlayers=' + maxPlayers;
      }
    } catch (e) {
      this.state.creating = false;
      this.setLoading(false);
      this.showToast(e.message);
      this.render();
    }
  },

  buyTickets() { this.showToast('قريبًا — بوابة الدفع تحت الإعداد'); },

  showRoleCardsModal() {
    let ov = document.getElementById('roleCardsModal');
    if (ov) { ov.classList.add('open'); return; }
    ov = document.createElement('div');
    ov.id = 'roleCardsModal';
    ov.className = 'role-cards-overlay';
    const FACTION_SECTIONS = [
      { faction: 'good', label: 'فريق الخير' },
      { faction: 'neutral', label: 'دور محايد' },
      { faction: 'evil', label: 'فريق الشر' },
    ];
    ov.innerHTML =
      '<div class="role-cards-panel">' +
        '<div class="role-cards-head"><span>بطاقات مافيا — ' + ROLE_CARDS_INFO.length + ' دورًا</span><button type="button" class="role-cards-close">' + ICONS.close + '</button></div>' +
        '<div class="role-cards-scroll">' +
          FACTION_SECTIONS.map(({ faction, label }) => {
            const cards = ROLE_CARDS_INFO.filter((c) => c.faction === faction);
            if (!cards.length) return '';
            return (
              '<div class="role-cards-section ' + faction + '">' +
                '<div class="role-cards-section-title">' + label + '</div>' +
                '<div class="role-cards-grid">' +
                  cards.map((c) => (
                    '<div class="role-card-item ' + c.faction + '">' +
                      '<img src="/mafia/assets/characters/' + c.photo + '" alt="' + c.nameAr + '" loading="lazy">' +
                      '<div class="role-card-name">' + c.nameAr + '</div>' +
                      '<div class="role-card-ability">' + c.ability + '</div>' +
                    '</div>'
                  )).join('') +
                '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) this.closeRoleCardsModal(); });
    ov.querySelector('.role-cards-close').addEventListener('click', () => this.closeRoleCardsModal());
    requestAnimationFrame(() => ov.classList.add('open'));
  },
  closeRoleCardsModal() {
    const ov = document.getElementById('roleCardsModal');
    if (ov) ov.classList.remove('open');
  },

  async saveName() {
    const name = document.getElementById('profileNameInput').value.trim();
    if (!name) return this.showToast('اكتب الاسم الجديد أولًا');
    try {
      const { user } = await this.api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ username: name }) });
      this.state.user = user;
      this.showToast('تم تحديث الاسم');
      this.render();
    } catch (e) {
      this.showToast(e.message);
    }
  },

  showDeleteConfirm() { this.state.deleteConfirm = true; this.render(); },
  cancelDeleteAccount() { this.state.deleteConfirm = false; this.render(); },

  async deleteAccount() {
    try {
      await this.api('/api/auth/profile', { method: 'DELETE' });
      this.state.user = null;
      this.state.deleteConfirm = false;
      this.showToast('تم حذف الحساب');
      this.go('home');
    } catch (e) {
      this.showToast(e.message);
    }
  },

  metaLine(list) {
    return list.map((m, i) => {
      const isLast = i === list.length - 1;
      const html = typeof m === 'object' ? '<span class="hi">' + m.hi + '</span>' : m;
      return '<span>' + html + '</span>' + (isLast ? '' : '<span class="div">|</span>');
    }).join('');
  },

  renderHeader() {
    const s = this.state;
    const ticket = s.user
      ? '<button class="ticket-pill" onclick="App.go(\'tickets\')">' + ICONS.ticket + '<span>' + AR(s.user.credits || 0) + '</span></button>'
      : '';
    const right = s.user
      ? '<button class="profile-pill" onclick="App.go(\'profile\',{})">' + this.escape(s.user.username) + '</button>'
      // ما نكرر زر "تسجيل الدخول" وأنت أصلًا واقف بشاشة الدخول (فيها زر "رجوع" أصلًا).
      : (s.screen === 'auth' ? '' : '<button class="login-pill" onclick="App.go(\'auth\')">تسجيل الدخول</button>');
    document.getElementById('headerRoot').innerHTML =
      '<div class="header-side start">' + ticket + '</div>' +
      '<button class="logo-btn" onclick="App.go(\'home\')" aria-label="الرئيسية — دورك">' +
        '<span style="display:flex;align-items:center;gap:8px;"><span class="logo-word">دورك</span><span class="logo-dots"><span></span><span></span></span></span>' +
        '<span class="logo-tag">تلعبها صح</span>' +
      '</button>' +
      '<div class="header-side end">' + right + '</div>';
  },

  escape(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  screenHome() {
    const adminLink = this.state.user && this.state.user.isAdmin
      ? '<span>·</span><a href="/admin">لوحة التحكم</a>'
      : '';
    return '' +
      '<main data-screen="home">' +
        '<section class="hero">' +
          '<div class="eyebrow">منصة الألعاب الاجتماعية</div>' +
          '<h1>جمعتكم<br>ناقصها لعبه</h1>' +
          '<p>افتح غرفة وشارك الرابط، وربعك يدخلون من جوالاتهم.</p>' +
        '</section>' +
        '<section class="section">' +
          '<div class="section-head"><h2>وش تلعبون الليلة؟</h2><span>اختر لعبة، افتح غرفة، واجمع ربعك</span></div>' +
          '<button class="game-card mafia" onclick="App.openGame(\'mafia\')">' +
            '<span class="glow"></span>' +
            '<span class="body">' +
              '<span class="kicker">شك · اتهامات · تصويت</span>' +
              '<span class="title">مافيا</span>' +
              '<span class="desc">' + GAMES.mafia.cardDesc + '</span>' +
              '<span class="meta">' + this.metaLine(GAMES.mafia.cardMeta) + '</span>' +
            '</span>' +
          '</button>' +
          '<button class="game-card wslha" onclick="App.openGame(\'wslha\')">' +
            '<span class="glow"></span>' +
            '<span class="body">' +
              '<span class="kicker">وصف · نقاش · وقت محدود</span>' +
              '<span class="title">وصّلها</span>' +
              '<span class="desc">' + GAMES.wslha.cardDesc + '</span>' +
              '<span class="meta">' + this.metaLine(GAMES.wslha.cardMeta) + '</span>' +
            '</span>' +
          '</button>' +
        '</section>' +
        '<section class="join-panel">' +
          '<div class="join-box">' +
            '<div class="t">وصلك كود أو رابط؟</div>' +
            '<div class="s">افتح الرابط للانضمام مباشرة، أو اكتب كود الغرفة هنا.</div>' +
            '<div class="join-row">' +
              '<input id="joinCodeInput" inputmode="numeric" autocomplete="one-time-code" maxlength="6" oninput="App.normalizeJoinCode(this)" placeholder="رقم الغرفة" aria-label="رقم الغرفة">' +
              '<button onclick="App.submitJoinCode()">انضم للغرفة</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
        '<section class="section">' +
          '<h2 style="margin-bottom:16px;">ليش دورك؟</h2>' +
          '<div class="why-list">' +
            '<div class="why-row"><span class="ic" style="color:#FF2D2D;">' + ICONS.bolt + '</span><div><div class="t">افتح والعب فورًا</div><div class="d">رابط واحد يجمع الكل — لا متجر تطبيقات، ولا تحديثات، ولا «انتظر يحمّل».</div></div></div>' +
            '<div class="why-row"><span class="ic" style="color:#E0B86A;">' + ICONS.ticketLg + '</span><div><div class="t">واحد يدفع، والكل يلعب</div><div class="d">التذكرة على منشئ الغرفة بس — ربعك كلهم يدخلون بالرقم مجانًا.</div></div></div>' +
            '<div class="why-row"><span class="ic" style="color:#818cf8;">' + ICONS.users + '</span><div><div class="t">حساب واحد لكل لعبة جاية</div><div class="d">رصيدك واسمك يبقون معك — تلعب مافيا اليوم ووصّلها بكرة بالحساب نفسه.</div></div></div>' +
          '</div>' +
        '</section>' +
      '</main>' +
      '<footer>' +
        '<div class="tag">لمّ ربعك… والعبها صح</div>' +
        '<div class="links"><a class="footer-link" href="#privacy">سياسة الخصوصية</a><span>·</span><a class="footer-link" href="#terms">الشروط والأحكام</a>' + adminLink + '</div>' +
        '<div class="socials"><a href="https://www.tiktok.com/@dourk" target="_blank" rel="noopener noreferrer" aria-label="تيك توك" title="تيك توك">' + ICONS.tiktok + '<span>TikTok</span></a><div class="sbc-verify-seal" data-token="N0dGTVFMVGlxVnIyMHNzTlY4R00yUT09"></div></div>' +
        '<div class="copy">© دورك 2026 — جميع الحقوق محفوظة</div>' +
      '</footer>';
  },

  screenJoinName() {
    const err = this.state.guestNameError
      ? '<div class="error-banner">' + this.escape(this.state.guestNameError) + '</div>'
      : '';
    return '' +
      '<main data-screen="joinName">' +
        '<button class="back-btn" onclick="App.go(\'home\')">' + ICONS.back + ' رجوع</button>' +
        '<div style="margin:26px 0 22px;text-align:center;">' +
          '<h1 style="font-size:32px;margin:0 0 8px;">وش اسمك؟</h1>' +
          '<p style="font-size:14px;color:var(--subtext);margin:0;">يظهر لربعك داخل الغرفة عشان يميزونك بالاتهام والتصويت</p>' +
        '</div>' +
        '<div class="form-col">' +
          '<input id="guestNameInput" class="field" maxlength="20" placeholder="اكتب اسمك" onkeydown="if(event.key===\'Enter\')App.confirmGuestName()">' +
          err +
          '<button class="btn-primary" onclick="App.confirmGuestName()">دخول الغرفة</button>' +
        '</div>' +
        '<div class="footer-tag">دورك — تلعبها صح</div>' +
      '</main>';
  },

  screenAuth() {
    const s = this.state;
    const errorSlot = '<div id="authErrorSlot">' + (s.authError ? '<div class="error-banner">' + this.escape(s.authError) + '</div>' : '') + '</div>';
    const countryOptions = COUNTRY_CODES.map((c) =>
      '<option value="' + c.code + '"' + (c.code === s.otpCountryCode ? ' selected' : '') + '>' + c.label + '</option>'
    ).join('') + '<option value="custom"' + (s.otpCountryCode === 'custom' ? ' selected' : '') + '>🌍 دولة أخرى</option>';
    const customCodeField = s.otpCountryCode === 'custom'
      ? '<input id="authCustomCode" type="tel" inputmode="numeric" maxlength="4" class="field" placeholder="رمز الدولة بدون + (مثال: 962)">'
      : '';
    const phoneStep = '' +
      '<div class="form-col">' +
        '<div class="phone-row">' +
          '<input id="authPhone" type="tel" inputmode="numeric" class="field phone-local" placeholder="5xxxxxxxx" value="' + this.escape(s.otpLocalDraft) + '" oninput="App.state.otpLocalDraft=this.value">' +
          '<select id="authCountryCode" class="field phone-code" onchange="App.onCountryCodeChange(this)">' + countryOptions + '</select>' +
        '</div>' +
        customCodeField +
        '<div class="hint-banner">' + ICONS.ticket + ' أول تذكرة علينا — تجي مع حسابك الجديد</div>' +
        errorSlot +
        '<button id="otpSendBtn" class="btn-primary" ' + (s.otpSending ? 'disabled' : '') + ' onclick="App.requestOtp()">' + (s.otpSending ? 'جارِ الإرسال...' : 'أرسل رمز التحقق') + '</button>' +
      '</div>';
    const otpBoxes = Array.from({ length: 4 }, (_, i) =>
      '<input class="otp-box" inputmode="numeric" maxlength="1" autocomplete="one-time-code" ' + (s.otpVerifying ? 'disabled' : '') + ' oninput="App.onOtpBoxInput(this,' + i + ')" onkeydown="App.onOtpBoxKeydown(event,' + i + ')">'
    ).join('');
    const codeStep = '' +
      '<div class="form-col">' +
        '<div class="otp-boxes" dir="ltr">' + otpBoxes + '</div>' +
        errorSlot +
        '<button id="otpVerifyBtn" class="btn-primary" ' + (s.otpVerifying ? 'disabled' : '') + ' onclick="App.verifyOtpCode()">' + (s.otpVerifying ? 'جارِ التحقق...' : 'تأكيد الدخول') + '</button>' +
        '<button class="btn-link" onclick="App.backToPhoneStep()">تغيير الرقم</button>' +
      '</div>';
    const nameStep = '' +
      '<div class="form-col">' +
        '<input id="authDisplayName" class="field" maxlength="20" placeholder="اسمك (يظهر لربعك بالألعاب)">' +
        errorSlot +
        '<button class="btn-primary" onclick="App.confirmDisplayName()">حفظ ومتابعة</button>' +
        '<button class="btn-link" onclick="App.skipDisplayName()">تخطي الآن</button>' +
      '</div>';
    const titles = {
      code: { h: 'حيّاك في دورك', p: 'دقيقة وحدة وتكون داخل اللعب' },
      name: { h: 'وش اسمك؟', p: 'يظهر لربعك بالألعاب — تقدر تغيّره بعدين من ملفك الشخصي' },
      phone: { h: 'حيّاك في دورك', p: 'دقيقة وحدة وتكون داخل اللعب' },
    };
    const title = titles[s.otpStage] || titles.phone;
    const stepHtml = s.otpStage === 'code' ? codeStep : s.otpStage === 'name' ? nameStep : phoneStep;
    return '' +
      '<main data-screen="auth">' +
        '<button class="back-btn" onclick="App.go(\'home\')">' + ICONS.back + ' رجوع</button>' +
        '<div style="margin:26px 0 22px;text-align:center;">' +
          '<h1 style="font-size:32px;margin:0 0 8px;">' + title.h + '</h1>' +
          '<p style="font-size:14px;color:var(--subtext);margin:0;">' + title.p + '</p>' +
        '</div>' +
        stepHtml +
        '<div class="footer-tag">دورك — تلعبها صح</div>' +
      '</main>';
  },

  screenGame() {
    const s = this.state, g = GAMES[s.game];
    const ticketsLine = s.user ? '<span class="r">رصيدك: ' + AR(s.user.credits || 0) + '</span>' : '';
    const isCreatingMafia = g.cls === 'mafia' && s.creating;
    const gameTitle = g.cls === 'wslha' ? 'وصّلها' : g.name;
    const createLabel = g.cls === 'wslha'
      ? '<span class="cta-create-label">إنشاء غرفة <span class="cta-game-mark wslha">وصّلها</span></span>'
      : '<span class="cta-create-label">إنشاء غرفة <span class="cta-game-mark mafia">مافيا</span></span>';
    const quickExample = g.cls === 'wslha'
      ? '<div class="game-example"><strong>مثال سريع</strong><span>واحد يشوف ثلج، والثاني معطف، والثالث مدفأة — وش الرابط؟ الشتاء.</span></div>'
      : '';
    return '' +
      '<main data-screen="game">' +
        '<button class="back-btn" onclick="App.go(\'home\')">' + ICONS.back + ' كل الألعاب</button>' +
        '<div class="game-hero ' + g.cls + '">' +
          '<div class="glow"></div>' +
          '<div class="inner">' +
            '<div class="kicker">' + g.kicker + '</div>' +
            '<div class="title">' + gameTitle + '</div>' +
            '<p>' + g.desc + '</p>' +
            '<div class="meta">' + g.meta.map((m) => '<span>' + m + '</span>').join('') + '</div>' +
          '</div>' +
        '</div>' +
        '<h2 style="font-size:22px;margin-bottom:12px;">كيف تلعبون؟</h2>' +
        '<div class="steps">' + g.steps.map((st) =>
          '<div class="step-row"' + (st.action === 'cards' ? ' onclick="App.showRoleCardsModal()" style="cursor:pointer;" role="button"' : '') + '><span class="step-num" style="color:' + (g.cls === 'mafia' ? '#FF6B6B' : '#c4b5fd') + ';border-color:' + (g.cls === 'mafia' ? 'rgba(255,45,45,.3)' : 'rgba(129,140,248,.35)') + ';">' + st.n + '</span><div class="step-text">' + st.t +
            (st.action === 'cards' ? ' <span style="color:#FF6B6B;font-weight:700;white-space:nowrap;">اعرضها ›</span>' : '') +
          '</div></div>'
        ).join('') + '</div>' +
        quickExample +
        '<div class="ticket-banner"><span class="l">' + ICONS.ticket + ' سيتم خصم تذكرة واحدة عند الإنشاء</span>' + ticketsLine + '</div>' +
        '<button class="cta-btn ' + g.cls + '" ' + (isCreatingMafia ? 'disabled' : '') + ' onclick="App.goCreate()">' + (isCreatingMafia ? 'جارِ الإنشاء...' : createLabel) + '</button>' +
        '<div class="footer-tag">دورك — تلعبها صح</div>' +
      '</main>';
  },

  screenCreate() {
    const s = this.state, g = GAMES[s.game];
    const credits = s.user ? (s.user.credits || 0) : 0;
    const noTickets = credits <= 0;
    const gameWordmark = g.cls === 'wslha'
      ? '<div class="create-game-mark wslha">وصّلها</div>'
      : '<div class="create-game-mark mafia">مافيا</div>';
    const countIndex = g.counts ? g.counts.indexOf(s.teamCount) : -1;
    const atFirstCount = countIndex === 0;
    const atLastCount = g.counts ? countIndex === g.counts.length - 1 : false;
    const stepper = g.counts ? (
      '<div>' +
        '<div class="field-label">' + g.countLabel + '</div>' +
        '<div class="stepper">' +
          '<button id="teamCountDec" onclick="App.decCount()" aria-label="أقل" ' + (atFirstCount ? 'disabled' : '') + '>−</button>' +
          '<div class="val"><div id="teamCountValue" class="n">' + AR(s.teamCount) + '</div><div id="teamCountUnit" class="u">' + (s.teamCount === 1 ? 'فريق' : g.countUnit) + '</div></div>' +
          '<button id="teamCountInc" onclick="App.incCount()" aria-label="أكثر" ' + (atLastCount ? 'disabled' : '') + '>+</button>' +
        '</div>' +
      '</div>'
    ) : (
      '<div>' +
        '<div class="field-label">' + g.countLabel + '</div>' +
        '<div style="font-size:14px;color:var(--subtext);">' + g.meta[0] + ' — يتحدد بمن ينضم للغرفة، بلا حد ثابت وقت الإنشاء</div>' +
      '</div>'
    );
    return '' +
      '<main data-screen="create">' +
        '<button class="back-btn" onclick="App.go(\'game\')">' + ICONS.back + ' ' + g.name + '</button>' +
        gameWordmark +
        '<h1 style="font-size:30px;margin:20px 0 4px;">غرفتك الجديدة</h1>' +
        '<p style="font-size:14px;color:var(--subtext);margin:0 0 24px;">لعبة ' + g.name + ' — أكّد وابدأ</p>' +
        '<div class="form-col" style="gap:18px;">' +
          stepper +
          '<div class="ticket-banner"><span class="l">' + ICONS.ticket + ' سيتم خصم تذكرة واحدة</span><span class="r">رصيدك: ' + AR(credits) + '</span></div>' +
          (noTickets ? '<div class="error-banner">رصيدك من التذاكر انتهى — اشحن رصيدك من صفحة التذاكر أولًا.</div>' : '') +
          '<button class="cta-btn ' + g.cls + '" ' + (noTickets || s.creating ? 'disabled' : '') + ' onclick="App.createRoom()">' + (s.creating ? 'جارِ الإنشاء...' : 'إنشاء الغرفة') + '</button>' +
        '</div>' +
        '<div class="footer-tag">دورك — تلعبها صح</div>' +
      '</main>';
  },

  screenTickets() {
    const s = this.state;
    const credits = s.user ? (s.user.credits || 0) : 0;
    return '' +
      '<main data-screen="tickets">' +
        '<button class="back-btn" onclick="App.go(\'home\')">' + ICONS.back + ' الرئيسية</button>' +
        '<h1 style="font-size:30px;margin:10px 0 20px;">تذاكرك</h1>' +
        '<div class="tickets-card"><div style="color:#E0B86A;margin-bottom:6px;display:flex;justify-content:center;">' + ICONS.ticketLg + '</div><div class="n">' + AR(credits) + '</div><div class="l">رصيدك الحالي — كل غرفة تخصم تذكرة واحدة، لأي لعبة</div></div>' +
        '<button class="btn-primary" style="background:#E0B86A;color:#06060D;margin-bottom:8px;" onclick="App.buyTickets()">شراء تذاكر</button>' +
        '<div style="font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:10px;">بوابة الدفع قريبًا — غير متاحة حاليًا</div>' +
        '<div style="font-size:13px;color:var(--faint);line-height:1.9;text-align:center;max-width:300px;margin:0 auto;">التذكرة تُخصم من منشئ الغرفة فقط. أصدقاؤك ينضمون بالرقم أو الرابط مجانًا.</div>' +
        '<div class="footer-tag">دورك — تلعبها صح</div>' +
      '</main>';
  },

  screenProfile() {
    const s = this.state, u = s.user;
    if (!u) { this.go('home'); return ''; }
    return '' +
      '<main data-screen="profile">' +
        '<button class="back-btn" onclick="App.go(\'home\')">' + ICONS.back + ' الرئيسية</button>' +
        '<h1 style="font-size:30px;margin:10px 0 20px;">حسابك</h1>' +
        '<div class="profile-card">' +
          '<div class="avatar">' + this.escape(u.username.trim().charAt(0).toUpperCase()) + '</div>' +
          '<div style="flex:1;min-width:0;"><div style="font-weight:900;font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + this.escape(u.username) + '</div><div style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:#E0B86A;margin-top:3px;">' + ICONS.ticket + ' ' + AR(u.credits || 0) + ' تذكرة</div></div>' +
        '</div>' +
         '<div class="form-col" style="margin-bottom:18px;">' +
          '<div class="field-label">تغيير الاسم</div>' +
          '<div style="display:flex;gap:8px;"><input id="profileNameInput" class="field" maxlength="20" placeholder="الاسم الجديد" style="flex:1;min-width:0;"><button class="btn-primary" style="width:auto;margin-top:0;padding:12px 20px;" onclick="App.saveName()">حفظ</button></div>' +
         '</div>' +
         '<button class="danger-btn" onclick="App.logout()">تسجيل الخروج</button>' +
         (s.deleteConfirm
           ? '<div class="delete-confirm"><div class="field-label">حذف الحساب نهائيًا</div><p>سيُحذف حسابك وسجلّه، بدون إمكانية تراجع.</p><div><button class="danger-btn" onclick="App.deleteAccount()">تأكيد الحذف</button><button class="btn-link" onclick="App.cancelDeleteAccount()">إلغاء</button></div></div>'
           : '<button class="btn-link delete-link" onclick="App.showDeleteConfirm()">حذف الحساب</button>') +
         '<div class="footer-tag">دورك — تلعبها صح</div>' +
      '</main>';
  },

  screenLegal(type) {
    const isPrivacy = type === 'privacy';
    const title = isPrivacy ? 'سياسة الخصوصية' : 'الشروط والأحكام';
    const intro = isPrivacy
      ? 'خصوصيتك جزء من لعبتك. هذه الصفحة تشرح ببساطة المعلومات التي نحتاجها لتشغيل دورك وكيف نتعامل معها.'
      : 'هذه القواعد تحفظ متعة اللعب وعدالته للجميع عند استخدام منصة دورك أو إنشاء غرفة فيها.';
    const sections = isPrivacy ? [
      ['المعلومات التي نحتاجها', [
        'بيانات الحساب مثل رقم جوالك (لتسجيل الدخول عبر رمز تحقق) واسم المستخدم.',
        'بيانات الغرف واللعب اللازمة لإنشاء الغرفة، دعوة اللاعبين، وحفظ مكانك عند انقطاع الاتصال.',
        'بيانات تقنية أساسية تساعدنا على حماية المنصة ومعالجة الأعطال وتحسين التجربة.'
      ]],
      ['كيف نستخدمها', [
        'لتشغيل حسابك، إدارة رصيد التذاكر، وإنشاء الغرف والانضمام إليها.',
        'لإظهار حالة اللعبة والنتيجة للاعبين الموجودين في الغرفة نفسها.',
        'لمنع إساءة الاستخدام، حماية الحسابات، وتحسين أداء المنصة.'
      ]],
      ['ما لا نفعله', [
        'لا نبيع بياناتك الشخصية.',
        'لا نعرض بيانات حسابك للاعبين الآخرين إلا ما يلزم داخل الغرفة، مثل اسمك وحالة لعبك.',
        'لا نطلب منكم مشاركة رمز التحقق (OTP) أو أي بيانات حساسة داخل الغرف.'
      ]],
      ['تحكمك في بياناتك', [
        'يمكنك تعديل اسم المستخدم من صفحة الحساب.',
        'يمكنك طلب حذف حسابك من صفحة الحساب؛ عند التأكيد يُحذف الحساب وسجلّه المرتبط به.',
        'نستخدم ملفات تعريف الارتباط والتخزين المحلي فقط لتسجيل الدخول، حفظ جلستك، واستعادة مكانك في الغرفة عند الحاجة.'
      ]],
      ['تحديثات السياسة', [
        'قد نحدّث هذه السياسة عند تطوير المنصة. استمرارك في استخدام دورك بعد نشر التحديث يعني اطلاعك عليه وقبولك به.']
      ]
    ] : [
      ['استخدام المنصة', [
        'استخدم دورك للعب والتواصل باحترام، ولا تستخدمه لإيذاء الآخرين أو تعطيل الغرف أو محاولة الوصول إلى حسابات غيرك.',
        'أنت مسؤول عن رقم جوالك المرتبط بالحساب وكل النشاط الذي يتم منه.'
      ]],
      ['الغرف واللعب', [
        'منشئ الغرفة مسؤول عن مشاركة رقم الغرفة أو رابطها مع الأشخاص الذين يريد دعوتهم.',
        'لكل لعبة قواعدها الظاهرة قبل إنشاء الغرفة. الالتزام بها يحافظ على عدالة الجولة ومتعتها.',
        'يجوز لإدارة دورك إيقاف غرفة أو حساب عند إساءة الاستخدام أو الإخلال بهذه الشروط.'
      ]],
      ['التذاكر', [
        'تُخصم تذكرة واحدة من منشئ الغرفة عند إنشائها، بينما ينضم المدعوون مجانًا.',
        'رصيد التذاكر ظاهر في حسابك قبل إنشاء الغرفة. لن تُنشأ غرفة مدفوعة عند عدم توفر رصيد كافٍ.'
      ]],
      ['المحتوى والسلوك', [
        'لا تستخدم أسماء أو رسائل مسيئة، ولا تنشر محتوى غير قانوني أو ينتهك حقوق الآخرين.',
        'يُمنع نسخ أو استخدام محتوى دورك، بما في ذلك الجولات والبطاقات والشعار، دون إذن مسبق من إدارة دورك.',
        'لا تحاول نسخ المنصة أو التحايل على نظام الغرف أو التذاكر أو التأثير في نتائج اللعب بطرق غير عادلة.'
      ]],
      ['استمرارية الخدمة', [
        'نعمل على إبقاء دورك متاحًا ومستقرًا، وقد نحدّث الميزات أو نوقف بعضها لتحسين المنصة أو حماية المستخدمين.',
        'هذه الشروط قد تتغير مع تطوير الخدمة، ويُعد استمرار استخدامك للمنصة بعد نشرها قبولًا للتحديث.']
      ]
    ];
    return '' +
      '<main data-screen="legal" class="legal-page">' +
        '<button class="back-btn" onclick="App.go(\'home\')">' + ICONS.back + ' الرئيسية</button>' +
        '<div class="legal-head"><div class="eyebrow">دورك — تلعبها صح</div><h1>' + title + '</h1><p>' + intro + '</p><span>آخر تحديث: 19 يوليو 2026</span></div>' +
        '<div class="legal-sections">' + sections.map((section) =>
          '<section class="legal-section"><h2>' + section[0] + '</h2><ul>' + section[1].map((item) => '<li>' + item + '</li>').join('') + '</ul></section>'
        ).join('') + '</div>' +
        '<div class="legal-note">لأي استفسار يتعلق بالحساب أو الخصوصية، تواصل مع إدارة دورك.</div>' +
        '<div class="footer-tag">دورك — تلعبها صح</div>' +
      '</main>';
  },

  render() {
    this.renderHeader();
    const map = { home: 'screenHome', auth: 'screenAuth', joinName: 'screenJoinName', game: 'screenGame', create: 'screenCreate', tickets: 'screenTickets', profile: 'screenProfile', privacy: 'screenLegal', terms: 'screenLegal' };
    const fn = map[this.state.screen] || 'screenHome';
    const root = document.getElementById('screenRoot');
    root.innerHTML = fn === 'screenLegal' ? this[fn](this.state.screen) : this[fn]();
    // حركة الدخول (fade+slide) تشتغل بس لما الشاشة فعليًا تتغيّر — مو بكل إعادة رسم داخل
    // نفس الشاشة (مثلاً فتح تأكيد حذف الحساب) كانت تعيد كل الصفحة تومض من جديد بلا داعي.
    if (this.state.screen !== this._lastAnimatedScreen) {
      const mainEl = root.querySelector('main');
      if (mainEl) mainEl.classList.add('enter');
      this._lastAnimatedScreen = this.state.screen;
    }
    if (fn === 'screenHome') this.mountSbcSeal();
  },

  // ختم "متجر موثّق" (المركز السعودي للأعمال): نبني إطار iframe الختم بأنفسنا بنفس عقد
  // سكربتهم الرسمي (seal.js) بدل تحميله وتشغيله. جرّبنا pos=bottom لضبط اتجاه الانبثاق
  // لفوق، لكن تبيّن فعليًا (بمحاكاة حية) إنه يكسر صفحتهم الداخلية فينكمش الختم لحجم شبه
  // معدوم (2×2px) — على الأغلب لأن pos عندهم مصمّم فقط لحالة position:fixed (تعويم)،
  // وما جُرِّب أبدًا بوضع مضمّن بالتخطيط العادي زي حالتنا. بدون أي قيمة pos الختم يشتغل
  // صح تمامًا ويظل ينبثق لفوق افتراضيًا (أكّدناها بمحاكاة حية أيضًا). ونبقيه
  // position:absolute داخل حاوية ثابتة الحجم حتى ما يزحزح علامة تيك توك المجاورة له
  // بالفوتر لما ينبثق (flex بيعيد التوسيط لو كبر الإطار وهو جزء من التخطيط العادي) —
  // وبدون max-width:100% (كانت تقصّ عرض الانبثاق على عرض الحاوية الصغيرة 120px بدل
  // العرض الحقيقي اللي يطلبه ~288px، وهذا السبب الفعلي وراء ظهوره "مقصوص لنص").
  mountSbcSeal() {
    const el = document.querySelector('.sbc-verify-seal');
    if (!el || el.getAttribute('data-sbc-mounted')) return;
    const token = el.getAttribute('data-token');
    if (!token) return;
    el.setAttribute('data-sbc-mounted', '1');
    const lang = (document.documentElement.getAttribute('lang') || 'ar').slice(0, 2);
    const f = document.createElement('iframe');
    f.className = 'sbc-seal-frame';
    f.src = 'https://eauthenticate.saudibusiness.gov.sa/EAuthSealApi/seal?token=' + encodeURIComponent(token) + '&lang=' + encodeURIComponent(lang);
    f.title = 'SBC Verification';
    f.setAttribute('loading', 'lazy');
    f.setAttribute('scrolling', 'no');
    f.style.cssText = 'border:0;width:120px;height:44px;transition:width .18s ease,height .18s ease,transform .18s ease;transform-origin:center bottom;';
    sbcApplyScale(f, 44);
    el.appendChild(f);
  },

  async init() {
    this.setLoading(true);
    await this.refreshMe();
    const roomCode = new URLSearchParams(window.location.search).get('room');
    if (roomCode && /^\d{6}$/.test(roomCode)) {
      return this.continueJoin(roomCode);
    }
    const page = window.location.hash.slice(1);
    if (!roomCode && (page === 'privacy' || page === 'terms')) this.state.screen = page;
    this.setLoading(false);
    this.render();
    window.addEventListener('hashchange', () => {
      const next = window.location.hash.slice(1);
      this.go(next === 'privacy' || next === 'terms' ? next : 'home');
    });
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());

// يبلغنا محتوى ختم "متجر موثّق" (iframe من نطاقهم) بحجمه الفعلي عبر postMessage عند
// انبثاق تفاصيله بالتحويم — نفس آلية سكربتهم الرسمي بالضبط، لازمة حتى يكبر إطارنا معه.
window.addEventListener('message', (e) => {
  if (!e || !e.data || e.data.sbcSeal !== true) return;
  document.querySelectorAll('.sbc-seal-frame').forEach((f) => {
    if (f.contentWindow !== e.source) return;
    if (e.data.width) f.style.width = e.data.width + 'px';
    if (e.data.height) f.style.height = e.data.height + 'px';
    sbcApplyScale(f, e.data.height || 44);
  });
});
