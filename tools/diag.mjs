/**
 * diag.mjs —— 逐色诊断：把「为什么弱」拆成可测的四项
 *   铺场（登场单位数）、出牌数、资源峰值、伤害转化
 * 用法：node tools/diag.mjs [每色局数]
 */
import { CARDS } from '../js/engine/cards.gen.js';
import { playMatch } from '../js/engine/rules.js';
import { PRECONS } from '../js/data/precons.js';
import * as B from '../js/ai/builtin.js';

const N = Number(process.argv[2] || 30);
const byId = new Map(CARDS.map((c) => [c.id, c]));
const ref = PRECONS.find((p) => p.color === '红');

const stat = {};
for (const p of PRECONS) {
  stat[p.color] = {
    w: 0, g: 0, rounds: 0,
    units: 0, plays: 0, dmg: 0, resSum: 0, resN: 0,
    maxBoard: 0, board5: 0, empty: 0,
  };
}

for (const p of PRECONS) {
  for (let i = 0; i < N; i++) {
    const first = i % 2 === 0;
    const res = playMatch({
      deckA: first ? p.deck : ref.deck,
      deckB: first ? ref.deck : p.deck,
      colorA: first ? p.color : '红',
      colorB: first ? '红' : p.color,
      seed: 4000 + i,
      scriptA: B.VALUE, scriptB: B.VALUE,
    });
    const s = stat[p.color];
    s.g++;
    const oppColor = '红';
    const won = first ? res.winner === 0 : res.winner === 1;
    if (won) s.w++;
    s.rounds += res.game.round;

    // 从步骤快照读场面（按己方索引）
    const meIdx = first ? 0 : 1;
    let maxB = 0, b5 = 0;
    for (const st of res.steps) {
      const snap = st.snap;
      if (!snap || !snap.P) continue;
      const me = snap.P[meIdx];
      if (!me) continue;
      const n = me.board.length;
      if (n > maxB) maxB = n;
      if (snap.round === 5) b5 = Math.max(b5, n);
    }
    s.maxBoard += maxB;
    s.board5 += b5;

    // 从日志读：登场单位、出牌、打脸伤害
    const tag = p.color;
    for (const line of res.log) {
      if (line.includes('【') && line.includes('】登场')) s.units++;
      if (line.includes('打出【')) s.plays++;
      const m = line.match(/剩 (\d+)/);
    }
    // 终局场面为 0 记一次「被清空」
    const last = res.steps[res.steps.length - 1]?.snap;
    if (last?.P?.[meIdx]?.board.length === 0) s.empty++;
  }
}

console.log(`每色 vs 红·${N} 局`);
console.log('色  胜率    均轮  登场单位/局  出牌/局  铺场峰值  第5轮场面  终局空场');
for (const c of Object.keys(stat)) {
  const s = stat[c];
  const f = (x) => (x / s.g).toFixed(1);
  console.log(
    `${c}  ${((s.w / s.g) * 100).toFixed(0).padStart(3)}%  ${f(s.rounds).padStart(5)}  ` +
    `${f(s.units).padStart(10)}  ${f(s.plays).padStart(7)}  ${f(s.maxBoard).padStart(8)}  ` +
    `${f(s.board5).padStart(9)}  ${((s.empty / s.g) * 100).toFixed(0).padStart(6)}%`,
  );
}

// 预组构成速查
console.log('\n预组构成：单位卡位 / 装备 / 地标 / 其他');
for (const p of PRECONS) {
  const c = { 单位: 0, 装备: 0, 地标: 0, 其他: 0 };
  let total = 0;
  for (const it of p.deck) {
    const card = byId.get(it.id);
    if (!card) continue;
    total += it.n;
    if (card.type === '单位') c.单位 += it.n;
    else if (card.type === '装备') c.装备 += it.n;
    else if (card.type === '地标') c.地标 += it.n;
    else c.其他 += it.n;
  }
  console.log(
    `  ${p.color} ${String(total).padStart(2)} 张｜单位 ${String(c.单位).padStart(2)}｜` +
    `装备 ${c.装备}｜地标 ${c.地标}｜其他 ${String(c.其他).padStart(2)}`,
  );
}
