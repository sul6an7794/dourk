const { ROLES, isEvil, roleAlignment, rand, assignRoles, assignFlavors, cardFor } = require('./roles');
const { MIN_PLAYERS, alivePlayers } = require('./rooms');

const REVEAL_MS = Number(process.env.MAFIA_REVEAL_MS) || 30000;
const NIGHT_MS = Number(process.env.MAFIA_NIGHT_MS) || 25000;
const DEATH_REVEAL_MS = Number(process.env.MAFIA_DEATH_REVEAL_MS) || 5000;
const DAY_MS = Number(process.env.MAFIA_DAY_MS) || 45000;
const VOTE_MS = Number(process.env.MAFIA_VOTE_MS) || 40000;
const DEFENSE_MS = Number(process.env.MAFIA_DEFENSE_MS) || 60000;

function addLog(room, text, color) {
  room.log.push({ r: room.round, text, color });
}

function startGame(room) {
  if (room.phase !== 'lobby') throw new Error('الجولة بدأت بالفعل');
  if (room.players.size < MIN_PLAYERS) throw new Error(`تحتاج ${MIN_PLAYERS} لاعبين على الأقل`);
  const ids = [...room.players.keys()];
  const assignment = assignRoles(ids);
  for (const [playerId, roleId] of assignment) {
    room.players.get(playerId).roleId = roleId;
  }
  room.flavors = assignFlavors(ids, assignment);
  room.phase = 'reveal';
  room.round = 1;
}

function playerCard(room, player) {
  return cardFor(player.roleId, room.flavors.get(player.id));
}

function presentCardFiles(room) {
  return [...room.players.values()].map((p) => playerCard(room, p));
}

function isMafiaKiller(roleId) {
  return roleId === 'mafia' || roleId === 'heiress' || roleId === 'shifted';
}

function aliveMafias(room) {
  return alivePlayers(room).filter((p) => isMafiaKiller(p.roleId));
}

function mafiaTargets(room) {
  return alivePlayers(room).filter((p) => !isEvil(p.roleId) && p.id !== room.mafiaLastTargetId);
}

function aliveByRole(room, roleId) {
  return alivePlayers(room).find((p) => p.roleId === roleId) || null;
}

function doctorTargets(room) {
  const targets = alivePlayers(room);
  const freshTargets = targets.filter((p) => p.id !== room.doctorLastPickId);
  return freshTargets.length ? freshTargets : targets;
}

function beginNight(room) {
  room.phase = 'night';
  room.curseNight = room.curseNextNight;
  room.curseNextNight = false;
  // يُمسح فورًا أول كل ليلة — البلوكة يوم وحد بس (اليوم اللي يلي ليلة السرقة)، ما تمتد ليوم ثاني.
  room.stolenVoterId = null;
  room.mafiaPicks.clear();
  room.killConfirmed = false;
  room.pendingKillId = null;
  room.doctorPickId = null;
  room.thiefPickId = null;
  room.nightDone.clear();
  room.lastKilledId = null;
  room.savedId = null;
  room.shiftTwist = false;
  room.fighterGuardActive = false;
  room.votes.clear();
  room.pardonRequests.clear();
  room.executeRequests.clear();
  room.accusedId = null;
  room.expelStampId = null;
  room.expelInProgress = false;
}

function nightRoleFor(room, player) {
  const role = ROLES[player.roleId];
  if (room.curseNight && (player.roleId === 'doctor' || player.roleId === 'sheikh')) return 'curse';
  if (player.roleId === 'fighter' && !room.fighterUsed) return 'fighter';
  // الحرامي يسرق مرة وحدة طول اللعبة — بعدها يمر بليلة "ديكوي" عادية بدل ما يتكرر عليه
  // اختيار السرقة كل ليلة (كان السبب وراء تكرار السرقة أكثر من مرة).
  if (player.roleId === 'thief' && room.thiefUsed) return 'decoy';
  return role.night;
}

