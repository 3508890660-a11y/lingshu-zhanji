#!/usr/bin/env node
/**
 * make-uniform-prompt.mjs —— 生成 12 份「同一提示词」并做输入一致性校验。
 *
 *   node tools/make-uniform-prompt.mjs
 *
 * 产出：
 *   agents/_uniform/prompts/<id>.txt  12 份审计副本
 *   agents/_uniform/一致性校验.json   逐字 diff 结果
 *   agents/agents.json                本轮目录初版（status=pending，赛后重建）
 *
 * 一致性定义：12 份提示词除最后一行「你的短 id：X」外逐字相同。
 * 校验方式：把该行统一替换为占位符后取 SHA-256，12 个哈希必须全等。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SEATS = [
  ['hy4', 'hy4', 'hy4std'],
  ['hy3', 'hy3', 'hy3'],
  ['glm53', 'GLM5.3', 'glm-5.3'],
  ['glm53flash', 'GLM5.3flash', 'glm-5.3-flash'],
  ['minimaxm3', 'MiniMax M3', 'minimax-m3-pay'],
  ['minimaxm31flash', 'MiniMax M3.1flash', 'minimax-m3.1-flash'],
  ['kimi31pro', 'KIMI 3.1pro', 'kimi-k3.1-pro'],
  ['kimi28preview', 'KIMI 2.8preview', 'kimi-k2.8-preview'],
  ['deepseekv41flash', 'deepseek v4.1flash', 'deepseek-v4.1-flash'],
  ['deepseekv4pro', 'deepseek v4pro', 'deepseek-v4-pro'],
  ['step5preview', 'step5preview', 'step-5-preview'],
  ['mimov26pro', 'MIMO-v2.6-pro', 'mimo-v2.6-pro'],
];

// 唯一模板。修改这里必须同步修改主代理 12 次 Agent 调用的 prompt 正文。
const TEMPLATE = `你是职业集换式卡牌游戏（TCG）构筑选手，兼构筑分析师与对局脚本工程师；本轮为《灵枢战纪》提交一份可直接加载的 AI 脚本。

工作目录：F:/producing/novel/EX4以自创card game为主题/game_lq01
本轮唯一任务书：agents/brief/05_统一任务书.md。另外 11 位参与者收到的这段文字与你完全相同，只有末尾「你的短 id：X」一行不同。

第一步：完整读 05_统一任务书.md，按第零节用你的短 id 查第八节分配表，得到显示名、模型 ID、脚本文件与设计说明文件的路径。
第二步：按 05 第四节的信息源清单读 01_基本规则.md、02_卡表.md、03_脚本接口.md、06_上一轮构筑参考.md。06 只是匿名构筑样本，可参考但必须独立判断：不得照抄、不得据此推断颜色优劣、不得据此推断哪些思路被采用得更多。
第三步：按 05 第一节的角色设定与第二节的任务目标，自行选 1 个主色（11 色任选；主代理不指定方向，也不回答「哪个色强」），构筑合规卡组，写 build(pool) + choose(view, moves)（可选 block）与六节中文设计说明。输出硬契约、禁读清单、5 条进度上报与自检命令一律以 05 为准。
第四步：只写分配表指定的两个文件，不改其他文件；先写脚本再写设计说明；完成后只跑一次 node --check 与 agent-selftest 20 局，必须 errors=0 / short=0 / long=0。不要跑循环赛、不要启动服务、不要读未授权材料、不要搜索全仓库、不要联网。

完成后一句话汇报：脚本路径、自选主色、策略名、两项检查结果。
你的短 id：__ID__`;

const hash = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const normalize = (s) => s.replace(/你的短 id：[^\n]+/g, '你的短 id：__ID__');

const outDir = path.join(ROOT, 'agents', '_uniform', 'prompts');
fs.mkdirSync(outDir, { recursive: true });

const prompts = SEATS.map(([id]) => TEMPLATE.replace('__ID__', id));
const normalized = prompts.map(normalize);
const baseHash = hash(normalized[0]);
const diffs = normalized.map((s, i) => ({ id: SEATS[i][0], same: hash(s) === baseHash }));

for (let i = 0; i < SEATS.length; i++) {
  fs.writeFileSync(path.join(outDir, `${SEATS[i][0]}.txt`), prompts[i] + '\n', 'utf8');
}

// 校验 05 分配表与本脚本 SEATS 完全同步
const brief05 = fs.readFileSync(path.join(ROOT, 'agents', 'brief', '05_统一任务书.md'), 'utf8');
const tableRows = brief05.split('## 八、任务分配表')[1].split('## 九、')[0]
  .split(/\r?\n/).filter((l) => /^\| `/.test(l))
  .map((l) => l.split('|').map((x) => x.trim().replace(/`/g, '')));
const tableIds = tableRows.map((r) => r[1]);
const tableMatch = tableIds.length === 12 && SEATS.every(([id, , modelId], i) =>
  tableIds[i] === id && tableRows[i][3] === modelId);

// 本轮目录初版
const manifest = {
  title: '12 模型 · 灵枢战纪统一提示词轮',
  note: '12 位收到同一提示词（仅末尾短 id 一行不同）、同一份 01/02/03/05/06 资料包；06 为上一轮匿名构筑参考（只含卡组清单与策略思路，不含任何对局结果）。第 12 位重新试用 mimo-v2.6-pro。',
  round: 'uniform',
  source: 'agents/brief/',
  uniformPrompt: true,
  agents: SEATS.map(([id, model, modelId]) => ({
    id, model, modelId, modelVerified: false,
    file: `agents/agent-${id}.js`, doc: `agents/design/${id}.md`,
    color: null, strategy: null, scriptName: null,
    status: 'pending', progress: 0,
  })),
};
fs.writeFileSync(path.join(ROOT, 'agents', 'agents.json'), JSON.stringify(manifest, null, 2) + '\n');

const report = {
  templateSha256: hash(TEMPLATE),
  normalizedSha256: baseHash,
  seatCount: SEATS.length,
  allIdenticalExceptSeatLine: diffs.every((d) => d.same),
  seats: diffs,
  brief05TableMatchesSeats: tableMatch,
  referenceContext: 'agents/brief/06_上一轮构筑参考.md',
};
fs.writeFileSync(path.join(ROOT, 'agents', '_uniform', '一致性校验.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`模板长度：${TEMPLATE.length} 字符`);
console.log(`归一化 SHA-256：${baseHash.slice(0, 16)}…`);
console.log(`12 份除身份行外逐字相同：${report.allIdenticalExceptSeatLine}`);
console.log(`05 分配表与 SEATS 一致：${tableMatch}`);
if (!report.allIdenticalExceptSeatLine || !tableMatch) process.exitCode = 1;
