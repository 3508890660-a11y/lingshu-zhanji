/**
 * 灵枢战纪 · 颜色构筑 AI 脚本
 * 执行模型：deepseek-v4.1-flash（显示名 deepseek v4.1flash）
 * 主色：青（资源：法力，min(回合+1, 6)，消耗制，回合开始抽 2、回合末按打出数额外抽）
 * 策略：潮汐节拍（低费铺场 + 精准点杀 + 升灵换身材 + 月潮终曲收束）
 *
 * 只用 view / moves 公开信息；不读对手手牌，不硬编码单位 uid。
 */
const meta = {
  name: 'deepseek v4.1flash · 潮汐节拍',
  desc: '执行模型 deepseek-v4.1-flash；颜色 青（法力）；策略 潮汐节拍：1~2 费铺场抢节奏，碎晶冲击/遣返点杀开路，升灵换掉小件，6 费月潮终曲收束',
  id: 'model:deepseekv41flash',
  color: '青'
};

/* ────────────────────────────── 卡组 ──────────────────────────────
 * 30 张 · 10 名目 ×3（青 7 名目 + 灰 3 名目）
 * 曲线：1~2 费 21 / 3~4 费 6 / 5~6 费 3 / 7+ 0
 * 青的法力上限是 6、每回合稳定抽 2~3 张，低曲线＝把"打得多→回合末多抽"转成正循环。
 */
const DECK_LIST = [
  ['LQ01-127', 3], // 潮汐幼灵   法力1  1/1/2  潮汐（涨潮 +1 ATK）
  ['LQ01-138', 3], // 连击共鸣   法力1  抽 2
  ['LQ01-298', 3], // 祭品石     通用1  地标：+2 法力（灰）
  ['LQ01-137', 3], // 风暴信使   法力2  2/1/2
  ['LQ01-290', 3], // 碎晶冲击   通用2  对 1 个单位 3 点伤害（灰）
  ['LQ01-292', 3], // 石肤守卫   通用2  1/2/3  守卫（灰）
  ['LQ01-294', 3], // 遣返       通用2  将 1 个单位返回手牌（灰）
  ['LQ01-133', 3], // 潮卫·堤灵  法力3  2/2/4→2/2/5  守卫
  ['LQ01-140', 3], // 涡流长老   法力4  3/2/4  涡流3
  ['LQ01-136', 3]  // 月潮终曲   法力6  5/4/7  全体 +1/+1
];

function build(pool) {
  const cards = Array.isArray(pool) ? pool.filter((c) => c && c.id) : [];
  const have = new Set(cards.map((c) => c.id));
  const used = Object.create(null);
  const out = [];
  let total = 0;

  for (let i = 0; i < DECK_LIST.length; i++) {
    const id = DECK_LIST[i][0];
    const n = DECK_LIST[i][1];
    if (!have.has(id) || used[id]) continue;
    out.push({ id: id, n: n });
    used[id] = n;
    total += n;
  }

  // 兜底：卡池与预期不一致时按评分补齐到 30 张（同名牌 ≤3）
  if (total < 30) {
    const rest = cards
      .filter((c) => !used[c.id])
      .map((c) => {
        let s = 1;
        try {
          if (api && typeof api.scoreCard === 'function') s = api.scoreCard(c) || 0;
        } catch (e) { s = 1; }
        return { c: c, s: s + (c.type === '单位' ? 4 : 0) };
      })
      .sort((a, b) => b.s - a.s);
    for (let i = 0; i < rest.length && total < 30; i++) {
      const n = Math.min(3, 30 - total);
      out.push({ id: rest[i].c.id, n: n });
      used[rest[i].c.id] = n;
      total += n;
    }
  }
  while (total > 30 && out.length) {
    const last = out[out.length - 1];
    const cut = Math.min(last.n, total - 30);
    last.n -= cut;
    total -= cut;
    if (last.n <= 0) out.pop();
  }
  return out;
}

