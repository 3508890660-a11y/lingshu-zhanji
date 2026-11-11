/* =========================================================================
 * 灵枢战纪 · AI 脚本
 * 参与者：MiniMax M3.1flash
 * 模型 ID：minimax-m3.1-flash
 * 主色：黑（资源：牺牲值 = 2 + ⌊回合/2⌋，消耗制）
 * 策略：骨债引擎（以弃换场）
 *
 * 口径来源（仅使用本轮授权材料）：
 *   - agents/brief/01_基本规则.md：黑的资源与抽牌口径、战斗结算、灵体、外枢
 *   - agents/brief/02_卡表.md §3.2（黑 18 张）、§3.15（灰色泛用包）、§3.12/§3.14
 *   - agents/brief/03_脚本接口.md：build / choose / block 契约
 *   - js/engine/cards.gen.js、js/data/*.js：仅用于核对卡面字段与引擎结算口径
 *
 * 引擎结算口径（依据 js/engine/cards.gen.js 的 effects 字段）：
 *   - 自笞者 LQ01-027：res+1（净零成本换一张 1/1/2）
 *   - 石心祭品 LQ01-034：draw 1（1 费换 1 张牌 + 1 个 IMP）
 *   - 以魂为媒 LQ01-035：res+2 且 draw 1（净零成本过牌）
 *   - 碎晶冲击 LQ01-290：dmg 3 target enemyUnit；凝滞 LQ01-295：freeze
 *   - 石肤守卫 LQ01-292：1/2/3 守卫；褪色符文 LQ01-286：draw 1
 *   - 亡绝祷歌 LQ01-024：aoe 2 side=all（同时打己方，故只在对面铺开时开）
 *   - 拾烬者 LQ01-029：revive sr2（弃牌堆里 SR≤2 的单位）
 *   - 骨窖绞杀 LQ01-022：dmg 3（卡面「破坏则得 2 牺牲值」未实装，脚本不依赖）
 *   - 魂坯重锤 LQ01-036：destroy enemyUnit；厚痂工程 LQ01-028：heal 2
 *   - 永夜墓碑 LQ01-032：draw 1 + 单位 +1/+1
 * ========================================================================= */

var meta = {
  name: 'MiniMax M3.1flash · 骨债引擎',
  desc: '执行模型 minimax-m3.1-flash；颜色 黑；策略 骨债引擎（以弃换场）；用弃牌堆循环 2 点 IMP 的场面，靠亡命者的伤害与复活把对手 20 张生命卡磨穿。',
  id: 'model:minimaxm31flash',
  color: '黑'
};

/* -------------------------------------------------------------------------
 * 卡组清单：30 张；主色「黑」＋灰色泛用包；同名 ≤3。
 * 费用一律记作「牺牲N」；灰色「通用N」按 01 §4 由主色资源（牺牲值）支付。
 * 黑牌池最贵的牌只有牺牲4，故 5–6 / 7+ 两档天然为 0。
 *
 * 费用档：1 费 6 张｜2 费 12 张｜3 费 6 张｜4 费 6 张
 * 名目 15 个（黑 12 + 灰 3），合计 30 张
 * ------------------------------------------------------------------------- */
var DECK_PLAN = [
  /* --- 1 费：低费身体与过牌（黑牌池的 1 费只有自笞者与石心祭品） --- */
  ['LQ01-027', 3], /* 自笞者     牺牲1 1/1/2  引擎：打出即 +1 牺牲值 → 净零成本换 1 个 IMP */
  ['LQ01-034', 3], /* 石心祭品   牺牲1 1/1/2  引擎：打出即抽 1 */
  /* --- 2 费：主力 IMP、回收与处理 --- */
  ['LQ01-021', 3], /* 墓道行尸   牺牲2 1/2/3  2 点 IMP，前期主攻 */
  ['LQ01-029', 3], /* 拾烬者     牺牲2 2/1/2  战吼复活 1 个 SR≤2 单位 */
  ['LQ01-035', 2], /* 以魂为媒   牺牲2      引擎：+2 牺牲值、抽 1（净零成本过牌） */
  ['LQ01-290', 2], /* 碎晶冲击   通用2      对 1 个单位 3 点伤害（灰） */
  ['LQ01-295', 1], /* 凝滞       通用2      冻结 1 个单位（灰） */
  ['LQ01-292', 1], /* 石肤守卫   通用2 1/2/3 守卫  2 点 IMP + 守卫（灰） */
  /* --- 3 费：中期骨干、续航与墓地轴 --- */
  ['LQ01-033', 3], /* 融魂工匠   牺牲3 2/2/3  2 点 IMP 中期骨干 */
  ['LQ01-028', 2], /* 厚痂工程   牺牲3      己方单位各回复 2 */
  ['LQ01-032', 1], /* 永夜墓碑   牺牲3 结界 抽 1 ＋ 单位 +1/+1 */
  /* --- 4 费：压制、清场与硬解 --- */
  ['LQ01-025', 3], /* 肉砧巨魔   牺牲4 4/2/5  中后期压制面 */
  ['LQ01-024', 2], /* 亡绝祷歌   牺牲4      对所有单位 2 点伤害（含己方） */
  ['LQ01-036', 1]  /* 魂坯重锤   牺牲4      破坏 1 个单位 */
];

