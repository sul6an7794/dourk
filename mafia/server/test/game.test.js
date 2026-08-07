const test = require('node:test');
const assert = require('node:assert');
const rooms = require('../src/rooms');
const game = require('../src/game');

function buildTestRoom(roleAssignments) {
  const ids = Object.keys(roleAssignments);
  const room = rooms.createRoom(ids[0], ids[0]);
  for (const id of ids.slice(1)) {
    rooms.joinRoom(room.code, id, id);
  }
  for (const [id, roleId] of Object.entries(roleAssignments)) {
    room.players.get(id).roleId = roleId;
  }
  room.phase = 'night';
  return room;
}

test('الطبيب يلغي قتل المافيا إذا حمى نفس الهدف', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager' });
  game.submitMafiaPick(room, 'm', 'v1');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v1');

  const result = game.resolveNight(room);

  assert.strictEqual(result.outcome, 'saved');
  assert.strictEqual(room.players.get('v1').alive, true);
});

test('المافيا لا تستهدف نفس اللاعب في الليلة التالية إذا نجا من الهجوم', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager' });
  game.submitMafiaPick(room, 'm', 'v1');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v1');
  game.resolveNight(room);

  game.beginNight(room);
  assert.throws(() => game.submitMafiaPick(room, 'm', 'v1'), /ليلتين متتاليتين/);
  assert.doesNotThrow(() => game.submitMafiaPick(room, 'm', 'v2'));
});

test('الطبيب لا يحمي نفس اللاعب في ليلتين متتاليتين', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager' });
  game.submitMafiaPick(room, 'm', 'v2');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v1');
  game.resolveNight(room);

  game.beginNight(room);
  assert.throws(() => game.submitProtect(room, 'doc', 'v1'), /ليلتين متتاليتين/);
  assert.doesNotThrow(() => game.submitProtect(room, 'doc', 'doc'));
});

test('الطبيب لا يحمي نفسه في ليلتين متتاليتين', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager' });
  game.submitMafiaPick(room, 'm', 'v1');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'doc');
  game.resolveNight(room);

  game.beginNight(room);
  assert.throws(() => game.submitProtect(room, 'doc', 'doc'), /ليلتين متتاليتين/);
  assert.doesNotThrow(() => game.submitProtect(room, 'doc', 'v2'));
});

test('تعطيل الطبيب ليلة واحدة لا يمسح آخر لاعب حماه', () => {
  const room = buildTestRoom({ m: 'mafia', h: 'heiress', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  game.submitMafiaPick(room, 'm', 'v1');
  game.submitMafiaPick(room, 'h', 'v1');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'doc');
  game.resolveNight(room);

  room.phase = 'vote';
  game.expel(room, 'h');
  game.beginNight(room);
  assert.strictEqual(game.nightRoleFor(room, room.players.get('doc')), 'curse');

  game.beginNight(room);
  assert.throws(() => game.submitProtect(room, 'doc', 'doc'), /ليلتين متتاليتين/);
  assert.doesNotThrow(() => game.submitProtect(room, 'doc', 'v2'));
});

test('الضحية تموت بلا حماية وهويتها تبقى مجهولة بالسجل', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager' });
  game.submitMafiaPick(room, 'm', 'v1');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v2');

  const result = game.resolveNight(room);

  assert.strictEqual(result.outcome, 'killed');
  assert.strictEqual(room.players.get('v1').alive, false);
  assert.match(room.log[room.log.length - 1].text, /هويته تبقى مجهولة/);
});