/* ────────────────────────────── 小工具 ────────────────────────────── */

function findUnit(list, uid) {
  if (!Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) if (list[i] && list[i].uid === uid) return list[i];
  return null;
}

function hasKw(u, k) {
  return !!(u && Array.isArray(u.kw) && u.kw.indexOf(k) >= 0);
}

function dmgOf(card) {
  let n = 0;
  const ef = (card && card.effects) || [];
  for (let i = 0; i < ef.length; i++) if (ef[i].do === 'dmg') n += ef[i].n || 0;
  return n;
}

function isGuard(u) {
  return hasKw(u, '守卫');
}

function isReducer(u) {
  return hasKw(u, '守护1') || hasKw(u, '守护2');
}

/* ────────────────────────────── 出牌评分 ──────────────────────────────
 * 一个动作一个分数，choose 每次只挑当前分数最高的那一个；状态推进后重算，
 * 所以"先铺场再上大牌"这种顺序不是写死的 if-else，而是分数随局面自然变化。
 */
function scorePlay(view, card, mv) {
  const me = view.me;
  const opp = view.opp;
  const id = card.id;
  const enemyT = mv.target ? findUnit(opp.board, mv.target) : null;

  // ① 1 费抽 2：青全卡池最强的节奏牌，任何时点都先打
  if (id === 'LQ01-138') return 92;

  // ② 祭品石：1 费换 2 法力，前两块最赚，后面边际递减
  if (id === 'LQ01-298') return me.lands.length >= 2 ? 46 : 82;

  // ③ 月潮终曲：全体 +1/+1 只惠及已在场的单位，越晚打越值
  if (id === 'LQ01-136') return 44 + 9 * me.board.length;

  // ④ 点杀 / 弹回：按目标威胁与是否致死打分
  if (enemyT) {
    const d = dmgOf(card);
    if (id === 'LQ01-294') {
      const s = 26 + (enemyT.atk || 0) * 3 + (enemyT.imp || 0) * 2
        + (isGuard(enemyT) ? 6 : 0) + (isReducer(enemyT) ? 3 : 0);
      return s;
    }
    const kills = d >= enemyT.hp;
    let s = 26 + d * 4 + (d / Math.max(1, enemyT.hp)) * 16;
    if (kills) s += 18 + (enemyT.atk || 0) * 2.5 + (enemyT.imp || 0) * 1.5;
    if (isGuard(enemyT)) s += 5;
    if (isReducer(enemyT)) s += 2;
    return s;
  }

  // ⑤ 单位：身材 + 关键词；守卫自带"挡脸"价值
  if (card.type === '单位') {
    let s = 40 + (card.atk || 0) * 3 + (card.hp || 0) * 2 + (card.imp || 0);
    if (isGuard(card)) s += 9;
    if (isReducer(card)) s += 4;
    if (hasKw(card, '潮汐')) s += 2;
    if (card.atk === 0 && card.hp <= 1) s -= 6;   // 纯素材身板，本套不需要
    return s;
  }

  return 16; // 未知卡兜底：能打就打，但不抢单位的顺位
}

function pickPlay(view, moves) {
  let best = null;
  let bestS = -1;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'play') continue;
    const card = view.me.hand[m.i];
    if (!card) continue;
    const s = scorePlay(view, card, m);
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}

/* ────────────────────────────── 攻击评分 ────────────────────────────── */

