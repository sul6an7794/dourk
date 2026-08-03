function PhaseRow(chipClass, chipText, deadlineTs) {
  const row = el('div', 'phase-row');
  row.style.marginTop = '10px';
  row.appendChild(el('span', `chip ${chipClass}`, chipText));
  if (deadlineTs) row.appendChild(Timer(deadlineTs));
  return row;
}

function LowTimeWarning(deadlineTs, text) {
  const warning = el('div', 'low-warning', text);
  warning.style.display = isLowTime(deadlineTs) ? 'block' : 'none';
  const interval = setInterval(() => {
    if (!document.body.contains(warning)) { clearInterval(interval); return; }
    warning.style.display = isLowTime(deadlineTs) ? 'block' : 'none';
  }, 500);
  return warning;
}

function PickGrid(targets, selectedId, colorClass, onPick, subFor) {
  const grid = el('div', 'pick-grid');
  targets.forEach((t) => {
    const tile = el('button', `pick-tile${selectedId === t.id ? ` sel-${colorClass}` : ''}${t.dim ? ' dim' : ''}`);
    tile.type = 'button';
    const info = el('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:1px';
    info.appendChild(el('span', 'tile-name', t.name + (t.id === MafiaSocket.deviceId ? ' (أنت)' : '')));
    const sub = subFor ? subFor(t) : null;
    if (sub) {
      const subEl = el('span', 'tile-sub', sub.text);
      if (sub.color) subEl.style.color = sub.color;
      info.appendChild(subEl);
    }
    tile.appendChild(info);
    if (!t.dim) tile.addEventListener('click', () => onPick(t.id));
    grid.appendChild(tile);
  });
  return grid;
}

function renderNightScreen(state, actions) {
  const night = state.nightRole ? state.nightRole.night : null;
  if (!state.nightRole) return renderNightPending(state);
  if (!state.alive || night === 'dead' || state.nightSubmitted) return renderNightWait(state);
  if (night === 'kill') return renderMafiaNight(state, actions);
  if (night === 'protect') return renderDoctorNight(state, actions);
  if (night === 'check') return renderSheikhNight(state, actions);
  if (night === 'steal') return renderThiefNight(state, actions);
  if (night === 'fighter') return renderFighterNight(state, actions);
  if (night === 'curse') return renderCurseScreen(state);
  if (night === 'decoy') return renderVillagerCode(state, actions);
  return renderNightWait(state);
}

function renderNightPending(state) {
  const wrap = el('div', 'night-pending-screen');
  wrap.appendChild(el('span', 'chip chip-night', `☾ الليل — الجولة ${state.round}`));
  wrap.appendChild(el('div', 'muted-note', 'جاري تجهيز دورك الليلي…'));
  return wrap;
}

function renderNightWait(state) {
  const wrap = el('div', 'wait-screen rise');
  wrap.appendChild(el('span', 'chip chip-night', `☾ الليل — الجولة ${state.round}`));
  const rings = el('div', 'moon-rings');
  rings.appendChild(el('div', 'ring1'));
  rings.appendChild(el('div', 'ring2'));
  rings.appendChild(el('div', 'moon', '☾'));
  wrap.appendChild(rings);
  wrap.appendChild(el('div', 'wait-title', 'المدينة نائمة…'));
  const dots = el('div', 'wait-dots');
  for (let i = 0; i < 3; i++) dots.appendChild(el('span'));
  wrap.appendChild(dots);
  wrap.appendChild(el('div', 'muted-note', 'أغمض عينيك. لا تتكلم.'));
  return wrap;
}

function renderMafiaNight(state, actions) {
  const wrap = el('div', 'night-screen rise');
  wrap.appendChild(el('div', 'hazard-strip'));
  wrap.appendChild(PhaseRow('chip-night-solid', `☾ دورك: ${state.role.label} · الجولة ${state.round}`, state.deadlineTs));

  const head = el('div');
  head.style.cssText = 'text-align:center;margin-top:4px';
  head.appendChild(el('div', 'night-title red', 'اختر هدفك'));
  head.appendChild(el('div', 'night-sub', 'المدينة نائمة. أنت تقرر.'));
  wrap.appendChild(head);

  const partnerPickId = state.partnerPick ? state.partnerPick.targetId : null;
  wrap.appendChild(PickGrid(state.nightRole.targets, state.nightPick, 'red', (id) => actions.pickNightTarget(id), (t) => (
    partnerPickId === t.id
      ? { text: `🗡 ${state.partnerPick.name}`, color: 'var(--gold-light)' }
      : { text: 'نائم', color: 'var(--text-faint)' }
  )));

  wrap.appendChild(LowTimeWarning(state.deadlineTs, '⚠ عند انتهاء الوقت سيُتخذ القرار عشوائيًا'));

  const footer = el('div', 'night-footer');
  const hasPartner = state.nightRole.partners.length > 0;
  const matched = !hasPartner ? !!state.nightPick : (state.nightPick && partnerPickId === state.nightPick);
  const hint = el('div', 'hint-line');
  hint.style.color = 'var(--evil-light)';
  hint.textContent = matched && state.nightPick
    ? `الهدف المختار: ${nameOf(state, state.nightPick)}`
    : (hasPartner && state.nightPick && partnerPickId && partnerPickId !== state.nightPick
      ? `تعادل بينك وبين ${state.nightRole.partners[0].name} — اختر نفس الهدف لتنفيذ القتل`
      : 'اختر لاعبًا أولًا');
  footer.appendChild(hint);

  const btn = el('button', `big-btn ${matched ? 'red armed' : 'idle'}`, 'تأكيد القتل');
  btn.disabled = !matched;
  btn.addEventListener('click', () => actions.confirmKill());
  footer.appendChild(btn);
  footer.appendChild(el('div', 'muted-note', 'لا يمكنك الكلام الآن.'));
  wrap.appendChild(footer);
  return wrap;
}

function renderDoctorNight(state, actions) {
  const wrap = el('div', 'night-screen rise');
  wrap.appendChild(PhaseRow('chip-blue', `☾ دورك: الطبيب · الجولة ${state.round}`, state.deadlineTs));

  const intro = el('div', 'role-intro');
  const img = document.createElement('img');
  img.src = 'assets/characters/doctor.webp';
  img.alt = 'الطبيب';
  intro.appendChild(img);
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'night-title blue', 'من تحمي الليلة؟'));
  txt.appendChild(el('div', 'night-sub', 'اختر لاعبًا لم تحمه في الليلة الماضية. إذا استهدفته العصابة، ينجو.'));
  intro.appendChild(txt);
  wrap.appendChild(intro);

  wrap.appendChild(PickGrid(state.nightRole.targets, state.nightPick, 'blue', (id) => actions.pickNightTarget(id)));
  wrap.appendChild(LowTimeWarning(state.deadlineTs, '⚠ عند انتهاء الوقت سيُتخذ القرار عشوائيًا'));

  const footer = el('div', 'night-footer');
  const hint = el('div', 'hint-line');
  hint.style.color = 'var(--good-light)';
  hint.textContent = state.nightPick ? `ستحمي الليلة: ${nameOf(state, state.nightPick)}` : 'اختر لاعبًا لحمايته';
  footer.appendChild(hint);
  const btn = el('button', `big-btn ${state.nightPick ? 'blue' : 'idle'}`, 'تأكيد الحماية');
  btn.disabled = !state.nightPick;
  btn.addEventListener('click', () => actions.confirmProtect());
  footer.appendChild(btn);
  footer.appendChild(el('div', 'muted-note', 'لا أحد يعرف من حميت.'));
  wrap.appendChild(footer);
  return wrap;
}

