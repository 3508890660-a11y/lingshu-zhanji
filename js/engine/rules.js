/**
 * rules.js —— 《灵枢战纪》无头规则引擎（v0.1 小游戏版）
 *
 * 三条设计原则：
 *   1. **无头**：不碰 DOM，纯函数式推进，可在 Node 与浏览器里跑同一份代码。
 *   2. **确定性**：所有随机走 LCG + 固定种子，同种子同卡组必然复现同一局。
 *   3. **合法动作枚举**：脚本不直接改状态，只能从引擎给出的 moves 里挑一个。
 *      —— 这条是"脚本不能作弊"的唯一保障，也是接口能做得极简的原因。
 */
import { CARDS } from './cards.gen.js';
import { buildLifeDeck, LIFE_BASE } from '../data/lifecards.js';
import { GOLD_MARKET } from '../data/market.js';
import { AVATAR_BY_ID, defaultAvatar } from '../data/avatars.js';
import { ascendantsFor } from '../data/ascendants.js';
import { evolutionFor } from '../data/evolutions.js';

export const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

const THRESHOLD_KINDS = new Set(['激情', '手牌', '共鸣', '灵压']);
export const RES_NAME = {
  白: 'AP', 黑: '牺牲', 红: '激情', 绿: '法力', 蓝: '手牌', 紫: '灵脉',
  橙: '锻造', 青: '法力', 银: '共鸣', 粉: '灵压', 金: '金币', 灰: '通用',
};

export class Rng {
  constructor(seed = 1) { this.s = (seed >>> 0) || 1; }
  next() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  int(n) { return Math.floor(this.next() * n); }
  pick(arr) { return arr[this.int(arr.length)]; }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}

const isLand = (c) => c && c.type === '地标';
/** 可进牌库／弃牌区的卡：必须能在 BY_ID 里查到。
 *  衍生物（'TOKEN'）与外枢灵体（LQ01-260~283，不在主卡池）都不算——
 *  旧版把它们推进弃牌区，重构洗回牌库后抽成手里的永久死卡。 */
const deckable = (id) => BY_ID.has(id);
const STACK_LIMIT = 3;   // 同名牌上限
/** 例外：金色的固定初始牌库规则强制「制式铜币×4」，这是套装预置而非构筑选择 */
export const STACK_EXEMPT = new Map([['LQ01-181', 4]]);
const DECK_SIZE = 30;

/* ────────────────────────────── 卡组校验 ────────────────────────────── */

export function validateDeck(list, opts = {}) {
  const errors = [];
  if (!Array.isArray(list)) return { ok: false, errors: ['卡组必须是数组'] };
  const total = list.reduce((s, x) => s + (x.n || 0), 0);
  const min = opts.min ?? DECK_SIZE;
  const max = opts.max ?? 40;
  const colors = new Set();
  for (const it of list) {
    const c = BY_ID.get(it.id);
    if (!c) { errors.push(`未知卡号 ${it.id}`); continue; }
    if (it.n > (STACK_EXEMPT.get(it.id) ?? STACK_LIMIT)) errors.push(`【${c.name}】${it.n} 张，超过同名牌上限 ${STACK_EXEMPT.get(it.id) ?? STACK_LIMIT}`);
    if (it.n < 1) errors.push(`【${c.name}】张数必须 ≥1`);
    if (c.unsupported) errors.push(`【${c.name}】的效果本版未实装`);
    if (c.color !== '灰') colors.add(c.color);
  }
  if (colors.size > 1) errors.push(`混色：${[...colors].join('／')}（灰色可与任意主色共存）`);
  const color = [...colors][0] || '灰';
  // 规则 5.9：金色主卡组是**10 张固定初始牌库（181~185）**，市场牌库（186~214）是额外卡组，
  // 只能通过「购买」获得。旧版允许把 29 张市场牌直接塞进主卡组，等于跳过整条金币经济白嫖。
  if (color === '金') {
    const illegal = list.filter((it) => {
      const num = Number(String(it.id).slice(5));
      return !(num >= 181 && num <= 185);
    });
    if (illegal.length) {
      errors.push(`金的主卡组只能是 181~185 的 10 张固定牌（市场牌库属额外卡组，需在场上购买）：${illegal.map((x) => x.id).join('、')}`);
    }
  }
  // 规则 5.9 的例外：**金色主卡组只有 10 张固定牌**（市场牌库是额外卡组，靠购买获得）。
  // 旧版把这条写成了「total ≤ 10 就放行」，与颜色无关 —— 一副 10 张的红卡组也能过校验。
  if (color === '金') {
    // 金的固定初始牌库就是 10 张，多一张少一张都不成立
    if (total !== 10) errors.push(`金的主卡组必须是 10 张固定牌（当前 ${total} 张）`);
  } else if (total < min || total > max) {
    errors.push(`张数 ${total} 不在 ${min}~${max} 之间`);
  }
  return { ok: errors.length === 0, errors, total, color };
}

/** 把 [{id,n}] 展开成卡号数组并洗牌 */
function expandDeck(list, rng) {
  const deck = [];
  for (const it of list) for (let i = 0; i < it.n; i++) deck.push(it.id);
  return rng.shuffle(deck);
}

/* ────────────────────────────── 建局 ────────────────────────────── */

let UID = 1;

function newPlayer(idx, color, deckList, rng, name, avatar) {
  const deck = expandDeck(deckList, rng);
  const av = (typeof avatar === 'string' ? AVATAR_BY_ID.get(avatar) : avatar) || defaultAvatar(color);
  const p = {
    // 默认名用「颜色＋方」，不再固定叫「红方／蓝方」——旧默认名让日志里根本分不清谁是谁
    // （曾导致统计脚本用「红【」匹配同色玩家时恒得 0，差点写出错误结论）
    idx, color, avatar: av, name: name || `${color}方`,
    lifeDeck: buildLifeDeck(color, rng), damage: [], lifeSpent: new Set(),
    deck, hand: [], board: [], lands: [], grave: [],
    res: 0, turnCount: 0, playsThisTurn: 0, spiritLv: 0,
    // 粉色专属（规则 1.1 / 5.11）：解放区进化链、魂装源、骑升与灵体作战计数
    evolution: av.color === '粉' ? evolutionFor(av.id) : [],
    souls: [], soulGrave: [], rideUsed: 0, avatarAtkUsed: 0,
    awakenUsed: 0, resonateUsed: 0, avatarTempAtk: 0,
    soulBurn: 0, soulDiscount: 0, soulHeal: 0, soulCapBonus: 0, soulAura: 0, soulLegend: 0,
    ap: 2, apMax: 2,   // 规则 5.11 副机制：粉色 AP（初始 2，每次骑升 +1，上限 4）
    fatigue: 0, script: null, tide: '涨', quench: 0, resonance: 0,
    dice: [], chaos: 0, crit: 0, critPaid: 0, rerolls: 0, forge: [], perms: [], av: 1,
    outer: ascendantsFor(color).map((a) => ({ ...a, used: false, returned: 0 })),
    exile: [],   // 除外区：外枢灵体用尽回归次数、或被「除外」类效果移出本局
    avatarUsed: false, lifeDrawn: false, deathDrawn: false,
  };
  return p;
}

/** 灵体生命 ＝ 生命卡组剩余张数 */
const lifeOf = (p) => p.lifeDeck.length;

/**
 * 对灵体造成 n 点伤害：逐张把生命卡从卡组顶移入损伤区，特效卡各触发一次。
 * 生命卡的特效可能再次造成伤害（红/黑/紫/粉各有一张），用 g.lifeChain 限制递归深度。
 */
function damageFace(g, p, n) {
  // 规则 3.3：「灵体护盾X／伤害减免X」**仅削减移卡数量**。
  // 旧版只加不减（p.shield 从未被消费），所有护盾卡都是空转。
  let left = n;
  if ((p.shield || 0) > 0 && left > 0) {
    const absorbed = Math.min(p.shield, left);
    p.shield -= absorbed;
    left -= absorbed;
    g.log.push(`　${p.name} 灵体护盾抵消 ${absorbed} 点（余 ${p.shield}）`);
  }
  for (let i = 0; i < left; i++) {
    const card = p.lifeDeck.pop();
    if (!card) break;
    p.damage.push(card);
    if ((p.avatar?.passive || []).some((e) => e.t === 'lifeDraw') && !p.lifeDrawn) {
      p.lifeDrawn = true;
      drawCard(g, p, true);
    }
    // 特效生命卡**每张每局只触发一次**。
    // 否则「受伤→触发回血→回复把这张卡放回卡组底→再受伤→再触发」会构成无限回血环
    // （实测红方靠一张【赤棘鳞甲】在第 24 轮仍是满血 20）。
    if (card.effects?.length && !p.lifeSpent.has(card.id) && (g.lifeChain || 0) < 6) {
      p.lifeSpent.add(card.id);
      g.lifeChain = (g.lifeChain || 0) + 1;
      g.log.push(`　※ 生命卡【${card.name}】移入损伤区 —— 触发`);
      runEffects(g, p, g.players[1 - p.idx], { effects: card.effects, name: card.name, type: '生命卡' }, null);
      g.lifeChain -= 1;
    }
  }
}

/** 回复：把损伤区的卡按序放回生命卡组底部（至多 n 张） */
function healFace(g, p, n) {
  for (let i = 0; i < n; i++) {
    const c = p.damage.shift();
    if (!c) break;
    p.lifeDeck.push(c);
  }
}

/** 灵体卡的"进场光环"：只对之后进场的单位生效（灵体全程不变，等价于全局光环） */
function applyAura(p, u) {
  for (const e of p.avatar?.passive || []) {
    if (e.t === 'auraAtk') u.atk += e.n;
    else if (e.t === 'auraHp') { u.maxHp += e.n; u.hp += e.n; }
    else if (e.t === 'auraKw' && !u.kw.includes(e.kw)) u.kw.push(e.kw);
  }
}

function spawnToken(p, spec) {
  const u = {
    uid: UID++, id: 'TOKEN', name: spec.name || '衍生物', color: p.color,
    atk: spec.atk ?? 1, imp: spec.imp ?? 1, hp: spec.hp ?? 1, maxHp: spec.hp ?? 1,
    kw: [], shield: 0, attacked: false, frozen: false, entered: true,
    equip: [], temp: { atk: 0, imp: 0 },
  };
  applyAura(p, u);
  p.board.push(u);
  return u;
}

function makeUnit(card, uidRef) {
  return {
    uid: uidRef++, id: card.id, name: card.name, color: card.color,
    atk: card.atk ?? 0, imp: card.imp ?? 0, hp: card.hp ?? 1, maxHp: card.hp ?? 1,
    kw: [...card.kw], shield: 0, attacked: false, frozen: false, entered: true,
    equip: [], temp: { atk: 0, imp: 0 },
  };
}

export function createGame({ deckA, deckB, colorA, colorB, seed = 20261105, scriptA, scriptB, nameA, nameB, avatarA, avatarB, marketA, marketB }) {
  const rng = new Rng(seed);
  UID = 1;
  const g = {
    rng, turn: 0, round: 1, active: 0, over: false, winner: -1,
    players: [
      newPlayer(0, colorA, deckA, rng, nameA, avatarA),
      newPlayer(1, colorB, deckB, rng, nameB, avatarB),
    ],
    log: [], steps: [], phase: 'start', turnLimit: 60, lifeChain: 0,
    pendingPlay: null,   // 已宣告、待响应窗口结算的卡
    pendingAttack: null, // 已宣告、待响应窗口结算的攻击
    pendingEnd: null,    // 回合结束前的响应窗口
    market: [], marketPool: [],
  };
  // 规则 5.9：市场区展示 5 张公共牌，来自市场牌库（额外卡组）。
  // 谁带市场牌库（金色）就并入同一个公共池。
  // 未显式给市场牌库时，只要有金色方就启用默认市场牌库（它是产品固定件，不进主卡组）
  const needMarket = colorA === '金' || colorB === '金';
  const mpool = [].concat(marketA || (needMarket ? GOLD_MARKET : []), marketB || []);
  for (const it of mpool) for (let i = 0; i < (it.n || 1); i++) g.marketPool.push(it.id);
  g.marketPool = rng.shuffle(g.marketPool);
  for (let i = 0; i < 5 && g.marketPool.length; i++) g.market.push(g.marketPool.pop());
  g.players[0].script = scriptA;
  g.players[1].script = scriptB;
  // 规则 5.3 建议：先手 3 张、后手 4 张（补偿后手）
  for (let i = 0; i < 3; i++) drawCard(g, g.players[0], true);
  for (let i = 0; i < 4; i++) drawCard(g, g.players[1], true);
  g.log.push(`对局开始：${g.players[0].name}（${colorA}） vs ${g.players[1].name}（${colorB}）`);
  return g;
}