/* -------------------------------------------------------------------------
 * 卡面角色表（按卡号硬编码；表外卡一律走兜底分支）
 * ------------------------------------------------------------------------- */
var ROLE = {
  'LQ01-024': 'aoe_clear',   /* 亡绝祷歌：对所有单位 2 点伤害（含己方） */
  'LQ01-036': 'destroy',     /* 魂坯重锤：破坏 1 个单位 */
  'LQ01-022': 'hit3',        /* 骨窖绞杀：对 1 个单位 3 点伤害 */
  'LQ01-290': 'hit3',        /* 碎晶冲击：对 1 个单位 3 点伤害 */
  'LQ01-295': 'freeze',      /* 凝滞：冻结 1 个单位 */
  'LQ01-028': 'heal',        /* 厚痂工程：己方单位各回复 2 */
  'LQ01-032': 'tomb',        /* 永夜墓碑：抽 1 ＋ 单位 +1/+1 */
  'LQ01-027': 'self_burn',   /* 自笞者：打出即得 1 点牺牲值 */
  'LQ01-034': 'offering',    /* 石心祭品：打出即抽 1 */
  'LQ01-035': 'medium',      /* 以魂为媒：+2 牺牲值、抽 1 */
  'LQ01-286': 'cantrip',     /* 褪色符文：抽 1 */
  'LQ01-021': 'body',        /* 墓道行尸 1/2/3 */
  'LQ01-029': 'gravedigger', /* 拾烬者：战吼复活 1 个 SR≤2 单位 */
  'LQ01-292': 'body',        /* 石肤守卫 1/2/3 守卫 */
  'LQ01-033': 'body',        /* 融魂工匠 2/2/3 */
  'LQ01-025': 'behemoth'     /* 肉砧巨魔 4/2/5 */
};

/* 需要敌方目标的卡：只有 move 带合法敌方目标时才允许打出 */
var NEEDS_TARGET = {
  'LQ01-036': true,
  'LQ01-022': true,
  'LQ01-290': true,
  'LQ01-295': true,
  'LQ01-024': false,
  'LQ01-028': false,
  'LQ01-032': false,
  'LQ01-027': false,
  'LQ01-034': false,
  'LQ01-035': false,
  'LQ01-286': false,
  'LQ01-021': false,
  'LQ01-029': false,
  'LQ01-292': false,
  'LQ01-033': false,
  'LQ01-025': false
};

/* 打出后立刻返还的牺牲值（引擎结算口径） */
var REFUND = {
  'LQ01-027': 1, /* 自笞者：打出即 +1 牺牲值 */
  'LQ01-035': 2  /* 以魂为媒：打出即 +2 牺牲值 */
};

/* 场上单位的 SR（引擎卡面字段），用于判断升灵素材是否够 */
var NAME_SR = {
  '自笞者': 1, '石心祭品': 1, '墓道行尸': 2, '拾烬者': 2,
  '石肤守卫': 2, '朽骨工蚁': 2, '墓穴挖掘工': 2,
  '融魂工匠': 3, '亡命拾骨者': 3, '肉砧巨魔': 4
};

/* -------------------------------------------------------------------------
 * 通用小工具（全部兜底，任何异常输入都返回安全值）
 * ------------------------------------------------------------------------- */
