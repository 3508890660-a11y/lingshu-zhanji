/* ══════════════════════════════════════════════════════════════════════
 * 灵枢战纪 · 第一弹 ── minimaxm31flash（第二阶段：构筑 + 对局脚本）
 *
 *   主色：绿
 *   策略：地标引擎 · 践踏终结
 *
 * ⚠ 本脚本的一切判断都按**引擎实现**写（js/engine/rules.js / cards.gen.js），
 *   卡面文字与引擎不一致时一律以引擎为准。绿有三条必须记住的引擎口径：
 *
 *   1) 法力：refreshRes 每回合**重置**为 `2 + 地标数`（不累加）。
 *      地标自己的 res 值（祭品石 2、其余 1）只在**打出当回合**一次性进池，
 *      下回合 refreshRes 会把它盖掉；地标的长期价值只有「+1 法力/回合 +1 手牌位」。
 *   2) 抽牌：绿**回合开始不抽牌**。结束阶段先把手牌弃到 7，再补到
 *      `min(地标数+1, 7)`。所以 6 张地标就把手牌拉满，第 7 张只涨法力不涨牌。
 *   3) 出牌：PLAY_CAP 只有 粉2/蓝2/银3，**绿没有每回合出牌张数上限**。
 *      回合可用法力 = 2 + 地标数 + 1（盖亚被动） + 2（盖亚启动，免费）＝ 地标数 + 5。
 * ══════════════════════════════════════════════════════════════════════ */

const meta = {
  name: 'minimaxm31flash · 绿洲引擎',
  desc: '执行模型 minimax-m3.1-flash；颜色 绿；策略 地标引擎·践踏终结；六张地标把法力与每回合手牌同时拉满，成长单位吃满加攻，践踏大怪硬穿小怪直击灵体。',
  id: 'model:minimaxm31flash',
  color: '绿'
};

/* ─────────────────────────── 卡号 ─────────────────────────── */
const C = {
  land2: 'LQ01-298',    // 祭品石　　通用1 地标：打出当回合 +2 法力，此后每回合 +1 法力 +1 手牌位
  land1: 'LQ01-056',    // 幼叶之池　法力1 地标：+1 法力 / +1 手牌位
  land1b: 'LQ01-284',   // 灵脉碎片　通用1 地标：+1 法力 / +1 手牌位
  seed: 'LQ01-055',     // 盖亚幼株　法力1 单位 1/1/1「成长」：引擎每回合永久 +1/+1/+1
  draw1: 'LQ01-286',    // 褪色符文　通用1 法术：抽 1
  buff: 'LQ01-289',     // 借律　　　通用1 法术：己方全体 +1 ATK（永久，只吃已在场的单位）
  mid: 'LQ01-063',      // 林冠漫步者 法力3 单位 2/2/3：指定己方单位 +1/+1（永久）
  guard: 'LQ01-057',    // 摇篮藤根　法力2 单位 1/2/3「守卫」：强制对手来打我
  aoe: 'LQ01-072',      // 藤海怒涛　法力4 法术：敌方全体 3 点 + 固定回 1 血
  big1: 'LQ01-066',     // 裂地巨犀　法力5 单位 5/4/5「践踏」
  big2: 'LQ01-067',     // 林冠泰坦　法力6 单位 6/5/6「践踏」「再生」
  kill: 'LQ01-059',     // 猎杀弱肉　法力3 单位 2/1/2：破坏 1 个 ATK≤2 的单位
  counter: 'LQ01-296'   // 逆流　　　通用2 瞬间：「反击」——引擎可无效化**任何**被宣告的卡
};