/* ────────────────────────────── 基础操作 ────────────────────────────── */

/** 重构（规则 3.4）：牌库空时把弃牌区洗回，并支付该色的重构费用 */
function reconstruct(g, p) {
  // 兜底：非主卡池 id（外枢／衍生物）不得进牌库，改记除外区，不再静默丢掉
  for (const id of p.grave) if (!deckable(id)) p.exile.push(id);
  p.grave = p.grave.filter((id) => deckable(id));
  if (!p.grave.length) return false;
  p.deck = g.rng.shuffle(p.grave.splice(0));
  switch (p.color) {
    case '红': p.res = Math.ceil(p.res / 2); break;          // 激情减半
    case '白': case '青': p.res = 0; break;                   // 横置全部 AP／清空流转
    case '蓝': {
      const k = Math.min(4, Math.max(1, Math.ceil(p.hand.length / 3)));
      for (let i = 0; i < k && p.hand.length; i++) p.grave.push(p.hand.pop());
      break;
    }
    case '银': { const u = p.board[0]; if (u) killUnit(g, p, u); break; }
    case '金': break;                                         // 规则 5.9：重构费用「无」（DBG 核心引擎）
    default: damageFace(g, p, 1); break;                      // 其余按 1 点生命保底
  }
  g.log.push(`※ ${p.name} 触发重构：弃牌区洗回牌库（${p.deck.length} 张）`);
  return true;
}

function drawCard(g, p, silent) {
  if (!p.deck.length) {
    if (reconstruct(g, p)) return drawCard(g, p, silent);
    p.fatigue += 1;
    damageFace(g, p, p.fatigue);
    if (!silent) g.log.push(`${p.name} 无牌可抽也无牌可洗，疲劳 ${p.fatigue} 点`);
    return null;
  }
  const id = p.deck.pop();
  p.hand.push(id);
  return id;
}

/** 门槛制四色：费用是闸门不是消耗，付完不减 */
const GATE_COLORS = new Set(['红', '蓝', '银', '粉']);

/**
 * 每回合打出上限。门槛色若没有自限，就会「打牌→补牌→门槛不降」无限连锁。
 * 规则书现有两处自限：红＝回合末弃光重抽（等效上限 4~5）、粉＝每回合最多 2 张。
 * 蓝／银此前**没有任何自限**（实测每回合 5~7 张，胜率 100%），此处补上对称上限。
 */
// 每回合打出上限（规则书 3.2，v3.3-3 定稿）：粉 2 为原文；蓝 2、银 3 为实测补的对称自限。
// ⚠ 这些是**定稿值**，不是实验——此前 `Math.min(6, …)` 被标成「实验」，
// 后来差点被当成残留删掉，结果蓝直接冲到 81%。改这里的值请同步规则书。
const PLAY_CAP = { 粉: 2, 蓝: 2, 银: 3 };
// 规则 5.11 的骑升阶梯（T2 Lv1 → T3~4 Lv2 → T5~6 Lv3 → T7~8 Lv4）：
// 低阶卡可以早骑，高阶卡必须等到对应回合，否则粉会在 T4 就到 Lv4、灵压 8 全部卡免费。
const RIDE_MIN_TURN = { 1: 2, 2: 3, 3: 5, 4: 7 };
const playCapOf = (p) => PLAY_CAP[p.color] ?? Infinity;

/** 装备在锻造区每回合产出的锻造值（规则 5.7：基础 1 点，即其标注的锻造值） */
const forgeVal = (card) => Math.max(1, Math.min(3, card?.cost?.n || 1));

/** 橙色锻造值 ＝ 3 ＋ 锻造区装备的产出（上限 10）；锻造区最多 6 件 */
function forgeTotal(p) {
  const sum = (p.forge || []).reduce((s, id) => s + forgeVal(BY_ID.get(id)), 0);
  return Math.min(10, 3 + sum);
}

function getRes(p) {
  switch (p.color) {
    // 门槛制：门槛在本回合开始时**结算一次**（p.gate＝快照）。
    // 否则会在回合内自我加码——蓝打抽牌→手牌涨→门槛涨→再打；银上单位→共鸣涨→门槛涨。
    // 蓝的费用＝**当前手牌数**，实时结算：打出一张牌手牌 −1 ⇒ 门槛自然下降，这就是它的自限。
    // 快照会把闸门冻结在回合开始时的最高点（等于白送资源），上限 6 也是当年实验的残留。
    case '蓝': return Math.min(6, p.hand.length) + (p.gateBonus || 0);   // 门槛上限 6（`res` 类效果可再加，临时突破）
    case '银': return p.gate ?? Math.max(1, p.board.length + p.lands.length);
    case '粉': return p.gate ?? Math.max(1, [0, 2, 4, 6, 8][p.spiritLv] || 0);
    default: return p.res;
  }
}

/** 费用阶段末尾：给门槛色拍一个本回合的快照 */
function snapGate(p) {
  // 蓝不快照（见 getRes：实时手牌数才是它真正的自限）
  if (p.color === '银') p.gate = Math.max(1, p.board.length + p.lands.length);
  else if (p.color === '粉') p.gate = Math.max(1, [0, 2, 4, 6, 8][p.spiritLv] || 0);
}

function refreshRes(g, p) {
  const t = p.turnCount;
  switch (p.color) {
    case '白': p.res = 3 + (t >= 5 ? 1 : 0) + (t >= 9 ? 1 : 0); break;
    case '黑': p.res = 2 + Math.floor(t / 2); break;
    case '红': p.res = Math.min(2 * t, 10); break;
    case '绿': p.res = 2 + p.lands.filter((l) => l.type === '地标').length; break;
    case '紫': {
      // 规则 5.6：骰池容量 5（卡奥斯 +2 且每回合铸 2）；费用阶段投掷**骰池全部骰子**
      // 大成功（满面值）＝得等值灵脉＋每累计 2 次抽 1；大失败（1 点）＝得 1 灵脉＋混沌 +1
      // 混沌惩罚：每 1 点混沌使本回合灵脉 −3（扣至 0，不清空）
      const bonus = (p.avatar?.passive || []).reduce((s, e) => s + (e.t === 'diceBonus' ? e.n : 0), 0);
      const cap = 5 + bonus;
      const per = 1 + bonus;   // 卡奥斯「铸造 1→3」（卡组设计·紫 §2）
      p.dice = p.dice || [];
      for (let i = 0; i < per && p.dice.length < cap; i++) p.dice.push({ faces: 6 });
      let total = 0, crits = 0, fails = 0;
      const faces = [];
      for (const d of p.dice) {
        let r = 1 + g.rng.int(d.faces);
        if (r === 1 && p.rerolls > 0) { p.rerolls -= 1; r = 1 + g.rng.int(d.faces); }
        faces.push(r);
        if (r === d.faces) { total += d.faces; crits += 1; }
        else if (r === 1) { total += 1; fails += 1; }
        else total += r;
      }
      p.chaos = (p.chaos || 0) + fails;
      p.crit = (p.crit || 0) + crits;
      const owed = Math.floor(p.crit / 2) - (p.critPaid || 0);   // 规则 5.6：每累计 2 次大成功抽 1
      for (let i = 0; i < owed; i++) drawCard(g, p, true);
      p.critPaid = (p.critPaid || 0) + owed;
      const pen = 3 * (p.chaos || 0);
      p.res = Math.max(0, total - pen);
      g.log.push(
        `${p.name} 投 ${faces.length} 枚[${p.dice.map((d) => 'D' + d.faces).join('')}]：${faces.join('+')} ＝ ${total}`
        + `${crits ? `｜大成功 ${crits}` : ''}${fails ? `｜大失败 ${fails}（混沌 ${p.chaos}，−${pen}）` : ''}`
        + `${owed ? `｜抽 ${owed}` : ''} → 灵脉 ${p.res}`,
      );
      break;
    }
    // 规则 5.7：锻造值 ＝ 3 ＋ 锻造区装备产出（上限 10）。资源不再自动成长——必须投资装备
    case '橙': p.res = forgeTotal(p); break;
    case '青': p.res = Math.min(t + 1, 6); break;
    case '金': p.res = 5; break;   // 规则 5.9：金币收入 5.5／回合，引擎取整为 5（其余靠金币卡产出）
    default: break; // 蓝/银/粉 走 getRes 动态值
  }
}

/* ────────────────────────────── 回合 ────────────────────────────── */

