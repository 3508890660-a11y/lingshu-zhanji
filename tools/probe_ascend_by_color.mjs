/**
 * probe_ascend_by_color.mjs —— 各色升灵频率（判断"回外枢区"是否被某色吃成循环）
 */
import { PRECONS } from '../js/data/precons.js';
import { playMatch } from '../js/engine/rules.js';
import * as B from '../js/ai/builtin.js';

const N = Number(process.argv[2] || 8);
const rows = [];
for (const me of PRECONS) {
  let g = 0, asc = 0, ret = 0, firstTurn = 0, wins = 0;
  for (const other of PRECONS) {
    if (other.color === me.color) continue;
    for (let k = 0; k < N; k++) {
      const first = k % 2 === 0;
      const res = playMatch({
        deckA: first ? me.deck : other.deck, deckB: first ? other.deck : me.deck,
        colorA: first ? me.color : other.color, colorB: first ? other.color : me.color,
        seed: 9000 + k * 31 + PRECONS.indexOf(other),
        scriptA: B.VALUE, scriptB: B.VALUE, nameA: me.color, nameB: other.color,
      });
      g++;
      const n = res.log.filter((l) => l.startsWith(`${me.color} 升灵降临`)).length;
      const r = res.log.filter((l) => l.includes('归于外枢区') && l.includes('】')).length;
      asc += n; ret += r;
      if (n > 0) {
        const idx = res.log.findIndex((l) => l.startsWith(`${me.color} 升灵降临`));
        const upto = res.log.slice(0, idx).filter((l) => l.includes(`回合 · ${me.color}`)).length;
        firstTurn += upto;
      }
      const w = first ? res.winner === 0 : res.winner === 1;
      if (w) wins++;
    }
  }
  rows.push({ color: me.color, asc: asc / g, ret: ret / g, first: firstTurn / Math.max(1, asc), win: wins / g * 100 });
}
rows.sort((a, b) => b.win - a.win);
console.log('色  胜率   升灵/局  回归/局  首次升灵回合');
for (const r of rows) {
  console.log(`${r.color}  ${r.win.toFixed(0).padStart(3)}%   ${r.asc.toFixed(2)}     ${r.ret.toFixed(2)}     ${r.first ? r.first.toFixed(1) : '-'}`);
}
