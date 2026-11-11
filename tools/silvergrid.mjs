/**
 * silvergrid.mjs —— 银的门槛配比网格：只改名目×张数，不动卡表
 * 用法：node tools/silvergrid.mjs [局数]
 */
import { playMatch } from '../js/engine/rules.js';
import { PRECONS } from '../js/data/precons.js';
import * as B from '../js/ai/builtin.js';

const N = Number(process.argv[2] || 16);
const id = (n) => `LQ01-${String(n).padStart(3, '0')}`;

// 名目池（按门槛带）
const P1 = [145, 146, 147, 148, 159];
const P2 = [149, 150, 151, 154, 155, 157, 160];
const P3 = [152, 156, 161];
const P4 = [153, 158];
const P5 = [162];

/** 按「每带总卡位数」铺满：先每名目 3 张，再从前往后补到目标数（同名牌 ≤3） */
function build(bands) {
  const out = [];
  const pools = [P1, P2, P3, P4, P5];
  bands.forEach((target, bi) => {
    const pool = pools[bi];
    let left = target;
    const per = new Array(pool.length).fill(0);
    let i = 0;
    while (left > 0) {
      if (per[i % pool.length] < 3) { per[i % pool.length]++; left--; }
      i++;
      if (per.every((x) => x >= 3)) break;
    }
    pool.forEach((n, k) => { if (per[k]) out.push({ id: id(n), n: per[k] }); });
  });
  return out;
}

const refs = ['红', '青', '白'].map((c) => PRECONS.find((p) => p.color === c));
const CAND = [
  ['现行 8/11/8/2/1', [8, 11, 8, 2, 1]],
  ['收刀 7/10/7/4/2', [7, 10, 7, 4, 2]],
  ['更严 6/9/6/6/3', [6, 9, 6, 6, 3]],
  ['抬2压1 6/12/7/3/2', [6, 12, 7, 3, 2]],
  ['均分 7/9/7/5/2', [7, 9, 7, 5, 2]],
];

for (const [label, bands] of CAND) {
  const deck = build(bands);
  let w = 0, g = 0, peak = 0, rounds = 0;
  for (const ref of refs) {
    for (let i = 0; i < N; i++) {
      const first = i % 2 === 0;
      const res = playMatch({
        deckA: first ? deck : ref.deck, deckB: first ? ref.deck : deck,
        colorA: first ? '银' : ref.color, colorB: first ? ref.color : '银',
        seed: 8100 + i, scriptA: B.VALUE, scriptB: B.VALUE,
      });
      g++;
      if (first ? res.winner === 0 : res.winner === 1) w++;
      rounds += res.game.round;
      const idx = first ? 0 : 1;
      let mp = 0;
      for (const st of res.steps) { const n = st.snap?.P?.[idx]?.board.length || 0; if (n > mp) mp = n; }
      peak += mp;
    }
  }
  const total = deck.reduce((s, x) => s + x.n, 0);
  console.log(
    `${label.padEnd(18)} ${String(total).padStart(2)} 张｜胜率 ${((w / g) * 100).toFixed(0).padStart(3)}%` +
    `｜均 ${(rounds / g).toFixed(1)} 轮｜铺场峰值 ${(peak / g).toFixed(1)}`,
  );
}
