const meta = {
  name: 'KIMI 3.1pro · 淬锋武装中速',
  desc: '执行模型 kimi-k3.1-pro；颜色 橙；策略 淬锋武装中速；低费单位配合装备与淬炼清场持续推进',
  id: 'model:kimi31pro',
  color: '橙'
};

const DECK_RECIPE = [
  ['LQ01-109', 3],
  ['LQ01-110', 3],
  ['LQ01-111', 2],
  ['LQ01-113', 3],
  ['LQ01-114', 3],
  ['LQ01-115', 3],
  ['LQ01-116', 2],
  ['LQ01-117', 3],
  ['LQ01-118', 2],
  ['LQ01-119', 2],
  ['LQ01-120', 2],
  ['LQ01-123', 2]
];

function build(pool) {
  const cards = Array.isArray(pool) ? pool : [];
  const available = Object.create(null);
  const result = [];
  const nameCount = Object.create(null);
  let total = 0;

  for (const card of cards) {
    if (card && card.id) available[card.id] = card;
  }

  for (const entry of DECK_RECIPE) {
    const id = entry[0];
    const card = available[id];
    if (!card) continue;
    const n = Math.min(3, entry[1]);
    result.push({ id: id, n: n });
    nameCount[card.name] = n;
    total += n;
  }

  if (total < 30) {
    for (const card of cards) {
      if (!card || !card.id || total >= 30) continue;
      const old = result.find(item => item.id === card.id);
      const usedForName = nameCount[card.name] || 0;
      const room = Math.min(3 - usedForName, 30 - total);
      if (room <= 0) continue;
      if (old) old.n += room;
      else result.push({ id: card.id, n: room });
      nameCount[card.name] = usedForName + room;
      total += room;
    }
  }

  return result;
}

