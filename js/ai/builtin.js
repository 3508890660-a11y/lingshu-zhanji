/**
 * builtin.js —— 内置 AI 脚本。
 *
 * 脚本契约（最小实现）：
 *   {
 *     id, name, desc,
 *     build(pool) -> [{id,n}] | '文本卡组' | null   // null = 用自动组卡
 *     choose(view, moves) -> 必须是 moves 里的某一个
 *   }
 *
 * choose 拿到的 moves 已经是"引擎认为合法"的全集：
 * 脚本既不需要、也没办法改写状态 —— 它只能挑。
 */
import { autoBuild, scoreCard } from './deckbuild.js';

const isUnit = (c) => c.type === '单位';
const hasKw = (c, k) => (c.kw || []).includes(k);
const costOf = (c) => c.cost?.n ?? 0;

/** 攻击力总和够不够这一回合打死对手 */
function lethalNow(moves, view) {
  const face = moves.filter((m) => m.type === 'attack' && m.target === 'face');
  const seen = new Set();
  let sum = 0;
  for (const m of face) {
    if (seen.has(m.uid)) continue;
    seen.add(m.uid);
    const u = view.me.board.find((x) => x.uid === m.uid);
    if (u) sum += u.imp;
  }
  return sum >= view.opp.life ? face : null;
}

const byUid = (view, uid) => view.me.board.find((u) => u.uid === uid);

/* ───────────────────────── ① 快攻：赤潮 ───────────────────────── */

export const AGGRO = {
  id: 'aggro',
  name: '赤潮（快攻）',
  desc: '低费铺场＋直击灵体。能打死就打死，打不死就压血线。',
  build(pool) {
    return autoBuild(pool, {
      names: 10,
      maxCost: 5,
      prefer: (c) => (isUnit(c) ? 3 : 0) + (hasKw(c, '冲锋') ? 2.5 : 0) - costOf(c) * 1.1 + (c.type === '装备' ? -1 : 0),
    });
  },
  choose(view, moves) {
    const face = lethalNow(moves, view);
    if (face) return face[0];

    // 灵体启动：开局先开（本回合有效的增益留到最后）
    const pk = pinkPick(view, moves);
    if (pk) return pk;
    const avMove = moves.find((m) => m.type === 'avatar');
    if (avMove && view.me.avatar?.timing === 'early') return avMove;

    // 优先把费用打空：越低费越先出
    const plays = moves.filter((m) => m.type === 'play')
      .sort((a, b) => costOf(view.me.hand[a.i]) - costOf(view.me.hand[b.i]));
    if (plays.length) return plays[0];

    const attacks = moves.filter((m) => m.type === 'attack');
    if (attacks.length) {
      // 先打脸；有守卫时挑血量最低的换掉
      const f = attacks.filter((m) => m.target === 'face');
      if (f.length) return f[0];
      const best = attacks.slice().sort((a, b) => {
        const ta = view.opp.board.find((u) => u.uid === a.target);
        const tb = view.opp.board.find((u) => u.uid === b.target);
        return (ta?.hp ?? 99) - (tb?.hp ?? 99);
      })[0];
      return best;
    }
    const asc = moves.find((m) => m.type === 'ascend');
    if (asc) return asc;
    const av = moves.find((m) => m.type === 'avatar');
    if (av) return av;
    // 金色：手牌见底时从市场补货（旧版这两个 AI 完全不认识 buy 动作，用它们玩金一张牌都买不到）
    const buy = moves.find((m) => m.type === 'buy');
    if (buy && (view.me.hand?.length || 0) < 4) return buy;
    return moves[moves.length - 1];
  },
};

/* ───────────────────────── ② 控场：铁壁 ───────────────────────── */

