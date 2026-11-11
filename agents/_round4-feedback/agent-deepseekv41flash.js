/**
 * 《灵枢战纪》AI 脚本 · 绿色「地脉巨兽」
 *
 * 构筑口径：
 *   绿色法力 = 2 + 地标数（消耗制）；幼叶之池 法力1 产1，净零费用地标，
 *   等于用一张手牌换永久 +1 法力与回合末补牌上限。
 *   绿色灵体侧（LQ01-224 森林先知·盖亚）：回合开始 +1 法力，启动免费 +2 法力，
 *   因此 5~6 费践踏巨兽可以比名义曲线早 1~2 回合落地。
 *
 * 决策口径：
 *   斩杀 → 早启灵体 → 地标 → 双杀以上扫场 → 紧急点杀 → 单位 →
 *   强化可攻击单位 → 剩余点杀 → 单杀扫场 → 其他牌 → 晚启灵体 → 攻击 → pass。
 *   所有目标选择只在 moves 已给出的合法目标里挑，不新建动作、不改 view/moves。
 */
const meta = {
  name: 'deepseek v4.1flash · 地脉巨兽',
  desc: '执行模型 deepseek-v4.1-flash；颜色 绿；策略 地脉巨兽（ramp-trample）；以净零地标与灵体法力提前落地践踏巨兽，用点杀与单边扫场开路后压脸。',
  id: 'model:deepseekv41flash',
  color: '绿'
};

/* 30 张：10 个名目 × 3。同名牌不超过 3，全部为绿色主色牌。 */
const DECK = [
  { id: 'LQ01-056', n: 3 }, // 幼叶之池：法力1 地标，产1，净零永久加速
  { id: 'LQ01-057', n: 3 }, // 摇篮藤根：法力2，1/2/3 守卫
  { id: 'LQ01-058', n: 3 }, // 荆棘绞杀：法力2，对1个单位3伤
  { id: 'LQ01-060', n: 3 }, // 落叶风暴：法力3，敌方全体2伤
  { id: 'LQ01-063', n: 3 }, // 林冠漫步者：法力3，2/2/3，进场自buff
  { id: 'LQ01-065', n: 3 }, // 荒原猛犸：法力4，4/3/4 践踏
  { id: 'LQ01-066', n: 3 }, // 裂地巨犀：法力5，5/4/5 践踏
  { id: 'LQ01-067', n: 3 }, // 林冠泰坦：法力6，6/5/6 践踏、再生
  { id: 'LQ01-068', n: 3 }, // 巨兽冲锋：法力2，目标单位+2/+0
  { id: 'LQ01-072', n: 3 }  // 藤海怒涛：法力4，敌方全体3伤并回复1
];

/* 绿色外枢：引擎在额外卡组提供，ascend 不占手牌、不付法力，只消耗场上素材。 */
const OUTER_INFO = {
  'LQ01-266': { name: '巨木之心', need: 3, atk: 6, imp: 4, hp: 7 }, // 降临 +2 法力并抽 1
  'LQ01-267': { name: '苍林守望', need: 3, atk: 5, imp: 5, hp: 8 }, // 降临 抽 2
  'LQ01-268': { name: '兽王之魂', need: 5, atk: 7, imp: 6, hp: 6 }  // 降临 全体 +1 ATK
};

/* 场上只有卡名，没有 sr 字段；按绿色/灰色常见单位补一张 SR 表，未知单位一律不估。 */
const SR_BY_NAME = {
  '盖亚幼株': 1,
  '蜉蝣食菌虻': 1,
  '灵基苗床': 1,
  '摇篮藤根': 2,
  '石肤守卫': 2,
  '林冠漫步者': 3,
  '猎杀弱肉': 3,
  '荒原猛犸': 4,
  '裂地巨犀': 5,
  '林冠泰坦': 6
};

function num(v) {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function hasKw(card, kw) {
  return !!(card && Array.isArray(card.kw) && card.kw.indexOf(kw) >= 0);
}

function byUid(list, uid) {
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].uid === uid) return list[i];
  }
  return null;
}

