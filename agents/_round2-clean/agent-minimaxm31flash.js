/*
 * MiniMax M3.1flash —— 银 ·「方阵共振」
 *
 * 选色依据（只来自卡面文本 + 基本规则）：
 *   银的资源是「共鸣」＝ max(1, 场上卡牌数 + 地标数)，门槛制不消耗。
 *   卡面自己把共鸣写成了引擎：银翼列兵「每有 1 个其他银翼单位 ATK+1」、
 *   方阵壁垒「你的单位 +0/+1」、升格逆鳞「全体 +1/+1」、
 *   集群爆破「伤害等同共鸣等级」、终章齐鸣「共鸣等级 ÷2」。
 *   所以这套牌的胜利方式只有一条：先把共鸣抬起来，再把永久强化叠上去，
 *   最后用银翼单位的 IMP 一齐推脸。
 *
 * 脚本结构：build(pool) 走卡表 §九的银门槛配方 8/11/8/2/1；
 *           choose(view, moves) 只做排序，不改 view / moves；
 *           block(view, bmoves) 做「值不值挨这一下」的取舍。
 */

const meta = {
  name: 'MiniMax M3.1flash · 方阵共振',
  desc: '执行模型 minimax-m3.1-flash；颜色 银；策略 方阵共振：先铺银翼方阵抬共鸣门槛，再叠方阵壁垒/升格逆鳞的永久强化，最后用群体 IMP 推脸斩杀。',
  id: 'model:minimaxm31flash',
  color: '银'
};

/* ── 卡组：银 · 门槛配方 8/11/8/2/1（按共鸣门槛带分组）─────────────
 * 共鸣1（8）银翼列兵×3 银翼长枪兵×2 银翼枪骑兵×2 列阵×1
 * 共鸣2（11）方阵壁垒×3 银翼战马×3 方阵整列×2 谐振晶体×2 征募长号×1
 * 共鸣3（8） 银翼方阵圣盾×3 集群爆破×2 升格逆鳞×3
 * 共鸣4（2） 银翼重装要塞×1 终章齐鸣×1
 * 共鸣5（1） 方阵巨像×1
 */
const DECK = [
  { id: 'LQ01-145', n: 3 }, // 银翼列兵 1/1/1 共鸣1
  { id: 'LQ01-146', n: 2 }, // 银翼长枪兵 1/2/1 守卫 共鸣1
  { id: 'LQ01-147', n: 2 }, // 银翼枪骑兵 2/1/1 冲锋 共鸣1
  { id: 'LQ01-148', n: 1 }, // 列阵 共鸣1 → 银翼新兵衍生物
  { id: 'LQ01-149', n: 3 }, // 方阵壁垒 共鸣2 抽1 + 全体+0/+1
  { id: 'LQ01-151', n: 3 }, // 银翼战马 2/1/2 共鸣2 战吼衍生物
  { id: 'LQ01-154', n: 2 }, // 方阵整列 结界 共鸣2 每回合首个衍生物抽1
  { id: 'LQ01-157', n: 2 }, // 谐振晶体 地标 共鸣2 每回合抽1
  { id: 'LQ01-150', n: 1 }, // 征募长号 共鸣2 → 衍生物×2
  { id: 'LQ01-152', n: 3 }, // 银翼方阵圣盾 2/1/3 守护1 共鸣3
  { id: 'LQ01-156', n: 2 }, // 集群爆破 共鸣3 移除
  { id: 'LQ01-161', n: 3 }, // 升格逆鳞 共鸣3 永久全体+1/+1
  { id: 'LQ01-153', n: 1 }, // 银翼重装要塞 2/2/6 守卫 共鸣4
  { id: 'LQ01-158', n: 1 }, // 终章齐鸣 共鸣4 AOE
  { id: 'LQ01-162', n: 1 }  // 方阵巨像 5/4/6 共鸣5
];

function build(pool) {
  const have = {};
  for (const c of (pool || [])) have[c.id] = c;
  const out = [];
  let n = 0;
  for (const d of DECK) {
    if (have[d.id]) { out.push({ id: d.id, n: d.n }); n += d.n; }
  }
  // pool 正常情况下含全部银色卡；万一缺牌则退回完整清单（全部仍是银卡）。
  return n === 30 ? out : DECK.slice();
}

