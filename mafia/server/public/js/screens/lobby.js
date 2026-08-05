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
  // شعار مافيا وباقي عنوان اللوبي يتكرر رسمه بكل إعادة رسم (كل رد سيرفر يعيد بناء الشاشة
  // بالكامل) — لو شغّلنا حركة الدخول (rise) بكل مرة، الشعار "يرمش" كل ما ينتقل من نموذج
  // الإنشاء لغرفة الانتظار مباشرة بعد إنشاء الغرفة. نشغّلها مرة وحدة بس أول ظهور بهالجلسة.
  const showEntrance = !state.lobbyEntranceShown;
  state.lobbyEntranceShown = true;
  // إنشاء/الانضمام لغرفة يصير فقط من منصة دورك (?room=CODE أو ?autoCreate=1) — ما فيه
  // نموذج إنشاء/انضمام يدوي داخل مافيا نفسها. لو ما وصل أي رابط تحويل صالح، bootstrapFromQuery
  // بـapp.js يرجّع المستخدم لصفحة دورك — هذي الشاشة تبين لحظيًا بس ريثما يصير التحويل.
  if (!state.roomCode) return renderBootstrapping(state, showEntrance);
  return renderWaitingRoom(state, actions, showEntrance);
}

function renderBootstrapping(state, showEntrance) {
  const wrap = el('div', `lobby-hero${showEntrance ? ' rise' : ''}`);
  wrap.appendChild(LogoBox());
  wrap.appendChild(el('p', 'lobby-sub', 'جارِ التحويل إلى دورك…'));
  if (state.error) {
    const err = el('div', 'hint-line', state.error);
    err.style.color = 'var(--evil-light)';
    wrap.appendChild(err);
  }
  return wrap;
}

function renderWaitingRoom(state, actions, showEntrance) {
  const isHost = state.hostId === MafiaSocket.deviceId;
  const wrap = el('div', `lobby-hero${showEntrance ? ' rise' : ''}`);

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

    settingsPanel.appendChild(el('div', '', 'مدة التصويت'));
    const voteRow = el('div', 'phase-row vote-duration-row');
    const currentSec = Math.round((state.voteMs || 60000) / 1000);
    [{ sec: 60, label: 'دقيقة' }, { sec: 120, label: 'دقيقتين' }, { sec: 180, label: '3 دقايق' }].forEach(({ sec, label }) => {
      const optBtn = el('button', `small-btn ${currentSec === sec ? 'on' : ''}`, label);
      optBtn.type = 'button';
      optBtn.addEventListener('click', () => actions.setVoteDuration(sec));
      voteRow.appendChild(optBtn);
    });
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
