/*
 * agents/agent-minimaxm31flash.js
 * 《灵枢战纪》颜色构筑 AI —— MiniMax M3.1flash
 *
 * 执行模型：minimax-m3.1-flash
 * 自选主色：青（资源：法力）
 * 自选策略：潮汐引擎（抽牌雪球 · 守卫锁脸 · 涡流收官）
 *
 * ── 为什么选青色（依据 rules.js 的实装，不按卡表文字想当然）────────────
 *   1) 资源：refreshRes 里青 = min(回合+1, 6)，灵体【潮汐唤者·温蒂妮】回合开始再 +1
 *      ⇒ 回合 1 有 3 点、回合 2 有 4 点、回合 4 起 6 点、回合 5 起封顶 7 点。
 *      费用是**消耗制**（青不在 GATE_COLORS 里），法力用完即止，
 *      所以每一块法力必须在同回合变成场面或手牌。
 *   2) 抽牌：青回合开始抽 2，回合末再按「本回合打出数 ÷2」额外抽（规则 5.8），
 *      灵体启动还能免费抽 1 ⇒ 青色是全表唯一「打得越多抽得越多」的颜色。
 *      加上 138【连击共鸣】1 费抽 2，这就是本卡组的资源引擎。
 *   3) 弱点（决定打法）：青**没有任何直伤牌**——131 深海重压只打单位、
 *      132 风暴脉冲只打敌方单位、134 涨潮反击（引擎未实装反击窗口）只冻人。
 *      所以青赢不了竞速，只能**中速消耗**：靠守卫把对手的脸锁住，
 *      靠 135 潮汐帷幕的守护1 让我的单位替灵体挨打，
 *      靠 131 拆掉对方的大威胁，再靠 140 涡流长老 / 136 月潮终曲 / 升灵收割。
 *
 * ── 引擎里四条决定胜负的隐藏规则（都已在下面落地）────────────────────
 *   A) legalAttacks：对方场上只要有「守卫」，我就**完全不能打脸**，
 *      所有攻击都被强制指向守卫 ⇒ 拆守卫是青的第一优先级。
 *   B) bestGuard：带「守护1/守护2」的单位会替灵体承受打脸（伤害 −X）
 *      ⇒ 带守护的单位同样必须优先拆，否则我的 IMP 打不进他们的生命卡。
 *   C) unitAtk：涡流X 按**本回合打出数**加 ATK ⇒ 140 涡流长老要「先出牌、后攻击」，
 *      每回合多打 1 张卡就多 1 点 ATK（引擎里被重复计了两次，收益更高）。
 *   D) reconstruct：青色牌库空时重构的代价是**清空法力**（白/青 → res = 0）
 *      ⇒ 牌库薄的时候绝不能再抽牌，drawScore 里有硬闸。
 *
 * 硬约束：
 *   - 纯源码，无 import / require；引擎以 new Function('api', src + '; return {...}') 编译；
 *   - choose/block 必须返回 moves / bmoves 里的某一个对象（同引用）；
 *   - 不修改 view / moves / bmoves，排序一律先 slice()；
 *   - 任何未知动作类型都兜底到 pass。
 */

const meta = {
  name: 'MiniMax M3.1flash · 潮汐引擎',
  desc: '执行模型 minimax-m3.1-flash；颜色 青；策略 潮汐引擎——以连击共鸣（1 费抽 2）与青色「打出数÷2 抽牌」把手牌滚成雪球，用守卫单位锁住对手的脸、潮汐帷幕的守护1 让我的单位替灵体挨打，再以深海重压拆威胁、涡流长老与月潮终曲收官。',
  id: 'model:minimaxm31flash',
  color: '青'
};

