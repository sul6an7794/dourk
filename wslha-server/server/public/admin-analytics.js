/*
 * تحليلات الزوار — زر «تحليلات الزوار» أعلى لوحة التحكم يفتح نافذة منفصلة تعرض قمع
 * التحويل (زيارة → طلب رمز → حساب جديد → غرفة → لعبة بدأت) كأرقام مجمّعة يومية فقط،
 * بدون أي ربط بهوية شخص. نفس نمط admin-users.js بالضبط (نافذة تعيش بـ<body>، للمشرف فقط).
 */
(function () {
  'use strict';
  var API = location.origin;

  function api(path) {
    return fetch(API + path, { credentials: 'include' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'خطأ'); return d;
      });
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  // نفس أيقونة "chart" المستخدمة بزر فتح اللوحة (feather-icons).
  var chartIconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px">' +
    '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line>' +
    '<line x1="6" y1="20" x2="6" y2="14"></line></svg>';

  var STEPS = [
    { key: 'page_view', label: 'زيارة الصفحة' },
    { key: 'otp_requested', label: 'طلب رمز تحقق' },
    { key: 'signup_completed', label: 'حساب جديد' },
    { key: 'room_created', label: 'إنشاء غرفة' },
    { key: 'game_started', label: 'بدأت اللعبة' },
  ];

  var style = document.createElement('style');
  style.textContent =
    '#waa-ov{position:fixed;inset:0;z-index:99999;background:rgba(10,8,24,.7);display:none;align-items:flex-start;justify-content:center;' +
    'padding:40px 14px;overflow:auto;direction:rtl}' +
    '#waa-ov.on{display:flex}' +
    '.waa-card{width:min(420px,96vw);background:#161331;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:20px;' +
    'color:#f1f0ff;font-family:"Thmanyah Sans",sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.6)}' +
    '.waa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}' +
    '.waa-head h3{margin:0;font-size:19px;font-weight:800}' +
    '.waa-tools{display:flex;gap:8px}' +
    '.waa-refresh,.waa-close{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#f1f0ff;' +
    'border-radius:10px;padding:7px 13px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}' +
    '.waa-refresh:hover,.waa-close:hover{background:rgba(255,255,255,.14)}' +
    '.waa-sub{font-size:12px;color:#9b98c4;margin:2px 0 16px}' +
    '.waa-step{flex:1;background:rgba(255,255,255,.04);border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center}' +
    '.waa-step.hi{background:rgba(224,184,106,.09);border:1px solid rgba(224,184,106,.3)}' +
    '.waa-step.hi .waa-step-label,.waa-step.hi .waa-step-val{color:#e0b86a}' +
    '.waa-step.end{background:rgba(127,231,255,.08);border:1px solid rgba(127,231,255,.28)}' +
    '.waa-step.end .waa-step-label,.waa-step.end .waa-step-val{color:#7fe7ff}' +
    '.waa-step-label{font-size:13px;font-weight:700}' +
    '.waa-step-val{font-size:16px;font-weight:900}' +
    '.waa-drop{text-align:center;color:#5c5b73;font-size:11px;margin:2px 0}' +
    '.waa-tblwrap{border-top:1px solid rgba(255,255,255,.08);padding-top:14px;margin-top:18px}' +
    '.waa-tbltitle{color:#9b98c4;font-size:11.5px;font-weight:700;margin-bottom:8px}' +
    '.waa-tbl{width:100%;border-collapse:collapse;font-size:11px}' +
    '.waa-tbl th{color:#5c5b73;font-weight:600;text-align:center;padding:4px 0}' +
    '.waa-tbl th:first-child{text-align:right}' +
    '.waa-tbl td{color:#f1f0ff;text-align:center;padding:5px 0;border-top:1px solid rgba(255,255,255,.06)}' +
    '.waa-tbl td:first-child{text-align:right;color:#9b98c4}';
  (document.head || document.documentElement).appendChild(style);

  var ov = document.createElement('div');
  ov.id = 'waa-ov';
  ov.innerHTML =
    '<div class="waa-card">' +
      '<div class="waa-head"><h3 style="display:flex;align-items:center;gap:8px">' + chartIconSvg + ' التحليلات</h3>' +
        '<div class="waa-tools"><button class="waa-refresh">↻ تحديث</button><button class="waa-close">إغلاق</button></div>' +
      '</div>' +
      '<div class="waa-sub">آخر 14 يوم — أرقام مجمّعة فقط، بدون أي ربط بهوية زائر</div>' +
      '<div id="waa-body">جارِ التحميل…</div>' +
    '</div>';
  document.body.appendChild(ov);

  function pct(cur, prev) {
    if (!prev) return null;
    return Math.round((cur / prev) * 100);
  }

  function bodyHtml(days) {
    var totals = STEPS.map(function (s) {
      return days.reduce(function (sum, d) { return sum + (d[s.key] || 0); }, 0);
    });

    var funnel = STEPS.map(function (s, i) {
      var cls = i === 0 ? 'hi' : (i === STEPS.length - 1 ? 'end' : '');
      var row = '<div class="waa-step ' + cls + '"><span class="waa-step-label">' + s.label + '</span><span class="waa-step-val">' + totals[i] + '</span></div>';
      if (i === 0) return row;
      var p = pct(totals[i], totals[i - 1]);
      var dropLine = '<div class="waa-drop">↓ ' + (p == null ? '—' : p + '٪') + '</div>';
      return dropLine + row;
    }).join('');

    var recent = days.slice(0, 7);
    var rows = recent.map(function (d) {
      return '<tr><td>' + esc(d.date.slice(5)) + '</td><td>' + d.page_view + '</td><td>' + d.signup_completed + '</td><td>' + d.room_created + '</td></tr>';
    }).join('');

    return (
      '<div style="display:flex;flex-direction:column;gap:2px;margin-bottom:6px">' + funnel + '</div>' +
      '<div class="waa-tblwrap">' +
        '<div class="waa-tbltitle">آخر 7 أيام</div>' +
        '<table class="waa-tbl"><thead><tr><th>التاريخ</th><th>زيارة</th><th>تسجيل</th><th>غرفة</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>' +
      '</div>'
    );
  }

  function load() {
    if ($('waa-body')) $('waa-body').innerHTML = 'جارِ التحميل…';
    api('/api/admin/analytics?days=14').then(function (d) {
      if ($('waa-body')) $('waa-body').innerHTML = bodyHtml((d && d.days) || []);
    }).catch(function (e) {
      if ($('waa-body')) $('waa-body').innerHTML = '<div style="color:#f87171;padding:8px">' + esc(e.message) + '</div>';
    });
  }
  function open() { ov.classList.add('on'); load(); }
  function close() { ov.classList.remove('on'); }

  function ensureTrigger() {
    var btn = document.getElementById('waa-open-btn');
    if (btn && !btn.getAttribute('data-waa')) {
      btn.setAttribute('data-waa', '1');
      btn.addEventListener('click', open);
    }
  }

  ov.addEventListener('click', function (e) {
    var t = e.target;
    if (t.classList.contains('waa-close') || t === ov) { close(); return; }
    if (t.classList.contains('waa-refresh')) { load(); return; }
  });

  ensureTrigger();
  var observer = new MutationObserver(ensureTrigger);
  observer.observe(document.body, { childList: true, subtree: true });
})();
