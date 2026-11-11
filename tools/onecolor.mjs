/**
 * onecolor.mjs —— 单色体检：指定颜色 vs 其余 10 副预组
 * 用法：node tools/onecolor.mjs 蓝 [每对局数]
 * 输出：胜率 / 均轮 / 峰值场面 / 每回合出牌数 / 终局手牌 / 牌库余量 / 重构次数
 */
import { PRECONS } from '../js/data/precons.js';
import { playMatch } from '../js/engine/rules.js';
import * as B from '../js/ai/builtin.js';

const target = process.argv[2] || '蓝';
const N = Number(process.argv[3] || 12);
const me = PRECONS.find((p) => p.color === target);
if (!me) { console.log('没有这个颜色的预组:', target); process.exit(1); }

let w = 0, g = 0, rounds = 0, peak = 0, plays = 0, recon = 0, hand = 0, deck = 0, turns = 0;
for (const other of PRECONS) {
  if (other.color === target) continue;
  for (let k = 0; k < N; k++) {
    const first = k % 2 === 0;
    const res = playMatch({
      deckA: first ? me.deck : other.deck,
      deckB: first ? other.deck : me.deck,
      colorA: first ? target : other.color,
      colorB: first ? other.color : target,
      seed: 7000 + k * 13 + PRECONS.indexOf(other),
      scriptA: B.VALUE, scriptB: B.VALUE,
      nameA: first ? target : other.color, nameB: first ? other.color : target,
    });
    const win = first ? res.winner === 0 : res.winner === 1;
    if (win) w++;
    g++;
    rounds += res.game.round;
    const idx = first ? 0 : 1;
    let myPeak = 0;
    for (const st of res.steps) myPeak = Math.max(myPeak, st.snap?.P?.[idx]?.board.length || 0);
    peak += myPeak;
    const p = res.game.players[idx];
    plays += res.log.filter((l) => l.startsWith(`${p.name} 打出`) || l.includes(` ${p.name} `)).length ? 0 : 0;
    recon += res.log.filter((l) => l.includes(`${p.name} 触发重构`)).length;
    hand += p.hand.length;
    deck += p.deck.length;
    turns += p.turnCount;
  }
}
console.log(`${target} vs 全预组（每对 ${N} 局，共 ${g} 局）`);
console.log(`  胜率 ${(w / g * 100).toFixed(0)}% ｜ 均 ${(rounds / g).toFixed(1)} 轮 ｜ 峰值场面 ${(peak / g).toFixed(1)} ｜ 重构 ${(recon / g).toFixed(2)} 次/局 ｜ 终局手牌 ${(hand / g).toFixed(1)} ｜ 牌库余 ${(deck / g).toFixed(1)}`);