test('المافيا لا تستطيع استهداف أحد العصابة', () => {
  const room = buildTestRoom({ m: 'mafia', z: 'zaeem', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  assert.throws(() => game.submitMafiaPick(room, 'm', 'z'), /العصابة/);
});

test('الوريثة تتحرك ليلاً مع المافيا وتشارك في تأكيد القتل', () => {
  const room = buildTestRoom({ m: 'mafia', h: 'heiress', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  assert.strictEqual(game.nightRoleFor(room, room.players.get('h')), 'kill');

  game.submitMafiaPick(room, 'm', 'v1');
  game.submitMafiaPick(room, 'h', 'v1');
  game.confirmKill(room, 'h');
  game.submitProtect(room, 'doc', 'v2');

  const result = game.resolveNight(room);
  assert.strictEqual(result.outcome, 'killed');
  assert.strictEqual(room.players.get('v1').alive, false);
});

test('الزعيم يتحرك ليلاً مع المافيا ويقتل مثلها تمامًا', () => {
  const room = buildTestRoom({ m: 'mafia', z: 'zaeem', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  assert.strictEqual(game.nightRoleFor(room, room.players.get('z')), 'kill');

  game.submitMafiaPick(room, 'm', 'v1');
  game.submitMafiaPick(room, 'z', 'v1');
  game.confirmKill(room, 'z');
  game.submitProtect(room, 'doc', 'v2');

  const result = game.resolveNight(room);
  assert.strictEqual(result.outcome, 'killed');
  assert.strictEqual(room.players.get('v1').alive, false);
});

test('مافيتان: التأكيد يرفض قبل التطابق ويقبل بعده', () => {
  const room = buildTestRoom({ m1: 'mafia', m2: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager', v4: 'villager', v5: 'villager', v6: 'villager', v7: 'villager' });
  game.submitMafiaPick(room, 'm1', 'v1');
  game.submitMafiaPick(room, 'm2', 'v2');
  assert.throws(() => game.confirmKill(room, 'm1'), /نفس الهدف/);

  game.submitMafiaPick(room, 'm2', 'v1');
  assert.doesNotThrow(() => game.confirmKill(room, 'm1'));
  assert.strictEqual(room.pendingKillId, 'v1');
});

test('مافيتان متعادلتان عند انتهاء الوقت: ضحية عشوائية من الاختيارين + سطر تعادل بالسجل', () => {
  const room = buildTestRoom({ m1: 'mafia', m2: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager', v4: 'villager', v5: 'villager', v6: 'villager', v7: 'villager' });
  game.submitMafiaPick(room, 'm1', 'v1');
  game.submitMafiaPick(room, 'm2', 'v2');

  const result = game.resolveNight(room);

  assert.strictEqual(result.outcome, 'killed');
  assert.ok(['v1', 'v2'].includes(room.lastKilledId));
  assert.ok(room.log.some((l) => l.text.includes('تعادل قرار العصابة')));
});

test('فحص الشيخ: الزعيم من العصابة (لا حصانة) والدفتر يتراكم ويرفض التكرار', () => {
  const room = buildTestRoom({ m: 'mafia', z: 'zaeem', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });

  const r1 = game.submitCheck(room, 'sh', 'z');
  assert.strictEqual(r1.isEvil, true);

  const r2 = game.submitCheck(room, 'sh', 'v1');
  assert.strictEqual(r2.isEvil, false);

  assert.throws(() => game.submitCheck(room, 'sh', 'z'), /سابقًا/);
  const notebook = room.sheikhNotebooks.get('sh');
  assert.strictEqual(notebook.size, 2);
});

test('المتحول المستهدف بلا حماية لا يموت — يتحول لعصابة وفحصه القديم يبقى بريئًا', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', shape: 'shapeshifter', v1: 'villager', v2: 'villager' });
  const before = game.submitCheck(room, 'sh', 'shape');
  assert.strictEqual(before.isEvil, false);

  game.submitMafiaPick(room, 'm', 'shape');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v1');
  const result = game.resolveNight(room);

  assert.strictEqual(result.outcome, 'shift');
  assert.strictEqual(result.shiftedId, 'shape');
  assert.strictEqual(room.players.get('shape').alive, true);
  assert.strictEqual(room.players.get('shape').roleId, 'shifted');
  assert.strictEqual(game.nightRoleFor(room, room.players.get('shape')), 'kill');
  assert.ok(game.aliveMafias(room).some((p) => p.id === 'shape'));
  assert.strictEqual(room.sheikhNotebooks.get('sh').get('shape'), false);
  assert.ok(room.log.some((l) => l.text.includes('تسلّل الشر')));
});

test('المتحول بعد تحوله يشارك المافيا في الاتفاق على هدف القتل', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', shape: 'shapeshifter', v1: 'villager', v2: 'villager' });
  game.submitMafiaPick(room, 'm', 'shape');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v1');
  game.resolveNight(room);

  game.beginNight(room);
  assert.strictEqual(game.nightRoleFor(room, room.players.get('shape')), 'kill');
  game.submitMafiaPick(room, 'm', 'v1');
  game.submitMafiaPick(room, 'shape', 'v2');
  assert.throws(() => game.confirmKill(room, 'shape'), /نفس الهدف/);

  game.submitMafiaPick(room, 'shape', 'v1');
  assert.doesNotThrow(() => game.confirmKill(room, 'shape'));
});

test('لعنة الوريثة: إعدامها بالتصويت يعطل الطبيب والشيخ ليلة واحدة فقط', () => {
  const room = buildTestRoom({ m: 'mafia', h: 'heiress', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  room.phase = 'vote';
  game.toggleVote(room, 'm', 'h');
  game.toggleVote(room, 'doc', 'h');
  game.toggleVote(room, 'sh', 'h');
  game.expel(room, 'h');
  assert.strictEqual(room.curseNextNight, true);

  game.beginNight(room);
  assert.strictEqual(room.curseNight, true);
  assert.strictEqual(game.nightRoleFor(room, room.players.get('doc')), 'curse');
  assert.strictEqual(game.nightRoleFor(room, room.players.get('sh')), 'curse');
  assert.throws(() => game.submitProtect(room, 'doc', 'v1'), /لعنة/);
  assert.throws(() => game.submitCheck(room, 'sh', 'v1'), /لعنة/);

  game.beginNight(room);
  assert.strictEqual(room.curseNight, false);
  assert.doesNotThrow(() => game.submitProtect(room, 'doc', 'v1'));
});

test('الحرامي يسرق صوتًا يسري باليوم التالي مباشرة (بدون تأخير دورة)، ثم يُصفَّر لليوم اللي بعده', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', th: 'thief', v1: 'villager', v2: 'villager' });
  game.submitSteal(room, 'th', 'v1');
  game.submitMafiaPick(room, 'm', 'v2');
  game.confirmKill(room, 'm');
  game.resolveNight(room);

  // يُفعَّل فورًا لليوم اللي يلي ليلة السرقة مباشرة — بدون أي beginNight إضافي بينهم.
  assert.strictEqual(room.stolenVoterId, 'v1');
  room.phase = 'vote';
  assert.throws(() => game.toggleVote(room, 'v1', 'm'), /سُرق صوتك/);
  assert.doesNotThrow(() => game.toggleVote(room, 'doc', 'm'));

  // الليلة التالية: البلوكة تُصفَّر (ما تمتد ليوم ثاني).
  game.beginNight(room);
  assert.strictEqual(room.stolenVoterId, null);
});

test('الحرامي يقدر يسرق مرة وحدة بس طول اللعبة', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', th: 'thief', v1: 'villager', v2: 'villager' });
  game.submitSteal(room, 'th', 'v1');
  game.submitMafiaPick(room, 'm', 'v2');
  game.confirmKill(room, 'm');
  game.resolveNight(room);
  assert.strictEqual(room.thiefUsed, true);

  game.beginNight(room);
  assert.strictEqual(game.nightRoleFor(room, room.players.get('th')), 'decoy');
  assert.throws(() => game.submitSteal(room, 'th', 'v2'), /مسبقًا/);
});

test('الحرامي يقدر يأجّل السرقة (عدم التفعيل) بدون ما تُسرق تلقائيًا بنهاية الليل', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', th: 'thief', v1: 'villager', v2: 'villager' });
  game.markNightReady(room, 'th');
  game.submitMafiaPick(room, 'm', 'v1');
  game.confirmKill(room, 'm');
  game.resolveNight(room);

  assert.strictEqual(room.thiefPickId, null);
  assert.strictEqual(room.thiefUsed, false);
  assert.strictEqual(room.stolenVoterId, null);

  game.beginNight(room);
  assert.strictEqual(game.nightRoleFor(room, room.players.get('th')), 'steal');
});

test('انتهاء الوقت بدون أي قرار من الحرامي (ولا حتى عدم التفعيل) يؤجّل القدرة كمان، لا يسرق تلقائيًا', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', th: 'thief', v1: 'villager', v2: 'villager' });
  // ما نادى submitSteal ولا markNightReady إطلاقًا — محاكاة انتهاء الوقت بدون أي تفاعل.
  game.submitMafiaPick(room, 'm', 'v1');
  game.confirmKill(room, 'm');
  game.resolveNight(room);

  assert.strictEqual(room.thiefPickId, null);
  assert.strictEqual(room.thiefUsed, false);
  assert.strictEqual(room.stolenVoterId, null);
});

test('صوت العمدة بوزن ٢ خفي يحسم المتهم، وmayorInfluenced يكشف ترجيحه', () => {
  const room = buildTestRoom({ m: 'mafia', mayor: 'mayor', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  room.phase = 'vote';
  game.toggleVote(room, 'mayor', 'v1');
  game.toggleVote(room, 'doc', 'v2');

  const vc = game.voteCounts(room);
  assert.strictEqual(vc.accused, 'v1');
  assert.strictEqual(vc.raw.get('v1'), 1);
  assert.strictEqual(vc.counts.get('v1'), 2);
  assert.strictEqual(game.mayorInfluenced(room, 'v1'), true);

  game.expel(room, 'v1');
  assert.ok(room.log[room.log.length - 1].text.includes('بنفوذ صوت العمدة المضاعف'));
});

test('تعادل الأصوات الموزون = لا متهم', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager' });
  room.phase = 'vote';
  game.toggleVote(room, 'm', 'v1');
  game.toggleVote(room, 'doc', 'v2');

  const vc = game.voteCounts(room);
  assert.strictEqual(vc.accused, null);
  assert.strictEqual(vc.tied, true);
});

test('التصويت تبديل: نفس الهدف مرتين يلغي الصوت', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager', v3: 'villager' });
  room.phase = 'vote';
  game.toggleVote(room, 'doc', 'v1');
  assert.strictEqual(room.votes.get('doc'), 'v1');
  game.toggleVote(room, 'doc', 'v1');
  assert.strictEqual(room.votes.has('doc'), false);
});

test('winCheck: فوز المدينة بانقراض العصابة وفوز العصابة بالتعادل العددي', () => {
  const town = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager' });
  town.players.get('m').alive = false;
  assert.strictEqual(game.winCheck(town).w, 'town');

  const maf = buildTestRoom({ m: 'mafia', z: 'zaeem', doc: 'doctor', sh: 'sheikh' });
  maf.players.get('sh').alive = false;
  assert.strictEqual(game.winCheck(maf).w, 'mafia');

  const ongoing = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  assert.strictEqual(game.winCheck(ongoing), null);
});

test('المتحول بعد تحوله يُحتسب ضمن العصابة بشرط الفوز', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', shape: 'shapeshifter' });
  game.submitMafiaPick(room, 'm', 'shape');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'sh');
  game.resolveNight(room);

  const win = game.winCheck(room);
  assert.strictEqual(win.w, 'mafia');
});

test('نهاية اللعبة تعرض بطاقات كل أعضاء الفريق الفائز بأسمائهم، أحياءً كانوا أم أمواتًا', () => {
  const room = buildTestRoom({ m: 'mafia', z: 'zaeem', doc: 'doctor', sh: 'sheikh' });
  room.players.get('sh').alive = false;
  room.players.get('z').alive = false;
  const result = game.finishGame(room, 'mafia', 'سبب');

  const names = result.winnerCards.map((c) => c.name).sort();
  assert.deepStrictEqual(names, ['m', 'z']);
  assert.strictEqual(result.winnerCards.find((c) => c.name === 'm').file, '01-mafia.png');
  assert.strictEqual(result.winnerCards.find((c) => c.name === 'z').file, '02-elcapo.png');
});

test('الإقصاء يعلن الفريق فقط (خير/شر) لا الدور الدقيق، ويمكن تعطيله بالكامل', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  room.phase = 'vote';
  room.revealTeamOnExpel = true;
  game.expel(room, 'doc');
  const last = room.log[room.log.length - 1].text;
  assert.ok(last.includes('كان من الخير'));
  assert.ok(!last.includes('الطبيب'));

  room.revealTeamOnExpel = false;
  game.expel(room, 'v1');
  const last2 = room.log[room.log.length - 1].text;
  assert.ok(!last2.includes('كان من'));
});

test('الإقصاء يتجاهل اللاعب الذي خرج مسبقاً حتى لا يتكرر مسار الإقصاء', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  room.phase = 'vote';
  assert.ok(game.expel(room, 'doc'));
  assert.strictEqual(game.expel(room, 'doc'), null);
});

test('الأميرة لا تُقصى بالتصويت وتكشف بطاقتها للجميع', () => {
  const room = buildTestRoom({ m: 'mafia', p: 'princess', doc: 'doctor', sh: 'sheikh', v1: 'villager', v2: 'villager' });
  room.phase = 'vote';
  const result = game.expel(room, 'p');

  assert.strictEqual(result.spared, true);
  assert.strictEqual(result.card, '08-princess.png');
  assert.strictEqual(room.players.get('p').alive, true);
  assert.ok(room.log[room.log.length - 1].text.includes('كُشفت'));
});

test('المصارع ينجو من هجوم ليلي واحد فقط عند تفعيل ميزة النجاة', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', f: 'fighter', v1: 'villager', v2: 'villager' });
  assert.strictEqual(game.nightRoleFor(room, room.players.get('f')), 'fighter');
  game.activateFighterGuard(room, 'f');
  game.submitMafiaPick(room, 'm', 'f');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v1');
  const result = game.resolveNight(room);

  assert.strictEqual(result.outcome, 'saved');
  assert.strictEqual(room.players.get('f').alive, true);
  assert.strictEqual(room.fighterUsed, true);
  assert.ok(!room.log[room.log.length - 1].text.includes('الطبيب'));

  game.beginNight(room);
  game.submitMafiaPick(room, 'm', 'v1');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v2');
  assert.strictEqual(game.resolveNight(room).outcome, 'killed');
  assert.strictEqual(room.players.get('v1').alive, false);

  game.beginNight(room);
  game.submitMafiaPick(room, 'm', 'f');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'doc');
  const result2 = game.resolveNight(room);
  assert.strictEqual(result2.outcome, 'killed');
  assert.strictEqual(room.players.get('f').alive, false);
});

