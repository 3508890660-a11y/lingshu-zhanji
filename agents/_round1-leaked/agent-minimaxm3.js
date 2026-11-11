/* ------------------------------------------------------------------
 * MiniMax M3 · 潮汐引擎 —— 《灵枢战纪》青（teal）构筑 AI
 *
 * 颜色：青　资源：法力（min(回合+1, 6)，消耗型；温蒂妮被动再 +1）
 * 灵体：潮汐唤者·温蒂妮　被动：回合开始 +1 法力｜启动（免费）：抽 1
 *
 * 胜利方式：中速 IMP 冲锋 + 守卫墙 + 过牌引擎
 *   ① IMP 是本作唯一的直击货币。青的 141/292/133 各带 IMP2，136 带 IMP4，
 *      铺开的场面每回合都能换脸伤，20 点生命三到四个回合打穿。
 *   ② 守卫（292/133）让对手**只能打我方守卫**，白赚防守与交换。
 *   ③ 过牌：138（1 费抽 2）＋ 129 ＋ 温蒂妮抽 1 ＋ 回合末「打出数÷2」额外抽，
 *      青色每回合抽 2，牌永远接得上。
 *   ④ 解场：290 / 131 各 3 张 3 点伤害，134 冻结，对面堆场就拆。
 *   ⑤ 终结：136（5/4/7 IMP4，全体 +1/+1）、140 涡流长老（出牌数→ATK）、
 *      升灵 275/276/277 用素材换大体型与即时伤害。
 *
 * 接口约束：纯源码，无 import/require；只从引擎枚举的 moves 里挑一个对象返回。
 * ------------------------------------------------------------------ */

const meta = {
  name: 'MiniMax M3 · 潮汐引擎',
  desc: '执行模型 minimax-m3-pay；颜色 青；策略 潮汐引擎 —— 低费铺 IMP 场面、守卫锁面、过牌引擎滚资源后用 136/140 终结。',
  id: 'model:minimaxm3',
  color: '青',
};

/* ── 卡组：12 个名目 30 张（青 10 名目 ＋ 灰 2 名目）───────────────────
 * 费用曲线（1–2 / 3–4 / 5–6 / 7+）＝ 18 / 10 / 2 / 0
 *   ¥1 127 潮汐幼灵 1/1/2 ×3 ／ 138 连击共鸣 抽2 ×3
 *   ¥2 141 调律学徒 1/2/2 IMP2 ×3 ／ 134 涨潮反击 冻结 ×2 ／ 129 潮汐号令 抽1 ×1
 *   通用2 292 石肤守卫 1/2/3 守卫 IMP2 ×3 ／ 290 碎晶冲击 3 点伤害 ×3
 *   ¥3 133 潮卫·堤灵 2/2/4 守卫 IMP2 ×3 ／ 131 深海重压 3 点伤害 ×3 ／ 135 潮汐帷幕 结界 ×1
 *   ¥4 140 涡流长老 3/2/4 涡流3 ×3
 *   ¥6 136 月潮终曲 5/4/7 IMP4 ×2
 * 关键卡支撑：
 *   136（IMP4）+ 140（出牌数堆 ATK）＝ 前排与终结；
 *   292/133 的「守卫」＝ 对手只能打我方单位，锁住对面节奏；
 *   138 的 1 费抽 2 ＋ 温蒂妮抽 1 ＝ 每回合多两张手牌，出牌数又能换回合末抽牌。
 * -------------------------------------------------------------------- */
const DECK = [
  { id: 'LQ01-127', n: 3 }, // 潮汐幼灵　法力1　1/1/2　潮汐
  { id: 'LQ01-138', n: 3 }, // 连击共鸣　法力1　抽 2
  { id: 'LQ01-141', n: 3 }, // 调律学徒　法力2　1/2/2　IMP2
  { id: 'LQ01-292', n: 3 }, // 石肤守卫　通用2　1/2/3　守卫 IMP2（灰）
  { id: 'LQ01-290', n: 3 }, // 碎晶冲击　通用2　对 1 个单位造成 3 点伤害（灰）
  { id: 'LQ01-134', n: 2 }, // 涨潮反击　法力2　冻结 1 个敌方单位
  { id: 'LQ01-133', n: 3 }, // 潮卫·堤灵　法力3　2/2/4　守卫 IMP2
  { id: 'LQ01-131', n: 3 }, // 深海重压　法力3　对 1 个单位造成 3 点伤害
  { id: 'LQ01-135', n: 1 }, // 潮汐帷幕　法力3　结界：全体守护1
  { id: 'LQ01-140', n: 3 }, // 涡流长老　法力4　3/2/4　涡流3
  { id: 'LQ01-136', n: 2 }, // 月潮终曲　法力6　5/4/7　战吼：全场 +1/+1
  { id: 'LQ01-129', n: 1 }, // 潮汐号令　法力2　抽 1；切换潮汐
];