function startTurn(g) {
  const p = g.players[g.active];
  p.turnCount += 1;
  p.playsThisTurn = 0;
  p.revivedThisTurn = 0;
  p.ascendedThisTurn = 0;   // 规则 4.9（v3.3-3）：每回合至多升灵 1 次
  p.gateBonus = 0;          // 蓝的临时门槛加成只在本回合有效
  // 重投次数**可以攒**：099【命运重掷】是在主要阶段给的，若开局清零就永远用不掉（旧版即如此）
  p.rerolls = Math.min(4, p.rerolls || 0);
  for (const u of p.board) { u.attacked = false; u.frozen = false; u.entered = false; u.usedBlock = false; u.temp = { atk: 0, imp: 0 }; }

  // 规则 5.9：金色行动值每回合重置为 1（不累积）
  if (p.color === '金') p.av = 1;   // 规则 5.9：初始行动值 1（硬约束；实测 2→40%、3→83%，无平滑档）

  // 粉色骑升改为**可选动作**（规则 5.11：费用阶段把下一阶叠放于当前灵体上）。
  // 旧版是「每回合 0.7 概率自动 +1」，玩家无法决定何时骑升，也吃不到 Lv4 的终端效果。
  if (p.color === '粉') {
    p.rideUsed = 0;
    p.avatarAtkUsed = 0;
    p.awakenUsed = 0;
    p.resonateUsed = 0;
    p.avatarTempAtk = 0;
    p.ap = p.apMax || 2;   // AP 每回合重置（用于魂装、魂装觉醒／共鸣、灵体亲自作战）
  }

  refreshRes(g, p);

  // 成长 / 再生
  for (const u of p.board) {
    if (u.kw.includes('成长')) { u.atk += 1; u.maxHp += 1; u.hp += 1; }
    if (u.kw.includes('再生') && u.hp < u.maxHp) u.hp += 1;
  }

  // 规则 5.7 淬炼：锻造区装备**横置产资源时**累积 1 枚淬炼指示物；满 N 枚 → 本次额外 +2 锻造值。
  // 【淬层监工·布鲁诺】/【淬炼大师·弗吉奥】：需求 −1（满 2 即触发）。
  if (p.color === '橙' && (p.forge || []).length) {
    const cut = p.board.some((u) => u.id === 'LQ01-115')
      || (p.avatar?.passive || []).some((x) => x.t === 'quenchCut');
    const need = cut ? 2 : 3;
    p.quench = (p.quench || 0) + p.forge.length;
    let proc = 0;
    while (p.quench >= need) { p.quench -= need; p.res += 2; proc += 1; }
    if (proc) g.log.push(`　淬炼结算：锻造区 ${p.forge.length} 件 → 触发 ${proc} 次，锻造值 +${proc * 2}（余 ${p.quench} 枚）`);
  }

  // 抽牌（按色规则）
  const c = p.color;
  if (c === '红') { /* 回合开始不抽（5.3：回合末弃光重抽） */ }
  else if (c === '绿') { /* 结束阶段补至 地标数+1 */ }
  else if (c === '金') { /* 结束阶段补至 5 */ }
  else if (c === '紫') {
    // 规则 5.6：紫色**无常规抽牌**，手牌只来自「大成功」。
    // 但引擎实测：大成功 ≈1.2 次/回合 ⇒ 0.6 张/回合，而紫每回合要打 2~3 张，
    // 于是中期必然「灵脉 30+、手牌 3 张」地空转。加一条**见底保底**（≤2 张才补），
    // 只在断流时生效，不改变"资源过剩、手牌紧缺"的身份。
    if (p.hand.length <= 2) { drawCard(g, p, true); g.log.push(`　手牌见底：补 1 张`); }
  }
  else if (c === '青' || c === '橙') {
    drawCard(g, p); drawCard(g, p);
    // 规则 5.7：橙色可另横置 1 件锻造区装备，额外抽 1（「横置换抽牌」）。
    // 这条此前没实现——橙的手牌因此只能靠每回合 2 张硬撑，而它是全色出牌最多的颜色之一。
    if (c === '橙' && (p.forge || []).length) {
      drawCard(g, p, true);
      g.log.push(`　横置 1 件锻造区装备：额外抽 1`);
    }
  }
  else if (c === '蓝') { drawCard(g, p); drawCard(g, p); }   // 规则 5.5：回合开始抽 2
  else drawCard(g, p);

  // 规则 5.2：黑可付 2 生命再抽 1，每回合限 2 次。
  // 这是**可选**费用：手牌不缺、或生命已经见底时不付——否则等于自尽（首版自动连付 2 次，黑 42% → 10%）
  if (c === '黑') {
    for (let i = 0; i < 2; i++) {
      if (p.hand.length >= 3 || lifeOf(p) < 12) break;
      damageFace(g, p, 2);
      drawCard(g, p, true);
      g.log.push(`　${p.name} 以 2 点生命为代价抽 1（剩 ${lifeOf(p)}）`);
    }
  }

  // 规则 5.6：097【混沌骰虫·拉普】——每回合首次重投不消耗
  // 规则书 5.6：重投／保底是紫**基础的方差压缩手段**，不是某张卡的专属。
  // 097【混沌骰虫·拉普】额外多给 1 次。旧版把重投次数每回合清零，等于这两条全废。
  if (p.color === '紫') {
    p.rerolls = Math.max(p.rerolls || 0, 1);
    if (p.board.some((u) => u.id === 'LQ01-097')) p.rerolls = Math.max(p.rerolls, 2);
  }

  // 结界的「每回合开始时」持续效果
  for (const perm of p.perms || []) {
    for (const e of perm.effects || []) {
      if (e.do === 'upkeepDraw') {
        for (let i = 0; i < (e.n || 1); i++) drawCard(g, p, true);
        g.log.push(`　结界【${perm.name}】：抽 ${e.n || 1}`);
      }
    }
  }

  // 灵体：回合开始的钩子
  p.avatarUsed = false;
  p.lifeDrawn = false;
  p.deathDrawn = false;
  for (const e of p.avatar?.passive || []) {
    if (e.t === 'turnStartRes') {
      p.res += e.n;
      g.log.push(`　灵体【${p.avatar.name}】：${RES_NAME[p.color]} +${e.n}`);
    } else if (e.t === 'turnStartDraw') {
      for (let i = 0; i < e.n; i++) drawCard(g, p, true);
    } else if (e.t === 'turnStartToken') {
      spawnToken(p, e);
      g.log.push(`　灵体【${p.avatar.name}】：生成 1 个${e.name}`);
    }
  }

  snapGate(p);
  g.phase = 'main';
  g.log.push(`—— 第 ${p.turnCount} 回合 · ${p.name}（${p.color}）｜${RES_NAME[c]} ${getRes(p)} ——`);
  // 回合开始的扣血（黑的 2 生命换抽、疲劳）可能直接致死，旧版要等到下一次出牌才判
  checkEnd(g, p, g.players[1 - p.idx]);
}

function endTurn(g) {
  const p = g.players[g.active];
  const opp = g.players[1 - g.active];

  // 弃至 7 —— 规则 5.5：**蓝色手牌无上限**，不参与弃牌
  if (p.color !== '蓝') while (p.hand.length > 7) p.grave.push(p.hand.pop());

  // 结束阶段补牌
  if (p.color === '红') {
    // 规则 5.3：回合结束**弃光手牌**，再抽至 (10−激情)÷2 —— 不是"补到"，是"重抽"
    while (p.hand.length) p.grave.push(p.hand.pop());
    const target = Math.floor((10 - Math.min(getRes(p), 10)) / 2);
    for (let i = 0; i < target; i++) drawCard(g, p, true);
    g.log.push(`　${p.name} 弃光手牌，重抽 ${target} 张（激情 ${getRes(p)}）`);
  } else if (p.color === '绿') {
    const target = Math.min(p.lands.filter((l) => l.type === '地标').length + 1, 7);
    while (p.hand.length < target && p.deck.length) drawCard(g, p, true);
  } else if (p.color === '银') {
    const target = Math.min(Math.max(getRes(p), 3), 5);
    while (p.hand.length < target && p.deck.length) drawCard(g, p, true);
  } else if (p.color === '金') {
    // 规则 5.9：回合开始不抽，**回合结束手牌归 5**。
    // 金是 DBG 原型（重构免费、主卡组只有 10 张固定牌）：只有「弃光手牌再抽 5」才能让
    // 10 张固定牌 + 购入牌真正循环起来。旧版写成"补到 5"（手牌不打空就不抽），
    // 结果是铜币引擎永远抽不回来、经济断流。
    while (p.hand.length) p.grave.push(p.hand.pop());
    for (let i = 0; i < 5; i++) drawCard(g, p, true);
    g.log.push(`　${p.name} 弃光手牌，重抽 5 张（DBG 循环）`);
  } else if (p.color === '青') {
    // 规则 5.8：回合末额外抽「本回合打出数 ÷2」（向下取整）
    const extra = Math.floor(p.playsThisTurn / 2);
    for (let i = 0; i < extra; i++) drawCard(g, p, true);
    if (extra) g.log.push(`　${p.name} 流转：本回合打出 ${p.playsThisTurn} 张，额外抽 ${extra}`);
  }

  for (const u of p.board) { u.temp = { atk: 0, imp: 0 }; }
  g.active = 1 - g.active;
  g.phase = 'start';
  if (g.active === 0) g.round += 1;

  // 突然死亡：第 20 轮起每回合双方各受 2 点
  if (g.round > 20) {
    for (const q of g.players) damageFace(g, q, 2);
    g.log.push(`※ 第 ${g.round} 轮，双方各受 2 点灼烧`);
  }
  checkEnd(g, opp, p);
}

function checkEnd(g, a, b) {
  if (g.over) return;
  if (lifeOf(a) <= 0 && lifeOf(b) <= 0) { g.over = true; g.winner = -1; g.log.push('双方同时倒下，平局'); }
  else if (lifeOf(a) <= 0) { g.over = true; g.winner = b.idx; g.log.push(`${b.name} 获胜`); }
  else if (lifeOf(b) <= 0) { g.over = true; g.winner = a.idx; g.log.push(`${a.name} 获胜`); }
}

/* ────────────────────────────── 出牌 ────────────────────────────── */

/** 市场牌库＝LQ01-186~214。它们只能在市场区买到，不进主卡组。 */
const isMarketCard = (c) => c && c.color === '金' && Number(String(c.id).slice(5)) >= 186;

function canPay(p, card) {
  if (!card.cost) return true;
  // 规则 5.9：**市场牌**购买时付清、打出免费。
  // 但这条只覆盖市场牌——旧版写成「金的所有牌都免费」，于是灰卡混进金色卡组就能白嫖。
  if (p.color === '金') return isMarketCard(card) ? true : getRes(p) >= card.cost.n;
  const { k, n } = card.cost;
  const res = getRes(p);
  if (k === '通用') return res >= n;
  if (THRESHOLD_KINDS.has(k)) return res >= n;
  return res >= n;
}

function pay(p, card) {
  if (!card.cost) return;
  const { k, n } = card.cost;
  if (THRESHOLD_KINDS.has(k)) return;          // 门槛制不消耗
  if (GATE_COLORS.has(p.color)) return;        // 红/蓝/银/粉 无消耗型资源，灰卡的「通用N」按门槛读
  if (p.color === '金') {                       // 规则 5.9：市场牌购买时付清、打出免费；其余照付金币
    if (!isMarketCard(card)) p.res -= card.cost.n;
    return;
  }
  p.res -= n;
}

function needsTarget(card) {
  return (card.effects || []).some((e) =>
    ['dmg', 'destroy', 'bounce', 'freeze', 'buff', 'grant'].includes(e.do) &&
    ['enemyUnit', 'ownUnit', 'unit'].includes(e.target));
}

function targetSide(card) {
  for (const e of card.effects || []) {
    if (['dmg', 'destroy', 'bounce', 'freeze'].includes(e.do)) return 'enemy';
    if (['buff', 'grant'].includes(e.do)) return 'own';
  }
  return null;
}

function buyFromMarket(g, p, i) {
  const id = g.market[i];
  const card = BY_ID.get(id);
  if (!card) return false;
  const price = card.cost?.n || 0;
  if (getRes(p) < price) return false;
  p.res -= price;
  // 规则 5.9：**购得的牌加入弃牌区**（速购流派才是入手牌），再靠重构/抽牌进入手牌。
  // 旧版直接塞进手牌 → 手牌永远 ≥5 → 固定 10 张的铜币引擎永远抽不回来 → 金的经济断流。
  p.grave.push(id);
  g.market.splice(i, 1);
  if (g.marketPool.length) g.market.push(g.marketPool.pop());
  g.log.push(`${p.name} 购买【${card.name}】（金币 −${price}，余额 ${p.res}，入弃牌区）`);
  return true;
}

/* ────────────── 响应链（规则 3.6：瞬间与反击） ────────────── */

/** 对手手里是否有可支付的瞬间卡（决定是否打开响应窗口） */
function canRespond(d) {
  return d.hand.some((id) => {
    const c = BY_ID.get(id);
    return c && c.type === '瞬间' && canPay(d, c);
  });
}

/** 响应窗口的合法动作：打出任意可支付的瞬间卡，或 pass */
function respondMoves(g, d, ctx) {
  const moves = [{ type: 'pass' }];
  const caster = g.players[ctx.casterIdx];
  for (let i = 0; i < d.hand.length; i++) {
    const c = BY_ID.get(d.hand[i]);
    if (!c || c.type !== '瞬间' || !canPay(d, c)) continue;
    if (needsTarget(c)) {
      const side = targetSide(c);
      const pool = side === 'own' ? d.board : caster.board;
      for (const u of pool) moves.push({ type: 'respond', i, target: u.uid });
      if (!pool.length) moves.push({ type: 'respond', i });
    } else {
      moves.push({ type: 'respond', i });
    }
  }
  return moves;
}

/** 结算一张瞬间卡；若是「反击」且存在待结算的原卡，则把原卡整体无效化 */
function applyRespond(g, d, mv, pp) {
  const id = d.hand[mv.i];
  const card = BY_ID.get(id);
  if (!card || card.type !== '瞬间' || !canPay(d, card)) return { ok: false, countered: false };
  pay(d, card);
  d.hand.splice(mv.i, 1);
  d.grave.push(id);
  const isCounter = /反击/.test(card.text || '');
  g.log.push(`${d.name} 响应【${card.name}】${isCounter ? '（反击）' : '（瞬间）'}`);
  if (isCounter && pp) {
    const target = BY_ID.get(pp.id);
    g.log.push(`　【${target?.name || pp.id}】被反击，效果整体无效并置入弃牌区`);
    g.players[pp.casterIdx].grave.push(pp.id);
    return { ok: true, countered: true };
  }
  runEffects(g, d, g.players[1 - d.idx], card, mv.target);
  checkEnd(g, d, g.players[1 - d.idx]);
  return { ok: true, countered: false };
}

function playCard(g, p, opp, handIdx, targetUid, mode) {
  const id = p.hand[handIdx];
  const card = BY_ID.get(id);
  if (!card || !canPay(p, card)) return false;
  if (p.playsThisTurn >= playCapOf(p)) return false;
  // 规则 5.9：行动值归零即断链，本回合不能再打出任何卡牌
  if (p.color === '金' && (p.av || 0) <= 0) return false;

  pay(p, card);
  p.hand.splice(handIdx, 1);
  p.playsThisTurn += 1;
  g.log.push(`${p.name} 打出【${card.name}】（${RES_NAME[p.color]} ${getRes(p)}）`);

  // 规则 3.6：对手宣告使用卡牌后、该卡结算前，是瞬间卡的插打时点。
  // 只有对手手里确实有「可支付的瞬间卡」时才打开响应窗口——否则直接结算，
  // 保证绝大多数对局的 steps 序列与旧版一致（不影响回放与统计）。
  if (canRespond(opp)) {
    g.pendingPlay = { casterIdx: p.idx, id, targetUid, mode };
    return true;
  }
  resolvePlay(g, p, opp, card, targetUid, mode);
  return true;
}

