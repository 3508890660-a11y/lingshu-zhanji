const meta = {
  name: 'KIMI 3.1pro · 流转涡流',
  desc: '执行模型 kimi-k3.1-pro；颜色 青；策略 流转涡流；用低费抽牌与法力返还堆叠打出数，以涡流和月潮终结。',
  id: 'model:kimi31pro',
  color: '青',
};

// 十个名目各三张：18 张低费润滑，9 张中费承转，3 张终端。
const RECIPE = [
  { id: 'LQ01-127', n: 3 }, // 潮汐幼灵
  { id: 'LQ01-129', n: 3 }, // 潮汐号令
  { id: 'LQ01-131', n: 3 }, // 深海重压
  { id: 'LQ01-133', n: 3 }, // 潮卫·堤灵
  { id: 'LQ01-136', n: 3 }, // 月潮终曲·海灵圣母
  { id: 'LQ01-138', n: 3 }, // 连击共鸣
  { id: 'LQ01-139', n: 3 }, // 幻象连击
  { id: 'LQ01-140', n: 3 }, // 涡流长老
  { id: 'LQ01-141', n: 3 }, // 调律学徒
  { id: 'LQ01-142', n: 3 }, // 调律赋予
];

function build(pool) {
  // 卡号来自本行自选青色章节；pool 已由加载器限定为青＋灰。
  const available = new Set(pool.map((c) => c.id));
  if (RECIPE.every((x) => available.has(x.id))) {
    return RECIPE.map((x) => ({ id: x.id, n: x.n }));
  }

  // 仅应对不完整卡池：仍自行选择卡，不依赖 autoBuild 回退。
  const deck = RECIPE.filter((x) => available.has(x.id)).map((x) => ({ ...x }));
  let total = deck.reduce((s, x) => s + x.n, 0);
  for (const c of pool) {
    if (total >= 30 || c.unsupported || deck.some((x) => x.id === c.id)) continue;
    const n = Math.min(3, 30 - total);
    deck.push({ id: c.id, n });
    total += n;
  }
  return deck;
}

function unitAt(list, uid) {
  return list.find((u) => u.uid === uid) || null;
}

function hasKw(unit, kw) {
  return !!unit && Array.isArray(unit.kw) && unit.kw.includes(kw);
}

function bodyValue(unit) {
  if (!unit) return 0;
  return (unit.atk || 0) * 2 + (unit.imp || 0) * 3 + (unit.hp || 0);
}

function bestMove(moves, type, score) {
  let best = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    if (m.type !== type) continue;
    const s = score(m);
    if (s > bestScore) {
      best = m;
      bestScore = s;
    }
  }
  return best ? { move: best, score: bestScore } : null;
}

function removalScore(view, card, target) {
  if (!target) return -20;
  let score = target.atk * 5 + target.imp * 3 + target.hp;
  for (const e of card.effects || []) {
    if (e.do === 'dmg') {
      if (target.hp <= e.n && !hasKw(target, '圣盾')) score += 80;
      else score += e.n * 5;
    } else if (e.do === 'destroy') {
      score += 100;
    } else if (e.do === 'bounce' || e.do === 'freeze') {
      score += 30 + target.atk * 3;
    }
  }
  if (hasKw(target, '守卫')) score += 24;
  return score;
}