function num(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v : d;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function kwOf(u) {
  var k = u && u.kw;
  return Array.isArray(k) ? k : [];
}

function hasKw(u, w) {
  var k = kwOf(u), i;
  for (i = 0; i < k.length; i++) if (k[i] === w) return true;
  return false;
}

function findUnit(list, uid) {
  var i, u;
  for (i = 0; i < list.length; i++) {
    u = list[i];
    if (!u) continue;
    if (u.uid === uid) return u;
    if (u.uid === undefined && uid && typeof uid === 'object' && u.uid === uid.uid) return u;
  }
  return null;
}

/* move.target 既可能是 uid，也可能是单位对象 */
function targetUid(t) {
  if (t === null || t === undefined) return null;
  if (typeof t === 'object') return t.uid === undefined ? null : t.uid;
  return t;
}

/* 敌方单位的威胁度：ATK＋IMP 为主体，守卫与高耐久加权 */
function threatOf(u) {
  if (!u) return 0;
  var t = num(u.atk, 0) + num(u.imp, 0);
  if (hasKw(u, '守卫')) t += 3;
  if (num(u.hp, 0) >= 5) t += 2;
  if (hasKw(u, '冲锋')) t += 1;
  return t;
}

/* -------------------------------------------------------------------------
 * build：自己返回合规卡组，不依赖引擎回退
 * ------------------------------------------------------------------------- */
function build(pool) {
  var list = arr(pool);
  var have = {};
  var i, j;
  for (i = 0; i < list.length; i++) {
    if (list[i] && list[i].id) have[list[i].id] = true;
  }
  var out = [];
  var used = {};
  var total = 0;
  for (i = 0; i < DECK_PLAN.length; i++) {
    var id = DECK_PLAN[i][0];
    var n = DECK_PLAN[i][1];
    if (!have[id]) continue;                 /* 不在池中 → 交给兜底补齐 */
    out.push({ id: id, n: n });
    used[id] = n;
    total += n;
  }
  if (total < 30) {
    for (i = 0; i < list.length && total < 30; i++) {
      var c = list[i];
      if (!c || !c.id) continue;
      var cnt = used[c.id] || 0;
      if (cnt >= 3) continue;                /* 同名 ≤3 */
      var add = 3 - cnt;
      if (add > 30 - total) add = 30 - total;
      var merged = false;
      for (j = 0; j < out.length; j++) {
        if (out[j].id === c.id) { out[j].n += add; merged = true; break; }
      }
      if (!merged) out.push({ id: c.id, n: add });
      used[c.id] = cnt + add;
      total += add;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------
 * choose：动作优先级
 *   P0 斩杀      本回合打脸伤害 ≥ 对手生命 → 直接打脸
 *   P1 关键解场  解大威胁 / 清场 / 冻结 / 治疗
 *   P2 铺场      先便宜后大身，留 IMP 与耐久
 *   P3 资源过牌  自笞者 / 石心祭品 / 以魂为媒（返还型优先打）
 *   P4 灵体启动  弃牌堆有货才启动复活；资源型灵体在缺资源时开
 *   P5 升灵      外枢降临（素材 SR 够、场面够厚才升）
 *   P6 攻击      优先打脸，其次才是划算的换场
 *   P7 pass
 * ------------------------------------------------------------------------- */
function makeCtx(view) {
  var me = (view && view.me) || {};
  var opp = (view && view.opp) || {};
  var hand = arr(me.hand);
  var myBoard = arr(me.board);
  var oppBoard = arr(opp.board);
  var i, u, myUnits = 0, myFragile = 0, myMaulable = 0, myDamaged = 0;
  var hasGravedigger = false;
  var boardSR = 0;
  var maxOppThreat = 0;
  var oppFragile = 0;
  var wantHeavy = false;
  for (i = 0; i < hand.length; i++) {
    if (hand[i] && hand[i].type === '单位') myUnits++;
    if (hand[i] && hand[i].id === 'LQ01-029') hasGravedigger = true;
    if (hand[i] && hand[i].cost && num(hand[i].cost.n, 0) >= 4) wantHeavy = true;
  }
  for (i = 0; i < myBoard.length; i++) {
    u = myBoard[i];
    if (!u) continue;
    if (num(u.hp, 0) <= 2) myFragile++;
    if (num(u.hp, 0) === 3) myMaulable++;
    if (num(u.maxHp, num(u.hp, 0)) > num(u.hp, 0)) myDamaged++;
    if (u.name && NAME_SR[u.name] !== undefined) boardSR += NAME_SR[u.name];
  }
  for (i = 0; i < oppBoard.length; i++) {
    var th = threatOf(oppBoard[i]);
    if (th > maxOppThreat) maxOppThreat = th;
    if (num(oppBoard[i].hp, 0) <= 2) oppFragile++;
  }
  return {
    me: me,
    opp: opp,
    hand: hand,
    myBoard: myBoard,
    oppBoard: oppBoard,
    myUnits: myUnits,
    oppUnits: oppBoard.length,
    myFragile: myFragile,
    myMaulable: myMaulable,
    oppFragile: oppFragile,
    myDamaged: myDamaged,
    myHand: hand.length,
    grave: num(me.grave, 0),
    res: num(me.res, 0),
    oppLife: num(opp.life, 20),
    myLife: num(me.life, 20),
    turn: num(view && view.turn, 1),
    maxOppThreat: maxOppThreat,
    hasGravedigger: hasGravedigger,
    wantHeavy: wantHeavy,
    boardSR: boardSR,
    faceDamage: 0
  };
}

function scorePlay(ctx, mv, card) {
  var role = ROLE[card.id] || 'other';
  var tgt = null;
  var cost = (card.cost && num(card.cost.n, 0)) || 0;
  var refund = REFUND[card.id] || 0;

  if (NEEDS_TARGET[card.id]) {
    tgt = findUnit(ctx.oppBoard, targetUid(mv.target));
    if (!tgt) return -1;                    /* 目标不合法 → 不打这张牌 */
  }

  /* 返还型牌先出：出手后资源不减少，后面才排得上大身与解场 */
  var s = 0;
  if (refund > 0) s += refund * 4;
  else if (ctx.res <= cost) s -= 6;         /* 一次性打光资源 → 排到返还型牌之后 */

  if (role === 'aoe_clear') {
    /* 亡绝祷歌同时打己方：对面铺开、且我方脆单位少时开 */
    if (ctx.oppUnits < 3) return 0;
    return 116 + ctx.oppFragile * 12 + ctx.oppUnits * 6
         - ctx.myFragile * 22 - ctx.myMaulable * 8;
  }
  if (role === 'destroy') {
    var th = threatOf(tgt);
    if (th < 4) return 0;
    return 108 + th * 10;
  }
  if (role === 'hit3') {
    var th3 = threatOf(tgt);
    if (th3 < 3) return 0;
    return (num(tgt.hp, 0) <= 3 ? 104 : 66) + th3 * 8;
  }
  if (role === 'freeze') {
    var thf = threatOf(tgt);
    if (thf < 4) return 0;
    return 99 + thf * 11;
  }
  if (role === 'heal') {
    if (ctx.myDamaged <= 0) return 0;
    return 84 + ctx.myDamaged * 12;
  }
  if (role === 'tomb') {
    /* 永夜墓碑：抽 1 ＋ 单位 +1/+1，弃牌堆越深越该早开 */
    return (ctx.grave > 0 ? 72 : 56) + s;
  }
  if (role === 'self_burn') {
    /* 引擎口径：打出即回 1 点牺牲值 → 近乎零成本换一张 1/1/2 */
    return 88 + (ctx.myHand <= 3 ? 6 : 0) + s;
  }
  if (role === 'offering') {
    /* 引擎口径：打出即抽 1（附 1/1/2） */
    return 84 + (ctx.myHand <= 3 ? 10 : 0) + s;
  }
  if (role === 'medium') {
    /* 引擎口径：打出即 +2 牺牲值 且抽 1 → 净零成本过牌 */
    return 90 + (ctx.myHand <= 4 ? 8 : 0) + s;
  }
  if (role === 'cantrip') {
    /* 褪色符文：净 1 点牺牲值换 1 张牌 */
    return 78 + (ctx.myHand <= 2 ? 12 : 0) + s;
  }
  if (role === 'gravedigger') {
    /* 拾烬者：战吼复活 1 个 SR≤2 单位，弃牌堆越深越值钱 */
    return (ctx.grave > 0 ? 96 : 74) + (ctx.grave >= 3 ? 6 : 0) + s;
  }
  if (role === 'behemoth') {
    return 100 - (ctx.myUnits >= 6 ? 12 : 0) + s;
  }
  if (role === 'body') {
    var b = 74 + num(card.atk, 0) * 3 + num(card.imp, 0) * 5 + num(card.hp, 0);
    if (hasKw(card, '守卫')) b += 6;
    if (ctx.myUnits >= 6) b -= 8;
    return b + s;
  }
  return 40 + s;                             /* 未知卡：能打就保守打 */
}

function scoreAvatar(ctx) {
  var av = ctx.me.avatar;
  if (!av || av.used) return 0;
  var desc = String(av.desc || '');
  /* 亡灵君主·泽拉斯：启动＝从弃牌区捞回 1 个 SR≤2 单位 */
  if (desc.indexOf('弃牌区') >= 0 || desc.indexOf('复活') >= 0) {
    if (ctx.grave <= 0) return 0;
    return ctx.hasGravedigger ? (ctx.grave >= 3 ? 88 : 60) : 95;
  }
  /* 痛苦工匠·莫德里斯 / 深渊魂铸师·莫尔菲斯：启动给牺牲值 */
  if (desc.indexOf('牺牲值') >= 0) {
    return ctx.res <= 2 ? 96 : (ctx.wantHeavy ? 74 : 52);
  }
  return 50;                                  /* 其它灵体：免费启动不浪费 */
}

function scoreAscend(ctx, mv) {
  /* 引擎口径：素材＝己方场上单位，合计 SR ≥ 门槛（黑的外枢门槛为 6） */
  if (ctx.turn < 6 || ctx.myUnits < 4 || ctx.boardSR < 6) return 0;
  var id = mv.id;
  var s = 100;
  if (id === 'LQ01-265') {                   /* 渊体：破坏 1 个单位 */
    s = ctx.maxOppThreat >= 6 ? 124 : 96;
  } else if (id === 'LQ01-264') {            /* 百刑巨人：全体敌方 1 点 */
    s = ctx.oppUnits >= 3 ? 120 : 94;
  } else if (id === 'LQ01-263') {            /* 万骨王座：复活 1 个单位 */
    s = ctx.grave >= 2 ? 118 : 96;
  }
  return s;
}

function scoreAttack(ctx, mv) {
  var mine = findUnit(ctx.myBoard, mv.uid);
  if (!mine) return -1;
  var imp = num(mine.imp, 0);
  if (mv.target === 'face') {
    var s = 62 + imp * 10;
    /* 本回合打脸伤害足以击杀 → 斩杀 */
    if (ctx.oppLife > 0 && ctx.faceDamage >= ctx.oppLife) s += 1000;
    return s;
  }
  var foe = findUnit(ctx.oppBoard, targetUid(mv.target));
  if (!foe) return -1;
  var th = threatOf(foe);
  var kills = num(mine.atk, 0) >= num(foe.hp, 0);
  var iDie = num(foe.atk, 0) >= num(mine.hp, 0);
  var s2 = 38 + th * 4;
  if (kills) s2 += 30; else s2 -= 40;         /* 换不掉就是白送 */
  if (iDie) s2 -= 25; else s2 += 10;         /* 自己别白死 */
  if (th < 6) s2 -= 20;                      /* 小威胁不值得拿身体去换 */
  return s2;
}

function scoreMove(ctx, mv) {
  if (!mv || !mv.type) return -1;
  if (mv.type === 'play') {
    var card = ctx.hand[mv.i];
    if (!card) return -1;
    return scorePlay(ctx, mv, card);
  }
  if (mv.type === 'avatar') return scoreAvatar(ctx);
  if (mv.type === 'ascend') return scoreAscend(ctx, mv);
  if (mv.type === 'attack') return scoreAttack(ctx, mv);
  if (mv.type === 'pass') return 0;
  return -1;                                  /* 未知动作类型一律不选 */
}

function choose(view, moves) {
  var list = arr(moves);
  if (!list.length) return null;
  try {
    var ctx = makeCtx(view);
    var i, j, mv, u, imp;
    var counted = {};

    /* 统计本回合可以打出的总打脸伤害（只统计引擎给出的合法打脸动作） */
    for (i = 0; i < list.length; i++) {
      mv = list[i];
      if (!mv || mv.type !== 'attack' || mv.target !== 'face') continue;
      if (counted[mv.uid]) continue;          /* 同一单位只计一次 */
      counted[mv.uid] = 1;
      u = findUnit(ctx.myBoard, mv.uid);
      imp = u ? num(u.imp, 0) : 0;
      ctx.faceDamage += imp;
    }

    var best = null;
    var bestScore = 0;
    for (j = 0; j < list.length; j++) {
      mv = list[j];
      var sc = scoreMove(ctx, mv);
      if (sc > bestScore) {
        bestScore = sc;
        best = mv;
      }
    }
    if (best) return best;

    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].type === 'pass') return list[i];
    }
    return list[list.length - 1];
  } catch (e) {
    try {
      for (var k = 0; k < list.length; k++) {
        if (list[k] && list[k].type === 'pass') return list[k];
      }
      return list[list.length - 1];
    } catch (e2) {
      return null;
    }
  }
}

/* -------------------------------------------------------------------------
 * block：只在「换得掉对方」或「自己挨完还活着」时阻挡。
 * 拿不准进攻者是谁时不挡 —— 尸体要留给复活引擎。
 * ------------------------------------------------------------------------- */
function findAttacker(view) {
  var keys = ['attacker', 'attackingUnit', 'pendingAttacker', 'attack',
    'attacking', 'pendingAttack', 'combat', 'incoming', 'struck'];
  var containers = [];
  var i, j, k;
  if (view && typeof view === 'object') {
    containers.push(view);
    if (view.opp && typeof view.opp === 'object') containers.push(view.opp);
    if (view.me && typeof view.me === 'object') containers.push(view.me);
  }
  for (i = 0; i < containers.length; i++) {
    for (j = 0; j < keys.length; j++) {
      k = containers[i][keys[j]];
      if (k && typeof k === 'object' && num(k.atk, null) !== null) return k;
    }
  }
  var oppBoard = arr(view && view.opp && view.opp.board);
  for (i = 0; i < oppBoard.length; i++) {
    if (oppBoard[i] && oppBoard[i].attacking) return oppBoard[i];
  }
  for (i = 0; i < oppBoard.length; i++) {
    if (oppBoard[i] && oppBoard[i].attacked) return oppBoard[i];
  }
  if (oppBoard.length === 1) return oppBoard[0];
  return null;
}

function block(view, bmoves) {
  var list = arr(bmoves);
  if (!list.length) return null;
  try {
    var noBlock = null;
    var blocks = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      if (list[i].type === 'noBlock') noBlock = list[i];
      else if (list[i].type === 'block') blocks.push(list[i]);
    }
    if (!blocks.length) return noBlock || list[list.length - 1];

    var me = (view && view.me) || {};
    var myBoard = arr(me.board);

    var atkUnit = findAttacker(view);
    if (!atkUnit) return noBlock || list[list.length - 1];

    var aAtk = num(atkUnit.atk, 0);
    var aImp = num(atkUnit.imp, 0);
    var aHp = num(atkUnit.hp, 0);
    var toFace = (atkUnit.target === 'face');

    var best = null;
    var bestScore = 0;
    for (i = 0; i < blocks.length; i++) {
      var mv = blocks[i];
      var u = findUnit(myBoard, mv.uid);
      if (!u) continue;
      var myAtk = num(u.atk, 0);
      var myHp = num(u.hp, 0);
      var s = 0;
      if (aHp > 0 && myAtk >= aHp) s += 34;   /* 换得掉它 */
      if (aAtk < myHp) s += 16;               /* 我挨完还活着 */
      if (toFace && aAtk + aImp >= 3) s += 22;  /* 对面在打脸，替我挨这一下 */
      if (!toFace && aAtk + aImp < 4) s -= 18;   /* 小打小闹不换尸体 */
      s -= num(u.imp, 0) * 3;                 /* 优先用便宜身体去挡 */
      if (s > bestScore) { bestScore = s; best = mv; }
    }
    if (best) return best;
    return noBlock || list[list.length - 1];
  } catch (e) {
    return list[list.length - 1];
  }
}