/** 出牌的实际结算（与「宣告」分离，供响应链在反击未成立时继续结算） */
function resolvePlay(g, p, opp, card, targetUid, mode) {
  if (card.type === '单位') {
    const u = makeUnit(card, UID++);
    applyAura(p, u);
    p.board.push(u);
    g.log.push(`　【${card.name}】登场 ${u.atk}/${u.imp}/${u.hp}`);
  } else if (card.type === '地标') {
    p.lands.push({ id: card.id, name: card.name, type: '地标' });
    g.log.push(`　地标【${card.name}】进场`);
  } else if (card.type === '装备') {
    const t = mode === 'forge' ? null : p.board.find((u) => u.uid === targetUid);
    if (!t) {
      // 规则 5.7：装备的**第二种用法**——横置进锻造区，每回合产锻造值
      p.forge = p.forge || [];
      p.forge.push(card.id);
      g.log.push(`　【${card.name}】置入锻造区（产 ${forgeVal(card)} 锻造值）`);
    } else {
      t.equip.push(card.id);
      g.log.push(`　【${card.name}】装备于【${t.name}】`);
    }
  } else if (card.type === '结界') {
    // 规则 1.x：结界是**永久物**，留在场上持续生效（旧版错当一次性法术送进弃牌区）
    p.perms.push({ id: card.id, name: card.name, effects: card.effects });
    g.log.push(`　结界【${card.name}】留场`);
  } else {
    p.grave.push(card.id);
  }

  // 规则 5.9：打出任意卡消耗 1 行动值；标注「行动+X」的引擎卡再补回 X
  if (p.color === '金') {
    const before = p.av;
    p.av = p.av - 1 + (card.av || 0);
    if (card.av) g.log.push(`　行动值 ${before} → ${p.av}（引擎 +${card.av}）`);
    else if (p.av <= 0) g.log.push(`　行动值归零 —— 本回合断链`);
  }

  // 装备横置进锻造区时**不结算装备效果**：它没有附在单位上，
  // 而 buff/grant 在找不到目标时会回退到「场上最后一个单位」，等于白送一次加成。
  const forged = card.type === '装备' && mode === 'forge';
  if (!forged) {
    runEffects(g, p, opp, card, targetUid);
    // 【战吼指挥官·卡恩】：你的「战吼」触发两次——单位的进场效果再跑一遍
    if (card.type === '单位' && (p.avatar?.passive || []).some((x) => x.t === 'warcryDouble')) {
      g.log.push('　战吼双触发（卡恩）');
      runEffects(g, p, opp, card, targetUid);
    }
  }

  // 潮汐相位（青）：每使用 1 张青色卡切换一次
  if (p.color === '青' && card.color === '青') {
    p.tide = p.tide === '涨' ? '退' : '涨';
    g.log.push(`　潮汐 → ${p.tide}潮`);
  }
  // 回响（青）：本卡结算后再结算一次
  if (card.kw.includes('回响') && card.type !== '单位') {
    g.log.push(`　回响：再次结算`);
    runEffects(g, p, opp, card, targetUid);
  }
  // 淬炼（橙）：装备进场累积指示物，满 3 换 +2 锻造值
  // 淬炼的指示物来自「锻造区装备横置产资源」，在回合开始结算（见 startTurn），
  // 旧版写成「每打出一件装备 +1 层」——那是错的：装备进场并没有横置。

  // 灵体：出牌计数类钩子
  const ps = p.avatar?.passive || [];
  for (const e of ps) if (e.t === 'enterAtk') for (const u of p.board) u.temp.atk += e.n;
  if (p.playsThisTurn === 2 && ps.some((e) => e.t === 'secondCardDraw')) drawCard(g, p);

  checkEnd(g, p, opp);
  return true;
}

/* ────────────────────────────── 效果执行 ────────────────────────────── */

function findUnit(g, uid) {
  for (const p of g.players) {
    const u = p.board.find((x) => x.uid === uid);
    if (u) return { p, u };
  }
  return null;
}

function applyDamage(g, p, unit, n) {
  // 注意：这里**不再**处理「守护X」。守护是"代替友方／灵体承受攻击时的减伤"，
  // 已在 resolveGuardIntercept 里扣过一次；此前提早再扣一次，等于守护1 变 −2、守护2 变 −4，
  // 而且被直接攻击时也享受减伤（卡面没写），白／银／蓝因此被系统性抬高。
  let dmg = n;
  if (dmg <= 0) return;
  if (unit.kw.includes('圣盾') && !unit.shieldUsed) {
    unit.shieldUsed = true;
    g.log.push(`　【${unit.name}】圣盾抵消`);
    return;
  }
  unit.hp -= dmg;
  g.log.push(`　【${unit.name}】受到 ${dmg} 点伤害（剩 ${Math.max(0, unit.hp)}）`);
  for (const e of p.avatar?.passive || []) if (e.t === 'damagedAtk') unit.temp.atk += e.n;
}

/** 同时结算后的死亡处理：两侧一起扫，避免"先死者先离场"改变另一方判定 */
function resolveDeaths(g, a, b) {
  for (const owner of [a, b]) {
    for (const unit of [...owner.board]) {
      if (unit.hp <= 0) killUnit(g, owner, unit);
    }
  }
}

function dealDamageToUnit(g, p, opp, unit, n) {
  applyDamage(g, p, unit, n);
  if (unit.hp <= 0) killUnit(g, p, unit);
}

/** 外枢灵体离场（非死亡也适用）：一律归于外枢区，可再次升灵 */
function sendAscendantHome(g, p, unit, reason) {
  const rec = (p.outer || []).find((x) => x.id === unit.ascendant);
  if (rec) {
    rec.used = false;
    rec.returns = (rec.returns || 0) + 1;
    g.log.push(`　※ 外枢灵体【${unit.name}】归于外枢区（${reason}，本局第 ${rec.returns} 次回归）`);
    return true;
  }
  p.exile.push(unit.id);
  g.log.push(`　※ 外枢灵体【${unit.name}】找不到外枢区记录，暂置除外区`);
  return true;
}

function killUnit(g, p, unit) {
  const i = p.board.indexOf(unit);
  if (i < 0) return;
  p.board.splice(i, 1);
  // 装备随载体一起下弃牌区（旧版直接丢掉，橙色 12 张装备会凭空消失、卡张总量漂移）
  for (const eid of unit.equip || []) if (deckable(eid)) p.grave.push(eid);

  // 规则 4.9（v3.3-3 拍板）：**外枢灵体被破坏后归于外枢区**，不进弃牌区。
  // 它不是主卡组的卡——一旦落进弃牌区就会被重构洗回牌库、抽成手里的永久死卡（旧版就是这样）。
  // 回外枢区后可再次升灵，代价永远是「献祭素材」，所以不需要另设次数上限。
  if (unit.ascendant) {
    sendAscendantHome(g, p, unit, '被破坏');
  } else if (deckable(unit.id)) {
    p.grave.push(unit.id);
  }
  g.log.push(`　【${unit.name}】被破坏${unit.equip?.length ? `（携 ${unit.equip.length} 件装备入弃牌区）` : ''}`);
  // 银的「共鸣增幅」：己方卡牌被破坏即累积 1 点共鸣（供 resonanceDmg 消费）
  if (p.color === '银') p.resonance = (p.resonance || 0) + 1;
  for (const e of p.avatar?.passive || []) {
    if (e.t === 'deathRes') p.res += e.n;
    if (e.t === 'deathDraw' && !p.deathDrawn) { p.deathDrawn = true; drawCard(g, p, true); }
  }
  const card = BY_ID.get(unit.id);
  if (card && card.effects.length) {
    // 亡语类：只跑 heal/draw 这类安全效果
    for (const e of card.effects) {
      if (e.do === 'draw') for (let k = 0; k < e.n; k++) drawCard(g, p, true);
      if (e.do === 'heal') healFace(g, p, e.n);
    }
  }
}