/* ── 小工具 ───────────────────────────────────────────────────────── */
function num(v, d) {
  return typeof v === 'number' && isFinite(v) ? v : (d || 0);
}
function kwHas(u, k) {
  return !!(u && u.kw && u.kw.indexOf(k) >= 0);
}
function kwAny(u, prefix) {
  if (!u || !u.kw) return false;
  for (const k of u.kw) if (k.indexOf(prefix) === 0) return true;
  return false;
}
/** 敌方单位威胁度：守卫（锁住我打脸）与高 IMP 优先拆 */
function threatOf(u) {
  if (!u) return 0;
  let t = num(u.atk) * 1.0 + num(u.imp) * 1.5 + num(u.hp) * 0.2;
  if (kwHas(u, '守卫')) t += 3;
  if (kwAny(u, '守护')) t += 2;
  if (kwHas(u, '圣盾')) t += 1.5;
  if (kwHas(u, '践踏')) t += 1;
  return t;
}

/* ── 组卡：返回 12 名目 30 张（同名 ≤3，主色＋灰）──────────────────── */
function build(pool) {
  const list = pool || [];
  const have = {};
  for (const c of list) have[c.id] = c;

  const out = [];
  let total = 0;
  for (const d of DECK) {
    if (!have[d.id]) continue;
    out.push({ id: d.id, n: d.n });
    total += d.n;
  }
  if (total >= 30) return out;

  // 兜底：卡池缺牌时按评分补齐到 30 张（同名 ≤3）
  const used = {};
  for (const o of out) used[o.id] = o.n;
  const rest = list.slice().sort((a, b) => {
    let sa = 0, sb = 0;
    try {
      if (typeof api !== 'undefined' && api && api.scoreCard) {
        sa = api.scoreCard(a); sb = api.scoreCard(b);
      }
    } catch (e) { /* 忽略 */ }
    return sb - sa;
  });
  for (const c of rest) {
    if (total >= 30) break;
    const room = 3 - (used[c.id] || 0);
    if (room <= 0) continue;
    const n = Math.min(room, 30 - total);
    used[c.id] = (used[c.id] || 0) + n;
    total += n;
    const found = out.find((o) => o.id === c.id);
    if (found) found.n = used[c.id];
    else out.push({ id: c.id, n });
  }
  return out;
}