function cardAt(hand, i) {
  return (typeof i === 'number' && hand[i]) ? hand[i] : null;
}

function maxAtk(board) {
  let m = 0;
  for (let i = 0; i < board.length; i++) m = Math.max(m, num(board[i] && board[i].atk));
  return m;
}

function srOf(u) {
  if (!u) return 0;
  if (typeof u.sr === 'number' && u.sr > 0) return u.sr;
  const s = SR_BY_NAME[u.name];
  return typeof s === 'number' ? s : 0;
}

/**
 * 模拟引擎的“素材 SR 从最小开始凑”：
 * 只用于估算这次 ascend 会吃掉哪些单位。任一单位 SR 未知则返回 null，
 * 宁可此次不升灵，也不在不知道素材的情况下乱升。
 */
function materialPlan(board, need) {
  const list = [];
  for (let i = 0; i < board.length; i++) {
    const u = board[i];
    const s = srOf(u);
    if (!u || s <= 0) return null;
    list.push({ u: u, sr: s, i: i });
  }
  if (!list.length || need <= 0) return null;

  list.sort(function (a, b) {
    if (a.sr !== b.sr) return a.sr - b.sr;
    return a.i - b.i;
  });

  let sum = 0;
  const consumed = [];
  for (let i = 0; i < list.length; i++) {
    if (sum >= need) break;
    consumed.push(list[i].u);
    sum += list[i].sr;
  }
  if (sum < need) return null;
  return { consumed: consumed, sum: sum };
}

/**
 * 升灵评分：外枢身材 + 降临效果 − 被吃素材身材 − 少一个站场单位的宽度税
 * − 守卫/再生/践踏的丢失成本。分数 ≥2 才升，避免把防线换成只大一点的白板。
 * allowAttackers=false 时只吃召唤失调或本回合已攻击的单位，不损失当回合攻击。
 */
function pickAscend(ascendMoves, ctx, allowAttackers) {
  let best = null;
  let bs = -1e9;

  for (let i = 0; i < ascendMoves.length; i++) {
    const m = ascendMoves[i];
    if (!m || !m.id) continue;
    const info = OUTER_INFO[m.id];
    if (!info) continue;

    const plan = materialPlan(ctx.myBoard, info.need);
    if (!plan) continue;

    if (!allowAttackers) {
      let losesAttack = false;
      for (let j = 0; j < plan.consumed.length; j++) {
        const u = plan.consumed[j];
        if (ctx.attackUids[u.uid] && !u.attacked) { losesAttack = true; break; }
      }
      if (losesAttack) continue;
    }

    let consumedStats = 0;
    let guardCount = 0;
    let kwPenalty = 0;
    for (let j = 0; j < plan.consumed.length; j++) {
      const u = plan.consumed[j];
      consumedStats += num(u.atk) + num(u.imp) + num(u.hp);
      if (hasKw(u, '守卫')) guardCount++;
      if (hasKw(u, '再生')) kwPenalty += 4;
      if (hasKw(u, '践踏')) kwPenalty += 1;
    }

    let effect = 4;
    if (m.id === 'LQ01-266') {
      effect = (ctx.res <= 2 || ctx.handSize <= 3) ? 6 : 4;
    } else if (m.id === 'LQ01-267') {
      effect = ctx.handSize <= 3 ? 5 : 4;
    } else if (m.id === 'LQ01-268') {
      effect = 2 + 1.5 * Math.max(0, ctx.myBoard.length - plan.consumed.length);
    }

    const outerStats = info.atk + info.imp + info.hp;
    const widthPenalty = 2 * Math.max(0, plan.consumed.length - 1);
    const guardPenalty = 4 * guardCount;
    const score = outerStats + effect - consumedStats - widthPenalty - guardPenalty - kwPenalty;

    if (score >= 2 && score > bs) {
      bs = score;
      best = m;
    }
  }
  return best;
}

