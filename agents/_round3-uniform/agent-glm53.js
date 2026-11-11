// ============================================================
// 《灵枢战纪》AI 脚本
// 显示名：GLM5.3 · 执行模型：glm-5.3 · 主色：绿 · 策略：地脉践踏
// ------------------------------------------------------------
// 构筑：绿色「法力 = 2 + 地标数」与「回合末补至地标数+1」构成
// 资源与手牌的双正反馈；中前期落地标滚法力，中期以践踏巨兽
// 越过守卫直接压脸，荆棘绞杀 / 落叶风暴 / 藤海怒涛分档解场，
// 巨兽冲锋把新下地的巨犀立即转化为斩杀线。
// 决策：对每个合法动作打分取最优，全程无随机依赖；
// 对未知动作类型、异常数值一律安全兜底到 pass。
// ============================================================

const meta = {
  name: 'GLM5.3 · 地脉践踏',
  desc: '执行模型 glm-5.3；颜色 绿；策略 地脉践踏；地标滚法力与补牌，中后期践踏巨兽推脸取胜',
  id: 'model:glm53',
  color: '绿'
};

// ---------- 小工具 ----------
function gFindUnit(board, uid) {
  if (!board || uid === undefined || uid === null) return null;
  for (let i = 0; i < board.length; i++) {
    if (board[i] && board[i].uid === uid) return board[i];
  }
  return null;
}

function gHasKw(u, kw) {
  return !!(u && u.kw && Array.isArray(u.kw) && u.kw.indexOf(kw) >= 0);
}

function gGuardX(u) { // 折算「守护X」减伤值
  let g = 0;
  if (u && u.kw && Array.isArray(u.kw)) {
    for (let i = 0; i < u.kw.length; i++) {
      const m = /^守护([0-9]+)/.exec(String(u.kw[i]));
      if (m) g += parseInt(m[1], 10) || 0;
    }
  }
  return g;
}

function gVal(u) {
  return ((u && u.atk) || 0) + ((u && u.hp) || 0);
}

// ---------- build ----------
function build(pool) {
  // 30 张全绿：12 名目，曲线 1-2 费 16 / 3-4 费 11 / 5-6 费 3
  const want = [
    ['LQ01-055', 2], ['LQ01-056', 3], ['LQ01-057', 3], ['LQ01-058', 3],
    ['LQ01-060', 2], ['LQ01-061', 3], ['LQ01-063', 3], ['LQ01-064', 1],
    ['LQ01-065', 3], ['LQ01-066', 3], ['LQ01-068', 2], ['LQ01-072', 2]
  ];
  const src = Array.isArray(pool) ? pool : [];
  const known = {};
  for (let i = 0; i < src.length; i++) {
    if (src[i] && src[i].id) known[src[i].id] = true;
  }
  const deck = [];
  const have = {};
  let total = 0;
  for (let i = 0; i < want.length; i++) {
    const id = want[i][0];
    if (!known[id]) continue; // 目标卡不在卡池则跳过，走兜底
    const n = want[i][1];
    deck.push({ id: id, n: n });
    have[id] = n;
    total += n;
  }
  // 兜底：目标卡缺失时按 scoreCard 补足到 30 张（同名 ≤3）
  if (total < 30 && typeof api !== 'undefined' && api && typeof api.scoreCard === 'function') {
    const sorted = src.slice().sort(function (a, b) {
      return (api.scoreCard(b) || 0) - (api.scoreCard(a) || 0);
    });
    for (let i = 0; i < sorted.length && total < 30; i++) {
      const c = sorted[i];
      if (!c || !c.id || !known[c.id]) continue;
      const used = have[c.id] || 0;
      if (used >= 3) continue;
      const add = Math.min(3 - used, 30 - total);
      if (add <= 0) continue;
      deck.push({ id: c.id, n: add });
      have[c.id] = used + add;
      total += add;
    }
  }
  return deck;
}