/* ── 小工具 ────────────────────────────────────────────────────────── */

function kwHas(kw, k) {
  return Array.isArray(kw) && kw.indexOf(k) >= 0;
}

function byUid(list, uid) {
  for (const u of (list || [])) if (u && u.uid === uid) return u;
  return null;
}

function doSum(effects, d) {
  let n = 0;
  for (const x of (effects || [])) if (x && x.do === d) n += (x.n || 0);
  return n;
}

function doHas(effects, d) {
  for (const x of (effects || [])) if (x && x.do === d) return true;
  return false;
}

function kwBonus(kw) {
  let b = 0;
  if (kwHas(kw, '冲锋')) b += 2.0;
  if (kwHas(kw, '守卫')) b += 2.0;
  if (kwHas(kw, '守护1')) b += 1.8;
  if (kwHas(kw, '圣盾')) b += 1.2;
  if (kwHas(kw, '践踏')) b += 1.5;
  return b;
}

/* 本回合新登场的单位（用于让冲锋单位在进场当回合就打出去） */
let _seen = {};
let _newUids = {};
let _lastTurn = -1;

function refreshSeen(view) {
  const t = view.turn || 0;
  if (t < _lastTurn) { _seen = {}; _newUids = {}; }   // 新的一局
  if (t !== _lastTurn) { _newUids = {}; _lastTurn = t; }
  const board = (view.me && view.me.board) || [];
  for (const u of board) {
    if (u && u.uid !== undefined && !_seen[u.uid]) {
      _seen[u.uid] = true;
      _newUids[u.uid] = true;
    }
  }
}

function isNewUnit(u) {
  return !!(u && u.uid !== undefined && _newUids[u.uid]);
}

/* ── 出牌评分 ──────────────────────────────────────────────────────── */

function removalValue(view, card, move, oppUnits, myUnits) {
  const t = byUid(oppUnits, move.target);
  if (!t) return 0;
  const dmg = 3;                                  // 集群爆破在引擎侧的伤害值
  const hp = t.hp || 0;
  const imp = t.imp || 0;
  const atk = t.atk || 0;
  let v;
  if (hp <= dmg) {
    v = 3.2 + 1.1 * imp + 0.35 * atk;             // 能击杀：优先拆威胁
  } else {
    v = 1.6 + 0.6 * imp;                          // 打不穿：价值很低
  }
  if (kwHas(t.kw, '守卫')) v += 2.0;               // 拆守卫等于开门
  if (imp >= 5) v += 3.0;                         // 大威胁必须处理
  if (myUnits.length <= 1) v += 2.0;              // 场面薄时先清场
  return v;
}

function scorePlay(view, card, move, myUnits, oppUnits, unitPlayLeft) {
  const e = card.effects || [];
  const nDraw = doSum(e, 'draw');
  const nToken = doSum(e, 'token');
  const permBuff = e.some(x => x && x.do === 'buffAll' && x.dur === 'perm');
  const engine = card.type === '地标' || card.type === '结界';
  const kw = card.kw || [];
  let s = 0;

  if (card.type === '单位') {
    s = 11 + 1.25 * (card.atk || 0) + 1.0 * (card.imp || 0) + 0.3 * (card.hp || 0) + kwBonus(kw);
    if (nToken) s += 2.5 * nToken;                // 战吼衍生物 = 多一个 IMP
    if (card.id === 'LQ01-151') s += 1.5;          // 银翼战马额外一只衍生物
    return s;
  }

  if (nDraw) s += engine ? 10 : 7;                // 常驻抽牌引擎 > 一次性抽牌
  if (nToken) s += 9 + 2.5 * nToken;
  if (permBuff) {
    s += 1.5 + 1.6 * myUnits.length;              // 强化只作用于当前场面
    if (unitPlayLeft) s -= 3.5;                   // 还有单位要出就先出单位
  }
  if (doHas(e, 'aoe')) s += 2.0 + 1.8 * Math.min(oppUnits.length, 4);
  if (doHas(e, 'dmg') && move.target !== undefined) {
    s += removalValue(view, card, move, oppUnits, myUnits);
  }
  if (doHas(e, 'destroy') && move.target !== undefined) {
    s += removalValue(view, card, move, oppUnits, myUnits) + 2.5;
  }
  if (doHas(e, 'grantAll')) s += 1.0 + 0.8 * myUnits.length;
  if (doHas(e, 'freeze')) s += 1.0 + 1.2 * oppUnits.length;
  if (doHas(e, 'revive')) s += 1.0 + 0.8 * myUnits.length;
  return s;
}

