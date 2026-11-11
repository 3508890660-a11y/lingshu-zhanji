#!/usr/bin/env node
/**
 * agents-run.mjs —— 12 个模型脚本的循环赛。
 *
 *   node tools/agents-run.mjs [--seeds 2] [--only hy4,hy3] [--out agents/results]
 *
 * - 读 agents/agents.json；
 * - 用游戏同款 compileScript 编译每个脚本；
 * - 调 build(pool) 组卡并 validateDeck；
 * - 每对脚本各先手一次，重复 seeds 轮，种子可复现；
 * - 输出 agents/results.json 与 agents/results.md。
 *
 * 只读脚本与 agents.json，不修改引擎。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileScript } from '../js/ai/loader.js';
import { BY_ID, playMatch, validateDeck } from '../js/engine/rules.js';
import { colorPool, normalizeDeck, textToDeck } from '../js/ai/deckbuild.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COLOR_CHARS = ['白', '黑', '红', '绿', '蓝', '紫', '橙', '青', '银', '粉', '金', '灰'];

function parseArgs(argv) {
  const out = { seeds: 2, only: null, out: 'agents/results' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seeds') out.seeds = Math.max(1, Number(argv[++i]) || 2);
    else if (argv[i] === '--only') out.only = String(argv[++i] || '').split(',').map((x) => x.trim()).filter(Boolean);
    else if (argv[i] === '--out') out.out = argv[++i] || out.out;
  }
  return out;
}

function detectColor(entry, src, docText) {
  if (entry.color && COLOR_CHARS.includes(entry.color)) return entry.color;
  const metaBlock = src.match(/const\s+meta\s*=\s*\{[\s\S]*?\};/);
  if (metaBlock) {
    const one = metaBlock[0].match(/color\s*:\s*['"]([白黑红绿蓝紫橙青银粉金灰])['"]/);
    if (one) return one[1];
    const many = metaBlock[0].match(/colors\s*:\s*\[\s*['"]([白黑红绿蓝紫橙青银粉金灰])['"]/);
    if (many) return many[1];
  }
  const doc = String(docText || '').match(/自选颜色[：:]\s*([白黑红绿蓝紫橙青银粉金灰])/);
  return doc ? doc[1] : null;
}

function detectStrategy(entry, docText) {
  if (entry.strategy) return entry.strategy;
  const m = String(docText || '').match(/自选策略[：:]\s*(.+)/);
  return m ? m[1].trim() : '';
}

function deckSummary(deck) {
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
  return { total: deck.reduce((s, x) => s + x.n, 0), unique: deck.length, curve, names };
}

const args = parseArgs(process.argv.slice(2));
const manifestPath = path.join(ROOT, 'agents', 'agents.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const selected = manifest.agents.filter((agent) => !args.only || args.only.includes(agent.id));

const ready = [];
const errors = [];
for (const entry of selected) {
  const file = path.join(ROOT, entry.file);
  const docFile = path.join(ROOT, entry.doc);
  const docText = fs.existsSync(docFile) ? fs.readFileSync(docFile, 'utf8') : '';
  try {
    if (!fs.existsSync(file)) throw new Error(`脚本不存在：${entry.file}`);
    const src = fs.readFileSync(file, 'utf8');
    const script = compileScript(src, path.basename(file));
    if (typeof script.build !== 'function') throw new Error('缺少 build(pool)');
    const color = detectColor(entry, src, docText);
    if (!color) throw new Error('无法识别颜色（请在 meta.color 或设计说明写「自选颜色：X」）');
    const pool = colorPool(color).map((card) => ({ ...card }));
    let rawDeck;
    try {
      rawDeck = script.build(pool);
    } catch (error) {
      throw new Error(`build(pool) 抛异常：${error.message}`);
    }
    if (typeof rawDeck === 'string') rawDeck = textToDeck(rawDeck);
    if (!Array.isArray(rawDeck) || !rawDeck.length) throw new Error('build(pool) 未返回卡组');
    const deck = normalizeDeck(rawDeck);
    const validation = validateDeck(deck, { min: 25, max: 40 });
    if (!validation.ok) throw new Error(`卡组不合规：${validation.errors.join('；')}`);
    ready.push({
      id: entry.id,
      model: entry.model,
      modelId: entry.modelId,
      color,
      strategy: detectStrategy(entry, docText),
      desc: script.desc,
      script,
      deck,
      summary: deckSummary(deck),
      wins: 0,
      losses: 0,
      draws: 0,
      steps: 0,
      games: 0
    });
    console.log(`✓ ${entry.id.padEnd(16)} ${color}｜${script.name}｜${validation.total} 张 / ${deck.length} 名目`);
  } catch (error) {
    errors.push({ id: entry.id, model: entry.model, error: error.message });
    console.error(`✗ ${entry.id.padEnd(16)} ${error.message}`);
  }
}

if (ready.length < 2) {
  console.error('可运行脚本不足 2 个，终止。');
  process.exit(1);
}

const pairCount = (ready.length * (ready.length - 1)) / 2;
const totalGames = pairCount * args.seeds * 2;
console.log(`\n循环赛：${ready.length} 个脚本，${pairCount} 对，${args.seeds} 轮，共 ${totalGames} 局\n`);

let played = 0;
let pairIndex = 0;
for (let i = 0; i < ready.length; i++) {
  for (let j = i + 1; j < ready.length; j++) {
    for (let round = 0; round < args.seeds; round++) {
      for (const side of [0, 1]) {
        const a = side === 0 ? ready[i] : ready[j];
        const b = side === 0 ? ready[j] : ready[i];
        const seed = 20000 + round * 1000 + pairIndex * 2 + side;
        try {
          const result = playMatch({
            deckA: a.deck,
            deckB: b.deck,
            colorA: a.color,
            colorB: b.color,
            scriptA: a.script,
            scriptB: b.script,
            nameA: `${a.model}·${a.color}`,
            nameB: `${b.model}·${b.color}`,
            seed
          });
          a.games++;
          b.games++;
          a.steps += result.steps.length;
          b.steps += result.steps.length;
          if (result.winner === 0) {
            a.wins++;
            b.losses++;
          } else if (result.winner === 1) {
            b.wins++;
            a.losses++;
          } else {
            a.draws++;
            b.draws++;
          }
        } catch (error) {
          errors.push({ id: `${a.id} vs ${b.id}`, error: `seed ${seed}: ${error.message}` });
          console.error(`✗ ${a.id} vs ${b.id} seed ${seed}: ${error.message}`);
        }
        played++;
        if (played % 20 === 0 || played === totalGames) process.stdout.write(`\r  ${played}/${totalGames}`);
      }
    }
    pairIndex++;
  }
}
process.stdout.write('\n');

const standings = ready
  .map((agent) => ({
    id: agent.id,
    model: agent.model,
    modelId: agent.modelId,
    color: agent.color,
    strategy: agent.strategy,
    name: agent.script.name,
    desc: agent.desc,
    deck: agent.summary,
    games: agent.games,
    wins: agent.wins,
    losses: agent.losses,
    draws: agent.draws,
    points: agent.wins + agent.draws * 0.5,
    winRate: agent.games ? +(((agent.wins + agent.draws * 0.5) / agent.games) * 100).toFixed(2) : 0,
    avgSteps: agent.games ? +(agent.steps / agent.games).toFixed(1) : 0
  }))
  .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.avgSteps - b.avgSteps);

const run = {
  runAt: new Date().toISOString(),
  seeds: args.seeds,
  pairCount,
  totalGames,
  standings,
  errors
};

const outBase = path.resolve(ROOT, args.out);
fs.mkdirSync(path.dirname(outBase), { recursive: true });
fs.writeFileSync(`${outBase}.json`, JSON.stringify(run, null, 2));

const lines = [
  '# 12 模型 · 灵枢战纪颜色构筑轮 · 循环赛',
  '',
  `- 运行时间：${run.runAt}`,
  `- 规模：${ready.length} 个脚本，${pairCount} 对，每对每轮各先手一次，共 ${args.seeds} 轮 / ${totalGames} 局`,
  `- 计分：胜 1、平 0.5、负 0；按胜率排序，其次胜场，再次平均步数（少者优先）`,
  `- 失败脚本：${errors.length ? errors.map((e) => e.id).join('、') : '无'}`,
  '',
  '| 名次 | 模型 | 颜色 | 策略 | 局数 | 胜-负-平 | 胜率 | 平均步数 | 卡组 |',
  '|---:|---|---|---|---:|---|---:|---:|---|',
  ...standings.map((s, index) => `| ${index + 1} | ${s.model} | ${s.color} | ${s.strategy || '—'} | ${s.games} | ${s.wins}-${s.losses}-${s.draws} | ${s.winRate}% | ${s.avgSteps} | ${s.deck.total} 张 / ${s.deck.unique} 名目 |`),
  '',
  '## 各脚本卡组',
  '',
  ...standings.flatMap((s) => [
    `### ${s.model}（${s.color}）· ${s.name}`,
    '',
    `- 执行模型 ID：\`${s.modelId}\``,
    `- 策略：${s.strategy || '—'}`,
    `- 曲线：1–2 费 ${s.deck.curve['1-2']}｜3–4 费 ${s.deck.curve['3-4']}｜5–6 费 ${s.deck.curve['5-6']}｜7+ 费 ${s.deck.curve['7+']}`,
    `- 名目：${s.deck.names.join('、')}`,
    ''
  ]),
  ...(errors.length ? ['## 错误', '', ...errors.map((e) => `- ${e.id}：${e.error}`), ''] : [])
];
fs.writeFileSync(`${outBase}.md`, lines.join('\n'));

console.log('\n名次  模型                 颜色  胜率     胜-负-平    平均步数');
standings.forEach((s, index) => {
  console.log(`${String(index + 1).padStart(3)}  ${s.model.padEnd(20)} ${s.color}   ${String(s.winRate).padStart(6)}%  ${String(`${s.wins}-${s.losses}-${s.draws}`).padEnd(10)} ${s.avgSteps}`);
});
console.log(`\n结果已写入 ${path.relative(ROOT, outBase)}.json / .md`);
if (errors.length) process.exitCode = 2;
