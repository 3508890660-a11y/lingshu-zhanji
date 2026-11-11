/**
 * 《灵枢战纪》AI 脚本 · 青色「潮汐涡流」
 *
 * 构筑口径（青 = 法力 min(回合+1,6)，灵体 236 回合开始再 +1，实际 T5 起 7 点）：
 *   青是「低上限＋高牌流」：每回合抽 2、灵体免费抽 1、流转再抽 ⌊打出数÷2⌋，
 *   所以它不缺牌，缺的是把牌换成场面的顺序。
 *   主力是 140 涡流长老（4 费，本回合每打 1 张 +1 ATK，引擎结算两次 ⇒ 打出 3 张时 3/2/4 变 9/2/4）
 *   与 136 月潮终曲（6 费 5/4/7，全体 +1/+1，自己变 6/5/8）。
 *   131 深海重压 / 290 碎晶冲击 是仅有的 3 点点杀，294 遣返 处理 5 耐久以上的墙。
 *
 * 决策口径：
 *   免费灵体抽牌 → 斩杀 → 连击共鸣（第 2 张起抽 2）→ 月潮终曲 → 点杀 →
 *   涡流长老 → 空场先铺便宜身体 → 守卫 → 1 费身体 → 回手大兽 → 过牌 →
 *   兜底出牌 → 攻击（先做赚的换牌，再压脸）→ pass。
 *   阻挡只在「能活／能杀／不挡就死」时做，终端单位不拿去挡。
 *   响应只在对手的法术/结界是群体或破坏、且手里有「反击」时开。
 *   所有返回值都是 moves / bmoves 里的原对象引用，不新建动作、不改 view。
 */
var meta = {
  name: 'deepseek v4.1flash · 潮汐涡流',
  desc: '执行模型 deepseek-v4.1-flash；颜色 青；策略 潮汐涡流（tempo-vortex）；用流转与灵体把牌换成场面，涡流长老与月潮终曲做中终端，深海重压/碎晶冲击清场，涨潮反击打掉对手的群体与破坏。',
  id: 'model:deepseekv41flash',
  color: '青'
};

/* 30 张 / 12 名目。主色青 + 灰 290、292、294、286。同名 ≤3。 */
var DECK = [
  { id: 'LQ01-127', n: 3 }, // 潮汐幼灵 法力1 1/1/2，涨潮 2 攻：最便宜的站场与涡流计数
  { id: 'LQ01-138', n: 3 }, // 连击共鸣 法力1：本回合第 2 张起抽 2，整套牌的循环核心
  { id: 'LQ01-286', n: 1 }, // 褪色符文 通用1：抽 1，第 2 张牌的拼图
  { id: 'LQ01-129', n: 3 }, // 潮汐号令 法力2：抽 1 + 切换潮汐，把多余法力换成牌
  { id: 'LQ01-290', n: 3 }, // 碎晶冲击 通用2：3 点点杀，补青唯一的短板
  { id: 'LQ01-292', n: 2 }, // 石肤守卫 通用2 1/2/3 守卫：前期挡红/黑的冲锋
  { id: 'LQ01-294', n: 1 }, // 遣返 通用2：回手，处理 5 耐久以上的墙
  { id: 'LQ01-134', n: 2 }, // 涨潮反击 瞬间 法力2：反击，专打对手的群体与破坏
  { id: 'LQ01-133', n: 3 }, // 潮卫·堤灵 法力3 2/2/5 守卫：中期的防守支点
  { id: 'LQ01-131', n: 3 }, // 深海重压 法力3：3 点点杀
  { id: 'LQ01-140', n: 3 }, // 涡流长老 法力4 3/2/4：涡流3，本回合打满 3 张后是 9 攻
  { id: 'LQ01-136', n: 3 }  // 月潮终曲 法力6 5/4/7：全体 +1/+1，落地即 6/5/8
];