test('المصارع لا ينجو إذا لم يفعّل الميزة، والتفعيل يستهلكها حتى لو لم يُقتل', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', f: 'fighter', v1: 'villager', v2: 'villager' });
  game.submitMafiaPick(room, 'm', 'f');
  game.confirmKill(room, 'm');
  game.submitProtect(room, 'doc', 'v1');

  const result = game.resolveNight(room);
  assert.strictEqual(result.outcome, 'killed');
  assert.strictEqual(room.players.get('f').alive, false);
  assert.strictEqual(room.fighterUsed, false);

  const room2 = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', f: 'fighter', v1: 'villager', v2: 'villager' });
  game.activateFighterGuard(room2, 'f');
  game.submitMafiaPick(room2, 'm', 'v1');
  game.confirmKill(room2, 'm');
  game.submitProtect(room2, 'doc', 'v1');
  assert.strictEqual(game.resolveNight(room2).outcome, 'saved');
  assert.strictEqual(room2.fighterUsed, true);
  assert.strictEqual(room2.players.get('f').alive, true);

  game.beginNight(room2);
  assert.strictEqual(game.nightRoleFor(room2, room2.players.get('f')), 'decoy');
  game.submitMafiaPick(room2, 'm', 'f');
  game.confirmKill(room2, 'm');
  game.submitProtect(room2, 'doc', 'doc');
  assert.strictEqual(game.resolveNight(room2).outcome, 'killed');
  assert.strictEqual(room2.players.get('f').alive, false);
});

