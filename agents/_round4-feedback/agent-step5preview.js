// ============================================================================
// 灵枢战纪 · AI 脚本（第 4 轮）
// 显示名：step5preview ｜ 执行模型：step-5-preview ｜ 主色：蓝
// 策略名：阈控霜流（手牌门槛控制）
// ----------------------------------------------------------------------------
// 构筑：10 名目 x3 = 30 张（单色蓝，无跨色、无灰）
//   筹算学徒 x3 / 雾行者 x3 / 静默哨兵 x3 / 时痕采集者 x3 / 级数法师 x3 /
//   冰晶结界师 x3 / 无穷级数 x3 / 霜结咒阵 x3 / 时间尽头 x3 / 永冻领域 x3
// 资源口径（01 §3）：蓝色资源 = 手牌门槛 min(6,当前手牌数)，不消耗；
//   每回合最多打出 2 张；回合开始抽 2；手牌无上限、不参与弃牌。
// 决策优先级（choose）：灵体启动 → 出牌（阶段化评分）→ 攻击（打脸/换判）
//   → pass；block 按 IMP 价值+血量语境评估；respond 保留反制逻辑（本套无反击卡时自然空转）。
// ============================================================================

var meta = {
  name: 'step5preview · 阈控霜流',
  desc: '执行模型 step-5-preview；颜色 蓝；策略 阈控霜流；手牌门槛控制：每轮净抽 2 且不弃牌，用手牌厚度滚资源，以冻结/回手/永冻领域结界解场，block 按 IMP 价值换血，T3 起持续打脸，拖入后期灼烧与疲劳差。',
  id: 'model:step5preview',
  color: '蓝'
};