function renderSheikhNight(state, actions) {
  const wrap = el('div', 'night-screen rise');
  wrap.appendChild(PhaseRow('chip-gold', `☾ دورك: الشيخ · الجولة ${state.round}`, state.deadlineTs));

  const intro = el('div', 'role-intro');
  const img = document.createElement('img');
  img.src = 'assets/characters/sheikh.webp';
  img.alt = 'الشيخ';
  intro.appendChild(img);
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'night-title gold', 'تحقق من هوية لاعب'));
  txt.appendChild(el('div', 'night-sub', 'نتائجك تُحفظ في دفترك — تراها كل نهار.'));
  intro.appendChild(txt);
  wrap.appendChild(intro);

  const checkedMap = {};
  (state.nightRole.checked || []).forEach((c) => { checkedMap[c.id] = c.isEvil; });
  const targets = state.nightRole.targets.map((t) => Object.assign({}, t, { dim: checkedMap.hasOwnProperty(t.id) || state.sheikhResult !== null }));

  wrap.appendChild(PickGrid(targets, state.nightPick, 'gold', (id) => actions.pickNightTarget(id), (t) => {
    if (checkedMap.hasOwnProperty(t.id)) {
      return checkedMap[t.id]
        ? { text: 'عصابة ✕', color: 'var(--evil-light)' }
        : { text: 'بريء ✓', color: 'var(--good-light)' };
    }
    return { text: 'لم تتحقق منه', color: 'var(--text-faint)' };
  }));

  if (state.sheikhResult) {
    const box = el('div', 'sheikh-result');
    box.style.border = `1px solid ${state.sheikhResult.isEvil ? 'var(--evil)' : 'rgba(0,183,240,0.5)'}`;
    const title = el('div', 'title', state.sheikhResult.isEvil ? `${state.sheikhResult.name} من العصابة!` : `${state.sheikhResult.name} بريء`);
    title.style.color = state.sheikhResult.isEvil ? 'var(--evil-light)' : 'var(--good-light)';
    box.appendChild(title);
    box.appendChild(el('div', 'desc', state.sheikhResult.isEvil
      ? 'رأيت الحقيقة بعينك — لكن كيف تقنع البقية دون أن تنكشف؟'
      : 'ليس من العصابة. استعمل هذه المعلومة بحكمة في النقاش.'));
    wrap.appendChild(box);
  }

  wrap.appendChild(LowTimeWarning(state.deadlineTs, '⚠ عند انتهاء الوقت سينتهي الليل تلقائيًا'));

  const footer = el('div', 'night-footer');
  const hint = el('div', 'hint-line');
  hint.style.color = 'var(--gold-light)';
  hint.textContent = state.sheikhResult
    ? 'حُفظت النتيجة في دفترك'
    : (state.nightPick ? `ستتحقق من: ${nameOf(state, state.nightPick)}` : 'اختر لاعبًا للتحقق منه');
  footer.appendChild(hint);
  const canAct = state.sheikhResult || state.nightPick;
  const btn = el('button', `big-btn ${canAct ? (state.sheikhResult ? 'blue' : 'gold') : 'idle'}`, state.sheikhResult ? 'إنهاء الليل' : 'كشف الهوية');
  btn.disabled = !canAct;
  btn.addEventListener('click', () => (state.sheikhResult ? actions.finishNight() : actions.sheikhCheck()));
  footer.appendChild(btn);
  wrap.appendChild(footer);
  return wrap;
}

