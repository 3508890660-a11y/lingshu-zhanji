const meta = {
  name: 'KIMI 3.1pro · 赤潮燧发快攻',
  desc: '执行模型 kimi-k3.1-pro；颜色 红；策略 赤潮燧发快攻；低费冲锋与传令官铺场，解守卫后以直伤和血红爆发收尾',
  id: 'model:kimi31pro',
  color: '红'
};

const DECK_RECIPE = [
  ['LQ01-038', 3],
  ['LQ01-039', 3],
  ['LQ01-040', 3],
  ['LQ01-041', 3],
  ['LQ01-042', 3],
  ['LQ01-043', 3],
  ['LQ01-044', 2],
  ['LQ01-046', 2],
  ['LQ01-049', 2],
  ['LQ01-051', 3],
  ['LQ01-053', 3]
];

function build(pool) {
  const cards = Array.isArray(pool) ? pool : [];
  const available = Object.create(null);
  const nameCount = Object.create(null);
  const result = [];
  let total = 0;

  for (const card of cards) {
    if (card && card.id) available[card.id] = card;
  }

  function add(card, wanted) {
    if (!card || total >= 30) return;
    const used = nameCount[card.name] || 0;
    const n = Math.min(wanted, 3 - used, 30 - total);
    if (n <= 0) return;
    let entry = null;
    for (const item of result) {
      if (item.id === card.id) {
        entry = item;
        break;
      }
    }
    if (entry) entry.n += n;
    else result.push({ id: card.id, n: n });
    nameCount[card.name] = used + n;
    total += n;
  }

  for (const entry of DECK_RECIPE) add(available[entry[0]], entry[1]);
  if (total < 30) {
    for (const entry of DECK_RECIPE) add(available[entry[0]], 3);
  }
  if (total < 30) {
    for (const card of cards) add(card, 3);
  }
  return result;
}

function fallbackMove(moves) {
  if (!Array.isArray(moves) || moves.length === 0) return undefined;
  for (const move of moves) {
    if (move && move.type === 'pass') return move;
  }
  for (const move of moves) {
    if (move && move.type === 'noBlock') return move;
  }
  return moves[moves.length - 1];
}

function unitByUid(units, uid) {
  if (!Array.isArray(units)) return null;
  for (const unit of units) {
    if (unit && unit.uid === uid) return unit;
  }
  return null;
}

function hasKeyword(unit, keyword) {
  return !!(unit && Array.isArray(unit.kw) && unit.kw.indexOf(keyword) >= 0);
}

function attackedCount(me) {
  if (!me || !Array.isArray(me.board)) return 0;
  let count = 0;
  for (const unit of me.board) {
    if (unit && unit.attacked) count++;
  }
  return count;
}

function effectiveAttack(move, me) {
  const attacker = move.avatar ? me.avatar : unitByUid(me.board, move.uid);
  if (!attacker) return { unit: null, atk: 0, imp: 0, hp: 0 };
  let atk = Number(attacker.atk) || 0;
  let imp = Number(attacker.imp) || 0;
  if (!move.avatar && attacker.name === '怒火新兵' && !attacker.attacked) atk++;
  if (!move.avatar && attacker.name === '暴走狂犬') imp++;
  return { unit: attacker, atk: atk, imp: imp, hp: Number(attacker.hp) || 0 };
}

function attackValue(move, me, opp) {
  const attacker = effectiveAttack(move, me);
  if (!attacker.unit) return -10000;
  const life = Number(opp.life) || 0;

  if (move.target === 'face') {
    return 1000 + attacker.imp * 50 + (attacker.imp >= life ? 100000 : 0);
  }

  const target = unitByUid(opp.board, move.target);
  if (!target) return -10000;
  const targetAtk = Number(target.atk) || 0;
  const targetImp = Number(target.imp) || 0;
  const targetHp = Number(target.hp) || 0;
  const kills = attacker.atk >= targetHp;
  const survives = attacker.hp > targetAtk;
  let score;

  if (kills && survives) {
    score = 650 + targetImp * 35 + targetAtk * 12 - attacker.imp * 8;
  } else if (kills) {
    score = 260 + targetImp * 24 + targetAtk * 8 - attacker.imp * 20;
  } else if (survives) {
    score = -120 + targetAtk * 4 - attacker.imp * 10;
  } else {
    score = -500 - attacker.imp * 25;
  }
  if (hasKeyword(target, '守卫')) score += 260;
  return score;
}

