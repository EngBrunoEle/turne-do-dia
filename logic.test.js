// node logic.test.js
const assert = require('assert');
const L = require('./logic');
const cfg = L.DEFAULT_CFG;

assert.strictEqual(L.smartBuffer(cfg, []), 10);
assert.strictEqual(L.smartBuffer(cfg, [15, 15, 0, 0, 0]), 16);
assert.strictEqual(L.smartBuffer(cfg, [30, 30, 30, 30, 30, 30]), 40);
assert.strictEqual(L.smartBuffer({ ...cfg, smart: false }, [30]), 10);

const ev = { time: '2026-11-20T09:00:00', prep: 40, travel: 20 };
const t = L.times(ev, cfg, []);
assert.strictEqual(t.leave.getHours() * 60 + t.leave.getMinutes(), 8 * 60 + 30); // 9:00 - 20 - 10
assert.strictEqual(t.ready.getMinutes(), 50); // 7:50
assert.strictEqual(t.warn.getMinutes(), 20);

assert.strictEqual(L.clampCfg('warn', '0', 10), 1);
assert.strictEqual(L.clampCfg('focus', '', 25), 25);
assert.strictEqual(L.clampCfg('focus', '50', 25), 50);
assert.strictEqual(L.focusXP(50), 80);

assert.strictEqual(L.lvl(0).cur[1], 'Taylor Swift');
assert.strictEqual(L.lvl(6100).cur[1], 'The Life of a Showgirl');
assert.ok(L.unlockedLooks(0).some(e => e[1] === 'Lover'));

let S = L.sample(new Date('2026-11-18T10:00:00'));
S.tasks[0].done = true; S.tasks[1].done = true;
const S2 = L.rollDay(S, new Date('2026-11-19T07:00:00'));
assert.strictEqual(S2.stats.streak, 2);
assert.strictEqual(S2.tasks.length, 2); // avulsa concluída saiu
assert.ok(S2.tasks.every(x => !x.done));
assert.strictEqual(L.rollDay(S2, new Date('2026-11-22T07:00:00')).stats.streak, 1);

const g = L.gain({ ...S, stats: { ...S.stats, tasksDone: 1 } }, 130);
assert.strictEqual(g.newEra, 'Fearless');
assert.deepStrictEqual(g.news, ['Easter egg']);
console.log('ok');