function cardValue(c) {
  if (!c) return 0;
  let s = 4;
  if (c.type === '单位') {
    s = 8 + num(c.atk) + num(c.imp) + num(c.hp);
    if (hasKw(c, '践踏')) s += 2;
    if (hasKw(c, '守卫')) s += 2;
    if (hasKw(c, '再生')) s += 1;
  } else if (c.type === '地标') {
    s = 5;
  }
  s -= num(c.cost && c.cost.n) * 0.2;
  return s;
}

function build(pool) {
  try {
    const have = Object.create(null);
    if (Array.isArray(pool)) {
      for (let i = 0; i < pool.length; i++) {
        const c = pool[i];
        if (c && c.id && !have[c.id]) have[c.id] = c;
      }
    }

    const out = [];
    let total = 0;
    for (let i = 0; i < DECK.length; i++) {
      const e = DECK[i];
      if (have[e.id]) {
        out.push({ id: e.id, n: e.n });
        total += e.n;
      }
    }

    /* 兜底：若卡池缺少指定牌，用池内评分最高的合法牌补足 30；仍保证同名 ≤3。 */
    if (total < 30 && Array.isArray(pool) && pool.length) {
      const counts = Object.create(null);
      for (let i = 0; i < out.length; i++) counts[out[i].id] = out[i].n;
      const rest = pool.slice().filter(function (c) {
        return c && c.id && have[c.id] && num(counts[c.id]) < 3;
      });
      rest.sort(function (a, b) { return cardValue(b) - cardValue(a); });

      for (let i = 0; i < rest.length && total < 30; i++) {
        const c = rest[i];
        const cur = num(counts[c.id]);
        if (cur >= 3) continue;
        const add = Math.min(3 - cur, 30 - total);
        if (add <= 0) continue;
        let found = null;
        for (let j = 0; j < out.length; j++) {
          if (out[j].id === c.id) { found = out[j]; break; }
        }
        if (found) found.n += add;
        else out.push({ id: c.id, n: add });
        counts[c.id] = cur + add;
        total += add;
      }
    }

    while (total > 30 && out.length) {
      const last = out[out.length - 1];
      const cut = Math.min(last.n, total - 30);
      last.n -= cut;
      total -= cut;
      if (last.n <= 0) out.pop();
    }

    if (!out.length) return DECK.map(function (e) { return { id: e.id, n: e.n }; });
    return out;
  } catch (e) {
    return DECK.map(function (x) { return { id: x.id, n: x.n }; });
  }
}

/* 单点伤害：显式列出本套牌用到的卡，再对通用 DSL 兜底。 */
function singleDamage(c) {
  if (!c) return 0;
  if (c.id === 'LQ01-058') return 3;
  const eff = arr(c.effects);
  for (let i = 0; i < eff.length; i++) {
    const e = eff[i];
    if (e && e.do === 'dmg' && e.target === 'enemyUnit') return num(e.n) || 3;
  }
  return 0;
}

/* 敌方群体伤害。 */
function aoeDamage(c) {
  if (!c) return 0;
  if (c.id === 'LQ01-060') return 2;
  if (c.id === 'LQ01-072') return 3;
  const eff = arr(c.effects);
  for (let i = 0; i < eff.length; i++) {
    const e = eff[i];
    if (e && e.do === 'aoe' && e.side === 'enemy') return num(e.n) || 2;
  }
  return 0;
}

function isEarlyAvatar(me) {
  const a = me && me.avatar;
  if (!a || a.used) return false;
  if (a.timing === 'late') return false;
  const name = a.name || '';
  if (name.indexOf('森林先知') >= 0) return true;
  if (name.indexOf('万物母神') >= 0) return num(me.res) >= 4;
  return false;
}

function pickLand(plays) {
  let best = null;
  let bc = 1e9;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    if (!p.c || p.c.type !== '地标') continue;
    const c = num(p.c.cost && p.c.cost.n);
    if (c < bc) { bc = c; best = p; }
  }
  return best;
}