function pickAttack(view, moves) {
  const me = view.me;
  const opp = view.opp;
  const lifeGap = Math.max(0, 20 - opp.life);
  let best = null;
  let bestV = 0;

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'attack') continue;
    const u = findUnit(me.board, m.uid);
    if (!u) continue;
    const atk = u.atk || 0;
    const imp = u.imp || 0;
    let v = 0;

    if (m.target === 'face') {
      v = 0.6 + imp * 1.7 + lifeGap * 0.1;
      if (opp.life <= imp + 2) v += 10;          // 已经进入射程，优先压脸
    } else {
      const t = findUnit(opp.board, m.target);
      if (!t) continue;
      const kills = atk >= t.hp;
      const dies = (t.atk || 0) >= u.hp;
      if (kills) v += 5 + (t.atk || 0) * 1.4 + (t.hp || 0) * 0.4;
      if (dies) v -= 3.5 + atk * 0.8 + (u.hp || 0) * 0.4;
      if (isGuard(t)) v += 2;                    // 守卫必须拆，否则永远打不到脸
      if (isReducer(t)) v -= 1;
    }
    if (v > bestV) { bestV = v; best = m; }
  }
  return bestV >= 1 ? best : null;
}

/* ────────────────────────────── 斩杀判定 ────────────────────────────── */

function pickLethal(view, moves) {
  const me = view.me;
  const opp = view.opp;
  const impOf = {};
  let sum = 0;
  let any = null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'attack' || m.target !== 'face') continue;
    const u = findUnit(me.board, m.uid);
    if (!u) continue;
    any = any || m;
    if (impOf[m.uid] === undefined) {
      impOf[m.uid] = u.imp || 0;
      sum += u.imp || 0;
    }
  }
  if (!any) return null;

  // 守护单位会在直击时代替承伤，按每个 −2 粗估留出余量
  let reserve = 0;
  for (let i = 0; i < opp.board.length; i++) if (isReducer(opp.board[i])) reserve += 2;
  if (sum - reserve < opp.life) return null;

  // 能斩杀时先打 IMP 最高的那一次
  let best = any;
  let bestImp = -1;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m || m.type !== 'attack' || m.target !== 'face') continue;
    const u = findUnit(me.board, m.uid);
    if (u && (u.imp || 0) > bestImp) { bestImp = u.imp || 0; best = m; }
  }
  return best;
}

/* ────────────────────────────── 升灵 ────────────────────────────── */

function pickAscend(view, moves) {
  const me = view.me;
  if (!me.outerReady) return null;
  if (me.board.length < 3) return null;   // 至少留 1 个单位守场
  if (me.life <= 7) return null;          // 残血时不拿场面换身材
  for (let i = 0; i < moves.length; i++) {
    if (moves[i] && moves[i].type === 'ascend') return moves[i];
  }
  return null;
}

/* ────────────────────────────── 主决策 ────────────────────────────── */

function choose(view, moves) {
  const pass = (function () {
    for (let i = moves.length - 1; i >= 0; i--) if (moves[i] && moves[i].type === 'pass') return moves[i];
    return moves[moves.length - 1];
  })();

  try {
    if (!view || !view.me || !Array.isArray(moves) || !moves.length) return pass;

    // 1) 能斩杀就先杀，不做任何多余展开
    const lethal = pickLethal(view, moves);
    if (lethal) return lethal;

    // 2) 灵体启动（温蒂妮：免费抽 1）——先抽再决定出牌
    for (let i = 0; i < moves.length; i++) {
      if (moves[i] && moves[i].type === 'avatar' && !(view.me.avatar && view.me.avatar.used)) return moves[i];
    }

    // 3) 铺场 / 点杀 / 抽牌：分数最高的那一张
    const play = pickPlay(view, moves);
    if (play) return play;

    // 4) 攻击：先打正收益的交换或压脸
    const atk = pickAttack(view, moves);
    if (atk) return atk;

    // 5) 攻击打完再升灵：被献祭的素材已经用完这一刀
    const asc = pickAscend(view, moves);
    if (asc) return asc;

    return pass;
  } catch (e) {
    return pass;
  }
}

/* 阻挡窗口交给引擎的 defaultBlock：
 * block(view, bmoves) 的 view 里没有"谁在攻击、打多少"的信息，
 * 自己写只能看到 bmoves 的 uid 列表，信息量反而不如引擎内置启发式。 */
