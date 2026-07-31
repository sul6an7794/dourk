function renderDeadScreen(state, actions) {
  const wrap = el('div', 'dead-screen');
  wrap.appendChild(el('div', 'dead-title', state.death ? state.death.deathTitle : ''));

  const card = RoleCard(state.death ? state.death.card : state.myCard, { className: 'dead-card' });
  wrap.appendChild(card);

  wrap.appendChild(el('div', 'dead-reason', state.death ? state.death.deathReason : ''));
  wrap.appendChild(el('div', 'muted-note', 'خرجت من اللعبة ولا يحق لك الكلام.'));

  const btn = el('button', 'big-btn blue', '👁 شاهد بقية اللعبة');
  btn.style.marginTop = '10px';
  btn.addEventListener('click', () => actions.spectate());
  wrap.appendChild(btn);
  return wrap;
}

function renderGameOverScreen(state, actions) {
  const actionsReady = state.gameOverActionsReady;
  const wrap = el('div', 'gameover-screen');
  const g = state.gameOver;
  if (!g) return wrap;
  const isMafiaWin = g.winner === 'mafia';

  wrap.appendChild(el('div', 'kicker', 'GAME OVER'));
  wrap.appendChild(el('div', `win-title ${isMafiaWin ? 'mafia' : 'town'}`, isMafiaWin ? 'فازت العصابة' : 'فاز المواطنون'));

  const me = g.roles.find((r) => r.playerId === MafiaSocket.deviceId);
  if (me) {
    const personal = el('div', `personal-result ${me.won ? 'won' : 'lost'}`, me.won ? 'نتيجتك: فزت' : 'نتيجتك: خسرت');
    wrap.appendChild(personal);
    if (me.roleId === 'joker' && !me.won) {
      wrap.appendChild(el('div', 'personal-reason', 'المهرج لا يفوز إلا إذا قُتل أو أُقصي قبل نهاية اللعبة.'));
    }
  }

  const cards = el('div', 'win-cards');
  g.winnerCards.forEach((wc, idx) => {
    const cell = el('div', 'win-card');
    const cardNode = RoleCard(wc.file, { className: `win-card-image-only ${isMafiaWin ? 'mafia' : 'town'}` });
    cardNode.style.animationDelay = `${idx * 90}ms`;
    cardNode.addEventListener('click', () => actions.zoomCard(wc.file, cardNode.getBoundingClientRect()));
    cell.appendChild(cardNode);
    cards.appendChild(cell);
  });
  wrap.appendChild(cards);

  wrap.appendChild(el('div', 'win-reason', g.winReason));

  const summary = el('section', 'game-summary');
  summary.appendChild(el('div', 'game-summary__title', 'ملخص اللعبة'));
  summary.appendChild(el('div', 'game-summary__round', `حُسمت في الجولة ${g.round}`));

  const addGroup = (title, roles, tone) => {
    if (!roles.length) return;
    const group = el('div', `game-summary__group ${tone}`);
    group.appendChild(el('div', 'game-summary__label', title));
    const list = el('div', 'game-summary__list');
    roles.forEach((role) => list.appendChild(el('span', 'game-summary__player', `${role.name} · ${role.label}`)));
    group.appendChild(list);
    summary.appendChild(group);
  };

  addGroup('بقي للنهاية', g.roles.filter((role) => role.alive), 'survivors');
  addGroup('خرجوا من اللعبة', g.roles.filter((role) => !role.alive), 'fallen');
  wrap.appendChild(summary);

  const shareLabel = state.shareResultBusy ? 'جارِ التجهيز…' : (state.shareResultDone ? 'تمت المشاركة ✓' : 'مشاركة النتيجة');
  const shareBtn = el('button', 'big-btn ghost', shareLabel);
  shareBtn.id = 'shareResultBtn';
  shareBtn.disabled = state.shareResultBusy;
  shareBtn.addEventListener('click', () => actions.shareResult());
  wrap.appendChild(shareBtn);

  if (me) {
    wrap.appendChild(el('div', 'muted-note', `انتهت اللعبة في الجولة ${g.round} · كنت ${me.label} — ${me.won ? 'فزت!' : 'خسرت'}`));
  }

  const isHost = state.hostId === MafiaSocket.deviceId;

  const btnLabel = isHost
    ? (state.newGamePending ? 'جارِ التحضير…' : 'لعبة جديدة')
    : 'بانتظار القائد للعبة جديدة…';
  const btn = el('button', `big-btn ${isHost ? 'blue' : 'idle'}`, btnLabel);
  btn.id = 'newGameBtn';
  btn.style.marginTop = '8px';
  if (!actionsReady) btn.style.display = 'none';
  btn.disabled = !isHost || state.newGamePending;
  btn.addEventListener('click', () => actions.newGame());
  wrap.appendChild(btn);

  if (state.error) {
    const err = el('div', 'hint-line', state.error);
    err.style.color = 'var(--evil-light)';
    wrap.appendChild(err);
  }

  const leaveBtn = el('button', 'big-btn ghost');
  leaveBtn.appendChild(document.createTextNode('العودة إلى\u00A0'));
  leaveBtn.appendChild(el('span', 'dourk-return-mark', 'دورك'));
  if (!actionsReady) leaveBtn.style.display = 'none';
  leaveBtn.addEventListener('click', () => actions.leaveRoom());
  wrap.appendChild(leaveBtn);
  return wrap;
}
