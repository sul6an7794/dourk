function nameOf(state, playerId) {
  const p = state.players.find((x) => x.id === playerId);
  return p ? p.name : '';
}

// تحميل مؤجّل لأداة التقاط الصورة (html2canvas) — تُستخدم فقط بزر "مشاركة النتيجة"،
// فلا داعي تُحمَّل مع كل زيارة للعبة.
const H2C_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
let h2cLoading = null;
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve(window.html2canvas);
  if (h2cLoading) return h2cLoading;
  h2cLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = H2C_URL;
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => reject(new Error('تعذّر تحميل أداة الصورة'));
    document.head.appendChild(s);
  });
  return h2cLoading;
}

(function () {
  const { socket, emitAck, deviceId } = MafiaSocket;
  const root = document.getElementById('screenRoot');
  const bgNight = document.getElementById('bgNight');
  const bgDay = document.getElementById('bgDay');
  const shell = document.getElementById('appShell');
  const spectatorChip = document.getElementById('spectatorChip');
  const stripSlot = document.getElementById('stripSlot');
  const overlaySlot = document.getElementById('overlaySlot');
  const edgeLayer = document.getElementById('edgeLayer');
  const connectionChip = document.getElementById('connectionChip');

  const state = {
    roomCode: null,
    hostId: null,
    players: [],
    phase: 'home',
    round: 1,
    deadlineTs: null,
    revealTeamOnExpel: false,
    voteMs: null,
    skipNextDayFlash: false,
    error: null,
    role: null,
    myCard: null,
    presentCards: [],
    alive: true,
    spectator: false,
    death: null,
    flipped: false,
    revealSent: false,
    nightRole: null,
    nightPick: null,
    nightSubmitted: false,
    partnerPick: null,
    sheikhResult: null,
    code: { target: '000000', revealedCount: 0, entered: '' },
    codeTimers: [],
    dayEvent: null,
    dayReadySent: false,
    log: [],
    notebook: [],
    votes: {},
    raw: {},
    prevRaw: {},
    accusedId: null,
    pardons: 0,
    executes: 0,
    voteBlocked: false,
    expelStampId: null,
    defense: null,
    defenseCounts: null,
    deathRevealName: null,
    gameOver: null,
    gameOverActionsReady: false,
    shareResultBusy: false,
    shareResultDone: false,
    newGamePending: false,
    princessReveal: null,
    zoomedCard: null,
    zoomedCardRect: null,
    connection: 'connecting',
  };

  let lastStripKey = null;
  let lastAnimatedPhase = null;
  let renderQueued = false;
  let pendingVotesUpdate = null;
  let votesUpdateTimer = null;
  let votesBatchPrevRaw = null;
  const compactScreen = window.matchMedia('(max-width: 560px)');

  function syncViewportHeight() {
    const visibleHeight = window.visualViewport && window.visualViewport.height
      ? window.visualViewport.height
      : window.innerHeight;
    const h = Math.max(Math.round(visibleHeight || 0), 320);
    document.documentElement.style.setProperty('--app-height', `${h}px`);
  }

  function queueViewportHeightSync() {
    requestAnimationFrame(syncViewportHeight);
  }

  syncViewportHeight();
  window.addEventListener('resize', queueViewportHeightSync, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(syncViewportHeight, 180), { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueViewportHeightSync, { passive: true });
  }

  function myPlayer() {
    return state.players.find((p) => p.id === deviceId) || null;
  }

  function clearCodeTimers() {
    state.codeTimers.forEach(clearTimeout);
    state.codeTimers = [];
  }

  function startCodeDecoy() {
    clearCodeTimers();
    state.code = {
      target: String(Math.floor(100000 + Math.random() * 900000)),
      revealedCount: 0,
      entered: '',
    };
    const schedule = (n) => {
      if (n > 6) return;
      const t = setTimeout(() => {
        if (state.phase !== 'night' || state.nightSubmitted || !state.nightRole || state.nightRole.night !== 'decoy') return;
        state.code.revealedCount = n;
        if (!updateCodeDom()) render();
        schedule(n + 1);
      }, 650 + Math.random() * 750);
      state.codeTimers.push(t);
    };
    schedule(1);
  }

  function compactOverlayBackground(kind) {
    if (kind === 'day') return 'rgba(18,24,31,0.94)';
    if (kind === 'saved') return 'rgba(5,26,34,0.94)';
    if (kind === 'shift') return 'rgba(28,22,12,0.94)';
    if (kind === 'princess') return 'rgba(5,24,34,0.94)';
    if (kind === 'night' || kind === 'kill' || kind === 'death') return 'rgba(20,6,10,0.95)';
    return 'rgba(5,8,13,0.94)';
  }

  function softenCompactOverlay(ov, kind) {
    if (!compactScreen.matches) return;
    ov.classList.add('compact');
    ov.style.background = compactOverlayBackground(kind);
  }

  function showOverlay(kind) {
    overlaySlot.innerHTML = '';
    const ov = el('div', `phase-overlay ${kind}`);
    if (kind === 'night') {
      ov.style.background = 'radial-gradient(480px 360px at 50% 35%, rgba(255,45,45,0.25), rgba(5,8,13,0.97) 70%)';
      ov.appendChild(el('div', 'overlay-icon', '☾'));
      const t = el('div', 'overlay-title', 'بدأ الليل');
      t.style.cssText += ';color:#FF2D2D;text-shadow:0 0 26px rgba(255,45,45,0.6)';
      ov.appendChild(t);
      ov.appendChild(el('div', 'overlay-sub', 'المدينة نائمة.'));
    } else if (kind === 'day') {
      ov.style.background = 'radial-gradient(480px 360px at 50% 35%, rgba(168,175,184,0.22), rgba(12,15,19,0.97) 70%)';
      const icon = el('div', 'overlay-icon', '☀');
      icon.style.cssText += ';color:#FFB15E;text-shadow:0 0 30px rgba(255,177,94,0.6)';
      ov.appendChild(icon);
      ov.appendChild(el('div', 'overlay-title', 'بدأ النهار'));
      ov.appendChild(el('div', 'overlay-sub', 'انكشفت الحقيقة… أو بعضها.'));
    } else if (kind === 'kill') {
      ov.style.background = 'radial-gradient(500px 400px at 50% 45%, rgba(255,45,45,0.55), rgba(20,6,9,0.97) 75%)';
      const t = el('div', 'overlay-title', 'نُفّذ القتل');
      t.style.cssText += ';color:#FF2D2D;text-shadow:0 0 30px rgba(255,45,45,0.8)';
      ov.appendChild(t);
      const s = el('div', 'overlay-sub', 'العصابة أولًا. تقتل بالليل وتخفي أثرها في النهار.');
      s.style.color = 'var(--evil-light)';
      ov.appendChild(s);
    } else if (kind === 'death') {
      ov.style.background = 'radial-gradient(520px 420px at 50% 45%, rgba(255,45,45,0.62), rgba(12,0,4,0.97) 76%)';
      const t = el('div', 'overlay-title', 'سقط قتيل');
      t.style.cssText += ';color:#FF2D2D;text-shadow:0 0 34px rgba(255,45,45,0.85)';
      ov.appendChild(t);
      const s = el('div', 'overlay-sub', 'الصباح يكشف الاسم، لا الهوية.');
      s.style.color = '#FFB15E';
      ov.appendChild(s);
    } else if (kind === 'saved') {
      ov.style.background = 'radial-gradient(500px 390px at 50% 45%, rgba(0,183,240,0.34), rgba(5,8,13,0.96) 75%)';
      const t = el('div', 'overlay-title', 'نجاة');
      t.style.cssText += ';color:#7FE7FF;text-shadow:0 0 32px rgba(0,183,240,0.72)';
      ov.appendChild(t);
      ov.appendChild(el('div', 'overlay-sub', 'محاولة الليل لم تكتمل.'));
    } else if (kind === 'shift') {
      ov.style.background = 'radial-gradient(500px 390px at 50% 45%, rgba(200,154,69,0.34), rgba(5,8,13,0.96) 75%)';
      const t = el('div', 'overlay-title', 'شيء تغيّر');
      t.style.cssText += ';color:#E0B86A;text-shadow:0 0 32px rgba(200,154,69,0.7)';
      ov.appendChild(t);
      ov.appendChild(el('div', 'overlay-sub', 'المدينة لم تعد كما كانت.'));
    } else if (kind === 'princess') {
      const name = state.princessReveal ? state.princessReveal.name : '';
      ov.style.background = 'radial-gradient(520px 410px at 50% 45%, rgba(0,183,240,0.36), rgba(5,8,13,0.97) 75%)';
      const t = el('div', 'overlay-title', 'كُشفت الأميرة');
      t.style.cssText += ';color:#7FE7FF;text-shadow:0 0 32px rgba(0,183,240,0.7)';
      ov.appendChild(t);
      ov.appendChild(el('div', 'overlay-sub', `${name ? `${name}: ` : ''}لا تُقصى، لكن بطاقتها ظهرت للجميع.`));
    }
    softenCompactOverlay(ov, kind);
    overlaySlot.appendChild(ov);
    setTimeout(() => { if (ov.parentNode) ov.remove(); }, (kind === 'kill' || kind === 'death') ? 1400 : 1800);
  }

  function pulseShell(className, ms) {
    if (compactScreen.matches) return;
    shell.classList.remove(className);
    void shell.offsetWidth;
    shell.classList.add(className);
    setTimeout(() => shell.classList.remove(className), ms);
  }

  function syncChrome() {
    const nightish = ['reveal', 'night', 'deathReveal', 'gameover', 'dead'].includes(state.phase) || state.phase === 'home' || state.phase === 'lobby';
    bgNight.style.opacity = nightish ? '1' : '0';
    bgDay.style.opacity = nightish ? '0' : '1';
    shell.classList.toggle('spectating', state.spectator && state.phase !== 'gameover');
    spectatorChip.style.display = state.spectator && state.phase !== 'gameover' ? 'inline-flex' : 'none';
    if (connectionChip) {
      const connected = state.connection === 'online';
      const reconnecting = state.connection === 'reconnecting';
      connectionChip.textContent = '';
      connectionChip.setAttribute('aria-label', connected ? 'متصل' : (reconnecting ? 'جارِ استعادة الاتصال' : 'غير متصل'));
      connectionChip.className = 'connection-chip ' + (connected ? 'online' : (reconnecting ? '' : 'offline'));
    }
    const showStrip = ['night', 'day', 'vote', 'defense'].includes(state.phase) && state.presentCards.length > 0;
    const stripKey = showStrip ? `${state.phase}|${state.presentCards.join(',')}|${state.myCard}` : null;
    const hasRenderedStrip = stripSlot.childElementCount > 0;
    if (stripKey !== lastStripKey || (!showStrip && hasRenderedStrip)) {
      lastStripKey = stripKey;
      const activeDrawer = stripSlot.querySelector('.cards-drawer-shell');
      if (activeDrawer && typeof activeDrawer.cleanup === 'function') activeDrawer.cleanup();
      stripSlot.innerHTML = '';
      if (showStrip) {
        stripSlot.appendChild(CardsStrip(state.presentCards, state.myCard, (file, rect) => {
          state.zoomedCard = file;
          state.zoomedCardRect = rect;
          render();
        }));
      }
    }

  }

  function renderNow() {
    root.innerHTML = '';
    syncChrome();

    let node;
    if (state.phase === 'home' || state.phase === 'lobby') {
      node = renderLobbyScreen(state, actions);
    } else if (!state.alive && !state.spectator && state.phase !== 'gameover') {
      node = renderDeadScreen(state, actions);
    } else if (state.phase === 'reveal') {
      node = renderRevealScreen(state, actions);
    } else if (state.phase === 'night') {
      node = state.spectator ? renderNightWait(state) : renderNightScreen(state, actions);
    } else if (state.phase === 'deathReveal') {
      node = renderDeathRevealScreen(state, actions);
    } else if (state.phase === 'day') {
      node = renderDayScreen(state, actions);
    } else if (state.phase === 'vote') {
      node = renderVoteScreen(state, actions);
    } else if (state.phase === 'defense') {
      node = renderDefenseScreen(state, actions);
    } else if (state.phase === 'gameover') {
      node = renderGameOverScreen(state, actions);
    } else {
      node = el('div', 'muted-note', 'جارِ التحميل…');
    }
    // كل شاشة تحمل كلاس "rise" (حركة دخول fade+slide) بشكل ثابت بكودها — لو نفس المرحلة
    // (phase) لسا معروضة من رسم سابق (يعني السبب مجرد تحديث ثانوي: لاعب جديد انضم، بوت
    // انضاف، حالة اتصال تغيّرت...) نشيلها عشان الشاشة كلها ما تومض/تعيد حركتها من الصفر
    // بلا داعي — تشتغل فقط أول ما تدخل مرحلة جديدة فعليًا.
    if (state.phase === lastAnimatedPhase) node.classList.remove('rise');
    else lastAnimatedPhase = state.phase;

    root.appendChild(node);

    if (state.zoomedCard) {
      root.appendChild(CardZoom(state.zoomedCard, () => {
        state.zoomedCard = null;
        state.zoomedCardRect = null;
        render();
      }, state.zoomedCardRect));
    }
  }

  function render() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderNow();
    });
  }

  function findByDataset(selector, key, value) {
    return [...root.querySelectorAll(selector)].find((node) => node.dataset[key] === value) || null;
  }

  function updateCodeDom() {
    const screen = root.querySelector('.code-screen');
    if (!screen) return false;
    const code = state.code;

    screen.querySelectorAll('[data-code-glyph]').forEach((node) => {
      const i = Number(node.dataset.codeGlyph);
      const typed = i < code.entered.length;
      const revealed = i < code.revealedCount;
      node.className = `${revealed ? 'revealed' : ''} ${typed ? 'typed' : ''}`.trim();
      node.textContent = typed ? '•' : (revealed ? code.target[i] : '•');
    });

    screen.querySelectorAll('[data-code-dot]').forEach((node) => {
      const i = Number(node.dataset.codeDot);
      node.className = `${i < code.revealedCount ? 'revealed' : ''} ${i < code.entered.length ? 'typed' : ''}`.trim();
    });

    screen.querySelectorAll('[data-code-key]').forEach((key) => {
      const label = key.dataset.codeKey;
      key.disabled = code.entered.length >= 6 || (label !== 'backspace' && code.entered.length >= code.revealedCount);
    });

    const waitNote = screen.querySelector('[data-code-note="wait"]');
    if (waitNote) waitNote.style.display = code.entered.length >= code.revealedCount && code.entered.length < 6 ? 'block' : 'none';
    const doneNote = screen.querySelector('[data-code-note="done"]');
    if (doneNote) doneNote.style.display = code.entered.length >= 6 ? 'block' : 'none';
    return true;
  }

  function updateDayDom() {
    const dayScreen = root.querySelector('.day-screen');
    if (!dayScreen || typeof eventCardFor !== 'function' || typeof CityLog !== 'function') return false;

    const eventNode = dayScreen.querySelector('.day-event-card');
    if (eventNode) eventNode.replaceWith(eventCardFor(state));

    const logNode = dayScreen.querySelector('.city-log');
    const notebookNode = dayScreen.querySelector('.notebook-box');
    if (state.notebook.length > 0 && typeof NotebookBox === 'function') {
      const nextNotebook = NotebookBox(state.notebook, false);
      if (notebookNode) notebookNode.replaceWith(nextNotebook);
      else if (logNode) dayScreen.insertBefore(nextNotebook, logNode);
    } else if (notebookNode) {
      notebookNode.remove();
    }

    const currentLogNode = dayScreen.querySelector('.city-log');
    if (currentLogNode) currentLogNode.replaceWith(CityLog(state.log));
    return true;
  }

  function voteStateText(targetId) {
    const names = [];
    for (const [voterId, votedId] of Object.entries(state.votes)) {
      if (votedId === targetId) {
        const voter = state.players.find((p) => p.id === voterId);
        if (voter) names.push(voter.id === deviceId ? 'أنت' : voter.name);
      }
    }
    return names;
  }

  function updateVoteDom() {
    const voteScreen = root.querySelector('.vote-screen');
    if (!voteScreen) return false;
    const alivePlayers = state.players.filter((p) => p.alive);
    if (voteScreen.querySelectorAll('[data-vote-row]').length !== alivePlayers.length) return false;

    const myVote = state.votes[deviceId] || null;
    const accused = state.accusedId ? state.players.find((p) => p.id === state.accusedId) : null;

    for (const p of alivePlayers) {
      const row = findByDataset('[data-vote-row]', 'voteRow', p.id);
      if (!row) return false;
      const isMe = p.id === deviceId;
      const isMy = myVote === p.id;
      const isAccused = state.accusedId === p.id;
      const stamped = state.expelStampId === p.id;
      const stolenFromMe = isMe && state.voteBlocked;
      const voters = voteStateText(p.id);

      row.classList.toggle('accused', isAccused);
      row.classList.toggle('stamped', stamped);
      row.classList.toggle('voted', isMy);

      const line = findByDataset('[data-vote-state]', 'voteState', p.id);
      if (!line) return false;
      if (stamped) {
        line.textContent = 'خرج من اللعبة';
        line.style.color = 'var(--text-faint)';
      } else if (stolenFromMe) {
        line.textContent = 'سُرق صوتك الليلة الماضية';
        line.style.color = 'var(--gold)';
      } else if (voters.length) {
        line.textContent = `صوّت عليه: ${voters.join('، ')}`;
        line.style.color = isAccused ? 'var(--evil-light)' : 'var(--warn)';
      } else {
        line.textContent = 'لم يُتّهم بعد';
        line.style.color = 'var(--good-light)';
      }

      const count = findByDataset('[data-vote-count]', 'voteCount', p.id);
      if (!count) return false;
      const prevCount = state.prevRaw ? (state.prevRaw[p.id] || 0) : (state.raw[p.id] || 0);
      const nextCount = state.raw[p.id] || 0;
      const nextCountNode = numberTicker(prevCount, nextCount, `v-count${nextCount > prevCount ? ' pop' : ''}`);
      nextCountNode.dataset.voteCount = p.id;
      count.replaceWith(nextCountNode);

      const btn = findByDataset('[data-vote-button]', 'voteButton', p.id);
      if (!btn) return false;
      const disabled = isMe || state.spectator || state.voteBlocked || !state.alive;
      btn.disabled = disabled;
      btn.className = `vote-btn${disabled ? ' off' : (isMy ? ' mine' : '')}`;
      btn.textContent = isMe ? 'أنت' : (isMy ? '✓ صوتك' : 'صوّت');

      const stamp = row.querySelector('.stamp');
      if (stamped && !stamp) row.appendChild(el('span', 'stamp', 'أُقصي'));
      if (!stamped && stamp) stamp.remove();
    }

    const hint = root.querySelector('[data-vote-hint="main"]');
    if (hint) {
      hint.textContent = state.spectator || !state.alive
        ? 'أنت تشاهد فقط — المدينة تقرر'
        : (myVote
          ? `صوتك على: ${nameOf(state, myVote)}${accused ? ` · المتهم الآن: ${accused.name}` : ''}`
          : 'اضغط «صوّت» بجانب لاعب');
    }

    const pardonBtn = root.querySelector('[data-vote-action="pardon"]');
    if (pardonBtn) {
      const canVoteAction = state.alive && !state.spectator;
      pardonBtn.textContent = `عفو${state.pardons ? ` (${arNum(state.pardons)})` : ''}`;
      pardonBtn.disabled = !canVoteAction;
      pardonBtn.className = `big-btn ${canVoteAction ? 'blue' : 'idle'}`;
      pardonBtn.style.color = canVoteAction ? 'var(--good-light)' : '';
    }

    const expelBtn = root.querySelector('[data-vote-action="execute"]');
    if (expelBtn) {
      const canVoteAction = state.alive && !state.spectator;
      expelBtn.textContent = `إقصاء المتهم${state.executes ? ` (${arNum(state.executes)})` : ''}`;
      expelBtn.disabled = !myVote || !canVoteAction;
      expelBtn.className = `big-btn ${myVote && canVoteAction ? 'red' : 'idle'}`;
    }

    return true;
  }

  function updateDefenseDom() {
    const defenseScreen = root.querySelector('.defense-screen');
    if (!defenseScreen || !state.defenseCounts) return false;
    const changeBtn = root.querySelector('[data-defense-action="change"]');
    const execBtn = root.querySelector('[data-defense-action="execute"]');
    const canDefenseAction = state.alive && !state.spectator;
    if (changeBtn) {
      changeBtn.textContent = `تغيير الصوت (${arNum(state.defenseCounts.changes)})`;
      changeBtn.disabled = !canDefenseAction;
      changeBtn.className = `big-btn ${canDefenseAction ? 'blue' : 'idle'}`;
      changeBtn.style.color = canDefenseAction ? 'var(--good-light)' : '';
    }
    if (execBtn) {
      execBtn.textContent = `تنفيذ الإقصاء (${arNum(state.defenseCounts.executes)})`;
      execBtn.disabled = !canDefenseAction;
      execBtn.className = `big-btn ${canDefenseAction ? 'red' : 'idle'}`;
    }
    return true;
  }

  function applyVotesUpdate(payload, prevRaw) {
    state.votes = payload.votes;
    state.prevRaw = prevRaw || state.raw;
    state.raw = payload.raw;
    state.accusedId = payload.accusedId;
    state.pardons = payload.pardons;
    state.executes = payload.executes;
    if (state.phase === 'vote' && updateVoteDom()) return;
    render();
  }

  function queueVotesUpdate(payload) {
    pendingVotesUpdate = payload;
    if (votesUpdateTimer) return;
    votesBatchPrevRaw = state.raw;
    votesUpdateTimer = setTimeout(() => {
      const latest = pendingVotesUpdate;
      const prevRaw = votesBatchPrevRaw;
      pendingVotesUpdate = null;
      votesBatchPrevRaw = null;
      votesUpdateTimer = null;
      if (latest) applyVotesUpdate(latest, prevRaw);
    }, 100);
  }

  const actions = {
    // يلتقط بطاقة النتائج كصورة (html2canvas) ويشاركها (Web Share على الجوال) أو ينزّلها.
    async shareResult() {
      if (state.shareResultBusy) return;
      const g = state.gameOver;
      if (!g) return;
      state.shareResultBusy = true;
      const shareBtn = document.getElementById('shareResultBtn');
      if (shareBtn) { shareBtn.disabled = true; shareBtn.textContent = 'جارِ التجهيز…'; }
      // نبني بطاقة مخصّصة للمشاركة (نسبة ستوري 9:16، بدون أزرار/ملخص طويل) بدل التقاط
      // شاشة النهاية التفاعلية كما هي — نعرضها خارج حدود الشاشة (مو display:none، لازم
      // تكون مرسومة فعليًا عشان html2canvas يقدر يلتقطها) ثم نشيلها بعد التصوير.
      const target = buildShareCard(g, g.winner === 'mafia');
      target.style.position = 'fixed';
      target.style.top = '0';
      target.style.left = '-9999px';
      document.body.appendChild(target);
      try {
        // نستنى تحميل الخطوط المخصّصة فعليًا قبل التقاط الصورة — بدونه html2canvas قد يلتقط
        // بالخط الاحتياطي للمتصفح (لو ما خلص تحميل الخط بعد)، فتطلع الصورة بخط مختلف عن الموقع.
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const h2c = await loadHtml2Canvas();
        const canvas = await h2c(target, { backgroundColor: '#0A0F16', scale: Math.min(2, window.devicePixelRatio || 1), useCORS: true, logging: false });
        const blob = await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
        if (!blob) throw new Error('فشل إنشاء الصورة');
        const file = new File([blob], 'mafia-result.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'نتيجة مافيا', text: 'شوف نتيجتنا في مافيا! 🎭' }).catch((e) => {
            if (!e || e.name !== 'AbortError') throw e;
          });
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'mafia-result.png';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        state.shareResultDone = true;
        if (shareBtn) shareBtn.textContent = 'تمت المشاركة ✓';
        // تحديث مباشر بدل render() كامل — render() يعيد بناء شاشة النهاية بالكامل (بطاقات الفوز
        // والعنوان...) فتُعاد كل حركات الدخول من الصفر لمجرد رجوع نص الزر — رمشة بلا داعي.
        setTimeout(() => {
          state.shareResultDone = false;
          const btn = document.getElementById('shareResultBtn');
          if (btn) btn.textContent = 'مشاركة النتيجة';
        }, 1800);
      } catch (e) {
        alert((e && e.message) || 'تعذّرت المشاركة');
      } finally {
        target.remove();
        state.shareResultBusy = false;
        if (shareBtn) {
          shareBtn.disabled = false;
          if (!state.shareResultDone) shareBtn.textContent = 'مشاركة النتيجة';
        }
      }
    },
    zoomCard(file, rect) {
      state.zoomedCard = file;
      state.zoomedCardRect = rect || null;
      render();
    },
    async createRoom(name, rt) {
      const res = await emitAck('createRoom', { name, rt });
      // ما فيه نموذج إنشاء يدوي نرجّع له عند الفشل — إنشاء الغرف يصير من دورك حصرًا،
      // فأي خطأ هنا (تذكرة غير صالحة مثلًا) يرجّع المستخدم لصفحة دورك مباشرة، مع رسالة
      // الخطأ بترويسة الرابط عشان دورك يعرضها توست بدل ما يختفي المستخدم بصمت.
      if (res.error) { window.location.href = '/?joinError=' + encodeURIComponent(res.error); return; }
      render();
    },
    async joinRoom(roomCode, name) {
      const cleanCode = String(roomCode || '').replace(/\D/g, '').slice(0, 6);
      const res = await emitAck('joinRoom', { roomCode: cleanCode, name });
      if (res.error) { window.location.href = '/?joinError=' + encodeURIComponent(res.error); return; }
      render();
    },
    async startGame() {
      const res = await emitAck('startGame', {});
      state.error = res.error || null;
      render();
    },
    async addBots(count) {
      const res = await emitAck('addBots', { count });
      state.error = res.error || null;
      render();
    },
    async removeBots() {
      const res = await emitAck('removeBots', {});
      state.error = res.error || null;
      render();
    },
    async setExpelReveal(enabled) {
      const res = await emitAck('setExpelReveal', { enabled });
      state.error = res.error || null;
      render();
    },
    async setVoteDuration(seconds) {
      const res = await emitAck('setVoteDuration', { seconds });
      state.error = res.error || null;
      render();
    },
    async kickPlayer(playerId) {
      const res = await emitAck('kickPlayer', { playerId });
      state.error = res.error || null;
      render();
    },
    flipCard() {
      state.flipped = true;
    },
    revealDone() {
      if (!state.flipped || state.revealSent) return;
      state.revealSent = true;
      socket.emit('revealDone');
      render();
    },
    pickNightTarget(id) {
      state.nightPick = id;
      if (state.nightRole && state.nightRole.night === 'kill') {
        socket.emit('mafiaPick', { targetId: id }, () => {});
      }
      render();
    },
    async confirmKill() {
      const res = await emitAck('confirmKill', {});
      if (!res.error) {
        state.nightSubmitted = true;
        showOverlay('kill');
      } else state.error = res.error;
      render();
    },
    async confirmProtect() {
      const res = await emitAck('doctorProtect', { targetId: state.nightPick });
      if (!res.error) state.nightSubmitted = true;
      else state.error = res.error;
      render();
    },
    async sheikhCheck() {
      const res = await emitAck('sheikhCheck', { targetId: state.nightPick });
      if (!res.error) {
        state.sheikhResult = { name: res.name, isEvil: res.isEvil };
      } else state.error = res.error;
      render();
    },
    finishNight() {
      socket.emit('nightReady');
      state.nightSubmitted = true;
      render();
    },
    activateThiefChoice() {
      state.thiefWantsSteal = true;
      render();
    },
    async confirmSteal() {
      const res = await emitAck('thiefSteal', { targetId: state.nightPick });
      if (!res.error) state.nightSubmitted = true;
      else state.error = res.error;
      render();
    },
    async activateFighter() {
      const res = await emitAck('fighterGuard', {});
      if (!res.error) {
        state.nightSubmitted = true;
      } else state.error = res.error;
      render();
    },
    codePress(digit) {
      const c = state.code;
      if (c.entered.length >= 6 || c.entered.length >= c.revealedCount) return;
      if (digit !== c.target[c.entered.length]) return;
      c.entered += digit;
      const updated = updateCodeDom();
      if (c.entered.length === 6) {
        setTimeout(() => {
          socket.emit('nightReady');
          state.nightSubmitted = true;
          render();
        }, 500);
      }
      if (!updated) render();
    },
    codeBackspace() {
      state.code.entered = state.code.entered.slice(0, -1);
      if (!updateCodeDom()) render();
    },
    deathRevealReady() {
      socket.emit('deathRevealReady');
    },
    dayReady() {
      state.dayReadySent = true;
      socket.emit('dayReady');
      render();
    },
    async voteToggle(targetId) {
      const res = await emitAck('voteToggle', { targetId });
      if (res.error) { state.error = res.error; render(); }
    },
    async pardonRequest() {
      await emitAck('pardonRequest', {});
    },
    async executeRequest() {
      const res = await emitAck('executeRequest', {});
      if (res.error) { state.error = res.error; render(); }
    },
    async defenseChoice(choice) {
      await emitAck('defenseChoice', { choice });
    },
    spectate() {
      state.spectator = true;
      render();
    },
    async newGame() {
      if (state.newGamePending) return; // منع ضغطة مزدوجة قبل رجوع الرد الأول
      state.newGamePending = true;
      state.error = null;
      // تحديث مباشر لزر "لعبة جديدة" بدل render() كامل — يمنع ومضة إعادة تشغيل حركة
      // الدخول على شاشة النتيجة فورًا لحظة الضغط (نفس النمط المستخدم بـshareResult أعلاه).
      const btn = document.getElementById('newGameBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'جارِ التحضير…'; }
      const res = await emitAck('newGame', {});
      state.newGamePending = false;
      if (res.error) { state.error = res.error; }
      render();
    },
    leaveRoom() {
      socket.emit('leaveRoom');
      try { localStorage.removeItem('mafia_resume'); } catch (e) {}
      clearCodeTimers();
      // خروج فعلي من صفحة اللعبة بدل تصفير محلي فقط: "/" تحل تلقائيًا لصفحة منصة دورك
      // لو اللعبة تعمل ضمن المنصة، ولصفحة مافيا نفسها لو تعمل مستقلة — بدون أي كشف يدوي للحالتين.
      setTimeout(() => { window.location.href = '/'; }, 150);
    },
  };

  socket.on('connect', () => {
    state.connection = 'online';
    if (state.roomCode) {
      const me = myPlayer();
      socket.emit('joinRoom', { roomCode: state.roomCode, name: me ? me.name : '' }, (res) => {
        if (res && res.error) { state.error = res.error; render(); }
      });
    }
    render();
  });

  socket.on('disconnect', () => {
    state.connection = state.roomCode ? 'reconnecting' : 'offline';
    render();
  });

  // القائد طردنا من اللوبي — السيرفر فصل سوكيتنا فعليًا (targetSocket.disconnect غير مستخدم
  // هنا عمدًا، فقط leave+تصفير data)، فنعيد الواجهة لشاشة البداية بدل ما تبقى معلّقة بحالة قديمة.
  socket.on('kicked', () => {
    state.roomCode = null;
    state.hostId = null;
    state.players = [];
    state.error = 'تم طردك من الغرفة';
    render();
  });

  socket.on('roomUpdate', (payload) => {
    // نخفي لودر الصفحة هنا (مو عند اكتمال تحميل السكربتات) لما تجهز الغرفة فعليًا — يمنع ظهور
    // شاشة "جارِ تجهيز غرفتك" لحظة منفصلة تحت اللودر (كانت تبين كومضة ثانية بعد اللودر نفسه).
    if (payload.roomCode && window.hidePageLoader) window.hidePageLoader();
    const prevPhase = state.phase;
    state.roomCode = payload.roomCode;
    state.hostId = payload.hostId;
    state.players = payload.players;
    state.round = payload.round;
    state.deadlineTs = payload.deadlineTs;
    state.revealTeamOnExpel = payload.revealTeamOnExpel;
    state.voteMs = payload.voteMs;
    state.phase = payload.phase === 'lobby' && !state.roomCode ? 'home' : payload.phase;
    const me = myPlayer();
    state.alive = me ? me.alive : true;
    if (state.roomCode && me) {
      try { localStorage.setItem('mafia_resume', JSON.stringify({ roomCode: state.roomCode, name: me.name })); } catch (e) {}
    }

    if (payload.phase === 'lobby' && prevPhase !== 'lobby') {
      Object.assign(state, {
        role: null, myCard: null, presentCards: [], alive: true, spectator: false,
        death: null, flipped: false, revealSent: false, nightRole: null, nightPick: null,
        nightSubmitted: false, partnerPick: null, sheikhResult: null, dayEvent: null,
        dayReadySent: false, log: [], notebook: [], votes: {}, raw: {}, prevRaw: {}, accusedId: null,
        pardons: 0, executes: 0, voteBlocked: false, expelStampId: null, defense: null,
        defenseCounts: null, deathRevealName: null, gameOver: null, gameOverActionsReady: false,
        princessReveal: null,
      });
    }

    if (payload.phase !== prevPhase) {
      state.zoomedCard = null;
      state.zoomedCardRect = null;
      lastStripKey = null;
      if (payload.phase === 'night') {
        state.nightRole = null;
        state.nightPick = null;
        state.nightSubmitted = false;
        state.partnerPick = null;
        state.sheikhResult = null;
        state.voteBlocked = false;
        state.votes = {};
        state.raw = {};
        state.prevRaw = {};
        state.accusedId = null;
        state.pardons = 0;
        state.executes = 0;
        state.expelStampId = null;
        state.defense = null;
        state.defenseCounts = null;
        state.dayReadySent = false;
        if (prevPhase !== 'home' && prevPhase !== 'lobby') {
          showOverlay('night');
          pulseShell('fx-night-pulse', 900);
        }
      }
      // ومضة "بدأ النهار" تظهر بس لو الليلة كانت هادئة فعلًا (ما مات أحد، ولا صار نجاة/تحوّل) —
      // لو صار قتل، deathReveal عرضت أصلاً ومضة كبيرة. ولو صارت نجاة/تحوّل، nightOutcome
      // (بالأسفل) عرضت ومضتها الخاصة قبل شوي — ومضة "بدأ النهار" فورًا بعدها بكلا الحالتين
      // كانت تكرار بصري مبالغ فيه (السبب الأصلي وراء "ومضات كثيرة وقت القتل").
      if (payload.phase === 'day' && prevPhase === 'night' && !state.skipNextDayFlash) {
        showOverlay('day');
      }
      state.skipNextDayFlash = false;
      if (payload.phase === 'vote') {
        state.defense = null;
      }
    }
    render();
  });

  socket.on('roleAssigned', ({ role, card, presentCards }) => {
    state.role = role;
    state.myCard = card;
    state.presentCards = presentCards || [];
    state.flipped = false;
    state.revealSent = false;
    render();
  });

  socket.on('roleChanged', ({ role, card, presentCards }) => {
    state.role = role;
    state.myCard = card;
    state.presentCards = presentCards || state.presentCards;
    lastStripKey = null;
    render();
  });

  socket.on('cardsUpdate', ({ presentCards }) => {
    state.presentCards = presentCards || [];
    lastStripKey = null;
    render();
  });

  socket.on('nightRole', (payload) => {
    state.nightRole = payload;
    state.nightPick = null;
    state.thiefWantsSteal = false;
    state.nightSubmitted = false;
    state.sheikhResult = null;
    state.partnerPick = null;
    clearCodeTimers();
    if (payload.night === 'decoy' && state.alive && !state.spectator) startCodeDecoy();
    render();
  });

  socket.on('partnerPick', ({ name, targetId }) => {
    state.partnerPick = { name, targetId };
    render();
  });

  socket.on('deathReveal', ({ name }) => {
    state.deathRevealName = name;
    showOverlay('death');
    pulseShell('fx-hit-shake', 420);
    render();
  });

  socket.on('nightOutcome', ({ outcome }) => {
    if (outcome === 'saved' || outcome === 'shift') {
      showOverlay(outcome);
      if (outcome === 'saved') pulseShell('fx-hit-shake', 320);
      // ليلة هادئة بسبب نجاة/تحوّل: هذي الومضة كافية وحدها — امنع ومضة "بدأ النهار"
      // اللي بتجي فورًا بعدها (roomUpdate يوصل بعد toDayFlow مباشرة بالسيرفر).
      state.skipNextDayFlash = true;
    }
  });

  socket.on('youDied', (payload) => {
    state.death = payload;
    state.alive = false;
    render();
  });

  socket.on('princessRevealed', (payload) => {
    state.princessReveal = payload;
    state.zoomedCard = payload.card;
    state.zoomedCardRect = null;
    showOverlay('princess');
    render();
  });

  socket.on('dayInfo', ({ event, log }) => {
    state.dayEvent = event;
    state.log = log;
    if (state.phase === 'day' && updateDayDom()) return;
    render();
  });

  socket.on('logUpdate', ({ log }) => {
    state.log = log;
    if (state.phase === 'day' && updateDayDom()) return;
    render();
  });

  socket.on('sheikhNotebook', ({ checks }) => {
    state.notebook = checks;
    if (state.phase === 'day' && updateDayDom()) return;
    render();
  });

  socket.on('votesUpdate', ({ votes, raw, accusedId, pardons, executes }) => {
    queueVotesUpdate({ votes, raw, accusedId, pardons, executes });
  });

  socket.on('voteBlocked', () => {
    state.voteBlocked = true;
    if (state.phase === 'vote' && updateVoteDom()) return;
    render();
  });

  socket.on('defenseStarted', (payload) => {
    state.defense = payload;
    state.defenseCounts = null;
    render();
  });

  socket.on('defenseUpdate', ({ executes, changes }) => {
    state.defenseCounts = { executes, changes };
    if (state.phase === 'defense' && updateDefenseDom()) return;
    render();
  });

  socket.on('expelStamp', ({ playerId }) => {
    state.expelStampId = playerId;
    state.phase = 'vote';
    render();
  });

  socket.on('gameOver', (result) => {
    state.gameOver = result;
    state.phase = 'gameover';
    state.gameOverActionsReady = false;
    clearCodeTimers();
    render();
    setTimeout(() => {
      if (state.phase === 'gameover') {
        state.gameOverActionsReady = true;
        // تحديث مباشر بدل render() كامل — نفس سبب تحديث زر المشاركة أعلاه: تفادي رمشة
        // شاشة النهاية كلها (تعيد كل حركات الدخول) لمجرد إظهار زرين بالأسفل.
        const newGameBtn = document.getElementById('newGameBtn');
        const leaveBtn = document.getElementById('gameOverLeaveBtn');
        if (newGameBtn) newGameBtn.style.display = '';
        if (leaveBtn) leaveBtn.style.display = '';
      }
    }, 1250);
  });

  render();

  // تحويل من منصة دورك: ?room=CODE ينضم تلقائيًا، ?autoCreate=1&name=...&rt=... ينشئ غرفة تلقائيًا
  // (rt = تذكرة الغرفة الصادرة من المنصة بعد خصم رصيد التذاكر — السيرفر يتحقق منها).
  (function bootstrapFromQuery() {
    try {
      const params = new URLSearchParams(window.location.search);
      const name = params.get('name') || '';
      const room = params.get('room');
      const rt = params.get('rt') || '';
      const autoCreate = params.get('autoCreate') === '1';
      if (!room && !autoCreate) {
        const resume = JSON.parse(localStorage.getItem('mafia_resume') || 'null');
        if (resume && resume.roomCode) { actions.joinRoom(resume.roomCode, resume.name || ''); return; }
        // ما فيه رابط تحويل صالح ولا غرفة نستأنفها — ما فيه نموذج إنشاء/انضمام يدوي هنا،
        // إنشاء الغرف يصير من دورك حصرًا.
        window.location.href = '/';
        return;
      }
      window.history.replaceState(null, '', window.location.pathname);
      if (room) actions.joinRoom(room, name);
      else actions.createRoom(name, rt);
    } catch (e) {}
  })();
})();