/* ────────────────────────── 卡组（30 张 · 10 名目 ×3） ──────────────────────────
 * 费用曲线：1–2 费 15 张 ／ 3–4 费 12 张 ／ 5–6 费 3 张 ／ 7+ 费 0 张
 *
 * 关键卡（费用／身材／引擎实装效果）：
 *   138 连击共鸣   法力1  抽 2            —— 卡组的发动机：1 点法力换 2 张牌
 *   139 幻象连击   法力2  抽 1 ＋ 1 法力  —— 净 1 点法力换 1 张牌，还倒贴 1 点法力
 *   127 潮汐幼灵   法力1  1/1/2 潮汐      —— 最便宜的身板，最便宜的升灵素材（SR1）
 *   289 借律(灰)   通用1  全体 +1 ATK    —— 1 点法力永久加攻；灰卡不混色
 *   292 石肤守卫(灰)通用2 1/2/3 守卫      —— 2 费的守卫：锁住对手不能打我脸
 *   133 潮卫·堤灵  法力3  2/2/4 守卫      —— 中期墙，同时给友方 +0/+1
 *   135 潮汐帷幕   法力3  结界 全体守护1  —— 让我的单位替灵体挨打（bestGuard 机制）
 *   131 深海重压   法力3  对 1 单位 3 伤  —— 唯一的解场口，优先拆对方的守卫/守护
 *   140 涡流长老   法力4  3/2/4 涡流3     —— 本回合每打 1 张卡 +1 ATK，出牌越多越强
 *   136 月潮终曲   法力6  5/4/7 战吼全体+1/+1 —— 终结牌，自带 4 点 IMP
 *
 * 与预组 YD01-08「潮汐回廊」（127~136 各 3）的差异（改了什么、为什么）：
 *   去掉 130 潮位罗盘（地标在青色不产法力，引擎只让它在进场时抽 1 张）、
 *        132 风暴脉冲（引擎只结算 1 点群体伤害，3 点法力太贵）、
 *        134 涨潮反击（引擎未实装反击窗口，只剩「冻结对方第一个单位」）、
 *        129 潮汐号令（2 点法力抽 1 张，被 138 完全压制）；
 *   换成 138 连击共鸣、139 幻象连击、289 借律、292 石肤守卫
 *   —— 把「抽牌密度」与「加攻密度」这两个青色的真实优势拉满。
 * ─────────────────────────────────────────────────────────────────────────── */

const DECK = [
  { id: 'LQ01-138', n: 3 },   // 连击共鸣    法力1  抽 2
  { id: 'LQ01-127', n: 3 },   // 潮汐幼灵    法力1  1/1/2 潮汐
  { id: 'LQ01-289', n: 3 },   // 借律(灰)    通用1  全体 +1 ATK
  { id: 'LQ01-292', n: 3 },   // 石肤守卫(灰)通用2  1/2/3 守卫
  { id: 'LQ01-139', n: 3 },   // 幻象连击    法力2  抽 1 ＋ 1 法力
  { id: 'LQ01-133', n: 3 },   // 潮卫·堤灵   法力3  2/2/4 守卫
  { id: 'LQ01-131', n: 3 },   // 深海重压    法力3  对 1 个单位 3 点伤害
  { id: 'LQ01-135', n: 3 },   // 潮汐帷幕    法力3  结界  全体获得守护1
  { id: 'LQ01-140', n: 3 },   // 涡流长老    法力4  3/2/4 涡流3
  { id: 'LQ01-136', n: 3 }    // 月潮终曲    法力6  5/4/7 战吼 全体 +1/+1
];

/* 外枢灵体（青）：id → 升灵素材 SR 门槛 / 身材 / 降临效果 */
const OUTER = {
  'LQ01-275': { sr: 3, body: '4/3/6', note: '降临：对对手 2 点' },
  'LQ01-276': { sr: 5, body: '6/5/7', note: '降临：全体敌方 2 点' },
  'LQ01-277': { sr: 6, body: '7/5/8', note: '降临：抽 3' }
};

/* ────────────────────────── 组卡 ────────────────────────── */

function build(pool) {
  const list = pool || [];
  const ids = new Set(list.map((c) => c.id));
  const picked = new Map();

  const add = (id, n) => {
    if (ids.size && !ids.has(id)) return;              // 卡池里没有就跳过
    picked.set(id, Math.min(3, (picked.get(id) || 0) + n));
  };
  for (const d of DECK) add(d.id, d.n);

  let total = 0;
  for (const n of picked.values()) total += n;
  for (const c of list) {                                // 兜底补齐到 30 张（同名牌 ≤3）
    if (total >= 30) break;
    const n = picked.get(c.id) || 0;
    if (n >= 3) continue;
    picked.set(c.id, n + 1);
    total += 1;
  }
  return [...picked.entries()].map(([id, n]) => ({ id, n }));
}