export const CONTROL = {
  id: 'control',
  name: '铁壁（控场）',
  desc: '先解场再落子。只做划算的交换，靠资源差磨死对手。',
  build(pool) {
    return autoBuild(pool, {
      names: 10,
      prefer: (c) => {
        if (isUnit(c)) return hasKw(c, '守卫') ? 2.4 : (c.hp || 0) * 0.45 - costOf(c) * 0.5;
        const aoe = c.effects?.some((e) => e.do === 'aoe' || e.do === 'aoeRandom');
        const kill = c.effects?.some((e) => e.do === 'destroy');
        const dmg = c.effects?.reduce((s, e) => s + (e.do === 'dmg' ? e.n : 0), 0) || 0;
        return (aoe ? 4 : 0) + (kill ? 3.5 : 0) + dmg * 0.7;
      },
    });
  },
  choose(view, moves) {
    const face = lethalNow(moves, view);
    if (face) return face[0];

    const pk = pinkPick(view, moves);
    if (pk) return pk;
    const avMove = moves.find((m) => m.type === 'avatar');
    if (avMove && view.me.avatar?.timing === 'early') return avMove;

    // 1) 找"能杀掉对手最大单位"的解场
    const remove = [];
    for (const m of moves) {
      if (m.type !== 'play') continue;
      const c = view.me.hand[m.i];
      if (!c || !c.effects) continue;
      const t = view.opp.board.find((u) => u.uid === m.target);
      for (const e of c.effects) {
        if (e.do === 'destroy' && t) remove.push({ m, gain: scoreOf(t) });
        if (e.do === 'dmg' && t && t.hp <= e.n) remove.push({ m, gain: scoreOf(t) * 0.9 });
        if (e.do === 'aoe' && view.opp.board.filter((u) => u.hp <= e.n).length >= 2) {
          remove.push({ m, gain: view.opp.board.reduce((s, u) => s + (u.hp <= e.n ? scoreOf(u) : 0), 0) });
        }
      }
    }
    if (remove.length) {
      remove.sort((a, b) => b.gain - a.gain);
      if (remove[0].gain >= 3) return remove[0].m;
    }

    // 2) 落子：优先守卫/高耐久
    const units = moves.filter((m) => m.type === 'play' && isUnit(view.me.hand[m.i] || {}));
    if (units.length) return units.sort((a, b) => (view.me.hand[b.i].hp || 0) - (view.me.hand[a.i].hp || 0))[0];

    // 3) 只做划算的交换
    const trades = [];
    for (const m of moves) {
      if (m.type !== 'attack') continue;
      const a = byUid(view, m.uid);
      if (!a) continue;
      if (m.target === 'face') { if (view.opp.handCount === 0 || view.me.life > view.opp.life - 4) trades.push({ m, gain: a.imp * 0.9 }); continue; }
      const t = view.opp.board.find((u) => u.uid === m.target);
      if (!t) continue;
      const kills = a.atk >= t.hp;
      const dies = t.atk >= a.hp;
      const gain = (kills ? scoreOf(t) : 0) - (dies ? scoreOf(a) * 0.8 : 0) + 0.5;
      if (gain > 0) trades.push({ m, gain });
    }
    if (trades.length) return trades.sort((a, b) => b.gain - a.gain)[0].m;

    const plays = moves.filter((m) => m.type === 'play');
    if (plays.length) return plays[0];
    const asc = moves.find((m) => m.type === 'ascend');
    if (asc) return asc;
    const av = moves.find((m) => m.type === 'avatar');
    if (av) return av;
    // 金色：控场也要补牌，否则手牌打完就再也出不了牌
    const buy = moves.find((m) => m.type === 'buy');
    if (buy && (view.me.hand?.length || 0) < 4) return buy;
    return moves[moves.length - 1];
  },
};

function scoreOf(u) { return (u.atk || 0) + (u.imp || 0) * 1.2 + (u.hp || 0) * 1.1; }

/* 粉色专属动作（骑升 / 灵体作战 / 魂装）——三个内置 AI 共用。
   骑升是纯收益（灵压上跳 + 灵体身材），所以放在所有其他决策之前；
   魂装只在场面 ≥3 时做，避免把唯一阻挡者叠掉。 */