function num(v) {
  return typeof v === 'number' && isFinite(v) ? v : 0;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function hasKw(card, kw) {
  return !!(card && Array.isArray(card.kw) && card.kw.indexOf(kw) >= 0);
}

function costOf(card) {
  return card && card.cost && typeof card.cost.n === 'number' ? card.cost.n : 0;
}

function byUid(list, uid) {
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].uid === uid) return list[i];
  }
  return null;
}

function lastPass(moves) {
  for (var i = moves.length - 1; i >= 0; i--) {
    if (moves[i] && moves[i].type === 'pass') return moves[i];
  }
  return null;
}

function lastNoBlock(bmoves) {
  for (var i = bmoves.length - 1; i >= 0; i--) {
    if (bmoves[i] && bmoves[i].type === 'noBlock') return bmoves[i];
  }
  return null;
}

/* 兜底补齐用：万一卡池缺卡，用池内「便宜且耐久高」的牌补满 30。 */
function fillScore(c) {
  if (!c) return -99;
  var s = 0;
  if (c.type === '单位') s += 6 + num(c.hp) * 1.2 + num(c.atk) * 0.6;
  else if (c.type === '法术') s += 3.5;
  else if (c.type === '瞬间') s += 2.5;
  else if (c.type === '结界') s += 2;
  else s += 1;
  s -= costOf(c) * 0.9;
  if (c.color === '灰') s -= 0.5;
  return s;
}

function build(pool) {
  try {
    var have = Object.create(null);
    if (Array.isArray(pool)) {
      for (var i = 0; i < pool.length; i++) {
        var c = pool[i];
        if (c && c.id && !have[c.id]) have[c.id] = c;
      }
    }

    var out = [];
    var total = 0;
    for (var j = 0; j < DECK.length; j++) {
      var e = DECK[j];
      if (!have[e.id]) continue;
      out.push({ id: e.id, n: e.n });
      total += e.n;
    }

    /* 兜底：卡池异常缺牌时按 fillScore 补足 30，仍遵守同名 ≤3。 */
    if (total < 30 && Array.isArray(pool) && pool.length) {
      var rest = pool.slice();
      rest.sort(function (a, b) { return fillScore(b) - fillScore(a); });
      for (var k = 0; k < rest.length && total < 30; k++) {
        var card = rest[k];
        if (!card || !card.id) continue;
        var cur = 0;
        var slot = null;
        for (var q = 0; q < out.length; q++) {
          if (out[q].id === card.id) { cur = out[q].n; slot = out[q]; break; }
        }
        if (cur >= 3) continue;
        var add = Math.min(3 - cur, 30 - total);
        if (add <= 0) continue;
        if (slot) slot.n += add;
        else out.push({ id: card.id, n: add });
        total += add;
      }
    }

    while (total > 30 && out.length) {
      var last = out[out.length - 1];
      var cut = Math.min(last.n, total - 30);
      last.n -= cut;
      total -= cut;
      if (last.n <= 0) out.pop();
    }

    if (!out.length) {
      var fallback = [];
      for (var r = 0; r < DECK.length; r++) fallback.push({ id: DECK[r].id, n: DECK[r].n });
      return fallback;
    }
    return out;
  } catch (err) {
    var safe = [];
    for (var s = 0; s < DECK.length; s++) safe.push({ id: DECK[s].id, n: DECK[s].n });
    return safe;
  }
}

/* 单次攻击里最有价值的打脸动作：imp 高的先走。 */
function bestFace(faceAtks, board) {
  var best = null;
  var bs = -1;
  for (var i = 0; i < faceAtks.length; i++) {
    var m = faceAtks[i];
    var u = byUid(board, m.uid);
    var v = u ? num(u.imp) * 10 + num(u.atk) : -1;
    if (v > bs) { bs = v; best = m; }
  }
  return best;
}

/**
 * 攻击排序：
 *   1) 能杀且不会被反杀的单位对拼（最赚）
 *   2) 打脸
 *   3) 能杀但会被反杀的交换（只在对方更值钱时）
 *   4) 打不死的削弱（自己不会死才做）
 */
