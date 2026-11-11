/* =============================================================================
 * MiniMax M2.7 · 地脉牧歌（绿 / 法力制）
 * 模型 ID: minimax-m2.7
 *
 * 选色依据（只来自 01_基本规则 §3 与 02_卡表 §3.4 卡面）：
 *   - 绿的资源是「法力」＝ 2 ＋ 地标数，消耗制；而地标卡自己还带「产 N 点法力」
 *     （幼叶之池 产 1 点法力 / 母神共鸣地 产 2 点法力）。也就是说一张地标同时
 *     抬高法力上限、抬高法力产量、并抬高回合末补牌上限（回合末补至 地标数＋1），
 *     卡面上唯一自洽的三重复利引擎就是「地标」。
 *   - 卡面分布自带完整曲线：1 费底座三张（盖亚幼株 1/1/1、蜉蝣食菌虻 1/1/1、
 *     幼叶之池）、2 费两张（摇篮藤根 1/2/3 守卫、荆棘绞杀）、3 费两张（落叶风暴、
 *     林冠漫步者）、4 费两张（荒原猛犸 4/3/4 践踏、藤海怒涛）、5 费终端一张
 *     （裂地巨犀 5/4/5 践踏）。低费铺场、高费终结，不需要靠灰卡补位。
 *   - 灵体默认取 森林先知·盖亚（被动：回合开始额外 +1 法力；启动：免费 +2 法力，
 *     引擎把它折算成「展示牌库顶置入地标」）。与地标 ramp 同向，早期就能提速。
 *
 * 胜利方式：中速 ramp。
 *   早期用幼叶之池把地标数与法力上限推起来，盖亚幼株／摇篮藤根占住场面；
 *   中期用 荆棘绞杀（点伤 3）与 落叶风暴（全体 2）拆掉对手的单位与守卫，
 *   荒原猛犸／巨兽冲锋（+2/+0 获得践踏与冲锋）做中期推进；
 *   后期靠 裂地巨犀（5/4/5 践踏）与 藤海怒涛（全体 3 伤 ＋ 每张地标回 1）打穿生命。
 * ========================================================================== */

const meta = {
  name: 'MiniMax M2.7 · 地脉牧歌',
  desc: '执行模型 minimax-m2.7；主色 绿；策略 地脉牧歌——绿法力消耗制，用幼叶之池把地标数与法力上限一起滚起来，盖亚幼株／摇篮藤根铺场、荆棘绞杀与落叶风暴清场、荒原猛犸与裂地巨犀的践踏推进斩首。',
  id: 'model:minimaxm27',
  color: '绿'
};

/* ---------------------------------------------------------------------------
 * 1. 卡组：30 张 ＝ 10 个名目 ×3 张（主色单一，不含灰）
 *    相对预组 YD01-04「地脉先觉」的改动：预组是 6 通用＋4 流派件的通用铺场骨架，
 *    我把 大地脉动（引擎口径为 +2 法力，非检索）与 母神共鸣地／涌泉林地 的重复地标
 *    让位给能决定对局的 荆棘绞杀（点伤）、巨兽冲锋（中期推进）、藤海怒涛（清场兼回复），
 *    林冠漫步者保留（每张地标 +1/+1，是地标数变现的出口）。
 *    费用曲线：1-2 档 15 张 / 3-4 档 12 张 / 5-6 档 3 张 / 7+ 档 0 张
 *    （绿系卡面本身最高只有法力 6，故 7+ 档为 0）。
 * -------------------------------------------------------------------------- */
const DECK = [
  ['LQ01-055', 3], // 盖亚幼株   法力1  1/1/1 成长
  ['LQ01-056', 3], // 幼叶之池   法力1  地标 产 1 点法力
  ['LQ01-057', 3], // 摇篮藤根   法力2  1/2/3 守卫
  ['LQ01-058', 3], // 荆棘绞杀   法力2  对 1 个单位造成 3 点伤害
  ['LQ01-060', 3], // 落叶风暴   法力3  对所有敌方单位造成 2 点伤害
  ['LQ01-063', 3], // 林冠漫步者 法力3  2/2/3 每张地标 +1/+1
  ['LQ01-065', 3], // 荒原猛犸   法力4  4/3/4 践踏
  ['LQ01-066', 3], // 裂地巨犀   法力5  5/4/5 践踏
  ['LQ01-068', 3], // 巨兽冲锋   法力2  目标 +2/+0，获得践踏与冲锋
  ['LQ01-072', 3]  // 藤海怒涛   法力4  全体敌方 3 伤；每张地标回复 1
];

