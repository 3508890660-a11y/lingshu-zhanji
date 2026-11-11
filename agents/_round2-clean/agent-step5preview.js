/**
 * agent-step5preview.js
 * 执行模型 step-5-preview ｜ 主色：银 ｜ 策略：方阵共鸣·铺场升灵
 *
 * 构筑与决策依据仅来自 agents/brief/01_基本规则.md 与 02_卡表.md 的卡面文本：
 *   - 银为「门槛制不消耗」资源：共鸣 = max(1, 场上卡牌数 + 地标数)，回合开始快照；
 *     打牌不减少共鸣，因此每铺一场，下回合的费用上限就抬一档。
 *   - 每回合最多打出 3 张；回合末补至 min(max(共鸣,3),5)，抽牌流全十一色最厚。
 *   - 胜利方式：前期 1 费单位+衍生物铺场 → 方阵壁垒/升格逆鳞给全队永久增益 →
 *     集群爆破/终章齐鸣按共鸣等级解场 → 中后期连续升灵（外枢灵体）终局。
 */

var meta = {
  name: 'step5preview · 方阵共鸣·铺场升灵',
  desc: '执行模型 step-5-preview；颜色 银；策略 方阵共鸣·铺场升灵；共鸣门槛随场上单位与地标自成长，铺场叠加永久团队增益，中后期靠外枢升灵终结对局',
  id: 'model:step5preview',
  color: '银'
};

/* ── 卡组：银色门槛配方 8/11/8/2/1（合计 30，同名 ≤3） ── */
var DECK_PLAN = [
  { id: 'LQ01-145', n: 3 }, // 银翼列兵      共鸣1 1/1/1 集群1
  { id: 'LQ01-146', n: 3 }, // 银翼长枪兵    共鸣1 1/2/1 守卫
  { id: 'LQ01-147', n: 2 }, // 银翼枪骑兵    共鸣1 2/1/1 冲锋
  { id: 'LQ01-149', n: 3 }, // 方阵壁垒      共鸣2 抽1＋全队 +0/+1
  { id: 'LQ01-150', n: 3 }, // 征募长号      共鸣2 展现牌库顶至多 2 个银翼单位
  { id: 'LQ01-151', n: 3 }, // 银翼战马      共鸣2 2/1/2 战吼衍生物
  { id: 'LQ01-157', n: 2 }, // 谐振晶体      共鸣2 地标（计入共鸣）＋抽 1
  { id: 'LQ01-152', n: 2 }, // 银翼方阵圣盾  共鸣3 2/1/3 守护1
  { id: 'LQ01-156', n: 3 }, // 集群爆破      共鸣3 对 1 个单位造成等同共鸣的伤害
  { id: 'LQ01-161', n: 3 }, // 升格逆鳞      共鸣3 本回合升灵去除素材效果结算两次
  { id: 'LQ01-153', n: 1 }, // 银翼重装要塞  共鸣4 2/2/6 守卫
  { id: 'LQ01-158', n: 1 }, // 终章齐鸣      共鸣4 全体敌方 共鸣÷2（向上取整）
  { id: 'LQ01-162', n: 1 }  // 方阵巨像      共鸣5 5/4/6 灵基升格基底
];

function build(pool) {
  var have = {};
  var list = pool || [];
  for (var i = 0; i < list.length; i++) have[list[i].id] = list[i];
  var out = [], total = 0;
  for (var j = 0; j < DECK_PLAN.length; j++) {
    var p = DECK_PLAN[j];
    if (have[p.id]) { out.push({ id: p.id, n: p.n }); total += p.n; }
  }
  // 兜底：万一数据缺卡导致不足 30，用池内剩余单位补足（同名 ≤3）
  if (total < 30) {
    var used = {};
    for (var k = 0; k < out.length; k++) used[out[k].id] = out[k].n;
    for (var m = 0; m < list.length && total < 30; m++) {
      var c = list[m];
      if (!c || c.type !== '单位' || (used[c.id] || 0) >= 3) continue;
      var n = used[c.id] || 0;
      while (n < 3 && total < 30) { n++; total++; }
      var e = null;
      for (var q = 0; q < out.length; q++) if (out[q].id === c.id) e = out[q];
      if (e) e.n = n; else out.push({ id: c.id, n: n });
      used[c.id] = n;
    }
  }
  return out;
}

