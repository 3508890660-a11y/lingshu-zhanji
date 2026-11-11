// agents/agent-mimov26pro.js —— 红 · 赤焰速攻
// 一段 JS 源码（非 ES 模块）：声明 meta / build / choose / block / respond。
// 纪律：不修改 view/moves/bmoves；不硬编码实例 uid；未知动作/空数组/异常数值一律安全兜底；
// 零 import / export / require；不访问 window / fs / 网络。
// 引擎实装口径（01 优先于卡面）：直击灵体按 IMP 结算；拉格纳光环给全体单位「冲锋」；
// 红色回合末弃光手牌再重抽 (10−激情)÷2（T5 起 0 张）→ 每回合必须把手牌倾泻干净。

const meta = {
  name: 'MIMO-v2.6-pro · 赤焰速攻',
  desc: '执行模型 mimo-v2.6-pro；颜色 红；策略 赤焰速攻；冲锋光环＋激情门槛不消耗，T1-T5 弃光窗口内倾泻冲锋单位与直伤，守卫/守护挡板用点杀拆掉',
  id: 'model:mimov26pro',
  color: '红'
};

// ============================ build ============================
// 30 张纯红（主色池）：冲锋打手 21 ＋ 点杀 6 ＋ 直伤 3；同名 ≤3，不依赖引擎回退。
function build(pool) {
  var want = [
    { id: 'LQ01-038', n: 3 }, // 怒火新兵   1费 2/1/1（IMP1 ＝ 脸伤 1）
    { id: 'LQ01-040', n: 3 }, // 暴走狂犬   2费 1/3/2（IMP3 ＝ 脸伤 3）
    { id: 'LQ01-051', n: 3 }, // 掷火散兵   2费 2/1/2（战吼烧 1）
    { id: 'LQ01-047', n: 3 }, // 燃焰卫士   2费 2/2/2（己方永久 +1/0）
    { id: 'LQ01-041', n: 3 }, // 烈阳断刃   2费瞬间 3 点单解
    { id: 'LQ01-043', n: 3 }, // 血斧掷颅手 3费 3/1/2（冲锋＋战吼烧 1）
    { id: 'LQ01-044', n: 3 }, // 烬原猛虎   3费 3/2/2（IMP2 ＝ 脸伤 2）
    { id: 'LQ01-052', n: 3 }, // 战鼓蛮兵   3费 3/2/2（全队本回合 IMP+1）
    { id: 'LQ01-048', n: 3 }, // 焚心咒     3费 4 点单解
    { id: 'LQ01-042', n: 3 }  // 焚天血咒   4费 4 点直伤
  ];
  var p = pool;
  if (Object.prototype.toString.call(p) !== '[object Array]') p = [];
  var have = {};
  for (var i = 0; i < p.length; i++) {
    var c = p[i];
    if (c && c.id) have[c.id] = c;
  }
  var list = [];
  var used = {};
  var total = 0;
  for (var j = 0; j < want.length; j++) {
    var id = want[j].id;
    var n = want[j].n;
    if (n > 3) n = 3;
    if (n < 1) n = 1;
    if (used[id] || !have[id]) continue;
    list.push({ id: id, n: n });
    used[id] = n;
    total += n;
  }
  // 兜底：若个别名目不在卡池，从卡池补齐到 30 张（同名 ≤3；避开自回收陷阱与零效果件）
  if (total < 30) {
    for (var k = 0; k < p.length && total < 30; k++) {
      var q = p[k];
      if (!q || !q.id || used[q.id]) continue;
      if (q.unsupported === true) continue;
      if (q.id === 'LQ01-288') continue; // 残响回收会自回收，是空转陷阱
      var t = q.type;
      if (t !== '单位' && t !== '法术' && t !== '瞬间' && t !== '地标' && t !== '结界') continue;
      var add = 30 - total;
      if (add > 3) add = 3;
      list.push({ id: q.id, n: add });
      used[q.id] = add;
      total += add;
    }
  }
  // 超额保护：从尾部裁回 30（正常构造不会触发）
  var s = 0;
  for (var m2 = 0; m2 < list.length; m2++) s += list[m2].n;
  while (s > 30 && list.length > 0) {
    var last = list[list.length - 1];
    if (last.n > 1) {
      last.n -= 1;
      s -= 1;
    } else {
      s -= last.n;
      list.pop();
    }
  }
  return list;
}

