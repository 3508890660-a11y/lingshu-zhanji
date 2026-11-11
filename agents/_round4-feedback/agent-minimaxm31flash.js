/* =========================================================================
 * 灵枢战纪 · AI 脚本
 * 参与者：MiniMax M3.1flash
 * 模型 ID：minimax-m3.1-flash
 * 主色：黑（资源：牺牲值 = 2 + ⌊回合/2⌋，消耗制）
 * 策略：骨债引擎（以弃换场 · 守卫锁脸）
 *
 * 口径来源（仅使用本轮授权材料）：
 *   - agents/brief/01_基本规则.md：黑的资源与抽牌口径、战斗结算、灵体、外枢
 *   - agents/brief/02_卡表.md §3.2（黑 18 张）、§3.15（灰色泛用包）、§3.12/§3.14
 *   - agents/brief/03_脚本接口.md：build / choose / block 契约
 *   - js/engine/cards.gen.js、js/data/*.js：仅用于核对卡面字段与引擎结算口径
 *
 * 引擎结算口径（依据 js/engine/cards.gen.js 的 effects 字段）：
 *   - 自笞者 LQ01-027：res+1（1 费换回 1 点牺牲值 → 净零成本换一张 1/1/2）
 *   - 石心祭品 LQ01-034：draw 1（1 费换 1 张牌 + 1 个 IMP，无 res 返还）
 *   - 以魂为媒 LQ01-035：res+2 且 draw 1（净零成本过牌）
 *   - 碎晶冲击 LQ01-290：dmg 3 target enemyUnit；凝滞 LQ01-295：freeze enemyUnit
 *   - 石肤守卫 LQ01-292：1/2/3 守卫（通用2，本组唯一的「锁脸」墙）
 *   - 亡绝祷歌 LQ01-024：aoe 2 side=all（同时打己方，故只在对面铺开时开）
 *   - 拾烬者 LQ01-029：revive sr2（弃牌堆里 SR≤2 的单位）
 *   - 厚痂工程 LQ01-028：heal 2；融魂工匠 LQ01-033：2/2/3；肉砧巨魔 LQ01-025：4/2/5
 *   - 黑牌池的「磨牌」牌（019/020/030/031）不取：引擎只实装 mill，
 *     而其收益绑定「磨穿自己的牌库 → 重构」，在黑只有 20 张生命卡的盘子里不划算。
 * ========================================================================= */

var meta = {
  name: 'MiniMax M3.1flash · 骨债引擎',
  desc: '执行模型 minimax-m3.1-flash；颜色 黑；策略 骨债引擎（以弃换场 · 守卫锁脸）；用石肤守卫锁住对手打我脸的路，用碎晶冲击拆掉对手的守卫，用自笞者与以魂为媒的净零成本换过牌，用拾烬者把打掉的单位再拉回战场，用 IMP 一张一张磨穿对手 20 张生命卡。',
  id: 'model:minimaxm31flash',
  color: '黑'
};

/* -------------------------------------------------------------------------
 * 卡组清单：30 张；主色「黑」＋灰色泛用包；同名 ≤3。
 * 费用一律记作「牺牲N」；灰色「通用N」按 01 §4 由主色资源（牺牲值）支付。
 *
 * 费用档：1 费 6 张｜2 费 17 张｜3 费 4 张｜4 费 3 张
 * 名目 12 个（黑 9 + 灰 3），合计 30 张
 *
 * 曲线口径（两条都指向「压低曲线」）：
 *   1) 黑的抽牌是十一色里最窄的一条：回合开始抽 1，另需「手牌 <3 且生命 ≥12」
 *      才可付 2 生命再抽 1（每回合至多 2 次）。牌库 30 张而每回合只进 1 张，
 *      3–4 费牌每多一张，就多一份「抽到了也打不出、只能攥在手里等资源」的死重；
 *      黑资源 2+⌊回合/2⌋ 也天然偏低（回合 3 才 3 点、回合 6 才 5 点）。
 *   2) 上面那条「手牌 <3 才额外抽」的规则反过来也成立：手牌越少，抽得越多。
 *      所以脚本必须能把手牌快速转成场面与过牌（便宜牌才转得动），
 *      低费密度是黑色唯一能把资源与抽牌同时吃满的方式。
 *
 * 另两条选牌依据：
 *   3) 黑色唯一的伤害出口是 IMP 打脸（黑牌池没有任何对脸的直伤法术），
 *      所以 IMP 权重高于 ATK，优先堆 IMP2 的 1/2/3 身材（墓道行尸、石肤守卫、融魂工匠）。
 *   4) 规则 §5「场上有守卫单位时，只能打守卫」是双向的：
 *      我这边的守卫替我挡掉对手打我脸的路；对手的守卫则封死我的 IMP 打脸，
 *      必须先用便宜解场牌把它拆掉 —— 所以守卫与碎晶冲击各配 3 张。
 *
 * 引擎口径下的「零成本牌」是黑牌组的真正引擎：
 *   自笞者（1 费 → 回 1 牺牲值）、以魂为媒（2 费 → 回 2 牺牲值）净零成本，
 *   3 张自笞者 + 3 张以魂为媒 = 6 张「不花钱就能打出去」的牌，
 *   剩下 24 张牌的额度全部由它们让出来。
 * ------------------------------------------------------------------------- */
