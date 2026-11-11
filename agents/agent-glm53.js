// ============================================================
// 《灵枢战纪》AI 脚本
// 显示名：GLM5.3 · 执行模型：glm-5.3 · 主色：青 · 策略：潮汐控制
// ------------------------------------------------------------
// 选色依据（出自 agents/color-reviews/glm53.md 排序第 1 的青）：
// 青的资源模型是全游戏唯一没有内耗的——法力无打出上限、
// 抽牌随打出数增长（流转：每打出 2 张回合末额外抽 1），
// T5 后稳定维持「6 费 + 4~5 张手牌」的吞吐；温蒂妮被动使
// 回合法力再 +1，启动免费抽 1~2。攻（月潮终曲 / 升灵外枢）、
// 守（涨潮反击 / 潮汐帷幕 / 守卫）、续航（号令 + 罗盘）三线齐备。
// 构筑：30 张 = 10 名目 ×3，曲线 1 费 3 / 2 费 15 / 3 费 9 / 6 费 3；
// 灰卡石肤守卫顶替潮汐帷幕——快攻环境里"有守卫可阻挡"的活命
// 价值高于帷幕的相位减伤。
// 决策：avatar（免费抽）→ 升灵（按场面 SR 余量选锚 / 潮主 /
// 谐律盘）→ 斩杀判定 → 出牌评分 → 攻击评分 → pass。
// 涨潮反击（瞬间）只在 respond 窗口反击对手 3 费以上的
// 法术 / 结界 / 特殊牌，choose 内一律不打。
// 全程无随机依赖；对未知动作、异常数值一律安全兜底到 pass。
// ============================================================

const meta = {
  name: 'GLM5.3 · 潮汐回廊',
  desc: '执行模型 glm-5.3；颜色 青；策略 潮汐控制；号令罗盘连击永动抽牌，重压脉冲控场，月潮终曲与升灵双终端',
  id: 'model:glm53',
  color: '青'
};

/* ---------- 通用小工具 ---------- */

function boardUnit(board, uid) {
  if (!board || uid === undefined || uid === null) return null;
  for (let i = 0; i < board.length; i++) {
    if (board[i] && board[i].uid === uid) return board[i];
  }
  return null;
}

function findMove(moves, pred) {
  for (let i = 0; i < moves.length; i++) {
    if (moves[i] && pred(moves[i])) return moves[i];
  }
  return null;
}

/* 灵格值表：升灵素材评估用（引擎的 pubUnit 不含 SR，按卡名映射） */
var SR_BY_NAME = {
  '潮汐幼灵': 1, '溅跃小妖': 2, '潮卫·堤灵': 3, '风暴信使': 2,
  '月潮终曲·海灵圣母': 6, '调律学徒': 2, '大潮调律师': 4, '涡流长老': 4,
  '士兵': 1, '银翼新兵': 0, '灵基胚芽': 0, '虚空衍生物': 0,
  '石肤守卫': 2, '灵基苗床': 1, '灵基胚': 0
};

function srOfName(name) {
  if (!name) return 2;
  const v = SR_BY_NAME[name];
  return typeof v === 'number' ? v : 2; // 未知卡保守按 SR2
}

function boardSR(board) {
  if (!board) return 0;
  let s = 0;
  for (let i = 0; i < board.length; i++) s += srOfName(board[i] && board[i].name);
  return s;
}

/* 模拟引擎 pickMaterials：从 SR 最小的单位开始凑到 ≥need */
function simulateConsume(board, need) {
  // 引擎 pickMaterials 只取 SR>0 的场上单位，从小往大凑
  const pos = [];
  for (let i = 0; i < (board ? board.length : 0); i++) {
    const u = board[i];
    if (!u || !u.name) continue;
    const s = srOfName(u.name);
    if (s > 0) pos.push(s);
  }
  pos.sort(function (a, b) { return a - b; });
  let sum = 0, maxUsed = 0;
  for (let i = 0; i < pos.length; i++) {
    if (sum >= need) break;
    sum += pos[i];
    if (pos[i] > maxUsed) maxUsed = pos[i];
  }
  return { ok: sum >= need, consumedSR: sum, maxUsedSR: maxUsed, remaining: boardSR(board) - sum };
}