function pinkPick(view, moves) {
  const ride = moves.find((m) => m.type === 'ride');
  if (ride) return ride;
  const face = moves.find((m) => m.type === 'attack' && m.avatar && m.target === 'face');
  if (face) return face;
  const active = (view.me.souls || []).filter((s) => s.state === 'active').length;
  if (active >= 2) {
    const aw = moves.find((m) => m.type === 'awaken');
    if (aw) return aw;
  }
  const res = moves.find((m) => m.type === 'resonate');
  if (res) return res;
  if ((view.me.board?.length || 0) >= 3) {
    const attires = moves.filter((m) => m.type === 'attire');
    if (attires.length) {
      // 叠最弱的那个（hp 最低），保留能打的
      const byHp = attires.slice().sort((a, b) => {
        const ua = view.me.board.find((u) => u.uid === a.uid);
        const ub = view.me.board.find((u) => u.uid === b.uid);
        return (ua?.hp || 99) - (ub?.hp || 99);
      });
      return byHp[0];
    }
  }
  return null;
}

/* ───────────────────────── ③ 价值：天平 ───────────────────────── */

export const VALUE = {
  id: 'value',
  name: '天平（中速）',
  desc: '按曲线落子，每一步都算"这一步换到多少"。不吃亏也不冒进。',
  build(pool) {
    return autoBuild(pool, {
      names: 12,
      prefer: (c) => {
        const n = costOf(c);
        const curve = n === 2 ? 2.2 : n === 3 ? 2.0 : n === 4 ? 1.4 : n === 1 ? 1.2 : -0.4;
        return curve + scoreCard(c) * 0.35;
      },
    });
  },
  choose(view, moves) {
    const pk = pinkPick(view, moves);
    if (pk) return pk;
    let best = null;
    for (const m of moves) {
      let v = 0;
      if (m.type === 'play') {
        const c = view.me.hand[m.i];
        if (!c) continue;
        v = scoreCard(c) * 1.3;
        if (c.type === '单位') v += 2.5;
        // 规则 5.9：引擎卡（行动+X）要先打，否则链在终端卡上断掉
        if (c.av) v += 3.0 + c.av * 2.0;
        // 规则 5.7：装备横置进锻造区＝每回合稳定产锻造值，前两件几乎必做
        if (m.mode === 'forge') {
          // 锻造 vs 装备的真实取舍：**场上没有载体时才锻造**（否则装备能换身材，锻造只换资源）。
          // 旧版无条件「前 2 件先锻造」，实测把橙从 35% 拉到 27%——那是 AI 的自伤策略。
          const f = view.me.forge || 0;
          const carriers = view.me.board.length;
          // 锻造区是橙色的「产能」：场上已有 2 个以上载体时，前两件拿去锻造更赚
          // （每件每回合产 1~3 锻造值 + 累积淬炼）。没有载体时更是唯一选择。
          v = f >= 2 ? 0.8 : carriers === 0 ? 5.0 : carriers >= 2 ? 3.6 : 1.6;
        }
        if (m.target) {
          const t = view.opp.board.find((u) => u.uid === m.target);
          // 解场要按"被解掉的东西值多少"计价，否则 AI 永远只顾铺自己的
          if (t) v += (t.atk + t.imp + t.hp) * 0.9;
        }
        // 清场：按"能扫掉几个"计价，否则 AOE 永远排在铺场后面
        for (const e of c.effects || []) {
          if (e.do === 'aoe') {
            const hit = view.opp.board.filter((u) => u.hp <= e.n).length;
            v += hit * 4.5;
          }
        }
      } else if (m.type === 'attack') {
        if (m.avatar) {
          // 灵体亲自作战：直击按 IMP 计价，打单位按换血计价
          if (m.target === 'face') v = (view.me.avatar?.imp || 0) * 1.6;
          else {
            const t = view.opp.board.find((u) => u.uid === m.target);
            v = t ? Math.min(view.me.avatar?.atk || 0, t.hp) * 1.2 : 0;
          }
          if (!v) continue;
          if (!best || v > best.v) best = { m, v };
          continue;
        }
        const a = byUid(view, m.uid);
        if (!a) continue;
        if (m.target === 'face') v = a.imp * 1.35;
        else {
          const t = view.opp.board.find((u) => u.uid === m.target);
          if (!t) continue;
          v = Math.min(a.atk, t.hp) * 1.1 + (a.atk >= t.hp ? t.hp * 0.6 : -1.2) - (t.atk >= a.hp ? a.hp * 0.5 : 0);
        }
      } else if (m.type === 'buy') {
        // 规则 5.9：购买＝把金币换成手牌（跨回合的卡差），引擎件优先（它延长行动值链）
        const c = view.market?.[m.i];
        if (!c) continue;
        v = 7.0 - (c.cost?.n || 0) * 0.7;
        if (c.av) v += 3.5;
        if (c.type === '单位') v += 2.0;
        if (c.type === '装备') v -= 1.0;
        // 买牌进的是**弃牌区**，不占手牌，所以只看「买得起 + 值不值」。
        // 但每买一张都会稀释牌库里的铜币密度（DBG 的经典陷阱），牌库越长越该收手。
        const deckN = view.me.deck || 0;
        v -= Math.max(0, deckN - 12) * 0.55;
        if (deckN < 4) v += 2.0;   // 牌库见底时，买的牌就是下一轮的燃料
      } else if (m.type === 'avatar') {
        v = view.me.avatar?.timing === 'late' ? 2.4 : 8.5;
      } else if (m.type === 'ascend') {
        // 升灵要吃自己的场面：前期吃等于送死，第 6 轮后才值得
        v = view.round >= 6 ? 9 : 1.5;
      } else if (m.type === 'ride') v = 7.0;
      else if (m.type === 'attire') v = (view.me.board?.length || 0) >= 3 ? 3.0 : 0.3;
      else if (m.type === 'awaken') v = 3.6;
      else if (m.type === 'resonate') v = 3.4;
      else v = 0;
      if (!best || v > best.v) best = { m, v };
    }
    return best && best.v > 0.6 ? best.m : moves[moves.length - 1];
  },
};