function pickUnit(plays, ctx) {
  let best = null;
  let bs = -1e9;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const c = p.c;
    if (!c || c.type !== '单位') continue;
    if (p.m.target != null && !byUid(ctx.myBoard, p.m.target)) continue;

    let s = num(c.atk) + num(c.imp) + num(c.hp);
    if (hasKw(c, '践踏')) s += 3;
    if (hasKw(c, '守卫')) s += 2;
    if (hasKw(c, '再生')) s += 2;
    if (ctx.myBoard.length === 0 && hasKw(c, '守卫')) s += 6;
    if (ctx.oppMaxAtk >= 3 && hasKw(c, '守卫')) s += 3;
    s -= num(c.cost && c.cost.n) * 0.4;

    /* 带目标的单位牌（进场 buff）：目标只接受己方单位，优先攻击力更高的载体。 */
    if (p.m.target != null) {
      const t = byUid(ctx.myBoard, p.m.target);
      if (t) s += num(t.atk) * 0.5;
    }

    if (s > bs) { bs = s; best = p; }
  }
  return best;
}

function pickRemoval(plays, ctx, emergency) {
  let best = null;
  let bs = -1e9;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const c = p.c;
    const dmg = singleDamage(c);
    if (!dmg || p.m.target == null) continue;
    const t = byUid(ctx.oppBoard, p.m.target);
    if (!t) continue;

    const willKill = num(t.hp) <= dmg;
    /* 紧急点杀只处理「能杀死」或「攻击力已经过线」的目标，避免把解牌浪费在小生物上。 */
    if (emergency && !willKill && num(t.atk) < 5) continue;

    let s = num(t.atk) * 3 - num(t.hp) * 0.5;
    if (willKill) s += 25;
    if (hasKw(t, '守卫')) s += 8;
    if (hasKw(t, '践踏')) s += 5;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}

function pickAoe(plays, ctx, minKills) {
  let best = null;
  let bs = -1e9;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const d = aoeDamage(p.c);
    if (!d) continue;

    let kills = 0;
    for (let j = 0; j < ctx.oppBoard.length; j++) {
      if (num(ctx.oppBoard[j] && ctx.oppBoard[j].hp) <= d) kills++;
    }
    if (kills < minKills) continue;

    let s = kills * 25 + d * 3;
    if (ctx.oppBoard.length >= 3) s += 10;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}

function pickPump(plays, ctx) {
  let best = null;
  let bs = -1e9;
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const c = p.c;
    if (!c || c.type === '单位') continue;

    let isPump = (c.id === 'LQ01-068');
    if (!isPump) {
      const eff = arr(c.effects);
      for (let j = 0; j < eff.length; j++) {
        const e = eff[j];
        if (e && e.do === 'buff' && e.target === 'unit' && num(e.atk) > 0) { isPump = true; break; }
      }
    }
    if (!isPump || p.m.target == null) continue;

    const t = byUid(ctx.myBoard, p.m.target);
    if (!t || !ctx.attackUids[t.uid]) continue;

    let s = 25 + num(t.atk) * 2 + num(t.imp) * 2;
    if (hasKw(t, '践踏')) s += 10;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}

function pickOther(plays, ctx) {
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    const c = p.c;
    if (!c) continue;
    if (c.type === '单位' || c.type === '地标') continue;
    if (singleDamage(c) || aoeDamage(c) || c.id === 'LQ01-068') continue;
    if (p.m.target != null
      && !byUid(ctx.myBoard, p.m.target)
      && !byUid(ctx.oppBoard, p.m.target)) continue;
    return p;
  }
  return null;
}