function runEffects(g, p, opp, card, targetUid) {
  for (const e of card.effects) {
    switch (e.do) {
      case 'dmg': {
        if (e.target === 'face') {
          g.log.push(`　对 ${opp.name} 造成 ${e.n} 点伤害`);
          damageFace(g, opp, e.n);
          g.log.push(`　${opp.name} 剩 ${lifeOf(opp)}`);
        } else {
          const own = e.target === 'ownUnit';
          const owner = own ? p : opp;
          const other = own ? opp : p;
          const t = own
            ? p.board.find((u) => u.uid === targetUid)
            : opp.board.find((u) => u.uid === targetUid) || opp.board[0];
          // owner 必须是被打单位的一方；旧版一律传 opp，己方单位被打到 0 血时 killUnit 找不到人，
          // 于是永远留在场上（0 血僵尸，既不挡也不死）
          if (t) dealDamageToUnit(g, owner, other, t, e.n);
        }
        break;
      }
      case 'aoe': {
        const targets = e.side === 'all' ? [...p.board, ...opp.board] : [...opp.board];
        for (const u of targets) {
          const owner = p.board.includes(u) ? p : opp;
          if (u.hp > 0) dealDamageToUnit(g, owner, owner === p ? opp : p, u, e.n);
        }
        break;
      }
      case 'aoeRandom': {
        const pool = [...opp.board];
        for (let i = 0; i < e.picks && pool.length; i++) {
          const u = g.rng.pick(pool);
          if (u.hp > 0) dealDamageToUnit(g, opp, p, u, e.n);
        }
        break;
      }
      case 'draw': for (let i = 0; i < e.n; i++) drawCard(g, p); break;
      case 'tutorAttire': {
        const idx = p.deck.findIndex((id) => {
          const c = BY_ID.get(id);
          return c && (c.type === '魂装' || /魂装/.test(c.name));
        });
        if (idx >= 0) { p.hand.push(p.deck.splice(idx, 1)[0]); g.log.push('　检索「魂装」卡 1 张'); }
        break;
      }
      case 'attireDraw': drawCard(g, p, true); break;
      case 'resonateDraw': {
        const s = (p.soulGrave || []).pop();
        if (s) {
          p.souls.push({ ...s, state: 'active' });
          g.log.push(`　唤醒魂装源【${s.name}】`);
          drawCard(g, p, true);
        }
        break;
      }
      case 'comboDraw': {
        // 连击：本回合第 N 次使用卡牌时抽 M 张（青）
        if ((p.playsThisTurn || 0) >= (e.n || 2)) {
          for (let i = 0; i < (e.m || 2); i++) drawCard(g, p, true);
          g.log.push(`　连击 ${p.playsThisTurn} → 抽 ${e.m || 2}`);
        }
        break;
      }
      case 'resonanceDmg': {
        // 共鸣增幅：伤害 = 基础值 + 本回合累积的共鸣，然后清零（银）
        const bonus = p.resonance || 0;
        const total = (e.n || 2) + bonus;
        p.resonance = 0;
        const t = opp.board.slice().sort((a, b) => unitAtk(g, opp, b) - unitAtk(g, opp, a))[0];
        if (t) {
          g.log.push(`　共鸣增幅 +${bonus} → ${total} 点`);
          dealDamageToUnit(g, opp, p, t, total);
        } else {
          g.log.push(`　共鸣增幅 +${bonus} → 对灵体 ${total} 点`);
          damageFace(g, opp, total);
        }
        break;
      }
      case 'heal': healFace(g, p, e.n); g.log.push(`　${p.name} 回复 ${e.n}（${lifeOf(p)}）`); break;
      case 'res': {
        // 蓝／银／粉的资源是"本回合门槛快照"（p.gate），直接加 p.res 会被 getRes 忽略
        if (p.color === '蓝') {
          p.gateBonus = (p.gateBonus || 0) + e.n;
          g.log.push(`　手牌门槛 +${e.n}（本回合 ${getRes(p)}）`);
        } else if (p.color === '银' || p.color === '粉') {
          p.gate = (p.gate ?? getRes(p)) + e.n;
          g.log.push(`　${RES_NAME[p.color]} +${e.n}（本回合门槛 ${p.gate}）`);
        } else {
          p.res += e.n;
          g.log.push(`　${RES_NAME[p.color]} +${e.n}`);
        }
        break;
      }
      case 'die': {
        // 规则 5.6：铸骰。D10/D12/D20 每位玩家骰池各限 1 枚
        p.dice = p.dice || [];
        const cap = 5 + ((p.avatar?.passive || []).reduce((s, x) => s + (x.t === 'diceBonus' ? x.n : 0), 0));
        const dup = p.dice.some((d) => d.faces === e.faces);
        if (p.dice.length < cap && !(e.faces >= 10 && dup)) {
          p.dice.push({ faces: e.faces });
          g.log.push(`　铸 1 枚 D${e.faces}（骰池 ${p.dice.length} 枚）`);
        }
        break;
      }
      case 'reroll': p.rerolls = (p.rerolls || 0) + (e.n || 1); g.log.push(`　获得 ${e.n || 1} 次重投`); break;
      case 'chaos': p.chaos = (p.chaos || 0) + (e.n || 1); g.log.push(`　混沌值 +${e.n || 1}（现 ${p.chaos}）`); break;
      case 'chaosClear': p.chaos = 0; g.log.push('　混沌值清零'); break;
      case 'gold': p.res += e.n; g.log.push(`　金币 +${e.n}`); break;
      case 'token': {
        for (let i = 0; i < e.n; i++) spawnToken(p, e);
        g.log.push(`　生成 ${e.n} 个「${e.name}」`);
        break;
      }
      case 'buff': {
        // target 有三种写法：'ownUnit'（指定己方）、'unit'（= 己方，装备与自身增益都这么写）、
        // 'enemyUnit'（削弱敌方）。旧版只认 'ownUnit'，其余一律走敌方分支 ——
        // 结果 14 张卡（含橙色全部装备的 +X/+X）在这里静默失效。
        const side = (e.target === 'enemyUnit' || e.target === 'enemy') ? opp : p;
        const t = side.board.find((u) => u.uid === targetUid) || side.board[side.board.length - 1];
        if (t) {
          t.atk += e.atk || 0;
          t.maxHp += e.hp || 0;
          t.hp += e.hp || 0;
          g.log.push(`　【${t.name}】${e.atk >= 0 ? '+' : ''}${e.atk}/${e.hp >= 0 ? '+' : ''}${e.hp}（现 ${t.atk}/${t.imp}/${t.hp}）`);
        }
        break;
      }
      case 'buffAll': {
        for (const u of p.board) { u.atk += e.atk || 0; u.maxHp += e.hp || 0; u.hp += e.hp || 0; }
        g.log.push(`　${p.name} 全体 +${e.atk}/+${e.hp}`);
        break;
      }
      case 'rally': {
        for (const u of p.board) u.temp.imp += e.imp;
        g.log.push(`　${p.name} 全体 IMP+${e.imp}`);
        break;
      }
      case 'destroy': {
        const t = opp.board.find((u) => u.uid === targetUid) || opp.board[0];
        if (t) killUnit(g, opp, t);
        break;
      }
      case 'destroyWeak': {
        // 只破坏 ATK ≤ e.maxAtk 的单位（取其中最大的一只）
        const pool = opp.board.filter((u) => unitAtk(g, opp, u) <= e.maxAtk);
        if (pool.length) {
          const t = pool.sort((a, b) => unitAtk(g, opp, b) - unitAtk(g, opp, a))[0];
          g.log.push(`　破坏弱于 ${e.maxAtk} 攻的单位：【${t.name}】`);
          killUnit(g, opp, t);
        }
        break;
      }
      case 'bounce': {
        const t = opp.board.find((u) => u.uid === targetUid) || opp.board[0];
        if (t) {
          opp.board.splice(opp.board.indexOf(t), 1);
          for (const eid of t.equip || []) if (deckable(eid)) opp.grave.push(eid);
          if (t.ascendant) {
            // 外枢灵体不是主卡组的卡，回不了手牌：按规则 4.9 回外枢区
            sendAscendantHome(g, opp, t, '被回手');
          } else if (deckable(t.id)) {
            opp.hand.push(t.id);
            g.log.push(`　【${t.name}】被退回手牌（装备留弃牌区）`);
          }
        }
        break;
      }
      case 'freeze': {
        const t = opp.board.find((u) => u.uid === targetUid) || opp.board[0];
        if (t) { t.frozen = true; g.log.push(`　【${t.name}】被冻结`); }
        break;
      }
      case 'grant': {
        const t = p.board.find((u) => u.uid === targetUid) || p.board[p.board.length - 1];
        if (t && !t.kw.includes(e.kw)) { t.kw.push(e.kw); g.log.push(`　【${t.name}】获得「${e.kw}」`); }
        break;
      }
      case 'grantAll': {
        for (const u of p.board) if (!u.kw.includes(e.kw)) u.kw.push(e.kw);
        g.log.push(`　${p.name} 全体获得「${e.kw}」`);
        break;
      }
      case 'shield': g.log.push(`　${p.name} 灵体护盾 +${e.n}`); p.shield = (p.shield || 0) + e.n; break;
      case 'revive': {
        // 规则 5.2：**复活单位每回合全局上限 1 个**（旧版没有这道闸，黑的【拾烬者】可无限捞）
        if ((p.revivedThisTurn || 0) >= 1) { g.log.push('　本回合已复活过 1 个单位，本次复活无效'); break; }
        const idx = p.grave.findIndex((id) => {
          const c = BY_ID.get(id);
          return c && c.type === '单位' && (c.sr || 0) <= e.sr;
        });
        if (idx >= 0) {
          const id = p.grave.splice(idx, 1)[0];
          const c = BY_ID.get(id);
          const nu = makeUnit(c, UID++);
          applyAura(p, nu);            // 复活的单位同样吃灵体光环（旧版漏了这一句）
          nu.attacked = true;
          nu.rotten = true;            // 「朽坏」：复活出来的单位不能作升灵素材（见 pickMaterials）
          p.revivedThisTurn = (p.revivedThisTurn || 0) + 1;
          p.board.push(nu);
          g.log.push(`　【${c.name}】从弃牌区被救赎回场（横置）`);
        }
        break;
      }
      case 'freezeAll': {
        for (const t of opp.board) t.frozen = true;
        g.log.push(`　${opp.name} 全体单位被冻结`);
        break;
      }
      case 'ride': {
        if (p.spiritLv < 4) {
          p.spiritLv += 1;
          g.log.push(`　骑升 → Lv${p.spiritLv}（灵压 ${getRes(p)}）`);
        }
        break;
      }
      case 'pumpBest': {
        const best = p.board.slice().sort((a, b) => unitAtk(g, p, b) - unitAtk(g, p, a))[0];
        if (best) {
          const add = unitAtk(g, p, best) * ((e.mul || 2) - 1);
          best.temp.atk += add;
          g.log.push(`　【${best.name}】ATK 翻倍（+${add}）`);
        }
        break;
      }
      case 'dmgRes': {
        const n = Math.max(1, Math.floor(getRes(p) / (e.div || 2)));
        const t = opp.board[0];
        if (t) { g.log.push(`　伤害 ＝ 资源÷${e.div || 2} ＝ ${n} 点`); dealDamageToUnit(g, opp, p, t, n); }
        break;
      }
      case 'recover': {
        const rid = p.grave.pop();
        if (rid) { p.hand.push(rid); g.log.push(`　【${BY_ID.get(rid)?.name || rid}】从弃牌区回到手牌`); }
        break;
      }
      case 'mill': for (let i = 0; i < e.n && p.deck.length; i++) p.grave.push(p.deck.pop()); break;
      default: break;
    }
  }
}

/* ────────────────────────────── 攻击 ────────────────────────────── */

function unitAtk(g, p, u) {
  let atk = u.atk + (u.temp?.atk || 0);
  // 团结：每有 1 个其他同色友方单位 +1 ATK，**上限 +3**（无上限时白色会滚成 8/8 的雪球）
  if (u.kw.includes('团结')) atk += Math.min(3, Math.max(0, p.board.filter((x) => x !== u && x.color === u.color).length));
  if (u.kw.includes('潮汐') && p.tide === '涨') atk += 1;
  // 涡流X（规则 8.2）：随本回合使用卡牌数累积，上限 X 层。此前卡面写了、引擎没实现。
  const vortex = u.kw.find((k) => k.startsWith('涡流'));
  if (vortex) atk += Math.min(Number(vortex.slice(2)) || 0, p.playsThisTurn);
  const vor = u.kw.find((k) => k.startsWith('涡流'));
  if (vor) atk += Math.min(Number(vor.slice(2)) || 0, p.playsThisTurn);
  return Math.max(0, atk);
}
function unitImp(g, p, u) {
  let imp = u.imp + (u.temp?.imp || 0);
  // 团结只加 ATK，不加 IMP（旧版误加到冲阵，白色因此两回合打穿）
  return Math.max(0, imp);
}

function legalAttacks(g, p, opp) {
  const guards = opp.board.filter((u) => u.kw.includes('守卫'));
  const list = [];
  for (const u of p.board) {
    if (u.attacked || u.frozen) continue;
    // 规则 3.3：非刚进场才可攻击（冲锋是唯一例外）
    if (u.entered && !u.kw.includes('冲锋') && !u.kw.includes('神速')) continue;
    if (p.turnCount === 1 && !u.kw.includes('冲锋') && !u.kw.includes('神速')) continue;
    for (const t of opp.board) {
      if (guards.length && !guards.includes(t)) continue;
      list.push({ type: 'attack', uid: u.uid, target: t.uid });
    }
    if (!guards.length) list.push({ type: 'attack', uid: u.uid, target: 'face' });
  }
  return list;
}

function finishAttack(g, p, opp, u) {
  if (u.kw.includes('疾风') && u.hp > 0) {
    g.log.push(`　疾风追加 1 点`);
    damageFace(g, opp, 1);
    g.log.push(`　${opp.name} 剩 ${lifeOf(opp)}`);
  }
  checkEnd(g, p, opp);
}

function resolveFaceHit(g, p, opp, u) {
  const imp = unitImp(g, p, u);
  g.log.push(`${p.name}【${u.name}】直击灵体 ${imp} 点`);
  damageFace(g, opp, imp);
  g.log.push(`　${opp.name} 剩 ${lifeOf(opp)}`);
  finishAttack(g, p, opp, u);
}

/* ────────────── 粉色灵体亲自作战（规则 3.3 / 5.11） ────────────── */

/** 耗灵魂：把 n 个活跃魂装源移入魂装弃牌区（可被共鸣唤醒）；返回实际消耗数 */
function consumeSoul(g, p, n) {
  const need = Math.max(0, n);
  let used = 0;
  for (let i = p.souls.length - 1; i >= 0 && used < need; i--) {
    if (p.souls[i].state !== 'active') continue;
    p.soulGrave.push(p.souls.splice(i, 1)[0]);
    used += 1;
  }
  // 莉莉丝 Lv2 渴血：每次耗灵魂 → 对对手造成 1 点
  if (used && p.soulBurn) {
    const opp = g.players[1 - p.idx];
    damageFace(g, opp, p.soulBurn);
    g.log.push(`　渴血：耗灵魂 ${used} → 对 ${opp.name} 造成 ${p.soulBurn} 点`);
  }
  // 莉莉丝 Lv4 永夜：每回合首次耗灵魂 → 移回 1 张生命卡
  if (used && p.soulHeal) {
    healFace(g, p, p.soulHeal);
    g.log.push(`　永夜：移回 ${p.soulHeal} 张生命卡`);
    p.soulHeal = 0;
  }
  return used;
}

/** 灵体当前 ATK：卡面值 ＋ 活跃魂装源数 ＋ 本回合觉醒加成 */
function avatarAtkOf(p) {
  const active = (p.souls || []).filter((s) => s.state === 'active').length;
  return Math.max(0, (p.avatar?.atk || 0) + Math.floor(active / 2) + (p.avatarTempAtk || 0));
}
function avatarImpOf(p) {
  const active = (p.souls || []).filter((s) => s.state === 'active').length;
  return Math.max(0, (p.avatar?.imp || 0) + Math.floor(active / 2));
}

