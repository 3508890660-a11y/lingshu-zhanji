/* KIMI 2.8preview —— 灵枢战纪颜色构筑 AI（青色 · 潮汐涌动）
 * 策略：低曲线铺场 + 涡流滚雪球，调律师素材中期升灵「深渊潮主」终结。
 * 选青理由：法力 = min(回合+1, 6)，成长快；回合抽 2，且回合末按「本回合打出数 ÷ 2」补抽——
 * 打得越多抽得越多，天然奖励低曲线高频出牌，与 21 单位的铺场卡组自洽。
 */

const meta = {
  name: 'KIMI 2.8preview · 潮汐涌动',
  desc: '执行模型 kimi-k2.8-preview；颜色 青；策略 潮汐涌动（低曲线铺场＋涡流滚雪球＋调律师升灵终结）；法力成长快且打出越多抽越多，低曲线高频出牌收益最大',
  id: 'model:kimi28preview',
  color: '青',
};

/* ── 组卡：30 张 · 11 名目（曲线 1~2 费 17 / 3~4 费 12 / 5~6 费 1 / 7+ 费 0） ── */
const DECK = [
  { id: 'LQ01-127', n: 3 }, // 潮汐幼灵   1费 1/1/2 潮汐
  { id: 'LQ01-138', n: 3 }, // 连击共鸣   1费 抽2
  { id: 'LQ01-128', n: 3 }, // 溅跃小妖   2费 2/1/2
  { id: 'LQ01-137', n: 3 }, // 风暴信使   2费 2/1/2
  { id: 'LQ01-129', n: 3 }, // 潮汐号令   2费 抽1
  { id: 'LQ01-141', n: 2 }, // 调律学徒   2费 1/2/2 调律师 SR2（升灵素材）
  { id: 'LQ01-133', n: 3 }, // 潮卫·堤灵 3费 2/2/4 守卫
  { id: 'LQ01-131', n: 3 }, // 深海重压   3费 打3（指定单位）
  { id: 'LQ01-140', n: 3 }, // 涡流长老   4费 3/2/4 涡流3（本回合每用1张卡+1ATK）
  { id: 'LQ01-143', n: 3 }, // 大潮调律师 4费 3/2/4 调律师 SR4（升灵素材）
  { id: 'LQ01-136', n: 1 }, // 海灵圣母   6费 5/4/7 战吼全体+1/+1（终结）
];

function build(pool) {
  // 只从当前卡池里挑存在的卡，避免卡表变动导致整副卡组被回退
  const inPool = new Set((pool || []).map((c) => c.id));
  const list = DECK.filter((x) => inPool.has(x.id));
  const total = list.reduce((s, x) => s + x.n, 0);
  if (total < 25 || !list.length) return null; // 兜底交给 autoBuild
  return list;
}

/* ───────────────────────── 决策辅助 ───────────────────────── */

function effVal(e, view) {
  const ob = view.opp.board;
  switch (e.do) {
    case 'draw': return (e.n || 1) * 2.2;
    case 'dmg': {
      if (e.target === 'face') return view.opp.life <= (e.n || 0) ? 99 : (e.n || 0) * 1.5;
      const killable = ob.filter((u) => u.hp <= (e.n || 0));
      if (killable.length) return 4 + Math.max(...killable.map((u) => u.atk)) * 0.8;
      return ob.length ? 1.5 : 0;
    }
    case 'aoe': {
      const n = ob.filter((u) => u.hp <= (e.n || 1)).length;
      return (e.n || 1) * 1.5 + Math.min(n, 3) * 1.5;
    }
    case 'destroy': return ob.length ? 6 : 0;
    case 'bounce': return ob.length ? 4 : 0;
    case 'freeze': return ob.length ? 2.5 : 0;
    case 'token': return (e.n || 1) * 2.2;
    case 'buff': case 'buffAll': return view.me.board.length ? ((e.atk || 0) + (e.hp || 0)) * 1.6 : 0;
    case 'grant': case 'grantAll': return view.me.board.length ? 1.5 : 0;
    case 'res': return 1.5;
    case 'heal': return view.me.life <= 12 ? (e.n || 1) * 1.5 : 0.5;
    case 'recover': case 'revive': return view.me.grave ? 2 : 0;
    case 'pumpBest': return view.me.board.length ? 3 : 0;
    case 'rally': return view.me.board.length ? view.me.board.length * 0.8 : 0;
    case 'mill': return 1;
    default: return 1;
  }
}

