/* ===========================================================================
 * MiniMax M3 · 地脉生根（主色：绿）
 * ---------------------------------------------------------------------------
 * 依据（只来自 agents/brief/01_基本规则.md 与 02_卡表.md 的卡面文本 + 规则）：
 *   · 绿的资源＝法力，口径「2 + 地标数」，消耗制；抽牌口径「回合末补至
 *     地标数+1」。地标同时抬法力和抬抽牌，所以「地标数」就是这个颜色的
 *     加速器本身：早落地一块地标，之后每回合都多 1 点法力、多 1 张牌。
 *   · 幼叶之池（法力1 · 地标 · 产 1 点法力）、母神共鸣地（法力2 · 地标 ·
 *     产 2 点法力）、涌泉林地（法力3 · 地标）都是能落地成地标的牌，
 *     落地即永久抬「地标数」这项。
 *   · 大地脉动（法力3 · 从牌库检索 1 张地标卡直接置入战场）是唯一能把
 *     地标「凭空」放进场的加速牌。
 *   · 荆棘绞杀（法力2 · 对 1 个单位 3 点伤害）、落叶风暴（法力3 · 全体
 *     敌方 2 点）、藤海怒涛（法力4 · 全体敌方 3 点，且每有 1 张地标回复 1）
 *     是点杀与清场三档。
 *   · 践踏：溢出伤害转脸。荒原猛犸 4/3/4、裂地巨犀 5/4/5、林冠泰坦 6/5/6
 *     都是高 ATK + 践踏，对面摆守卫也拦不住溢出的那部分。
 *   · 升灵（规则 §6）：素材＝己方场上单位，素材 SR 合计 ≥ 门槛即可宣告，
 *     引擎自动从 SR 最小的开始凑，素材送入弃牌区，每回合至多升灵 1 次。
 *     盖亚幼株 SR1、摇篮藤根 SR2 是最便宜素材，能换巨木之心 / 苍林守望
 *     （SR3）与兽王之魂（SR5）。
 *   · 灵体：森林先知·盖亚 被动回合开始额外 +1 法力、启动免费 +2 法力 →
 *     前中期法力足以同时铺地标与素材单位。
 *
 * 策略「地脉生根」：地标加速 → 廉价素材单位 → 升灵换大身 → 践踏巨兽推脸。
 * =========================================================================== */

var meta = {
  name: 'MiniMax M3 · 地脉生根',
  desc: '执行模型 minimax-m3-pay；颜色 绿；策略 地脉生根（地标加速 + 廉价素材升灵 + 践踏推进）',
  id: 'model:minimaxm3',
  color: '绿'
};

/* ── 卡面索引（只硬编码卡号／卡名，不硬编码 uid）───────────────────────── */
var INFO = {
  'LQ01-055': { name: '盖亚幼株',   sr: 1, role: 'fodder', cost: 1 },
  'LQ01-056': { name: '幼叶之池',   sr: 0, role: 'land',   cost: 1 },
  'LQ01-057': { name: '摇篮藤根',   sr: 2, role: 'fodder', cost: 2 },
  'LQ01-058': { name: '荆棘绞杀',   sr: 0, role: 'dmg',    cost: 2 },
  'LQ01-059': { name: '猎杀弱肉',   sr: 3, role: 'body',   cost: 3 },
  'LQ01-060': { name: '落叶风暴',   sr: 0, role: 'clear',  cost: 3 },
  'LQ01-061': { name: '母神共鸣地', sr: 0, role: 'land',   cost: 2 },
  'LQ01-062': { name: '涌泉林地',   sr: 0, role: 'land',   cost: 3 },
  'LQ01-063': { name: '林冠漫步者', sr: 3, role: 'body',   cost: 3 },
  'LQ01-064': { name: '大地脉动',   sr: 0, role: 'mana',   cost: 3 },
  'LQ01-065': { name: '荒原猛犸',   sr: 4, role: 'body',   cost: 4 },
  'LQ01-066': { name: '裂地巨犀',   sr: 5, role: 'body',   cost: 5 },
  'LQ01-067': { name: '林冠泰坦',   sr: 6, role: 'body',   cost: 6 },
  'LQ01-068': { name: '巨兽冲锋',   sr: 0, role: 'buff',   cost: 2 },
  'LQ01-069': { name: '蜉蝣食菌虻', sr: 1, role: 'fodder', cost: 1 },
  'LQ01-070': { name: '进化的摇篮', sr: 0, role: 'land',   cost: 3 },
  'LQ01-071': { name: '灵格涌涨',   sr: 0, role: 'buff',   cost: 2 },
  'LQ01-072': { name: '藤海怒涛',   sr: 0, role: 'wave',   cost: 4 }
};

