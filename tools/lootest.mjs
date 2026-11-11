/**
 * lootest.mjs —— 逐张移除（leave-one-out）：找出某副预组里真正承重的卡
 * 用法：node tools/lootest.mjs <颜色> [局数]
 * 做法：把某个名目的 3 张换成「同类型的灰卡替补」，卡组张数与类型配比不变
 */
import { CARDS } from '../js/engine/cards.gen.js';
import { playMatch } from '../js/engine/rules.js';
import { PRECONS } from '../js/data/precons.js';
import * as B from '../js/ai/builtin.js';

const color = process.argv[2] || '银';
const N = Number(process.argv[3] || 12);
const byId = new Map(CARDS.map((c) => [c.id, c]));

const pre = PRECONS.find((p) => p.color === color);
if (!pre) { console.log('没有该色预组'); process.exit(1); }

// 灰卡替补：按类型各取一张最弱的
const greyUnit = CARDS.filter((c) => c.color === '灰' && c.type === '单位')
  .sort((a, b) => (a.atk + a.imp + a.hp) - (b.atk + b.imp + b.hp))[0];
const greySpell = CARDS.filter((c) => c.color === '灰' && c.type === '法术')
  .sort((a, b) => (a.cost?.n || 0) - (b.cost?.n || 0))[0];
const sub = (card) => (card?.type === '单位' ? { id: greyUnit.id, n: 3 } : { id: (greySpell || greyUnit).id, n: 3 });

const refs = ['红', '青', '白', '蓝'].map((c) => PRECONS.find((p) => p.color === c));

function score(deck) {
  let w = 0, g = 0;
  for (const ref of refs) {
    for (let i = 0; i < N; i++) {
      const first = i % 2 === 0;
      const res = playMatch({
        deckA: first ? deck : ref.deck, deckB: first ? ref.deck : deck,
        colorA: first ? color : ref.color, colorB: first ? ref.color : color,
        seed: 9100 + i, scriptA: B.VALUE, scriptB: B.VALUE,
      });
      g++;
      if (first ? res.winner === 0 : res.winner === 1) w++;
    }
  }
  return (w / g) * 100;
}

const base = score(pre.deck);
console.log(`${color} 基线 ${base.toFixed(0)}%（替补：${greyUnit.id} ${greyUnit.name} ${greyUnit.atk}/${greyUnit.imp}/${greyUnit.hp}）`);
const rows = [];
for (const it of pre.deck) {
  const card = byId.get(it.id);
  if (!card) continue;
  const deck = pre.deck.map((x) => (x.id === it.id ? sub(card) : x));
  const s = score(deck);
  rows.push([`${it.id} ${card.name}`, it.n, card.type, card.cost?.k ? `${card.cost.k}${card.cost.n}` : '—', s, s - base]);
}
rows.sort((a, b) => a[4] - b[4]);
console.log('名目'.padEnd(26) + '张 类型 费  胜率   落差');
for (const r of rows) {
  console.log(`${r[0].padEnd(24)} ${String(r[1]).padStart(2)} ${r[2].padEnd(3)} ${String(r[3]).padStart(4)} ${r[4].toFixed(0).padStart(4)}% ${r[5].toFixed(0).padStart(5)}`);
}