/* ─────────────────────────── 组卡 ─────────────────────────── */
function build(pool) {
  // 30 张 / 13 个名目 / 同名 ≤3。构成见设计说明 §3。
  const plan = [
    [C.land2, 3], [C.land1, 2], [C.land1b, 1],   // 6 张地标：手牌上限 min(6+1,7)=7 已拉满
    [C.seed, 2], [C.buff, 3], [C.draw1, 1],       // 1 费段：成长引擎 + 全体加攻 + 唯一的额外补牌
    [C.guard, 3], [C.counter, 2],                 // 2 费段：守卫墙 + 逆流
    [C.mid, 2], [C.kill, 2],                      // 3 费段：身材件 + 点杀
    [C.aoe, 3],                                   // 4 费段：清场续航
    [C.big1, 3], [C.big2, 3]                      // 5~6 费段：践踏终结
  ];
  const list = Array.isArray(pool) ? pool : [];
  const inPool = new Map();
  for (const card of list) inPool.set(card.id, card);

  const out = [];
  const used = new Map();
  let total = 0;
  for (const pair of plan) {
    const id = pair[0], n = pair[1];
    if (!inPool.has(id)) continue;
    out.push({ id: id, n: n });
    used.set(id, n);
    total += n;
  }
  // 兜底：牌池变动时用池内卡补齐到 30（同名仍守 ≤3）
  if (total < 30) {
    const spare = list
      .filter((c) => c && c.id && (used.get(c.id) || 0) < 3)
      .sort((a, b) => (a.cost?.n || 0) - (b.cost?.n || 0));
    let i = 0;
    while (total < 30 && spare.length && i < 400) {
      const card = spare[i % spare.length];
      const cur = used.get(card.id) || 0;
      if (cur < 3) { out.push({ id: card.id, n: 1 }); used.set(card.id, cur + 1); total += 1; }
      i += 1;
    }
  }
  return out;
}

/* ─────────────────────────── 小工具 ─────────────────────────── */
const myUnit = (view, uid) => (view.me.board || []).find((u) => u.uid === uid);
const oppUnit = (view, uid) => (view.opp.board || []).find((u) => u.uid === uid);
const handCard = (view, i) => (view.me.hand || [])[i];
const kwOf = (u) => (u && u.kw) || [];
const hasKw = (u, k) => kwOf(u).indexOf(k) >= 0;
const atkOf = (u) => (u && u.atk) || 0;
const hpOf = (u) => (u && u.hp) || 0;
const impOf = (u) => (u && u.imp) || 0;

/**
 * 守护拦截（引擎 bestGuard）：
 * 对方有守护1/守护2 时，只要「我打不死它」**或**「对方已濒死」，我的直击就被它替身吃掉。
 * 注意：引擎的 bestGuard 是**每个守护单位各自判定**，任一命中即拦截。
 */
function guardedBy(view, u) {
  const opp = view.opp.board || [];
  const lethal = (view.opp.life || 0) <= impOf(u);
  for (const g of opp) {
    const kw = kwOf(g).find((k) => k === '守护1' || k === '守护2');
    if (!kw) continue;
    const x = parseInt(kw.slice(2), 10) || 0;
    if (Math.max(0, atkOf(u) - x) < hpOf(g)) return true;
    if (lethal) return true;
  }
  return false;
}

/**
 * 阻挡预测（引擎 defaultBlock 的复刻）：
 *   kills = 阻挡者 ATK ≥ 我的攻击者耐久（能杀掉我）
 *   dies  = 我的 ATK ≥ 阻挡者耐久（我能杀掉它）
 *   计分 kills+3 / !dies+2 / dies&&!kills −3 / 对方濒死+5，取最大且 >0 才挡。
 * ⇒ 结论：**我的 ATK 够高时，它手上能被我打死的单位都拦不住我**；
 *   反之只要它有一只打不死的单位，我的直击就全被吃掉。
 * 引擎里 usedBlock 不可见（view 不给），这里保守地把未攻击过的对方单位都算作可用阻挡者。
 */
function predictBlock(view, u) {
  const opp = view.opp.board || [];
  const blockers = opp.filter((b) => !b.attacked);
  if (!blockers.length) return { blocked: false, over: 0, blocker: null };
  const lethal = (view.opp.life || 0) <= impOf(u);
  let best = null;
  for (const b of blockers) {
    const kills = atkOf(b) >= hpOf(u);
    const dies = atkOf(u) >= hpOf(b);
    let v = 0;
    if (kills) v += 3;
    if (!dies) v += 2;
    if (dies && !kills) v -= 3;
    if (lethal) v += 5;
    if (!best || v > best.v) best = { b: b, v: v };
  }
  if (!best || best.v <= 0) return { blocked: false, over: 0, blocker: null };
  const b = best.b;
  const dies = atkOf(u) >= hpOf(b);
  // 践踏溢出只在「打单位且对方被打死」时结算（resolveAttack）
  const over = (hasKw(u, '践踏') && dies) ? Math.max(0, atkOf(u) - hpOf(b)) : 0;
  return { blocked: true, over: over, blocker: b };
}