/* ── 攻击评分 ──────────────────────────────────────────────────────── */

function attackValue(me, opp, m, myUnits, oppUnits) {
  const u = byUid(myUnits, m.uid);
  if (!u) return -1;
  if (m.target === 'face') {
    const imp = u.imp || 0;
    if (imp <= 0) return -1;                      // 纯亏IMP，不打
    return 0.5 + 1.2 * imp;
  }
  const t = byUid(oppUnits, m.target);
  if (!t) return -1;
  const myAtk = u.atk || 0, myImp = u.imp || 0, myHp = u.hp || 0;
  const tAtk = t.atk || 0, tImp = t.imp || 0, tHp = t.hp || 0;
  let v;
  if (myAtk >= tHp) {
    v = 3.2 + 1.1 * tImp + 0.35 * tAtk;           // 白嫖一口
  } else {
    // 换血：我方单位带永久强化，贵；对面 IMP 越高越值得换
    v = 0.9 * tImp - (0.9 * myImp + 0.25 * myAtk + 0.1 * myHp);
  }
  if (kwHas(t.kw, '守卫')) v += 1.5;
  if (tImp >= 5) v += 2.0;
  if (myUnits.length <= 1) v -= 1.0;
  return v;
}

/* ── 升灵评分（银的三张外枢灵体）────────────────────────────────── */

function ascendValue(id, myUnits, oppUnits) {
  const n = myUnits.length;
  if (id === 'LQ01-278') return n >= 3 ? 15 : 5;   // 谐律魔导堡垒：4/3/6 + 2 衍生物
  if (id === 'LQ01-280') return n >= 5 ? 17 : 6;   // 银翼旗舰·船首炮：降临 4 点冲击
  if (id === 'LQ01-279') return (n >= 8 && oppUnits.length >= 3) ? 14 : 5;
  return 5;
}

/* ── choose ────────────────────────────────────────────────────────── */