function legalAvatarAttacks(g, p, opp) {
  // 只有粉色、且灵体 Lv≥2（卡面写明「可亲自作战」）才能宣告
  if (p.color !== '粉') return [];
  const av = p.avatar;
  if (!av || (av.lv || 0) < 3) return [];
    const cap = (av.effects || []).some((e) => e.do === 'avatarDouble') ? 2 : 1;
  if ((p.avatarAtkUsed || 0) >= cap) return [];
  if ((p.ap || 0) < 1) return [];   // 灵体亲自作战消耗 1 AP
  const guards = opp.board.filter((u) => u.kw.includes('守卫'));
  const list = [];
  for (const t of opp.board) {
    if (guards.length && !guards.includes(t)) continue;
    list.push({ type: 'attack', avatar: true, target: t.uid });
  }
  if (!guards.length) list.push({ type: 'attack', avatar: true, target: 'face' });
  return list;
}

function resolveAvatarFaceHit(g, p, opp) {
  const av = p.avatar;
  const imp = avatarImpOf(p);
  g.log.push(`${p.name} 灵体【${av.name}】直击 ${imp} 点`);
  damageFace(g, opp, imp);
  g.log.push(`　${opp.name} 剩 ${lifeOf(opp)}`);
  // 蕾 Lv3：攻击结算后，若目标为灵体，追加 1 点冲击
  const pierce = (av.effects || []).find((e) => e.do === 'avatarPierce');
  if (pierce) {
    g.log.push(`　寒风追加 ${pierce.n || 1} 点`);
    damageFace(g, opp, pierce.n || 1);
  }
  checkEnd(g, p, opp);
}

function doAvatarAttack(g, p, opp, target) {
  const av = p.avatar;
  if (!av) return false;
  const cap = (av.effects || []).some((e) => e.do === 'avatarDouble') ? 2 : 1;
  if ((p.avatarAtkUsed || 0) >= cap) return false;
  if ((p.ap || 0) < 1) return false;
  p.ap -= 1;   // 灵体亲自作战：1 AP
  p.avatarAtkUsed = (p.avatarAtkUsed || 0) + 1;
  const atk = avatarAtkOf(p);
  const imp = avatarImpOf(p);

  if (target === 'face') {
    const blockers = opp.board.filter((x) => !x.attacked && !x.usedBlock);
    g.log.push(`${p.name} 灵体【${av.name}】宣告直击灵体（IMP ${imp}）`);
    if (blockers.length) {
      g.pending = { attackerIdx: p.idx, avatar: true, imp };
      return true;
    }
    resolveAvatarFaceHit(g, p, opp);
    return true;
  }

  const t = opp.board.find((x) => x.uid === target);
  if (!t) return false;
  const back = unitAtk(g, opp, t);   // 先取值，避免被打死后取不到
  g.log.push(`${p.name} 灵体【${av.name}】(${atk}) ⇄ ${opp.name}【${t.name}】(${back})`);
  applyDamage(g, opp, t, atk);
  // 规则 3.3：对灵体的一切伤害一律落生命卡组，灵体没有耐久、不会被战斗破坏
  damageFace(g, p, back);
  resolveDeaths(g, p, opp);
  checkEnd(g, p, opp);
  return true;
}

/* 阻挡宣告（规则 3.3）：目标为灵体时，防守方可用 1 个未横置单位阻挡 */
export function blockMoves(g) {
  if (!g.pending) return [{ type: 'noBlock' }];
  const d = g.players[1 - g.pending.attackerIdx];
  const list = d.board
    // 规则 8.1 冻结：只禁攻击与启动能力，**不禁止阻挡**
    .filter((u) => !u.attacked && !u.usedBlock)
    .map((u) => ({ type: 'block', uid: u.uid }));
  list.push({ type: 'noBlock' });
  return list;
}

/** 没写 block() 的脚本走这套启发式：能换就换，换亏就不挡，会被打死则尽量挡 */
export function defaultBlock(g, moves) {
  const pend = g.pending;
  if (!pend) return { type: 'noBlock' };
  const a = g.players[pend.attackerIdx];
  const d = g.players[1 - pend.attackerIdx];
  const u = a.board.find((x) => x.uid === pend.uid);
  let best = null;
  for (const m of moves) {
    if (m.type !== 'block' || !u) continue;
    const b = d.board.find((x) => x.uid === m.uid);
    if (!b) continue;
    const kills = unitAtk(g, d, b) >= u.hp;
    const dies = unitAtk(g, a, u) >= b.hp;
    let v = 0;
    if (kills) v += 3;
    if (!dies) v += 2;
    if (dies && !kills) v -= 3;
    if (lifeOf(d) <= pend.imp) v += 5;
    if (!best || v > best.v) best = { m, v };
  }
  return best && best.v > 0 ? best.m : { type: 'noBlock' };
}

function resolveBlock(g, mv) {
  const pend = g.pending;
  g.pending = null;
  const a = g.players[pend.attackerIdx];
  const d = g.players[1 - pend.attackerIdx];
  // 灵体亲自作战被阻挡：阻挡者与灵体互击；对灵体的伤害仍落生命卡组
  if (pend.avatar) {
    const bb = mv.type === 'block'
      ? d.board.find((x) => x.uid === mv.uid && !x.attacked && !x.usedBlock)
      : null;
    if (!bb) { resolveAvatarFaceHit(g, a, d); return; }
    bb.usedBlock = true;
    const aatk = avatarAtkOf(a);
    const back = unitAtk(g, d, bb);
    g.log.push(`　${d.name}【${bb.name}】阻挡灵体`);
    g.log.push(`　灵体(${aatk}) ⇄ 【${bb.name}】(${back})`);
    applyDamage(g, d, bb, aatk);
    damageFace(g, a, back);
    resolveDeaths(g, a, d);
    checkEnd(g, a, d);
    return;
  }
  const u = a.board.find((x) => x.uid === pend.uid);
  if (!u) return;
  const b = mv.type === 'block'
    ? d.board.find((x) => x.uid === mv.uid && !x.attacked && !x.usedBlock)
    : null;
  if (!b) { resolveFaceHit(g, a, d, u); return; }

  const atk = unitAtk(g, a, u);
  const def = unitAtk(g, d, b);
  const hpBefore = b.hp;
  b.usedBlock = true;
  g.log.push(`　${d.name}【${b.name}】阻挡`);
  g.log.push(`　【${u.name}】(${atk}) ⇄ 【${b.name}】(${def})`);
  applyDamage(g, d, b, atk);
  applyDamage(g, a, u, def);
  resolveDeaths(g, a, d);
  if (u.kw.includes('践踏') && b.hp <= 0) {
    const over = atk - Math.max(0, hpBefore);
    if (over > 0) {
      g.log.push(`　践踏溢出 ${over} 点`);
      damageFace(g, d, over);
      g.log.push(`　${d.name} 剩 ${lifeOf(d)}`);
    }
  }
  finishAttack(g, a, d, u);
}

/* 守护代替（规则 3.3）：守护单位可替灵体承伤，且该次伤害 −X。
   规则写的是"可代替"，所以这里给一条自动策略：只在"挡得住（不会死）"或"不挡就死"时才挡。 */
function bestGuard(opp, atk, imp) {
  const gs = opp.board.filter((u) => u.kw.includes('守护1') || u.kw.includes('守护2'));
  const ok = gs.filter((u) => {
    const kw = u.kw.find((k) => k === '守护1' || k === '守护2');
    const x = Number(kw.slice(2)) || 0;
    return Math.max(0, atk - x) < u.hp || lifeOf(opp) <= imp;
  });
  if (!ok.length) return null;
  return ok.slice().sort((a, b) => b.hp - a.hp)[0];
}

function resolveGuardIntercept(g, p, opp, u, guard) {
  const kw = guard.kw.find((k) => k === '守护1' || k === '守护2') || '守护0';
  const x = Number(kw.slice(2)) || 0;
  const atk = Math.max(0, unitAtk(g, p, u) - x);
  const back = unitAtk(g, opp, guard);
  g.log.push(`　${opp.name}【${guard.name}】守护代替（本次伤害 −${x}）`);
  applyDamage(g, opp, guard, atk);
  applyDamage(g, p, u, back);
  resolveDeaths(g, p, opp);
  finishAttack(g, p, opp, u);
}

function doAttack(g, p, opp, uid, target) {
  const u = p.board.find((x) => x.uid === uid);
  if (!u) return false;
  u.attacked = true;
  // 规则 3.6 的第二个瞬间时点：攻击宣告后、伤害结算前
  if (canRespond(opp)) {
    g.log.push(`${p.name}【${u.name}】宣告攻击${target === 'face' ? '灵体' : '单位'} —— 等待响应`);
    g.pendingAttack = { attackerIdx: p.idx, uid, target };
    return true;
  }
  return resolveAttack(g, p, opp, uid, target);
}

/** 攻击的实际结算（守卫 → 守护 → 阻挡 → 伤害），供响应窗口在瞬间卡之后继续 */
function resolveAttack(g, p, opp, uid, target) {
  const u = p.board.find((x) => x.uid === uid);
  if (!u) return false;
  const atk = unitAtk(g, p, u);
  const imp = unitImp(g, p, u);

  if (target === 'face') {
    const guard = bestGuard(opp, atk, imp);
    if (guard) { resolveGuardIntercept(g, p, opp, u, guard); return true; }
    const blockers = opp.board.filter((x) => !x.attacked && !x.usedBlock);
    g.log.push(`${p.name}【${u.name}】宣告直击灵体（IMP ${imp}）`);
    if (blockers.length) {
      g.pending = { attackerIdx: p.idx, uid, imp };
      return true;
    }
    resolveFaceHit(g, p, opp, u);
    return true;
  }

  const t = opp.board.find((x) => x.uid === target);
  if (!t) return false;

  // 规则 3.3：单位 vs 单位 —— 互以 ATK 造成伤害，同时结算
  const hpBefore = t.hp;
  const dmgToT = atk;
  const dmgToA = unitAtk(g, opp, t);   // 先取值，避免被打死后取不到

  g.log.push(`${p.name}【${u.name}】(${atk}) ⇄ ${opp.name}【${t.name}】(${dmgToA})`);
  applyDamage(g, opp, t, dmgToT);
  applyDamage(g, p, u, dmgToA);
  resolveDeaths(g, p, opp);

  if (u.kw.includes('践踏') && t.hp <= 0) {
    const over = dmgToT - Math.max(0, hpBefore);
    if (over > 0) {
      g.log.push(`　践踏溢出 ${over} 点`);
      damageFace(g, opp, over);
      g.log.push(`　${opp.name} 剩 ${lifeOf(opp)}`);
    }
  }
  finishAttack(g, p, opp, u);
  return true;
}

/* ────────────────────────────── 升灵仪式 ────────────────────────────── */

/** 按 SR 从小到大凑素材（衍生物 SR0，不能当素材，直接排除） */
function pickMaterials(p, need) {
  // 【银翼方阵长·诺娃】/【混沌编织者·艾恩】：衍生物可作升灵素材，视为 SR1。
  // 其余情况下衍生物 SR0，凑不进任何门槛（规则 4.9 明文）。
  const tokenSR = (p.avatar?.passive || []).some((e) => e.t === 'tokenMaterial') ? 1 : 0;
  const srOf = (u) => (u.id === 'TOKEN' ? tokenSR : (BY_ID.get(u.id)?.sr || 0));
  const units = p.board
    .filter((u) => srOf(u) > 0)
    .sort((a, b) => srOf(a) - srOf(b));
  const picked = [];
  let sum = 0;
  for (const u of units) {
    if (sum >= need) break;
    picked.push(u);
    sum += srOf(u);
  }
  return sum >= need ? { picked, sum } : null;
}

/* ────────────────────────────── 合法动作 ────────────────────────────── */

