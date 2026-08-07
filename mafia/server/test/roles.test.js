const test = require('node:test');
const assert = require('node:assert');
const { buildRoleList, assignRoles, assignFlavors, cardFor, isEvil, roleAlignment, FLAVOR_CARDS, evilCountFor } = require('../src/roles');

function countBy(list) {
  const counts = {};
  for (const roleId of list) counts[roleId] = (counts[roleId] || 0) + 1;
  return counts;
}

test('عدد الأدوار يطابق عدد اللاعبين دائمًا (٦ إلى ١٥)', () => {
  for (let n = 6; n <= 15; n++) {
    assert.strictEqual(buildRoleList(n).length, n);
  }
});

test('الإلزامي دائمًا موجود: طبيب وشيخ واحد لكل منها', () => {
  for (let n = 6; n <= 10; n++) {
    const counts = countBy(buildRoleList(n));
    assert.strictEqual(counts.doctor, 1);
    assert.strictEqual(counts.sheikh, 1);
  }
});

test('عدد كروت الشر (مافيا/وريثة/زعيم) يتدرج حسب عدد اللاعبين: ٦=١، ٧-٩=٢، ١٠+=٣', () => {
  assert.strictEqual(evilCountFor(6), 1);
  assert.strictEqual(evilCountFor(7), 2);
  assert.strictEqual(evilCountFor(8), 2);
  assert.strictEqual(evilCountFor(9), 2);
  assert.strictEqual(evilCountFor(10), 3);
  assert.strictEqual(evilCountFor(15), 3);

  for (let n = 6; n <= 15; n++) {
    const counts = countBy(buildRoleList(n));
    const evilTotal = Object.entries(counts).reduce(
      (sum, [roleId, count]) => sum + (isEvil(roleId) ? count : 0),
      0,
    );
    assert.strictEqual(evilTotal, evilCountFor(n));
    assert.strictEqual(counts.mafia, 1, 'المافيا الأساسية دايمًا كرت واحد، والباقي وريثة/زعيم');
  }
});

test('من ٧ إلى ٩ لاعبين: مافيا + وريثة أو زعيم (وحدة بالضبط، عشوائيًا) لا الاثنين معًا', () => {
  for (let n = 7; n <= 9; n++) {
    for (let trial = 0; trial < 30; trial++) {
      const counts = countBy(buildRoleList(n));
      assert.strictEqual(counts.mafia, 1);
      const lateEvilTotal = (counts.heiress || 0) + (counts.zaeem || 0);
      assert.strictEqual(lateEvilTotal, 1, 'لازم وريثة أو زعيم، وحدة بالضبط');
    }
  }
});

test('١٠ لاعبين وأكثر: مافيا ووريثة وزعيم الثلاثة معًا', () => {
  for (let n = 10; n <= 15; n++) {
    const counts = countBy(buildRoleList(n));
    assert.strictEqual(counts.mafia, 1);
    assert.strictEqual(counts.heiress, 1);
    assert.strictEqual(counts.zaeem, 1);
  }
});

test('الأدوار الاختيارية نسخة واحدة كحد أقصى ولا وجود لأدوار غير معرفة', () => {
  const optional = ['heiress', 'zaeem', 'thief', 'mayor', 'shapeshifter', 'fighter', 'princess', 'joker'];
  for (let trial = 0; trial < 50; trial++) {
    const counts = countBy(buildRoleList(15));
    for (const r of optional) assert.ok((counts[r] || 0) <= 1, `${r} ظهر أكثر من مرة`);
    for (const r of Object.keys(counts)) {
      assert.ok(['mafia', 'doctor', 'sheikh', 'villager', ...optional].includes(r));
    }
  }
});

test('لا يتكرر أي دور قبل استهلاك البطاقات، وكروت الشر (مافيا/وريثة/زعيم) نسخة واحدة لكل منها دائمًا', () => {
  for (let n = 6; n <= 15; n++) {
    const counts = countBy(buildRoleList(n, () => 0.42));
    for (const [roleId, count] of Object.entries(counts)) {
      if (roleId === 'villager') assert.ok(count >= 1);
      else assert.strictEqual(count, 1);
    }
  }
});

test('buildRoleList يرفض الأعداد خارج ٦-١٥', () => {
  assert.throws(() => buildRoleList(5));
  assert.throws(() => buildRoleList(16));
});

test('القروي فقط يحصل على بطاقة القروي كنكهة، والأميرة صارت دوراً مستقلاً', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const assignment = new Map([
    ['a', 'mafia'], ['b', 'doctor'], ['c', 'sheikh'],
    ['d', 'villager'], ['e', 'villager'], ['f', 'villager'],
  ]);
  const flavors = assignFlavors(ids, assignment);
  assert.deepStrictEqual([...flavors.keys()].sort(), ['d', 'e', 'f']);
  for (const f of flavors.values()) assert.ok(FLAVOR_CARDS.includes(f));
});

test('cardFor يعيد بطاقة النكهة للمواطن وبطاقة الدور لغيره', () => {
  assert.strictEqual(cardFor('villager', '06-villager.png'), '06-villager.png');
  assert.strictEqual(cardFor('villager', '10-joker.png'), '06-villager.png');
  assert.strictEqual(cardFor('mafia', '10-joker.png'), '01-mafia.png');
  assert.strictEqual(cardFor('shifted', null), '13-shifted.png');
});

test('isEvil: مافيا ووريثة وزعيم ومتحوّل-بعد-التحول أشرار، والبقية لا', () => {
  for (const r of ['mafia', 'heiress', 'zaeem', 'shifted']) assert.strictEqual(isEvil(r), true);
  for (const r of ['doctor', 'sheikh', 'villager', 'thief', 'mayor', 'shapeshifter', 'fighter', 'princess', 'joker']) assert.strictEqual(isEvil(r), false);
});

test('roleAlignment يفرّق بين الخير والشر والمهرج المحايد', () => {
  assert.strictEqual(roleAlignment('mafia'), 'evil');
  assert.strictEqual(roleAlignment('doctor'), 'good');
  assert.strictEqual(roleAlignment('joker'), 'neutral');
});

test('assignRoles يوزّع دورًا واحدًا لكل لاعب', () => {
  const playerIds = Array.from({ length: 9 }, (_, i) => `p${i}`);
  const assignment = assignRoles(playerIds);
  assert.strictEqual(assignment.size, 9);
  for (const id of playerIds) assert.ok(assignment.has(id));
});
