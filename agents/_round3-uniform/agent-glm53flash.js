// ============================================================
// GLM5.3flash · 红 · 焚天倾泻（红A 纯红快攻 · 门槛倾泻抢血）
// 执行模型 glm-5.3-flash
// 资源口径：激情 = min(2×回合, 10)，门槛不消耗；回合末弃光手牌
//           再补至 (10−激情)÷2 —— 与「零囤牌、每回合全压」同向。
// ============================================================

const meta = {
  name: 'GLM5.3flash · 焚天倾泻',
  desc: '执行模型 glm-5.3-flash；颜色 红；策略 焚天倾泻；激情门槛不消耗，全曲线冲锋铺场抢血，灵体启动加 IMP，烈阳断刃清路，焚天血咒直伤收尾',
  id: 'model:glm53flash',
  color: '红'
};

// ---- 卡组（30 张，10 名目 ×3）----
// 曲线：1费3 / 2费15 / 3费9 / 4费3
const RED_DECK = [
  ['LQ01-038', 3], // 怒火新兵     1费 2/1/1 冲锋、怒火（首攻 ATK+1）
  ['LQ01-039', 3], // 熔岩裂爪     2费 2/1/2 冲锋
  ['LQ01-040', 3], // 暴走狂犬     2费 1/3/2 怒火（攻击时 IMP+1）
  ['LQ01-041', 3], // 烈阳断刃     2费瞬间 对1单位3点伤害
  ['LQ01-042', 3], // 焚天血咒     4费 对手4点（本回合有单位被破坏改6点）
  ['LQ01-043', 3], // 血斧掷颅手   3费 3/1/2 冲锋、战吼对对手1点
  ['LQ01-044', 3], // 烬原猛虎     3费 3/2/2 冲锋
  ['LQ01-047', 3], // 燃焰卫士     2费 2/2/2 过载1（本回合+1/+0）
  ['LQ01-051', 3], // 掷火散兵     2费 2/1/2 战吼对对手1点
  ['LQ01-052', 3]  // 战鼓蛮兵     3费 3/2/2 战吼本回合全队 IMP+1
];

// 点杀类卡 → 伤害值（用于评估目标是否可杀）
const REMOVAL_DMG = {
  'LQ01-041': 3, // 烈阳断刃
  'LQ01-048': 4, // 焚心咒（备用兜底，不在卡组内也对得上）
  'LQ01-049': 2  // 熔火爆破（备用兜底）
};
const BURN_FACE_ID = 'LQ01-042'; // 焚天血咒：走脸的直伤终结

function costN(c) {
  return c && c.cost && typeof c.cost.n === 'number' ? c.cost.n : 0;
}

// ---------- build(pool) ----------
function build(pool) {
  try {
    const byId = {};
    (pool || []).forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    const out = [];
    const cnt = {};
    RED_DECK.forEach(function (p) {
      const id = p[0], n = p[1];
      if (!byId[id]) return; // 未知卡兜底：跳过，靠下面补齐
      for (let k = 0; k < n && out.length < 30; k++) {
        out.push(id);
        cnt[id] = (cnt[id] || 0) + 1;
      }
    });
    if (out.length < 30) {
      const cand = (pool || []).slice().sort(function (a, b) { return costN(a) - costN(b); });
      for (let i = 0; i < cand.length && out.length < 30; i++) {
        const id = cand[i].id;
        while (out.length < 30 && (cnt[id] || 0) < 3) {
          out.push(id);
          cnt[id] = (cnt[id] || 0) + 1;
        }
      }
    }
    const grp = {};
    out.forEach(function (id) { grp[id] = (grp[id] || 0) + 1; });
    const deck = Object.keys(grp).map(function (id) { return { id: id, n: grp[id] }; });
    let total = 0;
    deck.forEach(function (e) { total += e.n; });
    return total >= 25 ? deck : null;
  } catch (e) {
    return null;
  }
}

// ---------- 查询工具 ----------
function myUnit(view, uid) {
  const b = (view.me && view.me.board) || [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] && b[i].uid === uid) return b[i];
  }
  return null;
}

function oppUnit(view, uid) {
  const b = (view.opp && view.opp.board) || [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] && b[i].uid === uid) return b[i];
  }
  return null;
}