// ============================ 工具 ============================
function arr(x) {
  return Object.prototype.toString.call(x) === '[object Array]' ? x : [];
}
function num(v, d) {
  return (typeof v === 'number' && isFinite(v)) ? v : d;
}
function hasKw(u, name) {
  if (!u || !u.kw) return false;
  var kw = u.kw;
  for (var i = 0; i < kw.length; i++) {
    if (String(kw[i]) === name) return true;
  }
  return false;
}
function guardX(u) {
  if (hasKw(u, '守护2')) return 2;
  if (hasKw(u, '守护1')) return 1;
  return 0;
}
function findPass(moves) {
  for (var i = moves.length - 1; i >= 0; i--) {
    if (moves[i] && moves[i].type === 'pass') return moves[i];
  }
  return null;
}
function safeLast(moves) {
  if (!moves || moves.length === 0) return undefined;
  return findPass(moves) || moves[moves.length - 1];
}
function boardMap(board) {
  var m = {};
  var b = arr(board);
  for (var i = 0; i < b.length; i++) {
    if (b[i] && b[i].uid !== undefined && b[i].uid !== null) m[b[i].uid] = b[i];
  }
  return m;
}
function cardOf(view, m) {
  if (!m || typeof m.i !== 'number') return null;
  var hand = arr(view && view.me && view.me.hand);
  if (m.i < 0 || m.i >= hand.length) return null;
  return hand[m.i] || null;
}
function isCardId(card, id, name) {
  if (!card) return false;
  return card.id === id || card.name === name;
}
function isBurn(card) {
  return isCardId(card, 'LQ01-042', '焚天血咒');
}
function isPumpUnit(card) {
  return isCardId(card, 'LQ01-052', '战鼓蛮兵');
}
function isBuffUnit(card) {
  return isCardId(card, 'LQ01-047', '燃焰卫士');
}
function removalDmg(card) {
  if (isCardId(card, 'LQ01-048', '焚心咒')) return 4;
  if (isCardId(card, 'LQ01-041', '烈阳断刃')) return 3;
  return 0;
}
function isTrapCard(card) {
  return isCardId(card, 'LQ01-288', '残响回收');
}
function hasPendingAttacker(myBoard) {
  var b = arr(myBoard);
  for (var i = 0; i < b.length; i++) {
    var u = b[i];
    if (u && u.attacked !== true && u.frozen !== true) return true;
  }
  return false;
}

// 单步交换估值：dmg 打到 theirHp 上、theirAtk 打回 myHp
function duelValue(dmg, myHp, theirAtk, theirHp, threat) {
  var kills = dmg >= theirHp;
  var survives = theirAtk < myHp;
  if (kills && survives) return 3 + threat;
  if (kills && !survives) return 0.5 + threat * 0.3;
  if (!kills && survives) return 0.2;
  return -2;
}

// 对手 defaultBlock 的挡板打分：>0 就会来挡
function blockValueFor(b, u, oppLife, imp) {
  var kills = num(b.atk, 0) >= num(u.hp, 0);
  var dies = num(u.atk, 0) >= num(b.hp, 0);
  var v = 0;
  if (kills) v += 3;
  if (!dies) v += 2;
  if (dies && !kills) v -= 3;
  if (oppLife <= imp) v += 5;
  return v;
}

// ============================ choose ============================
function choose(view, moves) {
  try {
    return pickMove(view, moves);
  } catch (e) {
    return safeLast(moves);
  }
}

