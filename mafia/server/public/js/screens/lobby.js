function LogoBox() {
  const box = el('div', 'logo-box');
  const dotR = el('div', 'dot r');
  const dotL = el('div', 'dot l');
  box.appendChild(dotR);
  box.appendChild(dotL);
  box.appendChild(el('div', 'logo-latin', 'M A F I A'));
  box.appendChild(el('div', 'logo-ar', 'مافيا'));
  return box;
}

function renderLobbyScreen(state, actions) {
  if (!state.roomCode && state.bootstrapping) return renderBootstrapping(state);
  if (!state.roomCode) return renderHomeForm(state, actions);
  return renderWaitingRoom(state, actions);
}

// تحويل تلقائي من منصة دورك قيد التنفيذ (إنشاء/انضمام) — نعرض تحميل بدل نموذج الإنشاء
// اليدوي، وإلا يبين للمستخدم إنه وصل لصفحة "إنشاء غرفة" ثانية بعد صفحة المنصة.
function renderBootstrapping(state) {
  const wrap = el('div', 'lobby-hero rise');
  wrap.appendChild(LogoBox());
  wrap.appendChild(el('p', 'lobby-sub', 'جارِ تجهيز غرفتك…'));
  if (state.error) {
    const err = el('div', 'hint-line', state.error);
    err.style.color = 'var(--evil-light)';
    wrap.appendChild(err);
  }
  return wrap;
}

function renderHomeForm(state, actions) {
  const wrap = el('div', 'lobby-hero rise');
  wrap.appendChild(LogoBox());
  wrap.appendChild(el('p', 'lobby-sub', 'لعبة الخداع الاجتماعي'));

  const panel = el('div', 'lobby-panel');

  const nameInput = el('input');
  nameInput.className = 'field';
  nameInput.placeholder = 'اسمك';
  nameInput.maxLength = 20;
  panel.appendChild(nameInput);

  const createBtn = el('button', 'big-btn red', 'أنشئ غرفة جديدة');
  createBtn.addEventListener('click', () => actions.createRoom(nameInput.value));
  panel.appendChild(createBtn);

  panel.appendChild(el('div', 'lobby-divider', 'أو'));

  const codeInput = el('input');
  codeInput.className = 'field room-code-input';
  codeInput.placeholder = 'كود الغرفة';
  codeInput.maxLength = 6;
  codeInput.inputMode = 'numeric';
  codeInput.pattern = '[0-9]*';
  codeInput.style.textAlign = 'center';
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  });
  const linkedRoom = new URLSearchParams(location.search).get('room');
  if (linkedRoom) codeInput.value = String(linkedRoom).replace(/\D/g, '').slice(0, 6);
  panel.appendChild(codeInput);

  const joinBtn = el('button', 'big-btn blue', 'انضم للغرفة');
  joinBtn.addEventListener('click', () => actions.joinRoom(codeInput.value, nameInput.value));
  panel.appendChild(joinBtn);

  if (state.error) {
    const err = el('div', 'hint-line', state.error);
    err.style.color = 'var(--evil-light)';
    panel.appendChild(err);
  }

  wrap.appendChild(panel);
  return wrap;
}

