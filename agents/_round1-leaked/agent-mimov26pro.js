/**
 * MIMO-v2.6-pro · 青「潮汐涡流中速」
 * 主色：青 —— 法力＝min(回合+1,6)（消耗制），回合末按打出数÷2 补牌。
 * 卡组：24 单位铺场换血 ＋ 连击共鸣过牌 ＋ 深海重压点解，
 *       涡流长老（涡流3，随本回合出牌数膨胀）与月潮终曲（全体 +1/+1）终结。
 */
const meta = {
  name: 'MIMO-v2.6-pro · 潮汐涡流中速',
  desc: '执行模型 mimo-v2.6-pro；颜色 青；策略 潮汐涡流中速；24 单位换血压场，涡流长老随出牌数膨胀、月潮终曲全体强化收尾',
  id: 'model:mimov26pro',
  color: '青',
};

function build(pool) {
  // 与预组「潮汐回廊」(127~136) 相比：换出 129/130/132/134/135（低效过牌/结界/反击件），
  // 换入 137/138/140/141/143（单位密度 ＋ 抽牌引擎 ＋ 涡流终端）。10 名目 ×3 ＝ 30 张。
  return [
    { id: 'LQ01-127', n: 3 },
    { id: 'LQ01-138', n: 3 },
    { id: 'LQ01-128', n: 3 },
    { id: 'LQ01-137', n: 3 },
    { id: 'LQ01-141', n: 3 },
    { id: 'LQ01-131', n: 3 },
    { id: 'LQ01-133', n: 3 },
    { id: 'LQ01-140', n: 3 },
    { id: 'LQ01-143', n: 3 },
    { id: 'LQ01-136', n: 3 },
  ];
}

/* ───────────────────────── 工具 ───────────────────────── */

function findUnit(list, uid) {
  if (!list) return null;
  for (let i = 0; i < list.length; i++) if (list[i].uid === uid) return list[i];
  return null;
}

function kwScore(kw) {
  let v = 0;
  if (!kw) return 0;
  for (let i = 0; i < kw.length; i++) {
    const k = kw[i];
    if (k === '冲锋' || k === '神速') v += 3;
    else if (k === '守卫') v += 1.5;
    else if (k === '守护2') v += 2;
    else if (k === '守护1') v += 1;
    else if (k === '圣盾') v += 2;
    else if (k === '践踏') v += 1;
    else if (k === '成长') v += 1.5;
    else if (k === '再生') v += 1;
    else if (k === '团结') v += 0.5;
    else if (k === '潮汐') v += 0.5;
  }
  return v;
}

function unitValue(u) {
  return (u.atk || 0) * 2 + (u.imp || 0) * 1.2 + (u.hp || 0) * 1.1 + kwScore(u.kw);
}

function threatOf(u) {
  return (u.atk || 0) * 2 + (u.imp || 0) * 1.5 + kwScore(u.kw);
}

function effHas(card, d) {
  const es = card && card.effects;
  if (!es) return false;
  for (let i = 0; i < es.length; i++) if (es[i].do === d) return true;
  return false;
}

function effNum(card, d) {
  const es = card && card.effects;
  if (!es) return 0;
  for (let i = 0; i < es.length; i++) if (es[i].do === d) return es[i].n || 0;
  return 0;
}

function hasKw(u, kw) {
  const ks = u && u.kw;
  if (!ks) return false;
  for (let i = 0; i < ks.length; i++) if (ks[i] === kw) return true;
  return false;
}

function handCard(view, m) {
  const h = view.me && view.me.hand;
  if (!h || m.i === undefined || m.i < 0 || m.i >= h.length) return null;
  return h[m.i];
}

/* ─────────────────────── 出牌评估 ─────────────────────── */

function playScore(view, m, card) {
  const myBoard = (view.me && view.me.board) || [];
  const oppBoard = (view.opp && view.opp.board) || [];
  const dumping = ((view.me && view.me.hand) || []).length >= 7; // 手快满：降低门槛，别弃牌

  if (m.target !== undefined && m.target !== null) {
    // 指向去除 / 控制
    if (effHas(card, 'dmg') || effHas(card, 'destroy') || effHas(card, 'bounce') || effHas(card, 'freeze')) {
      const t = findUnit(oppBoard, m.target);
      if (!t) return -1e9;
      const hard = effHas(card, 'destroy') || effHas(card, 'bounce');
      const dmg = effNum(card, 'dmg') || 3;
      const kills = hard || dmg >= (t.hp || 0);
      let s = 55 + threatOf(t);
      if (kills) s += 25; else s -= 25;
      if (!kills && !dumping) s -= 35;           // 不值得把点伤浪费在杀不掉的目标上
      if (kills && hasKw(t, '圣盾')) s -= 3;
      return s;
    }
    // 指向友方增益（潮卫的 +0/+1 等）：按单位进场处理，顺带喂大单位
    const t = findUnit(myBoard, m.target);
    return 80 + unitValue(card) + (t ? t.atk * 0.15 : 0);
  }

  // 无目标牌
  if (effHas(card, 'draw')) return dumping ? 55 : 105;   // 先过牌再铺场，选项最多
  if (card.type === '单位') return 80 + unitValue(card);
  if (effHas(card, 'aoe') || effHas(card, 'aoeRandom')) {
    const n = oppBoard.length;
    if (n >= 2) return 85;
    if (n === 1) return dumping ? 55 : 62;
    return -1e9;
  }
  if (effHas(card, 'buffAll') || effHas(card, 'grantAll') || effHas(card, 'rally')) {
    return myBoard.length >= 2 ? 78 : 40;
  }
  if (effHas(card, 'token')) return 74;
  if (effHas(card, 'res') || effHas(card, 'gold')) return 72;
  if (effHas(card, 'heal') || effHas(card, 'shield')) {
    return (view.me.life || 99) <= 10 ? 70 : 40;
  }
  return dumping ? 55 : 50;                       // 未知效果兜底：手紧时留着，手满就打掉
}

