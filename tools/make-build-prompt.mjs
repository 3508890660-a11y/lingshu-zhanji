#!/usr/bin/env node
/**
 * make-build-prompt.mjs —— 生成 12 份「阶段 B：组卡与脚本」提示词，并校验一致性。
 *
 *   node tools/make-build-prompt.mjs
 *
 * 与阶段 A（评色）的关键差别：
 *   - 阶段 B 是**新开的 subagent**，不继承评色会话的上下文；
 *   - 唯一先验是它自己那份 agents/color-reviews/<id>.md；
 *   - 提示词里不出现任何胜率、排名、对手信息。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'agents.json'), 'utf8'));

const TEMPLATE = `你是职业集换式卡牌游戏（TCG）构筑选手，兼对局脚本工程师。

工作目录：F:/producing/novel/EX4以自创card game为主题/game_lq01
本阶段是第二阶段：你（同一个模型）在另一个会话里已经完成了一份 11 色评价，现在要基于那份评价做决策。

第一步：读你自己的评价 agents/color-reviews/__ID__.md；再读 agents/brief/01_基本规则.md、02_卡表.md、03_脚本接口.md。
第二步：从 11 色里选 1 个主色。选色依据必须引用你自己评价里的具体结论——可以选评价里排第一的，也可以不选，但要说明为什么。
第三步：构筑 30 张（同名 ≤3、25~40 张、只用主色池与灰色泛用），写 build(pool) + choose(view, moves) + block(view, bmoves)，可选 respond(view, ctx, moves)。动作集、view 字段与自检命令一律以 03 为准。
第四步：写六节中文设计说明：颜色与卡组构想 / 核心思路 / 卡组清单与曲线 / 动作优先级 / 特殊机制适配 / 取舍与已知弱点。
第五步：只写 agents/agent-__ID__.js 与 agents/design/__ID__.md 两个文件；先写脚本再写说明；完成后只跑一次 node --check 与 agent-selftest 20 局，必须 errors=0 / short=0 / long=0。不要跑循环赛、不要启动服务。

禁读：agents/design/ 与 agents/agent-*.js 下别人的文件、agents/color-reviews/ 下别人的文件、agents/results*.json 与 *.md、README.md、agents/_round*/、以及 灵枢战纪/ 下的卡表原文。
不要联网、不要搜索全仓库。

完成后一句话汇报：主色、策略名、选色依据（一句）、两项检查结果。
你的短 id：__ID__`;

const hash = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const normalize = (s) => s.replace(/__ID__/g, '__ID__');

const outDir = path.join(ROOT, 'agents', '_uniform', 'build');
fs.mkdirSync(outDir, { recursive: true });

const rows = manifest.agents.map((a) => {
  const prompt = TEMPLATE.split('__ID__').join(a.id);
  fs.writeFileSync(path.join(outDir, `${a.id}.txt`), prompt + '\n', 'utf8');
  return { id: a.id, model: a.modelId, sha: hash(normalize(prompt.split(a.id).join('__ID__'))) };
});

const base = rows[0].sha;
const report = {
  stage: 'build',
  allIdenticalExceptId: rows.every((r) => r.sha === base),
  containsWinRate: TEMPLATE.includes('胜率') || TEMPLATE.includes('排名'),
  templateSha256: hash(TEMPLATE),
  seats: rows,
};
fs.writeFileSync(path.join(ROOT, 'agents', '_uniform', 'build-一致性校验.json'), JSON.stringify(report, null, 2) + '\n');

console.log('12 份组卡提示词已生成：' + outDir);
console.log('除 id 外逐字相同：' + report.allIdenticalExceptId);
console.log('含胜率/排名字样：' + report.containsWinRate);
for (const r of rows) console.log(r.id.padEnd(20), r.model);
if (!report.allIdenticalExceptId) process.exitCode = 1;