// ---------------------------------------------------------------------------
// build(pool)：pool 已按主色（蓝）+ 灰过滤。硬编码 10 名目 x3；缺名目时用
// pool 内剩余卡按「单位优先、低费优先」补足到 30 张（同名 ≤3）。
// ---------------------------------------------------------------------------
function build(pool) {
  var arr = Array.isArray(pool) ? pool : [];
  var plan = [
    ['LQ01-073', 3], // 筹算学徒
    ['LQ01-074', 3], // 雾行者
    ['LQ01-079', 3], // 静默哨兵
    ['LQ01-087', 3], // 时痕采集者
    ['LQ01-083', 3], // 级数法师
    ['LQ01-080', 3], // 冰晶结界师
    ['LQ01-085', 3], // 无穷级数
    ['LQ01-076', 3], // 霜结咒阵
    ['LQ01-078', 3], // 时间尽头
    ['LQ01-081', 3]  // 永冻领域（结界：对手单位攻击时横置且该次攻击 −1）
  ];
  var out = [];
  var i, j;
  for (i = 0; i < plan.length; i++) {
    var id = plan[i][0], n = plan[i][1];
    for (j = 0; j < arr.length; j++) {
      if (arr[j] && arr[j].id === id) { out.push({ id: id, n: n }); break; }
    }
  }
  var total = 0;
  for (i = 0; i < out.length; i++) total += out[i].n;
  if (total < 30) {
    var taken = {};
    for (i = 0; i < out.length; i++) taken[out[i].id] = true;
    var rest = [];
    for (j = 0; j < arr.length; j++) {
      var c = arr[j];
      if (!c || taken[c.id]) continue;
      var cn = c.cost && typeof c.cost.n === 'number' ? c.cost.n : 9;
      rest.push({ c: c, k: (c.type === '单位' ? 0 : 1) * 100 + cn });
    }
    rest.sort(function (a, b) { return a.k - b.k; });
    var idx = 0;
    while (total < 30 && idx < rest.length) {
      var pick = rest[idx++];
      var add = Math.min(3, 30 - total);
      if (add <= 0) break;
      out.push({ id: pick.c.id, n: add });
      total += add;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 工具函数（纯只读，不修改 view / moves）
// ---------------------------------------------------------------------------
function num(x, d) { return typeof x === 'number' && isFinite(x) ? x : (d || 0); }
function findPass(list) {
  var arr = Array.isArray(list) ? list : [];
  for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].type === 'pass') return arr[i];
  return arr.length ? arr[arr.length - 1] : null;
}
function boardOf(x) { return (x && Array.isArray(x.board)) ? x.board : []; }
function uidIn(uid, board) {
  for (var i = 0; i < board.length; i++) if (board[i] && board[i].uid === uid) return board[i];
  return null;
}
function sumImp(board) {
  var s = 0;
  for (var i = 0; i < board.length; i++) s += num(board[i] && board[i].imp, 0);
  return s;
}
function hasKw(unit, kw) {
  return !!(unit && Array.isArray(unit.kw) && unit.kw.indexOf(kw) >= 0);
}
function costOf(c) { return (c && c.cost && typeof c.cost.n === 'number') ? c.cost.n : 0; }
function textOf(c) { return (c && typeof c.text === 'string') ? c.text : ''; }

// ---------------------------------------------------------------------------
// choose(view, moves)：main 阶段每次要一个动作，返回 moves 内对象引用。
// ---------------------------------------------------------------------------
function choose(view, moves) {
  try {
    if (!view || !Array.isArray(moves) || !moves.length) return null;
    var me = view.me || {};
    var opp = view.opp || {};
    var myB = boardOf(me);
    var opB = boardOf(opp);
    var turn = num(view.turn, 1);

    // 1) 灵体启动：蓝色灵体（阿基米德/克罗诺向）能力均为抽牌/预示类，
    //    无负面；引擎已过滤每回合 1 次。出现在 moves 里即可用。
    for (var i = 0; i < moves.length; i++) {
      if (moves[i] && moves[i].type === 'avatar') return moves[i];
    }

    // 2) 出牌：对本回合所有可打的手牌评分，取最高分（引擎负责 2 张上限）。
    var bestPlay = null, bestScore = 9.99; // 低于 10 分的牌不主动打（留给 respond 等窗口）
    for (var p = 0; p < moves.length; p++) {
      var mv = moves[p];
      if (!mv || mv.type !== 'play' || typeof mv.i !== 'number') continue;
      var card = (me.hand && me.hand[mv.i]) || null;
      if (!card) continue;
      var s = playScore(view, card, mv, turn, myB, opB);
      if (s > bestScore) { bestScore = s; bestPlay = mv; }
    }
    if (bestPlay) return bestPlay;

    // 3) 攻击：能打脸就打脸（T3 起建立持续压力，T1 单位召唤失调本就没有攻击动作）；
    //    被守卫时只做「能击杀且己方存活」或后期「能击杀」的交换。
    var attacks = [];
    for (var a = 0; a < moves.length; a++) {
      var m2 = moves[a];
      if (m2 && m2.type === 'attack' && typeof m2.target === 'string') attacks.push(m2);
    }
    if (attacks.length) {
      var faces = [];
      for (var f = 0; f < attacks.length; f++) if (attacks[f].target === 'face') faces.push(attacks[f]);
      if (faces.length) {
        var readyImp = 0;
        for (var b = 0; b < myB.length; b++) if (!myB[b].attacked) readyImp += num(myB[b].imp, 0);
        // 斩杀线：可攻击 IMP ≥ 对手生命 → 直接打脸；否则持续压血。
        return faces[0];
      }
      var bestAtk = null, bestV = 0;
      for (var t = 0; t < attacks.length; t++) {
        var at = uidIn(attacks[t].uid, myB);
        var df = uidIn(attacks[t].target, opB);
        if (!at || !df) continue;
        var kills = num(at.atk, 0) >= num(df.hp, 0);
        var survives = hasKw(at, '圣盾') || (num(at.hp, 0) - num(df.atk, 0)) > 0;
        var v = (kills ? 3 : 0) + (survives ? 3 : 0) + num(df.imp, 0) * 0.5 + (turn >= 6 ? 1.5 : 0);
        if (v > bestV) { bestV = v; bestAtk = attacks[t]; }
      }
      if (bestAtk && bestV >= 4.5) return bestAtk;
    }

    // 4) 兜底：pass（必须是数组内引用）。
    return findPass(moves);
  } catch (e) {
    return findPass(moves);
  }
}

// ---------------------------------------------------------------------------
// 出牌评分：已知卡名按卡面价值分级；未知卡按类型/文本兜底。
// ---------------------------------------------------------------------------
function playScore(view, card, mv, turn, myB, opB) {
  var name = (typeof card.name === 'string') ? card.name : '';
  var s = 55;
  if (name === '时痕采集者') { s = 100; }            // 手牌4，2/2/4，战吼预示3
  else if (name === '级数法师') { s = 96; }          // 手牌5，3/2/4，手牌≥6 法术−1
  else if (name === '无穷级数') { s = 92; }          // 手牌5，抽3
  else if (name === '黄金分割') { s = 90; }          // 手牌6，抽2+灵体回3
  else if (name === '静默哨兵') { s = myB.length < 3 ? 90 : 62; } // 手牌4，2/1/3 守卫
  else if (name === '冰晶结界师') { s = 86 + (opB.length ? 12 : 0); } // 手牌5，2/1/4 战吼冻结
  else if (name === '霜结咒阵') {                     // 手牌4，冻结1个单位
    // 威胁判断：未冻结单位中 imp≥3 的单卡，或 imp≥2 的可攻击单位 IMP 总和 ≥5
    var threat = 0, hasBig = false, q;
    for (q = 0; q < opB.length; q++) {
      var u2 = opB[q];
      if (!u2 || u2.frozen) continue;
      var imp2 = num(u2.imp, 0);
      if (imp2 >= 3) hasBig = true;
      if (imp2 >= 2) threat += imp2;
    }
    s = (hasBig || threat >= 5) ? 88 : 72;
  }
  else if (name === '永冻领域') { s = 95; }          // 手牌5，结界：对手单位攻击时横置且该次攻击−1
  else if (name === '筹算学徒') { s = 80; }          // 手牌3，1/1/1，战吼抽1
  else if (name === '雾行者') { s = 76; }            // 手牌4，2/2/2，不能被守卫指定
  else if (name === '时间尽头') {                     // 手牌6，所有单位回手
    var wipe = (opB.length >= 3 && myB.length <= 1) || (sumImp(opB) >= 9 && sumImp(myB) <= 4);
    s = wipe ? 94 : 6;                               // 非清场时机不打（自己单位也回手）
  }
  else if (name === '抑能重击') { s = 4; }           // 瞬间反击：留给 respond 窗口，不主动打
  else {
    // 未知卡兜底：单位看身材，法术/结界看效果文本
    if (card.type === '单位') s = 58 + num(card.atk, 0) * 2 + num(card.hp, 0);
    else {
      var tx = textOf(card);
      if (/抽/.test(tx)) s = 80;
      else if (/所有|全部|全体/.test(tx)) s = 74;
      else if (/冻结|伤害|破坏/.test(tx)) s = 68;
      else s = 45;
    }
  }
  // 目标归属修正：需要选目标的动作若指向己方单位、且效果是负面的，避免误选。
  if (mv && typeof mv.target === 'string' && mv.target) {
    if (uidIn(mv.target, myB)) {
      var tx2 = textOf(card);
      if (/冻结|伤害|破坏|横置|放逐/.test(tx2) && !/获得|\+/.test(tx2)) s -= 130;
    }
  }
  // 早期（T1~T2）压低价值解牌评分：优先把资源换成场面引擎。
  if (turn <= 2 && (name === '霜结咒阵' || name === '时间尽头') && s > 10) s -= 18;
  return s;
}

// ---------------------------------------------------------------------------
// block(view, bmoves)：阻挡窗口。只做「能击杀且己方存活」或「低血量保命」的挡。
// ---------------------------------------------------------------------------
function block(view, bmoves) {
  try {
    var arr = Array.isArray(bmoves) ? bmoves : [];
    var blocks = [];
    var noBlock = null;
    var i;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      if (arr[i].type === 'block' && typeof arr[i].uid === 'string') blocks.push(arr[i]);
      else if (arr[i].type === 'noBlock') noBlock = arr[i];
    }
    if (!blocks.length) return noBlock || (arr.length ? arr[arr.length - 1] : null);
    if (!view) return noBlock || blocks[0];
    var me = view.me || {}, opp = view.opp || {};
    var myB = boardOf(me), opB = boardOf(opp);
    var life = num(me.life, 20);
    var atk = null;
    for (i = 0; i < opB.length; i++) if (opB[i] && opB[i].attacked) { atk = opB[i]; break; }
    if (!atk) {
      // 无法从 view 识别攻击者：仅低血量保命，挡耐久最高的己方单位。
      if (life <= 8) {
        var bestHp = -1, bestU = null;
        for (i = 0; i < blocks.length; i++) {
          var u = uidIn(blocks[i].uid, myB);
          if (u && num(u.hp, 0) > bestHp) { bestHp = num(u.hp, 0); bestU = blocks[i]; }
        }
        return bestU || noBlock;
      }
      return noBlock || blocks[0];
    }
    var best = null, bestV = 0;
    for (i = 0; i < blocks.length; i++) {
      var df = uidIn(blocks[i].uid, myB);
      if (!df) continue;
      var kills = num(df.atk, 0) >= num(atk.hp, 0);
      var survives = hasKw(df, '圣盾') || (num(df.hp, 0) - num(atk.atk, 0)) > 0;
      var handN = Array.isArray(me.hand) ? me.hand.length : 0;
      // IMP 价值评估：击杀3+存活2+攻击者IMP×0.9；血线≤12保命语境+2；
      // 手牌厚(≥5)更敢拿单位换血+1；打不死的低IMP(≤2)攻击不值得浪费单位，-3。
      var v = (kills ? 3 : 0) + (survives ? 2 : 0) + num(atk.imp, 0) * 0.9
        + (life <= 12 ? 2 : 0) + (handN >= 5 ? 1 : 0);
      if (num(atk.imp, 0) <= 2 && !kills) v -= 3;
      if (v > bestV) { bestV = v; best = blocks[i]; }
    }
    if (best && bestV >= 3.2) return best;
    return noBlock || (blocks.length ? blocks[0] : null);
  } catch (e) {
    var a2 = Array.isArray(bmoves) ? bmoves : [];
    for (var k = 0; k < a2.length; k++) if (a2[k] && a2[k].type === 'noBlock') return a2[k];
    return a2.length ? a2[a2.length - 1] : null;
  }
}