/* ────────────────────────── 小工具 ────────────────────────── */

function passMove(moves) {
  for (const m of moves) if (m.type === 'pass') return m;
  return moves[moves.length - 1];
}

function noBlockMove(bmoves) {
  for (const m of bmoves) if (m.type === 'noBlock') return m;
  return bmoves[bmoves.length - 1];
}

function unitByUid(board, uid) {
  if (!board) return null;
  for (const u of board) if (u.uid === uid) return u;
  return null;
}

function hasKw(u, kw) {
  return !!(u && u.kw && u.kw.indexOf(kw) >= 0);
}

function hasGuardKw(u) {
  return hasKw(u, '守护1') || hasKw(u, '守护2');
}

/* ────────────────────────── 出牌评分 ────────────────────────── */

/**
 * 抽牌牌评分。
 * 青色牌库只有 30 张，是「回合末按打出数 ÷2 额外抽牌」的高抽牌色；
 * 引擎里青色的重构代价是**清空法力**（rules.js reconstruct：白/青 → res = 0），
 * 牌库见底会触发重构 ⇒ 牌库薄的时候绝不能再抽牌，这里是硬闸。
 */
function drawScore(view, base, need) {
  const me = view.me;
  const n = need || 1;
  if (me.deck < n) return -9999;                    // 抽这张牌本身就会触发重构 → 法力清零
  if (me.deck + me.grave <= 3) return -9999;        // 全场只剩这几张，抽了必疲劳
  let s = base - 11 * Math.max(0, me.hand.length - 3);
  if (me.plays >= 3) s -= 12;                      // 本回合已打不少，别把牌库抽穿
  return s;
}

/** 单位牌：场面越空越该铺；133 的 +0/+1 目标优先给最结实的单位 */
function unitScore(view, mv, base) {
  const me = view.me;
  let s = base;
  if (me.board.length < 3) s += 15;
  else if (me.board.length >= 8) s -= 12;
  if (mv && mv.target != null) {
    const t = unitByUid(me.board, mv.target);
    if (t) s += Math.min(18, t.hp * 2 + t.atk + t.imp);
  }
  return s;
}

/**
 * 解场评分：目标威胁越大越值。
 * 重点是对方的「守卫」与「守护」——
 *   守卫：对方有守卫我就完全不能打脸（legalAttacks）；
 *   守护：带守护的单位会替他们的灵体挨我的打脸（bestGuard）。
 * 两者都必须优先拆，否则我的 IMP 打不进他们的生命卡。
 * 打不死的目标只给很低的分：3 点伤害蹭不掉 4 血以上的大哥。
 */
function removalScore(view, mv, dmg, base) {
  const t = unitByUid(view.opp.board, mv.target);
  if (!t) return -9999;
  const killable = t.hp <= dmg;
  let s;
  if (killable) {
    s = 55 + t.imp * 8 + t.atk * 2;
    if (hasKw(t, '守卫')) s += 34;
    if (hasGuardKw(t)) s += 22;
    if (hasKw(t, '疾风')) s += 8;
    if (hasKw(t, '圣盾')) s -= 12;
  } else {
    s = t.imp * 3;                                  // 只算蹭血，价值很低
  }
  return base + s;
}