function choose(view, moves) {
  try {
    if (!moves || !moves.length) return null;
    const me = view.me || {};
    const opp = view.opp || {};
    const myUnits = me.board || [];
    const oppUnits = opp.board || [];
    const hand = me.hand || [];

    refreshSeen(view);

    // 1) 斩杀：能直接打死对手就立刻打。
    for (const m of moves) {
      if (m.type === 'attack' && m.target === 'face') {
        const u = byUid(myUnits, m.uid);
        if (u && (u.imp || 0) >= (opp.life || 0)) return m;
      }
    }

    // 2) 出牌 / 启动灵体 / 升灵 一起打分。
    const unitPlayIdx = {};
    for (const m of moves) {
      if (m.type !== 'play') continue;
      const c = hand[m.i];
      if (c && c.type === '单位') unitPlayIdx[m.i] = 1;
    }
    const unitPlayLeft = Object.keys(unitPlayIdx).length > 0;

    let bestPlay = null, bestPlayScore = -Infinity;
    for (const m of moves) {
      if (m.type !== 'play') continue;
      const card = hand[m.i];
      if (!card) continue;
      const s = scorePlay(view, card, m, myUnits, oppUnits, unitPlayLeft);
      if (s > bestPlayScore) { bestPlayScore = s; bestPlay = m; }
    }

    let bestAvatar = null, bestAvatarScore = -Infinity;
    for (const m of moves) {
      if (m.type !== 'avatar') continue;
      // 银翼元帅：启动生成一只银翼新兵衍生物，越早越早受益。
      const s = 16 + (myUnits.length >= 2 ? 2 : 0);
      if (s > bestAvatarScore) { bestAvatarScore = s; bestAvatar = m; }
    }

    let bestAscend = null, bestAscendScore = -Infinity;
    for (const m of moves) {
      if (m.type !== 'ascend') continue;
      const s = ascendValue(m.id, myUnits, oppUnits);
      if (s > bestAscendScore) { bestAscendScore = s; bestAscend = m; }
    }

    // 3) 攻击评分：新登场的单位（冲锋）优先用掉，别浪费进场回合。
    let bestAttack = null, bestAttackScore = -Infinity;
    for (const m of moves) {
      if (m.type !== 'attack') continue;
      let v = attackValue(me, opp, m, myUnits, oppUnits);
      if (v < 0) continue;
      const u = byUid(myUnits, m.uid);
      if (isNewUnit(u)) v += 8;
      if (v > bestAttackScore) { bestAttackScore = v; bestAttack = m; }
    }

    // 4) 优先级：出牌/头像 > 攻击 > 升灵 > pass。
    //    攻击若比分更高的出牌更值钱（例如点脸斩杀、或拆掉对面大威胁），先打。
    if (bestPlay && bestPlayScore >= 12) return bestPlay;
    if (bestAvatar && bestAvatarScore >= bestPlayScore && bestAvatarScore >= 12) return bestAvatar;
    if (bestAttack && bestAttackScore >= 0) return bestAttack;
    if (bestPlay && bestPlayScore > 0) return bestPlay;
    if (bestAvatar && bestAvatarScore > 0) return bestAvatar;
    if (bestAscend && bestAscendScore >= 10) return bestAscend;
    if (bestAscend && bestAscendScore >= 10) return bestAscend;

    const pass = moves.find(m => m.type === 'pass');
    return pass || moves[moves.length - 1];
  } catch (err) {
    const pass = moves.find(m => m.type === 'pass');
    return pass || moves[moves.length - 1];
  }
}

/* ── block ─────────────────────────────────────────────────────────── */

function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return null;
    const noBlock = bmoves.find(m => m.type === 'noBlock');
    const fallback = noBlock || bmoves[bmoves.length - 1];
    const blocks = bmoves.filter(m => m.type === 'block');
    if (!blocks.length) return fallback;

    const oppUnits = (view.opp && view.opp.board) || [];
    const myUnits = (view.me && view.me.board) || [];
    const myLife = (view.me && view.me.life) || 0;

    let attacker = null;
    for (const u of oppUnits) {
      if (u && u.attacked) {
        if (!attacker || (u.imp || 0) > (attacker.imp || 0)) attacker = u;
      }
    }
    if (!attacker) return fallback;

    const atk = attacker.atk || 0;
    const imp = attacker.imp || 0;

    const pick = (cands) => {
      let best = null, bestScore = -Infinity;
      for (const m of cands) {
        const u = byUid(myUnits, m.uid);
        if (!u) continue;
        const margin = (u.hp || 0) - atk;
        let sc = margin * 0.6 - (u.imp || 0) * 0.8;
        if (imp >= myLife) sc = margin * 1.5 + (u.hp || 0) * 0.2;  // 致命威胁：能活最好
        if (sc > bestScore) { bestScore = sc; best = m; }
      }
      return best;
    };

    // 致命冲击：必须挡住。
    if (imp >= myLife) return pick(blocks) || fallback;

    const survivors = myUnits.filter(u => !u.frozen && (u.hp || 0) > atk);
    if (survivors.length) {
      const ids = {};
      for (const u of survivors) ids[u.uid] = 1;
      const cands = blocks.filter(m => ids[m.uid]);
      return pick(cands) || fallback;
    }

    // 没有能活下来的：用「IMP 伤害」和「我这个单位的价值」比一比。
    let cheapest = null;
    for (const u of myUnits) {
      if (u.frozen) continue;
      if (!cheapest || (u.atk || 0) + (u.imp || 0) < (cheapest.atk || 0) + (cheapest.imp || 0)) cheapest = u;
    }
    const myValue = cheapest ? 1.5 + 0.9 * (cheapest.imp || 0) + 0.25 * (cheapest.atk || 0) : 99;
    if (imp >= myValue) return pick(blocks) || fallback;

    return fallback;
  } catch (err) {
    return null;
  }
}