function bestPlay(view, moves) {
  const dumping = ((view.me && view.me.hand) || []).length >= 7;
  let best = null;
  let bestS = -1e9;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'play') continue;
    const card = handCard(view, m);
    if (!card) continue;
    const s = playScore(view, m, card);
    if (s > bestS) { bestS = s; best = m; }
  }
  return best && bestS >= (dumping ? 30 : 60) ? best : null;
}

/* ─────────────────────── 攻击评估 ─────────────────────── */

function bestAttack(view, moves) {
  const myBoard = (view.me && view.me.board) || [];
  const oppBoard = (view.opp && view.opp.board) || [];
  const oppLife = (view.opp && view.opp.life) || 99;

  const ready = [];
  let totalImp = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'attack') continue;
    const u = findUnit(myBoard, m.uid);
    if (!u) continue;
    ready.push({ m, u });
    if (m.target === 'face') totalImp += u.imp || 0;
  }
  if (!ready.length) return null;

  const lethal = totalImp >= oppLife;             // 全员冲击 ≥ 对手生命：全力走脸
  // 引擎口径：上回合攻击过的单位本回合不能阻挡（横置），usedBlock 不在快照里，略保守
  const blockers = [];
  for (let i = 0; i < oppBoard.length; i++) {
    if (!oppBoard[i].attacked) blockers.push(oppBoard[i]);
  }

  let best = null;
  let bestS = -1e9;
  for (let i = 0; i < ready.length; i++) {
    const m = ready[i].m;
    const u = ready[i].u;
    let s;
    if (m.target === 'face') {
      s = 40 + (u.imp || 0) * 2;
      if (lethal) s += 500;
      else if (oppLife <= 12) s += 25;            // 对手进斩杀线，倾向走脸
      for (let j = 0; j < blockers.length; j++) {
        const b = blockers[j];
        // 会被无伤吃掉的单位不打脸（对方默认阻挡会白赚）
        if ((b.atk || 0) >= (u.hp || 0) && (u.atk || 0) < (b.hp || 0)) { s -= 90; break; }
      }
    } else {
      const t = findUnit(oppBoard, m.target);
      if (!t) continue;
      const kills = (u.atk || 0) >= (t.hp || 0);
      const dies = (t.atk || 0) >= (u.hp || 0);
      if (kills && !dies) s = 55 + threatOf(t);            // 无损吃掉
      else if (kills && dies) s = 25 + threatOf(t) * 0.7 - unitValue(u) * 0.35; // 等价交换
      else if (!kills && !dies) s = 5;                     // 磨血，可接受
      else s = -60;                                        // 白送
      if (hasKw(t, '圣盾')) s -= 4;
    }
    if (s > bestS) { bestS = s; best = m; }
  }
  return best && bestS > -15 ? best : null;
}

/* ─────────────────────── 升灵评估 ─────────────────────── */

function bestAscend(view, moves) {
  const myBoard = (view.me && view.me.board) || [];
  const oppLife = (view.opp && view.opp.life) || 99;
  // 只在铺场冗余（≥5 个单位）且对手不在斩杀线时献祭：先把攻击走完再升灵
  if (myBoard.length < 5 || oppLife <= 10) return null;
  const order = ['LQ01-275', 'LQ01-276', 'LQ01-277']; // 门槛最低的潮汐共鸣锚优先，少献祭
  let best = null;
  let bestR = 999;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type !== 'ascend') continue;
    let r = 50;
    for (let j = 0; j < order.length; j++) if (order[j] === m.id) { r = j; break; }
    if (r < bestR) { bestR = r; best = m; }
  }
  return best;
}

/* ───────────────────────── 主决策 ───────────────────────── */

function choose(view, moves) {
  if (!moves || !moves.length) return null;
  let pass = moves[moves.length - 1];
  for (let i = 0; i < moves.length; i++) if (moves[i].type === 'pass') pass = moves[i];

  // 1) 灵体启动（early：温蒂妮免费抽 1，先开再出牌）
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.type === 'avatar' && (!view.me.avatar || view.me.avatar.timing !== 'late')) return m;
  }
  // 2) 出牌：抽牌 → 点解 → 单位
  const p = bestPlay(view, moves);
  if (p) return p;
  // 3) late 灵体（全体增益类）铺完场、攻击前再开
  for (let i = 0; i < moves.length; i++) if (moves[i].type === 'avatar') return moves[i];
  // 4) 攻击：无损交换优先，其次走脸
  const a = bestAttack(view, moves);
  if (a) return a;
  // 5) 升灵：攻击后再献祭，白赚一个外枢身体
  const s = bestAscend(view, moves);
  if (s) return s;
  // 兜底：未知动作一律结束回合
  return pass;
}
