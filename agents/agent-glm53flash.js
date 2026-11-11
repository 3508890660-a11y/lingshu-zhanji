// ============================================================
// glm53flash · 橙 · 千叠淬炉（橙A 淬炼专精 · 弗吉奥）
// 资源口径：锻造值 = 3 + 锻造区装备产出（上限10），消耗型；
//           回合开始抽 2，锻造区有装备再抽 1 —— 全池抽牌最多的色。
// 路线：锻造区经济 + 淬炼指示物（弗吉奥/布鲁诺降门槛）→ 淬河·千叠锻浪 AOE 收尾。
// ============================================================

const meta = {
  name: 'glm53flash · 千叠淬炉',
  desc: '执行模型 glm53flash；颜色 橙；策略 千叠淬炉（锻造区产资源＋弗吉奥淬炼指示物＋淬河·千叠锻浪 AOE 收尾的中速）',
  id: 'model:glm53flash',
  color: '橙'
};

// ---------- 构筑 ----------
// 主力 10 名目 ×3（全橙色），不足时按 FILL 顺序补橙，再不足用池内卡补满。
const CORE = [
  'LQ01-110', // 速淬短刃   装备1 冲锋/产1
  'LQ01-111', // 制式军刀   装备1 +1/+0/产1
  'LQ01-112', // 双股锻钳   装备2 +1/+1/产2
  'LQ01-109', // 军械新兵·阿彻 单位1 装备精通
  'LQ01-123', // 布线学徒·诺诺 单位1 手牌装备进锻造区
  'LQ01-115', // 淬层监工·布鲁诺 单位2 淬炼需求-1
  'LQ01-114', // 冷却守卫   单位2 守卫
  'LQ01-117', // 淬火号令   法术2 放淬炼指示物
  'LQ01-122', // 批量锻造   法术2 检索装备进锻造区
  'LQ01-118'  // 淬河·千叠锻浪 法术3 按指示物全场AOE
];
const FILL = ['LQ01-113', 'LQ01-119', 'LQ01-121', 'LQ01-116', 'LQ01-124', 'LQ01-120', 'LQ01-292', 'LQ01-286'];

function countOf(deck, id) {
  let n = 0;
  for (let k = 0; k < deck.length; k++) if (deck[k].id === id) n += deck[k].n;
  return n;
}

function build(pool) {
  const list = pool || [];
  const have = {};
  for (let i = 0; i < list.length; i++) have[list[i].id] = list[i];
  const deck = [];
  let total = 0;
  const tryAdd = function (id) {
    if (!have[id]) return false;
    const room = Math.min(3 - countOf(deck, id), 30 - total);
    if (room <= 0) return false;
    deck.push({ id: id, n: room });
    total += room;
    return true;
  };
  for (let i = 0; i < CORE.length; i++) tryAdd(CORE[i]);
  for (let i = 0; i < FILL.length; i++) tryAdd(FILL[i]);
  if (total < 30) {
    for (let i = 0; i < list.length && total < 30; i++) tryAdd(list[i].id);
  }
  return deck;
}

// ---------- 决策 ----------
function cardOf(hand, m) {
  if (!m || m.type !== 'play' || typeof m.i !== 'number') return null;
  return hand[m.i] || null;
}

function findU(board, uid) {
  for (let i = 0; i < board.length; i++) if (board[i].uid === uid) return board[i];
  return null;
}

function hasKw(u, kw) {
  return !!(u && u.kw && u.kw.indexOf(kw) >= 0);
}

// 出牌评分
function playScore(view, m) {
  const c = cardOf(view.me.hand, m);
  if (!c) return -1;
  const turn = view.turn || view.round || 1;
  const oppN = (view.opp.board || []).length;
  const forgeSmall = (typeof view.me.forge === 'number' ? view.me.forge : 3) < 3;
  switch (c.id) {
    case 'LQ01-123': { // 诺诺：手牌装备进锻造区，前期优先
      const hasEq = (view.me.hand || []).some(function (x) { return x.type === '装备'; });
      return hasEq ? (turn <= 2 ? 4 : 3) : 1;
    }
    case 'LQ01-109': return 3;       // 阿彻：场上有装备就是 2/1/2
    case 'LQ01-115': return 4;       // 布鲁诺：淬炼门槛 -1
    case 'LQ01-114': return oppN >= 2 ? 4 : 2; // 冷却守卫：对面铺场时优先防守
    case 'LQ01-117': return oppN >= 1 ? 4 : 2; // 淬火号令：放指示物
    case 'LQ01-122': return forgeSmall ? 4 : 1; // 批量锻造：锻造区缺货才检索
    default: break;
  }
  if (c.type === '装备') {
    if (m.mode === 'forge') return forgeSmall ? 3 : 2; // 进锻造区：为下回合铺经济
    if (c.id === 'LQ01-110') return 5; // 短刃＝冲锋，最优武装
    if (c.id === 'LQ01-112') return 4; // 锻钳 +1/+1
    return 3;                          // 军刀 +1/+0
  }
  return 1;
}