function renderWaitingRoom(state, actions) {
  const isHost = state.hostId === MafiaSocket.deviceId;
  const wrap = el('div', `lobby-hero${state.bootstrapping ? '' : ' rise'}`);

  wrap.appendChild(LogoBox());
  wrap.appendChild(el('div', 'kicker', 'غرفة الانتظار'));
  wrap.appendChild(el('div', 'room-code-big', state.roomCode));

  const inviteLink = `${location.origin}/?room=${state.roomCode}`;
  const shareBtn = el('button', 'small-btn', '🔗 انسخ رابط الدعوة');
  shareBtn.addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'مافيا', text: 'انضم لغرفتي!', url: inviteLink });
      else {
        await navigator.clipboard.writeText(inviteLink);
        shareBtn.textContent = '✓ تم النسخ';
        setTimeout(() => { shareBtn.textContent = '🔗 انسخ رابط الدعوة'; }, 2000);
      }
    } catch (e) { /* أُلغيت المشاركة */ }
  });
  const invite = el('div', 'lobby-invite');
  const qr = el('img', 'lobby-qr');
  qr.src = qrDataUrl(inviteLink, '#f2f4f7', '#0d1420');
  qr.alt = 'رمز QR للانضمام إلى الغرفة';
  qr.width = 220;
  qr.height = 220;
  invite.appendChild(qr);
  invite.appendChild(el('div', 'muted-note', 'امسح الرمز من جوال اللاعب أو شارك الرابط.'));
  invite.appendChild(shareBtn);
  wrap.appendChild(invite);

  const panel = el('div', 'lobby-panel');
  const head = el('div', 'phase-row');
  head.appendChild(el('span', 'chip chip-gold', `اللاعبون ${arNum(state.players.length)} / ${arNum(13)}`));
  head.appendChild(el('span', 'muted-note', 'الحد الأدنى ٦'));
  panel.appendChild(head);

  const list = el('div', 'lobby-players');
  state.players.forEach((p) => {
    const row = el('div', 'lobby-player-row');
    const name = el('span', '', p.name + (p.id === MafiaSocket.deviceId ? ' (أنت)' : ''));
    name.style.fontWeight = '700';
    const playerName = el('span', 'lobby-player-name');
    playerName.appendChild(name);
    const presence = el('span', `player-presence ${p.connected ? 'online' : 'offline'}`);
    presence.setAttribute('aria-label', p.connected ? 'متصل' : 'غير متصل');
    playerName.appendChild(presence);
    row.appendChild(playerName);
    if (p.isBot) row.appendChild(el('span', 'chip chip-gold', '🤖 بوت'));
    if (!p.connected) row.appendChild(el('span', 'pill-off', 'غير متصل'));
    if (p.id === state.hostId) row.appendChild(el('span', 'host-star', '★ القائد'));
    // القائد يقدر يطرد أي لاعب (غير نفسه) من اللوبي قبل بدء اللعبة فقط.
    if (isHost && p.id !== state.hostId && !p.isBot) {
      const kickBtn = el('button', 'small-btn ghost', '✕ طرد');
      kickBtn.addEventListener('click', () => actions.kickPlayer(p.id));
      row.appendChild(kickBtn);
    }
    list.appendChild(row);
  });
  panel.appendChild(list);
  wrap.appendChild(panel);

  if (isHost) {
    const botPanel = el('div', 'lobby-panel');
    botPanel.appendChild(el('div', 'muted-note', 'أضف لاعبين آليين (بوتات) عشان تجرب اللعبة لحالك'));
    const botRow = el('div', 'phase-row');
    const botCount = el('input');
    botCount.type = 'number';
    botCount.min = '1';
    botCount.max = String(13 - state.players.length);
    botCount.value = String(Math.min(5, Math.max(1, 13 - state.players.length)));
    botCount.className = 'field';
    botCount.style.width = '70px';
    botCount.disabled = state.players.length >= 13;
    botRow.appendChild(botCount);
    const addBotsBtn = el('button', 'small-btn', '🤖 أضف بوتات');
    addBotsBtn.disabled = state.players.length >= 13;
    addBotsBtn.addEventListener('click', () => actions.addBots(Number(botCount.value) || 1));
    botRow.appendChild(addBotsBtn);
    const hasBots = state.players.some((p) => p.isBot);
    if (hasBots) {
      const removeBotsBtn = el('button', 'small-btn', '🗑 امسح البوتات');
      removeBotsBtn.addEventListener('click', () => actions.removeBots());
      botRow.appendChild(removeBotsBtn);
    }
    botPanel.appendChild(botRow);
    wrap.appendChild(botPanel);

    const settingsPanel = el('div', 'lobby-panel');
    const settingsRow = el('div', 'phase-row');
    const settingsLabel = el('span', '', 'الإعلان عن فريق المُقصى (خير/شر) بعد التصويت');
    settingsRow.appendChild(settingsLabel);
    const toggleBtn = el('button', `small-btn ${state.revealTeamOnExpel ? 'on' : ''}`, state.revealTeamOnExpel ? 'مفعّل' : 'معطّل');
    toggleBtn.addEventListener('click', () => actions.setExpelReveal(!state.revealTeamOnExpel));
    settingsRow.appendChild(toggleBtn);
    settingsPanel.appendChild(settingsRow);
    settingsPanel.appendChild(el('div', 'muted-note', 'ملاحظة: القتل ليلًا يبقى مجهول الهوية دائمًا حتى النهاية — هذا الخيار يخص الإقصاء بالتصويت فقط.'));

    const voteRow = el('div', 'phase-row');
    voteRow.appendChild(el('span', '', 'مدة التصويت'));
    const voteSelect = el('select', 'field');
    voteSelect.style.width = 'auto';
    [20, 30, 40, 60, 90, 120].forEach((sec) => {
      const opt = document.createElement('option');
      opt.value = String(sec);
      opt.textContent = sec + ' ثانية';
      if (Math.round((state.voteMs || 40000) / 1000) === sec) opt.selected = true;
      voteSelect.appendChild(opt);
    });
    voteSelect.addEventListener('change', () => actions.setVoteDuration(Number(voteSelect.value)));
    voteRow.appendChild(voteSelect);
    settingsPanel.appendChild(voteRow);

    wrap.appendChild(settingsPanel);
  }

  if (isHost) {
    const startBtn = el('button', `big-btn ${state.players.length >= 6 ? 'red' : 'idle'}`, 'ابدأ اللعبة');
    startBtn.disabled = state.players.length < 6;
    startBtn.addEventListener('click', () => actions.startGame());
    wrap.appendChild(startBtn);
  } else {
    wrap.appendChild(el('div', 'muted-note', 'بانتظار القائد ليبدأ اللعبة…'));
  }

  if (state.error) {
    const err = el('div', 'hint-line', state.error);
    err.style.color = 'var(--evil-light)';
    wrap.appendChild(err);
  }

  const leaveBtn = el('button', 'big-btn ghost', 'غادر الغرفة');
  leaveBtn.addEventListener('click', () => actions.leaveRoom());
  wrap.appendChild(leaveBtn);

  return wrap;
}