/* ---------- build ---------- */

function build(pool) {
  // 30 张 = 10 名目 ×3；曲线 1 费 3 / 2 费 15 / 3 费 9 / 6 费 3
  // v2：潮汐帷幕 ×3 → 石肤守卫 ×3（灰）——快攻环境里"有守卫可阻挡"
  // 的活命价值高于帷幕的相位减伤；防直击是第一优先。
  const want = [
    ['LQ01-138', 3], // 连击共鸣：1 费，本回合第 2 张牌时抽 2 —— 正反馈点火塞
    ['LQ01-129', 3], // 潮汐号令：2 费，抽 1 + 切潮汐
    ['LQ01-130', 3], // 潮位罗盘：2 费地标，每回合首次切潮汐抽 1
    ['LQ01-134', 3], // 涨潮反击：2 费瞬间，反击 + 退潮弹手（respond 专用）
    ['LQ01-128', 3], // 溅跃小妖：2 费 2/1/2，流转 1
    ['LQ01-292', 3], // 石肤守卫：通用 2 费 1/2/3 守卫 —— 防直击肉盾
    ['LQ01-131', 3], // 深海重压：3 费，点杀 3 伤（退潮 4）
    ['LQ01-132', 3], // 风暴脉冲：3 费，敌方全体 1 伤 ×2 —— 对铺场流的天敌
    ['LQ01-133', 3], // 潮卫·堤灵：3 费 2/2/4 守卫
    ['LQ01-136', 3]  // 月潮终曲·海灵圣母：6 费 5/4/7，战吼切潮 ×2 + 团队 +1/+1
  ];
  const src = Array.isArray(pool) ? pool : [];
  const have = {};
  for (let i = 0; i < src.length; i++) {
    if (src[i] && src[i].id) have[src[i].id] = true;
  }
  const out = [];
  let total = 0;
  for (let i = 0; i < want.length; i++) {
    if (have[want[i][0]]) {
      out.push({ id: want[i][0], n: want[i][1] });
      total += want[i][1];
    }
  }
  // 兜底：名目意外缺失时用灰色泛用补足 25 张下限
  const fill = ['LQ01-292', 'LQ01-286', 'LQ01-290', 'LQ01-295'];
  for (let f = 0; f < fill.length && total < 25; f++) {
    if (have[fill[f]]) { out.push({ id: fill[f], n: 3 }); total += 3; }
  }
  return out;
}

/* ---------- 升灵 ---------- */

function pickAscend(view, moves) {
  const list = [];
  for (let i = 0; i < moves.length; i++) {
    if (moves[i] && moves[i].type === 'ascend') list.push(moves[i]);
  }
  if (!list.length) return null;
  const board = (view.me && view.me.board) || [];
  const opB = (view.opp && view.opp.board) || [];
  let threat = 0;
  for (let i = 0; i < opB.length; i++) {
    if (opB[i] && !opB[i].frozen) threat++;
  }
  // 门槛自上而下：大潮谐律盘(SR6, 7/5/8, 抽3) > 深渊潮主(SR5, 6/5/7, AOE2) > 潮汐共鸣锚(SR3, 4/3/6, 脸2)
  // 谐律盘允许吃空场面（吃月潮换 7/5/8+抽3 是净赚）；锚在对手威胁小时也允许吃空，
  // 威胁大时（≥3 个攻击者）必须留 1 个单位当阻挡。
  // 锚：场面 2+ 单位且对手威胁大（≥3 攻击者）时留 1 个阻挡；
  // 只剩 1 个单位时直接吃掉——反正挡不住，换 4/3/6 直击外枢更值。
  const cands = [
    { id: 'LQ01-277', need: 6, minRemain: 0, maxUsed: 9 },
    { id: 'LQ01-276', need: 5, minRemain: 1, maxUsed: 4 },
    { id: 'LQ01-275', need: 3, minRemain: threat >= 3 && board.length > 1 ? 1 : 0, maxUsed: 4 }
  ];
  for (let c = 0; c < cands.length; c++) {
    const sim = simulateConsume(board, cands[c].need);
    if (!sim.ok) continue;
    if (sim.remaining < cands[c].minRemain) continue;   // 升灵后场面余量
    if (sim.maxUsedSR > cands[c].maxUsed) continue;     // 不牺牲超过档位允许的大单位
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === cands[c].id) return list[i];
    }
  }
  return null;
}