/* ── 出牌评分 ─────────────────────────────────────────────────────── */
function scorePlay(view, card, mv) {
  const me = view.me, opp = view.opp;
  const nMy = me.board.length, nOpp = opp.board.length;
  const id = card.id;
  let s;

  switch (id) {
    /* 解场：优先拆守卫（挡我打脸）与高 IMP */
    case 'LQ01-131':
    case 'LQ01-290': {
      const t = (opp.board || []).find((x) => x.uid === mv.target);
      if (!t) return -900;
      let worth = threatOf(t);
      if (num(t.hp) <= 3) worth += 4;            // 一击致死
      s = 48 + worth;
      if (nMy === 0) s -= 14;                    // 自己场面空，先别急着拆
      if (kwHas(t, '守卫')) s += 5;              // 清守卫才能打脸
      break;
    }
    /* 终结者 5/4/7 IMP4 + 全场 +1/+1 */
    case 'LQ01-136': {
      s = 54;
      if (nMy >= 1) s += 6;
      if (nOpp === 0) s += 12;
      if (opp.life <= 8) s += 10;
      break;
    }
    /* 涡流长老：出牌越多 ATK 越高，越早铺越强 */
    case 'LQ01-140': {
      const has = (me.board || []).some((u) => u.name === '涡流长老');
      s = has ? 24 : 48;
      if (nOpp >= 2) s += 6;
      break;
    }
    /* 守卫墙：292 / 133 */
    case 'LQ01-133':
    case 'LQ01-292': {
      s = 44 - 3 * nMy;
      if (nOpp >= 2) s += 10;                    // 有守卫就逼对手来撞
      if (nMy <= 2) s += 8;
      if (id === 'LQ01-133') {
        const t = (me.board || []).find((x) => x.uid === mv.target);
        if (!t) s = -900;                       // 堤灵必须指定友方单位
        else s += num(t.hp) * 0.5;               // 优先加在肉厚的单位上
      }
      break;
    }
    /* 小单位铺 IMP */
    case 'LQ01-141':
    case 'LQ01-127': {
      s = 40 - 3 * nMy;
      if (nMy <= 2) s += 10;
      if (nOpp === 0) s += 6;
      break;
    }
    /* 过牌 */
    case 'LQ01-138': {
      s = me.hand.length <= 6 ? 40 : -900;      // 1 费抽 2，别把手牌撑爆
      break;
    }
    case 'LQ01-129': {
      s = me.hand.length <= 5 ? 30 : -900;
      break;
    }
    /* 冻结（引擎结算敌方第一个单位） */
    case 'LQ01-134': {
      const t = (opp.board || [])[0];
      if (!t) s = -900;
      else s = (num(t.atk) >= 3 || num(t.imp) >= 3) ? 42 : 16;
      break;
    }
    /* 结界：全体守护1，替我方灵体承伤 */
    case 'LQ01-135': {
      s = 28;
      if (nOpp >= 2) s += 10;
      if (nMy >= 2) s += 4;
      break;
    }
    default: {
      s = 18;
      try {
        if (typeof api !== 'undefined' && api && api.scoreCard) s = 16 + api.scoreCard(card);
      } catch (e) { /* 忽略 */ }
      break;
    }
  }
  return s;
}

/* ── 升灵评分：素材会被消耗，只在划算时升 ─────────────────────────── */
function scoreAscend(view, mv) {
  const me = view.me, opp = view.opp;
  const nMy = me.board.length, nOpp = opp.board.length;
  if (mv.id === 'LQ01-275') {          // 潮汐共鸣锚 4/3/6，降临：对手 2 点
    if (opp.life <= 2) return 300;
    return 20 + (opp.life <= 9 ? 20 : 0) - (nMy > 4 ? 16 : 0);
  }
  if (mv.id === 'LQ01-276') {          // 深渊潮主 6/5/7，降临：全体敌方 2 点
    return (nOpp >= 3 ? 44 : 16) - (nMy > 4 ? 10 : 0);
  }
  if (mv.id === 'LQ01-277') {          // 大潮谐律盘 7/5/8，降临：抽 3
    return (me.hand.length <= 3 ? 40 : 18) - (nMy > 5 ? 8 : 0);
  }
  return 12;
}

