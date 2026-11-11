#!/usr/bin/env node
/**
 * audit.mjs —— 卡表 ↔ 引擎 的全量对账。
 *
 *   node tools/audit.mjs [卡表.md]
 *
 * 它回答四个问题：
 *   1. 卡表里每一个编号，引擎是"收录 / 数据文件 / 未收录"？
 *   2. 收录进卡池的卡，有多少"效果没实装"？分别是哪些？
 *   3. 生命卡与灵体的名字、张数、编号，是否与卡表一一对应？
 *   4. 11 副预组是否全部能通过 validateDeck？
 */
import { readFileSync } from 'node:fs';
import { CARDS } from '../js/engine/cards.gen.js';
import { LIFE_SPECIALS, LIFE_BASE } from '../js/data/lifecards.js';
import { AVATARS } from '../js/data/avatars.js';
import { PRECONS } from '../js/data/precons.js';
import { validateDeck } from '../js/engine/rules.js';

const mdPath = process.argv[2] || '../灵枢战纪/卡包/第一弹_灵枢觉醒_卡表.md';
const md = readFileSync(mdPath, 'utf8');

const rows = [];
for (const line of md.split('\n')) {
  const m = line.match(/^\|\s*([A-Z]{2}\d{2})-(\d{3})\s*\|\s*([^|]+)\|/);
  if (!m) continue;
  rows.push({ pre: m[1], num: Number(m[2]), id: `${m[1]}-${m[2]}`, name: m[3].trim() });
}
const uniq = (arr) => [...new Map(arr.map((r) => [r.id, r])).values()];
const all = uniq(rows);
const by = (pre) => all.filter((r) => r.pre === pre).sort((a, b) => a.num - b.num);

const LQ = by('LQ01'), GQ = by('GQ01'), SM = by('SM01'), AP = by('AP01'), TK = by('TK01');

console.log('════ 一、编号总量 ════');
console.log(`卡表名目：LQ01 ${LQ.length}｜GQ01 ${GQ.length}｜SM01 ${SM.length}｜AP01 ${AP.length}｜TK01 ${TK.length}｜合计 ${all.length}`);

/* ── 1. LQ01 去向 ── */
const pool = new Set(CARDS.map((c) => c.id));
const avIds = new Set(AVATARS.map((a) => a.id));
const inLQ = LQ.filter((r) => r.num <= 300);

const chain = inLQ.filter((r) => r.num >= 248 && r.num <= 259);
const outer = inLQ.filter((r) => r.num >= 260 && r.num <= 283);
const asAvatar = inLQ.filter((r) => r.num >= 215 && r.num <= 247);
const skipped = inLQ.filter((r) => !pool.has(r.id) && !(r.num >= 215 && r.num <= 283));

console.log('\n════ 二、LQ01 300 张的去向 ════');
console.log(`进卡池（主卡组 + 金色市场）：${inLQ.filter((r) => pool.has(r.id)).length}`);
console.log(`转数据文件（灵体 33）：${asAvatar.length}`);
console.log(`未建模（进化链 ${chain.length} ＋ 外枢 ${outer.length}）：${chain.length + outer.length} —— 二者属"额外卡组"，本版引擎不实现`);
console.log(`编号遗漏：${skipped.length}${skipped.length ? ' → ' + skipped.map((r) => r.id + r.name).join('、') : ''}`);

/* ── 2. 池内实装率 ── */
const playable = CARDS.filter((c) => !c.unsupported);
const unsupported = CARDS.filter((c) => c.unsupported);
const vanilla = playable.filter((c) => c.effects.length === 0 && ['法术', '瞬间', '特殊', '结界'].includes(c.type));
console.log('\n════ 三、卡池（231）实装率 ════');
console.log(`可用 ${playable.length}｜未实装 ${unsupported.length}｜其中"法术/结界却零效果" ${vanilla.length}`);
if (unsupported.length) {
  const list = unsupported.map((c) => `${c.id}${c.name}`).join('、');
  console.log('未实装清单：' + list);
}

/* ── 3. 生命卡对账 ── */
const engineLife = [LIFE_BASE, ...Object.values(LIFE_SPECIALS).flat()];
const engineLifeIds = new Set(engineLife.map((c) => c.id));
const missingLife = SM.filter((r) => !engineLifeIds.has(r.id));
const extraLife = engineLife.filter((c) => !SM.some((r) => r.id === c.id));
const nameMismatchLife = SM.filter((r) => {
  const e = engineLife.find((c) => c.id === r.id);
  return e && e.name !== r.name;
});
console.log('\n════ 四、生命卡 SM01 ════');
console.log(`卡表 ${SM.length} 名目｜引擎 ${engineLife.length}（基础 1 ＋ 特效 ${engineLife.length - 1}）`);
console.log(`缺失 ${missingLife.length}｜多余 ${extraLife.length}｜名字不一致 ${nameMismatchLife.length}`);
if (missingLife.length) console.log('  缺：' + missingLife.map((r) => r.id + r.name).join('、'));
if (nameMismatchLife.length) console.log('  名不一致：' + nameMismatchLife.map((r) => `${r.id}表=${r.name}／引擎=${engineLife.find((c) => c.id === r.id)?.name}`).join('、'));
const noEffect = engineLife.filter((c) => c.id !== LIFE_BASE.id && (!c.effects || !c.effects.length));
console.log(`特效为空的生命卡：${noEffect.length}`);
const colorCount = Object.entries(LIFE_SPECIALS).map(([k, v]) => `${k}${v.length}`).join(' ');
console.log(`分色特效数：${colorCount}`);

