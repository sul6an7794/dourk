function votersFor(state, targetId) {
  const names = [];
  for (const [voterId, tId] of Object.entries(state.votes)) {
    if (tId === targetId) {
      const voter = state.players.find((p) => p.id === voterId);
      if (voter) names.push(voter.id === MafiaSocket.deviceId ? 'أنت' : voter.name);
    }
  }
  return names;
}

function renderVoteScreen(state, actions) {
  const wrap = el('div', 'vote-screen rise');
  wrap.appendChild(PhaseRow('chip-vote', 'حان وقت التصويت', state.deadlineTs));

  if (state.mafiaTeammates && state.mafiaTeammates.length > 0) wrap.appendChild(TeammatesBox(state.mafiaTeammates));
  if (state.notebook.length > 0) wrap.appendChild(NotebookBox(state.notebook, true));

  const myVote = state.votes[MafiaSocket.deviceId] || null;
  const rows = el('div', 'vote-rows scroll-y');

  state.players.filter((p) => p.alive).forEach((p) => {
    const isMe = p.id === MafiaSocket.deviceId;
    const isMy = myVote === p.id;
    const isAccused = state.accusedId === p.id;
    const stamped = state.expelStampId === p.id;
    const voters = votersFor(state, p.id);
    const stolenFromMe = isMe && state.voteBlocked;

    const row = el('div', `vote-row${isAccused ? ' accused' : ''}${stamped ? ' stamped' : ''}${isMy ? ' voted' : ''}`);
    row.dataset.voteRow = p.id;

    const info = el('div', 'v-info');
    info.appendChild(el('span', 'v-name', isMe ? `أنت (${p.name})` : p.name));
    const stateLine = el('span', 'v-state');
    stateLine.dataset.voteState = p.id;
    if (stamped) { stateLine.textContent = 'خرج من اللعبة'; stateLine.style.color = 'var(--text-faint)'; }
    else if (stolenFromMe) { stateLine.textContent = 'سُرق صوتك الليلة الماضية'; stateLine.style.color = 'var(--gold)'; }
    else if (voters.length) { stateLine.textContent = `صوّت عليه: ${voters.join('، ')}`; stateLine.style.color = isAccused ? 'var(--evil-light)' : 'var(--warn)'; }
    else { stateLine.textContent = 'لم يُتّهم بعد'; stateLine.style.color = 'var(--good-light)'; }
    info.appendChild(stateLine);
    row.appendChild(info);

    const side = el('div', 'v-side');
    const prevCount = state.prevRaw ? (state.prevRaw[p.id] || 0) : (state.raw[p.id] || 0);
    const nextCount = state.raw[p.id] || 0;
    const countNode = numberTicker(prevCount, nextCount, `v-count${nextCount > prevCount ? ' pop' : ''}`);
    countNode.dataset.voteCount = p.id;
    side.appendChild(countNode);
    const disabled = isMe || state.spectator || state.voteBlocked || !state.alive;
    const btn = el('button', `vote-btn${disabled ? ' off' : (isMy ? ' mine' : '')}`, isMe ? 'أنت' : (isMy ? '✓ صوتك' : 'صوّت'));
    btn.dataset.voteButton = p.id;
    btn.disabled = disabled;
    btn.addEventListener('click', () => actions.voteToggle(state.votes[MafiaSocket.deviceId] === p.id ? null : p.id));
    side.appendChild(btn);
    row.appendChild(side);

    if (stamped) row.appendChild(el('span', 'stamp', 'أُقصي'));
    rows.appendChild(row);
  });
  wrap.appendChild(rows);

  wrap.appendChild(LowTimeWarning(state.deadlineTs, '⚠ عند انتهاء الوقت ينتهي النهار بلا إقصاء'));

  const footer = el('div', 'night-footer');
  const accused = state.accusedId ? state.players.find((p) => p.id === state.accusedId) : null;
  const hint = el('div', 'hint-line');
  hint.dataset.voteHint = 'main';
  hint.style.color = 'var(--text-dim)';
  hint.textContent = state.spectator || !state.alive
    ? 'أنت تشاهد فقط — المدينة تقرر'
    : (myVote
      ? `صوتك على: ${nameOf(state, myVote)}${accused ? ` · المتهم الآن: ${accused.name}` : ''}`
      : 'اضغط «صوّت» بجانب لاعب');
  footer.appendChild(hint);

  const actionsRow = el('div', 'vote-actions');
  const canVoteAction = state.alive && !state.spectator;
  const pardonBtn = el('button', `big-btn ${canVoteAction ? 'blue' : 'idle'}`, `عفو${state.pardons ? ` (${arNum(state.pardons)})` : ''}`);
  pardonBtn.dataset.voteAction = 'pardon';
  pardonBtn.disabled = !canVoteAction;
  if (canVoteAction) pardonBtn.style.color = 'var(--good-light)';
  pardonBtn.addEventListener('click', () => actions.pardonRequest());
  actionsRow.appendChild(pardonBtn);

  const expelBtn = el('button', `big-btn ${myVote && canVoteAction ? 'red' : 'idle'}`, `إقصاء المتهم${state.executes ? ` (${arNum(state.executes)})` : ''}`);
  expelBtn.dataset.voteAction = 'execute';
  expelBtn.disabled = !myVote || !canVoteAction;
  expelBtn.addEventListener('click', () => actions.executeRequest());
  actionsRow.appendChild(expelBtn);
  footer.appendChild(actionsRow);

  footer.appendChild(el('div', 'vote-note', 'ملاحظة: عند تعادل الأصوات لا يُقصى أحد وتنتقل المدينة لليل مباشرة.'));
  wrap.appendChild(footer);
  return wrap;
}

