// hy4 · 地脉碾压 —— 绿色（法力＋地标）双峰 ramp 构筑
// 阶段二：基于 agents/color-reviews/hy4.md 的十一色评价，取排序第一的绿。
// 编译：new Function('api', src + '; return {build, choose, meta}')
// 零依赖；只读 view/moves；choose/block/respond 只返回传入数组里的对象引用。

var meta = {
  name: 'hy4 · 地脉碾压',
  desc: '执行模型 hy4std（短 id hy4）；颜色 绿；策略 地脉碾压；选色依据：评价排序第一「资源与补牌双成长、无硬顶、单卡质量最高，几乎不空转」',
  id: 'model:hy4',
  color: '绿'
};

// 30 张：绿 23 ＋ 灰 7；12 名目、同名 ≤3；双峰曲线 1–2 费 19｜3–4 费 6｜5–6 费 5｜7+ 0
function build(pool) {
  var plan = [
    ['LQ01-298', 3], ['LQ01-284', 3], ['LQ01-056', 3], ['LQ01-061', 3],
    ['LQ01-055', 3], ['LQ01-069', 3], ['LQ01-065', 3], ['LQ01-066', 3],
    ['LQ01-067', 2], ['LQ01-060', 1], ['LQ01-072', 2], ['LQ01-296', 1]
  ];
  var arr = Array.isArray(pool) ? pool : [];
  var have = Object.create(null), seen = Object.create(null), out = [];
  var i, c, id, n, total = 0;
  for (i = 0; i < arr.length; i++) {
    c = arr[i];
    if (c && c.id) have[c.id] = c;
  }
  for (i = 0; i < plan.length && total < 30; i++) {
    id = plan[i][0]; n = plan[i][1];
    if (!have[id] || seen[id]) continue;
    seen[id] = 1;
    if (n > 3) n = 3;
    if (n < 1) n = 1;
    if (total + n > 30) n = 30 - total;
    if (n > 0) { out.push({ id: id, n: n }); total += n; }
  }
  // 兜底：硬编码卡号若不在 pool，用 pool 内绿/灰卡补足 30，不依赖引擎回退
  if (total < 30) {
    for (i = 0; i < arr.length && total < 30; i++) {
      c = arr[i];
      if (!c || !c.id || seen[c.id]) continue;
      if (c.color && c.color !== '绿' && c.color !== '灰') continue;
      seen[c.id] = 1;
      out.push({ id: c.id, n: 1 });
      total += 1;
    }
  }
  return out;
}

function findByUid(arr, uid) {
  if (!Array.isArray(arr)) return null;
  for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].uid === uid) return arr[i];
  return null;
}

function scoreMove(m, hand, board, oboard, canKill) {
  var t = m.type, c, effs, e, i, kw, cost, resGain, aoeN, draw, hit, u, d, kills, dies, imp, s;
  // 默认绿灵体 LQ01-224：被动每回合 +1 法力；启动免费 +2 法力，净赚且不影响其他动作
  if (t === 'avatar') return 60;
  if (t === 'attack') {
    if (m.target === 'face') {
      u = findByUid(board, m.uid);
      imp = u ? (u.imp || 0) : 0;
      return canKill ? 300 : 24 + imp * 2;
    }
    u = findByUid(board, m.uid);
    d = findByUid(oboard, m.target);
    if (!u || !d) return 3;
    kills = (u.atk || 0) >= (d.hp || 0);
    dies = (d.atk || 0) >= (u.hp || 0);
    return (kills ? 16 + (d.hp || 0) : 6) - (dies && !kills ? 10 : 0);
  }
  if (t === 'play') {
    c = (typeof m.i === 'number' && m.i >= 0 && m.i < hand.length) ? hand[m.i] : null;
    if (!c) return 0;
    if (c.type === '瞬间') return 0;   // LQ01-296 留给 respond 反击，不在自己回合打
    effs = Array.isArray(c.effects) ? c.effects : [];
    kw = Array.isArray(c.kw) ? c.kw : [];
    cost = (c.cost && typeof c.cost.n === 'number') ? c.cost.n : 0;
    resGain = 0; aoeN = 0; draw = 0;
    for (i = 0; i < effs.length; i++) {
      e = effs[i];
      if (!e) continue;
      if (e.do === 'res') resGain += (e.n || 0);
      else if (e.do === 'aoe') aoeN = Math.max(aoeN, e.n || 0);
      else if (e.do === 'draw') draw += (e.n || 0);
    }
    // 地标：进场 res 几乎抵回费用（298 还净赚 1），且永久 +1 法力／+1 手牌上限
    if (c.type === '地标') return 34 + resGain * 3 + draw * 2;
    if (c.type === '单位') {
      s = 10 + ((c.atk || 0) + (c.imp || 0) * 1.2 + (c.hp || 0)) * 0.6 - cost * 0.4 + resGain * 2;
      if (kw.indexOf('成长') >= 0) s += 2;
      if (kw.indexOf('践踏') >= 0) s += 2;
      return s;
    }
    // 法术 / 结界：清场按能扫掉几个计价；纯回费（064 类）净亏，压到低分
    if (aoeN > 0) {
      hit = 0;
      for (i = 0; i < oboard.length; i++) if ((oboard[i].hp || 0) <= aoeN) hit++;
      return hit > 0 ? 12 + hit * 5 : 2;
    }
    if (draw > 0) return 10 + draw * 2;
    if (resGain > 0) return 3;
    return 2;
  }
  // 升灵 / 金 buy / 粉色专属 / 未知类型：本策略一律不主动宣告
  return 0;
}