function renderThiefActivatePrompt(state, actions) {
  const wrap = el('div', 'night-screen rise');
  wrap.appendChild(PhaseRow('chip-gold', `☾ دورك: الحرامي · الجولة ${state.round}`, state.deadlineTs));

  const intro = el('div', 'role-intro');
  const img = document.createElement('img');
  img.src = 'assets/characters/thief.webp';
  img.alt = 'الحرامي';
  intro.appendChild(img);
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'night-title gold', 'هل تسرق صوتًا الليلة؟'));
  txt.appendChild(el('div', 'night-sub', 'تملكها مرة واحدة طوال اللعبة. إذا فعّلتها الليلة، من تختاره يفقد صوته غدًا — تُستهلك الميزة فورًا.'));
  intro.appendChild(txt);
  wrap.appendChild(intro);

  const footer = el('div', 'night-footer');
  const hint = el('div', 'hint-line');
  hint.style.color = 'var(--gold-light)';
  hint.textContent = 'اختر بحذر: تقدر تأجّلها لليلة أفضل، بس ما ترجع بعد ما تفعّلها.';
  footer.appendChild(hint);

  const activateBtn = el('button', 'big-btn gold', 'سرقة صوت الليلة');
  activateBtn.addEventListener('click', () => actions.activateThiefChoice());
  footer.appendChild(activateBtn);

  const skipBtn = el('button', 'big-btn ghost', 'عدم التفعيل');
  skipBtn.addEventListener('click', () => actions.finishNight());
  footer.appendChild(skipBtn);
  wrap.appendChild(footer);
  return wrap;
}

function renderThiefNight(state, actions) {
  if (!state.thiefWantsSteal) return renderThiefActivatePrompt(state, actions);

  const wrap = el('div', 'night-screen rise');
  wrap.appendChild(PhaseRow('chip-gold', `☾ دورك: الحرامي · الجولة ${state.round}`, state.deadlineTs));

  const intro = el('div', 'role-intro');
  const img = document.createElement('img');
  img.src = 'assets/characters/thief.webp';
  img.alt = 'الحرامي';
  intro.appendChild(img);
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'night-title gold', 'اسرق صوت لاعب'));
  txt.appendChild(el('div', 'night-sub', 'من تختاره يفقد صوته بالتصويت غدًا — بدون ما يعرف السبب.'));
  intro.appendChild(txt);
  wrap.appendChild(intro);

  wrap.appendChild(PickGrid(state.nightRole.targets, state.nightPick, 'gold', (id) => actions.pickNightTarget(id)));
  wrap.appendChild(LowTimeWarning(state.deadlineTs, '⚠ عند انتهاء الوقت سيُتخذ القرار عشوائيًا'));

  const footer = el('div', 'night-footer');
  const hint = el('div', 'hint-line');
  hint.style.color = 'var(--gold-light)';
  hint.textContent = state.nightPick ? `ستسرق صوت: ${nameOf(state, state.nightPick)} غدًا` : 'اختر لاعبًا لتسرق صوته غدًا';
  footer.appendChild(hint);
  const btn = el('button', `big-btn ${state.nightPick ? 'gold' : 'idle'}`, 'تأكيد السرقة');
  btn.disabled = !state.nightPick;
  btn.addEventListener('click', () => actions.confirmSteal());
  footer.appendChild(btn);
  footer.appendChild(el('div', 'muted-note', 'لا أحد يعرف من سرقت.'));
  wrap.appendChild(footer);
  return wrap;
}