// ---------------------------------------------------------------------------
// respond(view, ctx, moves)：响应链（03 §3.5）。只在对手宣告高价值法术/结界
// （费用 ≥5 或文本含「所有/全部/全体」）时，用「反击—无效化」类瞬间卡反制。
// ---------------------------------------------------------------------------
function respond(view, ctx, moves) {
  try {
    var arr = Array.isArray(moves) ? moves : [];
    var pass = null;
    var i;
    for (i = 0; i < arr.length; i++) if (arr[i] && arr[i].type === 'pass') { pass = arr[i]; break; }
    if (!pass && arr.length) pass = arr[arr.length - 1];
    if (!ctx || ctx.kind !== 'play' || !ctx.card) return pass;
    var c = ctx.card;
    var isSpell = (c.type === '法术' || c.type === '结界');
    if (!isSpell) return pass;
    var tx = textOf(c);
    var big = /所有|全部|全体/.test(tx) || costOf(c) >= 5;
    if (!big) return pass;
    var hand = (view && view.me && Array.isArray(view.me.hand)) ? view.me.hand : [];
    for (i = 0; i < arr.length; i++) {
      var mv = arr[i];
      if (!mv || mv.type !== 'respond' || typeof mv.i !== 'number') continue;
      var h = hand[mv.i];
      if (!h) continue;
      var ht = textOf(h);
      if (/反击/.test(ht) && /无效化/.test(ht)) return mv;
    }
    return pass;
  } catch (e) {
    var a2 = Array.isArray(moves) ? moves : [];
    for (var k = 0; k < a2.length; k++) if (a2[k] && a2[k].type === 'pass') return a2[k];
    return a2.length ? a2[a2.length - 1] : null;
  }
}
