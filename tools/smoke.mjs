#!/usr/bin/env node
/**
 * smoke.mjs —— 无头冒烟测试：不碰浏览器，直接验规则引擎与 AI 是否能跑完整局。
 *
 *   node tools/smoke.mjs [轮数]
 *
 * 它会：
 *   1. 11 色各跑若干局，检查每局都能正常结束、步数合理；
 *   2. 打印每个 AI 的总胜负（只当基线看，不做平衡结论）；
 *   3. 对"同一套卡组 + 同一脚本 + 同一随机种子"做复现性校验。
 */
import { playMatch, validateDeck } from '../js/engine/rules.js';
import { colorPool, autoBuild, normalizeDeck } from '../js/ai/deckbuild.js';
import { AGGRO, CONTROL, VALUE, RANDOM } from '../js/ai/builtin.js';

const ROUNDS = Number(process.argv[2]) || 2;
const COLORS = ['白', '黑', '红', '绿', '蓝', '紫', '橙', '青', '银', '粉', '金', '灰'];
const AIS = [AGGRO, CONTROL, VALUE, RANDOM];

const decks = new Map();
function deckFor(color, ai) {
  const k = `${color}|${ai.id}`;
  if (decks.has(k)) return decks.get(k);
  const pool = colorPool(color).map((c) => ({ ...c }));
  let list = null;
  try { list = ai.build?.(pool) || null; } catch { list = null; }
  list = normalizeDeck(list && list.length ? list : autoBuild(pool, { names: 10 }));
  const v = validateDeck(list, { min: 25, max: 40 });
  if (!v.ok) list = autoBuild(pool, { names: 10 });
  decks.set(k, list);
  return list;
}

let ok = 0, fail = 0, totalSteps = 0;
const wins = Object.fromEntries(AIS.map((a) => [a.name, 0]));
const games = [];

let seed = 1000;
for (const ai of AIS) {
  for (const color of COLORS) {
    for (let r = 0; r < ROUNDS; r++) {
      const other = AIS[(AIS.indexOf(ai) + 1) % AIS.length];
      const oc = COLORS[(COLORS.indexOf(color) + 5) % COLORS.length];
      try {
        const res = playMatch({
          deckA: deckFor(color, ai), deckB: deckFor(oc, other),
          colorA: color, colorB: oc,
          seed: seed++, scriptA: ai, scriptB: other,
          nameA: `${ai.name}·${color}`, nameB: `${other.name}·${oc}`,
        });
        ok++;
        totalSteps += res.steps.length;
        if (res.winner === 0) wins[ai.name]++;
        games.push({ a: `${ai.name}·${color}`, b: `${other.name}·${oc}`, w: res.winner, steps: res.steps.length });
        if (res.steps.length < 8) console.log(`  ! 异常短局：${ai.name}·${color} vs ${other.name}·${oc}，${res.steps.length} 步`);
      } catch (e) {
        fail++;
        console.log(`  ✗ ${ai.name}·${color} vs ${other.name}·${oc}: ${e.message}`);
      }
    }
  }
}

console.log(`\n局数 ${ok} 成功 / ${fail} 失败，平均 ${(totalSteps / Math.max(1, ok)).toFixed(1)} 步`);
console.log('先手胜场（只作基线，不作平衡结论）：');
for (const [k, v] of Object.entries(wins)) console.log(`  ${k}: ${v}`);

// 复现性：同种子同卡组应产出完全一致的步数
const a = playMatch({ deckA: deckFor('红', AGGRO), deckB: deckFor('白', CONTROL), colorA: '红', colorB: '白', seed: 777, scriptA: AGGRO, scriptB: CONTROL });
const b = playMatch({ deckA: deckFor('红', AGGRO), deckB: deckFor('白', CONTROL), colorA: '红', colorB: '白', seed: 777, scriptA: AGGRO, scriptB: CONTROL });
const same = a.steps.length === b.steps.length && a.winner === b.winner;
console.log(`\n复现性：${same ? '✓ 一致' : '✗ 不一致'}（${a.steps.length} 步 / 胜者 ${a.winner}）`);
process.exit(fail ? 1 : 0);
