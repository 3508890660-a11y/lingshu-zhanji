// agent-deepseekv4pro.js —— 《灵枢战纪》颜色构筑 AI
// 主色：银（共鸣制）　策略：银翼方阵
// 资源口径：共鸣 = 场上卡牌数 + 地标数（下限 1），回合开始快照为「门槛」，
//           门槛不消耗、每回合最多打 3 张；回合末补至 min(max(共鸣,3),5)。
// 灵体：银翼元帅·艾莉丝（被动：单位进场 +1 ATK；启动：免费生成 1 个银翼新兵）。

const meta = {
  name: 'deepseek v4pro · 银翼方阵',
  desc: '执行模型 deepseek-v4-pro；颜色 银；策略 银翼方阵——共鸣门槛制下以低费单位与衍生物快速铺场，用「共鸣序曲/升格逆鳞」永久 +1/+1 滚雪球，以「碎晶冲击/终章齐鸣」点杀清场后多单位 IMP 直击灵体',
  id: 'model:deepseekv4pro',
  color: '银'
};

/* ───────────────────────── 组卡（30 张） ───────────────────────── */

function build(pool) {
  // 13 名目：银 12 + 灰 1。曲线 1-2/3-4/5-6/7+ = 21/8/1/0。单位 17 张优先铺场。
  return [
    { id: 'LQ01-145', n: 3 }, // 银翼列兵      共鸣1 1/1/1       铺场基石
    { id: 'LQ01-146', n: 3 }, // 银翼长枪兵    共鸣1 1/2/1 守卫  护脸
    { id: 'LQ01-147', n: 3 }, // 银翼枪骑兵    共鸣1 2/1/1 冲锋  立即攻击
    { id: 'LQ01-151', n: 3 }, // 银翼战马      共鸣2 2/1/2 + 生成1 新兵
    { id: 'LQ01-152', n: 3 }, // 银翼方阵圣盾  共鸣3 2/1/3 守护1
    { id: 'LQ01-150', n: 3 }, // 征募长号      共鸣2 生成2 银翼新兵(1/1/2)
    { id: 'LQ01-155', n: 3 }, // 共鸣序曲      共鸣2 全体 +1/+1（雪球核心）
    { id: 'LQ01-161', n: 3 }, // 升格逆鳞      共鸣3 全体 +1/+1（雪球核心）
    { id: 'LQ01-149', n: 1 }, // 方阵壁垒      共鸣2 抽1 + 全体+0/+1
    { id: 'LQ01-290', n: 2 }, // 碎晶冲击      通用2 单体 3 伤（灰·廉价点杀）
    { id: 'LQ01-153', n: 1 }, // 银翼重装要塞  共鸣4 2/2/6 守卫
    { id: 'LQ01-158', n: 1 }, // 终章齐鸣      共鸣4 全体敌方 2 伤
    { id: 'LQ01-162', n: 1 }, // 方阵巨像      共鸣5 5/4/6      终端
  ];
}

/* ───────────────────────── 出牌优先级 ───────────────────────── */

// 越小越先出：单位(冲锋优先) → 铺场衍生物 → buff → 点杀/清场
function cardPriority(id) {
  switch (id) {
    case 'LQ01-147': return 0; // 枪骑兵（冲锋，可立即打）
    case 'LQ01-145': return 1; // 列兵
    case 'LQ01-146': return 1; // 长枪兵（守卫）
    case 'LQ01-151': return 2; // 战马（单位+衍生物）
    case 'LQ01-152': return 2; // 方阵圣盾（守护1 单位）
    case 'LQ01-153': return 2; // 要塞（守卫）
    case 'LQ01-162': return 3; // 巨像
    case 'LQ01-150': return 4; // 征募（2 衍生物）
    case 'LQ01-155': return 5; // 序曲 +1/+1
    case 'LQ01-161': return 5; // 逆鳞 +1/+1
    case 'LQ01-149': return 6; // 壁垒 抽1 + hp
    case 'LQ01-290': return 7; // 碎晶冲击（点杀）
    case 'LQ01-158': return 8; // 终章齐鸣（AOE）
    default: return 9;
  }
}

function pickPlay(moves, me, opp) {
  const plays = moves.filter((m) => m.type === 'play');
  if (!plays.length) return null;
  let best = null;
  let bestP = Infinity;
  for (const m of plays) {
    const c = me.hand[m.i];
    if (!c) continue;
    // 空场时不浪费 AOE / 纯 buff（149 是抽牌，空场也要打）
    if (c.id === 'LQ01-158' && opp.board.length === 0) continue;
    if ((c.id === 'LQ01-155' || c.id === 'LQ01-161') && me.board.length === 0) continue;
    const p = cardPriority(c.id);
    if (p < bestP) { bestP = p; best = m; }
  }
  return best;
}