/* ── 小工具 ── */
function unitById(board, uid) {
  if (!board || uid === undefined || uid === null) return null;
  for (var i = 0; i < board.length; i++) if (board[i].uid === uid) return board[i];
  return null;
}
function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

/* 银色外枢灵体强度序：终焉巨械(279) > 旗舰·船首炮(280) > 魔导堡垒(278) */
var ASC_RANK = { 'LQ01-279': 3, 'LQ01-280': 2, 'LQ01-278': 1 };

/* ── 出牌评分：铺场与增益优先，解牌按目标价值决定是否出手 ── */
function scorePlay(card, view, move) {
  var oppBoard = (view.opp && view.opp.board) || [];
  var myBoard = (view.me && view.me.board) || [];
  var myLife = num(view.me && view.me.life);
  var lethalFoe = false;
  for (var i = 0; i < oppBoard.length; i++) {
    if (num(oppBoard[i].atk) >= myLife) { lethalFoe = true; break; }
  }
  switch (card.name) {
    case '集群爆破': // 点杀：只换高价值目标，或用于拆除下回合能打死我的单位
      if (lethalFoe) return 99;
      var t = unitById(oppBoard, move.target);
      if (!t) return 0;
      var threat = num(t.atk) + num(t.hp);
      return threat >= 4 ? 60 + threat : 0;
    case '终章齐鸣': // AOE：敌方 ≥2 个单位才开
      return oppBoard.length >= 2 ? 55 + 6 * oppBoard.length : 0;
    case '方阵壁垒': return 48;               // 抽 1＋全队永久 +0/+1
    case '升格逆鳞': return 46;               // 全队 +1/+1（卡面：升灵去除素材×2）
    case '征募长号': return 44;               // 一次两个单位
    case '银翼战马': return 42 + (myBoard.length < 4 ? 4 : 0);
    case '谐振晶体': return 40;               // 地标计入共鸣＝抬费用上限
    case '银翼枪骑兵': return 39;             // 冲锋，当回合可打脸
    case '银翼列兵': return 38;
    case '银翼长枪兵': return 38;
    case '银翼方阵圣盾': return 36;
    case '银翼重装要塞': return 34;
    case '方阵巨像': return 32;               // 5/4/6＋升格基底
    default:
      if (card.type === '单位') return 24 + num(card.atk) * 2 + num(card.hp);
      if (card.type === '地标') return 40;
      if (card.type === '法术' || card.type === '结界') return 20;
      return 12;
  }
}