// ---------- 出牌评分 ----------
function gPlayScore(m, c, x) {
  if (!c) return 0;
  const n = (c.cost && typeof c.cost.n === 'number') ? c.cost.n : 0;
  const id = String(c.id || '');

  // 地标：资源与补牌双引擎，优先落地；
  // 唯一例外：本回合还捏着 >=4 费大单位、且先落地标会挤掉它时，让位。
  if (id === 'LQ01-056' || id === 'LQ01-061') {
    if (x.bigUnit >= 4 && x.res - n < x.bigUnit) return 4;
    return 100 + n; // 母神共鸣地(102) 略优先于 幼叶之池(101)
  }
  if (id === 'LQ01-064') { // 大地脉动：检索 1 张地标直接置入战场
    if (x.bigUnit >= 4 && x.res - n < x.bigUnit) return 3;
    return 95;
  }
  if (id === 'LQ01-058') { // 荆棘绞杀：对 1 个单位 3 点伤害
    const t = gFindUnit(x.opB, m.target);
    if (!t) return 0; // 目标不在敌方场上（或非法目标）→ 不选这个动作
    const kill = !gHasKw(t, '圣盾') && (3 - gGuardX(t)) >= (t.hp || 0) && (t.hp || 0) > 0;
    if (kill) return 26 + (t.atk || 0) * 2 + (t.hp || 0); // 优先击杀高威胁
    return 8 + (t.atk || 0); // 打不死也削最大的目标
  }
  if (id === 'LQ01-060') { // 落叶风暴：对所有敌方单位 2 点伤害
    if (!x.opB.length) return 0;
    let kills = 0;
    for (let i = 0; i < x.opB.length; i++) {
      const t = x.opB[i];
      if (t && !gHasKw(t, '圣盾') && (t.hp || 0) > 0 && (t.hp || 0) <= 2) kills++;
    }
    if (x.opB.length >= 2 && kills >= 2) return 60;
    if (x.opB.length >= 4) return 50;
    if (kills >= 1 && x.opB.length >= 3) return 45;
    return 0; // 不划算就扣在手里
  }
  if (id === 'LQ01-072') { // 藤海怒涛：敌方全体 3 点；每有 1 张地标回复 1
    if (!x.opB.length) return 0;
    let kills = 0;
    for (let i = 0; i < x.opB.length; i++) {
      const t = x.opB[i];
      if (t && !gHasKw(t, '圣盾') && (t.hp || 0) > 0 && (t.hp || 0) <= 3) kills++;
    }
    if (kills >= 2) return 68;
    if (x.opB.length >= 3) return 58;
    if (x.myLife <= 8 && x.myLands >= 2) return 55; // 缺血时靠地标数回复
    return 0;
  }
  if (id === 'LQ01-068') { // 巨兽冲锋：+2/+0、践踏与冲锋（本回合）
    const u = gFindUnit(x.myB, m.target);
    if (!u || u.frozen || u.attacked) return 0;
    const atk2 = (u.atk || 0) + 2;
    if (atk2 < 3) return 0;
    if (x.oppHasGuard) {
      // 有守卫时，只在能撞死某个守卫（践踏溢出转脸）时才值得
      let can = false;
      for (let i = 0; i < x.opB.length; i++) {
        const t = x.opB[i];
        if (t && gHasKw(t, '守卫') && !gHasKw(t, '圣盾') && (atk2 - gGuardX(t)) >= (t.hp || 0)) {
          can = true;
          break;
        }
      }
      return can ? (55 + (u.atk || 0)) : 0;
    }
    return 55 + (u.atk || 0) * 2; // 直伤斩杀通道
  }

  // 通用兜底（未知卡 / 备用卡）
  if (c.type === '地标') return 90;
  if (c.type === '单位') {
    let s = n * 10;
    if (id === 'LQ01-057' && x.round <= 5) s += 5; // 前期优先立守卫
    if ((id === 'LQ01-065' || id === 'LQ01-066') && !x.oppHasGuard) s += 3; // 践踏可直接上脸
    return s;
  }
  return 12;
}

// ---------- 攻击评分 ----------
function gAttackScore(m, myB, opB, oLife) {
  if (m.avatar) return 0; // 灵体作战为粉色专属，绿色不会出现；安全跳过
  const a = gFindUnit(myB, m.uid);
  if (!a) return 0;
  if (m.target === 'face') {
    let d = (a.imp || 0);
    if (d <= 0) d = (a.atk || 0);
    if (d <= 0) return 0;
    if (d >= oLife) return 999; // 单击致死，绝对优先
    return d + (20 - oLife) * 0.4; // 对手血线越低越倾向收头
  }
  const t = gFindUnit(opB, m.target);
  if (!t) return 0;
  if (gHasKw(t, '圣盾')) return -1; // 圣盾抵消一次伤害，不硬撞
  const myAtk = (a.atk || 0) - gGuardX(t);
  const kill = myAtk >= (t.hp || 0);
  if (kill && (a.hp || 0) > (t.atk || 0)) {
    return 6 + (t.atk || 0) * 1.5; // 白吃对面的优换
  }
  if (kill) {
    const s = 14 + gVal(t) - gVal(a); // 同归于尽：目标总价值更高才换
    return s > 0 ? s : -1;
  }
  return -1; // 打不死就别送，保单位当阻挡
}