/* 主卡组：10 个名目 × 3 = 30 张
 * 曲线 1–2 / 3–4 / 5–6 / 7+ = 15 / 9 / 6 / 0 */
var DECK = [
  { id: 'LQ01-056', n: 3 }, // 幼叶之池   法力1 地标 产1
  { id: 'LQ01-061', n: 3 }, // 母神共鸣地 法力2 地标 产2
  { id: 'LQ01-062', n: 3 }, // 涌泉林地   法力3 地标
  { id: 'LQ01-064', n: 3 }, // 大地脉动   法力3 检索地标直接进场
  { id: 'LQ01-055', n: 3 }, // 盖亚幼株   法力1 1/1/1 SR1
  { id: 'LQ01-057', n: 3 }, // 摇篮藤根   法力2 1/2/3 守卫 SR2
  { id: 'LQ01-058', n: 3 }, // 荆棘绞杀   法力2 对1个单位3点
  { id: 'LQ01-072', n: 3 }, // 藤海怒涛   法力4 全体3点 每地标回复1
  { id: 'LQ01-066', n: 3 }, // 裂地巨犀   法力5 5/4/5 践踏
  { id: 'LQ01-067', n: 3 }  // 林冠泰坦   法力6 6/5/6 践踏+再生
];

/* 备用补位（仅当池里缺主卡组某个名目时才用得上） */
var BACKUP = [
  { id: 'LQ01-060', n: 3 }, // 落叶风暴   法力3 全体2点
  { id: 'LQ01-069', n: 2 }, // 蜉蝣食菌虻 法力1 1/1/1
  { id: 'LQ01-063', n: 2 }, // 林冠漫步者 法力3 2/2/3 SR3
  { id: 'LQ01-065', n: 2 }, // 荒原猛犸   法力4 4/3/4 践踏
  { id: 'LQ01-070', n: 2 }, // 进化的摇篮 法力3 地标
  { id: 'LQ01-071', n: 2 }, // 灵格涌涨   法力2
  { id: 'LQ01-068', n: 2 }, // 巨兽冲锋   法力2
  { id: 'LQ01-059', n: 2 }  // 猎杀弱肉   法力3 2/1/2
];

/* 升灵素材 SR（按卡名索引；引擎自动从 SR 最小的开始凑） */
var SR_BY_NAME = {
  '盖亚幼株': 1, '摇篮藤根': 2, '林冠漫步者': 3,
  '荒原猛犸': 4, '裂地巨犀': 5, '林冠泰坦': 6,
  '蜉蝣食菌虻': 1, '猎杀弱肉': 3,
  '巨木之心': 3, '苍林守望': 3, '兽王之魂': 5
};

/* 绿的外枢灵体：素材 SR 合计门槛 + 降临后的身体与额外产出 */
var ASC = {
  'LQ01-266': { name: '巨木之心', need: 3, atk: 6, imp: 4, hp: 7, res: 2, draw: 1 },
  'LQ01-267': { name: '苍林守望', need: 3, atk: 5, imp: 5, hp: 8, res: 0, draw: 2 },
  'LQ01-268': { name: '兽王之魂', need: 5, atk: 7, imp: 6, hp: 6, res: 0, draw: 0 }
};