/* ---------- 斩杀判定 ---------- */

function faceLethal(view, moves) {
  const life = (view.opp && view.opp.life) || 0;
  if (life <= 0) return false;
  let total = 0;
  const seen = {};
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'attack' || m.target !== 'face' || seen[m.uid]) continue;
    seen[m.uid] = true;
    const u = boardUnit((view.me && view.me.board) || [], m.uid);
    if (u) total += u.imp || 0;
  }
  return total > 0 && total >= life;
}

/* ---------- 出牌 ---------- */

function playScore(view, m, card, ctx) {
  const oppBoard = (view.opp && view.opp.board) || [];
  const meBoard = (view.me && view.me.board) || [];
  // 场面压力：单位越少越优先铺场；守卫缺失时守卫牌优先
  let hasGuard = false;
  for (let i = 0; i < meBoard.length; i++) {
    const k = (meBoard[i] && meBoard[i].kw) || [];
    if (k.indexOf('守卫') >= 0) { hasGuard = true; break; }
  }
  const thin = meBoard.length <= 1 ? 18 : 0;       // 场面空虚，单位牌绝对优先（活不过对手回合就没有输出）
  const needGuard = hasGuard ? 0 : 15;            // 没守卫时守卫牌加分
  switch (card.id) {
    case 'LQ01-138': {                              // 连击共鸣：正反馈点火塞
      // 月潮本回合可打（法力 6~7）时先让路——共鸣 1 费 + 月潮 6 费 = 完美回合
      if (ctx.moonPlayable && ctx.res >= 6 && ctx.res < 8) return 50;
      return 90;
    }
    case 'LQ01-136': return 85;                    // 月潮终曲：主终端，能付必出
    case 'LQ01-130': {                             // 潮位罗盘：每回合首次切潮白抽
      let hasCompass = false;
      const lands = (view.me && view.me.lands) || [];
      for (let i = 0; i < lands.length; i++) {
        if (lands[i] && String(lands[i]).indexOf('罗盘') >= 0) { hasCompass = true; break; }
      }
      return hasCompass ? 38 : 78;
    }
    case 'LQ01-129': return 72;                    // 潮汐号令：抽 1
    case 'LQ01-292': return 58 + needGuard + thin; // 石肤守卫：防直击肉盾
    case 'LQ01-133': return 62 + needGuard + thin; // 潮卫·堤灵：守卫防御锚
    case 'LQ01-128': return 55 + thin;             // 溅跃小妖：铺场
    case 'LQ01-131': {                             // 深海重压：点杀（保守按 3 伤算，退潮 4 是惊喜）
      if (m.target === undefined || m.target === null) return 45;
      const t = boardUnit(oppBoard, m.target);
      if (!t) return 45;
      const thp = t.hp || 0;
      // 威胁 = 直击威胁(IMP) 与 战斗威胁(ATK) 并重；杀不死的肉盾（hp≥5）不值得点名
      if (thp >= 5) return 12 + (t.atk || 0);
      const kills = thp <= 3;
      return 48 + (kills ? 16 : 0) + (t.imp || 0) * 2 + (t.atk || 0) * 2;
    }
    case 'LQ01-132': {                             // 风暴脉冲：敌方全体 1 伤 ×2
      let n = 0, soft = 0;
      for (let i = 0; i < oppBoard.length; i++) {
        n++;
        if ((oppBoard[i].hp || 0) <= 2) soft++;
      }
      if (n >= 3) return 66 + soft * 6;            // 铺场流越宽清得越狠
      if (n === 2) return 56 + soft * 6;
      return n === 1 ? 25 : 5;
    }
    default: {                                      // 未知牌：低费小牌兜底出
      const c = (card.cost && card.cost.n) || 0;
      return 30 - c;
    }
  }
}

