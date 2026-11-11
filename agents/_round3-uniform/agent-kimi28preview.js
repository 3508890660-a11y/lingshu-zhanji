// KIMI 2.8preview · 灵枢战纪第一弹构筑脚本
// 主色：绿（法力消耗制，2 + 地标数）
// 策略：地脉践踏 —— 地标加速中速，践踏单位直击取胜
// 契约：声明 meta / build / choose / block；无 import/export/require；不访问外部状态。

var meta = {
  name: 'KIMI 2.8preview · 地脉践踏',
  desc: '执行模型 kimi-k2.8-preview；颜色 绿；策略 地脉践踏；地标白拿永久法力加速，践踏巨兽提前落地直击',
  id: 'model:kimi28preview',
  color: '绿'
};

// 目标卡组（10 名目 × 3 = 30 张）
var WISH_LIST = [
  'LQ01-056', // 幼叶之池   地标  法力1  产1法力
  'LQ01-061', // 母神共鸣地 地标  法力2  产2法力
  'LQ01-057', // 摇篮藤根   单位  法力2  1/2/3 守卫
  'LQ01-055', // 盖亚幼株   单位  法力1  1/1/1 成长
  'LQ01-058', // 荆棘绞杀   法术  法力2  对1单位3伤
  'LQ01-059', // 猎杀弱肉   单位  法力3  2/1/2 战吼破ATK≤2
  'LQ01-060', // 落叶风暴   法术  法力3  敌全体2伤
  'LQ01-065', // 荒原猛犸   单位  法力4  4/3/4 践踏
  'LQ01-066', // 裂地巨犀   单位  法力5  5/4/5 践踏
  'LQ01-072'  // 藤海怒涛   法术  法力4  敌全体3伤，按地标回血
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
    if (inPool[WISH_LIST[i]]) {
      deck.push({ id: WISH_LIST[i], n: 3 });
      total += 3;
    }
  }
  // 兜底：卡池缺卡时用池内卡补足 30 张（优先低费单位/地标，同名≤3）
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
      if (!c || !c.id || c.id.charAt(0) === 'S' || c.id.charAt(0) === 'A' || c.id.charAt(0) === 'T') continue;
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

// ---------- choose 辅助 ----------

function cardOf(view, m) {
  var hand = (view && view.me && view.me.hand) || [];
  if (m && typeof m.i === 'number' && hand[m.i]) return hand[m.i];
  return null;
}

function costOf(c) {
  return c && c.cost ? (c.cost.n || 0) : 9;
}

function enemyUnits(view) {
  var opp = (view && view.opp) || {};
  return opp.board || [];
}

function biggestThreat(view, pred) {
  var units = enemyUnits(view);
  var best = null;
  for (var i = 0; i < units.length; i++) {
    var u = units[i];
    if (!u) continue;
    if (pred && !pred(u)) continue;
    if (!best) { best = u; continue; }
    var sa = (u.atk || 0) + (u.imp || 0) + (u.hp || 0);
    var sb = (best.atk || 0) + (best.imp || 0) + (best.hp || 0);
    if (sa > sb) best = u;
  }
  return best;
}

function pickTargetedPlay(plays, view, cardIds, pred) {
  // 在指定卡的 play 动作里按 target 敌方单位的好坏挑一个
  var bestMove = null;
  var bestScore = -1;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    var c = cardOf(view, m);
    if (!c || cardIds.indexOf(c.id) < 0) continue;
    var t = null;
    var units = enemyUnits(view);
    for (var j = 0; j < units.length; j++) if (units[j] && units[j].uid === m.target) t = units[j];
    if (!t) continue;
    if (pred && !pred(t)) continue;
    var score = (t.atk || 0) * 2 + (t.hp || 0);
    if (score > bestScore) { bestScore = score; bestMove = m; }
  }
  return bestMove;
}

function pickPlayByType(plays, view, typeName) {
  var best = null;
  var bestCost = -1;
  for (var i = 0; i < plays.length; i++) {
    var c = cardOf(view, plays[i]);
    if (c && c.type === typeName) {
      var n = costOf(c);
      if (n > bestCost) { bestCost = n; best = plays[i]; }
    }
  }
  return best;
}

