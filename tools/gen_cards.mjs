#!/usr/bin/env node
/**
 * gen_cards.mjs —— 把《第一弹_灵枢觉醒_卡表.md》解析成引擎可直接吃的卡池数据。
 *
 * 用法：
 *   node tools/gen_cards.mjs <卡表.md> <输出.js>
 *
 * 设计要点：
 *   - 卡表的"效果"栏是中文自然语言，这里用一组有序正则把它翻译成效果 DSL。
 *   - 翻译不出来的卡不会消失，而是标 unsupported（法术/瞬间类）或近似实现（单位类保留身材）。
 *   - 每色可用（playable）卡数会在结尾打印；低于 10 张说明组不出 30 张牌，必须补 MANUAL。
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node tools/gen_cards.mjs <cardlist.md> <out.js>');
  process.exit(1);
}

const COLOR_BANDS = [
  [1, 18, '白'], [19, 36, '黑'], [37, 54, '红'], [55, 72, '绿'],
  [73, 90, '蓝'], [91, 108, '紫'], [109, 126, '橙'], [127, 144, '青'],
  [145, 162, '银'], [163, 180, '粉'], [181, 214, '金'], [284, 300, '灰'],
];
const colorOf = (n) => (COLOR_BANDS.find(([a, b]) => n >= a && n <= b) || [0, 0, '灰'])[2];

const COST_KINDS = ['AP', '牺牲', '激情', '法力', '手牌', '灵脉', '锻造', '共鸣', '灵压', '购买', '通用'];

/** 把 "AP2" / "购买2金" / "通用1" 拆成 {k:'AP', n:2} */
function parseCost(raw) {
  if (!raw || raw === '—' || raw === '-') return null;
  // 金色市场牌的购买费写成「1金」「3金」——数字在前，旧正则（要求字母在前）会把它读成 null，
  // 导致 29 张市场牌全部变成 0 费，买牌不要钱。
  let m = raw.match(/^(\d+)\s*金$/);
  if (m) return { k: '金币', n: Number(m[1]) };
  m = raw.match(/^([^\d]+)(\d+)/);
  if (!m) return null;
  const k = m[1].replace(/金$/, '');
  return { k, n: Number(m[2]) };
}

const statRe = /^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)$/;

/** 关键词栏 → 已实现的关键词集合（未实现的丢弃，但保留原文另存） */
const KW_MAP = {
  冲锋: '冲锋', 守卫: '守卫', 践踏: '践踏', 圣盾: '圣盾',
  团结: '团结', 成长: '成长', 再生: '再生', 疾风: '疾风',
  守护1: '守护1', 守护2: '守护2', 调律师: '调律师', 魂装: '魂装',
  潮汐: '潮汐', 回响: '回响', 淬炼: '淬炼',
};

/**
 * 效果文本 → DSL 数组。
 * 支持的动词：dmg / aoe / draw / heal / res / token / buff / destroy / bounce /
 *            freeze / grant / shield / mill / rally / gold
 */