function fallbackMove(moves) {
  if (!Array.isArray(moves) || moves.length === 0) return undefined;
  for (const move of moves) {
    if (move && move.type === 'pass') return move;
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

function attackValue(move, me, opp) {
  const attacker = move.avatar ? me.avatar : unitByUid(me.board, move.uid);
  if (!attacker) return -1000;
  const atk = Number(attacker.atk) || 0;
  const imp = Number(attacker.imp) || 0;
  const hp = Number(attacker.hp) || 0;

  if (move.target === 'face') {
    return 100 + imp * 8 + (imp >= (Number(opp.life) || 0) ? 10000 : 0);
  }

  const target = unitByUid(opp.board, move.target);
  if (!target) return -1000;
  const targetAtk = Number(target.atk) || 0;
  const targetImp = Number(target.imp) || 0;
  const targetHp = Number(target.hp) || 0;
  const kills = atk >= targetHp;
  const survives = hp > targetAtk;
  let score = 10 + targetAtk * 3 + targetImp * 2;

  if (kills) score += survives ? 150 : 65;
  else score -= 100;
  if (!survives) score -= 35 + imp * 3;
  if (hasKeyword(target, '守卫')) score += 70;
  return score;
}

function playValue(move, view, moves) {
  const me = view.me;
  const hand = Array.isArray(me.hand) ? me.hand : [];
  const card = hand[move.i];
  if (!card) return -10000;

  const enemyCount = Array.isArray(view.opp.board) ? view.opp.board.length : 0;
  const boardCount = Array.isArray(me.board) ? me.board.length : 0;
  const turn = Number(view.turn) || 1;
  let hasSweep = false;
  let hasEquipment = false;

  for (const other of moves) {
    if (!other || other.type !== 'play') continue;
    const otherCard = hand[other.i];
    if (!otherCard) continue;
    if (otherCard.id === 'LQ01-118') hasSweep = true;
    if (otherCard.type === '装备' && otherCard.id !== card.id) hasEquipment = true;
  }

  if (card.id === 'LQ01-118') {
    if (enemyCount === 0) return -500;
    return enemyCount >= 2 ? 430 : 280;
  }
  if (card.id === 'LQ01-117') return hasSweep && enemyCount > 0 ? 500 : 190;

  const unitScores = {
    'LQ01-113': 330,
    'LQ01-123': hasEquipment ? 320 : 150,
    'LQ01-109': 290,
    'LQ01-114': 270,
    'LQ01-115': 260,
    'LQ01-119': 240
  };
  if (unitScores[card.id] !== undefined) return unitScores[card.id];

  if (card.type === '装备') {
    const forge = move.mode === 'forge';
    let score = 170;
    if (card.id === 'LQ01-110') score = 230;
    if (card.id === 'LQ01-116') score = 220;
    if (card.id === 'LQ01-120') score = 200;
    if (card.id === 'LQ01-111') score = 180;

    if (forge) {
      if (boardCount === 0 || turn <= 2) return score + 45;
      return score - 55;
    }

    const target = unitByUid(me.board, move.target);
    if (target) {
      score += (Number(target.atk) || 0) * 4;
      if (card.id === 'LQ01-120' && hasKeyword(target, '守卫')) score += 35;
      if (card.id === 'LQ01-110' && !target.attacked) score += 30;
    }
    return score;
  }

  return card.type === '单位' ? 120 : 60;
}

function choose(view, moves) {
  const fallback = fallbackMove(moves);
  if (!Array.isArray(moves) || moves.length === 0 || !view || !view.me || !view.opp) {
    return fallback;
  }

  try {
    const me = view.me;
    const opp = view.opp;
    const faceAttacks = moves.filter(move => move && move.type === 'attack' && move.target === 'face');
    let faceDamage = 0;

    for (const move of faceAttacks) {
      const attacker = move.avatar ? me.avatar : unitByUid(me.board, move.uid);
      faceDamage += attacker ? Number(attacker.imp) || 0 : 0;
    }
    if (faceAttacks.length > 0 && faceDamage >= (Number(opp.life) || 0)) {
      let lethal = faceAttacks[0];
      let best = -Infinity;
      for (const move of faceAttacks) {
        const value = attackValue(move, me, opp);
        if (value > best) {
          best = value;
          lethal = move;
        }
      }
      return lethal;
    }

    const avatar = moves.find(move => move && move.type === 'avatar');
    if (avatar) return avatar;

    const ascends = moves.filter(move => move && move.type === 'ascend');
    const boardCount = Array.isArray(me.board) ? me.board.length : 0;
    if (ascends.length > 0 && ((Number(view.turn) || 1) >= 3 || boardCount >= 3)) {
      const order = ['LQ01-272', 'LQ01-273', 'LQ01-274'];
      for (const id of order) {
        const found = ascends.find(move => move.id === id);
        if (found) return found;
      }
      return ascends[0];
    }

    let bestPlay = null;
    let bestPlayValue = 0;
    for (const move of moves) {
      if (!move || move.type !== 'play') continue;
      const value = playValue(move, view, moves);
      if (value > bestPlayValue) {
        bestPlayValue = value;
        bestPlay = move;
      }
    }
    if (bestPlay) return bestPlay;

    let bestAttack = null;
    let bestAttackValue = 0;
    for (const move of moves) {
      if (!move || move.type !== 'attack') continue;
      const value = attackValue(move, me, opp);
      if (value > bestAttackValue) {
        bestAttackValue = value;
        bestAttack = move;
      }
    }
    if (bestAttack) return bestAttack;

    return fallback;
  } catch (error) {
    return fallback;
  }
}

function block(view, bmoves) {
  const fallback = fallbackMove(bmoves);
  if (!Array.isArray(bmoves) || bmoves.length === 0 || !view || !view.me) return fallback;

  try {
    let noBlock = null;
    let best = null;
    let bestScore = -Infinity;
    for (const move of bmoves) {
      if (!move) continue;
      if (move.type === 'noBlock') {
        noBlock = move;
        continue;
      }
      if (move.type !== 'block') continue;
      const unit = unitByUid(view.me.board, move.uid);
      if (!unit) continue;
      const guard = hasKeyword(unit, '守卫');
      const shouldBlock = guard || (Number(view.me.life) || 0) <= 8 ||
        ((Number(unit.hp) || 0) >= 4 && (Number(unit.imp) || 0) <= 1);
      if (!shouldBlock) continue;
      const score = (Number(unit.hp) || 0) * 2 - (Number(unit.imp) || 0) * 3 + (guard ? 12 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best || noBlock || fallback;
  } catch (error) {
    return fallback;
  }
}