function pickFace(faceMoves, myBoard) {
  let best = null;
  let bs = -1e9;
  for (let i = 0; i < faceMoves.length; i++) {
    const m = faceMoves[i];
    const u = byUid(myBoard, m.uid);
    const s = u ? num(u.imp) * 10 + num(u.atk) : 0;
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}

function pickAttack(attackMoves, myBoard, oppBoard) {
  const face = [];
  for (let i = 0; i < attackMoves.length; i++) {
    if (attackMoves[i] && attackMoves[i].target === 'face') face.push(attackMoves[i]);
  }
  if (face.length) {
    const f = pickFace(face, myBoard);
    if (f) return f;
  }

  let best = null;
  let bs = -1e9;
  for (let i = 0; i < attackMoves.length; i++) {
    const m = attackMoves[i];
    if (!m || m.target === 'face') continue;
    const a = byUid(myBoard, m.uid);
    const d = byUid(oppBoard, m.target);
    if (!a || !d) continue;

    let s = 0;
    if (num(a.atk) >= num(d.hp)) s += 25;
    else s -= 5;
    if (num(d.atk) >= num(a.hp)) s -= 30;
    if (hasKw(a, '践踏')) s += 10;
    s += num(d.atk) * 2 - num(d.hp);
    if (s > bs) { bs = s; best = m; }
  }
  return (best && bs > 0) ? best : null;
}

function choose(view, moves) {
  try {
    if (!Array.isArray(moves) || moves.length === 0) return null;

    let passMove = null;
    for (let i = moves.length - 1; i >= 0; i--) {
      if (moves[i] && moves[i].type === 'pass') { passMove = moves[i]; break; }
    }
    if (!passMove) passMove = moves[moves.length - 1];

    const me = (view && view.me) || {};
    const opp = (view && view.opp) || {};
    const hand = arr(me.hand);
    const myBoard = arr(me.board);
    const oppBoard = arr(opp.board);
    const oppLife = num(opp.life);

    const playMoves = [];
    const attackMoves = [];
    const avatarMoves = [];
    const ascendMoves = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (!m) continue;
      if (m.type === 'play') playMoves.push(m);
      else if (m.type === 'attack') attackMoves.push(m);
      else if (m.type === 'avatar') avatarMoves.push(m);
      else if (m.type === 'ascend') ascendMoves.push(m);
    }

    const plays = [];
    for (let i = 0; i < playMoves.length; i++) {
      const c = cardAt(hand, playMoves[i].i);
      if (c) plays.push({ m: playMoves[i], c: c });
    }

    const attackUids = Object.create(null);
    for (let i = 0; i < attackMoves.length; i++) {
      if (attackMoves[i] && attackMoves[i].uid != null) attackUids[attackMoves[i].uid] = true;
    }

    const ctx = {
      myBoard: myBoard,
      oppBoard: oppBoard,
      oppMaxAtk: maxAtk(oppBoard),
      attackUids: attackUids,
      oppLife: oppLife,
      res: num(me.res),
      handSize: hand.length
    };

    /* 0 早启灵体：默认绿色 A 灵体（森林先知·盖亚）免费 +2 法力，先开再出牌。 */
    if (avatarMoves.length && isEarlyAvatar(me)) return avatarMoves[0];

    /* 1 斩杀：所有可打脸单位的 IMP 合计已够，直接走脸。 */
    if (attackMoves.length) {
      const faceMoves = [];
      for (let i = 0; i < attackMoves.length; i++) {
        if (attackMoves[i] && attackMoves[i].target === 'face') faceMoves.push(attackMoves[i]);
      }
      if (faceMoves.length) {
        let sum = 0;
        for (let i = 0; i < faceMoves.length; i++) {
          const u = byUid(myBoard, faceMoves[i].uid);
          if (u) sum += num(u.imp);
        }
        if (oppLife > 0 && sum >= oppLife) {
          const lethal = pickFace(faceMoves, myBoard);
          if (lethal) return lethal;
        }
      }
    }

    /* 2 地标：净零费用，先落地标永久抬高法力与回合末补牌。 */
    if (arr(me.lands).length < 8) {
      const land = pickLand(plays);
      if (land) return land.m;
    }

    /* 3 扫场：能一次清掉 2 个以上敌方单位时优先。 */
    const aoe2 = pickAoe(plays, ctx, 2);
    if (aoe2) return aoe2.m;

    /* 4 紧急点杀：对手已有 3 攻以上单位时，先处理可杀死或 5 攻以上的目标。 */
    if (ctx.oppMaxAtk >= 3) {
      const rm = pickRemoval(plays, ctx, true);
      if (rm) return rm.m;
    }

    /* 5 单位：按身材与关键词排序，优先落地当前法力能支付的最大威胁。 */
    const unit = pickUnit(plays, ctx);
    if (unit) return unit.m;

    /* 6 强化：只强化本回合已经能攻击的单位，避免把强化打在召唤失调的单位上。 */
    const pump = pickPump(plays, ctx);
    if (pump) return pump.m;

    /* 7 剩余点杀：用过场面牌后再把解牌打出去。 */
    if (oppBoard.length) {
      const rm2 = pickRemoval(plays, ctx, false);
      if (rm2) return rm2.m;
    }

    /* 8 单杀扫场：敌方至少 2 个单位、且能杀死其中 1 个时结算。 */
    if (oppBoard.length >= 2) {
      const aoe1 = pickAoe(plays, ctx, 1);
      if (aoe1) return aoe1.m;
    }

    /* 9 其他牌：未知类型/未知效果的安全兜底。 */
    const other = pickOther(plays, ctx);
    if (other) return other.m;

    /* 10 安全升灵：只吃召唤失调或本回合已攻击的单位，不损失当回合攻击；
     *    优先把刚打出的巨犀/漫步者换成更大的外枢，并用降临效果继续展开。 */
    if (ascendMoves.length) {
      const safeAscend = pickAscend(ascendMoves, ctx, false);
      if (safeAscend) return safeAscend;
    }

    /* 11 晚启灵体：非森林先知或 timing='late' 的灵体，放在攻击前。 */
    if (avatarMoves.length) return avatarMoves[0];

    /* 12 攻击：有脸打脸；只有守卫挡路时才做有利交换。 */
    const atk = pickAttack(attackMoves, myBoard, oppBoard);
    if (atk) return atk;

    /* 13 战后升灵：攻击结束后再吃已攻击或未参与攻击的单位；
     *    新外枢本回合不再攻击，但会把战力留到下一回合。 */
    if (ascendMoves.length) {
      const lateAscend = pickAscend(ascendMoves, ctx, true);
      if (lateAscend) return lateAscend;
    }

    return passMove;
  } catch (e) {
    if (Array.isArray(moves) && moves.length) {
      for (let i = moves.length - 1; i >= 0; i--) {
        if (moves[i] && moves[i].type === 'pass') return moves[i];
      }
      return moves[moves.length - 1];
    }
    return null;
  }
}