/* ── 基础工具 ─────────────────────────────────────────────────────────── */

function kwOf(u) {
  if (!u) return [];
  if (typeof u.kw === 'string') return [u.kw];
  return u.kw || [];
}

function hasKw(u, k) { return kwOf(u).indexOf(k) >= 0; }

function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : (d || 0); }

/** 单位综合价值：换血取舍、留场与升灵取舍都用它 */
function unitVal(u) {
  if (!u) return 0;
  var v = num(u.atk) * 1.1 + num(u.imp) * 0.9 + num(u.hp) * 0.7;
  if (hasKw(u, '践踏')) v += 1.2;
  if (hasKw(u, '守卫')) v += 0.8;
  if (hasKw(u, '冲锋')) v += 0.5;
  if (hasKw(u, '圣盾')) v += 1.5;
  return v;
}

/** 目标的有效耐久：圣盾抵消 1 点；守护X 代替承受伤害 */
function effHp(u) {
  if (!u) return 1;
  var hp = num(u.hp, 1);
  if (hasKw(u, '圣盾')) hp += 1;
  if (hasKw(u, '守护2')) hp += 2;
  else if (hasKw(u, '守护1')) hp += 1;
  return hp;
}

function isGuard(u) { return hasKw(u, '守卫') || hasKw(u, '守护1') || hasKw(u, '守护2'); }

function findUnit(list, uid) {
  if (!list) return null;
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].uid === uid) return list[i];
  return null;
}

function srOf(name) {
  var s = SR_BY_NAME[name];
  return typeof s === 'number' ? s : 3;
}

/** 该牌是否必须指定目标（引擎给的 play 动作里若没有 target，就别硬打） */
function needsTarget(card) {
  var ef = card && card.effects;
  if (!ef || !ef.length) return false;
  for (var i = 0; i < ef.length; i++) {
    var e = ef[i];
    if (!e) continue;
    if (e.target === 'enemyUnit' || e.target === 'unit' || e.target === 'ownUnit') return true;
  }
  return false;
}

/* ── build(pool) ───────────────────────────────────────────────────────── */

function build(pool) {
  var have = {}, any = false, i;
  if (pool && pool.length) {
    for (i = 0; i < pool.length; i++) {
      if (pool[i] && pool[i].id) { have[pool[i].id] = true; any = true; }
    }
  }
  var out = [], used = {}, total = 0;

  /* 取 n 张同名牌；凑满 30 张即停，绝不越过 30 张上限 */
  function take(id, n) {
    if (any && !have[id]) return;
    if (used[id]) return;
    var room = 30 - total;
    if (room <= 0) return;
    var cnt = n < room ? n : room;
    if (cnt <= 0) return;
    used[id] = true;
    out.push({ id: id, n: cnt });
    total += cnt;
  }

  for (i = 0; i < DECK.length; i++) take(DECK[i].id, DECK[i].n);
  for (i = 0; i < BACKUP.length; i++) take(BACKUP[i].id, BACKUP[i].n);

  /* 池子里凑不满 30 张时交回引擎兜底，避免产出不合规卡组 */
  if (total < 30) return null;
  return out;
}

/* ── 场面快照 ─────────────────────────────────────────────────────────── */

function snapshot(view) {
  var me = view.me || {};
  var opp = view.opp || {};
  var myB = me.board || [];
  var oppB = opp.board || [];
  var s = {
    view: view, me: me, opp: opp,
    hand: me.hand || [],
    myB: myB, oppB: oppB,
    res: num(me.res),
    turn: num(view.turn, num(me.turn)),
    myLife: num(me.life), oppLife: num(opp.life),
    lands: 0, cheapSr: 0, fodderCount: 0, oppGuards: 0
  };
  for (var i = 0; i < myB.length; i++) {
    var u = myB[i];
    if (!u) continue;
    var sr = srOf(u.name);
    if (sr <= 2) { s.cheapSr += sr; s.fodderCount++; }
  }
  s.lands = (me.lands && me.lands.length) ? me.lands.length : 0;
  for (var j = 0; j < oppB.length; j++) if (isGuard(oppB[j])) s.oppGuards++;
  return s;
}