function unitAtk(u) { return u && typeof u.atk === 'number' ? u.atk : 1; }
function unitHp(u) { return u && typeof u.hp === 'number' ? u.hp : 1; }

function hasGuard(u) {
  const kw = (u && u.kw) || [];
  for (let i = 0; i < kw.length; i++) {
    if (kw[i] && String(kw[i]).indexOf('守卫') >= 0) return true;
  }
  return false;
}

// ---------- choose(view, moves) ----------
// 动作优先级：
//  1 单次脸攻斩杀 → 1.5 焚天血咒脸伤斩杀（≥4 保底）
//  2 铺单位（先铺后打：冲锋单位当回合即可攻击）
//  3 灵体启动（攻击前全体 IMP+1）
//  4 高价值点杀（能杀掉守卫 / 高攻威胁，先清路再打脸）
//  5 脸攻（优先大攻击力）
//  6 换子攻击（能杀且少死优先）
//  7 剩余直伤倾泻（焚天血咒/点杀）
//  8 pass
function decide(view, moves) {
  const me = view.me || {};
  const opp = view.opp || {};
  const hand = me.hand || [];
  const oppLife = typeof opp.life === 'number' ? opp.life : 20;

  const plays = [];
  const faceAtks = [];
  const unitAtks = [];
  let avatarMove = null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || !m.type) continue;
    if (m.type === 'play') plays.push(m);
    else if (m.type === 'attack' && m.target === 'face') faceAtks.push(m);
    else if (m.type === 'attack') unitAtks.push(m);
    else if (m.type === 'avatar') avatarMove = m;
    // buy/ascend/ride/attire 等类型与本策略无关，落到兜底 pass
  }

  // 1 单次脸攻斩杀
  for (let i = 0; i < faceAtks.length; i++) {
    const u = myUnit(view, faceAtks[i].uid);
    if (unitAtk(u) >= oppLife) return faceAtks[i];
  }

  // 1.5 焚天血咒斩杀（保底 4 点；若本回合已有单位被破坏则是 6 点，但按保守 4 判）
  for (let i = 0; i < plays.length; i++) {
    const c = hand[plays[i].i];
    if (c && c.id === BURN_FACE_ID && oppLife <= 4) return plays[i];
  }

  // 2 铺单位：先下怪（冲锋当回合可用），费用越低越先
  let bestUnit = null;
  let bestUnitScore = -1;
  for (let i = 0; i < plays.length; i++) {
    const m = plays[i];
    const c = hand[m.i];
    if (!c || c.type !== '单位') continue;
    const s = 40 + (6 - Math.min(costN(c), 6)) * 4;
    if (s > bestUnitScore) { bestUnitScore = s; bestUnit = m; }
  }
  if (bestUnit) return bestUnit;

  // 3 灵体启动：有单位能攻击时，攻击前加 IMP
  if (avatarMove && (faceAtks.length + unitAtks.length) > 0) return avatarMove;

  // 4 高价值点杀：能杀（守卫/ATK≥3 的威胁）才用
  let bestRem = null;
  let bestRemScore = 0;
  for (let i = 0; i < plays.length; i++) {
    const m = plays[i];
    const c = hand[m.i];
    if (!c) continue;
    const dmg = REMOVAL_DMG[c.id];
    if (dmg === undefined || c.id === BURN_FACE_ID) continue;
    const t = m.target ? oppUnit(view, m.target) : null;
    if (!t) continue;
    let s = 0;
    if (unitHp(t) <= dmg) {
      s = 10 + unitAtk(t) * 2 + unitHp(t);
      if (hasGuard(t)) s += 6; // 杀守卫 = 打开脸攻通道
      if (unitAtk(t) >= 3) s += 2;
    }
    if (s > bestRemScore) { bestRemScore = s; bestRem = m; }
  }
  if (bestRem && bestRemScore >= 14) return bestRem;

  // 5 脸攻：优先大攻击力
  if (faceAtks.length) {
    let bestF = null;
    let bestD = -1;
    for (let i = 0; i < faceAtks.length; i++) {
      const u = myUnit(view, faceAtks[i].uid);
      const d = unitAtk(u);
      if (d > bestD) { bestD = d; bestF = faceAtks[i]; }
    }
    if (bestF) return bestF;
  }

  // 6 换子攻击：能杀且自己不死的最优
  if (unitAtks.length) {
    let bestA = null;
    let bestS = -1;
    for (let i = 0; i < unitAtks.length; i++) {
      const m = unitAtks[i];
      const u = myUnit(view, m.uid);
      const t = m.target ? oppUnit(view, m.target) : null;
      let s = 0;
      if (t) {
        if (unitAtk(u) >= unitHp(t)) s += 5;
        if (unitAtk(t) < unitHp(u)) s += 3;
        s += unitAtk(t);
      }
      if (s > bestS) { bestS = s; bestA = m; }
    }
    if (bestA) return bestA;
  }

  // 7 剩余直伤倾泻：对手生命低时焚天血咒优先；否则点杀清残余威胁；最后血咒照常倾泻
  for (let i = 0; i < plays.length; i++) {
    const c = hand[plays[i].i];
    if (c && c.id === BURN_FACE_ID && oppLife <= 6) return plays[i];
  }
  for (let i = 0; i < plays.length; i++) {
    const m = plays[i];
    const c = hand[m.i];
    if (c && REMOVAL_DMG[c.id] !== undefined && c.id !== BURN_FACE_ID && m.target) {
      const t = oppUnit(view, m.target);
      if (t && unitAtk(t) >= 2) return m; // 点掉中威胁
    }
  }
  for (let i = 0; i < plays.length; i++) {
    const c = hand[plays[i].i];
    if (c && c.id === BURN_FACE_ID) return plays[i];
  }

  // 8 pass（moves 末位兜底，也可能是剩余未知类型）
  return moves[moves.length - 1];
}