function pickAttack(atks, board, eboard) {
  var faceBest = null;
  var faceImp = -1;
  var killBest = null;
  var killVal = -1e9;
  var tradeBest = null;
  var tradeVal = -1e9;
  var chipBest = null;
  var chipVal = -1e9;

  for (var i = 0; i < atks.length; i++) {
    var m = atks[i];
    var a = byUid(board, m.uid);
    if (!a) continue;

    if (m.target === 'face') {
      if (num(a.imp) > faceImp) { faceImp = num(a.imp); faceBest = m; }
      continue;
    }

    var t = byUid(eboard, m.target);
    if (!t) continue;
    var kills = num(a.atk) >= num(t.hp);
    var dies = num(t.atk) >= num(a.hp);
    var val = num(t.atk) * 2 + num(t.hp) + (hasKw(t, '守卫') ? 5 : 0) + (hasKw(t, '守护1') ? 2 : 0);

    if (kills && !dies) {
      if (val > killVal) { killVal = val; killBest = m; }
    } else if (kills && dies) {
      if (val - (num(a.atk) + num(a.hp)) > 4 && val > tradeVal) { tradeVal = val; tradeBest = m; }
    } else if (!kills && !dies && num(a.atk) > 0) {
      if (val > chipVal) { chipVal = val; chipBest = m; }
    }
  }

  if (killBest) return killBest;
  if (faceBest) return faceBest;
  if (tradeBest) return tradeBest;
  if (chipBest) return chipBest;
  return null;
}