// ---------- choose ----------
function choose(view, moves) {
  try {
    if (!moves || !moves.length) return null;
    const me = (view && view.me) || {};
    const opp = (view && view.opp) || {};
    const hand = Array.isArray(me.hand) ? me.hand : [];
    const myB = Array.isArray(me.board) ? me.board : [];
    const opB = Array.isArray(opp.board) ? opp.board : [];
    const res = typeof me.res === 'number' ? me.res : 0;
    const oLife = typeof opp.life === 'number' ? opp.life : 20;
    const myLife = typeof me.life === 'number' ? me.life : 20;
    const round = (view && typeof view.round === 'number') ? view.round : 1;
    const myLands = Array.isArray(me.lands) ? me.lands.length : 0;

    // 对手是否有守卫（决定脸是否可打、冲锋是否值得）
    let oppHasGuard = false;
    for (let i = 0; i < opB.length; i++) {
      if (gHasKw(opB[i], '守卫')) { oppHasGuard = true; break; }
    }

    // 本回合还能支付的最贵单位（决定地标与大单位的取舍）
    let bigUnit = 0;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m && m.type === 'play' && typeof m.i === 'number' && hand[m.i]) {
        const c = hand[m.i];
        if (c.type === '单位' && c.cost && typeof c.cost.n === 'number' &&
            c.cost.n <= res && c.cost.n > bigUnit) bigUnit = c.cost.n;
      }
    }

    const ctx = {
      res: res, bigUnit: bigUnit, round: round, myLife: myLife,
      myLands: myLands, oLife: oLife, myB: myB, opB: opB, oppHasGuard: oppHasGuard
    };

    let passMove = null;
    let bestMove = null;
    let bestScore = 0; // 只选正分动作，其余一律让位给 pass
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k];
      if (!m) continue;
      if (m.type === 'pass') { if (!passMove) passMove = m; continue; }
      let s = 0;
      if (m.type === 'play') {
        const c = (typeof m.i === 'number') ? hand[m.i] : null;
        s = gPlayScore(m, c, ctx);
      } else if (m.type === 'avatar') {
        s = myB.length >= 1 ? 90 : 0; // 绿色灵体启动无资源费用，有场面即用
      } else if (m.type === 'ascend') {
        // 后期场面冗余时把单位折成外枢灵体；不让素材侵蚀斩杀节奏
        s = (round >= 6 && myB.length >= 4 && oLife > 10) ? 80 : 0;
      } else if (m.type === 'attack') {
        s = gAttackScore(m, myB, opB, oLife);
      } else {
        s = 0; // 未知动作类型兜底
      }
      if (s > bestScore) { bestScore = s; bestMove = m; }
    }
    if (bestMove) return bestMove;
    if (passMove) return passMove;
    return moves[moves.length - 1];
  } catch (e) {
    // 安全兜底：任何异常都退回 pass，保证不抛出
    if (moves && moves.length) {
      for (let i = 0; i < moves.length; i++) {
        if (moves[i] && moves[i].type === 'pass') return moves[i];
      }
      return moves[moves.length - 1];
    }
    return null;
  }
}

// ---------- block ----------
function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return null;
    let noB = null;
    const opts = [];
    for (let i = 0; i < bmoves.length; i++) {
      const m = bmoves[i];
      if (!m) continue;
      if (m.type === 'noBlock') { if (!noB) noB = m; }
      else if (m.type === 'block') opts.push(m);
    }
    if (!opts.length) return noB || bmoves[bmoves.length - 1];

    const me = (view && view.me) || {};
    const opp = (view && view.opp) || {};
    const myB = Array.isArray(me.board) ? me.board : [];
    const opB = Array.isArray(opp.board) ? opp.board : [];
    const myLife = typeof me.life === 'number' ? me.life : 20;

    // 推断攻击者：敌方未冻结单位中威胁最大者
    let atk = null;
    for (let i = 0; i < opB.length; i++) {
      const u = opB[i];
      if (!u || u.frozen) continue;
      const v = (u.atk || 0) + (u.imp || 0);
      if (!atk || v > ((atk.atk || 0) + (atk.imp || 0))) atk = u;
    }
    if (!atk) return noB || bmoves[bmoves.length - 1];
    const threat = (atk.imp || 0);

    let bestKS = null; // 击杀且存活：白吃，必挡
    let bestKSS = 0;
    let bestO = null; // 其他可接受方案
    let bestOS = 0;
    for (let i = 0; i < opts.length; i++) {
      const u = gFindUnit(myB, opts[i].uid);
      if (!u) continue;
      const kill = !gHasKw(atk, '圣盾') && ((u.atk || 0) - gGuardX(atk)) >= (atk.hp || 0);
      const survive = (u.hp || 0) > ((atk.atk || 0) - gGuardX(u));
      if (kill && survive) {
        const s = 30 + gVal(atk);
        if (s > bestKSS) { bestKSS = s; bestKS = opts[i]; }
      } else {
        let s = 0;
        if (kill && myLife <= 12) s = 10 + gVal(atk) - gVal(u); // 同归于尽换大威胁
        else if (myLife <= threat) s = 20 + threat - gVal(u); // 致命一击：最小代价拖住
        else if (myLife <= 5 && threat >= 4) s = 4 + threat * 0.5 - gVal(u) * 0.5;
        if (s > bestOS) { bestOS = s; bestO = opts[i]; }
      }
    }
    if (bestKS) return bestKS;
    if (threat <= 2 && myLife > 8) return noB || bmoves[bmoves.length - 1]; // 小伤害不挡，保场面
    if (bestO) return bestO;
    return noB || bmoves[bmoves.length - 1];
  } catch (e) {
    if (bmoves && bmoves.length) {
      for (let i = 0; i < bmoves.length; i++) {
        if (bmoves[i] && bmoves[i].type === 'noBlock') return bmoves[i];
      }
      return bmoves[bmoves.length - 1];
    }
    return null;
  }
}