/* ───────────────────────── 攻击决策 ───────────────────────── */

// 当前可打脸的总 IMP（每个能攻击的单位只计一次）
function faceDamage(moves, me) {
  const seen = new Set();
  let dmg = 0;
  for (const m of moves) {
    if (m.type === 'attack' && m.target === 'face' && !seen.has(m.uid)) {
      seen.add(m.uid);
      const u = me.board.find((x) => x.uid === m.uid);
      if (u) dmg += u.imp;
    }
  }
  return dmg;
}

function pickAttack(moves, me, opp) {
  const atks = moves.filter((m) => m.type === 'attack');
  if (!atks.length) return null;
  const face = atks.filter((m) => m.target === 'face');

  // 1) 斩杀：可打脸伤害 ≥ 对手生命
  if (face.length && faceDamage(moves, me) >= opp.life) return face[0];

  // 2) 无损交换：我杀对方且自己不死
  for (const m of atks) {
    if (m.target === 'face') continue;
    const a = me.board.find((u) => u.uid === m.uid);
    const d = opp.board.find((u) => u.uid === m.target);
    if (!a || !d) continue;
    if (a.atk >= d.hp && d.atk < a.hp) return m;
  }

  // 3) 危险清除：对手场上总 IMP 足以斩杀我时，优先撞掉其高 IMP 单位
  const threat = opp.board.reduce((s, u) => s + u.imp, 0);
  if (threat >= me.life) {
    let best = null;
    let bestImp = -1;
    for (const m of atks) {
      if (m.target === 'face') continue;
      const d = opp.board.find((u) => u.uid === m.target);
      if (d && d.imp > bestImp) { bestImp = d.imp; best = m; }
    }
    if (best) return best;
  }

  // 4) 打脸（脸无反伤，收益稳定）
  if (face.length) return face[0];
  return null;
}

/* ───────────────────────── 升灵（仅斩杀/清场） ───────────────────────── */

function pickAscend(moves, me, opp) {
  const asc = moves.filter((m) => m.type === 'ascend');
  if (!asc.length) return null;
  // 280 银翼旗舰·船首炮：降临直伤 4，仅用于斩杀
  const gun = asc.find((m) => m.id === 'LQ01-280');
  if (gun && opp.life <= 4) return gun;
  // 279 银翼方阵终焉巨械：降临全体敌方 3 伤，仅当对面铺开且我方有余量
  const mech = asc.find((m) => m.id === 'LQ01-279');
  if (mech && opp.board.length >= 3 && me.board.length >= 5) return mech;
  return null;
}

/* ───────────────────────── 主决策 ───────────────────────── */

function choose(view, moves) {
  const me = view.me;
  const opp = view.opp;
  const pass = moves.find((m) => m.type === 'pass');

  // 1) 灵体启动：免费衍生物，铺场优先
  const av = moves.find((m) => m.type === 'avatar');
  if (av) return av;

  // 2) 出牌：单位/衍生物 → buff → 点杀/清场
  const play = pickPlay(moves, me, opp);
  if (play) return play;

  // 3) 攻击：斩杀 → 无损交换 → 危险清除 → 打脸
  const atk = pickAttack(moves, me, opp);
  if (atk) return atk;

  // 4) 升灵：斩杀 / 清场
  const asc = pickAscend(moves, me, opp);
  if (asc) return asc;

  // 5) 结束回合（安全兜底）
  return pass || moves[moves.length - 1];
}

/* ───────────────────────── 阻挡（防守窗口） ───────────────────────── */

function block(view, bmoves) {
  const noBlock = bmoves.find((m) => m.type === 'noBlock');
  const blocks = bmoves.filter((m) => m.type === 'block');
  if (!blocks.length) return noBlock;

  // 银翼方阵是铺场进攻卡组：单位价值在进攻，平时不挡，仅当濒死才用最肉的挡
  if (view.me.life <= 3) {
    let best = blocks[0];
    let bestHp = -1;
    for (const m of blocks) {
      const b = view.me.board.find((u) => u.uid === m.uid);
      if (b && b.hp > bestHp) { bestHp = b.hp; best = m; }
    }
    return best;
  }
  return noBlock;
}