// 攻击评分
function attackScore(view, m) {
  const u = findU(view.me.board || [], m.uid);
  const atk = u ? (u.atk || 0) : 0;
  const hp = u ? (u.hp || 1) : 1;
  const oppLife = (view.opp && view.opp.life) || 20;
  if (m.target === 'face') {
    return oppLife <= atk ? 100 : 2;
  }
  const e = findU(view.opp.board || [], m.target);
  if (!e) return 1;
  if (oppLife <= atk && !hasKw(e, '圣盾')) return 90; // 有守卫挡脸时先拆守卫
  const kill = atk >= (e.hp || 1);
  const dies = (e.atk || 0) >= hp;
  let s = 1;
  if (kill) s += 3;
  if (dies) s -= 2;
  if (kill && !dies) s += 1;      // 白赚
  if ((e.atk || 0) >= 3) s += 1;  // 优先拆大威胁
  return s;
}

function decide(view, moves) {
  if (!moves || !moves.length) return undefined;
  let passM = null;
  for (let i = moves.length - 1; i >= 0; i--) if (moves[i].type === 'pass') { passM = moves[i]; break; }
  if (!passM) passM = moves[moves.length - 1];
  if (view && view.over) return passM;

  const me = view.me || {};
  const hand = me.hand || [];
  const oppBoard = (view.opp && view.opp.board) || [];
  const avatarUsed = !!(me.avatar && me.avatar.used);

  // 1. 升灵：引擎判定素材/联结值够即宣告（外枢大件不占卡位，回归外枢区可反复）
  for (let i = 0; i < moves.length; i++) if (moves[i].type === 'ascend') return moves[i];

  // 2. 灵体启动（弗吉奥：放 1 个淬炼指示物）——每回合必点，先于 AOE 结算
  if (!avatarUsed) {
    const av = moves.find(function (m) { return m.type === 'avatar'; });
    if (av) return av;
  }

  // 3. 淬火号令：再放一个指示物，尽快凑满触发
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type === 'play') {
      const c = cardOf(hand, m);
      if (c && c.id === 'LQ01-117' && oppBoard.length >= 1) return m;
    }
  }

  // 4. 淬河·千叠锻浪：敌方场面 ≥2 时清场
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type === 'play') {
      const c = cardOf(hand, m);
      if (c && c.id === 'LQ01-118' && oppBoard.length >= 2) return m;
    }
  }

  // 5. 常规出牌（单位/装备/批量锻造）
  let bestP = null, bestPs = 1; // 低于 2 分的杂牌不出
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'play') continue;
    const s = playScore(view, m);
    if (s > bestPs) { bestPs = s; bestP = m; }
  }
  if (bestP) return bestP;

  // 6. 攻击：斩杀 > 白赚交换 > 有赚交换 > 蹭脸
  let bestA = null, bestAs = 1;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'attack') continue;
    const s = attackScore(view, m);
    if (s > bestAs) { bestAs = s; bestA = m; }
  }
  if (bestA) return bestA;

  return passM;
}

function choose(view, moves) {
  try {
    const r = decide(view, moves);
    if (!r) return moves[moves.length - 1];
    return r;
  } catch (e) {
    return moves[moves.length - 1];
  }
}

function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return undefined;
    let noBlock = null;
    const blocks = [];
    for (let i = 0; i < bmoves.length; i++) {
      if (bmoves[i].type === 'noBlock') noBlock = bmoves[i];
      else if (bmoves[i].type === 'block') blocks.push(bmoves[i]);
    }
    const fb = noBlock || bmoves[bmoves.length - 1];
    if (!blocks.length) return fb;
    const mine = (view.me && view.me.board) || [];
    let best = null, bestS = -1;
    for (let i = 0; i < blocks.length; i++) {
      const u = findU(mine, blocks[i].uid);
      if (!u) continue;
      let s = (u.hp || 0) * 0.1;
      if (hasKw(u, '守卫')) s += 3;
      if (s > bestS) { bestS = s; best = blocks[i]; }
    }
    if (!best) return fb;
    const hasGuard = bestS >= 3;
    // 有守卫必挡；没守卫时生命吃紧才用身体挡
    if (hasGuard || (view.me.life || 20) <= 8) return best;
    return fb;
  } catch (e) {
    return bmoves[bmoves.length - 1];
  }
}
