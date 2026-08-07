function renderDeathRevealScreen(state, actions) {
  const wrap = el('div', 'death-reveal rise');
  wrap.appendChild(el('div', 'death-kicker', 'صباح مشؤوم'));
  wrap.appendChild(el('div', 'death-name', `قُتل ${state.deathRevealName || ''}`));

  const card = el('div', 'mystery-card');
  const body = el('div', 'card-body');
  const inner = el('div', 'card-inner');
  inner.appendChild(el('span', 'q', '؟'));
  inner.appendChild(el('span', 'unknown', 'هوية مجهولة'));
  body.appendChild(inner);
  card.appendChild(body);
  card.appendChild(el('span', 'stamp', 'قُتل'));
  wrap.appendChild(card);

  wrap.appendChild(el('div', 'muted-note', 'تبقى هويته سرًا حتى نهاية اللعبة'));
  const desc = el('div', 'hint-line', 'لا أحد يعرف إن كان من العصابة أو من الخير — راقبوا التصويت جيدًا.');
  desc.style.color = 'var(--text-dim)';
  wrap.appendChild(desc);

  const canContinue = state.alive && !state.spectator;
  const btn = el('button', `big-btn ${canContinue ? 'blue' : 'idle'}`, canContinue ? 'مواصلة إلى النهار' : 'بانتظار اللاعبين…');
  btn.style.marginTop = '8px';
  btn.disabled = !canContinue;
  btn.addEventListener('click', () => actions.deathRevealReady());
  wrap.appendChild(btn);
  return wrap;
}

function eventCardFor(state) {
  const ev = state.dayEvent || { title: 'نهار جديد', desc: '', kind: 'quiet' };
  const card = el('div', `day-event-card${ev.kind === 'killed' ? ' killed' : ''}`);
  const info = el('div');
  info.style.cssText = 'display:flex;flex-direction:column;gap:5px';
  const title = el('span', 'day-event-title', ev.title);
  title.style.color = ev.kind === 'killed' ? 'var(--text-dim)' : 'var(--good-light)';
  info.appendChild(title);
  info.appendChild(el('span', 'day-event-desc', ev.desc));
  card.appendChild(info);
  return card;
}

function NotebookBox(notebook, compact) {
  const box = el('div', 'notebook-box');
  box.appendChild(el('span', 'nb-title', compact ? 'دفترك:' : 'دفتر الشيخ — ما تعرفه أنت فقط'));
  const chips = el('div', 'nb-chips');
  notebook.forEach((c) => {
    chips.appendChild(el('span', `nb-chip ${c.isEvil ? 'evil' : 'good'}`, `${c.name} ${c.isEvil ? '✕ عصابة' : '✓ بريء'}`));
  });
  box.appendChild(chips);
  return box;
}

function TeammatesBox(teammates) {
  const box = el('div', 'notebook-box');
  box.appendChild(el('span', 'nb-title', 'رفاقك بالعصابة'));
  const chips = el('div', 'nb-chips');
  teammates.forEach((t) => {
    const data = ROLE_CARD_DATA[t.card];
    chips.appendChild(el('span', 'nb-chip evil', (data ? data.nameAr + ' — ' : '') + t.name));
  });
  box.appendChild(chips);
  return box;
}

function CityLog(log) {
  const box = el('div', 'city-log');
  box.appendChild(el('span', 'log-title', 'سجل المدينة'));
  const rowsWrap = el('div', 'log-rows scroll-y');
  log.slice().reverse().forEach((l) => {
    const row = el('div', 'log-row');
    row.appendChild(el('span', 'r', `ج${l.r}`));
    const text = el('span', '', l.text);
    text.style.color = l.color || 'var(--text)';
    row.appendChild(text);
    rowsWrap.appendChild(row);
  });
  box.appendChild(rowsWrap);
  return box;
}

function renderDayScreen(state, actions) {
  const wrap = el('div', 'day-screen rise');
  wrap.appendChild(PhaseRow('chip-day', `☀ النهار — الجولة ${state.round}`, state.deadlineTs));
  wrap.appendChild(eventCardFor(state));
  if (state.mafiaTeammates && state.mafiaTeammates.length > 0) wrap.appendChild(TeammatesBox(state.mafiaTeammates));
  if (state.notebook.length > 0) wrap.appendChild(NotebookBox(state.notebook, false));
  wrap.appendChild(CityLog(state.log));

  const btn = el('button', `big-btn ${state.spectator || state.dayReadySent ? 'idle' : 'blue'}`, state.dayReadySent ? 'بانتظار البقية…' : 'الانتقال إلى التصويت');
  btn.style.flexShrink = '0';
  btn.disabled = state.spectator || state.dayReadySent || !state.alive;
  btn.addEventListener('click', () => actions.dayReady());
  wrap.appendChild(btn);
  return wrap;
}
