/* ============================================================
 * kimi28preview · 红 · 血怒計畫
 * 灵体：狂战士·拉格纳（全体冲锋）。
 * 关键规则口径：单位直击灵体只结算 IMP；ATK 仅用于单位互撞；
 *              践踏溢出、疾风 +1 另算。
 * 思路：低费高 IMP 单位每回合稳定踢 2~4，T4 起焚天血咒/血红爆发
 *       直伤收尾；烈阳断刃/焚心咒负责拆墙。
 * 无状态设计：每个动作只从当前 moves 推导（引擎每回合重置 avatar/attacked），
 *            不依赖跨回合标志 —— respond 窗口只在手上有瞬间卡时才打开，
 *            不能当作回合边界用。
 * 回合序：铺单位 → 结界 → 拆挡路守卫 → 灵体过载 → 攻击（先高 IMP）
 *         → 直伤斩杀 → 残局点杀 → 血红爆发 → pass
 * ============================================================ */

var meta = {
  name: 'kimi28preview · 血怒計畫',
  desc: '执行模型 kimi-k2.8-preview；颜色 红；策略 血怒計畫；全体冲锋+回合末全弃补牌，低费高IMP滚雪球+直伤收尾',
  id: 'model:kimi28preview',
  color: '红'
};

/* ---------- build ---------- */

var WISH_LIST = [
  { id: 'LQ01-037', n: 3 }, // 赤刃幼虎   激情1 1/1/1 冲锋
  { id: 'LQ01-038', n: 3 }, // 怒火新兵   激情1 2/1/1 冲锋 怒火
  { id: 'LQ01-039', n: 3 }, // 熔岩裂爪   激情2 2/1/2 冲锋
  { id: 'LQ01-041', n: 3 }, // 烈阳断刃   激情2 瞬间 对单位3伤
  { id: 'LQ01-044', n: 3 }, // 烬原猛虎   激情3 3/2/2 冲锋
  { id: 'LQ01-047', n: 3 }, // 燃焰卫士   激情2 2/2/2 过载1 → 本回合 3/2/2
  { id: 'LQ01-052', n: 3 }, // 战鼓蛮兵   激情3 3/2/2 战吼 全体 IMP+1
  { id: 'LQ01-048', n: 3 }, // 焚心咒     激情3 过载1 对单位4伤
  { id: 'LQ01-042', n: 3 }, // 焚天血咒   激情4 打脸4（本回合有单位死过则6）
  { id: 'LQ01-046', n: 3 }  // 血红爆发   激情6 全体 IMP+1 + 每攻击过1单位追1
];

function build(pool) {
  var inPool = {};
  var i;
  for (i = 0; i < (pool || []).length; i++) {
    if (pool[i] && pool[i].id) inPool[pool[i].id] = true;
  }
  var deck = [];
  var total = 0;
  for (i = 0; i < WISH_LIST.length; i++) {
    if (inPool[WISH_LIST[i].id]) {
      deck.push({ id: WISH_LIST[i].id, n: WISH_LIST[i].n });
      total += WISH_LIST[i].n;
    }
  }
  // 兜底：卡池缺卡时用池内卡补足 30 张（优先低费，同名≤3）
  if (total < 30) {
    var counts = {};
    for (i = 0; i < deck.length; i++) counts[deck[i].id] = deck[i].n;
    var poolCards = (pool || []).slice();
    poolCards.sort(function (a, b) {
      var ca = a && a.cost ? (a.cost.n || 0) : 9;
      var cb = b && b.cost ? (b.cost.n || 0) : 9;
      return ca - cb;
    });
    for (i = 0; i < poolCards.length && total < 30; i++) {
      var c = poolCards[i];
      if (!c || !c.id) continue;
      var have = counts[c.id] || 0;
      if (have >= 3) continue;
      var add = Math.min(3 - have, 30 - total);
      if (add <= 0) continue;
      if (have === 0) deck.push({ id: c.id, n: add });
      else { for (var d = 0; d < deck.length; d++) if (deck[d].id === c.id) deck[d].n = have + add; }
      counts[c.id] = have + add;
      total += add;
    }
  }
  return deck;
}

/* ---------- 工具 ---------- */

