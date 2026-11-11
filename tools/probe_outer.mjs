/**
 * probe_outer.mjs —— 外枢灵体去向探针
 * 检查：升灵 → 外枢单位被破坏后，是回外枢区（可再降临）还是进除外区；
 * 且外枢编号（LQ01-260~283）绝不出现在牌库／手牌／弃牌区。
 */
import { PRECONS } from '../js/data/precons.js';
import { playMatch } from '../js/engine/rules.js';
import * as B from '../js/ai/builtin.js';

const P = PRECONS;
let asc = 0, ret = 0, ex = 0, bad = 0, games = 0, second = 0;
const badSamples = [];

for (const a of P) {
  for (const b of P) {
    if (a.color === b.color) continue;
    games++;
    const res = playMatch({
      deckA: a.deck, deckB: b.deck, colorA: a.color, colorB: b.color,
      seed: games * 7 + 1, scriptA: B.VALUE, scriptB: B.VALUE, nameA: a.color, nameB: b.color,
    });
    for (const l of res.log) {
      if (l.includes('升灵降临')) asc++;
      if (l.includes('归于外枢区')) ret++;
      if (l.includes('进入除外区')) { ex++; second++; }
    }
    for (const p of res.game.players) {
      for (const id of [...p.grave, ...p.deck, ...p.hand]) {
        if (/^LQ01-2[6-8]\d$/.test(id)) {
          bad++;
          if (badSamples.length < 4) badSamples.push(`${p.color} ${id}`);
        }
      }
    }
  }
}

console.log(`对局 ${games} ｜ 升灵降临 ${asc} ｜ 归于外枢区 ${ret} ｜ 进入除外区 ${ex} ｜ 违规 ${bad}`);
if (badSamples.length) console.log('违规样本：', badSamples.join(' / '));
