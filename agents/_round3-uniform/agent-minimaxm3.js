/*
 * MiniMax M3 · 绿 · 地脉拓殖·巨木升格
 * 文件：agents/agent-minimaxm3.js
 * 说明：脚本是一段 JS 源码（非 ES 模块），由引擎以 new Function('api', src + '; return {build, choose, meta}') 编译。
 */
const meta = {
  name: 'MiniMax M3 · 地脉拓殖·巨木升格',
  desc: '执行模型 minimax-m3-pay；颜色 绿；策略 地脉拓殖·巨木升格；地标加速攒法力，摇篮藤根与盖亚幼株当升格素材，践踏巨兽与巨木之心压脸。',
  id: 'model:minimaxm3',
  color: '绿'
};

/* ============ 一、卡面速查（字段取自引擎侧卡面：费用/身材/SR/类型） ============ */
const C = {
  'LQ01-055': { n: '盖亚幼株', t: '单位', c: 1, atk: 1, imp: 1, hp: 1, sr: 1 },
  'LQ01-056': { n: '幼叶之池', t: '地标', c: 1, atk: 0, imp: 0, hp: 0, sr: 0 },
  'LQ01-057': { n: '摇篮藤根', t: '单位', c: 2, atk: 1, imp: 2, hp: 3, sr: 2 },
  'LQ01-058': { n: '荆棘绞杀', t: '法术', c: 2, atk: 0, imp: 0, hp: 0, sr: 0 },
  'LQ01-059': { n: '猎杀弱肉', t: '单位', c: 3, atk: 2, imp: 1, hp: 2, sr: 3 },
  'LQ01-060': { n: '落叶风暴', t: '法术', c: 3, atk: 0, imp: 0, hp: 0, sr: 0 },
  'LQ01-061': { n: '母神共鸣地', t: '地标', c: 2, atk: 0, imp: 0, hp: 0, sr: 0 },
  'LQ01-065': { n: '荒原猛犸', t: '单位', c: 4, atk: 4, imp: 3, hp: 4, sr: 4 },
  'LQ01-066': { n: '裂地巨犀', t: '单位', c: 5, atk: 5, imp: 4, hp: 5, sr: 5 },
  'LQ01-067': { n: '林冠泰坦', t: '单位', c: 6, atk: 6, imp: 5, hp: 6, sr: 6 },
  'LQ01-068': { n: '巨兽冲锋', t: '法术', c: 2, atk: 0, imp: 0, hp: 0, sr: 0 },
  'LQ01-072': { n: '藤海怒涛', t: '法术', c: 4, atk: 0, imp: 0, hp: 0, sr: 0 },
  'LQ01-286': { n: '褪色符文', t: '法术', c: 1, atk: 0, imp: 0, hp: 0, sr: 0 },
  'LQ01-298': { n: '祭品石', t: '地标', c: 1, atk: 0, imp: 0, hp: 0, sr: 0 }
};
/* 升格外枢：降临效果与 SR 门槛（引擎侧数据） */
const OUTER = {
  'LQ01-266': { n: '巨木之心', sr: 3, atk: 6, imp: 4, hp: 7 },
  'LQ01-267': { n: '苍林守望', sr: 3, atk: 5, imp: 5, hp: 8 },
  'LQ01-268': { n: '兽王之魂', sr: 5, atk: 7, imp: 6, hp: 6 }
};
const KEY_UNITS = ['摇篮藤根', '荒原猛犸', '裂地巨犀', '林冠泰坦', '猎杀弱肉', '巨木之心', '苍林守望', '兽王之魂'];

/* ============ 二、构筑：30 张，主色绿 + 灰色泛用 ============ */
const DECK = [
  { id: 'LQ01-055', n: 3 }, { id: 'LQ01-056', n: 2 }, { id: 'LQ01-057', n: 3 },
  { id: 'LQ01-058', n: 3 }, { id: 'LQ01-059', n: 3 }, { id: 'LQ01-060', n: 2 },
  { id: 'LQ01-061', n: 2 }, { id: 'LQ01-065', n: 3 }, { id: 'LQ01-066', n: 2 },
  { id: 'LQ01-067', n: 1 }, { id: 'LQ01-068', n: 2 }, { id: 'LQ01-072', n: 2 },
  { id: 'LQ01-286', n: 1 }, { id: 'LQ01-298', n: 1 }
];

