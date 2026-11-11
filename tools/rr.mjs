/**
 * rr.mjs —— 11 副预组全循环赛（含同色内战），给每色一个总体胜率
 * 用法：node tools/rr.mjs [每对局数]
 */
import { playMatch } from '../js/engine/rules.js';
import { PRECONS } from '../js/data/precons.js';
import * as B from '../js/ai/builtin.js';

const N = Number(process.argv[2] || 6);
const P = PRECONS;
const st = {};
for (const p of P) st[p.color] = { w: 0, g: 0, rounds: 0, peak: 0 };

let seed = 1;
for (let i = 0; i < P.length; i++) {
  for (let j = i; j < P.length; j++) {
    const a = P[i], b = P[j];
    for (let k = 0; k < N; k++) {
      const A = k % 2 === 0;
      seed++;
      const res = playMatch({
        deckA: A ? a.deck : b.deck, deckB: A ? b.deck : a.deck,
        colorA: A ? a.color : b.color, colorB: A ? b.color : a.color,
        seed, scriptA: B.VALUE, scriptB: B.VALUE,
      });
      const wA = res.winner === 0;
      if (res.winner !== -1) {
        const wc = A ? (wA ? a.color : b.color) : (wA ? b.color : a.color);
        st[wc].w++;
      }
      st[a.color].g++; st[b.color].g++;
      st[a.color].rounds += res.game.round; st[b.color].rounds += res.game.round;
      for (const [idx, col] of [[0, A ? a.color : b.color], [1, A ? b.color : a.color]]) {
        let mp = 0;
        for (const s of res.steps) { const n = s.snap?.P?.[idx]?.board.length || 0; if (n > mp) mp = n; }
        st[col].peak += mp;
      }
    }
  }
}

const rows = Object.entries(st).map(([c, s]) => ({
  c, wr: (s.w / s.g) * 100, g: s.g, rounds: s.rounds / s.g, peak: s.peak / s.g,
}));
rows.sort((x, y) => y.wr - x.wr);
console.log(`循环赛：每对 ${N} 局，共 ${rows.reduce((a, r) => a + r.g, 0) / 2} 局`);
for (const r of rows) {
  const bar = '█'.repeat(Math.round(r.wr / 2));
  console.log(`${r.c}  ${r.wr.toFixed(0).padStart(3)}%  ${bar.padEnd(50)} 均 ${r.rounds.toFixed(1)} 轮  峰 ${r.peak.toFixed(1)}`);
}