function renderDefenseScreen(state, actions) {
  const wrap = el('div', 'defense-screen rise');
  const topRow = el('div', 'phase-row');
  topRow.style.width = '100%';
  topRow.appendChild(el('span', 'chip chip-night', 'آخر فرصة للدفاع'));
  if (state.deadlineTs) topRow.appendChild(Timer(state.deadlineTs));
  wrap.appendChild(topRow);

  wrap.appendChild(el('div', 'hint-line', 'المتهم بأغلبية الأصوات'));
  wrap.appendChild(el('div', 'defense-name', state.defense ? state.defense.accusedName : ''));

  const isSelf = state.defense && state.defense.accusedId === MafiaSocket.deviceId;
  if (isSelf) {
    wrap.appendChild(el('div', 'defense-desc', 'أنت المتّهم. دافع عن نفسك أمام الجميع الآن — القرار بيد البقية.'));
    wrap.appendChild(el('div', 'muted-note', 'عند انتهاء الوقت يُنفَّذ الإقصاء تلقائيًا.'));
  } else {
    const canDefenseAction = state.alive && !state.spectator;
    const box = el('div');
    box.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;margin-top:8px';
    box.appendChild(el('div', 'defense-desc', 'استمعوا لدفاعه، ثم قرروا: تغيير الصوت أو تنفيذ الإقصاء.'));

    const changeBtn = el('button', `big-btn ${canDefenseAction ? 'blue' : 'idle'}`, `تغيير الصوت${state.defenseCounts ? ` (${arNum(state.defenseCounts.changes)})` : ''}`);
    changeBtn.dataset.defenseAction = 'change';
    if (canDefenseAction) changeBtn.style.color = 'var(--good-light)';
    changeBtn.disabled = !canDefenseAction;
    changeBtn.addEventListener('click', () => actions.defenseChoice('change'));
    box.appendChild(changeBtn);

    const execBtn = el('button', `big-btn ${canDefenseAction ? 'red' : 'idle'}`, `تنفيذ الإقصاء${state.defenseCounts ? ` (${arNum(state.defenseCounts.executes)})` : ''}`);
    execBtn.dataset.defenseAction = 'execute';
    execBtn.disabled = !canDefenseAction;
    execBtn.addEventListener('click', () => actions.defenseChoice('execute'));
    box.appendChild(execBtn);

    box.appendChild(el('div', 'muted-note', 'عند انتهاء الوقت يُنفَّذ الإقصاء تلقائيًا.'));
    wrap.appendChild(box);
  }
  return wrap;
}
