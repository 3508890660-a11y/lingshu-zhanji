/* agents/agent-deepseekv41flash.js
 * 绿 · 地脉碾压（ramp-trample）
 *
 * 构筑依据（只来自卡面与规则）：
 *   绿的法力 = 2 + 地标数，且地标的卡面效果是「产 N 点法力」＝打出时返还等量资源，
 *   幼叶之池（法力1 产1）与母神共鸣地（法力2 产2）都是净零费用的永久 +1 法力；
 *   回合末手牌补至「地标数 + 1」，所以地标同时抬高法力上限与手牌上限。
 *   输出端用践踏单位：荒原猛犸 4/3/4、裂地巨犀 5/4/5、林冠泰坦 6/5/6，
 *   溢出伤害转脸，配合巨兽冲锋（+2/+0，本回合）把单回合脸伤拉高。
 *
 * 决策只读 view / moves，不依赖任何未公开字段。
 */

const meta = {
  name: 'deepseek v4.1flash · 地脉碾压',
  desc: '执行模型 deepseek-v4.1-flash；颜色 绿；策略 地脉碾压（ramp-trample）；地标净返还法力滚雪球，践踏巨兽把溢出伤害转脸，解牌只清关键单位。',
  id: 'model:deepseekv41flash',
  color: '绿'
};

/* ------------------------------------------------------------------ */
/* 卡组：10 个名目 ×3 ＝ 30 张                                          */
/* ------------------------------------------------------------------ */
const PLAN = [
  ['LQ01-056', 3], // 幼叶之池     地标 法力1  产1（净返还，永久+1法力）
  ['LQ01-061', 3], // 母神共鸣地   地标 法力2  产2（净返还，永久+1法力）
  ['LQ01-057', 3], // 摇篮藤根     单位 法力2  1/2/3 守卫
  ['LQ01-058', 3], // 荆棘绞杀     法术 法力2  对1个单位3伤
  ['LQ01-063', 3], // 林冠漫步者   单位 法力3  2/2/3 每个地标+1/+1（上限+3/+3）
  ['LQ01-060', 3], // 落叶风暴     法术 法力3  敌方全体2伤
  ['LQ01-065', 3], // 荒原猛犸     单位 法力4  4/3/4 践踏
  ['LQ01-068', 3], // 巨兽冲锋     法术 法力2  目标单位+2/+0
  ['LQ01-066', 3], // 裂地巨犀     单位 法力5  5/4/5 践踏
  ['LQ01-067', 3]  // 林冠泰坦     单位 法力6  6/5/6 践踏、再生
];

const DECK_SIZE = 30;
const MAX_COPIES = 3;

/* 关键词／类型的构筑权重（仅用于 pool 缺卡时的兜底补位） */
const KW_W = { '践踏': 1.6, '守卫': 0.9, '圣盾': 0.9, '成长': 0.8, '冲锋': 0.7, '再生': 0.7 };

function _cost(c) {
  if (!c || !c.cost) return 0;
  return typeof c.cost.n === 'number' ? c.cost.n : 0;
}

function _isUnit(c) { return !!c && c.type === '单位'; }
function _isLand(c) { return !!c && c.type === '地标'; }
function _hasKw(u, kw) {
  const list = (u && u.kw) || [];
  for (let i = 0; i < list.length; i++) if (list[i] === kw) return true;
  return false;
}

/* 单位价值：攻击/冲击偏重，耐久次之 */
function _threat(u) {
  if (!u) return 0;
  return (u.atk || 0) * 2 + (u.imp || 0) * 2 + (u.hp || 0);
}

function _valuePerCost(c) {
  const cost = _cost(c) || 1;
  let v = ((c.atk || 0) * 1.3 + (c.imp || 0) * 1.5 + (c.hp || 0) * 0.9) / cost;
  const kw = c.kw || [];
  for (let i = 0; i < kw.length; i++) v += (KW_W[kw[i]] || 0) / cost;
  if (_isLand(c)) v += 1.1 / cost;                 // 地标净返还法力
  if (c.type === '法术' || c.type === '瞬间') v += 0.6 / cost;
  return v;
}