/* ── 升灵评估 ─────────────────────────────────────────────────────────── */

/**
 * 引擎把升灵统一折算成「素材 SR 合计 ≥ N」，并自动从 SR 最小的开始凑，
 * 素材送入弃牌区。这里照同样口径模拟一遍，算出净收益。
 */
function planAscend(s, ascId) {
  var asc = ASC[ascId];
  if (!asc) return null;
  var items = [], i;
  for (i = 0; i < s.myB.length; i++) {
    var u = s.myB[i];
    if (!u) continue;
    items.push({ u: u, sr: srOf(u.name) });
  }
  items.sort(function (a, b) { return a.sr - b.sr; });
  var sum = 0, used = [], k;
  for (k = 0; k < items.length && sum < asc.need; k++) {
    sum += items[k].sr;
    used.push(items[k].u);
  }
  if (sum < asc.need) return null;
  /* 只拿廉价素材（SR ≤ 2）去换，保住自己的践踏巨兽 */
  for (k = 0; k < used.length; k++) if (srOf(used[k].name) > 2) return null;
  var lost = 0;
  for (k = 0; k < used.length; k++) lost += unitVal(used[k]);
  var gained = num(asc.atk) * 1.1 + num(asc.imp) * 0.9 + num(asc.hp) * 0.7
             + num(asc.res) * 2 + num(asc.draw) * 3;
  return { asc: asc, used: used, net: gained - lost };
}

/* ── 出牌评分 ─────────────────────────────────────────────────────────── */

function scoreLand(card, s) {
  /* 地标同时抬法力和抽牌，越早越值 */
  var v = 900 - 12 * s.turn;
  if (s.lands >= 6) v -= 200;                 /* 地标够多就把重心转回场面 */
  if (s.myB.length === 0 && s.fodderCount === 0) v -= 100;
  if (s.res < num(card.cost && card.cost.n, 1)) v -= 200;
  return v;
}

function scoreMana(card, s) {
  /* 大地脉动：把地标直接放进战场，等于凭空多一块加速器 */
  var v = 880 - 12 * s.turn;
  if (s.lands >= 6) v -= 120;
  if (s.res < num(card.cost && card.cost.n, 1)) v -= 200;
  return v;
}

function scoreFodder(card, s) {
  var v = 840 - 10 * s.turn;
  if (s.fodderCount >= 6) v -= 320;           /* 素材够升灵了就别再堆 */
  if (s.cheapSr >= 6) v -= 220;
  if (s.myB.length === 0) v += 60;            /* 空场要有人站住 */
  return v;
}

function scoreBody(card, s) {
  var v = 700 - 5 * s.turn;
  var kw = card.kw || [];
  if (typeof card.atk === 'number') v += num(card.atk) * 2 + num(card.imp) * 3 + num(card.hp) * 1.2;
  if (kw.indexOf('践踏') >= 0) v += 45;
  if (kw.indexOf('再生') >= 0) v += 20;
  if (kw.indexOf('守卫') >= 0) v += 25;
  if (s.myB.length === 0) v += 60;
  return v;
}

function scoreClear(card, s) {
  /* AOE 只对敌方单位生效（不烧脸），敌方场面空时不该用 */
  if (s.oppB.length === 0) return -1e8;
  var dmg = (card.id === 'LQ01-072') ? 3 : 2;
  var kills = 0, chip = 0, i;
  for (i = 0; i < s.oppB.length; i++) {
    var u = s.oppB[i];
    if (!u) continue;
    if (num(u.hp) <= dmg) kills++; else chip++;
  }
  if (kills === 0 && chip <= 1) return -1e8;   /* 刮不动就留着别用 */
  var v = 1000 + kills * 70 + chip * 14;
  if (card.id === 'LQ01-072') {
    if (s.myLife <= 14) v += 140;             /* 藤海怒涛每有 1 张地标回复 1 */
    if (kills === 0) v -= 120;
  }
  return v;
}