function choose(view, moves) {
  if (!Array.isArray(moves) || moves.length === 0) {
    return moves ? moves[moves.length - 1] : null;
  }
  var me = (view && view.me) ? view.me : {};
  var opp = (view && view.opp) ? view.opp : {};
  var hand = Array.isArray(me.hand) ? me.hand : [];
  var board = Array.isArray(me.board) ? me.board : [];
  var oboard = Array.isArray(opp.board) ? opp.board : [];
  var pass = null, i, m;
  for (i = 0; i < moves.length; i++) {
    if (moves[i] && moves[i].type === 'pass') { pass = moves[i]; break; }
  }
  if (!pass) pass = moves[moves.length - 1];

  // 斩杀：本回合全部可打脸单位的 IMP 合计 ≥ 对手剩余生命
  var seenUid = Object.create(null), lethal = 0, u0;
  for (i = 0; i < moves.length; i++) {
    m = moves[i];
    if (!m || m.type !== 'attack' || m.target !== 'face' || m.avatar) continue;
    if (seenUid[m.uid]) continue;
    seenUid[m.uid] = 1;
    u0 = findByUid(board, m.uid);
    if (u0) lethal += (u0.imp || 0);
  }
  var canKill = lethal > 0 && lethal >= (opp.life || 0);

  var best = null, bestS = -1e9, s;
  for (i = 0; i < moves.length; i++) {
    m = moves[i];
    if (!m || typeof m.type !== 'string') continue;
    s = scoreMove(m, hand, board, oboard, canKill);
    if (s > bestS) { bestS = s; best = m; }
  }
  // 只选正分动作；pass 与未知／被压分的动作得 0，不会误选
  if (best && bestS > 0) return best;
  return pass;
}

function block(view, bmoves) {
  if (!Array.isArray(bmoves) || bmoves.length === 0) {
    return bmoves ? bmoves[bmoves.length - 1] : null;
  }
  var noBlock = null, blocks = [], i, b;
  for (i = 0; i < bmoves.length; i++) {
    b = bmoves[i];
    if (!b) continue;
    if (b.type === 'noBlock') noBlock = b;
    else if (b.type === 'block') blocks.push(b);
  }
  if (!noBlock) noBlock = bmoves[bmoves.length - 1];
  var me = (view && view.me) ? view.me : {};
  var opp = (view && view.opp) ? view.opp : {};
  var mb = Array.isArray(me.board) ? me.board : [];
  var ob = Array.isArray(opp.board) ? opp.board : [];
  var maxImp = 0;
  for (i = 0; i < ob.length; i++) if ((ob[i].imp || 0) > maxImp) maxImp = ob[i].imp || 0;
  // 进攻型 ramp 默认不挡，保留单位下回合继续打脸；仅当这一击可能致死才挡
  if (maxImp <= 0 || (me.life || 0) > maxImp) return noBlock;
  var best = null, bestV = -1e9, u, v;
  for (i = 0; i < blocks.length; i++) {
    u = findByUid(mb, blocks[i].uid);
    if (!u) continue;
    v = (u.atk || 0) * 2 + (u.hp || 0);
    if (v > bestV) { bestV = v; best = blocks[i]; }
  }
  return best || noBlock;
}

function respond(view, ctx, moves) {
  var arr = Array.isArray(moves) ? moves : [];
  var pass = null, i, m, card;
  for (i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].type === 'pass') { pass = arr[i]; break; }
  }
  if (!pass) pass = arr.length ? arr[arr.length - 1] : null;
  var c = ctx || {};
  var hand = (view && view.me && Array.isArray(view.me.hand)) ? view.me.hand : [];
  // 对手宣告非单位卡时，用「反击」瞬间把原卡整体无效化
  if (c.kind === 'play' && c.card && c.card.type && c.card.type !== '单位') {
    for (i = 0; i < arr.length; i++) {
      m = arr[i];
      if (!m || m.type !== 'respond') continue;
      card = (typeof m.i === 'number' && m.i >= 0 && m.i < hand.length) ? hand[m.i] : null;
      if (card && typeof card.text === 'string' && /反击/.test(card.text)) return m;
    }
  }
  // attack / endTurn 时点与无反击资源：一律 pass
  return pass;
}
