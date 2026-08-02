/*
 * اضغط Enter في أي حقل إدخال = يضغط الزر الرئيسي في نفس الشاشة (بدون ماوس).
 * طبقة عامة تشمل: الدخول، التسجيل، الانضمام، تغيير الاسم/كلمة المرور، إضافة جولة…
 * تستثني شاشة اللعب (خانة الإجابة تعالج Enter بنفسها) لتفادي الإرسال المزدوج.
 *
 * تستثني أيضًا أي حقل عليه data-own-enter="1" (مثل حقل "إجابة جديدة" بلوحة تحكم
 * وصّلها): بدونها، Enter بهذا الحقل كان يفتح الطبقة هذي أول (capture phase، قبل
 * onKeyDown حق React) وتضغط أقرب <button> بعده بالصفحة — اللي صار زر حذف صورة
 * الجولة (×) لأنه أول زر يجي بعد الحقل بترتيب الصفحة، فتنحذف صورة فعليًا من
 * السيرفر بمجرد إضافة إجابة! هذا كان السبب الحقيقي وراء اختفاء صور الجولات.
 */
(function () {
  'use strict';

  var OK_TYPES = { text: 1, password: 1, number: 1, email: 1, search: 1, tel: 1, url: 1, '': 1 };

  function primaryButton(input) {
    // حاوية الشاشة الحالية (أو الجسم لقوائم مثل قائمة الحساب)
    var scope = input.closest('[data-screen-label]') || document.body;
    var buttons = scope.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (b.classList.contains('wsl-eye')) continue;      // ليست أيقونة العين
      if (b.disabled) continue;
      // الزر يجب أن يأتي بعد الحقل في ترتيب الصفحة
      if (input.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) return b;
    }
    return null;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    var t = e.target;
    if (!t || t.tagName !== 'INPUT') return;
    if (!OK_TYPES[(t.getAttribute('type') || 'text').toLowerCase()]) return;
    if (t.getAttribute('data-own-enter') === '1') return;
    // شاشة اللعب تعالج Enter بنفسها
    var screen = t.closest('[data-screen-label]');
    if (screen && screen.getAttribute('data-screen-label') === 'Game') return;

    var btn = primaryButton(t);
    if (btn) { e.preventDefault(); btn.click(); }
  }, true);
})();