function choose(view, moves) {
  try {
    if (!Array.isArray(moves) || moves.length === 0) return null;
    var pass = lastPass(moves);
    if (!pass) pass = moves[moves.length - 1];

    var me = (view && view.me) || {};
    var opp = (view && view.opp) || {};
    var hand = arr(me.hand);
    var board = arr(me.board);
    var eboard = arr(opp.board);
    var olife = num(opp.life);
    var res = num(me.res);
    var used = num(me.plays);

    var avatarActs = [];
    var atks = [];
    var plays = [];   // { m, c }：只收主要阶段可用的非瞬间牌
    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      if (!mv) continue;
      if (mv.type === 'avatar') avatarActs.push(mv);
      else if (mv.type === 'attack') atks.push(mv);
      else if (mv.type === 'play') {
        var hc = hand[mv.i];
        if (!hc || hc.type === '瞬间') continue;   // 瞬间只留给响应窗口
        plays.push({ m: mv, c: hc });
      }
    }

    /* 0 灵体能力：青 236 免费抽 1，永远是第一步。 */
    if (avatarActs.length && me.avatar && !me.avatar.used) return avatarActs[0];

    /* 1 斩杀：所有可打脸单位的 IMP 合计已经够，直接压死。 */
    var faceAtks = [];
    for (i = 0; i < atks.length; i++) if (atks[i].target === 'face') faceAtks.push(atks[i]);
    if (faceAtks.length && olife > 0) {
      var seen = Object.create(null);
      var total = 0;
      for (i = 0; i < faceAtks.length; i++) {
        var fm = faceAtks[i];
        if (seen[fm.uid]) continue;
        seen[fm.uid] = true;
        var fu = byUid(board, fm.uid);
        if (fu) total += num(fu.imp);
      }
      if (total >= olife) {
        var lethal = bestFace(faceAtks, board);
        if (lethal) return lethal;
      }
    }

    /* 按卡号取一个可用动作（target 需要时挑价值最高的己方单位）。 */
    function pickById(id) {
      var best = null;
      var bs = -1e9;
      for (var k = 0; k < plays.length; k++) {
        var p = plays[k];
        if (p.c.id !== id) continue;
        var s = 0;
        if (p.m.target != null) {
          var t = byUid(board, p.m.target);
          s = t ? num(t.hp) * 2 + num(t.atk) : 0;
        }
        if (s > bs) { bs = s; best = p.m; }
      }
      return best;
    }

    /* 点杀：优先能杀死的目标；杀不死时只处理 4 攻以上的威胁。 */
    function pickRemoval() {
      var best = null;
      var bs = -1e9;
      for (var k = 0; k < plays.length; k++) {
        var p = plays[k];
        var c = p.c;
        if (c.id !== 'LQ01-131' && c.id !== 'LQ01-290') continue;
        if (p.m.target == null) continue;
        var t = byUid(eboard, p.m.target);
        if (!t) continue;
        var kills = num(t.hp) <= 3;
        if (!kills && num(t.atk) < 4) continue;
        var val = num(t.atk) * 2 + num(t.hp) + (hasKw(t, '守卫') ? 5 : 0) + (hasKw(t, '守护1') ? 2 : 0);
        var s = kills ? 100 + val : val * 0.6;
        if (s > bs) { bs = s; best = p.m; }
      }
      return best;
    }

    /* 回手：只回 4 攻以上或 5 耐久以上的东西，换的是对手一整回合的费。 */
    function pickBounce() {
      var best = null;
      var bs = -1e9;
      for (var k = 0; k < plays.length; k++) {
        var p = plays[k];
        if (p.c.id !== 'LQ01-294') continue;
        if (p.m.target == null) continue;
        var t = byUid(eboard, p.m.target);
        if (!t) continue;
        if (num(t.atk) < 4 && num(t.hp) < 5) continue;
        var s = num(t.atk) * 2 + num(t.hp) + (hasKw(t, '守卫') ? 5 : 0);
        if (s > bs) { bs = s; best = p.m; }
      }
      return best;
    }

    /* 2 连击共鸣：本回合第 2 张起抽 2，1 费的循环发动机。 */
    if (used >= 1) {
      var p138 = pickById('LQ01-138');
      if (p138) return p138;
    }

    /* 3 月潮终曲：6 费的场面跃迁，能下就下。 */
    var p136 = pickById('LQ01-136');
    if (p136 && res >= 6) return p136;

    /* 4 点杀：先把对手的威胁换成弃牌区。 */
    var removal = pickRemoval();
    if (removal) return removal;

    /* 5 涡流长老：4 费的攻击核心。 */
    var p140 = pickById('LQ01-140');
    if (p140 && res >= 4) return p140;

    /* 6 空场：先用两个便宜身体占住场面，别把 3 费全押在一个守卫上。 */
    if (board.length === 0) {
      var first = pickById('LQ01-127');
      if (first) return first;
      var second = pickById('LQ01-292');
      if (second) return second;
    }

    /* 7 守卫：2/2/5 与 1/2/3，挡冲锋与自残。 */
    var p133 = pickById('LQ01-133');
    if (p133 && board.length < 4) return p133;
    var p292 = pickById('LQ01-292');
    if (p292 && board.length < 4) return p292;

    /* 8 1 费身体：涡流计数与攻击频率。 */
    var p127 = pickById('LQ01-127');
    if (p127 && board.length < 5) return p127;

    /* 9 回手大兽。 */
    var bounce = pickBounce();
    if (bounce) return bounce;

    /* 10 过牌：手牌没满才换，满 7 张时抽牌等于白丢。 */
    var p286 = pickById('LQ01-286');
    if (p286 && hand.length <= 6) return p286;
    var p129 = pickById('LQ01-129');
    if (p129 && hand.length <= 6) return p129;

    /* 11 兜底：任何还没用掉的非瞬间牌（含未知卡）。 */
    if (plays.length) return plays[0].m;

    /* 12 攻击。 */
    var atk = pickAttack(atks, board, eboard);
    if (atk) return atk;

    return pass;
  } catch (err) {
    if (Array.isArray(moves) && moves.length) {
      var fb = lastPass(moves);
      if (fb) return fb;
      return moves[moves.length - 1];
    }
    return null;
  }
}

/**
 * 防守：只在三种情况下阻挡——能活、能杀、不挡就死。
 * 终端（月潮终曲 / 涡流长老）不拿去挡，除非生命已经见底。
 */
