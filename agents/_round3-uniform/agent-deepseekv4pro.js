// ============================================================
// 《灵枢战纪》AI 脚本 · deepseek v4pro
// 主色：绿 · 策略：地脉生根·践踏升灵
// 胜利方式：地标加速滚法力 → 践踏兽超曲线压脸 → 廉价升灵收尾
// ============================================================

const meta = {
  name: 'deepseek v4pro · 地脉生根·践踏升灵',
  desc: '执行模型 deepseek-v4-pro；颜色 绿；策略 地脉生根·践踏升灵；地标滚法力、践踏兽压脸、外枢升灵收尾',
  id: 'model:deepseekv4pro',
  color: '绿'
};

// 卡组：10 名目 ×3 = 30 张（全绿，无灰）
const DECK = [
  { id: 'LQ01-056', n: 3 }, // 幼叶之池（地标 法力1 产1）
  { id: 'LQ01-061', n: 3 }, // 母神共鸣地（地标 法力2 产2）
  { id: 'LQ01-055', n: 3 }, // 盖亚幼株（单位 法力1 1/1/1 成长）
  { id: 'LQ01-057', n: 3 }, // 摇篮藤根（单位 法力2 1/2/3 守卫）
  { id: 'LQ01-063', n: 3 }, // 林冠漫步者（单位 法力3 2/2/3 地标加成）
  { id: 'LQ01-065', n: 3 }, // 荒原猛犸（单位 法力4 4/3/4 践踏）
  { id: 'LQ01-066', n: 3 }, // 裂地巨犀（单位 法力5 5/4/5 践踏）
  { id: 'LQ01-067', n: 3 }, // 林冠泰坦（单位 法力6 6/5/6 践踏再生）
  { id: 'LQ01-058', n: 3 }, // 荆棘绞杀（法术 法力2 单体3伤）
  { id: 'LQ01-060', n: 3 }  // 落叶风暴（法术 法力3 AOE2伤）
];

function build(pool) {
  return DECK.slice();
}

// ---- 工具函数 ----
function handCard(view, m) {
  if (!m || m.i == null) return null;
  const h = view.me && view.me.hand;
  return (h && h[m.i]) ? h[m.i] : null;
}

function myUnit(view, uid) {
  const b = view.me && view.me.board;
  if (!b) return null;
  for (let i = 0; i < b.length; i++) if (b[i].uid === uid) return b[i];
  return null;
}

function oppUnit(view, uid) {
  const b = view.opp && view.opp.board;
  if (!b) return null;
  for (let i = 0; i < b.length; i++) if (b[i].uid === uid) return b[i];
  return null;
}

function hasKw(u, kw) {
  return !!(u && u.kw && u.kw.indexOf(kw) >= 0);
}

function ofType(moves, t) {
  const out = [];
  for (let i = 0; i < moves.length; i++) if (moves[i].type === t) out.push(moves[i]);
  return out;
}

function pickRemoval(view, plays) {
  const oppBoard = (view.opp && view.opp.board) || [];

  // 落叶风暴（AOE2）：对手 ≥2 个单位时清场
  const aoe = plays.filter(function (m) {
    const c = handCard(view, m);
    return c && c.id === 'LQ01-060';
  });
  if (aoe.length && oppBoard.length >= 2) return aoe[0];

  // 荆棘绞杀（单体3伤）：优先解守卫，其次高攻单位
  const kill = plays.filter(function (m) {
    const c = handCard(view, m);
    return c && c.id === 'LQ01-058';
  });
  let best = null, bestUnit = null, bestScore = -1;
  for (let i = 0; i < kill.length; i++) {
    const t = oppUnit(view, kill[i].target);
    if (!t) continue;
    let s = (t.atk || 0) * 2 + (t.imp || 0);
    if (hasKw(t, '守卫')) s += 100;
    if (s > bestScore) { bestScore = s; bestUnit = t; best = kill[i]; }
  }
  if (best && (hasKw(bestUnit, '守卫') || (bestUnit.atk || 0) >= 2)) return best;
  return null;
}

function pickUnit(view, units) {
  // 低费优先：打满曲线、铺场作升灵素材
  let best = units[0], bestCost = Infinity;
  for (let i = 0; i < units.length; i++) {
    const c = handCard(view, units[i]);
    const n = (c && c.cost && c.cost.n) || 99;
    if (n < bestCost) { bestCost = n; best = units[i]; }
  }
  return best;
}

