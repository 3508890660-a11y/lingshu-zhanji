// 从卡表原文抽取「纯卡面」资料包，剔除全部平衡实测、模型参数与设计评注。
// 输出：agents/brief/02_卡表.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const srcPath = path.resolve(root, '../灵枢战纪/卡包/第一弹_灵枢觉醒_卡表.md');
const outPath = path.resolve(root, 'agents/brief/02_卡表.md');

const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);

// 保留区间（1-indexed，含端点）：编号规范 / 数值口径 / 十一色卡表正文 /
// 灰泛用包 / 预组 / 编外卡。其余（结论前置、总览、横向对照、
// 构筑校验、M23 参数对照、补写清单）一律不进资料包。
const ranges = [
  ['编号与稀有度规范', 40, 75],
  ['数值口径', 175, 194],
  ['卡表正文 · 十一色与额外卡表', 195, 689],
  ['灰色全色泛用包', 690, 742],
  ['预组 · 十一色入门组', 886, 1001],
  ['编外卡', 1002, 1093],
];

// 标题里混进的模型密度参数，重写为纯机制标题。
const titleFix = {
  195: '### 3.1 白色（18 张 · AP 制）',
  276: '### 3.4 绿色（18 张 · 法力＋地标）',
  309: '### 3.5 蓝色（18 张 · 手牌门槛）',
};

// 普通行里残留的强度评价（不在引用块内），逐条剔除。
const dropLine = (s) => /凶而不厚|根源，不是数值漏洞|胜负全在|起步死穴|赢不了竞速/.test(s);

// 中性改写：把「密度」这类模型用词换成纯卡位表述。
const rewriteLine = (s) => s.replace('- **AOE 与点杀的密度**', '- **AOE 与点杀的卡位**');

const BALANCE = /胜率|平衡|实测|极差|循环赛|M23|改版|护栏|校准|阈值|%|pp|垫底|峰值|空场率|均费|均长|对红|强势|弱势|SD|锁死|无效参数|阶跃|超模|削弱|加强|教训|模型参数|密度|占比/;

const chunks = [];
let quoteRemoved = 0;
let lineRemoved = 0;

for (const [label, a, b] of ranges) {
  const body = [];
  for (let i = a; i <= b; i++) {
    const raw = lines[i - 1];
    if (raw === undefined) continue;
    const s = titleFix[i] || raw;
    if (s.startsWith('>')) { quoteRemoved++; continue; }
    if (dropLine(s)) { lineRemoved++; continue; }
    body.push(rewriteLine(s));
  }
  // 去掉区间首尾空白行
  while (body.length && body[0].trim() === '') body.shift();
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  chunks.push(`<!-- 来源：卡表原文 ${a}~${b} 行 · ${label} -->\n\n${body.join('\n')}`);
}

const header = [
  '# 02 · 第一弹《灵枢觉醒》卡表（纯卡面）',
  '',
  '> 本文件只保留编号规范、数值口径、十一色卡面、灰色泛用包、预组清单与编外卡。',
  '> 本文件由卡表原文自动抽取，仅保留卡面与读法。',
  '> 卡面「关键词／效果」栏是完整规则文本，按字面理解即可。',
  '',
].join('\n');

const text = header + chunks.join('\n\n---\n\n') + '\n';
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, text, 'utf8');

const cardRows = lines.filter((l) => /^\|\s*(LQ01|GQ01|SM01|AP01|TK01|YD01)-/.test(l)).length;
const outCardRows = text.split('\n').filter((l) => /^\|\s*(LQ01|GQ01|SM01|AP01|TK01|YD01)-/.test(l)).length;
const residual = text.split('\n').filter((l) => BALANCE.test(l) && !l.startsWith('>') && !/^\|/.test(l));

console.log(JSON.stringify({
  out: outPath,
  sourceCardRows: cardRows,
  briefCardRows: outCardRows,
  quoteLinesRemoved: quoteRemoved,
  plainLinesRemoved: lineRemoved,
  balanceResidual: residual.length,
  residualSample: residual.slice(0, 8),
  bytes: Buffer.byteLength(text, 'utf8'),
}, null, 2));