function build(pool) {
  const list = Array.isArray(pool) ? pool : [];
  const has = {};
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].id) has[list[i].id] = true;
  const out = [];
  const cnt = {};
  let total = 0;
  for (let i = 0; i < DECK.length; i++) {
    const e = DECK[i];
    if (!has[e.id]) continue;                    // 卡池里没有的卡直接跳过，不写进牌组
    const n = Math.max(0, Math.min(3, e.n | 0));
    if (!n) continue;
    out.push({ id: e.id, n: n });
    cnt[e.id] = n;
    total += n;
  }
  if (total < 30) {                              // 兜底补齐：从未用过的卡里按费用从低到高取，同名不超过 3 张
    const rest = list.slice().filter(function (c) {
      return c && c.id && !cnt[c.id];        // pool 已按主色＋灰过滤，直接取用
    }).sort(function (a, b) {
      const x = (a.cost && a.cost.n) || 9, y = (b.cost && b.cost.n) || 9;
      return x - y;
    });
    for (let i = 0; i < rest.length && total < 30; i++) {
      const id = rest[i].id;
      if ((cnt[id] || 0) >= 3) continue;
      cnt[id] = (cnt[id] || 0) + 1;
      total++;
      let k = -1;
      for (let j = 0; j < out.length; j++) if (out[j].id === id) k = j;
      if (k >= 0) out[k].n = cnt[id]; else out.push({ id: id, n: 1 });
    }
  }
  return out;
}

