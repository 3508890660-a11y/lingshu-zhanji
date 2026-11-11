/**
 * agents/agent-glm53flash.js —— GLM5.3flash · 青「潮汐流转」
 *
 * 资源口径（rules.js 实装）：青 = 法力 min(回合+1, 6)，消耗制；
 * 回合开始抽 2；回合末按本回合打出数 ÷2 额外抽；
 * 灵体温蒂妮被动回合开始 +1 法力（第 4 回合起有效法力 7）。
 *
 * 策略：低费铺场撑打出数 → 回合末流转补抽；深海重压/凝滞控场；
 * 6 费月潮终曲压轴全场 +1/+1；升灵 276（SR5 群体 2 伤）/277（SR6 抽 3）收尾。
 */

const meta = {
  name: 'GLM5.3flash · 潮汐流转',
  desc: '执行模型 glm-5.3-flash；颜色 青；策略 潮汐流转（中速铺场解场）；低费撑打出数换流转补抽，点杀控场，6 费终端与升灵收尾',
  id: 'model:glm53flash',
  color: '青',
};

/* ───────────────────────── 组卡 ───────────────────────── */

// 期望清单：11 个名目（8 个 ×3 ＋ 3 个 ×2）＝ 30 张
const WISH = [
  { id: 'LQ01-138', n: 3 },  // 连击共鸣   1费 抽2
  { id: 'LQ01-127', n: 3 },  // 潮汐幼灵   1费 1/1/2 潮汐
  { id: 'LQ01-128', n: 3 },  // 溅跃小妖   2费 2/1/2
  { id: 'LQ01-141', n: 3 },  // 调律学徒   2费 1/2/2 SR2 升灵素材
  { id: 'LQ01-292', n: 2 },  // 石肤守卫   灰2费 1/2/3 守卫
  { id: 'LQ01-295', n: 2 },  // 凝滞       灰2费 冻结
  { id: 'LQ01-131', n: 3 },  // 深海重压   3费 单体3伤
  { id: 'LQ01-133', n: 3 },  // 潮卫·堤灵  3费 2/2/4 守卫 自身+0/+1
  { id: 'LQ01-140', n: 3 },  // 涡流长老   4费 3/2/4 涡流3
  { id: 'LQ01-143', n: 3 },  // 大潮调律师 4费 3/2/4 SR4 升灵素材
  { id: 'LQ01-136', n: 2 },  // 月潮终曲   6费 5/4/7 全场+1/+1
];

function build(pool) {
  const byId = new Map((pool || []).map((c) => [c.id, c]));
  const out = [];
  for (const w of WISH) {
    if (byId.has(w.id)) { out.push({ id: w.id, n: w.n }); byId.delete(w.id); }
  }
  // 兜底：期望卡缺失时按评分从余池补齐到 30
  let total = out.reduce((s, x) => s + x.n, 0);
  const rest = [...byId.values()]
    .filter((c) => c.color === '青' || c.color === '灰')
    .sort((a, b) => (api.scoreCard ? api.scoreCard(b) : 0) - (api.scoreCard ? api.scoreCard(a) : 0));
  for (const c of rest) {
    if (total >= 30) break;
    const n = Math.min(3, 30 - total);
    if (n > 0) { out.push({ id: c.id, n }); total += n; }
  }
  return out;
}

/* ───────────────────────── 工具 ───────────────────────── */

const kwOf = (u, name) => (u.kw || []).some((k) => k === name || k.startsWith(name));

/** 是否有斩杀：各可直击灵体攻击者的 IMP 合计 ≥ 对手生命 */
function faceLethal(view, moves) {
  const seen = new Set();
  let sum = 0;
  for (const m of moves) {
    if (m.type !== 'attack' || m.target !== 'face' || seen.has(m.uid)) continue;
    seen.add(m.uid);
    const u = view.me.board.find((x) => x.uid === m.uid);
    if (u) sum += u.imp;
  }
  return sum >= view.opp.life && sum > 0;
}

