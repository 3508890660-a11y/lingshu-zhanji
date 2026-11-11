#!/usr/bin/env node
/**
 * make-feedback-prompt.mjs —— 生成 12 份「仅胜率」反馈提示词，并校验一致性。
 *
 *   node tools/make-feedback-prompt.mjs
 *
 * 输入：agents/results-swiss.json 的 gameRate（每人自己那一份，不给别人）
 * 输出：agents/_uniform/feedback/<id>.txt ＋ 一致性校验
 *
 * 一致性定义：12 份除「你的上一轮胜率：X%」一行外逐字相同。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swiss = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents', 'results-swiss.json'), 'utf8'));

const TEMPLATE = `你在上一轮 12 模型对照里完成了自己的卡组与脚本。现在只给你一个反馈：你的胜率。

你的上一轮胜率：__RATE__%

这是唯一反馈——不提供对手、排名、其他卡组或任何对局细节，也不解释胜负原因。

请在同一份文件上做一次有依据的调整：
1. 先回看你自己的脚本与设计说明，找出你认为最可能拖低胜率的一两处（费用曲线、名目数、关键卡取舍、choose 的优先级、block/respond 的处理）。
2. 按自己的判断改：可以换卡、调曲线、改决策顺序、加或改 block 与 respond。不要因为胜率低就推翻整套思路——先判断是构筑问题还是执行问题。
3. 只改分配表指定的两个文件（脚本与设计说明），不改其他文件、不读未授权材料。
4. 改完只跑一次 node --check 与 agent-selftest 20 局，必须 errors=0 / short=0 / long=0。
5. 在设计说明末尾加一节「本轮调整」：改了哪几处、为什么、预期影响什么。

完成后一句话汇报：改了哪几处、两项检查结果。`;

const hash = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const normalize = (s) => s.replace(/你的上一轮胜率：[0-9.]+%/, '你的上一轮胜率：__RATE__%');

const outDir = path.join(ROOT, 'agents', '_uniform', 'feedback');
fs.mkdirSync(outDir, { recursive: true });

const rows = swiss.standings.map((s) => {
  const prompt = TEMPLATE.replace('__RATE__', Number(s.gameRate).toFixed(2));
  fs.writeFileSync(path.join(outDir, `${s.id}.txt`), prompt + '\n', 'utf8');
  return { id: s.id, rate: s.gameRate, sha: hash(normalize(prompt)) };
});

const base = rows[0].sha;
const report = {
  source: 'agents/results-swiss.json',
  field: 'gameRate（局胜率，仅本人）',
  allIdenticalExceptRateLine: rows.every((r) => r.sha === base),
  templateSha256: hash(TEMPLATE),
  seats: rows,
};
fs.writeFileSync(path.join(ROOT, 'agents', '_uniform', 'feedback-一致性校验.json'), JSON.stringify(report, null, 2) + '\n');

console.log('12 份反馈提示词已生成：' + outDir);
console.log('除胜率行外逐字相同：' + report.allIdenticalExceptRateLine);
for (const r of rows) console.log(r.id.padEnd(20), r.rate + '%');
if (!report.allIdenticalExceptRateLine) process.exitCode = 1;