/** 这次直击真正能打到对方灵体上的伤害 */
function faceDamage(view, u) {
  if (guardedBy(view, u)) return 0;
  const pb = predictBlock(view, u);
  if (pb.blocked) return pb.over;
  return impOf(u);
}

/** 一次攻击的收益估值（正数＝值得做） */
function attackScore(view, m) {
  const u = myUnit(view, m.uid);
  if (!u) return -999;
  const myAtk = atkOf(u);
  // 守卫单位是墙：打出去就等于这回合放弃锁脸（引擎里 attacked 之后不能再挡）
  const wallPenalty = hasKw(u, '守卫') ? 1.6 : 0;

  if (m.target === 'face') {
    if (guardedBy(view, u)) {
      // 伤害全进守护单位，我自己还要吃守护者的 ATK
      let back = 0;
      for (const g of view.opp.board || []) {
        const kw = kwOf(g).find((k) => k === '守护1' || k === '守护2');
        if (!kw) continue;
        const x = parseInt(kw.slice(2), 10) || 0;
        if (Math.max(0, myAtk - x) < hpOf(g) || (view.opp.life || 0) <= impOf(u)) {
          if (atkOf(g) > back) back = atkOf(g);
        }
      }
      return 0.4 - (back >= hpOf(u) ? 1.2 : 0) - wallPenalty;
    }
    const pb = predictBlock(view, u);
    if (!pb.blocked) return impOf(u) * 2.6 - wallPenalty;     // 直击灵体
    let v = pb.over * 2.6;                                  // 被挡：只有践踏溢出能到脸
    const b = pb.blocker;
    if (b) {
      if (myAtk >= hpOf(b)) v += 2.0 + impOf(b) * 2.1 + atkOf(b) * 0.9;   // 换掉它
      if (atkOf(b) >= hpOf(u)) v -= 1.7;                                    // 我方单位阵亡
    }
    return v - wallPenalty;
  }

  const t = oppUnit(view, m.target);
  if (!t) return -999;
  let v = 0;
  if (hasKw(u, '践踏')) v += Math.max(0, myAtk - hpOf(t)) * 2.6;   // 践踏溢出
  if (myAtk >= hpOf(t)) {
    v += 2.0 + impOf(t) * 2.1 + atkOf(t) * 0.9;                    // 击杀
    if (atkOf(t) < hpOf(t)) v += 0.7;
  }
  if (atkOf(t) >= hpOf(u)) v -= 1.7;                                // 我方单位阵亡
  if (impOf(t) >= 2) v += 1.0;                                     // 拆掉主力
  return v - wallPenalty;
}