function cardVal(c, view) {
  if (!c || !c.type) return -99;
  const cost = (c.cost && c.cost.n) || 0;
  if (c.type === '单位') {
    let v = (c.atk || 0) * 1.1 + (c.imp || 0) * 1.3 + (c.hp || 0) * 1.0;
    for (const k of c.kw || []) {
      if (k === '守卫') v += 2.0;
      else if (k.startsWith('涡流')) v += 1.5;
      else if (k === '潮汐') v += 0.6;
      else if (k === '冲锋') v += 1.5;
      else if (k === '成长') v += 1.2;
      else if (k === '再生') v += 0.8;
    }
    return v - cost * 0.35;
  }
  let v = 0;
  for (const e of c.effects || []) v += effVal(e, view);
  if (c.type === '地标') v += 0.5;
  return v - cost * 0.35;
}

/** 敌方最优去除目标：优先能杀掉的最高攻，其次最大威胁 */
function removalTarget(view) {
  const ob = view.opp.board;
  if (!ob.length) return null;
  const killable = ob.filter((u) => u.hp <= 3);
  const pool = killable.length ? killable : ob;
  return pool.slice().sort((a, b) => (b.atk - a.atk) || (a.hp - b.hp))[0];
}

/** 己方 buff 目标：最高攻单位 */
function buffTarget(view) {
  const mb = view.me.board;
  if (!mb.length) return null;
  return mb.slice().sort((a, b) => b.atk - a.atk)[0];
}

/** 给单个 play 动作打分（含目标选择） */
function scorePlay(m, view) {
  const c = view.me.hand[m.i];
  if (!c || !c.type) return -99;
  let v = cardVal(c, view);
  const isTargeted = m.target != null;
  if (isTargeted) {
    const foe = view.opp.board.find((u) => u.uid === m.target);
    const own = view.me.board.find((u) => u.uid === m.target);
    const hostile = (c.effects || []).some((e) =>
      ['dmg', 'destroy', 'bounce', 'freeze'].includes(e.do) && e.target !== 'ownUnit' && e.target !== 'unit');
    if (hostile) {
      if (!foe) return -99;                       // 去除没指到敌方单位
      const kill = foe.hp <= 3 || (c.effects || []).some((e) => e.do === 'destroy' || e.do === 'bounce');
      v += kill ? foe.atk * 0.8 + 1 : foe.atk * 0.3 - 1;
    } else if (foe) {
      v -= 5;                                     // 增益/错指到敌人
    } else if (own) {
      v += 1;
    }
  } else if ((c.effects || []).length && c.type !== '单位' && c.type !== '地标' && c.type !== '结界') {
    // 带目标效果但没给目标的出牌（引擎漏给时）：去除牌目标缺失就压分
    const wants = (c.effects || []).some((e) =>
      ['dmg', 'destroy', 'bounce', 'freeze', 'buff', 'grant'].includes(e.do) &&
      ['enemyUnit', 'ownUnit', 'unit'].includes(e.target));
    if (wants && view.opp.board.length) v -= 3;
  }
  // 费用利用：剩余资源利用率低时，便宜牌略加权（便于一回合多张，滚涡流/补抽）
  return v;
}

/** 攻击打分 */
function scoreAttack(m, view) {
  const u = view.me.board.find((x) => x.uid === m.uid);
  if (!u) return -99;
  const imp = u.imp || 0;
  if (m.target === 'face') {
    let v = imp * 2 + 2;
    if (view.opp.life <= imp) v += 100;           // 斩杀
    return v;
  }
  const t = view.opp.board.find((x) => x.uid === m.target);
  if (!t) return -99;
  const kills = u.atk >= t.hp;
  const dies = t.atk >= u.hp;
  let v = 0;
  if (kills) v += 3 + t.atk * 1.2 + t.imp;
  if (!dies) v += 2; else v -= 2;
  if (dies && !kills) v -= 4;
  if (u.kw.includes('践踏') && kills) v += Math.max(0, u.atk - t.hp);
  if (view.opp.life <= imp) v += 50;              // 本可斩杀却被迫换（守卫场合）
  return v;
}

