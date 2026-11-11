const meta = {
  name: 'KIMI 3.1pro · 赤锋燃血快攻',
  desc: '执行模型 kimi-k3.1-pro；颜色 红；策略 赤锋燃血快攻；以冲锋铺场、战鼓增益与直伤收尾。',
  id: 'model:kimi31pro',
  color: '红'
};

const DECK = [
  { id: 'LQ01-037', n: 3 },
  { id: 'LQ01-038', n: 3 },
  { id: 'LQ01-039', n: 3 },
  { id: 'LQ01-040', n: 3 },
  { id: 'LQ01-041', n: 3 },
  { id: 'LQ01-042', n: 3 },
  { id: 'LQ01-043', n: 3 },
  { id: 'LQ01-044', n: 3 },
  { id: 'LQ01-051', n: 3 },
  { id: 'LQ01-052', n: 3 }
];

const ID = {
  cub: 'LQ01-037',
  recruit: 'LQ01-038',
  claw: 'LQ01-039',
  hound: 'LQ01-040',
  bolt: 'LQ01-041',
  blood: 'LQ01-042',
  axe: 'LQ01-043',
  tiger: 'LQ01-044',
  skirmisher: 'LQ01-051',
  drummer: 'LQ01-052'
};

function build(pool) {
  const available = Object.create(null);
  for (const card of pool || []) available[card.id] = true;

  const deck = [];
  for (const entry of DECK) {
    if (available[entry.id]) deck.push({ id: entry.id, n: entry.n });
  }
  return deck;
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function unitOn(board, uid) {
  if (!uid || !Array.isArray(board)) return null;
  for (const unit of board) {
    if (unit && unit.uid === uid) return unit;
  }
  return null;
}

function hasKeyword(unit, keyword) {
  return !!unit && Array.isArray(unit.kw) && unit.kw.indexOf(keyword) !== -1;
}

function playedCard(view, move) {
  if (!move || move.type !== 'play') return null;
  if (!view || !view.me || !Array.isArray(view.me.hand)) return null;
  return view.me.hand[move.i] || null;
}

function passFrom(moves) {
  for (const move of moves) {
    if (move && move.type === 'pass') return move;
  }
  return moves[moves.length - 1];
}

function unitValue(unit) {
  if (!unit) return 0;
  return number(unit.atk) * 3 + number(unit.imp) * 4 + number(unit.hp);
}

function threatValue(unit) {
  if (!unit) return 0;
  let value = unitValue(unit);
  if (hasKeyword(unit, '守卫')) value += 5;
  if (hasKeyword(unit, '冲锋')) value += 2;
  if (hasKeyword(unit, '践踏')) value += 3;
  return value;
}

function readyAllies(view) {
  if (!view.me || !Array.isArray(view.me.board)) return 0;
  let count = 0;
  for (const unit of view.me.board) {
    if (unit && !unit.attacked && !unit.frozen) count += 1;
  }
  return count;
}

function bestFaceLethal(view, moves) {
  let best = null;
  let bestImp = -1;
  const life = view.opp ? number(view.opp.life) : 0;

  for (const move of moves) {
    if (!move || move.type !== 'attack' || move.target !== 'face') continue;
    const attacker = unitOn(view.me.board, move.uid);
    const imp = attacker ? number(attacker.imp) : 0;
    if (imp >= life && imp > bestImp) {
      best = move;
      bestImp = imp;
    }
  }
  return best;
}

function scoreAttack(view, move) {
  const attacker = unitOn(view.me.board, move.uid);
  if (!attacker) return { move, score: -100000, face: false };

  const atk = number(attacker.atk);
  const imp = number(attacker.imp);
  const hp = number(attacker.hp);

  if (move.target === 'face') {
    const lethal = imp >= number(view.opp.life);
    return {
      move,
      score: lethal ? 10000 + imp : 200 + imp * 10,
      face: true
    };
  }

  const defender = unitOn(view.opp.board, move.target);
  if (!defender) return { move, score: -100000, face: false };

  const targetHp = number(defender.hp);
  const targetAtk = number(defender.atk);
  const kills = atk >= targetHp;
  const dies = hp <= targetAtk;
  const targetValue = threatValue(defender);
  const ownValue = unitValue(attacker);
  let score = 0;

  if (kills && !dies) {
    score = 400 + targetValue * 10 + atk * 2;
  } else if (kills && dies) {
    score = 220 + (targetValue - ownValue) * 12;
  } else if (!kills && !dies) {
    score = 80 + Math.min(atk, targetHp) * 8 - targetHp * 3;
  } else {
    score = -300 - ownValue * 10 + targetValue * 4;
  }

  if (kills && hasKeyword(defender, '守卫')) score += 90;
  if (hasKeyword(attacker, '疾风')) score += 12;
  return { move, score, face: false };
}

function chooseAttack(view, moves) {
  let bestFace = null;
  let bestUnit = null;

  for (const move of moves) {
    if (!move || move.type !== 'attack') continue;
    const scored = scoreAttack(view, move);
    if (scored.face) {
      if (!bestFace || scored.score > bestFace.score) bestFace = scored;
    } else if (!bestUnit || scored.score > bestUnit.score) {
      bestUnit = scored;
    }
  }

  if (bestFace && bestFace.score >= 10000) return bestFace.move;
  if (bestUnit && bestUnit.score >= 350) return bestUnit.move;
  if (bestFace) return bestFace.move;
  if (bestUnit && bestUnit.score >= 80) return bestUnit.move;
  return null;
}

function scoreBoltTarget(view, move) {
  const defender = unitOn(view.opp.board, move.target);
  if (!defender) return -100000;

  const kills = number(defender.hp) <= 3;
  let score = 650 + threatValue(defender) * 9;
  if (kills) score += 140;
  if (hasKeyword(defender, '守卫')) score += kills ? 120 : 30;
  return score;
}

function scorePlay(view, move) {
  const card = playedCard(view, move);
  if (!card) return -100000;

  switch (card.id) {
    case ID.drummer:
      return 700 + readyAllies(view) * 35;
    case ID.axe:
      return 910;
    case ID.skirmisher:
      return 895;
    case ID.recruit:
      return 880;
    case ID.claw:
      return 865;
    case ID.tiger:
      return 850;
    case ID.cub:
      return 825;
    case ID.hound:
      return 800;
    case ID.bolt:
      return scoreBoltTarget(view, move);
    case ID.blood: {
      const life = number(view.opp.life);
      if (life <= 4) return 5000;
      if (life <= 6) return 470;
      return 390 + Math.max(0, 20 - life);
    }
    default:
      break;
  }

  if (card.type === '单位') {
    const body = number(card.atk) + number(card.imp) + number(card.hp);
    return 620 + body * 4;
  }

  if (move.target && unitOn(view.me.board, move.target)) return -100000;
  return 120;
}

function bestPlay(view, moves, minimum) {
  let best = null;
  let bestScore = minimum;

  for (const move of moves) {
    if (!move || move.type !== 'play') continue;
    const score = scorePlay(view, move);
    if (score >= bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}

function avatarMove(moves) {
  for (const move of moves) {
    if (move && move.type === 'avatar') return move;
  }
  return null;
}

function hasAttack(moves) {
  for (const move of moves) {
    if (move && move.type === 'attack') return true;
  }
  return false;
}

function choose(view, moves) {
  if (!Array.isArray(moves) || moves.length === 0) return moves[moves.length - 1];
  const fallback = passFrom(moves);
  if (!view || view.over || !view.me || !view.opp) return fallback;

  const lethalAttack = bestFaceLethal(view, moves);
  if (lethalAttack) return lethalAttack;

  const lethalBurn = bestPlay(view, moves, 5000);
  if (lethalBurn) return lethalBurn;

  const development = bestPlay(view, moves, 600);
  if (development) return development;

  const avatar = avatarMove(moves);
  if (avatar && hasAttack(moves)) return avatar;

  const attack = chooseAttack(view, moves);
  if (attack) return attack;

  const finishingPlay = bestPlay(view, moves, 0);
  if (finishingPlay) return finishingPlay;

  return fallback;
}

function noBlockFrom(bmoves) {
  for (const move of bmoves) {
    if (move && move.type === 'noBlock') return move;
  }
  return bmoves[bmoves.length - 1];
}

function greatestEnemyAttack(view) {
  let greatest = 0;
  if (!view || !view.opp || !Array.isArray(view.opp.board)) return greatest;
  for (const unit of view.opp.board) {
    greatest = Math.max(greatest, number(unit.atk));
  }
  return greatest;
}

function block(view, bmoves) {
  if (!Array.isArray(bmoves) || bmoves.length === 0) return bmoves[bmoves.length - 1];
  const fallback = noBlockFrom(bmoves);
  if (!view || !view.me || !view.opp) return fallback;

  const expectedAttack = greatestEnemyAttack(view);
  const lowLife = number(view.me.life) <= 5;
  let survivor = null;
  let survivorScore = -Infinity;
  let chump = null;
  let chumpValue = Infinity;

  for (const move of bmoves) {
    if (!move || move.type !== 'block') continue;
    const blocker = unitOn(view.me.board, move.uid);
    if (!blocker) continue;

    const value = unitValue(blocker);
    if (number(blocker.hp) > expectedAttack) {
      const score = 100 - value + number(blocker.hp) * 2;
      if (score > survivorScore) {
        survivor = move;
        survivorScore = score;
      }
    }
    if (value < chumpValue) {
      chump = move;
      chumpValue = value;
    }
  }

  if (survivor) return survivor;
  if (lowLife && chump) return chump;
  return fallback;
}