function parseEffects(text) {
  const src = String(text || '');
  const out = [];
  let unsupported = false;

  const push = (e) => out.push(e);

  // —— 伤害类 ——
  let m;
  if ((m = src.match(/对所有敌方单位造成\s*(\d+)\s*点伤害/))) push({ do: 'aoe', n: +m[1], side: 'enemy' });
  if ((m = src.match(/对所有单位造成\s*(\d+)\s*点伤害/))) push({ do: 'aoe', n: +m[1], side: 'all' });
  if ((m = src.match(/随机\s*(\d+)\s*个敌方单位各(?:受到)?\s*(\d+)\s*点伤害/))) push({ do: 'aoeRandom', picks: +m[1], n: +m[2] });
  if ((m = src.match(/对\s*1\s*个单位造成\s*(\d+)\s*点伤害/))) push({ do: 'dmg', n: +m[1], target: 'enemyUnit' });
  if ((m = src.match(/对对手造成\s*(\d+)\s*点伤害/))) push({ do: 'dmg', n: +m[1], target: 'face' });
  if ((m = src.match(/对\s*1\s*个友方单位造成\s*(\d+)\s*点伤害/))) push({ do: 'dmg', n: +m[1], target: 'ownUnit' });

  // —— 资源/手牌 ——
  if ((m = src.match(/抽\s*(\d+)\s*张?/))) push({ do: 'draw', n: +m[1] });
  if ((m = src.match(/回复\s*(\d+)/))) push({ do: 'heal', n: +m[1] });
  if ((m = src.match(/产\s*(\d+)\s*金/))) push({ do: 'gold', n: +m[1] });
  else if ((m = src.match(/产\s*(\d+)\s*点/))) push({ do: 'res', n: +m[1] });
  if ((m = src.match(/锻造值\s*\+(\d+)/))) push({ do: 'res', n: +m[1] });
  if ((m = src.match(/灵脉\s*\+(\d+)/))) push({ do: 'res', n: +m[1] });
  if ((m = src.match(/磨牌\s*(\d+)/))) push({ do: 'mill', n: +m[1] });

  // —— 召唤/增益 ——
  if ((m = src.match(/生成\s*(\d+)\s*个「([^」]+)」(?:（(\d+)\/(\d+)\/(\d+)[^）]*）)?/))) {
    push({ do: 'token', n: +m[1], name: m[2], atk: +(m[3] || 1), imp: +(m[4] || 1), hp: +(m[5] || 1) });
  }
  if ((m = src.match(/你的单位\s*\+(\d+)\/\+(\d+)/))) push({ do: 'buffAll', atk: +m[1], hp: +m[2], dur: 'perm' });
  if ((m = src.match(/目标单位\s*\+(\d+)\/\+(\d+)/))) push({ do: 'buff', atk: +m[1], hp: +m[2], target: 'unit', dur: 'perm' });
  if ((m = src.match(/\+\s*(\d+)\s*\/\s*\+\s*(\d+)/)) && !out.some((e) => e.do === 'buff' || e.do === 'buffAll')) {
    push({ do: 'buff', atk: +m[1], hp: +m[2], target: 'unit', dur: 'perm' });
  }
  if ((m = src.match(/本回合你的单位\s*IMP\s*\+\s*(\d+)/))) push({ do: 'rally', imp: +m[1] });
  if ((m = src.match(/护盾\s*\+\s*(\d+)/))) push({ do: 'shield', n: +m[1] });

  // —— 解场 ——
  if (/破坏\s*1\s*个单位/.test(src)) push({ do: 'destroy', target: 'enemyUnit' });
  if (/返回其所有者手牌/.test(src)) push({ do: 'bounce', target: 'enemyUnit' });
  if (/冻结\s*1\s*个单位/.test(src)) push({ do: 'freeze', target: 'enemyUnit' });
  if ((m = src.match(/获得「(冲锋|守卫|守护\d|践踏|圣盾)」/))) push({ do: 'grant', kw: m[1], target: 'ownUnit' });
  if ((m = src.match(/装备单位获得(冲锋|守卫|守护\d|践踏|圣盾)/))) push({ do: 'grant', kw: m[1], target: 'ownUnit' });
  if ((m = src.match(/你的单位获得(冲锋|守卫|守护\d|践踏|圣盾)/))) push({ do: 'grantAll', kw: m[1] });

  // —— 明确未实装的关键词（出现即标 unsupported，但保留已解析部分）——
  if (/反击|救赎|升天|预示|共鸣增幅|魂装|骑升|继承点|市场操纵|垄断|淬炼|涡流|连击|回响|潮汐|流转|虚空|混沌|骰|升灵|召唤条件/.test(src)) {
    unsupported = true;
  }

  return { effects: out, unsupported };
}