function renderFighterNight(state, actions) {
  const wrap = el('div', 'night-screen rise');
  wrap.appendChild(PhaseRow('chip-blue', `☾ دورك: المصارع · الجولة ${state.round}`, state.deadlineTs));

  const intro = el('div', 'role-intro');
  const img = document.createElement('img');
  img.src = 'assets/characters/fighter.webp';
  img.alt = 'المصارع';
  intro.appendChild(img);
  const txt = el('div', 'txt');
  txt.appendChild(el('div', 'night-title blue', 'هل تفعّل النجاة؟'));
  txt.appendChild(el('div', 'night-sub', 'تملكها لليلة واحدة فقط. إذا فعّلتها ولم يقتلوك، تُستهلك الميزة.'));
  intro.appendChild(txt);
  wrap.appendChild(intro);

  const footer = el('div', 'night-footer');
  const hint = el('div', 'hint-line');
  hint.style.color = 'var(--good-light)';
  hint.textContent = 'اختر بحذر: التفعيل يحميك هذه الليلة فقط ثم تنتهي الميزة.';
  footer.appendChild(hint);

  const activateBtn = el('button', 'big-btn blue', 'تفعيل النجاة هذه الليلة');
  activateBtn.addEventListener('click', () => actions.activateFighter());
  footer.appendChild(activateBtn);

  const skipBtn = el('button', 'big-btn ghost', 'عدم التفعيل');
  skipBtn.addEventListener('click', () => actions.finishNight());
  footer.appendChild(skipBtn);
  wrap.appendChild(footer);
  return wrap;
}

function renderCurseScreen(state) {
  const wrap = el('div', 'curse-screen rise');
  wrap.appendChild(el('span', 'chip chip-gold', `☾ الليل — الجولة ${state.round}`));
  wrap.appendChild(el('div', 'curse-candle', '🕯'));
  wrap.appendChild(el('div', 'curse-title', 'لعنة الوريثة'));
  wrap.appendChild(el('div', 'curse-desc', 'أُعدمت الوريثة أمس — وقبل أن تموت عطّلت قوى الخير هذه الليلة. لا حماية، ولا تحقيق.'));
  return wrap;
}

function renderVillagerCode(state, actions) {
  const wrap = el('div', 'code-screen rise');
  wrap.appendChild(el('span', 'chip chip-gold', '☾ الليل — إجراء أمني'));
  wrap.appendChild(el('div', 'code-title', 'أدخل كود التحقق الليلي'));
  wrap.appendChild(el('div', 'code-sub', 'لا تُرِ شاشتك لأحد. أدخل نفس الكود الظاهر أسفله بالأرقام.'));

  const code = state.code;
  const glyphs = el('div', 'code-glyphs');
  for (let i = 0; i < 6; i++) {
    const typed = i < code.entered.length;
    const revealed = i < code.revealedCount;
    const g = el('span', typed ? 'typed' : (revealed ? 'revealed' : ''), typed ? '•' : (revealed ? code.target[i] : '•'));
    g.dataset.codeGlyph = String(i);
    glyphs.appendChild(g);
  }
  wrap.appendChild(glyphs);

  const dots = el('div', 'code-dots');
  for (let i = 0; i < 6; i++) {
    const d = el('span', `${i < code.revealedCount ? 'revealed' : ''} ${i < code.entered.length ? 'typed' : ''}`.trim());
    d.dataset.codeDot = String(i);
    dots.appendChild(d);
  }
  wrap.appendChild(dots);

  const waitNote = el('div', 'muted-note', 'انتظر… الرقم القادم يظهر بعد قليل');
  waitNote.dataset.codeNote = 'wait';
  waitNote.style.display = code.entered.length >= code.revealedCount && code.entered.length < 6 ? 'block' : 'none';
  wrap.appendChild(waitNote);

  const keypad = el('div', 'keypad');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach((label) => {
    const key = el('button', label === '' ? 'hidden-key' : '', label);
    if (label) key.dataset.codeKey = label === '⌫' ? 'backspace' : label;
    key.disabled = label === '' || code.entered.length >= 6 || (label !== '⌫' && code.entered.length >= code.revealedCount);
    key.addEventListener('click', () => {
      if (label === '⌫') actions.codeBackspace();
      else actions.codePress(label);
    });
    keypad.appendChild(key);
  });
  wrap.appendChild(keypad);

  const doneNote = el('div', 'muted-note', 'تم — بانتظار انتهاء الليل…');
  doneNote.dataset.codeNote = 'done';
  doneNote.style.display = code.entered.length >= 6 ? 'block' : 'none';
  wrap.appendChild(doneNote);

  return wrap;
}