var DECK_PLAN = [
  /* --- 1 费（6 张）：零成本身体与最低价过牌 --- */
  ['LQ01-027', 3], /* 自笞者     牺牲1 1/1/2  引擎：打出即 +1 牺牲值 → 净零成本换 1 个 IMP */
  ['LQ01-034', 3], /* 石心祭品   牺牲1 1/1/2  引擎：打出即抽 1 → 1 费换 1 张牌 + 1 个 IMP */
  /* --- 2 费（17 张）：IMP 主力、净零过牌、锁脸守卫与解场 --- */
  ['LQ01-021', 3], /* 墓道行尸   牺牲2 1/2/3  2 点 IMP，前期主攻，SR2 可复活 */
  ['LQ01-292', 3], /* 石肤守卫   通用2 1/2/3 守卫  2 点 IMP + 守卫（灰） */
  ['LQ01-035', 3], /* 以魂为媒   牺牲2      引擎：+2 牺牲值、抽 1 → 净零成本过牌 */
  ['LQ01-290', 3], /* 碎晶冲击   通用2      对 1 个单位 3 点伤害（灰） */
  ['LQ01-295', 3], /* 凝滞       通用2      冻结 1 个单位（灰） */
  ['LQ01-029', 2], /* 拾烬者     牺牲2 2/1/2  战吼复活 1 个 SR≤2 单位 */
  /* --- 3 费（4 张）：中期 IMP 骨干与续航 --- */
  ['LQ01-033', 3], /* 融魂工匠   牺牲3 2/2/3  2 点 IMP、2 点 ATK，能撞守卫 */
  ['LQ01-028', 1], /* 厚痂工程   牺牲3      己方单位各回复 2 */
  /* --- 4 费（3 张）：压制面与清场 --- */
  ['LQ01-025', 2], /* 肉砧巨魔   牺牲4 4/2/5  中后期压制面 */
  ['LQ01-024', 1]  /* 亡绝祷歌   牺牲4      对所有单位 2 点伤害（含己方） */
];

/* -------------------------------------------------------------------------
 * 卡面角色表（按卡号硬编码；表外卡一律走兜底分支）
 * ------------------------------------------------------------------------- */
var ROLE = {
  'LQ01-024': 'aoe_clear',   /* 亡绝祷歌：对所有单位 2 点伤害（含己方） */
  'LQ01-290': 'hit3',        /* 碎晶冲击：对 1 个单位 3 点伤害 */
  'LQ01-295': 'freeze',      /* 凝滞：冻结 1 个单位 */
  'LQ01-028': 'heal',        /* 厚痂工程：己方单位各回复 2 */
  'LQ01-027': 'self_burn',   /* 自笞者：打出即得 1 点牺牲值 */
  'LQ01-034': 'offering',    /* 石心祭品：打出即抽 1 */
  'LQ01-035': 'medium',      /* 以魂为媒：+2 牺牲值、抽 1 */
  'LQ01-021': 'body',        /* 墓道行尸 1/2/3 */
  'LQ01-029': 'gravedigger', /* 拾烬者：战吼复活 SR≤2 单位 */
  'LQ01-292': 'body',        /* 石肤守卫 1/2/3 守卫 */
  'LQ01-033': 'body',        /* 融魂工匠 2/2/3 */
  'LQ01-025': 'behemoth'     /* 肉砧巨魔 4/2/5 */
};