function scoreDmg(card, m, s) {
  var t = findUnit(s.oppB, m.target);
  if (!t) return -1e8;
  var eff = effHp(t);
  if (3 < eff) return -1e8;                   /* 3 点打不死就别浪费法力 */
  var v = 1000 + 40 + unitVal(t) * 1.6;
  if (isGuard(t)) v += 70;                    /* 清掉守卫才能打脸 */
  if (num(t.atk) >= 4) v += 30;               /* 高威胁优先 */
  return v;
}

function scoreBuff(card, s) {
  var v = 1000;
  if (card.id === 'LQ01-071') v += 60;        /* 灵格涌涨：本回合你的单位 SR+1 */
  if (card.id === 'LQ01-068') v += 30;        /* 巨兽冲锋：+2/+0 并给践踏与冲锋 */
  return v;
}

function scorePlay(m, s) {
  var card = s.hand[m.i];
  if (!card) return -1e8;
  if (needsTarget(card) && (m.target === undefined || m.target === null)) return -1e8;
  var info = INFO[card.id];
  var role = info ? info.role : 'body';
  if (role === 'land') return scoreLand(card, s);
  if (role === 'mana') return scoreMana(card, s);
  if (role === 'fodder') return scoreFodder(card, s);
  if (role === 'body') return scoreBody(card, s);
  if (role === 'clear' || role === 'wave') return scoreClear(card, s);
  if (role === 'dmg') return scoreDmg(card, m, s);
  if (role === 'buff') return scoreBuff(card, s);
  return 600 + num(card.atk) * 3 + num(card.imp) * 3;
}

/* ── 攻击评分 ─────────────────────────────────────────────────────────── */

function scoreAttack(m, s) {
  var u = findUnit(s.myB, m.uid);
  if (!u) return -1e8;
  if (m.target === 'face') {
    var imp = num(u.imp);
    if (imp <= 0) return -1e8;
    var v = 220 + imp * 16;
    if (s.oppLife <= imp) v += 6000;          /* 斩杀 */
    if (hasKw(u, '践踏')) v += 15;
    return v;
  }
  var t = findUnit(s.oppB, m.target);
  if (!t) return -1e8;
  var myAtk = num(u.atk), myHp = num(u.hp, 1);
  var tHp = effHp(t), tAtk = num(t.atk);
  var kill = myAtk >= tHp;
  var excess = myAtk - tHp;
  var v;
  if (kill) {
    v = 240 + unitVal(t) * 1.7;
    if (isGuard(t)) v += 80;                  /* 拆守卫 */
    if (hasKw(u, '践踏') && excess > 0) v += excess * 14;   /* 溢出转脸 */
    if (tAtk >= myHp) v -= 30 + unitVal(u) * 0.7;
  } else {
    v = -200;
    if (tAtk >= myHp) v -= 100;
  }
  return v;
}

/* ── 主决策 ───────────────────────────────────────────────────────────── */

