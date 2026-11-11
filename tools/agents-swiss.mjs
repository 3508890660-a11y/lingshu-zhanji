#!/usr/bin/env node
/**
 * agents-swiss.mjs —— 12 个模型脚本的瑞士轮 + BO10。
 *
 *   node tools/agents-swiss.mjs [--rounds 5] [--bo 10] [--out agents/results-swiss]
 *
 * 与 agents-run.mjs（全循环）的区别：
 *   - 每轮按战绩配对，而不是所有 66 对都打一遍；
 *   - 每对打 BO10（各 5 局先手），而不是每轮各先手一次；
 *   - 排名先看 BO 胜场，再看局胜率，最后看平均步数。
 *
 * 只读 agents/agents.json，不修改引擎。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileScript } from '../js/ai/loader.js';
import { playMatch, validateDeck } from '../js/engine/rules.js';
import { colorPool, normalizeDeck } from '../js/ai/deckbuild.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = { rounds: 5, bo: 10, out: 'agents/results-swiss' };
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--rounds') args.rounds = Math.max(1, Number(process.argv[++i]) || 5);
  else if (process.argv[i] === '--bo') args.bo = Math.max(2, Number(process.argv[++i]) || 10);
  else if (process.argv[i] === '--out') args.out = process.argv[++i] || args.out;
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'agents.json'), 'utf8'));
const errors = [];

/* ── 载入 12 份脚本 ── */
const field = [];
for (const entry of manifest.agents) {
  const file = path.join(ROOT, entry.file);
  const docFile = path.join(ROOT, entry.doc);
  try {
    if (!fs.existsSync(file)) throw new Error(`脚本不存在：${entry.file}`);
    const script = compileScript(fs.readFileSync(file, 'utf8'), path.basename(file));
    if (typeof script.build !== 'function') throw new Error('缺少 build(pool)');
    const color = entry.color;
    if (!color) throw new Error('agents.json 缺少 color');
    const deck = normalizeDeck(script.build(colorPool(color).map((c) => ({ ...c }))));
    const v = validateDeck(deck, { min: 25, max: 40 });
    if (!v.ok) throw new Error(`卡组不合法：${v.errors.join('；')}`);
    field.push({
      id: entry.id, model: entry.model, color, script, deck,
      boW: 0, boL: 0, boD: 0, gw: 0, gl: 0, gd: 0, steps: 0, games: 0,
      opponents: new Set(), history: [],
    });
  } catch (e) {
    errors.push({ id: entry.id, message: e.message });
  }
}

const played = new Set();
const pairKey = (a, b) => [a.id, b.id].sort().join('|');
const points = (p) => p.boW + p.boD * 0.5;
const gameRate = (p) => (p.gw + p.gl + p.gd > 0 ? (p.gw + p.gd * 0.5) / (p.gw + p.gl + p.gd) : 0);

function rank(list) {
  return [...list].sort((a, b) => (
    points(b) - points(a)
    || gameRate(b) - gameRate(a)
    || (a.steps / Math.max(1, a.games)) - (b.steps / Math.max(1, b.games))
    || a.id.localeCompare(b.id)
  ));
}

/** 瑞士轮配对：高分先配，优先未交手；找不到就配最近的（并标注重赛） */
function pairRound(list) {
  const sorted = rank(list);
  const used = new Set();
  const pairs = [];
  for (const a of sorted) {
    if (used.has(a.id)) continue;
    let pick = null;
    for (const b of sorted) {
      if (b.id === a.id || used.has(b.id)) continue;
      if (!played.has(pairKey(a, b))) { pick = b; break; }
    }
    if (!pick) {
      pick = sorted.find((b) => b.id !== a.id && !used.has(b.id)) || null;
    }
    if (!pick) continue;
    used.add(a.id); used.add(pick.id);
    pairs.push([a, pick, played.has(pairKey(a, pick))]);
  }
  return pairs;
}