/* ───────────────────────── 动作评分 ───────────────────────── */

function scorePlay(view, mv) {
  const card = view.me.hand[mv.i];
  if (!card) return -1;
  const fx = card.effects || [];
  const oppB = view.opp.board;
  const myB = view.me.board;
  let s = 2; // 每张牌都为回合末「流转补抽」做贡献

  const drawN = fx.filter((e) => e.do === 'draw').reduce((a, e) => a + (e.n || 0), 0);
  const dmg = fx.find((e) => e.do === 'dmg' && e.target !== 'face');
  const aoe = fx.find((e) => e.do === 'aoe' && e.side === 'enemy');
  const hasFreeze = fx.some((e) => e.do === 'freeze');
  const hasBounce = fx.some((e) => e.do === 'bounce');
  const hasDestroy = fx.some((e) => e.do === 'destroy');

  // 解场类：按目标质量给分
  if (dmg || hasDestroy) {
    const t = oppB.find((u) => u.uid === mv.target) || oppB[0];
    if (!t) return -1;
    const n = dmg ? dmg.n : 99;
    s += 46;
    if (t.hp <= n) s += 16 + t.atk * 2 + t.imp;           // 打死：优先杀最大的
    else s += 4 + Math.min(n, t.hp);
    if (t.hp > n && t.atk <= 1) s -= 10;                   // 杀不死的小东西别浪费
  }
  if (hasFreeze) {
    const t = oppB.find((u) => u.uid === mv.target) || oppB[0];
    if (!t) return -1;
    s += 38 + t.atk * 3;                                   // 冻结高攻威胁
  }
  if (hasBounce) {
    const t = oppB.find((u) => u.uid === mv.target) || oppB[0];
    if (!t) return -1;
    s += 30 + t.atk * 2 + (t.maxHp >= 5 ? 6 : 0);          // 弹回大身材
  }
  if (aoe) {
    const killed = oppB.filter((u) => u.hp <= aoe.n).length;
    s += 34 + oppB.length * 6 + killed * 10;
  }

  // 抽牌类：手牌越少越值钱
  if (drawN > 0) s += 26 + drawN * 10 + Math.max(0, 5 - view.me.hand.length) * 4;

  // 单位：身材 + 关键词 + 场面情境
  if (card.type === '单位') {
    s += 22 + (card.atk || 0) * 1.6 + (card.hp || 0) * 1.3;
    if (kwOf(card, '冲锋')) s += 10;
    if (kwOf(card, '守卫')) s += (oppB.length >= 2 || view.me.life <= 12) ? 14 : 3;
    if (kwOf(card, '潮汐')) s += 3;
    if (kwOf(card, '涡流')) s += 4;                        // 本回合还会继续出牌
    if (kwOf(card, '调律师')) s += 1;                      // 升灵素材 SR 实值看 sr 字段
    if (card.id === 'LQ01-136') s = 48 + myB.length * 4;   // 终端：压轴全场 +1/+1
    if (card.id === 'LQ01-133' && myB.length) s += 6;      // 堤灵战吼 buff 已有单位
  }
  if (card.type === '结界' || card.type === '地标') s += 14;
  return s;
}

function scoreAttack(view, mv) {
  const u = view.me.board.find((x) => x.uid === mv.uid);
  if (!u) return -1;
  if (mv.target === 'face') {
    if (u.imp >= view.opp.life) return 1000;
    return 12 + u.imp * 2;                                 // 直击 1 点＝拆 1 张生命卡
  }
  const t = view.opp.board.find((x) => x.uid === mv.target);
  if (!t) return -1;
  const kills = u.atk >= t.hp;
  const dies = t.atk >= u.hp;
  if (kills && !dies) return 52 + t.atk * 2 + t.imp;       // 白吃：最优
  if (kills && dies) return 24 + (t.atk + t.hp) - (u.atk + u.hp) + t.atk; // 换：换大则优
  return 6 + Math.min(u.atk, t.hp);                        // 磨血：最低优先
}