function playScore(view, m) {
  const card = view.me.hand[m.i];
  if (!card) return -1000;
  const target = unitAt(view.opp.board, m.target) || unitAt(view.me.board, m.target);
  const plays = view.me.plays || 0;
  const boardN = view.me.board.length;

  switch (card.id) {
    case 'LQ01-138': // 一费抽二，最先开，扩张本回合选择。
      return 180;
    case 'LQ01-142': // 实装为法力 +2，相当于免费且累积一次打出。
      return 168;
    case 'LQ01-139': // 抽一并返一费，先于不返费的循环牌。
      return 158;
    case 'LQ01-129':
      return 148;
    case 'LQ01-131':
      return 105 + removalScore(view, card, target);
    case 'LQ01-127':
      return 122 - Math.min(20, view.round * 2);
    case 'LQ01-141':
      return 116 + (view.me.outerReady > 0 ? 8 : 0);
    case 'LQ01-133': {
      // 战吼需要已有友方目标；优先把耐久加给高 IMP 单位。
      const own = unitAt(view.me.board, m.target);
      return 112 + (own ? own.imp * 5 + own.atk * 2 : -50);
    }
    case 'LQ01-140':
      // 涡流按本回合打出数成长，留到润滑牌之后。
      return 86 + Math.min(4, plays) * 22 + (plays >= 2 ? 24 : 0);
    case 'LQ01-136':
      return 102 + boardN * 14 + (view.opp.life <= 8 ? 18 : 0);
    default: {
      let score = card.type === '单位' ? 80 : 55;
      score += (card.atk || 0) * 3 + (card.imp || 0) * 4 + (card.hp || 0);
      for (const e of card.effects || []) {
        if (e.do === 'draw') score += e.n * 24;
        else if (e.do === 'res') score += e.n * 12;
        else if (['dmg', 'destroy', 'bounce', 'freeze'].includes(e.do)) {
          score += removalScore(view, card, target);
        } else if (e.do === 'aoe') score += e.n * view.opp.board.length * 16;
      }
      return score - (card.cost?.n || 0) * 2;
    }
  }
}

function attackScore(view, m) {
  const attacker = unitAt(view.me.board, m.uid);
  if (!attacker) return -1000;

  if (m.target === 'face') {
    const hit = (attacker.imp || 0) + (hasKw(attacker, '疾风') ? 1 : 0);
    let score = 52 + hit * 9;
    if (view.opp.life <= hit) score += 10000;
    if (!view.opp.board.length) score += 70;
    else score -= Math.min(18, view.opp.board.length * 3);
    return score;
  }

  const target = unitAt(view.opp.board, m.target);
  if (!target) return -1000;
  const kills = attacker.atk >= target.hp && !hasKw(target, '圣盾');
  const dies = target.atk >= attacker.hp && !hasKw(attacker, '圣盾');
  let score = 0;

  if (kills && !dies) score = 128 + bodyValue(target) * 2;
  else if (kills && dies) score = 48 + (bodyValue(target) - bodyValue(attacker)) * 3;
  else if (!kills && dies) score = -110 - bodyValue(attacker);
  else score = 5 + attacker.atk * 2 - target.hp;

  if (hasKw(target, '守卫')) score += 32;
  if (hasKw(attacker, '践踏') && kills) {
    score += Math.max(0, attacker.atk - target.hp) * 7;
  }
  return score;
}

function ascendScore(view, m) {
  if (m.id === 'LQ01-275') {
    // 共鸣锚：引擎实装为降临打对手 2，可直接完成斩杀。
    return 82 + (view.opp.life <= 2 ? 20000 : 0) + Math.max(0, 3 - view.me.board.length) * 5;
  }
  if (m.id === 'LQ01-276') {
    return 94 + view.opp.board.length * 15;
  }
  if (m.id === 'LQ01-277') {
    return 90 + Math.max(0, 5 - view.me.hand.length) * 10;
  }
  return 75;
}

function choose(view, moves) {
  const pass = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];

  // 先取确定斩杀，避免额外结算给对手生命卡或回复效果创造变数。
  const lethal = bestMove(moves, 'attack', (m) => attackScore(view, m));
  if (lethal && lethal.score >= 10000) return lethal.move;

  const avatar = moves.find((m) => m.type === 'avatar');
  if (avatar && view.me.avatar?.timing !== 'late') return avatar;

  // 先循环与返费，再站场；涡流长老会自然排到连击后段。
  const play = bestMove(moves, 'play', (m) => playScore(view, m));
  if (play) return play.move;

  // late 灵体留到铺场后；青色温蒂妮通常已在上面启动。
  if (avatar) return avatar;

  const attack = bestMove(moves, 'attack', (m) => attackScore(view, m));
  if (attack && attack.score > 0) return attack.move;

  // 攻击过的单位仍可作素材，因此升灵放在攻击后，避免浪费输出。
  const ascend = bestMove(moves, 'ascend', (m) => ascendScore(view, m));
  if (ascend) return ascend.move;

  return pass;
}
