// ============================================================================
// 灵枢战纪 · AI 脚本（第 5 轮 · 组卡阶段）
// 显示名：step5preview ｜ 执行模型：step-5-preview ｜ 主色：绿
// 策略名：苍林践踏（地标 ramp · 中质单位 · 践踏巨兽＋外枢升灵）
// ----------------------------------------------------------------------------
// 构筑（30 张 / 16 名目，绿 + 灰，同名 ≤3）：
//   1费 幼叶之池×3  祭品石×3(灰)  盖亚幼株×3  蜉蝣食菌虻×1
//   2费 母神共鸣地×3  摇篮藤根×2  石肤守卫×1(灰)  荆棘绞杀×2  逆流×2(灰)
//   3费 落叶风暴×2  林冠漫步者×2  猎杀弱肉×1
//   4费 荒原猛犸×2  藤海怒涛×1
//   5费 裂地巨犀×1   6费 林冠泰坦×1
// 外枢（引擎按色自动配给，build 不可选）：巨木之心 6/4/7(SR3)｜苍林守望 5/5/8(SR3)｜兽王之魂 7/6/6(SR5)
// 灵体（默认 A 流派）：森林先知·盖亚——被动回合开始 +1 法力；启动（免费）+2 法力。
//
// 资源口径（01 §3）：绿 法力 = 2 + 地标数（消耗型）；回合开始不抽牌，回合末补至 地标数+1；
//   引擎实装「地标进场立即返费」：幼叶之池 +1／母神共鸣地 +2／祭品石 +2，祭品石为净赚 1 的 ramp。
//   配合灵体每回合 +3 法力，T3 即有 7~8 法力，曲线被显著压缩。
//
// 决策优先级（choose）：① 斩杀检查 → ② 灵体启动（免费 +2）→ ③ 升灵（素材按 SR
//   从小到大自动凑，只在吃掉的是可弃素材时宣告）→ ④ 出牌（地标 ramp > 解场 > 优质
//   单位，逐张评分）→ ⑤ 攻击（imp≥2 与践踏必打脸；守卫/1 冲击小怪在对方有攻击力时
//   留挡）→ ⑥ pass。block 按「免伤 IMP ＋ 击杀价值 − 阵亡损失 − 大单位机会成本」
//   评分；respond 仅用逆流反制对手高价值法术/结界/大单位（残余法力回合末即废，
//   反制等于免费）。
// ============================================================================

var meta = {
  name: 'step5preview · 苍林践踏',
  desc: '执行模型 step-5-preview；颜色 绿；策略 苍林践踏；地标 ramp 全规划曲线（祭品石/幼叶之池/母神共鸣地＋盖亚灵体每回合 +3 法力），T2 摇篮藤根/石肤守卫＋落叶风暴/荆棘绞杀扛快攻，T4~T6 践踏三连滚雪球，T4 起升灵巨木之心、T6 起兽王之魂终结；逆流留作响应反制。',
  id: 'model:step5preview',
  color: '绿'
};