function submitMafiaPick(room, playerId, targetId) {
  const player = room.players.get(playerId);
  if (!player || !player.alive || !isMafiaKiller(player.roleId)) throw new Error('لست من العصابة');
  const target = room.players.get(targetId);
  if (!target || !target.alive) throw new Error('هدف غير صالح');
  if (isEvil(target.roleId)) throw new Error('لا يمكنك استهداف أحد العصابة');
  if (room.mafiaLastTargetId && targetId === room.mafiaLastTargetId) throw new Error('لا يمكن استهداف نفس اللاعب في ليلتين متتاليتين');
  room.mafiaPicks.set(playerId, targetId);
}

function mafiaPicksMatch(room) {
  const mafias = aliveMafias(room);
  const picks = mafias.map((m) => room.mafiaPicks.get(m.id)).filter(Boolean);
  if (picks.length === 0) return { ready: false, target: null, tied: false };
  if (mafias.length === 1) return { ready: true, target: picks[0], tied: false };
  if (picks.length < mafias.length) return { ready: false, target: picks[0], tied: false };
  const allSame = picks.every((t) => t === picks[0]);
  return { ready: allSame, target: allSame ? picks[0] : null, tied: !allSame, picks };
}

function confirmKill(room, playerId) {
  const player = room.players.get(playerId);
  if (!player || !player.alive || !isMafiaKiller(player.roleId)) throw new Error('لست من العصابة');
  const m = mafiaPicksMatch(room);
  if (!m.ready) throw new Error('اتفقوا على نفس الهدف أولًا');
  room.pendingKillId = m.target;
  room.killConfirmed = true;
  for (const maf of aliveMafias(room)) room.nightDone.add(maf.id);
}

function submitProtect(room, playerId, targetId) {
  const player = room.players.get(playerId);
  if (!player || !player.alive || player.roleId !== 'doctor') throw new Error('لست الطبيب');
  if (room.curseNight) throw new Error('قواك معطلة الليلة بلعنة الوريثة');
  if (room.nightDone.has(playerId)) throw new Error('تم اعتماد اختيارك لهذه الليلة');
  const target = room.players.get(targetId);
  if (!target || !target.alive) throw new Error('هدف غير صالح');
  if (room.doctorLastPickId && targetId === room.doctorLastPickId) throw new Error('لا يمكنك حماية نفس اللاعب في ليلتين متتاليتين');
  room.doctorPickId = targetId;
  room.nightDone.add(playerId);
}

function submitCheck(room, playerId, targetId) {
  const player = room.players.get(playerId);
  if (!player || !player.alive || player.roleId !== 'sheikh') throw new Error('لست الشيخ');
  if (room.curseNight) throw new Error('قواك معطلة الليلة بلعنة الوريثة');
  const target = room.players.get(targetId);
  if (!target || !target.alive || targetId === playerId) throw new Error('هدف غير صالح');
  const notebook = room.sheikhNotebooks.get(playerId) || new Map();
  if (notebook.has(targetId)) throw new Error('تحققت منه سابقًا');
  const evil = target.roleId === 'joker' ? rand([true, false]) : isEvil(target.roleId);
  notebook.set(targetId, evil);
  room.sheikhNotebooks.set(playerId, notebook);
  room.sheikhCheckId = targetId;
  return { targetId, isEvil: evil };
}

function submitSteal(room, playerId, targetId) {
  const player = room.players.get(playerId);
  if (!player || !player.alive || player.roleId !== 'thief') throw new Error('لست الحرامي');
  if (room.thiefUsed) throw new Error('استخدمت قدرة السرقة مسبقًا — مرة وحدة بس طول اللعبة');
  const target = room.players.get(targetId);
  if (!target || !target.alive || targetId === playerId) throw new Error('هدف غير صالح');
  room.thiefPickId = targetId;
  room.nightDone.add(playerId);
}

function activateFighterGuard(room, playerId) {
  const player = room.players.get(playerId);
  if (!player || !player.alive || player.roleId !== 'fighter') throw new Error('لست المصارع');
  if (room.fighterUsed) throw new Error('ميزة النجاة استُخدمت مسبقًا');
  room.fighterUsed = true;
  room.fighterGuardActive = true;
  room.nightDone.add(playerId);
}