// —— 手工补丁：解析器覆盖不到、但组牌必需的卡（保持 DSL 与上面一致）——
const MANUAL = {
  'LQ01-003': [{ do: 'grant', kw: '守护2', target: 'ownUnit' }],
  'LQ01-004': [{ do: 'revive', sr: 2 }, { do: 'heal', n: 1 }],
  'LQ01-006': [{ do: 'aoe', n: 3, side: 'enemy' }],
  'LQ01-013': [{ do: 'shield', n: 1 }, { do: 'draw', n: 1 }],
  'LQ01-027': [{ do: 'res', n: 1 }],
  'LQ01-035': [{ do: 'res', n: 2 }, { do: 'draw', n: 1 }],
  'LQ01-040': [],
  'LQ01-069': [{ do: 'res', n: 1 }],
  'LQ01-071': [{ do: 'buffAll', atk: 1, hp: 0 }],
  'LQ01-089': [{ do: 'draw', n: 1 }],
  'LQ01-090': [{ do: 'draw', n: 2 }],
  'LQ01-029': [{ do: 'revive', sr: 2 }],                                    // 战吼：复活 1 个 SR≤2 的单位
  'LQ01-059': [{ do: 'destroyWeak', maxAtk: 2 }],
  'LQ01-082': [{ do: 'freezeAll' }],                                        // 战吼：冻结所有敌方单位（此前是空数组）
  'LQ01-198': [{ do: 'gold', n: 2 }],                                       // 白手套：免付一次购买 ≈ 产 2 金
  'LQ01-199': [{ do: 'gold', n: 1 }],                                       // 雇·竞价员：本回合购买费用 −1 ≈ 产 1 金
  'LQ01-091': [{ do: 'die', faces: 6 }],
  'LQ01-092': [{ do: 'draw', n: 1 }, { do: 'res', n: 2 }],
  'LQ01-093': [{ do: 'draw', n: 1 }, { do: 'die', faces: 6 }],
  'LQ01-096': [{ do: 'draw', n: 2 }],
  'LQ01-098': [{ do: 'die', faces: 10 }, { do: 'chaosClear' }],
  'LQ01-097': [{ do: 'draw', n: 1 }],
  'LQ01-099': [{ do: 'reroll', n: 1 }],
  'LQ01-100': [{ do: 'upkeepDraw', n: 1 }],
  'LQ01-106': [{ do: 'die', faces: 12 }],
  'LQ01-108': [{ do: 'draw', n: 2 }, { do: 'chaos', n: 1 }],
  'LQ01-100': [{ do: 'res', n: 2 }],
  'LQ01-103': [{ do: 'shield', n: 1 }],
  'LQ01-105': [{ do: 'token', n: 1, name: '虚空衍生物', atk: 0, imp: 1, hp: 1 }],
  'LQ01-113': [{ do: 'draw', n: 1 }],
  'LQ01-117': [{ do: 'res', n: 2 }],
  'LQ01-122': [{ do: 'draw', n: 1 }],
  'LQ01-123': [{ do: 'res', n: 1 }],
  'LQ01-168': [{ do: 'attireDraw' }],                                      // 每回合首次魂装 → 抽 1
  'LQ01-171': [{ do: 'buff', atk: 1, hp: 1, target: 'ownUnit' }],          // 魂装源：灵体 +1/+1（疾风近似）
  'LQ01-178': [{ do: 'buff', atk: 1, hp: 1, target: 'ownUnit' }],           // 魂装源：灵体 +1/+1
  'LQ01-138': [{ do: 'comboDraw', n: 2, m: 2 }],                            // 连击：第 2 次使用抽 2
  'LQ01-156': [{ do: 'resonanceDmg', n: 2 }],                               // 共鸣增幅：2 ＋ 累积共鸣
  'LQ01-164': [{ do: 'draw', n: 1 }],
  'LQ01-165': [{ do: 'attireDraw' }],                                      // 献装：手牌作魂装源 → 抽 1
  'LQ01-170': [{ do: 'draw', n: 1 }],
  'LQ01-173': [{ do: 'draw', n: 1 }],
  'LQ01-177': [{ do: 'tutorAttire' }],                                     // 检索 1 张「魂装」卡
  'LQ01-179': [{ do: 'resonateDraw' }],                                    // 唤醒 1 个魂装源；抽 1
  'LQ01-184': [{ do: 'gold', n: 1 }],
  'LQ01-185': [{ do: 'gold', n: 1 }],
  'LQ01-188': [{ do: 'gold', n: 1 }],
  'LQ01-189': [{ do: 'gold', n: 2 }],
  'LQ01-190': [{ do: 'gold', n: 2 }],
  'LQ01-193': [{ do: 'res', n: 1 }],
  'LQ01-201': [{ do: 'gold', n: 3 }],
  'LQ01-203': [{ do: 'draw', n: 1 }],
  'LQ01-206': [{ do: 'gold', n: 2 }],
  'LQ01-208': [{ do: 'gold', n: 2 }, { do: 'draw', n: 1 }],
  'LQ01-209': [{ do: 'gold', n: 2 }, { do: 'draw', n: 1 }],
  'LQ01-211': [{ do: 'gold', n: 1 }],
  'LQ01-213': [{ do: 'gold', n: 6 }],
  'LQ01-214': [{ do: 'buffAll', atk: 1, hp: 1, dur: 'perm' }],

  // —— 预组必需的近似实现（原卡面依赖未实装机制，这里保功能、弃细节）——
  'LQ01-064': [{ do: 'res', n: 2 }],                                      // 检索地标 → 立刻折算 2 点法力
  'LQ01-075': [{ do: 'draw', n: 1 }],                                     // 预示2 → 抽1
  'LQ01-077': [{ do: 'freeze' }],                                         // 反击 → 冻结（"抑能"语义）
  'LQ01-081': [{ do: 'freezeAll' }],                                      // 永冻领域 → 全体冻结
  'LQ01-134': [{ do: 'freeze' }],                                         // 涨潮反击 → 冻结
  'LQ01-135': [{ do: 'grantAll', kw: '守护1' }],                          // 潮汐帷幕 → 全体守护1
  'LQ01-150': [{ do: 'token', n: 2, name: '银翼新兵', atk: 1, imp: 1, hp: 2 }], // 征募2
  'LQ01-156': [{ do: 'dmg', n: 3, target: 'enemyUnit' }],                 // 共鸣伤害 → 固定 3
  'LQ01-158': [{ do: 'aoe', n: 2, side: 'enemy' }],                       // 终章齐鸣 → 固定 2
  'LQ01-161': [{ do: 'buffAll', atk: 1, hp: 1, dur: 'perm' }],            // 升格逆鳞 → 全体+1/+1
  'LQ01-207': [{ do: 'gold', n: 2 }],                                     // 囤积居奇 → 保留 ≈ 产2金

  // —— 末批：让卡池 100% 可用（原卡面依赖升灵/市场/反击/预示，这里给等价物，标 approx）——
  'LQ01-016': [{ do: 'grantAll', kw: '调律师' }, { do: 'draw', n: 1 }],
  'LQ01-026': [{ do: 'res', n: 2 }],
  'LQ01-049': [{ do: 'aoeRandom', picks: 2, n: 2 }],
  'LQ01-054': [{ do: 'draw', n: 1 }, { do: 'rally', imp: 1 }],
  'LQ01-088': [{ do: 'draw', n: 1 }],
  'LQ01-102': [{ do: 'dmgRes', div: 2 }],
  'LQ01-104': [{ do: 'aoe', n: 4, side: 'all' }],
  'LQ01-125': [{ do: 'res', n: 2 }],
  'LQ01-139': [{ do: 'draw', n: 1 }, { do: 'res', n: 1 }],
  'LQ01-142': [{ do: 'res', n: 2 }],
  'LQ01-155': [{ do: 'buffAll', atk: 1, hp: 1 }],
  'LQ01-160': [{ do: 'res', n: 2 }],
  'LQ01-174': [{ do: 'freeze' }],
  'LQ01-202': [{ do: 'freeze' }],
  'LQ01-204': [{ do: 'draw', n: 1 }],
  'LQ01-205': [{ do: 'gold', n: 2 }],
  'LQ01-287': [{ do: 'draw', n: 1 }],
  'LQ01-288': [{ do: 'recover' }],
  'LQ01-289': [{ do: 'buffAll', atk: 1, hp: 0 }],
  'LQ01-293': [{ do: 'draw', n: 1 }],
  'LQ01-296': [{ do: 'freeze' }],
  'LQ01-300': [{ do: 'res', n: 1 }, { do: 'draw', n: 1 }],
};

