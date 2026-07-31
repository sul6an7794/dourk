/*
 * إدارة المستخدمين — زر «قائمة المستخدمين» أعلى لوحة التحكم يفتح نافذة منفصلة
 * (مو تحت الجولات). لكل مستخدم: بحث بالاسم/الجوال، تعديل الرصيد، ترقية/تنزيل مشرف
 * (بتأكيد)، حذف (بتأكيد). النافذة تعيش في <body> (تصمد مع إعادة الرسم). للمشرف فقط.
 */
(function () {
  'use strict';
  var API = location.origin;
  var cache = [];

  // جلسة الدخول تُرسل عبر كوكي HttpOnly تلقائيًا (نفس أصل الصفحة) — ما نحتاج نقرأ توكن من localStorage.
  function api(path, opts) {
    opts = opts || {};
    var h = { 'Content-Type': 'application/json' };
    return fetch(API + path, Object.assign({ headers: h, credentials: 'include' }, opts)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || 'خطأ'); return d;
      });
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function $(id) { return document.getElementById(id); }

  var style = document.createElement('style');
  style.textContent =
    '.wau-hint{font-size:11px;color:#38bdf8;margin-top:6px;font-weight:700}' +
    '#wau-ov{position:fixed;inset:0;z-index:99999;background:rgba(10,8,24,.7);display:none;align-items:flex-start;justify-content:center;' +
    'padding:40px 14px;overflow:auto;direction:rtl}' +
    '#wau-ov.on{display:flex}' +
    '.wau-card{width:min(680px,96vw);background:#161331;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:20px;' +
    'color:#f1f0ff;font-family:Tajawal,system-ui,sans-serif;box-shadow:0 30px 80px rgba(0,0,0,.6)}' +
    '.wau-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}' +
    '.wau-head h3{margin:0;font-size:19px;font-weight:800}' +
    '.wau-tools{display:flex;gap:8px}' +
    '.wau-refresh,.wau-close{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#f1f0ff;' +
    'border-radius:10px;padding:7px 13px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}' +
    '.wau-refresh:hover,.wau-close:hover{background:rgba(255,255,255,.14)}' +
    '.wau-count{font-size:13px;color:#9b98c4;margin:2px 0 10px}' +
    '.wau-search{width:100%;font-family:inherit;font-size:14px;color:#f1f0ff;background:rgba(255,255,255,.04);' +
    'border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px 12px;outline:none;margin-bottom:14px}' +
    '.wau-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:14px;' +
    'background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);margin-bottom:9px}' +
    '.wau-name{flex:1;min-width:110px;font-weight:800;font-size:15px}' +
    '.wau-phone{font-size:11px;color:#7a7799;font-weight:500;margin-inline-start:6px}' +
    '.wau-badge{font-size:11px;background:rgba(251,191,36,.18);color:#fbbf24;border-radius:20px;padding:2px 9px;margin-inline-start:6px}' +
    '.wau-cred{width:64px;height:36px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.14);border-radius:10px;' +
    'color:#fff;font-family:inherit;font-weight:800;font-size:15px;text-align:center;outline:none}' +
    '.wau-save{background:linear-gradient(135deg,#818cf8,#ec4899);color:#fff;border:none;border-radius:9px;padding:9px 13px;' +
    'font-family:inherit;font-weight:700;font-size:12px;cursor:pointer}' +
    '.wau-adm{background:rgba(251,191,36,.16);color:#fbbf24;border:1px solid rgba(251,191,36,.3);border-radius:9px;padding:9px 12px;' +
    'font-family:inherit;font-weight:700;font-size:12px;cursor:pointer}' +
    '.wau-del{background:transparent;color:#f87171;border:1px solid rgba(248,113,113,.4);border-radius:9px;padding:9px 12px;' +
    'font-family:inherit;font-weight:700;font-size:12px;cursor:pointer}' +
    '.wau-save:hover,.wau-adm:hover,.wau-del:hover{filter:brightness(1.12)}' +
    '@media(max-width:560px){.wau-name{flex:1 1 100%}}';
  (document.head || document.documentElement).appendChild(style);

  // النافذة في body
  var ov = document.createElement('div');
  ov.id = 'wau-ov';
  ov.innerHTML =
    '<div class="wau-card">' +
      '<div class="wau-head"><h3>👥 المستخدمون</h3>' +
        '<div class="wau-tools"><button class="wau-refresh">↻ تحديث</button><button class="wau-close">إغلاق</button></div>' +
      '</div>' +
      '<div class="wau-count" id="wau-count"></div>' +
      '<input class="wau-search" id="wau-search" type="text" placeholder="بحث بالاسم أو الجوال…">' +
      '<div id="wau-body">جارِ التحميل…</div>' +
    '</div>';
  document.body.appendChild(ov);

  function rowsHtml(users) {
    if (!users.length) return '<div style="color:#9b98c4;padding:8px">لا يوجد مستخدمون مطابقون</div>';
    return users.map(function (u) {
      return '<div class="wau-row">' +
        '<div class="wau-name">' + esc(u.username) + (u.isAdmin ? ' <span class="wau-badge">مشرف</span>' : '') +
          (u.phone ? ' <span class="wau-phone">#' + u.id + ' — ' + esc(u.phone) + '</span>' : ' <span class="wau-phone">#' + u.id + '</span>') +
        '</div>' +
        '<span style="font-size:12px;color:#9b98c4">التذاكر</span>' +
        '<input class="wau-cred" type="number" min="0" value="' + (u.credits || 0) + '" data-id="' + u.id + '">' +
        '<button class="wau-save" data-act="save" data-id="' + u.id + '">حفظ</button>' +
        '<button class="wau-adm" data-act="admin" data-id="' + u.id + '" data-val="' + (u.isAdmin ? 0 : 1) + '" data-name="' + esc(u.username) + '">' + (u.isAdmin ? 'إلغاء الإشراف' : 'ترقية') + '</button>' +
        '<button class="wau-del" data-act="del" data-id="' + u.id + '" data-name="' + esc(u.username) + '">حذف</button>' +
        '</div>';
    }).join('');
  }
  function filtered() {
    var q = ($('wau-search') && $('wau-search').value || '').trim().toLowerCase();
    if (!q) return cache;
    return cache.filter(function (u) {
      return (u.username || '').toLowerCase().indexOf(q) !== -1 || (u.phone || '').toLowerCase().indexOf(q) !== -1;
    });
  }
  function render() {
    if ($('wau-count')) $('wau-count').textContent = cache.length ? ('العدد: ' + cache.length) : '';
    if ($('wau-body')) $('wau-body').innerHTML = rowsHtml(filtered());
  }
  function load() {
    if ($('wau-body')) $('wau-body').innerHTML = 'جارِ التحميل…';
    api('/api/admin/users').then(function (d) { cache = d || []; render(); })
      .catch(function (e) { if ($('wau-body')) $('wau-body').innerHTML = '<div style="color:#f87171;padding:8px">' + esc(e.message) + '</div>'; });
  }
  function open() { ov.classList.add('on'); load(); }
  function close() { ov.classList.remove('on'); }

  // زر «إدارة المستخدمين» أعلى لوحة التحكم يفتح القائمة (يُعاد ربطه بعد إعادة الرسم).
  function ensureTrigger() {
    var btn = document.getElementById('wau-open-btn');
    if (btn && !btn.getAttribute('data-wau')) {
      btn.setAttribute('data-wau', '1');
      btn.addEventListener('click', open);
    }
  }

  // نداءات الأزرار داخل النافذة (event delegation)
  ov.addEventListener('click', function (e) {
    var t = e.target;
    if (t.classList.contains('wau-close') || t === ov) { close(); return; }
    if (t.classList.contains('wau-refresh')) { load(); return; }
    var act = t.getAttribute('data-act'); if (!act) return;
    var id = t.getAttribute('data-id');
    var inp = ov.querySelector('.wau-cred[data-id="' + id + '"]');
    if (act === 'save') {
      var val = inp ? Number(inp.value) : 0;
      api('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ credits: val }) }).then(load).catch(function (e) { alert(e.message); });
    } else if (act === 'admin') {
      var mk = t.getAttribute('data-val') === '1';
      var nm2 = t.getAttribute('data-name');
      var q = mk ? ('ترقية «' + nm2 + '» ليصير مشرفًا؟ راح يقدر يدير كل شيء بهذي اللوحة.') : ('إلغاء إشراف «' + nm2 + '»؟');
      if (confirm(q)) {
        api('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ isAdmin: mk }) }).then(load).catch(function (e) { alert(e.message); });
      }
    } else if (act === 'del') {
      var nm = t.getAttribute('data-name');
      if (confirm('حذف المستخدم «' + nm + '»؟ لا يمكن التراجع.')) {
        api('/api/admin/users/' + id, { method: 'DELETE' }).then(load).catch(function (e) { alert(e.message); });
      }
    }
  });
  ov.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'wau-search') render();
  });

  setInterval(ensureTrigger, 800);
  ensureTrigger();
})();