function pickPlay(view, moves) {
  const hand = (view.me && view.me.hand) || [];
  const plays = (view.me && view.me.plays) || 0;
  const ctx = {
    res: (view.me && view.me.res) || 0,
    moonPlayable: false
  };
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m && m.type === 'play' && hand[m.i] && hand[m.i].id === 'LQ01-136') {
      ctx.moonPlayable = true; break;
    }
  }
  let best = null, bestScore = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'play') continue;
    const card = hand[m.i];
    if (!card) continue;
    if (card.type === '瞬间') continue;                     // 涨潮反击只留给 respond
    if (card.id === 'LQ01-138' && plays > 1) continue;       // 连击共鸣过期（第 2 张时机已过）
    const s = playScore(view, m, card, ctx);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

/* ---------- 攻击 ---------- */

function attackScore(view, m, lethal, threatCount) {
  const meB = (view.me && view.me.board) || [];
  const opB = (view.opp && view.opp.board) || [];
  const a = boardUnit(meB, m.uid);
  if (!a) return 0;
  const kws = a.kw || [];
  const isGuard = kws.indexOf('守卫') >= 0;
  const holdBack = isGuard && !lethal && threatCount > 0 && threatCount <= 2; // 守卫保留阻挡；攻击者太多挡不完时也参与竞速
  if (m.target === 'face') {
    if (holdBack) return 0;
    return 42 + (a.imp || 0) * 3;                          // 直击竞速是主要胜利路线
  }
  const t = boardUnit(opB, m.target);
  if (!t) return 0;
  const kills = (t.hp || 0) <= (a.atk || 0);
  const dies = (a.hp || 0) <= (t.atk || 0);
  const tv = (t.atk || 0) + (t.hp || 0);
  const myv = (a.atk || 0) + (a.hp || 0);
  if (kills && !dies) return 55 + tv * 2;                  // 白赚，守卫也放行
  if (holdBack) return 0;                                  // 其余交换对守卫不值得弃防
  if (kills && dies) return 40 + tv * 2 - myv;             // 价值交换
  if (!dies && tv >= 9) return 48;                         // 大威胁（大外枢）磨血≈半解场，为重压补刀铺路
  if (!kills && !dies) return 18 + (t.atk || 0) * 2;       // 骚扰高威胁
  return 0;                                                // 白送不打
}

function pickAttack(view, moves, lethal) {
  const opB = (view.opp && view.opp.board) || [];
  let threatCount = 0;
  for (let i = 0; i < opB.length; i++) {
    if (opB[i] && !opB[i].frozen) threatCount++;
  }
  let best = null, bestScore = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'attack') continue;
    const s = attackScore(view, m, lethal, threatCount);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

/* ---------- 主决策 ---------- */

function choose(view, moves) {
  try {
    if (!moves || !moves.length) return null;
    // 1. 温蒂妮启动：免费抽 1~2，无任何代价
    const av = findMove(moves, function (m) { return m.type === 'avatar'; });
    if (av) return av;
    // 2. 升灵：素材充裕时升外枢（第二终端）
    const asc = pickAscend(view, moves);
    if (asc) return asc;
    // 3. 斩杀：直击总量够就全打脸
    if (faceLethal(view, moves)) {
      const f = findMove(moves, function (m) { return m.type === 'attack' && m.target === 'face'; });
      if (f) return f;
    }
    // 4. 出牌：多打牌 = 流转多抽
    const p = pickPlay(view, moves);
    if (p) return p;
    // 5. 攻击：直击竞速优先，守卫保留阻挡
    const a = pickAttack(view, moves, false);
    if (a) return a;
    // 6. 结束
    const ps = findMove(moves, function (m) { return m.type === 'pass'; });
    return ps || moves[moves.length - 1];
  } catch (e) {
    try {
      const ps = findMove(moves || [], function (m) { return m.type === 'pass'; });
      if (ps) return ps;
      if (moves && moves.length) return moves[moves.length - 1];
    } catch (e2) { /* fallthrough */ }
    return null;
  }
}

