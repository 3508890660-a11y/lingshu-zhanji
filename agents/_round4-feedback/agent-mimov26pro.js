// agents/agent-mimov26pro.js —— 绿 · 地脉践踏
// 一段 JS 源码（非 ES 模块）：声明 meta / build / choose / block。
// 纪律：不修改 view/moves/bmoves；不硬编码实例 uid；未知动作/空数组/异常数值一律安全兜底；
// 零 import / export / require；不访问 window / fs / 网络。

const meta = {
  name: 'MIMO-v2.6-pro · 地脉践踏',
  desc: '执行模型 mimo-v2.6-pro；颜色 绿；策略 地脉践踏；地标抬升法力与补牌，践踏巨兽把溢出伤害推到灵体',
  id: 'model:mimov26pro',
  color: '绿'
};

// ============================ build ============================
// 30 张纯绿：地标 7 / 低费动作 11 / 中期桥梁 7 / 践踏终端 5＋解场（见下）
// 同名 ≤3；全部为卡池内 LQ01 绿色卡；不依赖引擎回退。
function build(pool) {
  var want = [
    { id: 'LQ01-056', n: 3 }, // 幼叶之池   地标
    { id: 'LQ01-061', n: 3 }, // 母神共鸣地 地标
    { id: 'LQ01-057', n: 3 }, // 摇篮藤根   守卫（抗压墙）
    { id: 'LQ01-058', n: 3 }, // 荆棘绞杀   点杀
    { id: 'LQ01-068', n: 2 }, // 巨兽冲锋   爆发
    { id: 'LQ01-062', n: 1 }, // 涌泉林地   地标（引擎实打实的产源地标）
    { id: 'LQ01-063', n: 3 }, // 林冠漫步者 中期主力
    { id: 'LQ01-059', n: 2 }, // 猎杀弱肉   战吼解
    { id: 'LQ01-060', n: 2 }, // 落叶风暴   AoE2
    { id: 'LQ01-065', n: 3 }, // 荒原猛犸   践踏
    { id: 'LQ01-072', n: 1 }, // 藤海怒涛   AoE3＋回血
    { id: 'LQ01-066', n: 2 }, // 裂地巨犀   践踏
    { id: 'LQ01-067', n: 2 }  // 林冠泰坦   践踏再生
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
  // 兜底：若个别名目不在卡池，从卡池补齐到 30 张（同名 ≤3，只取单位/法术/地标/结界）
  if (total < 30) {
    for (var k = 0; k < p.length && total < 30; k++) {
      var q = p[k];
      if (!q || !q.id || used[q.id]) continue;
      if (q.unsupported === true) continue;
      var t = q.type;
      if (t !== '单位' && t !== '法术' && t !== '地标' && t !== '结界') continue;
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
function findPass(moves) {
  for (var i = moves.length - 1; i >= 0; i--) {
    if (moves[i] && moves[i].type === 'pass') return moves[i];
  }
  return null;
}
function safeLast(moves) {
  if (!moves || moves.length === 0) return undefined;
  var p = findPass(moves);
  return p || moves[moves.length - 1];
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
function cardCost(card) {
  return num(card && card.cost && card.cost.n, 99);
}
function isCard(card, id, name) {
  if (!card) return false;
  return card.id === id || card.name === name;
}
function effectsOf(card) {
  return (card && card.effects) ? card.effects : [];
}
function isRemoval(card) {
  if (isCard(card, 'LQ01-058', '荆棘绞杀')) return true;
  var e = effectsOf(card);
  for (var i = 0; i < e.length; i++) {
    if (e[i] && e[i].do === 'dmg' && e[i].target === 'enemyUnit') return true;
  }
  return false;
}
function isWeakKill(card) {
  return isCard(card, 'LQ01-059', '猎杀弱肉');
}
function aoePower(card) {
  if (isCard(card, 'LQ01-060', '落叶风暴')) return 2;
  if (isCard(card, 'LQ01-072', '藤海怒涛')) return 3;
  var e = effectsOf(card);
  for (var i = 0; i < e.length; i++) {
    if (e[i] && e[i].do === 'aoe') return num(e[i].n, 1);
  }
  return 0;
}
function isCharge(card) {
  return isCard(card, 'LQ01-068', '巨兽冲锋');
}

// 单步攻击的“折算直击值”：脸＝IMP；有践踏打单位＝溢出；无溢出的换子与白换单位给负值
function attackValue(a, myMap, oppMap) {
  if (!a) return null;
  var my = (a.uid !== undefined && a.uid !== null) ? myMap[a.uid] : null;
  if (!my) return null;
  if (a.target === 'face') return num(my.imp, 0);
  var t = oppMap[a.target];
  if (!t) return null;
  var atk = num(my.atk, 0);
  var thp = num(t.hp, 0);
  var tat = num(t.atk, 0);
  var mhp = num(my.hp, 0);
  var trample = hasKw(my, '践踏');
  var guard = hasKw(t, '守卫');
  var v = 0;
  if (trample) v = Math.max(0, atk - thp);
  var kills = atk >= thp;
  var survives = mhp > tat;
  if (kills && survives) v += 1;
  if (kills && !survives && (trample || guard)) v += 0.5;
  if (!kills && !trample) v -= 2;
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
  var myMap = boardMap(myBoard);
  var oppMap = boardMap(oppBoard);
  var oppLife = num(opp.life, 99);
  var myLife = num(me.life, 20);

  // —— 动作分类（只读）——
  var plays = [];
  var attacks = [];
  var avatarM = null;
  var ascendM = null;
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i];
    if (!m || !m.type) continue;
    if (m.type === 'play') {
      if (m.mode === 'forge') continue; // 非本色动作
      plays.push(m);
    } else if (m.type === 'attack') {
      attacks.push(m);
    } else if (m.type === 'avatar') {
      avatarM = m;
    } else if (m.type === 'ascend') {
      ascendM = m;
    }
  }

  // —— 攻击估值：每个单位取最优一步，合计折算直击 ——
  var bestAtk = null;
  var bestAtkVal = -1e9;
  var sumBest = {};
  for (var a1 = 0; a1 < attacks.length; a1++) {
    var am = attacks[a1];
    var v = attackValue(am, myMap, oppMap);
    if (v === null) continue;
    var key = 'u' + String(am.uid);
    if (sumBest[key] === undefined || v > sumBest[key]) sumBest[key] = v;
    if (v > bestAtkVal) {
      bestAtkVal = v;
      bestAtk = am;
    }
  }
  var totalBest = 0;
  for (var key2 in sumBest) {
    if (Object.prototype.hasOwnProperty.call(sumBest, key2)) {
      if (sumBest[key2] > 0) totalBest += sumBest[key2];
    }
  }
  var lethal = totalBest >= oppLife && oppLife > 0;

  // —— 阶段 1：斩杀 ——
  if (lethal) {
    var guardKill = pickRemoval(view, plays, oppMap, true);
    if (guardKill) return guardKill;
    var charge1 = pickCharge(view, plays, myMap);
    if (charge1) return charge1;
    if (bestAtk && bestAtkVal > 0) return bestAtk;
  }

  // —— 灵体启动：early 时机在展开前开（绿A 免费 +2 法力） ——
  if (avatarM && avatarIsEarly(view)) return avatarM;

  // —— 阶段 2：保场 / 关键解 ——
  var rem = pickRemoval(view, plays, oppMap, false);
  if (rem) return rem;
  var aoe = pickAoe(view, plays, oppBoard, myLife);
  if (aoe) return aoe;

  // —— 阶段 3：资源（地标先行：法力与补牌的双重引擎） ——
  var land = pickPlay(view, plays, function (card) {
    return card && card.type === '地标';
  }, true);
  if (land) return land;

  // —— 阶段 4：铺场（低血先下守卫；先大威胁后小填缝） ——
  var unit = pickUnit(view, plays, myLife);
  if (unit) return unit;

  // —— 阶段 5：爆发（巨兽冲锋给未攻击的最高攻单位） ——
  if (!lethal) {
    var charge2 = pickCharge(view, plays, myMap);
    if (charge2) return charge2;
  }

  // —— 阶段 5b：升灵是可选支线，仅素材冗余时接受 ——
  if (ascendM && myBoard.length >= 5) return ascendM;

  // —— 灵体启动：late / 兜底（攻击前收尾） ——
  if (avatarM) return avatarM;

  // —— 阶段 6：攻击推血（正收益才出手） ——
  if (bestAtk && bestAtkVal > 0) return bestAtk;

  // —— 未知类型动作兜底：仍可打出的牌按费用从低到高 ——
  var misc = pickPlay(view, plays, function () { return true; }, true);
  if (misc) return misc;

  // —— 阶段 7：pass ——
  return passM || moves[moves.length - 1];
}

function avatarIsEarly(view) {
  try {
    var av = view && view.me && view.me.avatar;
    return !!(av && av.timing === 'early');
  } catch (e) {
    return false;
  }
}

// 通用出牌挑选：pred 命中后按费用升/降序取一个
function pickPlay(view, plays, pred, costAsc) {
  var best = null;
  var bestCost = costAsc ? 1e9 : -1e9;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    if (!m) continue;
    var card = cardOf(view, m);
    if (!card) continue;
    if (!pred(card, m)) continue;
    var c = cardCost(card);
    if (costAsc ? (c < bestCost) : (c > bestCost)) {
      bestCost = c;
      best = m;
    }
  }
  return best;
}

// 点杀/战吼解：目标优先守卫与高威胁，必须"击杀或确有必要"才出
function pickRemoval(view, plays, oppMap, guardOnly) {
  var best = null;
  var bestScore = -1e9;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    if (!m) continue;
    var card = cardOf(view, m);
    if (!card) continue;
    var weak = isWeakKill(card);
    if (!weak && !isRemoval(card)) continue;
    if (m.target === undefined || m.target === null) continue;
    var e = oppMap[m.target];
    if (!e) continue;
    var isG = hasKw(e, '守卫');
    if (guardOnly && !isG) continue;
    var dmg = weak ? num(e.hp, 99) : 3;
    var kills = dmg >= num(e.hp, 99);
    if (!weak && !kills && num(e.atk, 0) < 4 && num(e.imp, 0) < 4 && !isG) continue;
    var score = (isG ? 20 : 0) + num(e.atk, 0) + num(e.imp, 0) + (kills ? 10 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

// AOE：对面铺开或能清掉关键数量时才砸
function pickAoe(view, plays, oppBoard, myLife) {
  var best = null;
  var bestN = 0;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    if (!m) continue;
    var card = cardOf(view, m);
    if (!card) continue;
    var n = aoePower(card);
    if (n <= 0) continue;
    var kills = 0;
    for (var j = 0; j < oppBoard.length; j++) {
      if (oppBoard[j] && num(oppBoard[j].hp, 99) <= n) kills++;
    }
    var want = (oppBoard.length >= 2 && kills >= 1) ||
      oppBoard.length >= 3 ||
      (myLife <= 6 && oppBoard.length >= 1 && kills >= 1);
    if (want && n > bestN) {
      bestN = n;
      best = m;
    }
  }
  return best;
}

// 巨兽冲锋：只给"本回合还能动"的最高攻单位（+2 攻益于践踏溢出或立即进攻）
function pickCharge(view, plays, myMap) {
  var best = null;
  var bestAtk = -1e9;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    if (!m) continue;
    var card = cardOf(view, m);
    if (!card) continue;
    if (!isCharge(card)) continue;
    if (m.target === undefined || m.target === null) continue;
    var u = myMap[m.target];
    if (!u) continue;
    if (u.attacked || u.frozen) continue;
    var a = num(u.atk, 0);
    if (a > bestAtk) {
      bestAtk = a;
      best = m;
    }
  }
  return best;
}

// 单位铺场：低血先守卫；4 费以上大威胁优先；其余按费用从低到高填缝
function pickUnit(view, plays, myLife) {
  var guardPick = null;
  var guardCost = 1e9;
  var bigPick = null;
  var bigCost = -1e9;
  var smallPick = null;
  var smallCost = 1e9;
  for (var i = 0; i < plays.length; i++) {
    var m = plays[i];
    if (!m) continue;
    var card = cardOf(view, m);
    if (!card || card.type !== '单位') continue;
    if (card.name === '猎杀弱肉' && m.target) {
      // 有战吼目标时先走解场通道，这里仍可作后备
    }
    var c = cardCost(card);
    if (hasKw(card, '守卫') && c < guardCost) {
      guardCost = c;
      guardPick = m;
    }
    if (c >= 4) {
      if (c > bigCost) {
        bigCost = c;
        bigPick = m;
      }
    } else if (c < smallCost) {
      smallCost = c;
      smallPick = m;
    }
  }
  if (myLife <= 10 && guardPick) return guardPick;
  if (bigPick) return bigPick;
  if (guardPick) return guardPick;
  return smallPick;
}

// ============================ block ============================
// 引擎未暴露攻击者与攻击目标：默认不挡，避免把有利交换挡坏。
// 生命 ≤12（竞速危险区）且场上 ≥2 个单位时，用进攻价值最低（ATK+IMP 最小、耐久高者优先）
// 的单位垫刀吸收伤害——绿色补牌＝地标数＋1，小单位是可再生资源，保命换输出是正期望。
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
    var myLife = num(view && view.me && view.me.life, 20);
    var myBoard = arr(view && view.me && view.me.board);
    if (myLife <= 12 && myBoard.length >= 2 && bs.length > 0) {
      var myMap = boardMap(myBoard);
      var best = null;
      var bestVal = 1e9;
      for (var j = 0; j < bs.length; j++) {
        var u = myMap[bs[j].uid];
        if (!u) continue;
        // 进攻价值越低越适合拿来垫刀；同分时耐久高者更能活下来复用
        var val = (num(u.atk, 0) + num(u.imp, 0)) * 100 - num(u.hp, 0);
        if (val < bestVal) {
          bestVal = val;
          best = bs[j];
        }
      }
      if (best) return best;
    }
    return nb || bmoves[bmoves.length - 1];
  } catch (e) {
    return bmoves && bmoves.length ? bmoves[bmoves.length - 1] : undefined;
  }
}