export function legalMoves(g) {
  const p = g.players[g.active];
  const opp = g.players[1 - g.active];
  const moves = [];

  if (p.playsThisTurn < playCapOf(p) && !(p.color === '金' && (p.av || 0) <= 0)) {
    for (let i = 0; i < p.hand.length; i++) {
      const card = BY_ID.get(p.hand[i]);
      if (!card || card.unsupported || !canPay(p, card)) continue;
      if (needsTarget(card)) {
        const side = targetSide(card);
        const pool = side === 'own' ? p.board : opp.board;
        for (const u of pool) moves.push({ type: 'play', i, target: u.uid });
        // 规则 5.7：装备可改为横置进锻造区（每回合产锻造值）——即使场上无单位也能打
        if (card.type === '装备' && (p.forge || []).length < 6) {
          moves.push({ type: 'play', i, mode: 'forge' });
        }
      } else {
        moves.push({ type: 'play', i });
      }
    }
  }
  // 灵体启动能力（每回合 1 次）
  if (p.avatar?.active && !p.avatarUsed) {
    const cost = p.avatar.active?.cost;
    if (!cost || getRes(p) >= cost.n) moves.push({ type: 'avatar' });
  }
  // 金色：从市场区购买（规则 5.9——购买时付金币，进手牌，打出免费）
  if (p.color === '金') {
    for (let i = 0; i < g.market.length; i++) {
      const mc = BY_ID.get(g.market[i]);
      if (!mc) continue;
      const price = mc.cost?.n || 0;
      if (getRes(p) >= price) moves.push({ type: 'buy', i });
    }
  }

  // 升灵仪式：素材足够即可宣告
  if ((p.ascendedThisTurn || 0) < 1) {
    for (const a of p.outer) {
      if (a.used) continue;
      if (pickMaterials(p, a.sr)) moves.push({ type: 'ascend', id: a.id });
    }
  }
  // 粉色：骑升 / 灵体魂装 / 魂装觉醒 / 魂装共鸣（规则 5.11）
  if (p.color === '粉') {
    const nextLv = (p.spiritLv || 0) + 1;
    const nextCard = (p.evolution || []).find((e) => e.lv === nextLv);
    if ((p.rideUsed || 0) < 1 && nextCard && (p.turnCount || 0) >= (RIDE_MIN_TURN[nextLv] || 99)) {
      moves.push({ type: 'ride' });
    }
    const soulCap = 3 + (p.soulCapBonus || 0);
    if ((p.ap || 0) >= 1 && (p.souls || []).length < soulCap) {
      for (const u of p.board) {
        if (u.ascendant) continue;   // 规则 4.9：只有粉色单位可作魂装源
        moves.push({ type: 'attire', uid: u.uid });
      }
      // 规则 5.11【献装】：手牌中的「魂装」卡／粉色单位也可直接作为魂装源
      for (let i = 0; i < p.hand.length; i++) {
        const c = BY_ID.get(p.hand[i]);
        if (c && (c.type === '魂装' || c.type === '单位')) moves.push({ type: 'attire', hand: i });
      }
    }
    if ((p.ap || 0) >= 1) {
      if ((p.awakenUsed || 0) < 1 && (p.souls || []).some((s) => s.state === 'active')) moves.push({ type: 'awaken' });
      if ((p.resonateUsed || 0) < 1 && (p.souls || []).some((s) => s.state === 'sleep')) moves.push({ type: 'resonate' });
    }
  }

  moves.push(...legalAttacks(g, p, opp));
  moves.push(...legalAvatarAttacks(g, p, opp));
  moves.push({ type: 'pass' });
  return moves;
}

/* ────────────────────────────── 视图（给脚本） ────────────────────────────── */

function pubUnit(g, p, u) {
  return {
    uid: u.uid, name: u.name, atk: unitAtk(g, p, u), imp: unitImp(g, p, u),
    hp: u.hp, maxHp: u.maxHp, kw: [...u.kw], frozen: u.frozen, attacked: u.attacked,
    equips: u.equip.length,
  };
}

export function makeView(g, side) {
  const p = g.players[side];
  const opp = g.players[1 - side];
  return {
    turn: g.turn, round: g.round, active: g.active,
    me: {
      color: p.color, life: lifeOf(p), res: getRes(p), resName: RES_NAME[p.color],
      avatar: {
        name: p.avatar?.name, desc: p.avatar?.desc, used: !!p.avatarUsed,
        timing: p.avatar?.active?.timing || 'early',
        // 粉色：灵体当前身材与等级（Lv2 起可亲自作战）
        atk: avatarAtkOf(p), imp: avatarImpOf(p), lv: p.avatar?.lv || 0,
      },
      hand: p.hand.map((id) => { const c = BY_ID.get(id); return c ? { id: c.id, name: c.name, type: c.type, cost: c.cost, atk: c.atk, imp: c.imp, hp: c.hp, kw: c.kw, effects: c.effects, text: c.text, sr: c.sr, av: c.av || 0 } : { id }; }),
      board: p.board.map((u) => pubUnit(g, p, u)),
      lands: p.lands.map((l) => l.name),
      deck: p.deck.length, grave: p.grave.length, plays: p.playsThisTurn, av: p.color === '金' ? p.av : undefined,
      // 脚本要用的状态：锻造区件数（橙的「前两件先锻造」策略依赖它）、外枢区余量、除外区
      forge: (p.forge || []).length,
      outerReady: (p.outer || []).filter((x) => !x.used).length,
      exile: (p.exile || []).length,
      // 粉色：解放区、魂装源、骑升与灵体攻击的剩余次数
      evolution: (p.evolution || []).map((e) => ({ lv: e.lv, name: e.name })),
      souls: (p.souls || []).map((s) => ({ name: s.name, state: s.state })),
      soulGrave: (p.soulGrave || []).length,
      rideUsed: p.rideUsed || 0,
      avatarAtkUsed: p.avatarAtkUsed || 0,
      ap: p.color === '粉' ? p.ap : undefined,
      apMax: p.color === '粉' ? p.apMax : undefined,
    },
    opp: {
      color: opp.color, life: lifeOf(opp), res: getRes(opp), resName: RES_NAME[opp.color],
      handCount: opp.hand.length, board: opp.board.map((u) => pubUnit(g, opp, u)),
      lands: opp.lands.map((l) => l.name), deck: opp.deck.length, grave: opp.grave.length,
    },
    // 市场区是**公共信息**（桌上的 5 张明牌），双方脚本都能看见
    market: (g.market || []).map((id) => {
      const c = BY_ID.get(id);
      return c ? { id: c.id, name: c.name, type: c.type, cost: c.cost, atk: c.atk, imp: c.imp, hp: c.hp, kw: c.kw, av: c.av || 0 } : { id };
    }),
    over: g.over,
  };
}

/* ────────────────────────────── 快照（给观战 UI） ────────────────────────────── */

export function snapshot(g) {
  const mk = (side) => {
    const p = g.players[side];
    return {
      name: p.name, color: p.color, life: lifeOf(p), damage: p.damage.length, res: getRes(p), resName: RES_NAME[p.color],
      avatar: p.avatar?.name || '—', avatarDesc: p.avatar?.desc || '', avatarUsed: !!p.avatarUsed,
      avatarAtk: avatarAtkOf(p), avatarImp: avatarImpOf(p), avatarLv: p.avatar?.lv || 0,
      souls: (p.souls || []).map((s) => ({ name: s.name, state: s.state })),
      soulsActive: (p.souls || []).filter((s) => s.state === 'active').length,
      hand: p.hand.map((id) => {
        const c = BY_ID.get(id);
        return c ? { id: c.id, name: c.name, type: c.type, cost: c.cost, atk: c.atk, imp: c.imp, hp: c.hp, kw: c.kw, rare: c.rare, text: c.text } : { id, name: id };
      }),
      handCount: p.hand.length,
      board: p.board.map((u) => ({
        uid: u.uid, name: u.name, atk: unitAtk(g, p, u), imp: unitImp(g, p, u),
        hp: u.hp, maxHp: u.maxHp, kw: [...u.kw], frozen: u.frozen, attacked: u.attacked,
        equips: u.equip.map((x) => BY_ID.get(x)?.name || x),
      })),
      lands: p.lands.map((l) => l.name),
      deck: p.deck.length, grave: p.grave.length,
      av: p.color === '金' ? p.av : undefined,
      forge: p.color === '橙' ? (p.forge || []).length : undefined,
      // 外枢区：还能降临的外枢灵体数（used=false）；除外区：本局已移出的卡
      outerReady: (p.outer || []).filter((x) => !x.used).length,
      outerTotal: (p.outer || []).length,
      exile: (p.exile || []).length,
    };
  };
  return {
    turn: g.players[g.active].turnCount, round: g.round, active: g.active, over: g.over, winner: g.winner,
    P: [mk(0), mk(1)],
    market: (g.market || []).map((id) => {
      const c = BY_ID.get(id);
      return c ? { id: c.id, name: c.name, type: c.type, cost: c.cost } : { id, name: id };
    }),
  };
}

/* ────────────────────────────── 推进一局 ────────────────────────────── */

