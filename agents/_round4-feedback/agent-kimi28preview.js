// KIMI 2.8preview · 灵枢战纪第一弹构筑脚本
// 主色：绿（法力消耗制，2 + 地标数）
// 策略：地脉践踏 —— 地标加速中速，践踏单位直击取胜
// 本轮调整：修复AOE法术因无target永不主动施放的问题；补终结reach(巨兽冲锋)与瞬间互动(压制射击)；block不再白送践踏单位
// 契约：声明 meta / build / choose / block / respond；无 import/export/require；不访问外部状态。

var meta = {
  name: 'KIMI 2.8preview · 地脉践踏',
  desc: '执行模型 kimi-k2.8-preview；颜色 绿；策略 地脉践踏；地标白拿永久法力加速，践踏巨兽提前落地直击，冲锋法术收尾',
  id: 'model:kimi28preview',
  color: '绿'
};

// 目标卡组（12 名目共 30 张）
var WISH_LIST = [
  { id: 'LQ01-056', n: 3 }, // 幼叶之池    地标  法力1  产1法力
  { id: 'LQ01-061', n: 3 }, // 母神共鸣地  地标  法力2  产2法力
  { id: 'LQ01-057', n: 1 }, // 摇篮藤根    单位  法力2  1/2/3 守卫
  { id: 'LQ01-058', n: 3 }, // 荆棘绞杀    法术  法力2  对1单位3伤
  { id: 'LQ01-059', n: 3 }, // 猎杀弱肉    单位  法力3  2/1/2 战吼破ATK≤2
  { id: 'LQ01-060', n: 3 }, // 落叶风暴    法术  法力3  敌全体2伤
  { id: 'LQ01-065', n: 3 }, // 荒原猛犸    单位  法力4  4/3/4 践踏
  { id: 'LQ01-066', n: 3 }, // 裂地巨犀    单位  法力5  5/4/5 践踏
  { id: 'LQ01-072', n: 2 }, // 藤海怒涛    法术  法力4  敌全体3伤+按地标回血
  { id: 'LQ01-063', n: 2 }, // 林冠漫步者  单位  法力3  每地标+1/+1(上限+3)
  { id: 'LQ01-068', n: 2 }, // 巨兽冲锋    法术  法力2  目标单位+2/+0得践踏冲锋(本回合)
  { id: 'LQ01-296', n: 2 }  // 逆流        瞬间  通用2  反击——无效化1张法术(respond用)
];

var AOE_IDS = { 'LQ01-060': true, 'LQ01-072': true };

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

function ownUnits(view) {
  var me = (view && view.me) || {};
  return me.board || [];
}