function pickMove(view, moves) {
  if (!moves || moves.length === 0) return undefined;
  var passM = findPass(moves);
  if (view && view.over) return passM || moves[moves.length - 1];

  var me = (view && view.me) || {};
  var opp = (view && view.opp) || {};
  var myBoard = arr(me.board);
  var oppBoard = arr(opp.board);
  var hand = arr(me.hand);
  var oppLife = num(opp.life, 99);

  // —— 动作分类（只读，不改原数组）——
  var plays = [];
  var attacks = [];
  var avatarM = null;
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i];
    if (!m || !m.type) continue;
    if (m.type === 'play') {
      if (m.mode === 'forge') continue;
      plays.push(m);
    } else if (m.type === 'attack') {
      if (m.avatar === true) continue;
      attacks.push(m);
    } else if (m.type === 'avatar') {
      avatarM = m;
    }
  }

  // —— 1) 直伤斩杀：焚天血咒独立致死就直接打 ——
  for (var b = 0; b < plays.length; b++) {
    var bc = cardOf(view, plays[b]);
    if (bc && isBurn(bc) && !isTrapCard(bc)) {
      if (oppLife > 0 && oppLife <= 4) return plays[b];
      break;
    }
  }

  // —— 2) 点杀：焚心咒 / 烈阳断刃，挑最有价值的目标 ——
  var rem = pickRemoval(view, plays, hand, oppBoard);
  if (rem) return rem;

  // —— 3) 倾泻手牌：红色回合末弃光，打出去永远好过弃掉 ——
  // 3a 先下无目标的单位与直伤（泵与 buff 牌排后，保证战吼泵吃满全场）
  var plain = pickPlay(view, plays, hand, function (card) {
    return !isPumpUnit(card) && !isBuffUnit(card) && removalDmg(card) === 0 && !isTrapCard(card);
  }, true, false);
  if (plain) return plain;

  // 3b 燃焰卫士：给 ATK 最高的单位永久 +1/0
  var buff = pickBuff(view, plays, hand, myBoard);
  if (buff) return buff;

  // 3c 战鼓蛮兵最后下：全队本回合 IMP+1 要吃满已进场单位
  var pump = pickPlay(view, plays, hand, isPumpUnit, true, false);
  if (pump) return pump;

  // 3d 兜底：其余还能打的牌
  var misc = pickPlay(view, plays, hand, function (card) { return !isTrapCard(card); }, true, null);
  if (misc) return misc;

  // —— 4) 灵体启动（全体 IMP+1）：牌打空后再开——启动要扣 1 点激情门槛 ——
  if (avatarM && hasPendingAttacker(myBoard)) return avatarM;

  // —— 5) 攻击 ——
  var atk = pickAttack(view, attacks, myBoard, oppBoard, oppLife);
  if (atk) return atk;

  return passM || moves[moves.length - 1];
}

// 通用出牌挑选：needTarget=true 只挑带目标的，false 只挑无目标的，null 不限
function pickPlay(view, plays, hand, pred, costAsc, needTarget) {
  var best = null;
  var bestCost = costAsc ? 1e9 : -1e9;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    if (!m) continue;
    var hasT = (m.target !== undefined && m.target !== null);
    if (needTarget === true && !hasT) continue;
    if (needTarget === false && hasT) continue;
    var card = hand[m.i];
    if (!card) continue;
    if (!pred(card, m)) continue;
    var c = num(card.cost && card.cost.n, 99);
    if (costAsc ? (c < bestCost) : (c > bestCost)) {
      bestCost = c;
      best = m;
    }
  }
  return best;
}

// 燃焰卫士：buff 目标选当前 ATK 最高的己方单位
function pickBuff(view, plays, hand, myBoard) {
  var best = null;
  var bestAtk = -1e9;
  var myMap = boardMap(myBoard);
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    if (!m) continue;
    var card = hand[m.i];
    if (!card || !isBuffUnit(card)) continue;
    if (m.target === undefined || m.target === null) continue;
    var u = myMap[m.target];
    if (!u) continue;
    var a = num(u.atk, 0);
    if (a > bestAtk) {
      bestAtk = a;
      best = m;
    }
  }
  return best;
}