function markNightReady(room, playerId) {
  const player = room.players.get(playerId);
  if (!player || !player.alive) return;
  room.nightDone.add(playerId);
}

function allNightDone(room) {
  return alivePlayers(room).every((p) => room.nightDone.has(p.id));
}

function autoCompleteNight(room) {
  const mafias = aliveMafias(room);
  if (!room.killConfirmed && mafias.length > 0) {
    const m = mafiaPicksMatch(room);
    if (m.ready) {
      room.pendingKillId = m.target;
    } else if (m.tied) {
      const picks = m.picks.filter((id) => id !== room.mafiaLastTargetId);
      room.pendingKillId = picks.length ? rand(picks) : null;
      addLog(room, 'تعادل قرار العصابة الليلة — تقرر القتل عشوائيًا بين المتعادلين.', '#FFB15E');
    } else {
      const candidates = mafiaTargets(room);
      room.pendingKillId = candidates.length ? rand(candidates).id : null;
    }
  }
  const doctor = aliveByRole(room, 'doctor');
  if (doctor && !room.curseNight && !room.doctorPickId) {
    room.doctorPickId = rand(doctorTargets(room)).id;
  }
  const thief = aliveByRole(room, 'thief');
  if (thief && !room.thiefPickId && !room.thiefUsed) {
    const candidates = alivePlayers(room).filter((p) => p.id !== thief.id);
    if (candidates.length) room.thiefPickId = rand(candidates).id;
  }
}

function resolveNight(room) {
  autoCompleteNight(room);

  if (room.doctorPickId) room.doctorLastPickId = room.doctorPickId;
  // يُفعَّل فورًا لليوم الجاي مباشرة (بدل انتظار الليلة التالية) — كان فيه تأخير دورة كاملة
  // يخلي الضحية يفقد التصويت باليوم الغلط (المتأخر عن ليلة السرقة الفعلية).
  room.stolenVoterId = room.thiefPickId || null;
  if (room.thiefPickId) room.thiefUsed = true;

  const victimId = room.pendingKillId;
  room.mafiaLastTargetId = victimId || null;
  const victim = victimId ? room.players.get(victimId) : null;
  const savedByDoctor = victim && room.doctorPickId === victimId;
  const shifting = victim && !savedByDoctor && victim.roleId === 'shapeshifter';
  const savedByFighter = victim && !savedByDoctor && !shifting && victim.roleId === 'fighter' && room.fighterGuardActive;
  const saved = savedByDoctor || savedByFighter;

  if (shifting) {
    victim.roleId = 'shifted';
    room.shiftTwist = true;
    addLog(room, 'تسلّل الشر إلى قلب أحدهم الليلة… وانضمّ خفية إلى العصابة.', '#C89A45');
    return { outcome: 'shift', shiftedId: victim.id };
  }
  if (victim && saved) {
    room.savedId = victimId;
    addLog(room, `نجا ${victim.name} — نجا من محاولة اغتيال هذه الليلة`, '#7FE7FF');
    return { outcome: 'saved', savedId: victimId };
  }
  if (victim) {
    victim.alive = false;
    victim.deathTitle = 'قُتلت';
    victim.deathReason = 'اغتالتك العصابة في الليل ولم يصل الطبيب في الوقت المناسب.';
    room.lastKilledId = victimId;
    if (victim.roleId === 'joker') room.jokerEliminated = true;
    addLog(room, `قُتل ${victim.name} — هويته تبقى مجهولة`, '#FF6B6B');
    return { outcome: 'killed', victimId };
  }
  return { outcome: 'quiet' };
}