function pickAscend(view, asc) {
  // 场面冗余（≥4 个单位）时才牺牲素材召唤外枢灵体
  const board = (view.me && view.me.board) || [];
  if (board.length < 4) return null;
  // 优先：兽王之魂(7/6/6 SR5) > 巨木之心(6/4/7 SR3) > 苍林守望(5/5/8 SR3)
  const order = ['LQ01-268', 'LQ01-266', 'LQ01-267'];
  for (let i = 0; i < order.length; i++) {
    for (let j = 0; j < asc.length; j++) {
      if (asc[j].id === order[i]) return asc[j];
    }
  }
  return asc[0];
}

function pickAttack(view, atk) {
  // 打脸优先
  const face = atk.filter(function (m) { return m.target === 'face'; });
  if (face.length) return face[0];

  // 打单位：守卫优先解，其次有利交换
  let best = null, bestScore = -1e9;
  for (let i = 0; i < atk.length; i++) {
    const m = atk[i];
    const u = myUnit(view, m.uid);
    const t = oppUnit(view, m.target);
    if (!u || !t) continue;
    const isGuard = hasKw(t, '守卫');
    const canKill = (u.atk || 0) >= (t.hp || 0);
    const dies = (t.atk || 0) >= (u.hp || 0);
    let s = 0;
    if (isGuard) s += 500;
    if (canKill && !dies) s += 100;   // 白赚
    else if (canKill && dies) s += 20; // 互换
    else if (!canKill && dies) s -= 200; // 送死
    else s += (u.atk || 0) - (t.hp || 0); // 磨血
    s += (u.atk || 0);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

function choose(view, moves) {
  if (!moves || moves.length === 0) return null;
  const last = moves[moves.length - 1];
  try {
    const me = view.me || {};
    const opp = view.opp || {};

    // 1) 斩杀：可打脸伤害 ≥ 对手生命，直接打脸
    const face = ofType(moves, 'attack').filter(function (m) { return m.target === 'face'; });
    if (face.length) {
      let dmg = 0;
      for (let i = 0; i < face.length; i++) {
        const u = myUnit(view, face[i].uid);
        if (u) dmg += (u.imp || 0);
      }
      if (dmg >= (opp.life || 0)) return face[0];
    }

    // 2) 灵体（early：免费加资源，回合初先开）
    const av = ofType(moves, 'avatar');
    if (av.length && me.avatar && me.avatar.timing !== 'late') return av[0];

    // 3) 地标：ramp 优先
    const playMoves = ofType(moves, 'play');
    const lands = playMoves.filter(function (m) {
      const c = handCard(view, m);
      return c && c.type === '地标';
    });
    if (lands.length) return lands[0];

    // 4) 单位：铺场（低费优先）
    const units = playMoves.filter(function (m) {
      const c = handCard(view, m);
      return c && c.type === '单位';
    });
    if (units.length) return pickUnit(view, units);

    // 5) 解场：清守卫 / 高攻威胁（攻击前）
    const rem = pickRemoval(view, playMoves);
    if (rem) return rem;

    // 6) 攻击：打脸优先，否则有利交换
    const atk = ofType(moves, 'attack');
    if (atk.length) {
      const a = pickAttack(view, atk);
      if (a) return a;
    }

    // 7) 升灵：攻击后、场面冗余时召唤外枢灵体（为下回合铺垫）
    const asc = ofType(moves, 'ascend');
    if (asc.length) {
      const a = pickAscend(view, asc);
      if (a) return a;
    }

    // 8) 灵体（late：若有 rally 类增益，攻击前开；绿色无，兜底）
    if (av.length && me.avatar) return av[0];

    // 9) 兜底：pass
    return last;
  } catch (e) {
    return last;
  }
}

function block(view, bmoves) {
  // 激进的践踏打脸：不主动阻挡，保留己方打点（守卫单位会自动挡脸）
  if (!bmoves || bmoves.length === 0) return null;
  for (let i = 0; i < bmoves.length; i++) {
    if (bmoves[i].type === 'noBlock') return bmoves[i];
  }
  return bmoves[bmoves.length - 1];
}