function choose(view, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    const r = decide(view, moves);
    if (r) return r;
    return moves[moves.length - 1];
  } catch (e) {
    return moves && moves.length ? moves[moves.length - 1] : { type: 'pass' };
  }
}

// ---------- block(view, bmoves) ----------
// 快攻不轻易用身体换节奏：生命 >14 不挡；
// 10~14 只用耐久 ≥3 的墙挡；≤8 用耐久最高的单位拼命挡。
function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return { type: 'noBlock' };
    let noBlock = null;
    const blocks = [];
    for (let i = 0; i < bmoves.length; i++) {
      const m = bmoves[i];
      if (!m || !m.type) continue;
      if (m.type === 'noBlock') noBlock = m;
      else if (m.type === 'block') blocks.push(m);
    }
    if (!blocks.length) return noBlock || bmoves[bmoves.length - 1];

    const life = view && view.me && typeof view.me.life === 'number' ? view.me.life : 20;
    if (life > 14) return noBlock || blocks[0];

    let best = null;
    let bestHp = -1;
    for (let i = 0; i < blocks.length; i++) {
      const u = myUnit(view, blocks[i].uid);
      const hp = u && typeof u.hp === 'number' ? u.hp : 0;
      if (hp > bestHp) { bestHp = hp; best = blocks[i]; }
    }
    if (life <= 8) return best || noBlock || blocks[0];
    return bestHp >= 3 ? best : (noBlock || blocks[0]);
  } catch (e) {
    return bmoves && bmoves.length ? bmoves[bmoves.length - 1] : { type: 'noBlock' };
  }
}

// ---------- respond(view, ctx, moves)（可选）----------
// 仅在对手宣告攻击、且攻击者 ATK≥4（可能一击打穿防线）时，
// 用烈阳断刃（LQ01-041，瞬间 3 伤）反打；其余一律 pass。
function respond(view, ctx, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    const pass = moves[moves.length - 1];
    if (!ctx || ctx.kind !== 'attack') return pass;
    const atk = ctx.attacker && typeof ctx.attacker.atk === 'number' ? ctx.attacker.atk : 0;
    if (atk < 4) return pass;
    const hand = (view.me && view.me.hand) || [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m && m.type === 'respond' && typeof m.i === 'number' && hand[m.i] && hand[m.i].id === 'LQ01-041') {
        return m;
      }
    }
    return pass;
  } catch (e) {
    return moves && moves.length ? moves[moves.length - 1] : { type: 'pass' };
  }
}