const ASC = {
  LQ01_275: { id: 'LQ01-275', sr: 3 },
  LQ01_276: { id: 'LQ01-276', sr: 5 },
  LQ01_277: { id: 'LQ01-277', sr: 6 },
};

function scoreAscend(view, mv) {
  const oppB = view.opp.board;
  if (mv.id === ASC.LQ01_276.id) {
    // 深渊潮主：SR5，6/5/7，降临全体敌方 2 点 —— 对面铺场时价值最高
    return oppB.length >= 3 ? 82 : (oppB.length === 2 ? 58 : 30);
  }
  if (mv.id === ASC.LQ01_277.id) {
    // 大潮谐律盘：SR6，7/5/8，降临抽 3 —— 对面没场面时当作过牌+终端
    return oppB.length <= 1 ? 76 : 44;
  }
  if (mv.id === ASC.LQ01_275.id) {
    // 潮汐共鸣锚：SR3，4/3/6，降临直击 2 点 —— 斩杀线上的选项
    return view.opp.life <= 6 ? 72 : 26;
  }
  return 20;
}

/* ───────────────────────── choose / block ───────────────────────── */

function choose(view, moves) {
  if (!Array.isArray(moves) || !moves.length) return undefined;
  try {
    const lethal = faceLethal(view, moves);
    let best = null, bestS = -Infinity;
    for (const m of moves) {
      let s = -1;
      switch (m.type) {
        case 'avatar': s = 34; break;            // 温蒂妮启动免费抽 1，永远先做
        case 'play': s = scorePlay(view, m); break;
        case 'attack': {
          s = scoreAttack(view, m);
          if (lethal && m.target === 'face') s = 1000;
          break;
        }
        case 'ascend': s = scoreAscend(view, m); break;
        case 'buy': s = -1; break;               // 非金色不会出现，安全兜底
        case 'pass': s = 0; break;
        default: s = -1;
      }
      if (s > bestS) { bestS = s; best = m; }
    }
    // 全场分数都很低（只剩磨血与 pass）时直接结束回合，避免无意义横置
    if (best && bestS > 0) return best;
    const pass = moves.find((m) => m.type === 'pass');
    return pass || moves[moves.length - 1];
  } catch (e) {
    return moves[moves.length - 1];
  }
}

/** 阻挡窗口：只有直击灵体的攻击才会问。看不到进攻方是谁，用保守启发式。 */
function block(view, bmoves) {
  if (!Array.isArray(bmoves) || !bmoves.length) return undefined;
  try {
    const blocks = bmoves.filter((m) => m && m.type === 'block');
    const noBlock = bmoves.find((m) => m.type === 'noBlock');
    if (!blocks.length) return noBlock || bmoves[bmoves.length - 1];
    // 候选评分：防御型关键词 > 耐久 > 低攻（不浪费主攻手）
    let best = null, bestS = -Infinity;
    for (const m of blocks) {
      const u = view.me.board.find((x) => x.uid === m.uid);
      if (!u) continue;
      const s = (kwOf(u, '守卫') || kwOf(u, '守护') ? 8 : 0) + u.hp * 1.6 - Math.min(u.atk, 4) * 0.8;
      if (s > bestS) { bestS = s; best = m; }
    }
    if (!best) return noBlock || bmoves[bmoves.length - 1];
    const u = view.me.board.find((x) => x.uid === best.uid);
    const defensive = u && (kwOf(u, '守卫') || kwOf(u, '守护'));
    // 生命告急必须挡；平时只让防御型或够肉的单位去换直击伤害
    if (view.me.life <= 10 || defensive || (u && u.hp >= 4)) return best;
    return noBlock || bmoves[bmoves.length - 1];
  } catch (e) {
    return bmoves[bmoves.length - 1];
  }
}