/* 防守：生命 >15 时保留单位、不轻易换血；≤15 优先用低攻高耐久单位挡；
 * 生命 ≤8 且没有可消耗的墙时，允许用最高耐久单位硬挡，先保命。 */
function block(view, bmoves) {
  try {
    if (!Array.isArray(bmoves) || bmoves.length === 0) return null;

    let noBlock = null;
    for (let i = bmoves.length - 1; i >= 0; i--) {
      if (bmoves[i] && bmoves[i].type === 'noBlock') { noBlock = bmoves[i]; break; }
    }
    if (!noBlock) noBlock = bmoves[bmoves.length - 1];

    const me = (view && view.me) || {};
    const life = num(me.life);
    if (life > 15) return noBlock;

    const board = arr(me.board);
    let best = null;
    let bs = -1e9;
    let emergency = null;
    let es = -1e9;

    for (let i = 0; i < bmoves.length; i++) {
      const m = bmoves[i];
      if (!m || m.type !== 'block') continue;
      const u = byUid(board, m.uid);
      if (!u) continue;

      const s = num(u.hp) * 2 - num(u.atk) + (hasKw(u, '守卫') ? 2 : 0);

      /* 常规阻挡：攻击力 ≤3、耐久 ≥3 的消耗型单位，巨兽留给进攻。 */
      if (num(u.atk) <= 3 && num(u.hp) >= 3) {
        if (s > bs) { bs = s; best = m; }
      } else if (life <= 8) {
        /* 保命阻挡：没有便宜墙时，用当前耐久最高的单位挡。 */
        if (s > es) { es = s; emergency = m; }
      }
    }
    return best || emergency || noBlock;
  } catch (e) {
    if (Array.isArray(bmoves) && bmoves.length) return bmoves[bmoves.length - 1];
    return null;
  }
}
