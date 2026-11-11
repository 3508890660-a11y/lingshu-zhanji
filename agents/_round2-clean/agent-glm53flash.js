// ============================================================
// agents/agent-glm53flash.js
// 执行模型 glm-5.3-flash（显示名 GLM5.3flash）
// 主色：红（激情 · 门槛制不消耗 · 每回合打出无硬上限）
// 策略：赤潮冲锋 —— 低费冲锋铺场 + 守卫换血 + 直伤收尾
// 依据仅为 brief 卡面文本与基本规则，不引用任何赛果信息。
// ============================================================

const meta = {
  name: 'GLM5.3flash · 赤潮冲锋',
  desc: '执行模型 glm-5.3-flash；颜色 红；策略 赤潮冲锋（低费冲锋铺场，直伤收尾）',
  id: 'model:glm53flash',
  color: '红'
};

// ---------- 卡号常量（卡表 3.3 红色） ----------
const ID = {
  CHARGE_TIGER: 'LQ01-037',   // 赤刃幼虎    激情1 1/1/1 冲锋
  FURY_RECRUIT: 'LQ01-038',   // 怒火新兵    激情1 2/1/1 冲锋/怒火
  LAVA_CLAW:    'LQ01-039',   // 熔岩裂爪    激情2 2/1/2 冲锋
  MAD_DOG:      'LQ01-040',   // 暴走狂犬    激情2 1/3/2 怒火
  SEVER_BLADE:  'LQ01-041',   // 烈阳断刃    激情2 瞬间 对1单位3伤
  BLOOD_CURSE:  'LQ01-042',   // 焚天血咒    激情4 对手4伤/6伤
  AXE_THROWER:  'LQ01-043',   // 血斧掷颅手  激情3 3/1/2 冲锋+战吼1伤
  EMBER_TIGER:  'LQ01-044',   // 烬原猛虎    激情3 3/2/2 冲锋
  BURST:        'LQ01-046',   // 血红爆发    激情6 IMP+1+按攻击数打脸
  PITCH_FIRE:   'LQ01-051'    // 掷火散兵    激情2 2/1/2 战吼1伤
};

// ---------- 构筑：10 名目 ×3 = 30 张 ----------
// 曲线（四档）：1-2 费 18 张 / 3-4 费 9 张 / 5-6 费 3 张 / 7+ 0 张
function build(pool) {
  const want = [
    [ID.CHARGE_TIGER, 3],
    [ID.FURY_RECRUIT, 3],
    [ID.LAVA_CLAW, 3],
    [ID.MAD_DOG, 3],
    [ID.SEVER_BLADE, 3],
    [ID.PITCH_FIRE, 3],
    [ID.AXE_THROWER, 3],
    [ID.EMBER_TIGER, 3],
    [ID.BLOOD_CURSE, 3],
    [ID.BURST, 3]
  ];
  const deck = [];
  for (const w of want) {
    if (pool && pool.some(function (c) { return c.id === w[0]; })) {
      deck.push({ id: w[0], n: w[1] });
    }
  }
  let total = deck.reduce(function (s, d) { return s + d.n; }, 0);
  // 兜底补位：卡面缺失时用池内低费牌补足（同名 <=3）
  if (pool && pool.length && total < 25) {
    const used = {};
    deck.forEach(function (d) { used[d.id] = d.n; });
    const fill = pool.slice().sort(function (a, b) {
      return costN(a) - costN(b);
    });
    for (const c of fill) {
      if (total >= 30) break;
      const have = used[c.id] || 0;
      if (have >= 3) continue;
      const add = Math.min(3 - have, 30 - total);
      if (add <= 0) continue;
      deck.push({ id: c.id, n: add });
      used[c.id] = have + add;
      total += add;
    }
    if (total < 25) return null; // 交回引擎 autoBuild
  }
  return deck;
}

// ---------- 小工具 ----------
function costN(c) {
  return (c && c.cost && typeof c.cost.n === 'number') ? c.cost.n : 9;
}
function isUnit(c) {
  return !!c && c.type === '单位';
}
function unitVal(u) {
  return (u && u.atk ? u.atk : 0) + (u && u.imp ? u.imp : 0) + (u && u.hp ? u.hp : 0);
}
function handCard(view, m) {
  const h = (view.me && view.me.hand) || [];
  return (m && typeof m.i === 'number') ? h[m.i] : undefined;
}