/* ─────────────────────── 出牌估值（按引擎实际效果） ─────────────────────── */
function playValue(view, card, move) {
  const id = card.id;
  const oppB = view.opp.board || [];
  const myB = view.me.board || [];
  const life = view.me.life || 0;
  const round = view.round || 1;
  const lands = (view.me.lands || []).length;

  /* 地标：长期价值是「+1 法力/回合 +1 手牌位」，一次性 +res 只在当回合有效 */
  if (id === C.land2 || id === C.land1 || id === C.land1b) {
    let v = 3.6;
    if (lands < 6) v += 1.2;          // 手牌上限 min(地标数+1,7)：第 6 张把牌位拉满
    if (id === C.land2) v += 0.5;      // 祭品石打出当回合立刻 +2 法力
    if (round <= 4) v += 0.8;          // 越早落地，每回合多 1 张牌的时间越长
    return v;
  }
  if (id === C.seed) {                 // 盖亚幼株：引擎每回合永久 +1 ATK/+1 耐久
    let v = 2.3;
    if (round <= 5) v += 0.9;          // 成长越早开始，复利越多
    if (myB.length <= 2) v += 0.4;     // 场面薄的时候，1 费身体最值
    return v;
  }
  if (id === C.draw1) return 2.4;      // 褪色符文：1 费换 1 张（唯一能突破手牌上限的牌）
  if (id === C.buff) {                 // 借律：全体 +1 ATK，**只吃已在场的单位**
    if (!myB.length) return -5;
    return Math.min(4.0, 1.0 + myB.length * 0.9);
  }
  if (id === C.mid) {                  // 林冠漫步者：2/2/3 + 指定己方单位 +1/+1（永久）
    if (!myB.length) return -5;
    const tgt = myUnit(view, move.target);
    let ts = 0;
    if (tgt) {
      ts = (atkOf(tgt) + impOf(tgt)) * 0.45 + hpOf(tgt) * 0.08;
      if (hasKw(tgt, '成长')) ts += 1.4;      // 成长单位吃 +1/+1 会复利
    }
    return 3.6 + ts + (myB.length <= 3 ? 0.8 : 0);
  }
  if (id === C.guard) {                // 摇篮藤根 1/2/3 守卫：强制对手来打我
    let v = 2.4;
    const threat = oppB.filter((u) => impOf(u) >= 1).length;
    if (threat) v += 1.6 + Math.min(1.4, threat * 0.4);
    if (round <= 3) v += 1.2;         // 前期最缺墙，守卫要早落地
    if (myB.length >= 7) v -= 1.0;
    return v;
  }
  if (id === C.aoe) {                  // 藤海怒涛：敌方全体 3 点 + 固定回 1 血
    if (!oppB.length) return life <= 8 ? 1.0 : -5;
    const kills = oppB.filter((u) => hpOf(u) <= 3).length;
    let v = kills * 3.0;
    if (life <= 10) v += 2.0;
    if (oppB.length >= 3) v += 2.0;    // 对面场面压起来了，清场优先
    if (oppB.length >= 4) v += 1.0;
    if (!kills) v -= 2.5;               // 一只都打不死 → 废牌
    return v;
  }
  if (id === C.kill) {                 // 猎杀弱肉：引擎自动挑 ATK 最高且 ≤2 的那只
    const pool = oppB.filter((u) => atkOf(u) <= 2);
    if (!pool.length) return -5;
    const t = pool.slice().sort((a, b) => atkOf(b) - atkOf(a))[0];
    let v = 3.0 + impOf(t) * 2.0 + atkOf(t) * 0.9;
    if (pool.length >= 2) v += 1.0;    // 小怪成群时点杀更值
    return v;
  }
  if (id === C.big2) return 7.6;       // 林冠泰坦 6/5/6 践踏再生
  if (id === C.big1) return 7.2;       // 裂地巨犀 5/4/5 践踏
  if (id === C.counter) return 0.5;    // 逆流：留在手里当反击用，别在主阶段当牌打
  return 1.0;
}

/* ─────────────────────────── 主决策 ─────────────────────────── */
function choose(view, moves) {
  const fallback = (Array.isArray(moves) && moves.length) ? moves[moves.length - 1] : null;
  try {
    if (!view || !Array.isArray(moves) || !moves.length) return fallback;

    /* ① 斩杀：把「真正打得到脸上」的伤害加起来 */
    const faceAttacks = moves.filter((m) => m.type === 'attack' && m.target === 'face' && !m.avatar);
    if (faceAttacks.length) {
      const seen = {};
      let raw = 0, reliable = 0;
      for (const m of faceAttacks) {
        if (seen[m.uid]) continue;
        seen[m.uid] = 1;
        const u = myUnit(view, m.uid);
        if (!u) continue;
        const dmg = faceDamage(view, u);
        raw += dmg;
        if (dmg >= impOf(u)) reliable += dmg;   // 没被守护、也没被挡 ⇒ 必到
      }
      if (raw >= (view.opp.life || 0) || reliable >= (view.opp.life || 0)) {
        let best = faceAttacks[0], bv = -1e9;
        for (const m of faceAttacks) {
          const u = myUnit(view, m.uid);
          let s = faceDamage(view, u) * 2 + atkOf(u) * 0.3;
          if (u && guardedBy(view, u)) s -= 3;
          if (s > bv) { bv = s; best = m; }
        }
        return best;
      }
    }

    /* ② 灵体启动：盖亚的启动免费 +2 法力，先开再出牌 */
    const av = moves.find((m) => m.type === 'avatar');
    if (av) return av;

    /* ③ 出牌：按「每点法力的收益」挑最好的一张
     *    引擎口径：绿每回合 11 点法力、手牌补到 7 张，而牌组均价约 2.6 点法力
     *    → 硬约束是**法力**不是手牌，所以排序必须除以费用。 */
    let bestPlay = null, bestEff = 0.9;
    for (const m of moves) {
      if (m.type !== 'play') continue;
      const card = handCard(view, m.i);
      if (!card) continue;
      const cost = card.cost && card.cost.n ? card.cost.n : 1;
      const eff = playValue(view, card, m) / cost;
      if (eff > bestEff) { bestEff = eff; bestPlay = m; }
    }
    if (bestPlay) return bestPlay;

    /* ④ 攻击：优先践踏溢出／击杀主力／直击灵体 */
    let bestAtk = null, bestAv = 0.05;
    for (const m of moves) {
      if (m.type !== 'attack' || m.avatar) continue;
      const s = attackScore(view, m);
      if (s > bestAv) { bestAv = s; bestAtk = m; }
    }
    if (bestAtk) return bestAtk;

    /* ⑤ 收工 */
    return fallback;
  } catch (err) {
    return fallback;
  }
}