function dayEvent(room) {
  const killed = room.lastKilledId ? room.players.get(room.lastKilledId) : null;
  if (killed) {
    return {
      title: `قُتل ${killed.name} هذه الليلة`,
      desc: 'هويته تبقى مجهولة. لا يحق له الكلام بعد الآن.',
      kind: 'killed',
    };
  }
  if (room.shiftTwist) {
    return {
      title: 'ظلامٌ سرى الليلة الماضية',
      desc: 'شخصٌ ما انضمّ خفية إلى العصابة الليلة.',
      kind: 'twist',
    };
  }
  if (room.savedId) {
    const saved = room.players.get(room.savedId);
    return {
      title: `نجا ${saved ? saved.name : ''} هذه الليلة`,
      desc: 'لم يمت أحد هذه الليلة. سبب النجاة لا يُكشف.',
      kind: 'saved',
    };
  }
  return {
    title: 'ليلة هادئة',
    desc: 'الطبيب أنقذ المدينة — لم يمت أحد هذه الليلة.',
    kind: 'quiet',
  };
}

function voteWeight(room, voterId) {
  const voter = room.players.get(voterId);
  return voter && voter.roleId === 'mayor' ? 2 : 1;
}

function toggleVote(room, voterId, targetId) {
  const voter = room.players.get(voterId);
  if (!voter || !voter.alive) throw new Error('لا يمكنك التصويت');
  if (voterId === room.stolenVoterId) throw new Error('سُرق صوتك الليلة الماضية');
  if (targetId !== null) {
    const target = room.players.get(targetId);
    if (!target || !target.alive) throw new Error('هدف غير صالح');
    if (targetId === voterId) throw new Error('لا يمكنك التصويت على نفسك');
  }
  if (targetId === null || room.votes.get(voterId) === targetId) room.votes.delete(voterId);
  else room.votes.set(voterId, targetId);
}

function voteCounts(room) {
  const counts = new Map();
  const raw = new Map();
  for (const p of alivePlayers(room)) { counts.set(p.id, 0); raw.set(p.id, 0); }
  for (const [voterId, targetId] of room.votes) {
    counts.set(targetId, (counts.get(targetId) || 0) + voteWeight(room, voterId));
    raw.set(targetId, (raw.get(targetId) || 0) + 1);
  }
  let max = 0;
  for (const v of counts.values()) if (v > max) max = v;
  const leaders = [...counts.entries()].filter(([, v]) => v === max && max > 0).map(([id]) => id);
  const accused = leaders.length === 1 ? leaders[0] : null;
  return { counts, raw, max, leaders, accused, tied: max > 0 && leaders.length > 1 };
}

function mayorInfluenced(room, accusedId) {
  const mayor = alivePlayers(room).find((p) => p.roleId === 'mayor');
  if (!mayor) return false;
  if (room.votes.get(mayor.id) !== accusedId) return false;
  const raw = new Map();
  for (const p of alivePlayers(room)) raw.set(p.id, 0);
  for (const [, targetId] of room.votes) raw.set(targetId, (raw.get(targetId) || 0) + 1);
  let max = 0;
  for (const v of raw.values()) if (v > max) max = v;
  const leaders = [...raw.entries()].filter(([, v]) => v === max && max > 0).map(([id]) => id);
  const rawAccused = leaders.length === 1 ? leaders[0] : null;
  return rawAccused !== accusedId;
}

