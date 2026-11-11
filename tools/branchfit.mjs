/**
 * branchfit.mjs —— 逐色三个流派（通用6 ×3 ＋ 流派4 ×3）的实战强度
 * 用途：判断「某色弱」是卡表问题还是预组选错了流派
 * 用法：node tools/branchfit.mjs [局数]
 */
import { playMatch } from '../js/engine/rules.js';
import { PRECONS } from '../js/data/precons.js';
import * as B from '../js/ai/builtin.js';

const N = Number(process.argv[2] || 12);
const R = (a, b) => {
  const o = [];
  for (let i = a; i <= b; i++) o.push({ id: `LQ01-${String(i).padStart(3, '0')}`, n: 3 });
  return o;
};
// 通用 6 起始号 / 三个流派的号段（每段 4 个名目）
const COLORS = [
  ['白', 1, [[7, 10], [11, 14], [15, 18]]],
  ['黑', 19, [[25, 28], [29, 32], [33, 36]]],
  ['红', 37, [[43, 46], [47, 50], [51, 54]]],
  ['绿', 55, [[61, 64], [65, 68], [69, 72]]],
  ['蓝', 73, [[79, 82], [83, 86], [87, 90]]],
  ['紫', 91, [[97, 100], [101, 104], [105, 108]]],
  ['橙', 109, [[115, 118], [119, 122], [123, 126]]],
  ['青', 127, [[133, 136], [137, 140], [141, 144]]],
  ['粉', 163, [[169, 172], [173, 176], [177, 180]]],
];
const refs = ['红', '青'].map((c) => PRECONS.find((p) => p.color === c));

function measure(deck, color, label) {
  let w = 0, g = 0, peak = 0, rounds = 0;
  for (const ref of refs) {
    for (let i = 0; i < N; i++) {
      const first = i % 2 === 0;
      const res = playMatch({
        deckA: first ? deck : ref.deck,
        deckB: first ? ref.deck : deck,
        colorA: first ? color : ref.color,
        colorB: first ? ref.color : color,
        seed: 7000 + i,
        scriptA: B.VALUE, scriptB: B.VALUE,
      });
      g++;
      if (first ? res.winner === 0 : res.winner === 1) w++;
      rounds += res.game.round;
      const idx = first ? 0 : 1;
      let myPeak = 0;
      for (const st of res.steps) {
        const n = st.snap?.P?.[idx]?.board.length || 0;
        if (n > myPeak) myPeak = n;
      }
      peak += myPeak;
    }
  }
  return { label, wr: (w / g) * 100, g, peak: peak / g, rounds: rounds / g };
}

console.log(`每副 vs〔红·青〕各 ${N} 局`);
for (const [color, start, branches] of COLORS) {
  const common = R(start, start + 5);
  const out = [];
  for (let k = 0; k < 3; k++) {
    const deck = [...common, ...R(branches[k][0], branches[k][1])];
    out.push(measure(deck, color, 'ABC'[k]));
  }
  const pre = PRECONS.find((p) => p.color === color);
  const preName = pre ? '预组' : '—';
  console.log(
    `${color}  ` + out.map((o) => `${o.label} ${o.wr.toFixed(0)}%(峰${o.peak.toFixed(1)})`).join('  ') +
    `   ← 现行${preName}`,
  );
}