/* ───────────────────────── ④ 随机：乱流 ───────────────────────── */

export const RANDOM = {
  id: 'random',
  name: '乱流（随机）',
  desc: '合法动作里随便挑一个。用来当基线，也用来试卡表的鲁棒性。',
  build(pool) { return autoBuild(pool, { names: 10 }); },
  choose(view, moves) { return moves[Math.floor(Math.random() * moves.length)]; },
};

/* 响应窗口（规则 3.6）：有反击就反对手的法术/结界；血量见底时用任意瞬间卡搏一把 */
function respondPick(view, ctx, moves) {
  const hand = view.me.hand || [];
  // 攻击响应：能用瞬间伤害点杀攻击者就点（【烈阳断刃】）
  if (ctx.kind === 'attack' && ctx.attacker) {
    const kill = moves.find((m) => {
      if (m.type !== 'respond') return false;
      const c = hand[m.i];
      return c && (c.effects || []).some((e) => e.do === 'dmg' && (ctx.attacker.hp || 0) <= (e.n || 0));
    });
    if (kill) return kill;
    return { type: 'pass' };
  }
  const counters = moves.filter((m) => m.type === 'respond' && /反击/.test(hand[m.i]?.text || ''));
  if (counters.length && ctx.card?.type && ctx.card.type !== '单位') return counters[0];
  const others = moves.filter((m) => m.type === 'respond');
  if (others.length && (view.opp.life <= 6 || view.me.life <= 6)) return others[0];
  return { type: 'pass' };
}

AGGRO.respond = respondPick;
CONTROL.respond = respondPick;
VALUE.respond = respondPick;

export const BUILTIN = [AGGRO, CONTROL, VALUE, RANDOM];