function build(pool) {
  const have = {};
  for (let i = 0; i < (pool || []).length; i++) {
    const c = pool[i];
    if (c && c.id) have[c.id] = (have[c.id] || 0) + 1;
  }
  const out = [];
  for (let i = 0; i < DECK.length; i++) {
    const id = DECK[i][0];
    // pool 里每个名目只出现一次，同名张数由卡组表自己决定
    if (have[id]) out.push({ id: id, n: DECK[i][1] });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * 2. 卡面知识表（本卡组用得到的部分）
 * ------------------------------------------------------------------------- */
const INFO = {
  'LQ01-055': { name: '盖亚幼株', type: '单位', cost: 1, sr: 1 },
  'LQ01-056': { name: '幼叶之池', type: '地标', cost: 1, land: true },
  'LQ01-057': { name: '摇篮藤根', type: '单位', cost: 2, sr: 2 },
  'LQ01-058': { name: '荆棘绞杀', type: '法术', cost: 2, dmg: 3, target: 'enemyUnit' },
  'LQ01-060': { name: '落叶风暴', type: '法术', cost: 3, aoe: 2 },
  'LQ01-063': { name: '林冠漫步者', type: '单位', cost: 3, sr: 3 },
  'LQ01-065': { name: '荒原猛犸', type: '单位', cost: 4, sr: 4 },
  'LQ01-066': { name: '裂地巨犀', type: '单位', cost: 5, sr: 5 },
  'LQ01-068': { name: '巨兽冲锋', type: '法术', cost: 2, buff: true },
  'LQ01-072': { name: '藤海怒涛', type: '法术', cost: 4, aoe: 3 }
};

/* 供升格素材判定用的 SR 表 */
const SR_OF = {
  '盖亚幼株': 1, '摇篮藤根': 2, '林冠漫步者': 3, '荒原猛犸': 4, '裂地巨犀': 5
};

function unitCount(list) {
  let n = 0;
  for (let i = 0; i < (list || []).length; i++) if (list[i]) n++;
  return n;
}

function findUnit(list, uid) {
  for (let i = 0; i < (list || []).length; i++) {
    if (list[i] && list[i].uid === uid) return list[i];
  }
  return null;
}

function hasKw(u, kw) {
  if (!u || !u.kw) return false;
  for (let i = 0; i < u.kw.length; i++) if (u.kw[i] === kw) return true;
  return false;
}

function cardOf(view, m) {
  const hand = (view.me && view.me.hand) || [];
  if (!m || typeof m.i !== 'number') return null;
  return hand[m.i] || null;
}

/* ---------------------------------------------------------------------------
 * 3. 出牌评分
 * ------------------------------------------------------------------------- */
function scorePlay(view, m) {
  const c = cardOf(view, m);
  if (!c) return -1;
  const me = view.me || {};
  const opp = view.opp || {};
  const myBoard = me.board || [];
  const oppBoard = opp.board || [];
  const myUnits = unitCount(myBoard);
  const oppUnits = unitCount(oppBoard);
  const res = me.res || 0;
  const id = c.id || '';
  const info = INFO[id];

  if (typeof id === 'string' && id.indexOf('AP01-') === 0) {
    return res <= 2 ? 95 : 50; // 编外 AP 卡：资源紧张时造 AP
  }

  if (!info) {
    const cost = c.cost && typeof c.cost.n === 'number' ? c.cost.n : 9;
    return cost <= 2 ? 10 : 2;
  }

  switch (id) {
    /* ---- 地标：绿的核心引擎，越早越好，但要给场面留钱 ---- */
    case 'LQ01-056': // 幼叶之池 1 费地标
      return res >= 2 ? 88 : (res === 1 ? 70 : -1);

    /* ---- 1 费底座 ---- */
    case 'LQ01-055': // 盖亚幼株 1/1/1 成长
      return myUnits <= 7 ? 76 : 42;

    /* ---- 2 费 ---- */
    case 'LQ01-057': // 摇篮藤根 1/2/3 守卫
      return oppUnits >= 1 ? 78 : 64;
    case 'LQ01-068': // 巨兽冲锋：+2/+0 ＋ 践踏与冲锋（本回合）
      return myUnits >= 1 ? 70 : -1;
    case 'LQ01-058': // 荆棘绞杀：对 1 个单位造成 3 点伤害
      return oppUnits >= 1 ? 68 : -1;

    /* ---- 3 费 ---- */
    case 'LQ01-063': // 林冠漫步者 2/2/3，每张地标 +1/+1
      return myUnits <= 6 ? 74 : 56;
    case 'LQ01-060': // 落叶风暴：全体敌方 2 伤
      if (oppUnits >= 2) return 71;
      if (oppUnits === 1) {
        const t = oppBoard[0];
        return t && (t.hp || 0) <= 2 ? 62 : 22;
      }
      return -1;

    /* ---- 4-5 费：推进与终结 ---- */
    case 'LQ01-065': // 荒原猛犸 4/3/4 践踏
      return myUnits <= 6 ? 72 : 58;
    case 'LQ01-066': // 裂地巨犀 5/4/5 践踏
      return myUnits <= 6 ? 71 : 57;
    case 'LQ01-072': { // 藤海怒涛：全体敌方 3 伤 ＋ 每张地标回复 1
      const lands = (me.lands && me.lands.length) ? me.lands.length : 0;
      let s = 50;
      if (oppUnits >= 2) s += 24;
      if (oppUnits === 1) {
        const t = oppBoard[0];
        if (t && (t.hp || 0) <= 3) s += 16;
      }
      if (me.life <= 12 && lands >= 2) s += 10;
      return s;
    }
    default:
      return 20;
  }
}

/* 目标微调：点伤类优先选「能打死且威胁大」的敌方单位 */
function scoreTarget(view, m) {
  const c = cardOf(view, m);
  if (!c || m.target === undefined || m.target === null) return 0;
  const info = INFO[c.id];
  const oppBoard = (view.opp && view.opp.board) || [];
  const myBoard = (view.me && view.me.board) || [];
  const t = findUnit(oppBoard, m.target);
  const mine = findUnit(myBoard, m.target);

  if (info && info.target === 'enemyUnit') {
    if (!t) return -5;
    const dmg = info.dmg || 3;
    let s = 0;
    if ((t.hp || 0) <= dmg) s += 40 + (t.atk || 0) * 3;
    else s -= 22;
    if (hasKw(t, '守卫')) s += 4;
    if ((t.atk || 0) >= 5) s += 6;
    return s;
  }
  if (info && info.buff) {
    // 巨兽冲锋：给自己的高 ATK 单位
    if (!mine) return -3;
    return (mine.atk || 0);
  }
  if (t) return 3;
  if (mine) return 0.5;
  return 0;
}

/* ---------------------------------------------------------------------------
 * 4. 攻击评分
 * ------------------------------------------------------------------------- */
function scoreAttack(view, m) {
  const me = view.me || {};
  const opp = view.opp || {};
  const my = findUnit(me.board || [], m.uid);
  if (!my) return -1;
  const atk = my.atk || 0;
  const imp = my.imp || 0;
  const eff = Math.max(atk, imp);
  const myHp = my.hp || 0;
  const oppLife = typeof opp.life === 'number' ? opp.life : 20;

  if (m.target === 'face') {
    if (eff >= oppLife) return 1000;
    let s = 40 + eff * 2;
    if (oppLife <= 6 + eff * 2) s += 24;
    if (hasKw(my, '践踏')) s += 6;
    if (hasKw(my, '冲锋')) s += 4;
    return s;
  }

  const t = findUnit(opp.board || [], m.target);
  if (!t) return 20;
  const canKill = atk >= (t.hp || 0);
  const tAtk = t.atk || 0;
  const tKillsMe = tAtk >= myHp;
  const guard = hasKw(t, '守卫');
  const myTrample = hasKw(my, '践踏');
  let s = 0;

  if (canKill) {
    s = 54 + tAtk * 2 + (guard ? 6 : 0);
    if (tKillsMe) s = tAtk >= 4 ? 46 : -4;
    if (myTrample) s += (atk - (t.hp || 0)) * 6;
    if (tAtk >= 4) s += 6;
  } else {
    s = -16 + tAtk * 0.5;
    if (guard) s -= 6;
    if (myTrample) s += Math.max(0, atk - (t.hp || 0)) * 4;
  }
  if (oppLife <= eff * 2) s += 10;
  return s;
}

/* ---------------------------------------------------------------------------
 * 5. 阻挡：优先牺牲便宜单位，保住高 ATK 主力
 * ------------------------------------------------------------------------- */
function chooseBlock(view, bmoves) {
  if (!bmoves || !bmoves.length) return null;
  const myBoard = (view.me && view.me.board) || [];
  let best = null;
  let bestScore = -1e9;
  for (let i = 0; i < bmoves.length; i++) {
    const bm = bmoves[i];
    if (!bm || bm.type !== 'block') continue;
    const u = findUnit(myBoard, bm.uid);
    if (!u) continue;
    let s = 0;
    if ((u.atk || 0) <= 1 && (u.hp || 0) <= 3) s += 10;
    if (hasKw(u, '守卫')) s += 3;
    s -= (u.atk || 0) * 1.5;
    s -= (u.hp || 0) * 0.2;
    if (s > bestScore) { bestScore = s; best = bm; }
  }
  if (best) return best;
  for (let i = 0; i < bmoves.length; i++) {
    if (bmoves[i] && bmoves[i].type === 'noBlock') return bmoves[i];
  }
  return bmoves[bmoves.length - 1];
}

/* ---------------------------------------------------------------------------
 * 6. 升灵：素材（场上同 SR 单位）够时才宣告
 * ------------------------------------------------------------------------- */
function boardSr(board) {
  let sum = 0;
  const same = {};
  for (let i = 0; i < (board || []).length; i++) {
    const u = board[i];
    if (!u) continue;
    const sr = SR_OF[u.name];
    if (!sr) continue;
    sum += sr;
    same[sr] = (same[sr] || 0) + 1;
  }
  let maxSame = 0;
  for (const k in same) if (same[k] > maxSame) maxSame = same[k];
  return { sum: sum, maxSame: maxSame, count: unitCount(board) };
}

function ascendReady(view) {
  const b = boardSr((view.me && view.me.board) || []);
  // 灵基升格要 3 个同 SR 素材；魂铸要素材 SR 合计 ≥5/6。场面够厚才升，避免自断手脚。
  if (b.count >= 6 && (b.maxSame >= 3 || b.sum >= 8)) return true;
  return false;
}

/* ---------------------------------------------------------------------------
 * 7. 主决策
 * ------------------------------------------------------------------------- */
function passMove(moves) {
  for (let i = 0; i < moves.length; i++) {
    if (moves[i] && moves[i].type === 'pass') return moves[i];
  }
  return moves[moves.length - 1];
}

function decide(view, moves) {
  const me = view.me || {};

  /* 7.1 灵体启动：盖亚的启动免费 +2 法力，越早用越好 */
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'avatar') continue;
    const av = me.avatar;
    if (av && av.used) continue;
    if (av && av.timing === 'late') break;
    return m;
  }

  /* 7.2 升灵（若引擎给出该动作且素材齐） */
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'ascend') continue;
    if (ascendReady(view)) return m;
    break;
  }

  /* 7.3 出牌 */
  let bestPlay = null;
  let bestPlayScore = -1;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'play') continue;
    const s = scorePlay(view, m) + scoreTarget(view, m);
    if (s > bestPlayScore) { bestPlayScore = s; bestPlay = m; }
  }
  if (bestPlay && bestPlayScore > 0) return bestPlay;

  /* 7.4 攻击 */
  let bestAtk = null;
  let bestAtkScore = -1;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'attack') continue;
    const s = scoreAttack(view, m);
    if (s > bestAtkScore) { bestAtkScore = s; bestAtk = m; }
  }
  if (bestAtk && bestAtkScore > 0) return bestAtk;

  return passMove(moves);
}

function choose(view, moves) {
  try {
    if (!moves || !moves.length) return null;
    return decide(view || {}, moves);
  } catch (e) {
    return passMove(moves);
  }
}

function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return null;
    return chooseBlock(view || {}, bmoves);
  } catch (e) {
    return bmoves[bmoves.length - 1];
  }
}