/* ─────────────────────── 阻挡窗口（我是防守方） ─────────────────────── */
function block(view, bmoves) {
  const fallback = (Array.isArray(bmoves) && bmoves.length) ? bmoves[bmoves.length - 1] : null;
  try {
    if (!view || !Array.isArray(bmoves) || !bmoves.length) return fallback;
    const noBlock = bmoves.find((m) => m.type === 'noBlock') || fallback;

    // 引擎在宣告攻击时就把攻击者标成 attacked=true，阻挡窗口里它是对方唯一「刚动过」的那只
    let atkUnit = null;
    for (const u of view.opp.board || []) {
      if (!u.attacked) continue;
      if (!atkUnit || impOf(u) > impOf(atkUnit)) atkUnit = u;
    }
    if (!atkUnit) return noBlock;

    const imp = impOf(atkUnit);
    const myLife = view.me.life || 0;
    let best = null, bestV = 0;
    for (const m of bmoves) {
      if (m.type !== 'block') continue;
      const b = myUnit(view, m.uid);
      if (!b) continue;
      const kills = atkOf(b) >= hpOf(atkUnit);   // 我能杀掉攻击者
      const dies = atkOf(atkUnit) >= hpOf(b);    // 我会被攻击者杀掉
      let v = 0;
      if (kills) v += 3;
      if (!dies) v += 2;
      if (dies && !kills) v -= 3;
      if (myLife <= imp) v += 5;                 // 挡不住就死
      if (v > bestV) { bestV = v; best = m; }
    }
    return best || noBlock;
  } catch (err) {
    return fallback;
  }
}

/* ─────────────────── 响应窗口（我不是行动方；用逆流反制） ─────────────────── */
function respond(view, ctx, moves) {
  const fallback = (Array.isArray(moves) && moves.length) ? moves[moves.length - 1] : null;
  try {
    if (!view || !ctx || !Array.isArray(moves) || !moves.length) return fallback;
    const pass = moves.find((m) => m.type === 'pass') || fallback;
    if (ctx.kind !== 'play') return pass;        // 攻击/结束回合不浪费逆流

    const card = ctx.card || {};
    const res = view.me.res || 0;
    if (res < 2) return pass;                    // 逆流是通用2＝2 点法力

    // 引擎 applyRespond：卡面含「反击」即可无效化**任何**被宣告的卡（含单位），不限于法术。
    const text = card.text || '';
    const cost = card.cost && card.cost.n ? card.cost.n : 0;
    const isUnit = card.type === '单位';
    const isAoe = /所有敌方单位|对所有/.test(text);
    const hitsMe = /伤害/.test(text);

    let threat = cost;
    if (!isUnit) threat += 2;
    if (hitsMe) threat += 2;
    if (isUnit && cost >= 4) threat += 1;        // 4 费以上的大身板值得拦下来
    if (threat < 4) return pass;

    if (isAoe) {
      // 引擎里 072 这类 AoE 只打对面；只有我方有 3 耐久以下的单位才值得反制
      const fragile = (view.me.board || []).filter((u) => hpOf(u) <= 3).length;
      if (!fragile) return pass;
    }
    if (threat < 7 && res < 4) return pass;       // 小威胁留 4 点法力给场面

    const idx = (view.me.hand || []).findIndex((c) => c && c.id === C.counter);
    if (idx < 0) return pass;
    for (const m of moves) {
      if (m.type === 'respond' && m.i === idx) return m;
    }
    return pass;
  } catch (err) {
    return fallback;
  }
}