function choose(view, moves) {
  if (!moves || !moves.length) return { type: 'pass' };
  var pass = moves[moves.length - 1];
  var me = (view && view.me) || {};
  var turn = view && typeof view.turn === 'number' ? view.turn : 1;
  var lands = me.lands || [];

  var plays = [];
  var attacks = [];
  var avatars = [];
  var ascends = [];
  var others = [];
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i];
    if (!m || !m.type) continue;
    if (m.type === 'play') plays.push(m);
    else if (m.type === 'attack') attacks.push(m);
    else if (m.type === 'avatar') avatars.push(m);
    else if (m.type === 'ascend') ascends.push(m);
    else if (m.type === 'pass') { /* 忽略，最后兜底 */ }
    else others.push(m);
  }

  // 1) 灵体能力：森林先知·盖亚，展示牌库顶3张置1地标入战场 —— 早期到中期优先用
  if (avatars.length && turn <= 8) return avatars[0];

  // 2) 地标：地标数 < 3 时最优先（白拿永久加速）
  if (lands.length < 3) {
    var land = pickPlayByType(plays, view, '地标');
    if (land) return land;
  }

  // 3) 关键解场
  // 3a) 藤海怒涛：敌场面 ≥2 或有高威胁大单位（且敌方有单位 hp≤3 的多个目标时尤佳）
  var oppBoard = enemyUnits(view);
  var bigThreat = biggestThreat(view, function (u) { return (u.atk || 0) >= 4; });
  if (oppBoard.length >= 2 || bigThreat) {
    var wave = pickTargetedPlay(plays, view, ['LQ01-072'], function () { return true; });
    if (wave) return wave;
  }
  // 3b) 落叶风暴：敌 ≥2 个单位，或 1 个单位 hp≤2
  if (oppBoard.length >= 2 || biggestThreat(view, function (u) { return (u.hp || 0) <= 2; })) {
    var storm = pickTargetedPlay(plays, view, ['LQ01-060'], function () { return true; });
    if (storm) return storm;
  }
  // 3c) 荆棘绞杀：点杀可死的最大威胁（hp≤3 中 atk 最高），否则点压 atk≥4 大单位
  var killable = pickTargetedPlay(plays, view, ['LQ01-058'], function (u) { return (u.hp || 0) <= 3; });
  if (killable) return killable;
  if (bigThreat) {
    var snipe = pickTargetedPlay(plays, view, ['LQ01-058'], function (u) { return (u.atk || 0) >= 4; });
    if (snipe) return snipe;
  }
  // 3d) 猎杀弱肉战吼：对手有 atk≥2 且 atk≤2 的麻烦单位（守卫/高imp）时落位
  var prey = pickTargetedPlay(plays, view, ['LQ01-059'], function (u) {
    var a = u.atk || 0;
    return a >= 2 && a <= 2;
  });
  if (prey) return prey;

  // 4) 铺场：按费从高到低打单位（吃满法力）
  var unit = pickPlayByType(plays, view, '单位');
  if (unit) return unit;

  // 5) 其余可打之牌（未知类型卡兜底：低费优先，避免卡手）
  if (plays.length) {
    var low = plays[0];
    var lowCost = costOf(cardOf(view, low));
    for (var p = 1; p < plays.length; p++) {
      var cc = costOf(cardOf(view, plays[p]));
      if (cc < lowCost) { lowCost = cc; low = plays[p]; }
    }
    return low;
  }

  // 6) 升灵：素材够就降临（外枢大身材是免费压力）
  if (ascends.length) return ascends[0];

  // 7) 攻击：优先打脸（践踏直接转伤害）；只能打单位时挑耐久最低的目标
  if (attacks.length) {
    var face = null;
    var unitAtk = null;
    var unitHp = 1e9;
    for (var a = 0; a < attacks.length; a++) {
      var am = attacks[a];
      if (am.target === 'face') { if (!face) face = am; }
      else {
        var tu = null;
        var obs = enemyUnits(view);
        for (var k = 0; k < obs.length; k++) if (obs[k] && obs[k].uid === am.target) tu = obs[k];
        var thp = tu ? (tu.hp || 0) : 0;
        if (thp < unitHp) { unitHp = thp; unitAtk = am; }
      }
    }
    if (face) return face;
    if (unitAtk) return unitAtk;
    return attacks[0];
  }

  // 8) 其他动作类型（未知类型兜底，只取一次避免死循环）
  if (others.length) return others[0];

  return pass;
}

function block(view, bmoves) {
  if (!bmoves || !bmoves.length) return null;
  var last = bmoves[bmoves.length - 1];
  var blocks = [];
  var noBlock = null;
  for (var i = 0; i < bmoves.length; i++) {
    var m = bmoves[i];
    if (!m) continue;
    if (m.type === 'block') blocks.push(m);
    else if (m.type === 'noBlock') noBlock = m;
  }
  if (!blocks.length) return noBlock || last;
  var me = (view && view.me) || {};
  var life = typeof me.life === 'number' ? me.life : 20;
  // 生命充裕时不交阻挡，保住践踏攻势单位
  if (life > 12) return noBlock || last;
  // 需要挡时选耐久最高的阻挡者，尽量活下来
  var best = null;
  var bestHp = -1;
  var board = me.board || [];
  for (var b = 0; b < blocks.length; b++) {
    var u = null;
    for (var j = 0; j < board.length; j++) if (board[j] && board[j].uid === blocks[b].uid) u = board[j];
    var hp = u ? (u.hp || 0) : 0;
    if (hp > bestHp) { bestHp = hp; best = blocks[b]; }
  }
  return best || noBlock || last;
}