function build(pool) {
  const list = Array.isArray(pool) ? pool : [];
  const have = {};
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c && c.id) have[c.id] = c;
  }

  const out = [];
  const used = {};
  let total = 0;

  for (let i = 0; i < PLAN.length; i++) {
    const id = PLAN[i][0];
    if (!have[id]) continue;
    const n = Math.min(PLAN[i][1], MAX_COPIES - (used[id] || 0));
    if (n <= 0) continue;
    out.push({ id: id, n: n });
    used[id] = (used[id] || 0) + n;
    total += n;
  }

  // 兜底补位：池子里还有别的绿／灰卡时，按单位价值/费用补到 30
  if (total < DECK_SIZE) {
    const rest = [];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c || !c.id || used[c.id]) continue;
      if (c.type === '金币卡') continue;
      rest.push({ c: c, v: _valuePerCost(c) });
    }
    rest.sort(function (a, b) { return b.v - a.v; });
    for (let i = 0; i < rest.length && total < DECK_SIZE; i++) {
      const c = rest[i].c;
      const n = Math.min(MAX_COPIES, DECK_SIZE - total);
      out.push({ id: c.id, n: n });
      used[c.id] = n;
      total += n;
    }
  }

  // 超编时从尾部裁剪（保持前面 10 个名目完整）
  while (total > DECK_SIZE && out.length) {
    const last = out[out.length - 1];
    last.n -= 1;
    total -= 1;
    if (last.n <= 0) out.pop();
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 视图工具                                                            */
/* ------------------------------------------------------------------ */
function _byUid(board, uid) {
  if (!board || uid === undefined || uid === null) return null;
  for (let i = 0; i < board.length; i++) {
    if (board[i] && board[i].uid === uid) return board[i];
  }
  return null;
}

function _split(moves) {
  const r = { plays: [], attacks: [], avatars: [], ascends: [], buys: [], pass: null };
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || !m.type) continue;
    if (m.type === 'play') r.plays.push(m);
    else if (m.type === 'attack') r.attacks.push(m);
    else if (m.type === 'avatar') r.avatars.push(m);
    else if (m.type === 'ascend') r.ascends.push(m);
    else if (m.type === 'buy') r.buys.push(m);
    else if (m.type === 'pass') r.pass = m;
  }
  return r;
}

/* 同一张手牌可能有多个目标版本，取评分最高的一个 */
function _bestByCard(plays, hand, cardName, scoreTarget) {
  let best = null;
  let bestScore = -1e9;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const c = hand[p.i];
    if (!c || c.name !== cardName) continue;
    const s = scoreTarget ? scoreTarget(p, c) : 0;
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best ? { move: best, score: bestScore } : null;
}

/* 升灵目标（绿）：数据口径 266/267 门槛 SR3，268 门槛 SR5 */
const ASC_INFO = {
  'LQ01-266': { need: 3, atk: 6, imp: 4, hp: 7 },
  'LQ01-267': { need: 3, atk: 5, imp: 5, hp: 8 },
  'LQ01-268': { need: 5, atk: 7, imp: 6, hp: 6 }
};

/* 引擎按「SR 从小到大」凑素材，这里复算一遍，避免吃掉唯一的大哥 */
function _ascendCost(board, need) {
  const arr = [];
  for (let i = 0; i < board.length; i++) {
    const u = board[i];
    if (!u) continue;
    arr.push({ u: u, sr: typeof u.sr === 'number' ? u.sr : 1 });
  }
  arr.sort(function (a, b) { return a.sr - b.sr; });
  let sum = 0;
  let power = 0;
  const picked = [];
  for (let i = 0; i < arr.length && sum < need; i++) {
    sum += arr[i].sr;
    power += _threat(arr[i].u);
    picked.push(arr[i].u);
  }
  if (sum < need) return null;
  return { chosen: picked, power: power, count: picked.length };
}