// ---------------------------------------------------------------------------
// build(pool)：pool 已按主色（绿）+ 灰过滤。硬编码 16 名目；缺名目时用池内
// 剩余卡按「单位优先、低费优先」补足 30 张（同名 ≤3）。
// ---------------------------------------------------------------------------
function build(pool) {
  var arr = Array.isArray(pool) ? pool : [];
  var plan = [
    ['LQ01-056', 3], // 幼叶之池（地标1：进场 +1 法力，此后每回合 +1）
    ['LQ01-298', 3], // 祭品石（灰·地标1：进场 +2 法力，净赚 1）
    ['LQ01-055', 3], // 盖亚幼株（1/1/1 成长；SR1 升灵素材）
    ['LQ01-069', 1], // 蜉蝣食菌虻（1/1/1，进场 +1 法力；SR1 素材）
    ['LQ01-061', 3], // 母神共鸣地（地标2：进场 +2 法力）
    ['LQ01-057', 2], // 摇篮藤根（1/2/3 守卫）
    ['LQ01-292', 1], // 石肤守卫（灰 1/2/3 守卫）
    ['LQ01-058', 2], // 荆棘绞杀（法力2：对 1 个单位 3 伤）
    ['LQ01-296', 2], // 逆流（灰·瞬间2：反击——留给 respond 窗口）
    ['LQ01-060', 2], // 落叶风暴（法力3：敌方全场 2 伤）
    ['LQ01-063', 2], // 林冠漫步者（2/2/3，引擎实装进场 +1/+1 → 3/3/4）
    ['LQ01-059', 1], // 猎杀弱肉（2/1/2，战吼破坏 ATK≤2 的单位）
    ['LQ01-065', 2], // 荒原猛犸（4/3/4 践踏）
    ['LQ01-072', 1], // 藤海怒涛（法力4：敌方全场 3 伤＋回复 1）
    ['LQ01-066', 1], // 裂地巨犀（5/4/5 践踏）
    ['LQ01-067', 1]  // 林冠泰坦（6/5/6 践踏·再生）
  ];
  var out = [], i, j;
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
      var cn = (c.cost && typeof c.cost.n === 'number') ? c.cost.n : 9;
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
// 工具函数（纯只读，不修改 view / moves；排序一律先 slice）
// ---------------------------------------------------------------------------
function num(x, d) { return (typeof x === 'number' && isFinite(x)) ? x : (d || 0); }
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
function hasKw(unit, kw) {
  return !!(unit && Array.isArray(unit.kw) && unit.kw.indexOf(kw) >= 0);
}
function costOf(c) { return (c && c.cost && typeof c.cost.n === 'number') ? c.cost.n : 0; }
function textOf(c) { return (c && typeof c.text === 'string') ? c.text : ''; }
function unitVal(u) { return num(u && u.atk, 0) + num(u && u.imp, 0) * 1.2 + num(u && u.hp, 0) * 1.1; }

// 本构筑单位的 SR（升灵素材按 SR 从小到大被引擎自动凑走；view 的 board 不暴露 sr/id，按名映射）
var SR_BY_NAME = {
  '盖亚幼株': 1, '蜉蝣食菌虻': 1, '灵基苗床': 1,
  '摇篮藤根': 2, '石肤守卫': 2,
  '林冠漫步者': 3, '猎杀弱肉': 3,
  '荒原猛犸': 4,
  '裂地巨犀': 5,
  '林冠泰坦': 6
};
function srOfUnit(u) {
  if (!u) return 0;
  var n = (typeof u.name === 'string') ? u.name : '';
  if (Object.prototype.hasOwnProperty.call(SR_BY_NAME, n)) return SR_BY_NAME[n];
  return 3; // 未知单位按中值保守估计
}
/** 模拟引擎 pickMaterials：返回被吃素材的最大 SR；凑不够返回 -1 */
function simulateMaterials(board, need) {
  var arr = board.slice();
  arr.sort(function (a, b) { return srOfUnit(a) - srOfUnit(b); });
  var sum = 0, maxSr = 0;
  for (var i = 0; i < arr.length && sum < need; i++) {
    var s = srOfUnit(arr[i]);
    sum += s;
    if (s > maxSr) maxSr = s;
  }
  return (sum >= need) ? maxSr : -1;
}

// ---------------------------------------------------------------------------
// 升灵决策：巨木之心（SR3，6/4/7，降临 +2 法力抽 1）优先，兽王之魂（SR5，7/6/6，
// 全体 +1 ATK）其后。只在「吃掉的都是可弃素材」时宣告——早期保场面密度挡快攻，
// 不吃 4 费以上的践踏主力。
// ---------------------------------------------------------------------------
function pickAscend(moves, myB, round) {
  var want266 = null, want268 = null, i;
  for (i = 0; i < moves.length; i++) {
    var m = moves[i];
    if (!m || m.type !== 'ascend') continue;
    if (m.id === 'LQ01-266') want266 = m;
    else if (m.id === 'LQ01-268') want268 = m;
  }
  if (want266) {
    var maxSr = simulateMaterials(myB, 3);
    if (maxSr >= 0) {
      var ok = (maxSr <= 1 && (round >= 4 || myB.length >= 5))  // 纯 1 费素材：中后期或场面厚时随便吃
        || (maxSr === 2 && round >= 3)                          // 吃到 SR2 守卫：第 3 回合起可接受
        || (maxSr === 3 && round >= 5)                          // 吃到 SR3：第 5 回合起
        || (maxSr >= 4 && round >= 9);                          // 吃到践踏主力：只在大后期
      if (ok) return want266;
    }
  }
  if (want268) {
    var maxSr2 = simulateMaterials(myB, 5);
    if (maxSr2 >= 0) {
      var ok2 = (maxSr2 <= 2 && round >= 6)
        || (maxSr2 === 3 && round >= 8)
        || (maxSr2 >= 4 && round >= 10);
      if (ok2) return want268;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// choose(view, moves)：main 阶段每次要一个动作，返回 moves 内对象引用。
// ---------------------------------------------------------------------------
function choose(view, moves) {
  try {
    if (!view || !Array.isArray(moves) || !moves.length) return null;
    var me = view.me || {};
    var opp = view.opp || {};
    var round = num(view.round, 1);
    var myB = boardOf(me), opB = boardOf(opp);
    var i;

    // 1) 斩杀：可打脸 IMP 合计 ≥ 对手生命 → 直接打脸
    var faceAtks = [];
    for (i = 0; i < moves.length; i++) {
      if (moves[i] && moves[i].type === 'attack' && moves[i].target === 'face') faceAtks.push(moves[i]);
    }
    if (faceAtks.length) {
      var dmg = 0, seen = {};
      for (i = 0; i < faceAtks.length; i++) {
        var fuid = faceAtks[i].uid;
        if (seen[fuid]) continue;
        seen[fuid] = 1;
        var fu = uidIn(fuid, myB);
        if (fu) dmg += num(fu.imp, 0);
      }
      if (dmg >= num(opp.life, 20)) return faceAtks[0];
    }

    // 2) 灵体启动：盖亚（免费 +2 法力，timing 'early'）——每回合最先用，换成本回合费用
    if (me.avatar && !me.avatar.used && me.avatar.timing !== 'late') {
      for (i = 0; i < moves.length; i++) if (moves[i] && moves[i].type === 'avatar') return moves[i];
    }

    // 3) 升灵（素材足够即可宣告；引擎自动从 SR 最小的单位开始凑）
    var asc = pickAscend(moves, myB, round);
    if (asc) return asc;

    // 4) 出牌：对本回合所有可打手牌评分，取最高分
    var best = null, bestV = 0.9;
    for (i = 0; i < moves.length; i++) {
      var mv = moves[i];
      if (!mv || mv.type !== 'play' || typeof mv.i !== 'number') continue;
      var card = (me.hand && me.hand[mv.i]) || null;
      if (!card) continue;
      var v = playScore(view, card, mv, myB, opB);
      if (v > bestV) { bestV = v; best = mv; }
    }
    if (best) return best;

    // 5) 攻击
    var atk = pickAttack(myB, opB, moves);
    if (atk) return atk;

    // 6) 'late' 时机灵体（铺完场再开的群体增益）留到最后；盖亚为 early，不会走到这
    if (me.avatar && !me.avatar.used && me.avatar.timing === 'late') {
      for (i = 0; i < moves.length; i++) if (moves[i] && moves[i].type === 'avatar') return moves[i];
    }

    return findPass(moves);
  } catch (e) {
    return findPass(moves);
  }
}

// ---------------------------------------------------------------------------
// 出牌评分：地标 ramp 优先；解场按「能杀掉什么」计价；单位按身材＋关键词；
// 瞬间（逆流）主阶段不打，留给 respond 反制窗口。
// ---------------------------------------------------------------------------
function playScore(view, card, mv, myB, opB) {
  var cost = costOf(card);
  var lands = (view.me.lands && view.me.lands.length) || 0;
  var life = num(view.me.life, 20);

  if (card.type === '地标') {
    var s = 10 - lands * 0.8;          // 地标越多边际越低
    if (card.id === 'LQ01-298') s += 2;  // 祭品石：进场 +2，净赚 1
    if (card.id === 'LQ01-061') s += 1;  // 母神共鸣地：进场 +2
    if (card.id === 'LQ01-056') s += 0.5;
    if (lands >= 7) s -= 2;
    return s;
  }

  if (card.type === '单位') {
    var v = num(card.atk, 0) + num(card.imp, 0) * 1.2 + num(card.hp, 0) * 1.1;
    var kw = card.kw || [];
    if (kw.indexOf('践踏') >= 0) v += 2.2;
    if (kw.indexOf('守卫') >= 0) v += opB.length ? 2.5 : 0.6;
    if (kw.indexOf('成长') >= 0) v += 2.2;
    if (kw.indexOf('再生') >= 0) v += 1.2;
    if (kw.indexOf('冲锋') >= 0) v += 1.5;
    if (kw.indexOf('圣盾') >= 0) v += 1.5;
    // 战吼去除（猎杀弱肉：破坏 1 个 ATK≤2 的单位，引擎取最大的一只）
    var eff = card.effects || [];
    for (var i = 0; i < eff.length; i++) {
      if (eff[i] && eff[i].do === 'destroyWeak') {
        var tv = 0;
        for (var q = 0; q < opB.length; q++) {
          var o = opB[q];
          if (o && num(o.atk, 0) <= num(eff[i].maxAtk, 2)) {
            var ov = unitVal(o);
            if (ov > tv) tv = ov;
          }
        }
        if (tv > 0) v += 3 + Math.min(5, tv * 0.55);
      }
    }
    v += Math.max(0, 4 - cost) * 0.5;   // 轻微低费偏好：保证费用花得完
    return v;
  }

  if (card.type === '法术') {
    var eff2 = card.effects || [];
    var aoeN = 0, dmgN = 0, healN = 0;
    for (var w = 0; w < eff2.length; w++) {
      var e = eff2[w];
      if (!e) continue;
      if (e.do === 'aoe' && e.side === 'enemy') aoeN = Math.max(aoeN, num(e.n, 0));
      else if (e.do === 'dmg') dmgN = Math.max(dmgN, num(e.n, 0));
      else if (e.do === 'heal') healN = Math.max(healN, num(e.n, 0));
    }
    if (aoeN > 0) {
      var hit = 0, hv = 0;
      for (var r = 0; r < opB.length; r++) {
        var ou = opB[r];
        if (ou && num(ou.hp, 0) <= aoeN) { hit++; hv += unitVal(ou); }
      }
      var s2 = (hit >= 2) ? (7 + hit * 3 + hv * 0.25)
        : (hit === 1 ? (4 + hv * 0.6) : 0.8);   // 零命中不值得交这张牌
      if (healN > 0 && life <= 15) s2 += 1.5;
      return s2;
    }
    if (dmgN > 0) {
      var t = (mv && typeof mv.target === 'string') ? uidIn(mv.target, opB) : null;
      if (t) return (num(t.hp, 0) <= dmgN) ? (4.5 + unitVal(t) * 0.8) : 0.85;  // 打不死就留着
      return 0.8;
    }
    if (card.type === '瞬间') return 0.3;   // 逆流：留给 respond
    return 3;
  }

  if (card.type === '结界') return 4.5;
  return 0.5;
}

// ---------------------------------------------------------------------------
// 攻击决策：imp≥2 或践踏必打脸；守卫与 1 冲击小怪在对方有攻击力时留下阻挡
// （本引擎攻击过的单位在下个对手回合不能阻挡——attacked 只在己方 start 重置）。
// 被对方守卫强制打单位时，只做划算交换。
// ---------------------------------------------------------------------------
function pickAttack(myB, opB, moves) {
  var faces = [], unitAtks = [], i;
  for (i = 0; i < moves.length; i++) {
    var m = moves[i];
    if (!m || m.type !== 'attack') continue;
    if (m.target === 'face') faces.push(m);
    else unitAtks.push(m);
  }
  var oppAtkSum = 0;
  for (i = 0; i < opB.length; i++) oppAtkSum += num(opB[i] && opB[i].atk, 0);

  if (faces.length) {
    for (i = 0; i < faces.length; i++) {
      var u = uidIn(faces[i].uid, myB);
      if (!u) continue;
      var imp = num(u.imp, 0);
      if (imp >= 2 || hasKw(u, '践踏')) return faces[i];
      if (hasKw(u, '守卫')) { if (oppAtkSum <= 1) return faces[i]; }
      else if (oppAtkSum <= 3) return faces[i];
    }
  }
  // 被守卫锁定的交换：能击杀且存活 → 打；能击杀但会死 → 只在目标有价值时打
  var best = null, bestV = 3.0;
  for (i = 0; i < unitAtks.length; i++) {
    var a = uidIn(unitAtks[i].uid, myB);
    var d = uidIn(unitAtks[i].target, opB);
    if (!a || !d) continue;
    var kills = num(a.atk, 0) >= num(d.hp, 0);
    var dies = num(d.atk, 0) >= num(a.hp, 0);
    var v = (kills ? 3 : 0) + (dies ? -2.5 : 2) + (num(d.atk, 0) + num(d.imp, 0)) * 0.25;
    if (v > bestV) { bestV = v; best = unitAtks[i]; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// block(view, bmoves)：阻挡窗口。攻击者识别——对手场上 attacked=true 的单位
// （宣告即置位；多个已攻击单位并存时取 IMP 最大者的最坏估计）。
// 评分：免伤 IMP ＋ 击杀×0.8价值 − 阵亡×0.7价值 − 挡箭牌机会成本×0.3；
// 不挡就死（life ≤ 攻击者 IMP）重罚。
// ---------------------------------------------------------------------------
function block(view, bmoves) {
  try {
    var arr = Array.isArray(bmoves) ? bmoves : [];
    var blocks = [], noBlock = null, i;
    for (i = 0; i < arr.length; i++) {
      if (!arr[i]) continue;
      if (arr[i].type === 'block' && typeof arr[i].uid === 'string') blocks.push(arr[i]);
      else if (arr[i].type === 'noBlock') noBlock = arr[i];
    }
    var fallback = noBlock || (blocks.length ? blocks[0] : (arr.length ? arr[arr.length - 1] : null));
    if (!blocks.length || !view) return fallback;
    var me = view.me || {}, opp = view.opp || {};
    var myB = boardOf(me), opB = boardOf(opp);
    var life = num(me.life, 20);

    var cands = [];
    for (i = 0; i < opB.length; i++) if (opB[i] && opB[i].attacked) cands.push(opB[i]);
    if (!cands.length) {
      // 识别不到攻击者：仅低血量保命，挡耐久最高的单位
      if (life <= 8) {
        var bh = -1, bu = null;
        for (i = 0; i < blocks.length; i++) {
          var u0 = uidIn(blocks[i].uid, myB);
          if (u0 && num(u0.hp, 0) > bh) { bh = num(u0.hp, 0); bu = blocks[i]; }
        }
        return bu || fallback;
      }
      return fallback;
    }

    // 对手一回合可以攻击多次：场上 attacked=true 的单位里，当前攻击者无法从
    // view 直接区分（已结算的同样带 attacked）。对每个候选攻击者取最坏估值，
    // 再挑「最坏情况下依然划算」的挡路。
    var best = null, bestWorst = 0.5;
    for (i = 0; i < blocks.length; i++) {
      var b = uidIn(blocks[i].uid, myB);
      if (!b) continue;
      var worst = Infinity;
      for (var c = 0; c < cands.length; c++) {
        var v = blockValue(b, cands[c], life);
        if (v < worst) worst = v;
      }
      if (worst > bestWorst) { bestWorst = worst; best = blocks[i]; }
    }
    return best || fallback;
  } catch (e) {
    var a2 = Array.isArray(bmoves) ? bmoves : [];
    for (var k = 0; k < a2.length; k++) if (a2[k] && a2[k].type === 'noBlock') return a2[k];
    return a2.length ? a2[a2.length - 1] : null;
  }
}

/** 单个阻挡方案的估值：免伤 IMP ＋ 击杀价值 − 阵亡损失 − 大单位机会成本；不挡就死重罚 */
function blockValue(b, atk, life) {
  var aAtk = num(atk.atk, 0), aHp = num(atk.hp, 0), aImp = num(atk.imp, 0);
  var bAtk = num(b.atk, 0), bHp = num(b.hp, 0);
  var kills = bAtk >= aHp;
  var dies = aAtk >= bHp;
  var prevented = aImp;
  // 践踏攻击者被挡死时仍有溢出：免伤 = IMP − 溢出
  if (dies && hasKw(atk, '践踏')) prevented = Math.max(0, aImp - Math.max(0, aAtk - bHp));
  return prevented
    + (kills ? unitVal(atk) * 0.8 : 0)
    - (dies ? unitVal(b) * 0.7 : 0)
    - unitVal(b) * 0.3                   // 大单位当挡箭牌的机会成本
    + (life <= aImp ? 8 : 0);            // 不挡就死
}

// ---------------------------------------------------------------------------
// respond(view, ctx, moves)：响应链（03 §3.5）。只在对手宣告高价值法术/结界/
// 大单位时用「反击—无效化」类瞬间卡（逆流）反制；攻击窗口不响应（逆流的冻结
// 救不了当前这次攻击）。反制花的是回合末即废的残余法力，等于免费。
// ---------------------------------------------------------------------------
function respond(view, ctx, moves) {
  try {
    var arr = Array.isArray(moves) ? moves : [];
    var pass = null, i;
    for (i = 0; i < arr.length; i++) if (arr[i] && arr[i].type === 'pass') { pass = arr[i]; break; }
    if (!pass && arr.length) pass = arr[arr.length - 1];
    if (!ctx || ctx.kind !== 'play' || !ctx.card) return pass;
    var c = ctx.card;
    var hand = (view && view.me && Array.isArray(view.me.hand)) ? view.me.hand : [];
    var myBoardN = (view && view.me && Array.isArray(view.me.board)) ? view.me.board.length : 0;
    if (!worthCounter(c, myBoardN)) return pass;
    for (i = 0; i < arr.length; i++) {
      var mv = arr[i];
      if (!mv || mv.type !== 'respond' || typeof mv.i !== 'number') continue;
      var h = hand[mv.i];
      if (!h) continue;
      if (/反击/.test(textOf(h)) && /无效化/.test(textOf(h))) return mv;
    }
    return pass;
  } catch (e) {
    var a2 = Array.isArray(moves) ? moves : [];
    for (var k = 0; k < a2.length; k++) if (a2[k] && a2[k].type === 'pass') return a2[k];
    return a2.length ? a2[a2.length - 1] : null;
  }
}

function worthCounter(card, myBoardN) {
  var cost = costOf(card);
  var tx = textOf(card);
  if (card.type === '单位') {
    if (cost >= 3) return true;                          // 3 费以上的大单位
    if (num(card.atk, 0) + num(card.hp, 0) >= 5) return true;
    if (/复活|救赎|回归/.test(tx)) return true;            // 复活引擎（黑）
    return false;
  }
  if (card.type === '法术' || card.type === '结界') {
    if (/所有|全部|全体/.test(tx)) return myBoardN >= 1;   // AOE：我有单位就反
    if (/复活|救赎|破坏|放逐|遣返|回手|返回/.test(tx)) return true;
    if (/抽\s*[2-9]/.test(tx)) return true;                // 抽 2 以上的牌差
    if (/造成\s*[3-9]/.test(tx)) return true;              // 3 点以上的直伤/点杀
    return cost >= 3;
  }
  if (card.type === '装备') return cost >= 2;
  return false;
}