/* ── 攻击评分：IMP 是唯一的直击货币 ───────────────────────────────── */
function pickAttack(view, moves) {
  const me = view.me, opp = view.opp;
  const mine = (uid) => (me.board || []).find((x) => x.uid === uid);
  const theirs = (uid) => (opp.board || []).find((x) => x.uid === uid);

  let best = null, bestScore = -Infinity;
  for (const mv of moves) {
    const u = mine(mv.uid);
    if (!u) continue;
    let s;
    if (mv.target === 'face') {
      const imp = num(u.imp);
      if (imp <= 0) continue;                     // 没有 IMP，打脸无意义
      s = 22 + imp * 3.5;
      if (imp >= opp.life) s += 300;              // 斩杀
      const blockers = (opp.board || []).filter((b) => !b.attacked);
      if (blockers.length) {
        let worst = 0;
        for (const b of blockers) worst = Math.max(worst, num(b.atk));
        if (worst >= num(u.hp)) s -= 8;           // 会被换掉，谨慎
        else s += 5;                             // 挡不住我，稳赚
      } else s += 7;
      s -= 1.2 * me.board.length;                // 别为打脸放弃场面
    } else {
      const t = theirs(mv.target);
      if (!t) continue;
      const kills = num(u.atk) >= num(t.hp);
      const dies = num(t.atk) >= num(u.hp);
      s = 4;
      if (kills) s += 7;
      if (!dies) s += 5;
      if (kills && dies) s -= 2;                 // 换掉一个我也死了，亏
      if (kwHas(t, '守卫')) s += 5;              // 清守卫解封打脸
      if (num(t.imp) >= 3) s += 3;
      s += num(t.atk) * 0.3;
      s -= num(u.imp) * 0.25;                    // 别拿高 IMP 单位去换
    }
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  return best;
}

/* ── 主决策 ───────────────────────────────────────────────────────── */
function decide(view, moves) {
  const me = view.me, opp = view.opp;
  const plays = moves.filter((m) => m.type === 'play');
  const attacks = moves.filter((m) => m.type === 'attack');
  const ascends = moves.filter((m) => m.type === 'ascend');
  const avatarMove = moves.find((m) => m.type === 'avatar');
  const passMove = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  const avatarEarly = me.avatar && me.avatar.timing !== 'late';

  /* 0) 斩杀：IMP 够就打脸；升灵 275 的 2 点也能致死 */
  for (const mv of attacks) {
    if (mv.target !== 'face') continue;
    const u = (me.board || []).find((x) => x.uid === mv.uid);
    if (u && num(u.imp) >= opp.life) return mv;
  }
  for (const mv of ascends) {
    if (mv.id === 'LQ01-275' && opp.life <= 2) return mv;
  }

  /* 1) 灵体启动：温蒂妮免费抽 1，先开它把手牌抓满 */
  if (avatarMove && avatarEarly && !me.avatar.used && me.hand.length <= 7) {
    return avatarMove;
  }

  /* 2) 出牌 / 升灵，取分数最高者 */
  let best = null, bestScore = -Infinity;
  for (const mv of plays) {
    const card = (me.hand || [])[mv.i];
    if (!card) continue;
    const s = scorePlay(view, card, mv);
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  for (const mv of ascends) {
    const s = scoreAscend(view, mv);
    if (s > bestScore) { bestScore = s; best = mv; }
  }
  if (best && bestScore >= 22) return best;

  /* 3) 场面铺开前先动灵体（late 时机） */
  if (avatarMove && !me.avatar.used && me.hand.length <= 7) return avatarMove;

  /* 4) 无牌可出就进攻 */
  const atk = pickAttack(view, attacks);
  if (atk) return atk;

  return passMove;
}

function choose(view, moves) {
  try {
    if (!moves || !moves.length) return null;
    const mv = decide(view, moves);
    if (mv && moves.indexOf(mv) >= 0) return mv;
    return moves[moves.length - 1];
  } catch (e) {
    try { return moves[moves.length - 1]; } catch (e2) { return null; }
  }
}

/* ── 防守方阻挡窗口 ───────────────────────────────────────────────── */
function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return null;
    const noBlock = bmoves.find((m) => m.type === 'noBlock') || bmoves[bmoves.length - 1];
    const me = view.me, opp = view.opp;
    const oppBoard = opp.board || [];

    // 攻击者：引擎宣告攻击时会置 attacked，取 IMP 最高的那个（最可能在打脸）
    let attacker = null;
    for (const u of oppBoard) {
      if (!u.attacked) continue;
      if (!attacker || num(u.imp) > num(attacker.imp)) attacker = u;
    }
    if (!attacker) {
      for (const u of oppBoard) {
        if (!attacker || num(u.atk) > num(attacker.atk)) attacker = u;
      }
    }
    if (!attacker) return noBlock;

    const atk = num(attacker.atk);
    const imp = num(attacker.imp);
    const urgent = imp >= me.life;              // 不挡就要掉命

    let best = null, bestScore = -Infinity;
    for (const mv of bmoves) {
      if (mv.type !== 'block') continue;
      const u = (me.board || []).find((x) => x.uid === mv.uid);
      if (!u) continue;
      let s = 0;
      if (num(u.atk) >= atk) s += 4;            // 能换掉他
      if (num(u.hp) > atk) s += 3;              // 我能活
      if (num(u.hp) <= atk) s -= 4;             // 我会死
      s += num(u.imp) * 0.2;                    // 优先保住高 IMP 单位
      if (urgent) s += 6;
      if (s > bestScore) { bestScore = s; best = mv; }
    }
    if (urgent) return best || noBlock;
    return bestScore >= 5 ? best : noBlock;
  } catch (e) {
    try { return bmoves[bmoves.length - 1]; } catch (e2) { return null; }
  }
}