/* ------------------------------------------------------------------ */
/* 主决策                                                              */
/* ------------------------------------------------------------------ */
function choose(view, moves) {
  if (!moves || !moves.length) return null;
  try {
    const me = (view && view.me) || {};
    const opp = (view && view.opp) || {};
    const hand = me.hand || [];
    const myBoard = me.board || [];
    const oppBoard = opp.board || [];
    const res = typeof me.res === 'number' ? me.res : 0;
    const oppLife = typeof opp.life === 'number' ? opp.life : 20;
    const av = me.avatar || {};
    const avName = av.name || '';

    const g = _split(moves);

    /* 1) 免费法力型灵体（森林先知：启动免费 +2 法力）先开，等于多一档费用 */
    if (g.avatars.length && !av.used && avName.indexOf('森林先知') >= 0) {
      return g.avatars[0];
    }

    /* 2) 地标优先：净返还费用，越早下越快滚法力与手牌上限 */
    let landMove = null;
    for (let i = 0; i < g.plays.length; i++) {
      const p = g.plays[i];
      const c = hand[p.i];
      if (!c) continue;
      if (_isLand(c)) { landMove = p; break; }
    }
    if (landMove) return landMove;

    /* 3) 点杀：只用来清「能打疼人」的单位（ATK≥3 或 IMP≥3 且耐久≤3） */
    const removal = _bestByCard(g.plays, hand, '荆棘绞杀', function (p) {
      const t = _byUid(oppBoard, p.target);
      if (!t) return -1e9;
      if ((t.hp || 0) > 3) return -1e9;
      const punch = (t.atk || 0) >= 3 || (t.imp || 0) >= 3;
      if (!punch) return -1e9;
      return _threat(t) + ((t.imp || 0) >= 3 ? 4 : 0);
    });
    if (removal && removal.score > 0) return removal.move;

    /* 4) 群体 2 伤：至少清 2 个，或铺开 3 个单位时压场 */
    const aoe = _bestByCard(g.plays, hand, '落叶风暴', function () {
      let kills = 0;
      for (let i = 0; i < oppBoard.length; i++) {
        if ((oppBoard[i].hp || 0) <= 2) kills += 1;
      }
      if (kills >= 2) return 100 + kills;
      if (kills >= 1 && oppBoard.length >= 2) return 60 + kills;
      if (oppBoard.length >= 3) return 40 + oppBoard.length;
      return -1e9;
    });
    if (aoe && aoe.score > 0) return aoe.move;

    /* 5) 出单位：在手牌可负担范围内先下最贵的（ramp 卡的节奏就是抢身材） */
    let unitMove = null;
    let unitBest = -1e9;
    for (let i = 0; i < g.plays.length; i++) {
      const p = g.plays[i];
      const c = hand[p.i];
      if (!c || !_isUnit(c)) continue;
      if (p.target !== undefined && p.target !== null) continue; // 单位不需要目标
      const cost = _cost(c);
      if (cost > res) continue;
      let s = _threat(c) * 10 - cost;              // 身材优先，同身材选便宜的
      if (_hasKw(c, '践踏')) s += 12;               // 践踏＝额外脸伤
      if (p.i !== undefined && hand[p.i] && hand[p.i].cost) s += 0;
      if (s > unitBest) { unitBest = s; unitMove = p; }
    }
    if (unitMove) return unitMove;

    /* 6) 巨兽冲锋：留给本回合还能打出去的单位，把 ATK 直接换脸伤 */
    const pump = _bestByCard(g.plays, hand, '巨兽冲锋', function (p) {
      const u = _byUid(myBoard, p.target);
      if (!u) return -1e9;
      let s = (u.atk || 0) * 3 + (u.imp || 0) * 2;
      if (u.attacked) s -= 30;                       // 已经打过的不再加
      if (_hasKw(u, '践踏')) s += 8;
      return s;
    });
    if (pump && pump.score > 6) return pump.move;

    /* 7) 付费灵体：贝希摩斯（最高 ATK 翻倍）/ 万物母神（抽1+1法力），留着余量再开 */
    if (g.avatars.length && !av.used && res >= 2) {
      if (avName.indexOf('贝希摩斯') >= 0) {
        let top = 0;
        for (let i = 0; i < myBoard.length; i++) top = Math.max(top, myBoard[i].atk || 0);
        if (top >= 3) return g.avatars[0];
      } else if (avName.indexOf('万物母神') >= 0) {
        return g.avatars[0];
      }
    }

    /* 8) 升灵：只用小 SR 的杂兵换大身材，且不吃掉场上最高攻的单位 */
    if (g.ascends.length && myBoard.length >= 3) {
      let bestAsc = null;
      let bestGain = 0;
      let topAtk = 0;
      for (let i = 0; i < myBoard.length; i++) topAtk = Math.max(topAtk, myBoard[i].atk || 0);
      for (let i = 0; i < g.ascends.length; i++) {
        const info = ASC_INFO[g.ascends[i].id];
        if (!info) continue;
        const costInfo = _ascendCost(myBoard, info.need);
        if (!costInfo || costInfo.count > 2) continue;
        let eatsTop = false;
        for (let k = 0; k < costInfo.chosen.length; k++) {
          if ((costInfo.chosen[k].atk || 0) >= topAtk) eatsTop = true;
        }
        if (eatsTop) continue;
        const gain = (info.atk * 2 + info.imp * 2 + info.hp) - costInfo.power;
        if (gain > 6 && gain > bestGain) { bestGain = gain; bestAsc = g.ascends[i]; }
      }
      if (bestAsc) return bestAsc;
    }

    /* 9) 攻击：能斩杀就全打脸；否则只做「杀得掉且不亏」的交换，其余打脸 */
    if (g.attacks.length) {
      const face = [];
      let faceSum = 0;
      for (let i = 0; i < g.attacks.length; i++) {
        const m = g.attacks[i];
        if (m.target !== 'face') continue;
        face.push(m);
        const u = _byUid(myBoard, m.uid);
        faceSum += (u && u.imp) ? u.imp : 0;
      }
      if (face.length && faceSum >= oppLife) return face[0];

      let bestAtk = null;
      let bestScore = -1e9;
      for (let i = 0; i < g.attacks.length; i++) {
        const m = g.attacks[i];
        if (m.target === 'face') continue;
        const tu = _byUid(oppBoard, m.target);
        const mu = _byUid(myBoard, m.uid);
        if (!tu || !mu) continue;
        const kill = (mu.atk || 0) >= (tu.hp || 0);
        const die = (tu.atk || 0) >= (mu.hp || 0);
        let s;
        if (kill && !die) s = 80 + _threat(tu);
        else if (kill && die) s = 20 + _threat(tu) - _threat(mu);
        else s = -40 + _threat(tu) - _threat(mu);
        if (_hasKw(mu, '践踏')) s += 6;               // 践踏换人也能溢脸
        if (s > bestScore) { bestScore = s; bestAtk = m; }
      }
      if (bestAtk && bestScore >= 80) return bestAtk;
      if (face.length) return face[0];
      if (bestAtk) return bestAtk;
      return g.attacks[0];
    }

    /* 10) 兜底 */
    if (g.pass) return g.pass;
    return moves[moves.length - 1];
  } catch (e) {
    return moves[moves.length - 1];
  }
}