function passOf(moves) {
  for (var i = 0; i < moves.length; i++) {
    if (moves[i] && moves[i].type === 'pass') return moves[i];
  }
  return moves[moves.length - 1];
}

function atkOf(u) { return (u && typeof u.atk === 'number') ? u.atk : 0; }
function impOf(u) { return (u && typeof u.imp === 'number') ? u.imp : 0; }
function hpOf(u) { return (u && typeof u.hp === 'number') ? u.hp : 0; }

function cardText(c) {
  var t = '';
  if (!c) return t;
  if (typeof c.text === 'string') t += ' ' + c.text;
  if (Array.isArray(c.effects)) {
    for (var i = 0; i < c.effects.length; i++) t += ' ' + JSON.stringify(c.effects[i]);
  }
  return t;
}

function hasEffect(c, doName) {
  if (!c) return false;
  var es = c.effects || [];
  for (var i = 0; i < es.length; i++) {
    if (es[i] && es[i].do === doName) return true;
  }
  return false;
}

/* 单目标点杀（对敌方单位造成伤害 / 破坏） */
function isSpotDamage(c) {
  if (!c) return false;
  var es = c.effects || [];
  for (var i = 0; i < es.length; i++) {
    var e = es[i] || {};
    if ((e.do === 'dmg' || e.do === 'destroy') && /enemyUnit/.test(String(e.target))) return true;
  }
  var t = cardText(c);
  return /造成[^。；]*伤害/.test(t) && /单位/.test(t) && !/所有|全体/.test(t);
}

function spotDmg(c) {
  if (!c) return 0;
  var es = c.effects || [];
  var best = 0;
  for (var i = 0; i < es.length; i++) {
    var e = es[i] || {};
    if (e.do === 'dmg' && /enemyUnit/.test(String(e.target)) && e.n > best) best = e.n;
  }
  if (best) return best;
  var m = cardText(c).match(/造成\s*(\d+)\s*点伤害/);
  return m ? parseInt(m[1], 10) : 3;
}

/* 对对手直伤 */
function isDirectDamage(c) {
  if (!c) return false;
  var es = c.effects || [];
  for (var i = 0; i < es.length; i++) {
    if (es[i] && es[i].do === 'dmg' && es[i].target === 'face') return true;
  }
  return /对对手造成/.test(cardText(c));
}

function directDmg(c) {
  if (!c) return 0;
  var es = c.effects || [];
  for (var i = 0; i < es.length; i++) {
    if (es[i] && es[i].do === 'dmg' && es[i].target === 'face') return es[i].n || 0;
  }
  var m = cardText(c).match(/对对手造成\s*(\d+)\s*点/);
  return m ? parseInt(m[1], 10) : 0;
}

/* 血红爆发类：按本回合已攻击单位数追伤 */
function isAttackCounter(c) {
  return /每有\s*1\s*个单位攻击过/.test(cardText(c));
}

/* 全体 AOE（会误伤己方单位的不在此主动使用） */
function isAoeDamage(c) {
  if (!c) return false;
  var es = c.effects || [];
  for (var i = 0; i < es.length; i++) {
    var e = es[i] || {};
    if (e.do === 'aoe' && !/enemy/.test(String(e.target))) return true;
  }
  var t = cardText(c);
  return /对所有敌方单位造成/.test(t);
}

function aoeDmg(c) {
  if (!c) return 0;
  var es = c.effects || [];
  for (var i = 0; i < es.length; i++) {
    var e = es[i] || {};
    if (e.do === 'aoe') return e.n || 1;
  }
  var m = cardText(c).match(/对所有敌方单位造成\s*(\d+)\s*点/);
  return m ? parseInt(m[1], 10) : 1;
}

function oppUnits(view) { return ((view && view.opp && view.opp.board) || []); }
function ownUnits(view) { return ((view && view.me && view.me.board) || []); }

function findUnit(view, uid, own) {
  var us = own ? ownUnits(view) : oppUnits(view);
  for (var i = 0; i < us.length; i++) if (us[i] && us[i].uid === uid) return us[i];
  return null;
}

/* 可动单位直击伤害（IMP 合计） */
function faceDamageOf(view) {
  var total = 0;
  var mine = ownUnits(view);
  for (var i = 0; i < mine.length; i++) {
    var u = mine[i];
    if (u && !u.frozen && !u.attacked && impOf(u) > 0) total += impOf(u);
  }
  return total;
}