function applyMove(g, mv) {
  const p = g.players[g.active];
  const opp = g.players[1 - g.active];
  if (mv.type === 'play') return playCard(g, p, opp, mv.i, mv.target, mv.mode);
  if (mv.type === 'buy') return buyFromMarket(g, p, mv.i);
  if (mv.type === 'attack') {
    if (mv.avatar) return doAvatarAttack(g, p, opp, mv.target);
    return doAttack(g, p, opp, mv.uid, mv.target);
  }
  if (mv.type === 'avatar') {
    const av = p.avatar;
    if (!av || p.avatarUsed) return false;
    p.avatarUsed = true;
    const cost = av.active?.cost;
    // 蓝/银/粉 的资源是动态门槛（手牌数/共鸣/灵压），不能扣；其余按数值扣
    if (cost && !['蓝', '银', '粉'].includes(p.color)) p.res -= cost.n;
    g.log.push(`${p.name} 启动灵体【${av.name}】`);
    runEffects(g, p, opp, { effects: av.active?.effects || [], name: av.name, type: '灵体' }, null);
    checkEnd(g, p, opp);
    return true;
  }
  if (mv.type === 'ascend') {
    // 规则 4.9（v3.3-3）：每回合至多升灵 1 次。
    // 不设此闸时，黑的「复活引擎免费提供素材」会让它一局升灵 2.89 次（全表最高），
    // 配合「外枢灵体回外枢区」形成循环，黑因此涨到 75%。
    if ((p.ascendedThisTurn || 0) >= 1) return false;
    const a = p.outer.find((x) => x.id === mv.id && !x.used);
    if (!a) return false;
    const m = pickMaterials(p, a.sr);
    if (!m) return false;
    for (const u of m.picked) {
      const i = p.board.indexOf(u);
      if (i >= 0) p.board.splice(i, 1);
      for (const eid of u.equip || []) if (deckable(eid)) p.grave.push(eid);
      if (u.ascendant) sendAscendantHome(g, p, u, '被献祭');
      else if (deckable(u.id)) p.grave.push(u.id);
    }
    a.used = true;
    p.ascendedThisTurn = (p.ascendedThisTurn || 0) + 1;
    const nu = {
      uid: UID++, id: a.id, name: a.name, color: p.color,
      atk: a.atk, imp: a.imp, hp: a.hp, maxHp: a.hp, kw: [],
      shield: 0, attacked: false, frozen: false, entered: true, equip: [], temp: { atk: 0, imp: 0 },
      ascendant: a.id,   // ← 外枢灵体标记：死亡时按规则 4.9 回外枢区／进除外区，不进弃牌区
    };
    applyAura(p, nu);
    p.board.push(nu);
    g.log.push(`${p.name} 升灵降临【${a.name}】（献祭 ${m.picked.length} 个，SR ${m.sum}）`);
    runEffects(g, p, opp, { effects: a.effects, name: a.name, type: '外枢灵体' }, null);
    checkEnd(g, p, opp);
    return true;
  }
  /* ── 粉色：骑升 / 魂装 / 觉醒 / 共鸣（规则 5.11） ── */
  if (mv.type === 'ride') {
    if (p.color !== '粉' || (p.rideUsed || 0) >= 1) return false;
    const next = (p.evolution || []).find((e) => e.lv === (p.spiritLv || 0) + 1);
    if (!next) return false;
    if ((p.turnCount || 0) < (RIDE_MIN_TURN[next.lv] || 99)) return false;
    p.rideUsed = (p.rideUsed || 0) + 1;
    // 规则 5.11：骑升前提是「该阶卡已备妥可取」——沙箱以每回合 0.7 成功率建模。
    // 失败不返还次数（这一回合没凑够条件），但也不损失任何资源。
    if (g.rng.next() >= 0.5) {
      g.log.push(`${p.name} 骑升未成（本回合条件不足）`);
      return true;
    }
    const old = p.avatar;
    if (old) p.souls.push({ id: old.id, name: old.name, state: 'active', kind: 'avatar' });
    p.avatar = { ...next, color: '粉', passive: [] };
    p.spiritLv = next.lv;
    p.apMax = Math.min(4, (p.apMax || 2) + 1);   // 规则 5.11：每次骑升从额外卡组 +1AP（上限 4）
    p.gate = Math.max(1, [0, 2, 4, 6, 8][p.spiritLv] || 0);   // 灵压随之上跳（规则 5.11）
    g.log.push(`${p.name} 骑升 → 【${next.name}】（灵压 ${getRes(p)}）`);
    for (const e of next.effects || []) {
      if (e.do === 'soulDraw') {
        const need = Math.max(0, (e.n || 1) - (p.soulDiscount || 0));
        if (need === 0 || consumeSoul(g, p, need)) drawCard(g, p, true);
      } else if (e.do === 'tutorAttire') {
        const idx = p.deck.findIndex((id) => {
          const c = BY_ID.get(id);
          return c && (c.type === '魂装' || /魂装/.test(c.name));
        });
        if (idx >= 0) {
          p.hand.push(p.deck.splice(idx, 1)[0]);
          g.log.push(`　检索「魂装」卡 1 张`);
        }
      } else if (e.do === 'soulBurn') p.soulBurn = e.n || 1;
      else if (e.do === 'soulDiscount') p.soulDiscount = e.n || 1;
      else if (e.do === 'soulHeal') p.soulHeal = e.n || 1;
      else if (e.do === 'soulCap') p.soulCapBonus = e.n || 1;
      else if (e.do === 'soulAura') p.soulAura = e.n || 1;
      else if (e.do === 'soulLegend') p.soulLegend = e.n || 4;
      else if (e.do === 'avatarPierce') p.avatarPierce = e.n || 1;
      else if (e.do === 'avatarDouble') p.avatarDouble = e.n || 2;
    }
    checkEnd(g, p, opp);
    return true;
  }
  if (mv.type === 'attire') {
    if (p.color !== '粉' || (p.ap || 0) < 1) return false;
    p.ap -= 1;   // 魂装费用：1 AP
    // 手牌魂装（献装）：不消耗资源，直接把 1 张手牌叠到灵体下方
    if (mv.hand != null) {
      const cid = p.hand.splice(mv.hand, 1)[0];
      const c = BY_ID.get(cid);
      if (!c) return false;
      p.souls.push({ id: c.id, name: c.name, state: 'active', kind: 'card' });
      g.log.push(`${p.name} 献装：【${c.name}】从手牌叠放于灵体下方（活跃魂装源 ${p.souls.filter((s) => s.state === 'active').length}）`);
      return true;
    }
    const i = p.board.findIndex((u) => u.uid === mv.uid);
    if (i < 0) return false;
    const u = p.board[i];
    if (u.ascendant) return false;   // 外枢灵体不作魂装源
    p.board.splice(i, 1);
    for (const eid of u.equip || []) if (deckable(eid)) p.grave.push(eid);
    p.souls.push({ id: u.id, name: u.name, state: 'active', kind: 'unit' });
    g.log.push(`${p.name} 魂装：【${u.name}】叠放于灵体下方（活跃魂装源 ${p.souls.filter((s) => s.state === 'active').length}）`);
    return true;
  }
  if (mv.type === 'awaken') {
    if (p.color !== '粉' || (p.awakenUsed || 0) >= 1 || (p.ap || 0) < 1) return false;
    p.ap -= 1;
    const src = p.souls.find((x) => x.state === 'active');
    if (!src) return false;
    src.state = 'sleep';   // 规则 5.11：消耗＝面朝下（沉睡），不是移出弃牌区
    p.awakenUsed = 1;
    p.avatarTempAtk = (p.avatarTempAtk || 0) + 2;
    g.log.push(`${p.name} 魂装觉醒：灵体本回合 ATK +2`);
    return true;
  }
  if (mv.type === 'resonate') {
    if (p.color !== '粉' || (p.resonateUsed || 0) >= 1 || (p.ap || 0) < 1) return false;
    p.ap -= 1;
    const s = p.souls.find((x) => x.state === 'sleep');
    if (!s) return false;
    s.state = 'active';   // 共鸣：唤醒沉睡源
    p.resonateUsed = 1;
    g.log.push(`${p.name} 魂装共鸣：唤醒【${s.name}】，抽 1`);
    drawCard(g, p, true);
    return true;
  }
  return false;   // 未知动作类型：不再静默通过（旧版会让主循环以为结算成功）
}

function sameMove(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'play') return a.i === b.i && (a.target ?? null) === (b.target ?? null) && (a.mode ?? null) === (b.mode ?? null);
  if (a.type === 'attack') return a.uid === b.uid && a.target === b.target;
  if (a.type === 'block') return a.uid === b.uid;
  if (a.type === 'buy') return a.i === b.i;          // 旧版对 buy 一律返回 true，任何下标都算"合法"
  if (a.type === 'ascend') return a.id === b.id;
  if (a.type === 'respond') return a.i === b.i && (a.target ?? null) === (b.target ?? null);
  return true;
}

/**
 * 跑完整局。返回 { steps, winner, log, decks }
 * steps[i] = { text, snap } —— UI 只消费 steps，不需要重放引擎。
 */
export function playMatch(opts) {
  const g = createGame(opts);
  const steps = [];
  const push = (text) => steps.push({ text, snap: snapshot(g) });
  push(g.log[g.log.length - 1] || '开局');

  let guard = 0;
  while (!g.over && guard++ < 4000) {
    if (g.phase === 'start') {
      const before = g.log.length;
      startTurn(g);
      push(g.log.slice(before).join('\n'));
      continue;
    }

    // 响应窗口（规则 3.6）：对手宣告后、该卡结算前，先给防守方一次瞬间卡插打机会
    if (g.pendingPlay) {
      const pp = g.pendingPlay;
      const d = g.players[1 - pp.casterIdx];
      const caster = g.players[pp.casterIdx];
      const targetCard = BY_ID.get(pp.id);
      const ctx = {
        kind: 'play',
        card: targetCard
          ? { id: targetCard.id, name: targetCard.name, type: targetCard.type, text: targetCard.text, cost: targetCard.cost }
          : { id: pp.id },
        caster: caster.name,
        casterIdx: pp.casterIdx,
      };
      const rmoves = respondMoves(g, d, ctx);
      let rmv = null;
      try { rmv = d.script?.respond ? d.script.respond(makeView(g, d.idx), ctx, rmoves) : null; } catch { rmv = null; }
      if (!rmv || !rmoves.some((m) => sameMove(m, rmv))) rmv = { type: 'pass' };
      const before = g.log.length;
      g.pendingPlay = null;
      let countered = false;
      if (rmv.type === 'respond') {
        const r = applyRespond(g, d, rmv, pp);
        countered = r.countered;
      }
      if (!countered && targetCard) resolvePlay(g, caster, d, targetCard, pp.targetUid, pp.mode);
      push(g.log.slice(before).join('\n') || '　无响应，原卡结算');
      continue;
    }

    // 响应窗口（规则 3.6）：攻击宣告后、伤害结算前
    if (g.pendingAttack) {
      const pa = g.pendingAttack;
      const a = g.players[pa.attackerIdx];
      const d = g.players[1 - pa.attackerIdx];
      const attacker = a.board.find((x) => x.uid === pa.uid);
      const ctx = {
        kind: 'attack',
        attacker: attacker ? { name: attacker.name, atk: unitAtk(g, a, attacker), imp: unitImp(g, a, attacker), hp: attacker.hp } : null,
        target: pa.target === 'face' ? 'face' : (d.board.find((x) => x.uid === pa.target)?.name || '单位'),
        caster: a.name,
        casterIdx: pa.attackerIdx,
      };
      const rmoves = respondMoves(g, d, ctx);
      let rmv = null;
      try { rmv = d.script?.respond ? d.script.respond(makeView(g, d.idx), ctx, rmoves) : null; } catch { rmv = null; }
      if (!rmv || !rmoves.some((m) => sameMove(m, rmv))) rmv = { type: 'pass' };
      const before = g.log.length;
      g.pendingAttack = null;
      if (rmv.type === 'respond') applyRespond(g, d, rmv, null);
      if (!g.over) resolveAttack(g, a, d, pa.uid, pa.target);
      push(g.log.slice(before).join('\n') || '　无响应，攻击结算');
      continue;
    }

    // 响应窗口（规则 3.6）：回合结束效果触发前
    if (g.pendingEnd) {
      const pe = g.pendingEnd;
      const actor = g.players[pe.actorIdx];
      const d = g.players[1 - pe.actorIdx];
      const ctx = { kind: 'endTurn', caster: actor.name, casterIdx: pe.actorIdx };
      const rmoves = respondMoves(g, d, ctx);
      let rmv = null;
      try { rmv = d.script?.respond ? d.script.respond(makeView(g, d.idx), ctx, rmoves) : null; } catch { rmv = null; }
      if (!rmv || !rmoves.some((m) => sameMove(m, rmv))) rmv = { type: 'pass' };
      const before = g.log.length;
      g.pendingEnd = null;
      if (rmv.type === 'respond') applyRespond(g, d, rmv, null);
      if (!g.over) endTurn(g);
      push(g.log.slice(before).join('\n') || '　回合结束');
      continue;
    }

    // 阻挡窗口：由防守方（非行动方）决定
    if (g.pending) {
      const d = g.players[1 - g.pending.attackerIdx];
      const bmoves = blockMoves(g);
      let mv = null;
      try { mv = d.script?.block ? d.script.block(makeView(g, d.idx), bmoves) : null; } catch { mv = null; }
      if (!mv || !bmoves.some((m) => sameMove(m, mv))) mv = defaultBlock(g, bmoves);
      const before = g.log.length;
      resolveBlock(g, mv);
      push(g.log.slice(before).join('\n') || '　未阻挡，直击命中');
      continue;
    }

    const p = g.players[g.active];
    const moves = legalMoves(g);
    let chosen = null;
    try {
      chosen = p.script?.choose ? p.script.choose(makeView(g, g.active), moves) : null;
    } catch (err) {
      g.log.push(`※ 脚本异常（${p.script?.name || '?'}）：${err.message}`);
    }
    if (!chosen || !moves.some((m) => sameMove(m, chosen))) chosen = moves[moves.length - 1];

    if (chosen.type === 'pass') {
      // 规则 3.6 的第三个瞬间时点：回合结束效果触发前
      const opp2 = g.players[1 - g.active];
      if (canRespond(opp2)) { g.pendingEnd = { actorIdx: g.active }; continue; }
      const before = g.log.length;
      g.log.push(`${p.name} 结束回合`);
      endTurn(g);
      push(g.log.slice(before).join('\n'));
      continue;
    }
    const before = g.log.length;
    const ok = applyMove(g, chosen);
    if (!ok) {
      // 动作在 moves 里却被引擎拒绝：旧版只写「（无事件）」然后继续，
      // 脚本会一次次挑同一个动作，直到 4000 步上限判和。这里强制结束回合并留痕。
      g.log.push(`※ 引擎拒绝了动作 ${JSON.stringify(chosen)} —— 已强制结束回合（这是 bug，请记录）`);
      endTurn(g);
    }
    const text = g.log.slice(before).join('\n') || '（无事件）';
    push(text);
    if (g.over) break;
  }
  if (!g.over) { g.over = true; g.winner = -1; g.log.push('达到回合上限，判和'); }
  const tail = g.log[g.log.length - 1];
  if (steps.length && steps[steps.length - 1].text === tail) steps[steps.length - 1].end = true;
  else steps.push({ text: tail, snap: snapshot(g), end: true });
  return { steps, winner: g.winner, log: g.log, game: g };
}

export { drawCard, getRes };