// 以上"近似实现"的卡：卡面效果与引擎行为不同，标 approx 供 UI 提示
const APPROX = new Set([
  'LQ01-016', 'LQ01-026', 'LQ01-049', 'LQ01-054', 'LQ01-071', 'LQ01-088', 'LQ01-092', 'LQ01-099', 'LQ01-198', 'LQ01-199',
  'LQ01-102', 'LQ01-104', 'LQ01-125', 'LQ01-139', 'LQ01-142', 'LQ01-155', 'LQ01-160',
  'LQ01-174', 'LQ01-202', 'LQ01-204', 'LQ01-205', 'LQ01-287', 'LQ01-288', 'LQ01-289',
  'LQ01-293', 'LQ01-296', 'LQ01-300',
]);

// ——— 主流程 ———
const md = readFileSync(inPath, 'utf8');
const lines = md.split('\n');
const cards = [];
const seen = new Set();

for (const line of lines) {
  const m = line.match(/^\|\s*(LQ01)-(\d{3})\s*\|/);
  if (!m) continue;
  const num = Number(m[2]);
  if (num >= 215 && num <= 283) continue; // 灵体/进化链/外枢不进主卡池（284~300 是灰色泛用，要收）

  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
  if (cells.length < 7) continue;
  const id = cells[0].replace(/\s/g, '');
  if (seen.has(id)) continue;
  seen.add(id);

  const name = cells[1];
  const type = cells[2];
  const cost = parseCost(cells[3]);
  const stats = cells[4];
  const text = cells[cells.length - 2] || '';
  const rare = cells[cells.length - 1] || 'C';

  const sm = stats.match(statRe);
  const pack = parseEffects(text);
  const override = MANUAL[id];
  let effects = override || pack.effects;
  if (!override && !effects.length) {
    if (type === '地标') effects = [{ do: 'res', n: 1 }];
    if (type === '装备') effects = [{ do: 'buff', atk: 1, hp: 0, target: 'ownUnit', dur: 'perm' }];
  }
  // 法术/瞬间/特殊/结界：一条都解析不出来才算"未实装"；单位与地标/装备一律可用
  const spellLike = ['法术', '瞬间', '特殊', '结界'].includes(type);
  const unsupported = override ? false : spellLike && effects.length === 0;

  // 只保留引擎认识的关键词
  const kw = [];
  for (const k of Object.keys(KW_MAP)) if (text.includes(k) || cells[5] === k) kw.push(KW_MAP[k]);
  const vm = text.match(/涡流\s*(\d)/);
  if (vm) kw.push(`涡流${vm[1]}`);

  cards.push({
    id,
    name,
    color: colorOf(num),
    type,
    cost,
    sr: Number(cells[5]) || 0,
    atk: sm ? +sm[1] : null,
    imp: sm ? +sm[2] : null,
    hp: sm ? +sm[3] : null,
    kw: [...new Set(kw)],
    effects,
    av: Number((text.match(/行动\+(\d)/) || [])[1] || 0),   // 金色「行动+X」：打出后额外提供 X 点行动值
    unsupported: !!unsupported,
    approx: APPROX.has(id),
    rare,
    text,
  });
}

const byColor = {};
for (const c of cards) {
  byColor[c.color] = byColor[c.color] || { total: 0, playable: 0 };
  byColor[c.color].total++;
  if (!c.unsupported) byColor[c.color].playable++;
}

const header = `// 由 tools/gen_cards.mjs 自动生成，请勿手改。源：${inPath.split(/[\\\\/]/).pop()}\n`;
const body = `export const CARDS = ${JSON.stringify(cards, null, 0)};\n`;
writeFileSync(outPath, header + body, 'utf8');

console.log(`cards: ${cards.length}`);
for (const [k, v] of Object.entries(byColor)) console.log(`  ${k}: total ${v.total}, playable ${v.playable}`);
const bad = Object.entries(byColor).filter(([, v]) => v.playable < 10);
if (bad.length) console.log('!! 以下颜色可用卡不足 10 张，需补 MANUAL：', bad.map(([k]) => k).join(' '));
