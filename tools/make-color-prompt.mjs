#!/usr/bin/env node
/**
 * make-color-prompt.mjs —— 生成 12 份「11 色评价」提示词，并校验一致性。
 *
 *   node tools/make-color-prompt.mjs
 *
 * 一致性定义：12 份除末尾「你的短 id：X」一行外逐字相同。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'agents.json'), 'utf8'));

const TEMPLATE = `你是职业集换式卡牌游戏（TCG）构筑选手，兼构筑分析师。

工作目录：F:/producing/novel/EX4以自创card game为主题/game_lq01
本轮第一阶段只做一件事：对《灵枢战纪》的 11 种颜色逐一评价。本阶段不组卡、不写脚本。

第一步：读 agents/brief/01_基本规则.md 与 agents/brief/02_卡表.md。这两份是你唯一的信息源。
第二步：对 白、黑、红、绿、蓝、紫、橙、青、银、粉、金 11 色各写一节，每节包含五项：
1. 资源机制：怎么产出、是否消耗、上限或门槛怎么走；
2. 胜利方式与节奏：几回合开始施压、靠什么收尾；
3. 关键卡 3~5 张：卡号、卡名、它在体系里的位置；
4. 结构性弱点：怕什么、被什么克制、什么情况下会空转；
5. 如果用它组 30 张：你会走什么曲线、多少个名目、哪些卡必带。
第三步：写一节「我的排序」，按你判断的构筑潜力给 11 色排序，并说明前三与后三的理由。

输出：只写 agents/color-reviews/__ID__.md 这一个文件，不改其他文件。
禁读：agents/design/、agents/agent-*.js、agents/color-reviews/ 下别人的文件、agents/results*.json 与 *.md、README.md、以及 灵枢战纪/ 下的卡表原文。
不要跑对局、不要联网、不要搜索全仓库。
完成后一句话汇报：你的排序前三与后三。`;

const hash = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const normalize = (s) => s
  .replace(/agents\/color-reviews\/[a-z0-9]+\.md/, 'agents/color-reviews/__ID__.md')
  .replace(/你的短 id：[a-z0-9]+/, '你的短 id：__ID__');

const outDir = path.join(ROOT, 'agents', '_uniform', 'color');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'agents', 'color-reviews'), { recursive: true });

const rows = manifest.agents.map((a) => {
  const prompt = TEMPLATE.replace('__ID__', a.id) + `\n你的短 id：${a.id}`;
  fs.writeFileSync(path.join(outDir, `${a.id}.txt`), prompt + '\n', 'utf8');
  return { id: a.id, model: a.modelId, sha: hash(normalize(prompt)) };
});

const base = rows[0].sha;
const report = {
  stage: 'color-review',
  allIdenticalExceptIdLine: rows.every((r) => r.sha === base),
  templateSha256: hash(TEMPLATE),
  seats: rows,
};
fs.writeFileSync(path.join(ROOT, 'agents', '_uniform', 'color-一致性校验.json'), JSON.stringify(report, null, 2) + '\n');

console.log('12 份评色提示词已生成：' + outDir);
console.log('除短 id 行外逐字相同：' + report.allIdenticalExceptIdLine);
for (const r of rows) console.log(r.id.padEnd(20), r.model);
if (!report.allIdenticalExceptIdLine) process.exitCode = 1;