// 点杀：能杀优先（守卫/守护/挡板加分），杀不掉也打最贵的目标（手牌反正要弃）
function pickRemoval(view, plays, hand, oppBoard) {
  var oppMap = boardMap(oppBoard);
  var best = null;
  var bestScore = -1e9;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    if (!m) continue;
    if (m.target === undefined || m.target === null) continue;
    var card = hand[m.i];
    var dmg = removalDmg(card);
    if (!dmg || isTrapCard(card)) continue;
    var t = oppMap[m.target];
    if (!t) continue;
    var hp = num(t.hp, 99);
    var kills = dmg >= hp;
    var score = (kills ? 20 : 0) + num(t.atk, 0) + num(t.imp, 0);
    if (hasKw(t, '守卫') || guardX(t) > 0) score += 8;
    if (t.attacked !== true) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

// ============================ 攻击 ============================
function pickAttack(view, attacks, myBoard, oppBoard, oppLife) {
  var myMap = boardMap(myBoard);
  var oppMap = boardMap(oppBoard);
  var best = null;
  var bestVal = 0.55;
  for (var i = 0; i < attacks.length; i++) {
    var m = attacks[i];
    if (!m) continue;
    var u = myMap[m.uid];
    if (!u) continue;
    var v = attackValue(m, u, oppMap, oppBoard, oppLife);
    if (v !== null && v > bestVal) {
      bestVal = v;
      best = m;
    }
  }
  return best;
}

function attackValue(m, u, oppMap, oppBoard, oppLife) {
  var atk = num(u.atk, 0);
  var imp = num(u.imp, 0);
  var hp = num(u.hp, 0);

  if (m.target === 'face') {
    // 守护拦截：引擎会挑「扛得住本次伤害、或斩杀期」里耐久最高的守护单位
    var bestG = null;
    for (var i = 0; i < oppBoard.length; i++) {
      var w = oppBoard[i];
      var x = guardX(w);
      if (x <= 0) continue;
      if (Math.max(0, atk - x) < num(w.hp, 99) || oppLife <= imp) {
        if (!bestG || num(w.hp, 0) > num(bestG.hp, 0)) bestG = w;
      }
    }
    if (bestG) {
      return duelValue(Math.max(0, atk - guardX(bestG)), hp, num(bestG.atk, 0), num(bestG.hp, 0),
        num(bestG.atk, 0) + num(bestG.imp, 0)) - 0.5;
    }
    // 挡板预测：对手 defaultBlock 在打分 >0 时就会挡 → 取最坏交换估值
    var blocked = false;
    var worst = 1e9;
    for (var j = 0; j < oppBoard.length; j++) {
      var b = oppBoard[j];
      if (b.attacked === true) continue; // 已攻击的单位本回合不能再挡
      if (blockValueFor(b, u, oppLife, imp) > 0) {
        blocked = true;
        var cv = duelValue(atk, hp, num(b.atk, 0), num(b.hp, 0), num(b.atk, 0) + num(b.imp, 0));
        if (cv < worst) worst = cv;
      }
    }
    if (!blocked) {
      var v = imp;
      if (oppLife > 0 && imp >= oppLife) v += 100; // 直击斩杀最优先
      return v;
    }
    return worst;
  }

  // 单位目标：直接交换
  var t = oppMap[m.target];
  if (!t) return null;
  return duelValue(atk, hp, num(t.atk, 0), num(t.hp, 0), num(t.atk, 0) + num(t.imp, 0));
}

// ============================ block ============================
// 不知道攻击者是谁（接口不暴露）：只做两种有把握的阻挡——
//   1) 绝对优势阻挡者（杀光对面一切且自己死不了）＝ 白赚；
//   2) 危险血线用最没价值的单位垫刀保命；
//   其余不挡：红色是竞速方，单位就是输出。
function block(view, bmoves) {
  try {
    if (!bmoves || bmoves.length === 0) return undefined;
    var nb = null;
    var bs = [];
    for (var i = 0; i < bmoves.length; i++) {
      var m = bmoves[i];
      if (!m) continue;
      if (m.type === 'noBlock') nb = m;
      else if (m.type === 'block') bs.push(m);
    }
    var fallback = nb || bmoves[bmoves.length - 1];
    if (!bs.length) return fallback;

    var myBoard = arr(view && view.me && view.me.board);
    var oppBoard = arr(view && view.opp && view.opp.board);
    var myLife = num(view && view.me && view.me.life, 20);
    var myMap = boardMap(myBoard);

    var cands = [];
    for (var j = 0; j < bs.length; j++) {
      var u = myMap[bs[j].uid];
      if (u) cands.push({ m: bs[j], u: u });
    }
    if (!cands.length) return fallback;

    for (var k = 0; k < cands.length; k++) {
      if (isDominant(cands[k].u, oppBoard)) return cands[k].m;
    }

    var maxImp = 0;
    for (var q = 0; q < oppBoard.length; q++) {
      var im = num(oppBoard[q].imp, 0);
      if (im > maxImp) maxImp = im;
    }
    if (myLife <= Math.max(4, maxImp)) {
      var worstM = null;
      var worstVal = Infinity;
      for (var w = 0; w < cands.length; w++) {
        var uu = cands[w].u;
        var val = (num(uu.atk, 0) + num(uu.imp, 0)) * 100 - num(uu.hp, 0);
        if (val < worstVal) {
          worstVal = val;
          worstM = cands[w].m;
        }
      }
      if (worstM) return worstM;
    }
    return fallback;
  } catch (e) {
    return bmoves && bmoves.length ? bmoves[bmoves.length - 1] : undefined;
  }
}

function isDominant(u, oppBoard) {
  var b = arr(oppBoard);
  if (!b.length) return false;
  for (var i = 0; i < b.length; i++) {
    var e = b[i];
    if (!e) continue;
    if (num(u.atk, 0) < num(e.hp, 0)) return false;
    if (num(e.atk, 0) >= num(u.hp, 0)) return false;
  }
  return true;
}

// ============================ respond ============================
// 只在攻击响应窗口出手：烈阳断刃 3 点把攻击者点死，伤害不落。
// 用 name+身材 唯一匹配攻击者 uid（ctx 不暴露 uid）；认不出就放过，绝不乱打。
function respond(view, ctx, moves) {
  try {
    if (!moves || moves.length === 0) return undefined;
    var fallback = safeLast(moves);
    if (!ctx || ctx.kind !== 'attack') return fallback;
    var atk = ctx.attacker;
    if (!atk) return fallback;

    var myLife = num(view && view.me && view.me.life, 20);
    var aHp = num(atk.hp, 99);
    if (aHp > 3) return fallback; // 烈阳断刃只有 3 点，杀不掉不浪费

    var isFace = ctx.target === 'face';
    var threat = isFace ? num(atk.imp, 0) : num(atk.atk, 0);
    var worth = threat >= 2 || myLife <= threat || myLife <= 5;
    if (!worth) return fallback;

    var uid = matchAttackerUid(view, atk);
    if (uid === undefined || uid === null) return fallback;

    var hand = arr(view && view.me && view.me.hand);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!m || m.type !== 'respond') continue;
      var card = hand[m.i];
      if (!isCardId(card, 'LQ01-041', '烈阳断刃')) continue;
      if (m.target === uid) return m;
    }
    return fallback;
  } catch (e) {
    return moves && moves.length ? safeLast(moves) : undefined;
  }
}

function matchAttackerUid(view, atk) {
  var oppBoard = arr(view && view.opp && view.opp.board);
  var found = null;
  var count = 0;
  for (var i = 0; i < oppBoard.length; i++) {
    var u = oppBoard[i];
    if (!u || u.uid === undefined || u.uid === null) continue;
    if (u.name === atk.name &&
      num(u.atk, -1) === num(atk.atk, -2) &&
      num(u.imp, -1) === num(atk.imp, -2) &&
      num(u.hp, -1) === num(atk.hp, -2)) {
      found = u.uid;
      count++;
    }
  }
  return count === 1 ? found : null;
}
