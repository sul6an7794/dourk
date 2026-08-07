const ROLES = {
  mafia: { id: 'mafia', label: 'المافيا', card: '01-mafia.png', team: 'شر', night: 'kill' },
  doctor: { id: 'doctor', label: 'الطبيب', card: '04-doctor.png', team: 'خير', night: 'protect' },
  sheikh: { id: 'sheikh', label: 'الشيخ', card: '05-sheikh.png', team: 'خير', night: 'check' },
  villager: { id: 'villager', label: 'القروي', card: '06-villager.png', team: 'خير', night: 'decoy' },
  princess: { id: 'princess', label: 'الأميرة', card: '08-princess.png', team: 'خير', night: 'decoy' },
  heiress: { id: 'heiress', label: 'الوريثة', card: '03-heiress.png', team: 'شر', night: 'kill' },
  zaeem: { id: 'zaeem', label: 'الزعيم', card: '02-elcapo.png', team: 'شر', night: 'decoy' },
  thief: { id: 'thief', label: 'الحرامي', card: '11-thief.png', team: 'خير', night: 'steal' },
  mayor: { id: 'mayor', label: 'العمدة', card: '07-mayor.png', team: 'خير', night: 'decoy' },
  shapeshifter: { id: 'shapeshifter', label: 'المتحول', card: '09-shapeshifter.png', team: 'خير', night: 'decoy' },
  shifted: { id: 'shifted', label: 'المتحول', card: '13-shifted.png', team: 'شر', night: 'kill' },
  fighter: { id: 'fighter', label: 'المصارع', card: '12-fighter.png', team: 'خير', night: 'decoy' },
  joker: { id: 'joker', label: 'المهرج', card: '10-joker.png', team: 'خير', alignment: 'neutral', night: 'decoy' },
};

const FLAVOR_CARDS = ['06-villager.png'];
const BONUS_POOL = ['heiress', 'zaeem', 'thief', 'mayor', 'shapeshifter', 'fighter', 'princess', 'joker'];
const EARLY_UNIQUE_POOL = ['thief', 'mayor', 'shapeshifter', 'fighter', 'princess', 'joker'];
const LATE_EVIL_POOL = ['heiress', 'zaeem'];
const REPEATABLE_POOL = ['villager'];

const MIN_PLAYERS = 6;
const MAX_PLAYERS = 15;

function isEvil(roleId) {
  return roleId === 'mafia' || roleId === 'heiress' || roleId === 'zaeem' || roleId === 'shifted';
}

function roleAlignment(roleId) {
  const role = ROLES[roleId];
  if (role && role.alignment) return role.alignment;
  return isEvil(roleId) ? 'evil' : 'good';
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(input) {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleWith(input, randomFn) {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function evilCountFor(playerCount) {
  if (playerCount >= 10) return 3;
  if (playerCount >= 7) return 2;
  return 1;
}

function buildRoleList(playerCount, randomFn = Math.random) {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`عدد اللاعبين يجب أن يكون بين ${MIN_PLAYERS} و${MAX_PLAYERS}`);
  }
  const evilCount = evilCountFor(playerCount);
  const evilExtras = shuffleWith(LATE_EVIL_POOL, randomFn).slice(0, evilCount - 1);
  const evilRoles = ['mafia', ...evilExtras];
  while (evilRoles.length < evilCount) evilRoles.push('mafia');
  const roles = [...evilRoles, 'doctor', 'sheikh', 'villager'];
  const uniquePool = shuffleWith(EARLY_UNIQUE_POOL, randomFn);
  for (const roleId of uniquePool) {
    if (roles.length >= playerCount) break;
    roles.push(roleId);
  }
  let repeatIndex = 0;
  while (roles.length < playerCount) {
    roles.push(REPEATABLE_POOL[repeatIndex % REPEATABLE_POOL.length]);
    repeatIndex++;
  }
  return roles;
}

function assignRoles(playerIds, randomFn = Math.random) {
  const roleIds = shuffleWith(buildRoleList(playerIds.length, randomFn), randomFn);
  const assignment = new Map();
  playerIds.forEach((playerId, i) => assignment.set(playerId, roleIds[i]));
  return assignment;
}

function assignFlavors(playerIds, assignment) {
  const pool = shuffle(FLAVOR_CARDS);
  const flavors = new Map();
  let i = 0;
  for (const playerId of playerIds) {
    if (assignment.get(playerId) === 'villager') {
      flavors.set(playerId, pool[i % pool.length]);
      i++;
    }
  }
  return flavors;
}

function cardFor(roleId, flavorCard) {
  if (roleId === 'villager' && FLAVOR_CARDS.includes(flavorCard)) return flavorCard;
  return ROLES[roleId].card;
}

module.exports = {
  ROLES,
  FLAVOR_CARDS,
  BONUS_POOL,
  EARLY_UNIQUE_POOL,
  LATE_EVIL_POOL,
  REPEATABLE_POOL,
  MIN_PLAYERS,
  MAX_PLAYERS,
  isEvil,
  roleAlignment,
  rand,
  shuffle,
  evilCountFor,
  buildRoleList,
  assignRoles,
  assignFlavors,
  cardFor,
};