/** 本回合可攻击单位的总直击伤害（用于斩杀判断） */
function totalFaceDamage(view, moves) {
  let sum = 0;
  const seen = new Set();
  for (const m of moves) {
    if (m.type !== 'attack' || m.target !== 'face') continue;
    if (seen.has(m.uid)) continue;
    seen.add(m.uid);
    const u = view.me.board.find((x) => x.uid === m.uid);
    if (u) sum += u.imp || 0;
  }
  return sum;
}

/* ───────────────────────── 主决策 ───────────────────────── */

function pick(view, moves) {
  const plays = moves.filter((m) => m.type === 'play');
  const attacks = moves.filter((m) => m.type === 'attack');
  const ascends = moves.filter((m) => m.type === 'ascend');
  const avatars = moves.filter((m) => m.type === 'avatar');

  // 1) 斩杀：能打死就直接打脸
  if (attacks.some((m) => m.target === 'face') && totalFaceDamage(view, moves) >= view.opp.life) {
    const kill = attacks
      .filter((m) => m.target === 'face')
      .sort((a, b) => scoreAttack(b, view) - scoreAttack(a, view))[0];
    if (kill) return kill;
  }

  // 2) 灵体启动：温蒂妮免费抽 1，开局就用（抽上来的牌本回合还能打）
  if (avatars.length && view.me.hand.length <= 5) return avatars[0];

  // 3) 出牌：每步挑当前分最高的（费用已在 moves 里过滤）
  if (plays.length) {
    const best = plays.slice().sort((a, b) => scorePlay(b, view) - scorePlay(a, view))[0];
    if (best && scorePlay(best, view) > -50) return best;
  }

  // 4) 升灵：素材引擎自动取最小 SR；只在我方场面够厚、或对方场面不赚时不亏节奏
  if (ascends.length) {
    const myN = view.me.board.length;
    const oppN = view.opp.board.length;
    if (myN >= 3 || (myN >= 2 && oppN <= 1)) {
      const pref = ['LQ01-276', 'LQ01-277', 'LQ01-275']; // 潮主 > 谐律盘 > 共鸣锚
      for (const id of pref) {
        const m = ascends.find((x) => x.id === id);
        if (m) return m;
      }
      return ascends[0];
    }
  }

  // 5) 攻击：好交换 > 打脸
  if (attacks.length) {
    const best = attacks.slice().sort((a, b) => scoreAttack(b, view) - scoreAttack(a, view))[0];
    if (best && scoreAttack(best, view) > 0) return best;
    // 没有正收益攻击，但场面占优且法力用光 → 仍压脸
    if (best && view.me.board.length >= view.opp.board.length && best.target === 'face') return best;
  }

  // 6) 收尾：灵体还没用就补一下（免费抽牌不亏）
  if (avatars.length) return avatars[0];

  return moves[moves.length - 1]; // pass
}

function choose(view, moves) {
  try {
    if (!Array.isArray(moves) || !moves.length) return { type: 'pass' };
    return pick(view, moves);
  } catch (e) {
    return moves[moves.length - 1];
  }
}

/* ───────────────────────── 阻挡 ───────────────────────── */

function block(view, bmoves) {
  try {
    const blocks = bmoves.filter((m) => m.type === 'block');
    if (!blocks.length) return bmoves[bmoves.length - 1];
    // 进攻方已横置的单位里最危险的那个作为假想攻击者（view.opp = 进攻方）
    const attackers = view.opp.board.filter((u) => u.attacked);
    if (!attackers.length) return bmoves[bmoves.length - 1];
    const a = attackers.slice().sort((x, y) => (y.imp || 0) - (x.imp || 0))[0];
    const must = view.me.life <= (a.imp || 0);
    let best = null;
    for (const m of blocks) {
      const b = view.me.board.find((u) => u.uid === m.uid);
      if (!b) continue;
      const kills = b.atk >= a.hp;
      const dies = a.atk >= b.hp;
      let v = 0;
      if (kills) v += 3;
      if (!dies) v += 2;
      if (dies && !kills) v -= 3;
      if (must) v += 5;
      if (!best || v > best.v) best = { m, v };
    }
    if (best && (best.v > 0 || must)) return best.m;
    return bmoves[bmoves.length - 1];
  } catch (e) {
    return bmoves[bmoves.length - 1];
  }
}