function scorePlay(view, mv, card) {
  const me = view.me;
  switch (card.id) {
    case 'LQ01-136': return 150 + me.board.length * 8;   // 月潮终曲：战吼按在场人数结算
    case 'LQ01-140': return 120 + me.board.length * 6;   // 涡流长老：靠本回合出牌数变强
    case 'LQ01-131': return removalScore(view, mv, 3, 30);
    case 'LQ01-138': return drawScore(view, 120, 2);
    case 'LQ01-139': return drawScore(view, 112, 1);
    case 'LQ01-133': return unitScore(view, mv, 92);
    case 'LQ01-135': return 26 + me.board.length * 8;    // 守护1：场面越厚越值钱
    case 'LQ01-292': return unitScore(view, mv, 88);
    case 'LQ01-127': return unitScore(view, mv, 78);
    case 'LQ01-289': return 20 + me.board.length * 7;    // 全体 +1 ATK：场面越厚越值钱
    default: {
      // 兜底：按卡面效果估值（万一卡池里出现别的青卡／灰卡）
      if (card.type === '单位') return unitScore(view, mv, 76);
      if (card.type === '结界') return 24 + me.board.length * 6;
      if (card.type === '法术') {
        for (const e of (card.effects || [])) {
          if (e.do === 'draw') return drawScore(view, 60 + 20 * (e.n || 1), e.n || 1);
          if (e.do === 'aoe') return 30 + (e.n || 1) * 10 * (view.opp.board.length || 1);
          if (e.do === 'dmg') return removalScore(view, mv, e.n || 1, 20);
          if (e.do === 'buffAll') return 20 + Math.min(28, me.board.length * 6);
        }
        return 52;
      }
      if (card.type === '地标') return 28;
      return 45;
    }
  }
}

const PLAY_MIN = 42;   // 低于这个分就不值得占用法力

/**
 * 出牌顺序的两处微调：
 *   - 136（6 费）与 289（1 费）是同一套「加攻」组合：法力够 7 时先出 289 再出 136，
 *     全场 +2 ATK + 全体 +1/+1，比只出 136 强得多。
 *   - 135 潮汐帷幕的守护1 只作用于**打出那一刻**在场的单位（引擎不重复结算），
 *     所以它必须在场面铺好之后才出。
 */