function hasProductiveAttack(moves, me, opp) {
  for (const move of moves) {
    if (move && move.type === 'attack' && attackValue(move, me, opp) > 0) return true;
  }
  return false;
}

function singleRemovalValue(move, view) {
  const target = unitByUid(view.opp.board, move.target);
  if (!target) return -10000;
  const hp = Number(target.hp) || 0;
  if (hp > 3) return -80;
  return 720 + (Number(target.atk) || 0) * 18 + (Number(target.imp) || 0) * 22 +
    (hasKeyword(target, '守卫') ? 240 : 0);
}

function blastRemovalValue(move, view) {
  const board = Array.isArray(view.opp.board) ? view.opp.board : [];
  const target = unitByUid(board, move.target);
  if (!target) return -10000;
  let index = -1;
  for (let i = 0; i < board.length; i++) {
    if (board[i] === target) {
      index = i;
      break;
    }
  }
  let kills = 0;
  let damage = 0;
  let threat = 0;
  let guardKill = false;
  for (let i = Math.max(0, index - 1); i <= Math.min(board.length - 1, index + 1); i++) {
    const unit = board[i];
    const hp = Number(unit.hp) || 0;
    damage += Math.min(2, hp);
    if (hp <= 2) {
      kills++;
      threat += (Number(unit.atk) || 0) * 12 + (Number(unit.imp) || 0) * 16;
      if (hasKeyword(unit, '守卫')) guardKill = true;
    }
  }
  if (kills >= 2) return 760 + kills * 90 + threat;
  if (guardKill) return 700 + threat;
  if (kills === 1 && damage >= 4) return 480 + threat;
  if (kills === 0 && damage >= 5) return 260 + damage * 12;
  return -70;
}

function isLowRedUnit(card) {
  return !!(card && card.type === '单位' && card.cost && card.cost.k === '激情' &&
    (Number(card.cost.n) || 0) <= 2);
}

function playValue(move, view, moves, waitingForAttacks) {
  const me = view.me;
  const opp = view.opp;
  const hand = Array.isArray(me.hand) ? me.hand : [];
  const card = hand[move.i];
  if (!card) return -10000;

  if (card.id === 'LQ01-041') return singleRemovalValue(move, view);
  if (card.id === 'LQ01-049') return blastRemovalValue(move, view);
  if (card.id === 'LQ01-042') {
    if (waitingForAttacks) return -60;
    return 520 + ((Number(opp.life) || 0) <= 6 ? 80 : 0);
  }
  if (card.id === 'LQ01-046') {
    const count = attackedCount(me);
    if (count === 0 || waitingForAttacks) return -60;
    return 600 + count * 90;
  }

  if (card.id === 'LQ01-053') {
    let hasTarget = false;
    for (let i = 0; i < hand.length; i++) {
      if (i !== move.i && isLowRedUnit(hand[i])) {
        hasTarget = true;
        break;
      }
    }
    return hasTarget ? 660 : 330;
  }

  const unitScores = {
    'LQ01-040': 500,
    'LQ01-051': 470,
    'LQ01-038': 450,
    'LQ01-039': 430,
    'LQ01-043': 410,
    'LQ01-044': 390
  };
  if (unitScores[card.id] !== undefined) return unitScores[card.id];
  return card.type === '单位' ? 180 : 40;
}

function immediateLethalPlay(moves, view) {
  const hand = Array.isArray(view.me.hand) ? view.me.hand : [];
  const life = Number(view.opp.life) || 0;
  let best = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    if (!move || move.type !== 'play') continue;
    const card = hand[move.i];
    if (!card) continue;
    let damage = 0;
    if (card.id === 'LQ01-042') damage = 4;
    else if (card.id === 'LQ01-043' || card.id === 'LQ01-051') damage = 1;
    else if (card.id === 'LQ01-046') damage = attackedCount(view.me);
    if (damage >= life && damage > 0 && life - damage > bestScore) {
      best = move;
      bestScore = life - damage;
    }
  }
  return best;
}