/* 需要敌方目标的卡：只有 move 带合法敌方目标时才允许打出 */
var NEEDS_TARGET = {
  'LQ01-290': true,
  'LQ01-295': true,
  'LQ01-024': false,
  'LQ01-028': false,
  'LQ01-027': false,
  'LQ01-034': false,
  'LQ01-035': false,
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

/* 场上单位的 SR（引擎卡面字段），用于判断升灵素材与复活额度 */
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
  if (!list || !uid) return null;
  for (i = 0; i < list.length; i++) {
    u = list[i];
    if (!u) continue;
    if (u.uid === uid) return u;
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

/* 我方单位是否是「可再生身体」：SR≤2 才能被拾烬者／泽拉斯捞回 */
function isRecyclable(u) {
  if (!u) return false;
  var sr = (u.name && NAME_SR[u.name] !== undefined) ? NAME_SR[u.name] : null;
  if (sr !== null) return sr <= 2;
  return num(u.sr, 99) <= 2;
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
 *   P0 斩杀      本回合可打出的 IMP 总和 ≥ 对手生命 → 直接推脸
 *   P1 灵体启动  免费复活（泽拉斯）优先；免费加资源（莫德里斯）几乎无条件开
 *   P2 出牌      返还型 / 过牌型优先，其次铺场，再次解场
 *   P3 升灵      场面宽裕（SR 余量充足）时才拆自己的场面
 *   P4 攻击      IMP 换生命卡；换场只在能换掉对方且自己不死时才做
 *   P5 pass
 * ------------------------------------------------------------------------- */
function makeCtx(view) {
  var me = (view && view.me) || {};
  var opp = (view && view.opp) || {};
  var hand = arr(me.hand);
  var myBoard = arr(me.board);
  var oppBoard = arr(opp.board);
  var i, u, myFragile = 0, myMaulable = 0, myDamaged = 0;
  var handUnits = 0;
  var boardSR = 0;
  var maxOppThreat = 0;
  var oppFragile = 0;
  var wantHeavy = false;
  var myGuard = false;
  var av = me.avatar || null;
  var avDesc = av ? String(av.desc || '') : '';
  var avatarIsReviver = (avDesc.indexOf('弃牌区') >= 0 || avDesc.indexOf('复活') >= 0);
  var avatarUsed = !!(av && av.used);
  for (i = 0; i < hand.length; i++) {
    if (hand[i] && hand[i].type === '单位') handUnits++;
    if (hand[i] && hand[i].cost && num(hand[i].cost.n, 0) >= 4) wantHeavy = true;
  }
  for (i = 0; i < myBoard.length; i++) {
    u = myBoard[i];
    if (!u) continue;
    if (num(u.hp, 0) <= 2) myFragile++;
    if (num(u.hp, 0) === 3) myMaulable++;
    if (num(u.maxHp, num(u.hp, 0)) > num(u.hp, 0)) myDamaged++;
    if (u.name && NAME_SR[u.name] !== undefined) boardSR += NAME_SR[u.name];
    if (hasKw(u, '守卫')) myGuard = true;
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
    handUnits: handUnits,        /* 手牌里的单位张数 */
    boardUnits: myBoard.length,  /* 场面上的单位个数 */
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
    wantHeavy: wantHeavy,
    boardSR: boardSR,
    myGuard: myGuard,
    avatarIsReviver: avatarIsReviver,
    avatarUsed: avatarUsed,
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
    /* 亡绝祷歌按引擎口径 side=all（也打我自己）：
       只有对面小怪够多、且我方脆单位不比它多时，这波交换才划算。 */
    if (ctx.oppUnits < 3) return 0;
    if (ctx.oppFragile < 3) return 0;
    if (ctx.myFragile > ctx.oppFragile) return 0;
    return 104 + ctx.oppFragile * 12 + ctx.oppUnits * 6
         - ctx.myFragile * 18 - ctx.myMaulable * 8;
  }
  if (role === 'hit3') {
    /* 3 点伤害：打死（耐久 ≤3）时价值最高 —— 守卫不倒，我的 IMP 打不到脸 */
    var th3 = threatOf(tgt);
    var s3 = (num(tgt.hp, 0) <= 3 ? 70 : 40) + th3 * 5;
    if (hasKw(tgt, '守卫')) s3 += 40;        /* 优先拆守卫：拆开它，我的 IMP 才能打脸 */
    if (num(tgt.imp, 0) >= 2) s3 += 10;      /* 高 IMP 单位活着就一直打我脸 */
    return s3;
  }
  if (role === 'freeze') {
    /* 冻结：对手一回合不能攻击也不能累计 IMP，掐掉的是它的输出窗口 */
    var thf = threatOf(tgt);
    if (thf < 3) return 0;
    return 92 + thf * 9 + num(tgt.imp, 0) * 6;
  }
  if (role === 'heal') {
    if (ctx.myDamaged <= 0) return 0;
    return 84 + ctx.myDamaged * 12;
  }
  if (role === 'self_burn') {
    /* 引擎口径：打出即回 1 点牺牲值 → 近乎零成本换一张 1/1/2 */
    return 90 + (ctx.myHand <= 3 ? 6 : 0) + s;
  }
  if (role === 'offering') {
    /* 引擎口径：打出即抽 1（附 1/1/2） */
    return 86 + (ctx.myHand <= 3 ? 10 : 0) + s;
  }
  if (role === 'medium') {
    /* 引擎口径：打出即 +2 牺牲值 且抽 1 → 净零成本过牌 */
    return 92 + (ctx.myHand <= 4 ? 8 : 0) + s;
  }
  if (role === 'gravedigger') {
    /* 拾烬者：战吼复活 1 个 SR≤2 单位，但复活额度与泽拉斯启动共享（全局每回合 1 次）。
       若灵体那条免费额度还在（或已经用掉），它的战吼复活都是白给的 ——
       这时它只值一个 2/1/2 的身体；只有灵体不是复活型时，复活增量才全归它。 */
    var g = 76 + num(card.atk, 0) * 2 + num(card.imp, 0) * 7 + num(card.hp, 0);
    if (!ctx.avatarIsReviver && ctx.grave > 0) g += 16;
    return g + s;
  }
  if (role === 'behemoth') {
    return 100 - (ctx.boardUnits >= 6 ? 12 : 0) + s;
  }
  if (role === 'body') {
    /* 黑色唯一的伤害出口是 IMP 打脸，ATK 只在换场时用，所以 IMP 权重高于 ATK */
    var b = 76 + num(card.atk, 0) * 2 + num(card.imp, 0) * 7 + num(card.hp, 0);
    if (hasKw(card, '守卫')) b += 10;         /* 守卫锁脸：对手的 IMP 打不到我的生命卡 */
    if (ctx.boardUnits >= 7) b -= 10;        /* 场面已经拥挤时降权 */
    else if (ctx.handUnits >= 3) b += 6;     /* 手上一堆单位：先铺出去，别卡在手里 */
    return b + s;
  }
  return 40 + s;                             /* 未知卡：能打就保守打 */
}

function scoreAvatar(ctx) {
  var av = ctx.me.avatar;
  if (!av || av.used) return 0;
  var desc = String(av.desc || '');
  /* 亡灵君主·泽拉斯：启动＝从弃牌区捞回 1 个 SR≤2 单位（免费）。
     它与拾烬者共享「每回合复活上限 1」，所以先用免费的那次：
     泽拉斯花 0 资源换一次复活，拾烬者仍可当 2 费的身体打出去。 */
  if (desc.indexOf('弃牌区') >= 0 || desc.indexOf('复活') >= 0) {
    if (ctx.grave <= 0) return 0;
    return 116 + (ctx.grave >= 3 ? 8 : 0);
  }
  /* 深渊魂铸师·莫尔菲斯：启动＝磨 2 并 +2 牺牲值（磨牌口径不确定，降权） */
  if (desc.indexOf('并 +2 牺牲值') >= 0) {
    return ctx.res <= 2 ? 76 : 50;
  }
  /* 痛苦工匠·莫德里斯：启动＝免费获得 3 点牺牲值。
     牺牲值不跨回合累积（每回合刷新 2+⌊回合/2⌋），所以这 3 点必须本回合用掉，
     因此几乎无条件启动。 */
  if (desc.indexOf('牺牲值') >= 0) {
    return 112;
  }
  return 50;                                  /* 其它灵体：免费启动不浪费 */
}

function scoreAscend(ctx, mv) {
  /* 引擎口径：素材＝己方场上单位，合计 SR ≥ 门槛（黑的外枢门槛为 6），
     素材会被送进弃牌区 —— 也就是「拆自己的场面换一个大场面」，
     而且引擎按 SR 从小到大凑素材，所以先走的是我最便宜的单位。
     黑牌的胜负手是「多个 IMP2 单位持续打脸」，拆光场面等于自断输出，
     所以只在场面极宽裕（SR 有余量）时才升。 */
  if (ctx.turn < 6 || ctx.boardUnits < 5 || ctx.boardSR < 10) return 0;
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
    /* 黑色唯一的伤害出口就是 IMP 打脸：IMP 直接扣对手的生命卡 */
    var s = 62 + imp * 16;
    if (ctx.oppLife > 0 && ctx.faceDamage >= ctx.oppLife) s += 1000;
    return s;
  }
  var foe = findUnit(ctx.oppBoard, targetUid(mv.target));
  if (!foe) return -1;
  var th = threatOf(foe);
  var kills = num(mine.atk, 0) >= num(foe.hp, 0);
  var iDie = num(foe.atk, 0) >= num(mine.hp, 0);
  var s2 = 24 + th * 4;
  if (kills) s2 += 30; else s2 -= 40;         /* 换不掉就是白送 */
  if (iDie) {
    /* 我的 SR≤2 身体死了还能被拾烬者／泽拉斯捞回来（并触发泽拉斯被动抽 1），
       所以「我死」在黑牌组不是终局，代价远小于别的颜色。 */
    s2 -= isRecyclable(mine) ? 8 : 25;
  } else {
    s2 += 10;
  }
  if (th < 6) s2 -= 20;                      /* 小威胁不值得拿身体去换 */
  if (hasKw(foe, '守卫')) s2 += 18;          /* 守卫不倒，我的 IMP 打不到脸 */
  if (num(foe.imp, 0) >= 2) s2 += 8;         /* 高 IMP 单位活着就一直打我脸 */
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
 * block：黑色没有牌能挡住对手的 IMP 打脸，能做的只有「用尸体换伤害」。
 * 而尸体会进弃牌堆 → 泽拉斯被动抽 1、拾烬者战吼复活，所以我的身体是可再生资源：
 * 对面的 IMP 打在我脸上 = 直接扣我的生命卡（我的血＝20 张生命卡），
 * 用一张 1/1/2 去换一个 2 点 IMP 的打脸是划算的，前提是它确实能挡住这一下。
 *
 * 引擎未承诺在 view 里给出 attacker / target 字段，所以不猜「谁在打、打谁」：
 * 候选攻击者 = 对手场面上「正在攻击 / 已攻击过」的单位，取不到就用对手全部单位；
 * 再对每个候选阻挡者取最有利的配对，最后优先用 IMP 低的便宜身体去挡。
 * ------------------------------------------------------------------------- */
function block(view, bmoves) {
  var list = arr(bmoves);
  if (!list.length) return null;
  try {
    var noBlock = null;
    var blocks = [];
    var i, j;
    for (i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      if (list[i].type === 'noBlock') noBlock = list[i];
      else if (list[i].type === 'block') blocks.push(list[i]);
    }
    if (!blocks.length) return noBlock || list[list.length - 1];

    var me = (view && view.me) || {};
    var myBoard = arr(me.board);
    var oppBoard = arr(view && view.opp && view.opp.board);
    if (!myBoard.length || !oppBoard.length) return noBlock || list[list.length - 1];

    /* 候选攻击者：优先用「正在攻击 / 已攻击过」的单位，取不到就用对手全部单位 */
    var cands = [];
    for (i = 0; i < oppBoard.length; i++) {
      if (oppBoard[i] && (oppBoard[i].attacking || oppBoard[i].attacked)) cands.push(oppBoard[i]);
    }
    if (!cands.length) cands = oppBoard;
    if (!cands.length) return noBlock || list[list.length - 1];

    /* 我方守卫的身价：用更便宜的身体替守卫挨打是划算的 */
    var guardImp = 0;
    for (i = 0; i < myBoard.length; i++) {
      if (hasKw(myBoard[i], '守卫')) {
        var gi = num(myBoard[i].imp, 0);
        if (gi > guardImp) guardImp = gi;
      }
    }

    var best = null;
    var bestScore = 4;
    for (i = 0; i < blocks.length; i++) {
      var mv = blocks[i];
      var u = findUnit(myBoard, mv.uid);
      if (!u) continue;
      var myAtk = num(u.atk, 0);
      var myHp = num(u.hp, 0);
      var myImp = num(u.imp, 0);
      var s = 0;
      for (j = 0; j < cands.length; j++) {
        var o = cands[j];
        var oAtk = num(o.atk, 0);
        var oHp = num(o.hp, 0);
        var oImp = num(o.imp, 0);
        var v = 0;
        if (oHp > 0 && myAtk >= oHp) v += 18;    /* 换得掉它 */
        else if (myHp > oAtk) v += 10;           /* 我挨完还活着 */
        else if (oImp >= 2) v += 8;              /* 至少挡住 2 点 IMP 打脸 */
        if (guardImp > 0 && myImp < guardImp) v += 6;  /* 便宜身体替守卫挨打 */
        if (v > s) s = v;
      }
      s -= myImp * 3;                            /* 优先用 IMP 低的便宜身体去挡 */
      if (myHp > 3) s -= (myHp - 3) * 2;         /* 别拿厚血核心去挡 */
      if (s > bestScore) { bestScore = s; best = mv; }
    }
    if (best) return best;
    return noBlock || list[list.length - 1];
  } catch (e) {
    return list[list.length - 1];
  }
}