function choose(view, moves) {
  var passMove = null, i;
  if (!moves || !moves.length) return null;
  for (i = 0; i < moves.length; i++) if (moves[i] && moves[i].type === 'pass') { passMove = moves[i]; break; }
  if (!passMove) passMove = moves[moves.length - 1];
  try {
    if (!view || !view.me) return passMove;
    if (view.over) return passMove;
    var s = snapshot(view);
    var best = null, bestScore = 0;

    /* 1) 灵体启动：森林先知·盖亚 启动免费 +2 法力，能解锁后续出牌时优先开 */
    var av = s.me.avatar;
    var avUsable = !av || !av.used;
    if (avUsable) {
      for (i = 0; i < moves.length; i++) {
        var am = moves[i];
        if (!am || am.type !== 'avatar') continue;
        var worth = false, h;
        for (h = 0; h < s.hand.length; h++) {
          var c = s.hand[h];
          if (!c || !c.cost) continue;
          var cn = num(c.cost.n);
          if (cn > 0 && cn <= s.res + 2) { worth = true; break; }
        }
        if (worth) {
          /* timing: early 的启动能力先开；late 的留到场面铺完再开 */
          var avScore = (av && av.timing === 'late') ? 860 : 5000;
          if (avScore > bestScore) { bestScore = avScore; best = am; }
        }
        break;
      }
    }

    /* 2) 升灵：只用廉价素材换，且净收益为正才做 */
    for (i = 0; i < moves.length; i++) {
      var ascM = moves[i];
      if (!ascM || ascM.type !== 'ascend') continue;
      var plan = planAscend(s, ascM.id);
      if (!plan || plan.net <= 0) continue;
      var ascScore = 4000 + plan.net * 10;
      if (ascScore > bestScore) { bestScore = ascScore; best = ascM; }
    }

    /* 3) 出牌 */
    for (i = 0; i < moves.length; i++) {
      var pm = moves[i];
      if (!pm || pm.type !== 'play') continue;
      var ps = scorePlay(pm, s);
      if (ps > bestScore) { bestScore = ps; best = pm; }
    }

    /* 4) 攻击 */
    for (i = 0; i < moves.length; i++) {
      var atM = moves[i];
      if (!atM || atM.type !== 'attack') continue;
      var as = scoreAttack(atM, s);
      if (as > bestScore) { bestScore = as; best = atM; }
    }

    if (!best || bestScore <= 0) return passMove;
    return best;
  } catch (e) {
    return passMove;
  }
}

/* ── 阻挡窗口 ─────────────────────────────────────────────────────────── */

/** 尽力找出正在攻击我的敌方单位；接口未承诺该字段，取不到就按未知处理 */
function findAttacker(view) {
  var opp = (view && view.opp) || {};
  var alt = (view && (view.attacker || view.attack || view.pendingAttack))
          || (opp.attacker || opp.attack || opp.pendingAttack);
  if (alt && typeof alt === 'object' && alt.atk !== undefined) return alt;
  var b = opp.board || [];
  for (var i = 0; i < b.length; i++) if (b[i] && b[i].attacked) return b[i];
  return null;
}

function block(view, bmoves) {
  var noBlock = null, i;
  if (!bmoves || !bmoves.length) return null;
  for (i = 0; i < bmoves.length; i++) if (bmoves[i] && bmoves[i].type === 'noBlock') { noBlock = bmoves[i]; break; }
  if (!noBlock) noBlock = bmoves[bmoves.length - 1];
  try {
    var myB = (view && view.me && view.me.board) || [];
    var atk = findAttacker(view);
    var aAtk = atk ? num(atk.atk) : 3;   /* 找不到攻击者就按中等威胁估 */
    var aHp = atk ? num(atk.hp, 1) : 3;
    var best = null, bestScore = 0;
    for (i = 0; i < bmoves.length; i++) {
      var bm = bmoves[i];
      if (!bm || bm.type !== 'block') continue;
      var u = findUnit(myB, bm.uid);
      if (!u) continue;
      var myAtk = num(u.atk), myHp = num(u.hp, 1);
      var v = 40;                              /* 挡住这一次就是赚 */
      if (myAtk >= aHp) v += 70;               /* 反杀换掉 */
      if (myHp > aAtk) v += 40;                /* 活下来把伤害吃下 */
      if (isGuard(u)) v += 25;                 /* 守卫本来就是强制目标 */
      v -= unitVal(u) * 1.2;                   /* 优先用便宜单位去挡 */
      if (v > bestScore) { bestScore = v; best = bm; }
    }
    if (best && bestScore > 0) return best;
    return noBlock;
  } catch (e) {
    return noBlock;
  }
}
