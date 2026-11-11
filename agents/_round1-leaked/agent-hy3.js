// 灵枢战纪 · 颜色构筑 AI —— hy3
// 主色：青（资源：法力，消耗；回合开始抽 2；回合末按打出数÷2 额外抽）
// 策略：潮汐快攻（Tide Rush）—— 低费生物铺场、抽牌续航、深海重压解场，
//       灵体【温蒂妮】免费抽牌滚雪球，靠场面抢脸致胜。
// 说明：脚本为无模块源码，由 new Function('api', src + '; return {build, choose, meta}') 编译。

const meta = {
  name: 'hy3 · 潮汐快攻',
  desc: '执行模型 hy3；颜色 青；策略 潮汐快攻；低费生物铺场、抽牌续航、深海重压解场，借灵体温蒂妮免费抽牌滚雪球抢血致胜。',
  id: 'model:hy3',
  color: '青'
};

// 自建卡组：青色 10 名目 ×3 = 30 张，全部主色青，符合「≤3 同名牌、不混色」。
// 曲线：1-2 费 15 张 / 3-4 费 9 张 / 5-6 费 3 张（6 费顶曲线 1 名目）。
// 21 张生物保证铺场与抢脸，9 张法术负责续航（129/138 抽牌）与解场（131 去除）。
const DECK = [
  { id: 'LQ01-127', n: 3 }, // 潮汐幼灵 1/1/2 1费
  { id: 'LQ01-128', n: 3 }, // 溅跃小妖 2/1/2 2费
  { id: 'LQ01-129', n: 3 }, // 潮汐号令 抽1 2费
  { id: 'LQ01-131', n: 3 }, // 深海重压 3伤去除 3费
  { id: 'LQ01-133', n: 3 }, // 潮卫·堤灵 2/2/4 守卫 3费
  { id: 'LQ01-136', n: 3 }, // 月潮终曲·海灵圣母 5/4/7 6费（顶曲线）
  { id: 'LQ01-137', n: 3 }, // 风暴信使 2/1/2 2费
  { id: 'LQ01-138', n: 3 }, // 连击共鸣 抽2 1费
  { id: 'LQ01-140', n: 3 }, // 涡流长老 3/2/4 涡流3 4费
  { id: 'LQ01-141', n: 3 }  // 调律学徒 1/2/2 2费
];

function build(pool) {
  // 优先用自组卡组；若卡池里缺少任一编号（异常），回退到按池评分兜底，保证总能开局。
  const ids = new Set((pool || []).map((c) => c.id));
  if (DECK.every((d) => ids.has(d.id))) return DECK;
  // 兜底：从池中挑评分最高的 10 名目各 3 张
  const scored = (pool || []).map((c) => ({ c, s: scoreCardSafe(c) })).sort((a, b) => b.s - a.s);
  const seen = new Set(); const out = [];
  for (const { c } of scored) { if (out.length >= 10) break; if (seen.has(c.id)) continue; seen.add(c.id); out.push({ id: c.id, n: 3 }); }
  return out;
}

function scoreCardSafe(c) {
  if (!c) return 0;
  if (c.type === '单位') return (c.atk || 0) + (c.imp || 0) * 1.2 + (c.hp || 0) * 1.1;
  const e = c.effects || [];
  let v = 0;
  for (const x of e) { if (x.do === 'draw') v += x.n * 2; else if (x.do === 'dmg') v += x.n * 1.4; else if (x.do === 'aoe') v += x.n * 2.2; }
  return v;
}

// ────────────────────────────── 对战决策 ──────────────────────────────