test('المهرج: يخسر لو نجا حيًا، ويفوز منفردًا كبطاقة إضافية لو أُقصي حتى مع فوز العصابة', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', j: 'joker', v1: 'villager' });
  const aliveResult = game.finishGame(room, 'town', 'سبب');
  assert.ok(!aliveResult.winnerCards.some((c) => c.name === 'j'));
  assert.strictEqual(aliveResult.roles.find((r) => r.name === 'j').won, false);
  assert.strictEqual(aliveResult.roles.find((r) => r.name === 'j').alignment, 'neutral');

  const room2 = buildTestRoom({ m: 'mafia', z: 'zaeem', j: 'joker', doc: 'doctor' });
  room2.phase = 'vote';
  game.expel(room2, 'j');
  assert.strictEqual(room2.jokerEliminated, true);
  assert.match(room2.players.get('j').deathReason, /ما يريده المهرج/);
  const mafiaResult = game.finishGame(room2, 'mafia', 'سبب');
  assert.ok(mafiaResult.winnerCards.some((c) => c.name === 'j'));
  assert.strictEqual(mafiaResult.jokerEliminated, true);
  assert.strictEqual(mafiaResult.roles.find((r) => r.name === 'j').won, true);
});

test('فحص الشيخ للمهرج عشوائي (خير أو شر) بدل نتيجة ثابتة', () => {
  const room = buildTestRoom({ m: 'mafia', doc: 'doctor', sh: 'sheikh', j: 'joker', v1: 'villager' });
  const result = game.submitCheck(room, 'sh', 'j');
  assert.strictEqual(typeof result.isEvil, 'boolean');
  assert.strictEqual(room.sheikhNotebooks.get('sh').get('j'), result.isEvil);
});