function choose(view, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    var passMove = null;
    for (var z = 0; z < moves.length; z++) if (moves[z] && moves[z].type === 'pass') passMove = moves[z];
    var fallback = passMove || moves[moves.length - 1];
    var me = view.me || {};
    var opp = view.opp || {};
    var myBoard = me.board || [];
    var oppBoard = opp.board || [];

    /* 1) 斩杀：所有可打脸攻击的 IMP 合计 ≥ 对手生命 → 直接踢脸 */
    var faceSum = 0, faceCount = 0, firstFace = null;
    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      if (mv && mv.type === 'attack' && mv.target === 'face') {
        var u = unitById(myBoard, mv.uid);
        if (u) faceSum += num(u.imp);
        faceCount++;
        if (!firstFace) firstFace = mv;
      }
    }
    if (faceCount && faceSum >= num(opp.life)) return firstFace;

    /* 2) 致命威胁：敌方有单位攻击力 ≥ 我方生命，能反杀就先解掉 */
    var lethalFoe = null;
    for (var j = 0; j < oppBoard.length; j++) {
      if (num(oppBoard[j].atk) >= num(me.life)) { lethalFoe = oppBoard[j]; break; }
    }
    if (lethalFoe) {
      for (var k = 0; k < moves.length; k++) {
        var am = moves[k];
        if (!am || am.type !== 'attack' || am.target === 'face') continue;
        var au = unitById(myBoard, am.uid);
        if (au && am.target === lethalFoe.uid && num(au.atk) >= num(lethalFoe.hp)) return am;
      }
    }

    /* 3) 出牌：铺场 / 永久增益 / 地标 / 条件解场；低分手牌捏着不乱交 */
    var bar = (me.hand && me.hand.length >= 7) ? 0 : 19;
    var best = null, bestScore = bar;
    for (var m = 0; m < moves.length; m++) {
      var pm = moves[m];
      if (!pm || pm.type !== 'play' || typeof pm.i !== 'number') continue;
      var card = (me.hand || [])[pm.i];
      if (!card) continue;
      var s = scorePlay(card, view, pm);
      if (s > bestScore) { bestScore = s; best = pm; }
    }
    if (best) return best;

    /* 4) 灵体启动：银色灵体为衍生物或群体增益，铺完场再开不亏（每回合 1 次由 moves 过滤） */
    for (var a = 0; a < moves.length; a++) {
      if (moves[a] && moves[a].type === 'avatar') return moves[a];
    }

    /* 5) 攻击：能打脸就打脸；被守卫强制时只打「能换掉守卫」的有利交换 */
    if (firstFace) return firstFace;
    for (var b = 0; b < moves.length; b++) {
      var gm = moves[b];
      if (!gm || gm.type !== 'attack') continue;
      var gu = unitById(myBoard, gm.uid);
      var gf = unitById(oppBoard, gm.target);
      if (gu && gf && num(gu.atk) >= num(gf.hp)) return gm;
    }

    /* 6) 升灵：放在攻击之后，素材本回合还能输出；优先大号外枢灵体 */
    var asc = null, ascRank = 0;
    for (var c = 0; c < moves.length; c++) {
      var sm = moves[c];
      if (!sm || sm.type !== 'ascend') continue;
      var r = ASC_RANK[sm.id] || 1;
      if (r > ascRank) { ascRank = r; asc = sm; }
    }
    if (asc) return asc;

    /* 7) 结束回合 */
    return fallback;
  } catch (e) {
    return (moves && moves.length) ? moves[moves.length - 1] : { type: 'pass' };
  }
}

/* ── 阻挡窗口：优先反杀或挡大冲击；拿不到攻击者信息时用最廉价且耐久≥2 的单位兜 ── */
function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return { type: 'noBlock' };
    var noBlock = null, blocks = [];
    for (var i = 0; i < bmoves.length; i++) {
      var bm = bmoves[i];
      if (!bm) continue;
      if (bm.type === 'noBlock') noBlock = bm;
      else if (bm.type === 'block') blocks.push(bm);
    }
    var last = bmoves[bmoves.length - 1];
    if (!blocks.length) return noBlock || last;
    var me = (view && view.me) || {};
    var opp = (view && view.opp) || {};
    var myBoard = me.board || [];
    var atk = opp.attacker || opp.attacking || null;
    if (!atk && Array.isArray(opp.board)) {
      for (var j = 0; j < opp.board.length; j++) {
        var e = opp.board[j];
        if (e && (e.attacking || e.attacked)) { atk = e; break; }
      }
    }
    if (atk) {
      var aAtk = num(atk.atk), aImp = num(atk.imp), aHp = num(atk.hp);
      var soft = null;
      for (var k = 0; k < blocks.length; k++) {
        var u = unitById(myBoard, blocks[k].uid);
        if (!u) continue;
        if (num(u.atk) >= aHp) return blocks[k];                    // 能反杀，挡
        if (!soft && aAtk < num(u.hp) && aImp >= 3) soft = blocks[k]; // 挡大冲击且存活
      }
      if (soft) return soft;
      return noBlock || last;
    }
    var cheap = null;
    for (var m = 0; m < blocks.length; m++) {
      var cu = unitById(myBoard, blocks[m].uid);
      if (!cu || num(cu.hp) < 2) continue;
      if (!cheap || num(cu.atk) + num(cu.hp) < num(cheap.atk) + num(cheap.hp)) cheap = cu;
    }
    if (cheap) {
      for (var n = 0; n < blocks.length; n++) if (blocks[n].uid === cheap.uid) return blocks[n];
    }
    return noBlock || last;
  } catch (e) {
    return (bmoves && bmoves.length) ? bmoves[bmoves.length - 1] : { type: 'noBlock' };
  }
}