function hasKw(u, name) {
  return !!(u && u.kw && u.kw.indexOf(name) >= 0);
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

function findUnitByUid(view, uid, own) {
  var units = own ? ownUnits(view) : enemyUnits(view);
  for (var i = 0; i < units.length; i++) if (units[i] && units[i].uid === uid) return units[i];
  return null;
}

function pickTargetedPlay(plays, view, cardId, pred, ownTarget) {
  // 有目标卡：在目标集合里按 pred 挑最优；AOE卡：无需target，直接返回该卡的play动作
  var bestMove = null;
  var bestScore = -1;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    var c = cardOf(view, m);
    if (!c || c.id !== cardId) continue;
    if (AOE_IDS[cardId]) return m;
    var t = findUnitByUid(view, m.target, !!ownTarget);
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
    else if (m.type === 'pass') { /* 兜底 */ }
    else others.push(m);
  }

  // 1) 灵体能力：森林先知·盖亚，展示牌库顶3张置1地标入战场 —— 早中期优先
  if (avatars.length && turn <= 8) return avatars[0];

  // 2) 地标：地标数 < 3 时最优先（白拿永久加速）
  if (lands.length < 3) {
    var land = pickPlayByType(plays, view, '地标');
    if (land) return land;
  }

  var oppBoard = enemyUnits(view);
  var oppLife = (view && view.opp && typeof view.opp.life === 'number') ? view.opp.life : 20;

  // 3) 关键解场（AOE无需target，可被正确选中）
  var bigThreat = biggestThreat(view, function (u) { return (u.atk || 0) >= 4; });
  if (oppBoard.length >= 2 || bigThreat) {
    var wave = pickTargetedPlay(plays, view, 'LQ01-072', null, false);
    if (wave) return wave;
  }
  if (oppBoard.length >= 2 || biggestThreat(view, function (u) { return (u.hp || 0) <= 2; })) {
    var storm = pickTargetedPlay(plays, view, 'LQ01-060', null, false);
    if (storm) return storm;
  }
  var killable = pickTargetedPlay(plays, view, 'LQ01-058', function (u) { return (u.hp || 0) <= 3; }, false);
  if (killable) return killable;
  if (bigThreat) {
    var snipe = pickTargetedPlay(plays, view, 'LQ01-058', function (u) { return (u.atk || 0) >= 4; }, false);
    if (snipe) return snipe;
  }
  var prey = pickTargetedPlay(plays, view, 'LQ01-059', function (u) {
    return (u.atk || 0) === 2;
  }, false);
  if (prey) return prey;

  // 4) 铺场：按费从高到低打单位，吃满法力
  var unit = pickPlayByType(plays, view, '单位');
  if (unit) return unit;

  // 5) 终结：巨兽冲锋给场上最大单位+2攻践踏冲锋，用于抢血收尾
  var boardMax = 0;
  var mine = ownUnits(view);
  for (var b = 0; b < mine.length; b++) boardMax = Math.max(boardMax, mine[b] ? (mine[b].atk || 0) : 0);
  if (oppLife <= boardMax + 5) {
    var charge = pickTargetedPlay(plays, view, 'LQ01-068', function (u) {
      return (u.atk || 0) === boardMax;
    }, true);
    if (charge) return charge;
  }

  // 6) 其余可打之牌（未知类型兜底：低费优先，避免卡手）
  if (plays.length) {
    var low = plays[0];
    var lowCost = costOf(cardOf(view, low));
    for (var p = 1; p < plays.length; p++) {
      var cc = costOf(cardOf(view, plays[p]));
      if (cc < lowCost) { lowCost = cc; low = plays[p]; }
    }
    return low;
  }

  // 7) 升灵：素材够就降临（外枢回归机制使其几乎无代价）
  if (ascends.length) return ascends[0];

  // 8) 攻击：优先打脸（践踏溢出直接转伤害）；只能打单位时挑耐久最低的目标
  if (attacks.length) {
    var face = null;
    var unitAtk = null;
    var unitHp = 1e9;
    for (var a = 0; a < attacks.length; a++) {
      var am = attacks[a];
      if (am.target === 'face') { if (!face) face = am; }
      else {
        var tu = findUnitByUid(view, am.target, false);
        var thp = tu ? (tu.hp || 0) : 0;
        if (thp < unitHp) { unitHp = thp; unitAtk = am; }
      }
    }
    if (face) return face;
    if (unitAtk) return unitAtk;
    return attacks[0];
  }

  // 9) 未知动作类型兜底
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
  // 生命充裕时不挡，保住攻势单位
  if (life > 14) return noBlock || last;
  // 优先选非践踏、耐久最高的阻挡者；践踏单位仅在危急时牺牲
  var best = null;
  var bestHp = -1;
  var desperate = life <= 8;
  for (var b2 = 0; b2 < blocks.length; b2++) {
    var u = findUnitByUid(view, blocks[b2].uid, true);
    if (!u) continue;
    if (!desperate && hasKw(u, '践踏')) continue;
    var hp = u.hp || 0;
    if (hp > bestHp) { bestHp = hp; best = blocks[b2]; }
  }
  if (!best && desperate) {
    for (var b3 = 0; b3 < blocks.length; b3++) {
      var u2 = findUnitByUid(view, blocks[b3].uid, true);
      var hp2 = u2 ? (u2.hp || 0) : 0;
      if (hp2 > bestHp) { bestHp = hp2; best = blocks[b3]; }
    }
  }
  return best || noBlock || last;
}

function respond(view, ctx, moves) {
  if (!moves || !moves.length) return null;
  var last = moves[moves.length - 1];
  var responds = [];
  for (var i = 0; i < moves.length; i++) {
    if (moves[i] && moves[i].type === 'respond') responds.push(moves[i]);
  }
  if (!responds.length) return last;
  ctx = ctx || {};
  if (ctx.kind === 'play' && ctx.card) {
    // 逆流反击：对手宣告大法术（高费或全体效果）时无效化它
    var card = ctx.card;
    var cn = card.cost ? (card.cost.n || 0) : 0;
    var txt = card.text || '';
    if (cn >= 4 || txt.indexOf('所有') >= 0 || txt.indexOf('全体') >= 0) return responds[0];
    return last;
  }
  // 攻击窗口没有可用的瞬间杀伤，不响应（逆流仅反击法术）
  return last;
}