function choose(view, moves) {
  const fallback = fallbackMove(moves);
  if (!Array.isArray(moves) || moves.length === 0 || !view || !view.me || !view.opp) {
    return fallback;
  }

  try {
    if (view.over) return fallback;
    const me = view.me;
    const opp = view.opp;

    let bestAttack = null;
    let bestAttackValue = -Infinity;
    for (const move of moves) {
      if (!move || move.type !== 'attack') continue;
      const value = attackValue(move, me, opp);
      if (value > bestAttackValue) {
        bestAttack = move;
        bestAttackValue = value;
      }
    }
    if (bestAttack && bestAttackValue >= 100000) return bestAttack;

    const lethalPlay = immediateLethalPlay(moves, view);
    if (lethalPlay) return lethalPlay;

    for (const move of moves) {
      if (move && move.type === 'avatar') return move;
    }

    const waiting = hasProductiveAttack(moves, me, opp);
    let bestPlay = null;
    let bestPlayValue = 0;
    for (const move of moves) {
      if (!move || move.type !== 'play') continue;
      const value = playValue(move, view, moves, waiting);
      if (value > bestPlayValue) {
        bestPlay = move;
        bestPlayValue = value;
      }
    }
    if (bestPlay) return bestPlay;

    if (bestAttack && bestAttackValue > 0) return bestAttack;

    bestPlay = null;
    bestPlayValue = 0;
    for (const move of moves) {
      if (!move || move.type !== 'play') continue;
      const value = playValue(move, view, moves, false);
      if (value > bestPlayValue) {
        bestPlay = move;
        bestPlayValue = value;
      }
    }
    if (bestPlay) return bestPlay;
    return fallback;
  } catch (error) {
    return fallback;
  }
}

function block(view, bmoves) {
  const fallback = fallbackMove(bmoves);
  if (!Array.isArray(bmoves) || bmoves.length === 0 || !view || !view.me) return fallback;

  try {
    const life = Number(view.me.life) || 0;
    if (life > 8) return fallback;
    let best = null;
    let bestScore = -Infinity;
    for (const move of bmoves) {
      if (!move || move.type !== 'block') continue;
      const unit = unitByUid(view.me.board, move.uid);
      if (!unit) continue;
      const imp = Number(unit.imp) || 0;
      if (life > 4 && imp > 1 && !hasKeyword(unit, '守卫')) continue;
      const score = 100 - imp * 20 - (Number(unit.atk) || 0) * 3 +
        (Number(unit.hp) || 0) + (hasKeyword(unit, '守卫') ? 20 : 0);
      if (score > bestScore) {
        best = move;
        bestScore = score;
      }
    }
    return best || fallback;
  } catch (error) {
    return fallback;
  }
}

function respond(view, ctx, moves) {
  const fallback = fallbackMove(moves);
  if (!Array.isArray(moves) || !view || !view.me || !view.opp || !ctx) return fallback;

  try {
    const hand = Array.isArray(view.me.hand) ? view.me.hand : [];
    let best = null;
    let bestScore = 0;
    for (const move of moves) {
      if (!move || move.type !== 'respond') continue;
      const card = hand[move.i];
      if (!card || card.id !== 'LQ01-041') continue;
      const target = unitByUid(view.opp.board, move.target);
      if (!target || (Number(target.hp) || 0) > 3) continue;
      if (ctx.kind === 'attack') {
        if (ctx.attacker && target.name !== ctx.attacker.name) continue;
      } else if (ctx.kind === 'play') {
        if ((Number(target.atk) || 0) < 3 && !hasKeyword(target, '守卫')) continue;
      } else if (ctx.kind !== 'endTurn') {
        continue;
      }
      const score = 100 + (Number(target.atk) || 0) * 12 +
        (Number(target.imp) || 0) * 15 + (hasKeyword(target, '守卫') ? 20 : 0) +
        (ctx.kind === 'attack' ? 100 : 0);
      if (score > bestScore) {
        best = move;
        bestScore = score;
      }
    }
    return best || fallback;
  } catch (error) {
    return fallback;
  }
}
