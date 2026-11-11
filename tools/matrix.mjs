/**
 * matrix.mjs —— 11×11 胜率矩阵（行＝该色，列＝对手）
 * 用法：node tools/matrix.mjs [每对局数]
 */
import { playMatch } from '../js/engine/rules.js';
import { PRECONS } from '../js/data/precons.js';
import * as B from '../js/ai/builtin.js';

const N = Number(process.argv[2] || 8);
const P = PRECONS;
const cols = P.map((p) => p.color);
const win = {}, games = {}, rounds = {};
for (const a of cols) { win[a] = {}; games[a] = {}; rounds[a] = {}; }

let seed = 0;
for (const a of P) {
  for (const b of P) {
    if (a.color === b.color) continue;
    for (let k = 0; k < N; k++) {
      seed++;
      const res = playMatch({
        deckA: a.deck, deckB: b.deck, colorA: a.color, colorB: b.color,
        seed, scriptA: B.VALUE, scriptB: B.VALUE, nameA: a.color, nameB: b.color,
      });
      win[a.color][b.color] = (win[a.color][b.color] || 0) + (res.winner === 0 ? 1 : 0);
      games[a.color][b.color] = (games[a.color][b.color] || 0) + 1;
      rounds[a.color][b.color] = (rounds[a.color][b.color] || 0) + res.game.round;
    }
  }
}

console.log('行＝该色对列色的胜率（%）｜格内为胜率');
console.log('色  ' + cols.map((c) => c.padStart(4)).join(''));
for (const a of cols) {
  const cells = cols.map((b) => (a === b ? '   —' : String(Math.round((win[a][b] / games[a][b]) * 100)).padStart(4)));
  console.log(a + ' ' + cells.join(''));
}
console.log('\n行＝该色对列色的平均轮数');
console.log('色  ' + cols.map((c) => c.padStart(5)).join(''));
for (const a of cols) {
  const cells = cols.map((b) => (a === b ? '    —' : (rounds[a][b] / games[a][b]).toFixed(1).padStart(5)));
  console.log(a + ' ' + cells.join(''));
}