/* 手牌直伤总量 */
function handBurn(view) {
  var hand = (view && view.me && view.me.hand) || [];
  var total = 0;
  for (var i = 0; i < hand.length; i++) {
    var c = hand[i];
    if (c && isDirectDamage(c)) total += directDmg(c);
  }
  return total;
}

/* 本回合已攻击过的单位数（供血红爆发估算） */
function attackedCount(view) {
  var n = 0;
  var mine = ownUnits(view);
  for (var i = 0; i < mine.length; i++) {
    if (mine[i] && mine[i].attacked) n++;
  }
  return n;
}

/* 在带 target 的 play 动作里挑一个能被打死的敌方单位，优先高 ATK */
function pickKillableTarget(view, plays, dmg) {
  var best = null, bestScore = -1e9;
  for (var j = 0; j < plays.length; j++) {
    var m = plays[j];
    if (!m || m.target === undefined || m.target === null) continue;
    var u = findUnit(view, m.target, false);
    if (!u) continue;
    if (dmg > 0 && hpOf(u) > dmg) continue; // 打不死的不浪费
    var score = atkOf(u) * 10 + impOf(u) * 5 - hpOf(u);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/* ---------- choose（无状态） ---------- */

function choose(view, moves) {
  if (!Array.isArray(moves) || !moves.length) return null;
  var me = (view && view.me) || {};
  var opp = (view && view.opp) || {};
  var hand = Array.isArray(me.hand) ? me.hand : [];
  var oppLife = (typeof opp.life === 'number') ? opp.life : 99;

  var plays = [], attacks = [], avatarMove = null;
  var hasFaceAttack = false;
  var i;
  for (i = 0; i < moves.length; i++) {
    var mv = moves[i];
    if (!mv || !mv.type) continue;
    if (mv.type === 'play') plays.push(mv);
    else if (mv.type === 'attack') {
      attacks.push(mv);
      if (mv.target === 'face') hasFaceAttack = true;
    } else if (mv.type === 'avatar') avatarMove = mv;
  }

  function cardOf(m) {
    if (typeof m.i !== 'number' || m.i < 0 || m.i >= hand.length) return null;
    return hand[m.i] || null;
  }

  /* 尚未攻击的可动单位直击伤害 */
  var faceNow = 0;
  for (i = 0; i < attacks.length; i++) {
    var ua = findUnit(view, attacks[i].uid, true);
    if (ua && !ua.frozen && !ua.attacked) faceNow += impOf(ua);
  }

  /* 1) 铺单位：优先高 IMP；带目标的战吼挑能杀高攻的 */
  var unitMoves = [];
  for (i = 0; i < plays.length; i++) {
    var cu = cardOf(plays[i]);
    if (cu && cu.type === '单位') unitMoves.push(plays[i]);
  }
  if (unitMoves.length) {
    var targeted = [];
    for (i = 0; i < unitMoves.length; i++) {
      if (unitMoves[i].target !== undefined && unitMoves[i].target !== null) targeted.push(unitMoves[i]);
    }
    if (targeted.length) {
      var km = pickKillableTarget(view, targeted, 99);
      if (km) return km;
    }
    var bestUnit = unitMoves[0], bestScore = -1e9;
    for (i = 0; i < unitMoves.length; i++) {
      var c = cardOf(unitMoves[i]);
      var s = c ? (impOf(c) * 3 + atkOf(c) - (c.cost ? c.cost.n : 0)) : 0;
      if (s > bestScore) { bestScore = s; bestUnit = unitMoves[i]; }
    }
    return bestUnit;
  }

  /* 2) 结界（045 战意永燃：全体冲锋+减伤，顺风必下） */
  for (i = 0; i < plays.length; i++) {
    var ce = cardOf(plays[i]);
    if (ce && (ce.type === '结界' || ce.type === '地标')) return plays[i];
  }

  /* 3) 拆墙：守卫挡住直击且点杀打得死、解了伤害够看时才交 */
  var spotMoves = [];
  for (i = 0; i < plays.length; i++) {
    var cs = cardOf(plays[i]);
    if (cs && isSpotDamage(cs)) spotMoves.push(plays[i]);
  }
  if (spotMoves.length && attacks.length > 0 && !hasFaceAttack && faceNow > 0) {
    var d0 = spotDmg(cardOf(spotMoves[0]));
    var kill = pickKillableTarget(view, spotMoves, d0);
    if (kill) {
      var tg = findUnit(view, kill.target, false);
      // 大墙（高耐久高攻）或解完直伤够斩杀才交点杀
      if (tg && ((hpOf(tg) >= 3 && atkOf(tg) >= 3) || (oppLife - faceNow - handBurn(view)) <= 0)) return kill;
    }
  }

  /* 4) 灵体启动：拉格纳 过载1 = 本回合全体 IMP+1。
   *    补正斩杀、或本回合有单位能踢且对手场面不肥时交（引擎每回合重置 used） */
  if (avatarMove && !(me.avatar && me.avatar.used)) {
    var lethalWithAv = (oppLife - (faceNow + handBurn(view) + faceCount(view))) <= 0;
    if (lethalWithAv || (attacks.length > 0 && faceNow > 0 && oppUnits(view).length <= 2)) return avatarMove;
  }

  /* 5) 攻击：直达脸按 IMP 从高到低踢；只能打单位时拿 ATK 换墙 */
  if (attacks.length) {
    if (hasFaceAttack) {
      var bestF = null, bestV = -1;
      for (i = 0; i < attacks.length; i++) {
        if (attacks[i].target !== 'face') continue;
        var uf = findUnit(view, attacks[i].uid, true);
        var v = impOf(uf);
        if (v > bestV) { bestV = v; bestF = attacks[i]; }
      }
      if (bestF) return bestF;
    }
    var bestU = null, bestS = -1e9;
    for (i = 0; i < attacks.length; i++) {
      var u2 = findUnit(view, attacks[i].uid, true);
      if (!u2 || u2.frozen || u2.attacked) continue;
      var tgt = findUnit(view, attacks[i].target, false);
      var s2 = 0;
      if (tgt) {
        if (atkOf(u2) >= hpOf(tgt)) s2 += 10 + atkOf(tgt) * 2; // 换得死，奖励对手攻
        if (atkOf(tgt) >= hpOf(u2)) s2 -= 6;                    // 会白给，惩罚
        s2 -= hpOf(tgt);                                         // 优先拆低血墙
      }
      if (s2 > bestS) { bestS = s2; bestU = attacks[i]; }
    }
    if (bestU) return bestU;
  }

  /* 6) 直伤斩杀（含血红爆发按已攻击单位数估算） */
  for (i = 0; i < plays.length; i++) {
    var c4 = cardOf(plays[i]);
    if (!c4) continue;
    if (isDirectDamage(c4) && directDmg(c4) >= oppLife) return plays[i];
    if (isAttackCounter(c4) && attackedCount(view) >= oppLife) return plays[i];
  }

  /* 7) 残局点杀：对面还有高攻/高血墙且我方有单位时清掉（打得死才交） */
  if (spotMoves.length && oppUnits(view).length && ownUnits(view).length) {
    var d6 = spotDmg(cardOf(spotMoves[0]));
    var kill2 = pickKillableTarget(view, spotMoves, d6);
    if (kill2) {
      var tg2 = findUnit(view, kill2.target, false);
      if (tg2 && (atkOf(tg2) >= 3 || hpOf(tg2) >= 4)) return kill2;
    }
  }

  /* 8) 敌全体 AOE：对面场面 ≥2 且我方没单位可保时清场 */
  for (i = 0; i < plays.length; i++) {
    var c8 = cardOf(plays[i]);
    if (c8 && isAoeDamage(c8) && oppUnits(view).length >= 2 && ownUnits(view).length === 0) return plays[i];
  }

  /* 9) 其余牌兜底（不打会误伤己方的 AOE / 留给下回合的点杀） */
  for (i = 0; i < plays.length; i++) {
    var c7 = cardOf(plays[i]);
    if (!c7) continue;
    if (isAoeDamage(c7)) continue;
    if (isSpotDamage(c7) && oppUnits(view).length) continue; // 点杀留给需要时
    return plays[i];
  }

  return passOf(moves);
}

/* 可动单位数（灵体过载 +1 IMP 按单位数折算进斩杀估算） */
function faceCount(view) {
  var n = 0;
  var mine = ownUnits(view);
  for (var i = 0; i < mine.length; i++) {
    var u = mine[i];
    if (u && !u.frozen && !u.attacked && impOf(u) > 0) n++;
  }
  return n;
}

/* ---------- block ---------- */

function block(view, bmoves) {
  if (!Array.isArray(bmoves) || !bmoves.length) return null;
  var last = bmoves[bmoves.length - 1];
  var blocks = [], noBlock = null;
  var i;
  for (i = 0; i < bmoves.length; i++) {
    var m = bmoves[i];
    if (!m) continue;
    if (m.type === 'block') blocks.push(m);
    else if (m.type === 'noBlock') noBlock = m;
  }
  if (!blocks.length) return noBlock || last;

  var me = (view && view.me) || {};
  var opp = (view && view.opp) || {};
  var obs = oppUnits(view);
  var attacker = null;
  for (i = 0; i < obs.length; i++) if (obs[i] && obs[i].attacking) { attacker = obs[i]; break; }
  if (!attacker) attacker = obs[0] || null;

  var dmg = impOf(attacker); // 直击只结算 IMP
  var life = (typeof me.life === 'number') ? me.life : 20;
  var oppLife = (typeof opp.life === 'number') ? opp.life : 20;

  // 下回合能反杀就不挡，把伤害打回去
  if (oppLife - (faceDamageOf(view) + handBurn(view)) <= 0) return noBlock || last;

  // 非致命且非重创：快攻不挡，保攻击频率
  if (dmg < 4 && dmg < life * 0.5) return noBlock || last;

  // 用「能换死攻击者且自己不死」的挡；否则用 HP 最高的挡
  var best = null, bestHp = -1;
  for (i = 0; i < blocks.length; i++) {
    var u = findUnit(view, blocks[i].uid, true);
    if (!u) continue;
    if (atkOf(u) >= hpOf(attacker) && hpOf(u) > atkOf(attacker)) { best = blocks[i]; break; }
    if (hpOf(u) > bestHp) { bestHp = hpOf(u); best = blocks[i]; }
  }
  return best || noBlock || last;
}

/* ---------- respond（瞬间窗口；引擎仅在我有可支付瞬间时调用） ---------- */

function respond(view, ctx, moves) {
  if (!Array.isArray(moves) || !moves.length) return null;
  var pass = null, resps = [];
  var i;
  for (i = 0; i < moves.length; i++) {
    if (moves[i] && moves[i].type === 'pass') pass = moves[i];
    else if (moves[i] && moves[i].type === 'respond') resps.push(moves[i]);
  }
  if (!pass) pass = moves[moves.length - 1];
  if (!resps.length) return pass;

  var hand = ((view && view.me && view.me.hand) || []);
  function respCard(m) {
    if (typeof m.i !== 'number' || m.i < 0 || m.i >= hand.length) return null;
    return hand[m.i] || null;
  }

  // 烈阳断刃（瞬间·对单位3伤）：防斩杀 / 挡重击 / 反击大法术
  function bladeMove() {
    for (var k = 0; k < resps.length; k++) {
      var c = respCard(resps[k]);
      if (c && c.type === '瞬间' && isSpotDamage(c)) return resps[k];
    }
    return null;
  }

  if (ctx && ctx.kind === 'attack') {
    var d = ctx.attacker ? impOf(ctx.attacker) : 0;
    var life = (view && view.me && typeof view.me.life === 'number') ? view.me.life : 20;
    if (d >= 3 || d >= life - 1 || life <= 9) {
      var bm = bladeMove();
      if (bm) return bm;
    }
  } else if (ctx && ctx.kind === 'play') {
    var card = ctx.card || {};
    var cost = (card.cost && typeof card.cost.n === 'number') ? card.cost.n : 0;
    var isThreat = card.type === '结界' || (card.type === '法术' && cost >= 3);
    if (isThreat) {
      var pm = bladeMove();
      if (pm) return pm; // 反击类瞬间：对手那张牌整体无效
    }
  }

  return pass;
}