/* ---------- 阻挡（只在对手直击灵体时打开） ---------- */

function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return null;
    const noBlock = findMove(bmoves, function (m) { return m.type === 'noBlock'; });
    const fallback = noBlock || bmoves[bmoves.length - 1];
    const me = view.me || {};
    const opp = view.opp || {};
    const blocks = [];
    for (let i = 0; i < bmoves.length; i++) {
      if (bmoves[i] && bmoves[i].type === 'block') blocks.push(bmoves[i]);
    }
    if (!blocks.length) return fallback;
    // 攻击者：宣告时已置 attacked 标志
    let attacker = null;
    const opB = opp.board || [];
    for (let i = 0; i < opB.length; i++) {
      const u = opB[i];
      if (u && u.attacked && (!attacker || (u.atk || 0) > (attacker.atk || 0))) attacker = u;
    }
    if (!attacker) {
      for (let i = 0; i < opB.length; i++) {
        const u = opB[i];
        if (u && (!attacker || (u.atk || 0) > (attacker.atk || 0))) attacker = u;
      }
    }
    if (!attacker) return fallback;
    const incoming = attacker.imp || 0;
    const mustBlock = (me.life || 99) <= incoming; // 不挡即死
    const meB = me.board || [];
    if (mustBlock) {
      // 选最耐久的单位硬挡，尽量挡掉致命一击
      let best = null, bestHp = -1;
      for (let i = 0; i < blocks.length; i++) {
        const b = boardUnit(meB, blocks[i].uid);
        if (!b) continue;
        if ((b.hp || 0) > bestHp) { bestHp = b.hp || 0; best = blocks[i]; }
      }
      return best || fallback;
    }
    let best = null, bestV = 0;
    for (let i = 0; i < blocks.length; i++) {
      const b = boardUnit(meB, blocks[i].uid);
      if (!b) continue;
      const kills = (b.atk || 0) >= (attacker.hp || 0);
      const dies = (b.hp || 0) <= (attacker.atk || 0);
      let v = 0;
      if (kills) v += 3;
      if (!dies) v += 2;
      if (dies && !kills) v -= 3;
      v += Math.min(3, Math.floor(incoming / 2)); // 吸收直击伤害的替代收益
      if (v > bestV) { bestV = v; best = blocks[i]; }
    }
    return bestV > 0 ? best : fallback;
  } catch (e) {
    try {
      const nb = findMove(bmoves || [], function (m) { return m.type === 'noBlock'; });
      if (nb) return nb;
      if (bmoves && bmoves.length) return bmoves[bmoves.length - 1];
    } catch (e2) { /* fallthrough */ }
    return null;
  }
}

/* ---------- 响应（瞬间 / 反击） ---------- */

function respond(view, ctx, moves) {
  try {
    if (!ctx || ctx.kind !== 'play' || !moves || !moves.length) return null;
    const card = ctx.card;
    if (!card) return null;
    const t = card.type || '';
    const cost = (card.cost && card.cost.n) || 0;
    const isBig = t === '法术' || t === '结界' || t === '特殊';
    // 只反击高威胁牌：3 费以上的清场 / 增益 / 直伤，外加点名名单。
    // 碎晶冲击（灰·2 费点杀 3）专拆守卫，是白系 CONTROL 的核心交互。
    const HOT_IDS = { 'LQ01-290': true };
    const hand = (view && view.me && view.me.hand) || [];
    const wantCounter = (isBig && cost >= 3) || HOT_IDS[card.id] ||
      (isBig && cost >= 2 && hand.length >= 7); // 手牌将满（回合末弃 7）时放宽，避免反击烂在手里
    if (wantCounter) {
      const r = findMove(moves, function (m) { return m.type === 'respond'; });
      if (r) return r;
    }
    return null;
  } catch (e) {
    return null;
  }
}