/* ============ 三、通用小工具 ============ */
function info(card) {
  const base = C[card && card.id];
  if (base) return base;
  const cost = (card && card.cost && card.cost.n) || 0;
  return {
    n: (card && card.name) || '?', t: (card && card.type) || '单位',
    c: cost, atk: (card && card.atk) || 0, imp: (card && card.imp) || 0,
    hp: (card && card.hp) || 0, sr: (card && card.sr) || 0
  };
}
function kwOf(u) {
  const k = (u && u.kw) || [];
  return Array.isArray(k) ? k : [];
}
function hasKw(u, k) { return kwOf(u).indexOf(k) >= 0; }
function unitByUid(board, uid) {
  const b = board || [];
  for (let i = 0; i < b.length; i++) if (b[i] && b[i].uid === uid) return b[i];
  return null;
}
function safePass(moves) {
  if (!moves || !moves.length) return { type: 'pass' };
  for (let i = 0; i < moves.length; i++) if (moves[i] && moves[i].type === 'pass') return moves[i];
  return moves[moves.length - 1];
}
/* 层级比较：tier 小的优先，其次价值大的，再次身材大的，最后费用高的 */
function lessKey(a, b) {
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/* ============ 四、局面判定与估值 ============ */
function srOfName(name) {
  for (const k in C) if (C[k].n === name) return C[k].sr;
  for (const k in OUTER) if (OUTER[k].n === name) return OUTER[k].sr;
  return 0;
}
function countWeak(oppBoard) {
  let n = 0;
  for (let i = 0; i < oppBoard.length; i++) if ((oppBoard[i].atk || 0) <= 2) n++;
  return n;
}
function threatOf(oppBoard) {
  let big = false, guard = false;
  for (let i = 0; i < oppBoard.length; i++) {
    const u = oppBoard[i];
    if ((u.atk || 0) >= 3 || (u.hp || 0) >= 4) big = true;
    if (hasKw(u, '守卫') && (u.hp || 0) >= 3) guard = true;
  }
  return big || guard || oppBoard.length >= 2;
}

/* 目标价值：荆棘绞杀看敌方目标，巨兽冲锋看己方目标 */
function targetScore(move, ctx, card) {
  const id = card.id;
  if (!move.target) return 0;
  const foe = unitByUid(ctx.oppBoard, move.target);
  const mine = unitByUid(ctx.myBoard, move.target);
  if (id === 'LQ01-068') {
    if (!mine) return -60;
    let s = 25;
    if ((mine.atk || 0) <= 3) s += 30;
    if (!mine.attacked) s += 12;
    if (hasKw(mine, '践踏')) s += 10;
    if ((mine.imp || 0) >= 3) s -= 20;
    return s;
  }
  if (!foe) return 0;
  let s = 25;
  if (id === 'LQ01-058') {
    if ((foe.hp || 0) <= 3) s += 45; else s -= 30;
    s += Math.min(6, foe.atk || 0) * 5;
    if (hasKw(foe, '守卫')) s += 25;
    s += Math.min(4, foe.imp || 0) * 3;
  }
  return s;
}
/* 卡面本身的价值（不含目标选择） */
function baseValue(card, ctx) {
  const I = info(card);
  const id = card.id;
  const nFoe = ctx.oppBoard.length;
  const nWeak = ctx.nWeak;
  if (id === 'LQ01-072') return nFoe >= 2 ? 120 : (nFoe === 1 ? 85 : 30);   // 藤海怒涛：群体3伤+回复1
  if (id === 'LQ01-060') return nFoe >= 2 ? 95 : (nFoe === 1 ? 60 : 15);    // 落叶风暴：群体2伤
  if (id === 'LQ01-059') return nWeak >= 1 ? 100 : 55;                       // 猎杀弱肉：战吼破ATK≤2
  if (id === 'LQ01-058') return 60;                                         // 荆棘绞杀：3点伤害
  if (id === 'LQ01-068') return 45;                                         // 巨兽冲锋：+2/+0与冲锋、践踏
  if (id === 'LQ01-286') return ctx.hand.length <= 4 ? 65 : 35;              // 褪色符文：抽1
  if (I.t === '地标') return ctx.turn <= 5 ? 85 : 62;                        // 地标早出早赚
  if (id === 'LQ01-057') return nFoe >= 1 ? 72 : 60;                         // 摇篮藤根：守卫1/2/3
  if (id === 'LQ01-055') return 50;                                          // 盖亚幼株：1/1/1，兼SR1素材
  if (id === 'LQ01-065') return 95;                                          // 荒原猛犸：4/3/4 践踏
  if (id === 'LQ01-066') return 100;                                         // 裂地巨犀：5/4/5 践踏
  if (id === 'LQ01-067') return 105;                                         // 林冠泰坦：6/5/6 践踏再生
  return 35 + I.imp * 4 + (I.t === '单位' ? 8 : 0);
}
/* 出牌优先级层级：数字小的先打 */
function tierOf(card, ctx) {
  const I = info(card);
  const id = card.id;
  if (id === 'LQ01-072' || id === 'LQ01-060') return ctx.threat ? 1 : 6;
  if (id === 'LQ01-058') return (ctx.nWeak === 0 && ctx.threat) ? 1 : 4;
  if (id === 'LQ01-059') return (ctx.nWeak >= 1 && ctx.threat) ? 1 : 4;
  if (id === 'LQ01-065' || id === 'LQ01-066' || id === 'LQ01-067') return 2;
  if (I.t === '地标') return ctx.turn <= 4 ? 3 : 5;
  if (id === 'LQ01-068') return 4;
  if (I.t === '单位') return 6;
  return 7;
}
/* 攻击价值：打脸优先，其次换掉敌方单位 */
function attackScore(move, ctx) {
  let atk = 0, imp = 0, trample = false, isWall = false;
  if (move.avatar) {
    const av = ctx.avatar || {};
    atk = av.atk || 0; imp = av.imp || 0;
  } else {
    const u = unitByUid(ctx.myBoard, move.uid);
    if (!u) return -1;
    atk = u.atk || 0; imp = u.imp || 0;
    trample = hasKw(u, '践踏');
    isWall = u.name === '摇篮藤根';
  }
  if (move.target === 'face') {
    let s = 300 + imp * 10;
    if (ctx.oppBoard.length > 0) {
      let minAtk = 99;
      for (let i = 0; i < ctx.oppBoard.length; i++) {
        const a = ctx.oppBoard[i].atk || 0;
        if (a < minAtk) minAtk = a;
      }
      if (atk < minAtk) s -= 120;                    // 会被反击致死，价值降低
    }
    if (isWall && ctx.oppBoard.length > 0) s -= 220;  // 摇篮藤根是墙与素材，不拿去换血
    return s;
  }
  const t = unitByUid(ctx.oppBoard, move.target);
  if (!t) return 0;
  const kills = atk >= (t.hp || 0);
  const over = trample ? Math.max(0, atk - (t.hp || 0)) : 0;
  let s;
  if (kills) s = 120 + imp * 8 + over * 6;
  else if (trample) s = 105 + imp * 8 + over * 6;
  else s = 30;
  if (hasKw(t, '守卫')) s += 15;
  return s;
}
/* 升灵素材模拟：引擎按 SR 从小到大凑，素材回弃牌区 */
const OUTER_NAMES = ['巨木之心', '苍林守望', '兽王之魂'];
function simulateMaterials(myBoard, threshold) {
  const pool = [];
  for (let i = 0; i < myBoard.length; i++) {
    const u = myBoard[i];
    if (!u || !u.name) continue;
    if (OUTER_NAMES.indexOf(u.name) >= 0) continue;   // 外枢灵体本身不算素材
    const sr = srOfName(u.name);
    if (sr > 0) pool.push({ u: u, sr: sr });
  }
  pool.sort(function (a, b) { return a.sr - b.sr; });
  let sum = 0;
  const used = [];
  for (let i = 0; i < pool.length; i++) {
    sum += pool[i].sr;
    used.push(pool[i].u);
    if (sum >= threshold) break;
  }
  if (sum < threshold) return null;
  return used;
}

/* ============ 五、决策：斩杀→灵体→解场→铺场→升灵→进攻→过牌 ============ */
function choose(view, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    const me = (view && view.me) || {};
    const opp = (view && view.opp) || {};
    const hand = me.hand || [];
    const myBoard = me.board || [];
    const oppBoard = opp.board || [];
    const ctx = {
      me: me, opp: opp, hand: hand, myBoard: myBoard, oppBoard: oppBoard,
      turn: view.turn || 0, res: me.res || 0, life: me.life || 0,
      avatar: me.avatar || null, nWeak: countWeak(oppBoard), threat: threatOf(oppBoard)
    };

    const plays = [], attacks = [], ascends = [];
    let avatarMove = null;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (!m || !m.type) continue;
      if (m.type === 'play') plays.push(m);
      else if (m.type === 'attack') attacks.push(m);
      else if (m.type === 'ascend') ascends.push(m);
      else if (m.type === 'avatar' && !avatarMove) avatarMove = m;
    }

    /* 1) 斩杀：本回合可打出的脸伤足够，直接全部打脸 */
    let faceDmg = 0, bestFace = null, bestFaceScore = -1;
    for (let i = 0; i < attacks.length; i++) {
      const m = attacks[i];
      if (m.target !== 'face') continue;
      let imp = 0;
      if (m.avatar) imp = (ctx.avatar && ctx.avatar.imp) || 0;
      else {
        const u = unitByUid(myBoard, m.uid);
        imp = (u && u.imp) || 0;
      }
      faceDmg += imp;
      const sc = attackScore(m, ctx);
      if (sc > bestFaceScore) { bestFaceScore = sc; bestFace = m; }
    }
    if (bestFace && faceDmg >= (opp.life || 0)) return bestFace;

    /* 2) 灵体启动（时机 early 的先开，产出法力或抽牌都收益） */
    const avatarUsed = !!(ctx.avatar && ctx.avatar.used);
    const timing = (ctx.avatar && ctx.avatar.timing) || 'early';
    if (avatarMove && !avatarUsed && timing !== 'late') return avatarMove;

    /* 3) 出牌：按 层级→价值→身材 排序取最优的一次 */
    let bestPlay = null, bestPlayKey = null;
    for (let i = 0; i < plays.length; i++) {
      const m = plays[i];
      const card = hand[m.i];
      if (!card) continue;
      const I = info(card);
      const tier = tierOf(card, ctx);
      const val = baseValue(card, ctx) + targetScore(m, ctx, card);
      const key = [tier, -val, -I.imp, -I.c];
      if (!bestPlayKey || lessKey(key, bestPlayKey)) { bestPlayKey = key; bestPlay = m; }
    }
    if (bestPlay) return bestPlay;

    /* 4) 升灵：用 SR1/SR2 素材换外枢灵体（每回合至多一次） */
    if (ascends.length && ctx.turn >= 4 && myBoard.length >= 4) {
      let pick = null;
      for (let i = 0; i < ascends.length; i++) {
        const m = ascends[i];
        const o = OUTER[m.id];
        if (!o) continue;
        let has = false;
        for (let j = 0; j < myBoard.length; j++) if (myBoard[j].name === o.n) has = true;
        if (has) continue;
        const used = simulateMaterials(myBoard, o.sr);
        if (!used || used.length > 3) continue;
        let roots = 0, ok = true;
        for (let j = 0; j < used.length; j++) {
          if (used[j].name !== '盖亚幼株' && used[j].name !== '摇篮藤根') { ok = false; break; }
          if (used[j].name === '摇篮藤根') roots++;
        }
        if (!ok || roots > 1) continue;
        if (oppBoard.length > 2 && myBoard.length < 6) continue;
        if (m.id === 'LQ01-266') { pick = m; break; }   // 优先巨木之心：+2法力+抽1
        if (!pick) pick = m;
      }
      if (pick) return pick;
    }

    /* 5) 灵体启动（时机 late 的在出牌之后开） */
    if (avatarMove && !avatarUsed && timing === 'late') return avatarMove;

    /* 6) 进攻：脸伤优先，其次交换掉敌方威胁 */
    let bestAtk = null, bestAtkScore = -1;
    for (let i = 0; i < attacks.length; i++) {
      const sc = attackScore(attacks[i], ctx);
      if (sc > bestAtkScore) { bestAtkScore = sc; bestAtk = attacks[i]; }
    }
    if (bestAtk && bestAtkScore > 0) return bestAtk;

    /* 7) 无事可做：pass */
    return safePass(moves);
  } catch (e) {
    return safePass(moves && moves.length ? moves : []);
  }
}