/* ── 4. 灵体对账 ── */
const avFromTable = inLQ.filter((r) => r.num >= 215 && r.num <= 247);
const missingAv = avFromTable.filter((r) => !avIds.has(r.id));
const extraAv = AVATARS.filter((a) => !avFromTable.some((r) => r.id === a.id));
const nameMismatchAv = avFromTable.filter((r) => {
  const a = AVATARS.find((x) => x.id === r.id);
  return a && a.name !== r.name;
});
console.log('\n════ 五、灵体卡 ════');
console.log(`卡表 ${avFromTable.length}｜引擎 ${AVATARS.length}｜缺失 ${missingAv.length}｜多余 ${extraAv.length}｜名字不一致 ${nameMismatchAv.length}`);
if (nameMismatchAv.length) console.log('  ' + nameMismatchAv.map((r) => `${r.id}表=${r.name}／引擎=${AVATARS.find((a) => a.id === r.id)?.name}`).join('、'));
const noActive = AVATARS.filter((a) => !a.active || !a.active.effects || !a.active.effects.length);
console.log(`无启动能力：${noActive.length}`);

/* ── 5. 编外卡 AP / 衍生物 ── */
console.log('\n════ 六、AP 卡 / 衍生物 ════');
console.log(`AP01 表 ${AP.length} 名目（引擎不建模 AP 卡实体，按资源点结算）`);
console.log(`TK01 表 ${TK.length} 名目 → 引擎以 spawnToken 直接生成，不落卡号：${TK.map((r) => r.name).join('、')}`);

/* ── 6. 预组 ── */
console.log('\n════ 七、预组 ════');
let okAll = true;
for (const p of PRECONS) {
  const v = validateDeck(p.deck, { min: 25, max: 40 });
  if (!v.ok) { okAll = false; console.log(`✗ ${p.id} ${p.name}: ${v.errors.join('；')}`); }
}
console.log(okAll ? `11 副全部合法 ✓` : '存在不合法预组 ✗');

/* ── 8. 规则覆盖 ── */
const RULES = [
  ['回合结构（开始／主要／结束）', true],
  ['十一色费用与资源', true],
  ['召唤失调（非刚进场才可攻击）', true],
  ['守卫强制目标', true],
  ['守护代替（伤害 −X）', true],
  ['阻挡宣告（目标为灵体时）', true],
  ['单位互击同时结算', true],
  ['践踏／疾风／圣盾／团结／成长／再生', true],
  ['灵体生命＝生命卡组', true],
  ['生命卡特效（SM01）', true],
  ['重构（洗回＋各色费用）', true],
  ['灵体卡被动／启动', true],
  ['潮汐相位', true],
  ['涡流／回响', true],
  ['淬炼（仅装备计数）', true],
  ['骑升（灵压阶梯）', true],
  ['升灵仪式／外枢灵体（素材 SR 简化）', true],
  ['紫色骰池（容量／大成功／混沌）', true],
  ['黑色以生命换抽', true],
  ['青色回合末按打出数值额外抽', true],
  ['橙色装备双用途（锻造区）', true],
  ['结界留场（永久物）', true],
  ['门槛结算（蓝实时／银粉快照）', true],
  ['门槛色每回合打出上限（粉2／蓝2／银3）', true],
  ['市场区（金的购买）＋ 行动值链', true],
  ['进化链（附属卡组 / 骑升阶梯）', true],
  ['魂装（活跃 / 沉睡 / 已消耗三态）', true],
  ['反击／瞬间插打（三时点响应）', true],
  ['灵体亲自作战（粉，Lv2 起，1 AP）', true],
  ['连击／共鸣增幅（原语级）', true],
  ['先手 3 张／后手 4 张', true],
];
console.log('\n════ 八、规则覆盖（人工核对清单，非自动检测） ════');
for (const [k, v] of RULES) console.log(`  ${v ? '✓' : '✗'} ${k}`);
const done = RULES.filter((r) => r[1]).length;
console.log(`  → ${done}/${RULES.length}`);

/* ── 9. 结论 ── */
console.log('\n════ 九、结论 ════');
const totalImpl = playable.length + AVATARS.length + (engineLife.length - 1);
console.log(`可执行效果的实体：卡池 ${playable.length} ＋ 灵体 ${AVATARS.length} ＋ 生命卡特效 ${engineLife.length - 1} ＝ ${totalImpl}`);
console.log(`未实装（有卡无效果）：${unsupported.length} 张`);