/* ── BO10 ── */
function playBO(a, b, round, table) {
  const bo = args.bo;
  const half = Math.floor(bo / 2);
  let aw = 0, bw = 0, dr = 0, steps = 0;
  for (let i = 0; i < bo; i++) {
    const aFirst = i < half;                       // 前 5 局 A 先手，后 5 局 B 先手
    const seed = round * 100000 + table * 1000 + i + 1;
    const res = playMatch({
      deckA: aFirst ? a.deck : b.deck,
      deckB: aFirst ? b.deck : a.deck,
      colorA: aFirst ? a.color : b.color,
      colorB: aFirst ? b.color : a.color,
      seed,
      scriptA: aFirst ? a.script : b.script,
      scriptB: aFirst ? b.script : a.script,
    });
    steps += res.steps.length;
    if (res.winner === -1) dr += 1;
    else {
      const winnerIsA = aFirst ? res.winner === 0 : res.winner === 1;
      if (winnerIsA) aw += 1; else bw += 1;
    }
  }
  const ascore = aw + dr * 0.5;
  const bscore = bw + dr * 0.5;
  const result = ascore > bscore ? 'A' : ascore < bscore ? 'B' : 'D';

  a.gw += aw; a.gl += bw; a.gd += dr; a.games += bo; a.steps += steps;
  b.gw += bw; b.gl += aw; b.gd += dr; b.games += bo; b.steps += steps;
  if (result === 'A') { a.boW += 1; b.boL += 1; }
  else if (result === 'B') { b.boW += 1; a.boL += 1; }
  else { a.boD += 1; b.boD += 1; }

  a.opponents.add(b.id); b.opponents.add(a.id);
  played.add(pairKey(a, b));

  const rec = { round, table, a: a.id, b: b.id, aw, bw, dr, result, rematch: played.has(pairKey(a, b)) };
  a.history.push(rec); b.history.push(rec);
  return rec;
}

/* ── 瑞士轮 ── */
const roundLogs = [];
for (let r = 1; r <= args.rounds; r++) {
  const pairs = pairRound(field);
  const rows = [];
  let table = 1;
  for (const [a, b, rematch] of pairs) {
    const rec = playBO(a, b, r, table);
    rec.rematch = rematch;
    rows.push(rec);
    table += 1;
  }
  roundLogs.push({ round: r, rows });
  process.stdout.write(`\r瑞士轮 ${r}/${args.rounds} 完成，累计 ${field.reduce((s, p) => s + p.games, 0) / 2} 局`);
}
process.stdout.write('\n');

/* ── 输出 ── */
const standings = rank(field).map((p, i) => ({
  rank: i + 1, id: p.id, model: p.model, color: p.color,
  boW: p.boW, boL: p.boL, boD: p.boD, points: points(p),
  gw: p.gw, gl: p.gl, gd: p.gd,
  gameRate: Number((gameRate(p) * 100).toFixed(2)),
  avgSteps: Number((p.steps / Math.max(1, p.games)).toFixed(1)),
  opponents: [...p.opponents],
}));

const totalGames = field.reduce((s, p) => s + p.games, 0) / 2;
const outJson = {
  format: `swiss-bo${args.bo}`,
  rounds: args.rounds,
  players: field.length,
  totalGames,
  errors,
  roundLogs,
  standings,
};

const L = [];
L.push(`# 12 模型 · 瑞士轮 BO${args.bo}`);
L.push('');
L.push(`- 运行时间：${new Date().toISOString()}`);
L.push(`- 规模：${field.length} 位，瑞士轮 ${args.rounds} 轮，每轮 ${field.length / 2} 对，每对 BO${args.bo}（前 ${Math.floor(args.bo / 2)} 局 A 先手、后 ${Math.ceil(args.bo / 2)} 局 B 先手）`);
L.push(`- 总局数：**${totalGames}**｜失败脚本：${errors.length}`);
L.push(`- 计分：BO 胜 1、BO 平 0.5；同分比局胜率，再比平均步数`);
L.push('');
L.push('## 最终排名');
L.push('');
L.push('| 名次 | 模型 | 颜色 | BO 战绩 | 局战绩（胜-负-平） | 局胜率 | 平均步数 |');
L.push('|---:|---|---|---|---|---:|---:|');
for (const s of standings) {
  L.push(`| ${s.rank} | ${s.model} | ${s.color} | ${s.boW}-${s.boL}-${s.boD}（${s.points} 分） | ${s.gw}-${s.gl}-${s.gd} | ${s.gameRate}% | ${s.avgSteps} |`);
}
L.push('');
L.push('## 各轮配对');
for (const rl of roundLogs) {
  L.push('');
  L.push(`### 第 ${rl.round} 轮`);
  L.push('');
  L.push('| 台 | 选手 A | 局分 | 选手 B | BO 胜者 | 备注 |');
  L.push('|---:|---|---|---|---|---|');
  for (const x of rl.rows) {
    L.push(`| ${x.table} | ${x.a} | ${x.aw}-${x.bw}${x.dr ? `（平 ${x.dr}）` : ''} | ${x.b} | ${x.result === 'D' ? '平' : x.result === 'A' ? x.a : x.b} | ${x.rematch ? '重赛' : '—'} |`);
  }
}
const md = L.join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, `${args.out}.json`), JSON.stringify(outJson, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, `${args.out}.md`), md);

console.log(`总局数 ${totalGames}｜失败 ${errors.length}`);
for (const s of standings) {
  console.log(`${String(s.rank).padStart(2)}  ${s.model.padEnd(20)} ${s.color}  BO ${s.boW}-${s.boL}-${s.boD}  局 ${s.gw}-${s.gl}-${s.gd}  ${s.gameRate}%`);
}
console.log(`结果已写入 ${args.out}.json / .md`);