/* ------------------------------------------------------------------ */
/* 阻挡：只在血线危险时用最低价值的单位挡刀                              */
/* ------------------------------------------------------------------ */
function block(view, bmoves) {
  if (!bmoves || !bmoves.length) return null;
  try {
    const noBlock = (function () {
      for (let i = 0; i < bmoves.length; i++) if (bmoves[i].type === 'noBlock') return bmoves[i];
      return null;
    })();
    const blocks = [];
    for (let i = 0; i < bmoves.length; i++) if (bmoves[i].type === 'block') blocks.push(bmoves[i]);
    if (!blocks.length) return noBlock || bmoves[bmoves.length - 1];

    const me = (view && view.me) || {};
    const life = typeof me.life === 'number' ? me.life : 20;
    if (life > 8) return noBlock || blocks[0];

    const board = me.board || [];
    let best = blocks[0];
    let bestV = 1e9;
    for (let i = 0; i < blocks.length; i++) {
      const u = _byUid(board, blocks[i].uid);
      if (!u) continue;
      let v = (u.atk || 0) * 2 + (u.imp || 0) * 2 + (u.hp || 0);
      if (_hasKw(u, '守卫')) v -= 2;                  // 守卫本来就该挡
      if (v < bestV) { bestV = v; best = blocks[i]; }
    }
    return best;
  } catch (e) {
    return bmoves[bmoves.length - 1];
  }
}