function pickPlay(view, moves) {
  let best = null, bestScore = PLAY_MIN;
  for (const mv of moves) {
    if (mv.type !== 'play') continue;
    const card = view.me.hand[mv.i];
    if (!card) continue;
    let s = scorePlay(view, mv, card);
    if (card.id === 'LQ01-289' && view.me.res >= 7 && hasCard(view, 'LQ01-136')) s += 200;
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  return best;
}

/** 手牌里有没有某张卡（只看手牌，用于组合技判断） */
function hasCard(view, id) {
  for (const c of view.me.hand) if (c && c.id === id) return true;
  return false;
}

/* ────────────────────────── 攻击评分 ────────────────────────── */

/** 单点斩杀：任意单位 IMP ≥ 对手剩余生命（生命＝生命卡组剩余张数） */
function findLethal(view, moves) {
  for (const mv of moves) {
    if (mv.type !== 'attack' || mv.target !== 'face') continue;
    const u = unitByUid(view.me.board, mv.uid);
    if (u && u.imp >= view.opp.life) return mv;
  }
  return null;
}

/**
 * 打脸 vs 换血。
 * 青唯一的伤害来源是单位 IMP，所以默认优先打脸；
 * 只有能「白换掉对方的大威胁」（杀得掉、自己活得下来）时才去换血。
 * 对方有守卫时引擎根本不会给打脸选项，legalAttacks 会把目标全锁到守卫身上。
 */
function attackScore(view, mv) {
  const me = view.me, opp = view.opp;
  const u = unitByUid(me.board, mv.uid);
  if (!u) return -9999;

  if (mv.target === 'face') {
    let s = 34 + u.imp * 15 + u.hp * 2 - u.atk * 1.5;
    if (opp.life <= u.imp) s += 500;
    if (opp.board.length === 0) s += 40;            // 对面空场＝这一下必定进脸
    else s -= opp.board.length * 3;                // 有单位 ⇒ 对方可能阻挡
    return s;
  }

  const t = unitByUid(opp.board, mv.target);
  if (!t) return -9999;
  let s = 26 + t.imp * 8 + t.atk * 2;
  if (u.atk >= t.hp) s += 25; else s -= 25;
  if (t.atk >= u.hp) s -= 25; else s += 8;
  if (hasKw(t, '守卫')) s += 30;                  // 守卫逼我交火，先拆
  if (hasGuardKw(t)) s += 20;                     // 守护单位会替他们的灵体挨打
  if (hasKw(t, '疾风')) s += 8;
  if (hasKw(t, '圣盾')) s -= 12;
  return s;
}

function pickAttack(view, moves) {
  let best = null, bestScore = 0;
  for (const mv of moves) {
    if (mv.type !== 'attack') continue;
    const s = attackScore(view, mv);
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  return best;
}

/* ────────────────────────── 升灵（外枢灵体） ────────────────────────── */

/**
 * 青的外枢三张：275 潮汐共鸣锚（4/3/6，降临对对手 2 点）、
 * 276 深渊潮主（6/5/7，降临全体敌方 2 点）、277 大潮谐律盘（7/5/8，降临抽 3）。
 * 升灵要拿自己场上的单位当素材（引擎按 SR 从小到大凑，材料离场），
 * 所以只在「场面够厚、收益明确」时才升。
 */
function pickAscend(view, moves) {
  const me = view.me, opp = view.opp;
  let best = null, bestScore = 55;
  for (const mv of moves) {
    if (mv.type !== 'ascend') continue;
    const info = OUTER[mv.id];
    if (!info) continue;
    let s = 0;
    if (mv.id === 'LQ01-275') {
      if (me.board.length < 3) continue;
      s = 62 + (opp.life <= 8 ? 45 : 0) + (opp.life <= 16 ? 15 : 0);  // 直接 2 点伤害
    } else if (mv.id === 'LQ01-276') {
      if (me.board.length < 5) continue;
      s = 34 + opp.board.length * 13;              // 全体 2 点，对方场面越厚越值
    } else if (mv.id === 'LQ01-277') {
      if (me.board.length < 6) continue;
      s = 55 + (me.deck >= 10 ? 22 : 0) + (me.hand.length <= 3 ? 12 : 0);
    }
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  return best;
}

/* ────────────────────────── 主决策 ────────────────────────── */

function choose(view, moves) {
  if (!view || !moves || !moves.length) return { type: 'pass' };
  try {
    // 1) 能斩杀就斩杀
    const lethal = findLethal(view, moves);
    if (lethal) return lethal;

    // 2) 灵体启动（温蒂妮：免费抽 1）—— 抽在出牌前，多一张就多一次出牌
    for (const mv of moves) {
      if (mv.type === 'avatar' && view.me.deck >= 2) return mv;
    }

    // 3) 出牌：青色是「多打多抽」的颜色，出牌本身就有回报，优先出性价比最高的
    const play = pickPlay(view, moves);
    if (play) return play;

    // 4) 升灵：276 的降临全体 2 点要先于我的攻击结算（清掉对方的阻挡与守卫）
    const asc = pickAscend(view, moves);
    if (asc) return asc;

    // 5) 攻击：把 IMP 换成对手的生命卡（出牌在前 ⇒ 涡流长老的 ATK 已经叠满）
    const atk = pickAttack(view, moves);
    if (atk) return atk;

    // 6) 结束回合
    return passMove(moves);
  } catch (e) {
    return passMove(moves);
  }
}

/* ────────────────────────── 防守方阻挡 ────────────────────────── */

function block(view, bmoves) {
  const noBlock = noBlockMove(bmoves);
  if (!view || !bmoves || !bmoves.length) return noBlock;
  try {
    const me = view.me, opp = view.opp;
    // 正在攻击的单位（attacked=true）里取 IMP 最大的，作为待阻挡的攻击者近似
    let atkUnit = null;
    for (const u of opp.board) {
      if (!u || !u.attacked) continue;
      if (!atkUnit || u.imp > atkUnit.imp) atkUnit = u;
    }
    if (!atkUnit) return noBlock;

    let best = null, bestScore = 0;
    for (const mv of bmoves) {
      if (mv.type !== 'block') continue;
      const b = unitByUid(me.board, mv.uid);
      if (!b) continue;
      let s = 0;
      if (b.atk >= atkUnit.hp) s += 35; else s -= 6;
      if (atkUnit.atk >= b.hp) s -= 25; else s += 14;
      if (atkUnit.imp >= 3) s += 22;             // 它的 IMP 会直接打我们的脸
      if (me.life <= atkUnit.imp) s += 60;       // 这一下挨实了可能就输
      if (s > bestScore) { bestScore = s; best = mv; }
    }
    return best || noBlock;
  } catch (e) {
    return noBlock;
  }
}