/* ============ 六、阻挡：只在划算或致命时出手 ============ */
function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return { type: 'noBlock' };
    const noBlock = (function () {
      for (let i = 0; i < bmoves.length; i++) if (bmoves[i] && bmoves[i].type === 'noBlock') return bmoves[i];
      return bmoves[bmoves.length - 1];
    })();
    const blocks = [];
    for (let i = 0; i < bmoves.length; i++) if (bmoves[i] && bmoves[i].type === 'block') blocks.push(bmoves[i]);
    if (!blocks.length) return noBlock;

    const me = (view && view.me) || {};
    const opp = (view && view.opp) || {};
    const myBoard = me.board || [];
    const oppBoard = opp.board || [];
    let atkUnit = null;
    for (let i = 0; i < oppBoard.length; i++) {
      if (oppBoard[i] && oppBoard[i].attacked) { atkUnit = oppBoard[i]; break; }
    }
    const myLife = me.life || 0;
    const lethal = atkUnit ? ((atkUnit.imp || 0) >= myLife) : false;

    let best = null, bestScore = -1e9;
    for (let i = 0; i < blocks.length; i++) {
      const u = unitByUid(myBoard, blocks[i].uid);
      if (!u) continue;
      let s = (u.atk || 0) * 2 + (u.hp || 0) * 2;
      if (KEY_UNITS.indexOf(u.name) >= 0) s -= 45;      // 关键单位不拿去换血
      if (atkUnit) {
        const survives = (u.hp || 0) > (atkUnit.atk || 0);
        const kills = (u.atk || 0) >= (atkUnit.hp || 0);
        if (!survives && !kills) s -= 60;
        if (survives) s += 30;
        if (kills) s += 25;
      } else {
        s += 10;
      }
      if (lethal) s += 200;                              // 致命攻击必须挡
      if (s > bestScore) { bestScore = s; best = blocks[i]; }
    }
    if (!best) return noBlock;
    if (!lethal && bestScore <= 0) return noBlock;       // 亏本的阻挡不做
    return best;
  } catch (e) {
    if (bmoves && bmoves.length) {
      for (let i = 0; i < bmoves.length; i++) if (bmoves[i] && bmoves[i].type === 'noBlock') return bmoves[i];
      return bmoves[bmoves.length - 1];
    }
    return { type: 'noBlock' };
  }
}