function expel(room, accusedId) {
  const accused = room.players.get(accusedId);
  if (!accused || !accused.alive) return null;
  const role = ROLES[accused.roleId];
  const byMayor = mayorInfluenced(room, accusedId);
  if (accused.roleId === 'princess') {
    addLog(room, `كُشفت ${accused.name} بالتصويت — إنها الأميرة، محبوبة الجميع. لم تُقصَ وبقيت في اللعبة${byMayor ? ' (بنفوذ صوت العمدة المضاعف)' : ''}`, '#7FE7FF');
    return { accusedId, wasEvil: false, roleLabel: role.label, spared: true, card: playerCard(room, accused) };
  }
  accused.alive = false;
  accused.deathTitle = 'أُقصيت';
  if (accused.roleId === 'joker') {
    accused.deathReason = 'أقصتك المدينة بالتصويت — وهذا بالضبط ما يريده المهرج.';
  } else {
    accused.deathReason = isEvil(accused.roleId)
      ? 'كشفتك المدينة وأقصتك بالتصويت — وكنت أنت من العصابة.'
      : 'أقصتك المدينة بالتصويت… وأنت بريء. هكذا تنتصر العصابة.';
  }
  const alignment = roleAlignment(accused.roleId);
  const teamLabel = alignment === 'neutral' ? 'المحايد' : (alignment === 'evil' ? 'الشر' : 'الخير');
  const identityPart = room.revealTeamOnExpel ? ` — كان من ${teamLabel}` : '';
  addLog(room, `أُقصي ${accused.name} بالتصويت${identityPart}${byMayor ? ' (بنفوذ صوت العمدة المضاعف)' : ''}`, '#FFB15E');
  if (accused.roleId === 'heiress') room.curseNextNight = true;
  if (accused.roleId === 'joker') room.jokerEliminated = true;
  return { accusedId, wasEvil: isEvil(accused.roleId), roleLabel: role.label };
}

function logPardon(room, tied) {
  addLog(room, tied ? 'تعادلت الأصوات — لا إقصاء الليلة' : 'انتهى النهار بلا إقصاء', '#A8AFB8');
}

function winCheck(room) {
  const alive = alivePlayers(room);
  const evil = alive.filter((p) => isEvil(p.roleId));
  if (evil.length === 0) return { w: 'town', why: 'تم القضاء على العصابة. المدينة نامت مطمئنة أخيرًا.' };
  if (evil.length >= alive.length - evil.length) return { w: 'mafia', why: 'تساوى عدد أفراد العصابة مع عدد المواطنين — لم يعد بالإمكان إيقافهم.' };
  return null;
}

function playerWon(room, winner, player) {
  if (player.roleId === 'joker') return !!room.jokerEliminated;
  return winner === 'mafia' ? isEvil(player.roleId) : !isEvil(player.roleId);
}

function finishGame(room, winner, why) {
  room.phase = 'gameover';
  room.winner = winner;
  room.winReason = why;
  let winners = [...room.players.values()].filter((p) => (winner === 'mafia' ? isEvil(p.roleId) : !isEvil(p.roleId)));

  // المهرج يفوز منفردًا فقط لو أُقصي أو قُتل خلال اللعبة، ويخسر لو نجا حيًا حتى النهاية رغم انتمائه للخير
  winners = winners.filter((p) => p.roleId !== 'joker' || room.jokerEliminated);
  if (room.jokerEliminated) {
    const joker = [...room.players.values()].find((p) => p.roleId === 'joker');
    if (joker && !winners.includes(joker)) winners.push(joker);
  }

  room.gameOverResult = {
    winner,
    winReason: why,
    round: room.round,
    jokerEliminated: !!room.jokerEliminated,
    winnerCards: winners.map((p) => ({ playerId: p.id, name: p.name, file: playerCard(room, p) })),
    roles: [...room.players.values()].map((p) => ({
      playerId: p.id,
      name: p.name,
      alive: p.alive,
      roleId: p.roleId,
      label: ROLES[p.roleId].label,
      team: ROLES[p.roleId].team,
      alignment: roleAlignment(p.roleId),
      card: playerCard(room, p),
      won: playerWon(room, winner, p),
    })),
  };
  return room.gameOverResult;
}

module.exports = {
  REVEAL_MS, NIGHT_MS, DEATH_REVEAL_MS, DAY_MS, VOTE_MS, DEFENSE_MS,
  addLog,
  startGame,
  playerCard,
  presentCardFiles,
  aliveMafias,
  isMafiaKiller,
  beginNight,
  nightRoleFor,
  submitMafiaPick,
  mafiaPicksMatch,
  confirmKill,
  submitProtect,
  submitCheck,
  submitSteal,
  activateFighterGuard,
  markNightReady,
  allNightDone,
  resolveNight,
  dayEvent,
  toggleVote,
  voteCounts,
  mayorInfluenced,
  expel,
  logPardon,
  winCheck,
  playerWon,
  finishGame,
};