function block(view, bmoves) {
  try {
    if (!Array.isArray(bmoves) || bmoves.length === 0) return null;
    var noBlock = lastNoBlock(bmoves);
    if (!noBlock) noBlock = bmoves[bmoves.length - 1];

    var me = (view && view.me) || {};
    var board = arr(me.board);
    var eboard = arr((view && view.opp && view.opp.board) || []);
    var life = num(me.life);

    /* 攻击者：引擎在宣告时把 attacked 置 true，用它的 ATK 估算这次要挨多少。 */
    var atk = 0;
    var ahp = 999;
    var found = false;
    for (var i = 0; i < eboard.length; i++) {
      var eu = eboard[i];
      if (!eu || !eu.attacked) continue;
      found = true;
      if (num(eu.atk) > atk) atk = num(eu.atk);
      if (num(eu.hp) < ahp) ahp = num(eu.hp);
    }
    if (!found) {
      for (i = 0; i < eboard.length; i++) {
        var eu2 = eboard[i];
        if (eu2 && num(eu2.atk) > atk) atk = num(eu2.atk);
      }
    }

    var best = null;
    var bs = -1e9;
    for (i = 0; i < bmoves.length; i++) {
      var m = bmoves[i];
      if (!m || m.type !== 'block') continue;
      var u = byUid(board, m.uid);
      if (!u) continue;

      var survive = num(u.hp) > atk;
      var kill = num(u.atk) >= ahp;
      var s = 0;
      if (survive) s += 6;
      if (kill) s += 5;
      if (atk >= 4) s += 2;
      if (life <= atk) s += 15;          // 不挡就被打死
      else if (life <= 10) s += 3;
      s -= (num(u.atk) + num(u.hp)) * 0.35;
      var nm = String(u.name || '');
      if (nm.indexOf('月潮') >= 0) s -= 9;   // 终端不挡
      if (nm.indexOf('涡流') >= 0) s -= 6;
      if (hasKw(u, '守卫')) s += 1;

      if (s > bs) { bs = s; best = m; }
    }

    if (best && bs >= 4) return best;
    return noBlock;
  } catch (err) {
    if (Array.isArray(bmoves) && bmoves.length) {
      var nb = lastNoBlock(bmoves);
      if (nb) return nb;
      return bmoves[bmoves.length - 1];
    }
    return null;
  }
}

/**
 * 响应：只在对手打出「群体 / 破坏 / 高费」的法术或结界时，
 * 用 134 涨潮反击整体无效它。其余一律 pass，把 2 点法力留着。
 */
function respond(view, ctx, moves) {
  try {
    if (!Array.isArray(moves) || moves.length === 0) return null;
    var pass = null;
    for (var i = 0; i < moves.length; i++) {
      if (moves[i] && moves[i].type === 'pass') { pass = moves[i]; break; }
    }
    if (!pass) pass = moves[moves.length - 1];

    if (!ctx || ctx.kind !== 'play') return pass;
    var card = ctx.card || {};
    if (card.type !== '法术' && card.type !== '结界') return pass;

    var me = (view && view.me) || {};
    var board = arr(me.board);
    var life = num(me.life);
    var text = String(card.text || '');
    var n = card.cost && typeof card.cost.n === 'number' ? card.cost.n : 0;

    var score = 0;
    if (/全体|所有/.test(text)) score += board.length >= 2 ? 6 : 0;
    if (/破坏/.test(text)) score += board.length ? 4 : 0;
    if (/对对手造成/.test(text)) score += life <= 14 ? 4 : 1;
    if (n >= 5) score += 1;

    if (score < 4) return pass;

    for (i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!m || m.type !== 'respond') continue;
      var hc = arr(me.hand)[m.i];
      if (hc && /反击/.test(String(hc.text || ''))) return m;
    }
    return pass;
  } catch (err) {
    if (Array.isArray(moves) && moves.length) {
      for (var k = 0; k < moves.length; k++) {
        if (moves[k] && moves[k].type === 'pass') return moves[k];
      }
      return moves[moves.length - 1];
    }
    return null;
  }
}