function choose(view, moves) {
  if (!moves || !moves.length) return { type: 'pass' };
  const me = view.me, opp = view.opp;
  const plays = moves.filter((m) => m.type === 'play');
  const attacks = moves.filter((m) => m.type === 'attack');
  const face = attacks.filter((m) => m.target === 'face');
  const avatars = moves.filter((m) => m.type === 'avatar');
  const pass = moves.find((m) => m.type === 'pass');

  const cardOf = (m) => me.hand[m.i];
  const myBoard = me.board || [];

  // 工具：取攻击者当前 ATK
  const atkOf = (uid) => { const u = myBoard.find((x) => x.uid === uid); return u ? (u.atk || 0) : 0; };

  // 1) 灵体启动【温蒂妮】免费抽 1：纯收益，回合内尽早开。
  if (avatars.length) return avatars[0];

  // 2) 去除【深海重压 LQ01-131】：敌方有威胁（ATK+IMP≥4）时，点掉最强敌人。
  const removal = plays.filter((m) => cardOf(m) && cardOf(m).id === 'LQ01-131');
  if (removal.length && opp.board.length) {
    let best = null;
    for (const u of opp.board) { const s = (u.atk || 0) + (u.imp || 0); if (!best || s > best.s) best = { u, s }; }
    if (best && best.s >= 4) {
      const rm = removal.find((m) => m.target === best.u.uid);
      if (rm) return rm;
    }
  }

  // 3) 危险交换：敌方有 ATK+IMP≥4 的大怪，且我能一击斩杀 → 主动换掉，削其场面。
  if (opp.board.length) {
    const danger = opp.board.filter((u) => (u.atk || 0) + (u.imp || 0) >= 4);
    for (const u of danger) {
      const kill = attacks.find((m) => m.target === u.uid && atkOf(m.uid) >= u.hp);
      if (kill) return kill;
    }
  }

  // 4) 铺场优先：我方场上生物少于对手时，先打出生物。
  const unitPlays = plays.filter((m) => cardOf(m) && cardOf(m).type === '单位');
  if (myBoard.length < opp.board.length && unitPlays.length) {
    return pickPlay(unitPlays, me);
  }

  // 5) 能抢脸就抢脸：用当前可攻击单位打脸（优先最高 ATK）。
  if (face.length) {
    return bestBy(face, (m) => atkOf(m.uid) * 2 + 1);
  }

  // 6) 否则继续铺场 / 打牌（生物优先，其次抽牌与去除，最后任意牌）。
  if (unitPlays.length) return pickPlay(unitPlays, me);
  const drawPlays = plays.filter((m) => cardOf(m) && (cardOf(m).effects || []).some((e) => e.do === 'draw'));
  if (drawPlays.length) return pickPlay(drawPlays, me);
  if (plays.length) return pickPlay(plays, me);

  // 7) 兜底：结束回合。
  return pass || moves[moves.length - 1];
}

// 从一组 play 中选出最优：按卡名分组，优先选「目标指向我方单位」的变体（避免给敌人加 buff），
// 再以单卡价值排序。
function pickPlay(list, me) {
  const byIndex = {};
  for (const m of list) {
    const c = me.hand[m.i];
    if (!c) continue;
    const own = m.target != null && (me.board || []).some((u) => u.uid === m.target);
    const enemy = m.target != null && !own;
    let s = playValue(c);
    if (enemy) s -= 5;      // 给敌方加 buff 的变体降权
    if (!byIndex[m.i] || s > byIndex[m.i].s) byIndex[m.i] = { best: m, s };
  }
  let best = null;
  for (const k in byIndex) if (!best || byIndex[k].s > best.s) best = byIndex[k];
  return best ? best.best : list[0];
}

function playValue(c) {
  if (!c) return 0;
  if (c.type === '单位') return 3 + (c.atk || 0) + (c.imp || 0) + (c.hp || 0) * 0.25;
  if ((c.effects || []).some((e) => e.do === 'draw')) {
    const d = (c.effects || []).filter((e) => e.do === 'draw').reduce((s, e) => s + (e.n || 1), 0);
    return 2 + d;
  }
  if (c.id === 'LQ01-131') return 5; // 去除
  return 1;
}

function bestBy(list, score) {
  let best = list[0], bs = -Infinity;
  for (const m of list) { const s = score(m); if (s > bs) { bs = s; best = m; } }
  return best;
}

// 不自定义 block()：引擎在防守窗口自动调用 defaultBlock（能换则换、会被打死则挡），
// 比只靠 view 信息手写更稳妥，避免误读来袭目标。