// ---------- 主决策 ----------
function choose(view, moves) {
  try {
    if (!moves || !moves.length) return undefined;
    const me = (view && view.me) || {};
    const opp = (view && view.opp) || {};
    const hand = me.hand || [];
    const oppBoard = opp.board || [];
    const myBoard = me.board || [];

    const attacks = moves.filter(function (m) { return m.type === 'attack'; });
    const plays = moves.filter(function (m) { return m.type === 'play'; });
    const avatars = moves.filter(function (m) { return m.type === 'avatar'; });
    const faceAttacks = attacks.filter(function (m) { return m.target === 'face'; });
    const oppLife = opp.life || 0;

    // 1) 斩杀检查：场上可攻脸单位的 ATK 合计 + 手牌焚天血咒（保守按 4 伤计）
    let faceDmg = 0;
    for (const m of faceAttacks) {
      const u = myBoard.find(function (b) { return b.uid === m.uid; });
      faceDmg += u && u.atk ? u.atk : 0;
    }
    let burnDmg = 0;
    for (const c of hand) {
      if (c && c.id === ID.BLOOD_CURSE) burnDmg += 4;
    }
    if (oppLife > 0 && faceDmg + burnDmg >= oppLife) {
      if (faceAttacks.length) return faceAttacks[0];
      const curse = plays.find(function (m) {
        const c = handCard(view, m);
        return c && c.id === ID.BLOOD_CURSE;
      });
      if (curse) return curse;
    }

    // 2) 血红爆发（finisher）：本回合还有攻击可打时先挂 IMP+1 与按攻击数打脸
    if (plays.length && attacks.length) {
      const fin = plays.find(function (m) {
        const c = handCard(view, m);
        return c && c.id === ID.BURST;
      });
      if (fin) return fin;
    }

    // 3) 烈阳断刃：能直接打死威胁最高的敌方单位时使用
    const removals = plays.filter(function (m) {
      const c = handCard(view, m);
      return c && c.id === ID.SEVER_BLADE && m.target;
    });
    if (removals.length) {
      let best = null, bestV = -1;
      for (const m of removals) {
        const t = oppBoard.find(function (u) { return u.uid === m.target; });
        if (t && (t.hp || 0) <= 3) {
          const v = unitVal(t);
          if (v > bestV) { bestV = v; best = m; }
        }
      }
      if (best) return best;
    }

    // 4) 攻击：优先打脸（引擎在守卫存在时只给守卫目标）
    if (faceAttacks.length) return faceAttacks[0];
    if (attacks.length) {
      const m = attacks[0];
      const mine = myBoard.find(function (b) { return b.uid === m.uid; });
      const t = oppBoard.find(function (u) { return u.uid === m.target; });
      const goodTrade = !!mine && !!t && (mine.atk || 0) >= (t.hp || 1);
      const hasUnitPlay = plays.some(function (x) {
        const c = handCard(view, x);
        return isUnit(c);
      });
      // 划算的换血直接打；不划算且还有兵可出则先出兵，否则也打（避免空过）
      if (goodTrade || !hasUnitPlay) return m;
    }

    // 5) 出单位：费用升序、ATK 降序（低费冲锋铺场优先）
    const unitPlays = plays.filter(function (m) {
      return isUnit(handCard(view, m));
    });
    if (unitPlays.length) {
      unitPlays.sort(function (a, b) {
        const ca = costN(handCard(view, a)), cb = costN(handCard(view, b));
        if (ca !== cb) return ca - cb;
        return (handCard(view, b).atk || 0) - (handCard(view, a).atk || 0);
      });
      return unitPlays[0];
    }

    // 6) 焚天血咒：非斩杀时机也直接糊脸压制
    const curse2 = plays.find(function (m) {
      const c = handCard(view, m);
      return c && c.id === ID.BLOOD_CURSE;
    });
    if (curse2) return curse2;

    // 7) 其余法术/瞬间：无目标的先打；有目标的挑威胁最高的敌方单位
    const free = plays.filter(function (m) { return !m.target; });
    if (free.length) return free[0];
    if (plays.length) {
      let best = plays[0], bestV = -1;
      for (const m of plays) {
        const t = oppBoard.find(function (u) { return u.uid === m.target; });
        const v = t ? unitVal(t) : 0;
        if (v > bestV) { bestV = v; best = m; }
      }
      return best;
    }

    // 8) 灵体启动（红A：过载1 → 本回合单位 IMP+1）：
    //    场上有单位、第 2 轮以后且本回合还有攻击可打时使用
    if (avatars.length && myBoard.length >= 1 && (view.round || 0) >= 2 && attacks.length) {
      return avatars[0];
    }

    // 9) 兜底：未知动作类型一律交给 pass（moves 最后一项）
    return moves[moves.length - 1];
  } catch (e) {
    return moves && moves.length ? moves[moves.length - 1] : undefined;
  }
}

// ---------- 阻挡 ----------
// 策略：有 HP>=3 的单位就用血最厚的去挡，保脸血；否则不挡（保持进攻节奏）
function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return undefined;
    const noB = bmoves.find(function (m) { return m.type === 'noBlock'; });
    const blocks = bmoves.filter(function (m) { return m.type === 'block'; });
    if (!blocks.length) return noB || bmoves[bmoves.length - 1];
    const myBoard = (view.me && view.me.board) || [];
    let best = null, bestHp = -1;
    for (const m of blocks) {
      const u = myBoard.find(function (b) { return b.uid === m.uid; });
      const hp = u && u.hp ? u.hp : 0;
      if (hp > bestHp) { bestHp = hp; best = m; }
    }
    if (best && bestHp >= 3) return best;
    return noB || bmoves[bmoves.length - 1];
  } catch (e) {
    return bmoves && bmoves.length ? bmoves[bmoves.length - 1] : undefined;
  }
}
