#!/usr/bin/env node
/**
 * agent-selftest.mjs —— 单个模型脚本的自检。
 *
 *   node tools/agent-selftest.mjs agents/agent-hy4.js 红 [局数]
 *
 * 做四件事：
 *   1. 用游戏同款 compileScript 编译脚本；
 *   2. 调 build(pool) 组卡，normalize + validateDeck（25~40；金为 10 张固定主卡组）；
 *   3. 与内置 CONTROL 在 白/黑/红 三个对手色之间轮换对局；
 *   4. 打印卡组、曲线、胜负、异常与步数，异常时退出码 1。
 *
 * 只读脚本，不写任何文件；不修改引擎。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileScript } from '../js/ai/loader.js';
import { BY_ID, playMatch, validateDeck } from '../js/engine/rules.js';
import { colorPool, normalizeDeck, textToDeck, autoBuild } from '../js/ai/deckbuild.js';
import { CONTROL } from '../js/ai/builtin.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLORS = ['白', '黑', '红', '绿', '蓝', '紫', '橙', '青', '银', '粉', '金', '灰'];
const OPP_COLORS = ['白', '黑', '红'];
const [fileArg, colorArg, gamesArg] = process.argv.slice(2);

if (!fileArg || !colorArg) {
  console.error('用法: node tools/agent-selftest.mjs <脚本文件> <颜色> [局数]');
  process.exit(2);
}
if (!COLORS.includes(colorArg)) {
  console.error(`颜色必须是 ${COLORS.join('/')} 之一`);
  process.exit(2);
}

const file = path.resolve(ROOT, fileArg);
const games = Math.max(2, Number(gamesArg) || 20);
if (!fs.existsSync(file)) {
  console.error(`脚本不存在：${file}`);
  process.exit(2);
}

const src = fs.readFileSync(file, 'utf8');
let script;
try {
  script = compileScript(src, path.basename(file));
} catch (error) {
  console.error(`✗ 编译失败：${error.message}`);
  process.exit(1);
}
if (typeof script.build !== 'function') {
  console.error('✗ 缺少 build(pool)：本轮要求脚本自己组卡');
  process.exit(1);
}

const pool = colorPool(colorArg).map((card) => ({ ...card }));
let rawDeck;
try {
  rawDeck = script.build(pool);
} catch (error) {
  console.error(`✗ build(pool) 抛异常：${error.message}`);
  process.exit(1);
}
if (typeof rawDeck === 'string') rawDeck = textToDeck(rawDeck);
if (!Array.isArray(rawDeck) || !rawDeck.length) {
  console.error('✗ build(pool) 没有返回卡组（返回 null / 空数组 / 非法结构）');
  process.exit(1);
}

const deck = normalizeDeck(rawDeck);
const validation = validateDeck(deck, { min: 25, max: 40 });
if (!validation.ok) {
  console.error(`✗ 卡组合规校验失败：${validation.errors.join('；')}`);
  process.exit(1);
}

const curve = { '1-2': 0, '3-4': 0, '5-6': 0, '7+': 0 };
const names = [];
for (const item of deck) {
  const card = BY_ID.get(item.id);
  const cost = card?.cost?.n ?? 0;
  if (cost <= 2) curve['1-2'] += item.n;
  else if (cost <= 4) curve['3-4'] += item.n;
  else if (cost <= 6) curve['5-6'] += item.n;
  else curve['7+'] += item.n;
  names.push(`${item.n}x ${card?.name || item.id}`);
}

const oppDecks = new Map();
for (const oppColor of OPP_COLORS) {
  const oppPool = colorPool(oppColor).map((card) => ({ ...card }));
  let list;
  try {
    list = CONTROL.build?.(oppPool);
  } catch {
    list = null;
  }
  if (typeof list === 'string') list = textToDeck(list);
  list = normalizeDeck(Array.isArray(list) && list.length ? list : autoBuild(oppPool, { names: 10 }));
  const check = validateDeck(list, { min: 25, max: 40 });
  if (!check.ok) list = normalizeDeck(autoBuild(oppPool, { names: 10 }));
  oppDecks.set(oppColor, list);
}

let wins = 0;
let losses = 0;
let draws = 0;
let errors = 0;
let short = 0;
let long = 0;
let totalSteps = 0;

for (let index = 0; index < games; index++) {
  const oppColor = OPP_COLORS[index % OPP_COLORS.length];
  const oppDeck = oppDecks.get(oppColor);
  const swap = index % 2 === 1;
  const opts = {
    deckA: swap ? oppDeck : deck,
    deckB: swap ? deck : oppDeck,
    colorA: swap ? oppColor : colorArg,
    colorB: swap ? colorArg : oppColor,
    scriptA: swap ? CONTROL : script,
    scriptB: swap ? script : CONTROL,
    nameA: swap ? `CONTROL·${oppColor}` : `${script.name}·${colorArg}`,
    nameB: swap ? `${script.name}·${colorArg}` : `CONTROL·${oppColor}`,
    seed: 9000 + index
  };
  try {
    const result = playMatch(opts);
    totalSteps += result.steps.length;
    if (result.steps.length < 8) short++;
    if (result.steps.length >= 3990) long++;
    const mySide = swap ? 1 : 0;
    if (result.winner === mySide) wins++;
    else if (result.winner === -1) draws++;
    else losses++;
  } catch (error) {
    errors++;
    console.error(`  ✗ 第 ${index + 1} 局异常：${error.message}`);
  }
}

const summary = {
  script: path.relative(ROOT, file),
  name: script.name,
  desc: script.desc,
  color: colorArg,
  deck: {
    total: validation.total,
    unique: deck.length,
    color: validation.color,
    curve,
    names
  },
  games,
  wins,
  losses,
  draws,
  errors,
  short,
  long,
  avgSteps: +(totalSteps / Math.max(1, wins + losses + draws)).toFixed(1)
};

console.log(JSON.stringify(summary, null, 2));
console.log(`\n${errors || short || long ? '✗' : '✓'} ${script.name}｜${colorArg}｜${validation.total} 张 / ${deck.length} 名目｜${wins} 胜 ${losses} 负 ${draws} 平｜平均 ${summary.avgSteps} 步`);
if (errors || short || long) process.exit(1);
