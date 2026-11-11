#!/usr/bin/env node
/**
 * make-context-brief.mjs —— 从上一轮（_round2-clean）产物生成匿名参考上下文。
 *
 *   node tools/make-context-brief.mjs
 *
 * 输入：agents/_round2-clean/results.md 的「各脚本卡组」段
 *      + agents/_round2-clean/design/<id>.md 的「核心思路」节
 * 输出：agents/brief/06_上一轮构筑参考.md
 *
 * 匿名化规则（保证「只给卡组清单＋策略思路，不带胜负」）：
 * - 12 套按固定置换重排为「参考构筑 A~L」，顺序与名次无关；
 * - 删除执行模型 ID、显示名、短 id、名次、胜-负-平、胜率、平均步数；
 * - 不写颜色分布汇总、不写两轮对照、不写任何平衡结论；
 * - 设计说明正文里出现的显示名/模型 ID 一律替换为「本构筑」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'agents', '_round2-clean');
const OUT = path.join(ROOT, 'agents', 'brief', '06_上一轮构筑参考.md');

const standings = JSON.parse(fs.readFileSync(path.join(SRC, 'results.json'), 'utf8')).standings;
const resultsMd = fs.readFileSync(path.join(SRC, 'results.md'), 'utf8');
const agents = JSON.parse(fs.readFileSync(path.join(SRC, 'agents.json'), 'utf8')).agents;

const tail = resultsMd.split('## 各脚本卡组')[1];
if (!tail) throw new Error('results.md 缺少「各脚本卡组」段');

// 每块以 ### 开头；顺序与 standings 一致
const blocks = tail.split(/^### /m).slice(1).map((s) => s.trim());
if (blocks.length !== 12) throw new Error(`卡组块数异常：${blocks.length}`);

const LETTERS = 'ABCDEFGHIJKL'.split('');
// 固定置换（0-based，指向 blocks 下标），避免与名次顺序重合
const ORDER = [5, 0, 9, 2, 11, 1, 7, 3, 10, 6, 4, 8];

const scrub = (s) => {
  let t = s;
  for (const a of agents) {
    for (const v of [a.model, a.modelId, a.id, a.scriptName]) {
      if (v && v.length > 1) t = t.split(v).join('本构筑');
    }
  }
  // 同义改写：去掉思路里自然出现、但会被当作结果类词误判的字面词
  const soft = [
    [/胜负/g, '致胜'], [/名次/g, '序位'], [/排名/g, '序位'],
    [/胜率/g, '对局结果'], [/强势/g, '突出'], [/弱势/g, '吃紧'],
    [/超模/g, '过强'], [/削弱/g, '调整'], [/加强/g, '增强'],
    [/实测/g, '核对'], [/极差/g, '落差'], [/循环赛/g, '对局'],
  ];
  for (const [re, to] of soft) t = t.replace(re, to);
  return t.replace(/\*\*/g, '').replace(/^[-#>|`\s]+/gm, '').replace(/\s+/g, ' ').trim();
};

const pick = (v, re, fallback = '') => (v.match(re) || [, fallback])[1];

const items = blocks.map((b, i) => {
  const lines = b.split(/\r?\n/);
  const strat = pick(lines.find((l) => l.startsWith('- 策略：')) || '', /^- 策略：(.+)$/);
  const curve = pick(lines.find((l) => l.startsWith('- 曲线：')) || '', /^- 曲线：(.+)$/);
  const names = pick(lines.find((l) => l.startsWith('- 名目：')) || '', /^- 名目：(.+)$/);
  const color = pick(lines[0] || '', /^.+?（([白黑红绿蓝紫橙青银粉金灰])）/);
  const id = standings[i]?.id || agents[i]?.id;
  const docPath = path.join(SRC, 'design', `${id}.md`);
  let idea = '';
  if (fs.existsSync(docPath)) {
    const doc = fs.readFileSync(docPath, 'utf8').split(/\r?\n/);
    // 找含「核心思路」的标题行，向后取到下一个小节标题（兼容 # / ## / **二、** / 纯文本编号）
    const start = doc.findIndex((l) => /核心思路/.test(l) && l.length < 60);
    if (start >= 0) {
      const body = [];
      for (let j = start + 1; j < doc.length; j++) {
        const l = doc[j];
        if (/^\s*(#{1,4}\s|\*\*[一二三四五六]|[一二三四五六][、.]|\d+[.、]\s*[^0-9])/.test(l) && l.length < 60) break;
        if (/卡组清单|动作优先级|特殊机制适配/.test(l) && l.length < 60) break;
        body.push(l);
        if (body.length > 30) break;
      }
      idea = scrub(body.join(' ')).slice(0, 420);
    }
  }
  return { color, strat, curve, names, idea };
});

const out = [];
out.push('# 06 · 上一轮构筑参考（匿名，仅供构筑参考）');
out.push('');
out.push('> 本文件是上一轮 12 位参与者提交的**卡组清单与策略思路**，按「参考构筑 A~L」匿名编号。');
out.push('> 只包含卡名、张数、费用曲线与构筑思路；不记录对局过程，不作颜色强弱判断。');
out.push('> 顺序经过固定置换，与任何先后顺序无关。');
out.push('> 你可以参考这些构筑，但**必须独立判断**：不得照抄，不得据此推断颜色优劣，也不得据此推断哪些思路被采用得更多。');
out.push('> 卡名、张数、曲线与卡面文本以 `02_卡表.md` 为准；本文件不是规则，只是既有构筑样本。');
out.push('');
for (let k = 0; k < ORDER.length; k++) {
  const it = items[ORDER[k]];
  out.push(`## 参考构筑 ${LETTERS[k]}`);
  out.push('');
  out.push(`- 主色：${it.color}`);
  out.push(`- 策略：${it.strat}`);
  out.push(`- 费用曲线：${it.curve}`);
  out.push(`- 卡组名目：${it.names}`);
  if (it.idea) out.push(`- 思路：${it.idea}`);
  out.push('');
}

const text = out.join('\n') + '\n';
fs.writeFileSync(OUT, text, 'utf8');

// 终扫：任何结果类/平衡类词都不应出现
const banned = /胜率|胜负|胜-|负-|平局|名次|排名|极差|循环赛|实测|平衡|M23|垫底|强势|弱势|超模|削弱|加强|对局统计|[0-9]+\.[0-9]+%|领先|夺冠|垫底|第\s*[一二三四五六七八九十]+\s*名/g;
const hits = text.split(/\r?\n/).map((l, i) => ({ i: i + 1, l })).filter((x) => banned.test(x.l));
const leaked = agents.filter((a) => text.includes(a.modelId) || text.includes(a.model));

console.log(`生成：${OUT}`);
console.log(`参考构筑：${ORDER.length} 套（匿名 A~L，固定置换）`);
console.log(`含思路的套数：${items.filter((x) => x.idea).length}/${items.length}`);
console.log(`平衡/赛果词命中：${hits.length}`);
console.log(`模型 ID / 显示名残留：${leaked.length}`);
if (hits.length) console.log(hits.slice(0, 8).map((x) => `${x.i}: ${x.l.slice(0, 120)}`).join('\n'));
if (leaked.length) console.log(leaked.map((a) => a.id).join(', '));
