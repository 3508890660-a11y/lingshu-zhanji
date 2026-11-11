// agents/agent-glm53.js —— GLM5.3 · 潮汐流转中速（青）
// 执行模型：glm-5.3
// 零依赖源码脚本，由 new Function('api', src) 编译；只写 build / choose / block / meta。

const meta = {
  name: 'GLM5.3 · 潮汐流转中速',
  desc: '执行模型 glm-5.3；颜色 青；策略 潮汐流转中速；低费铺场靠流转抽牌滚雪球，点杀清障后直击灵体',
  id: 'model:glm53',
  color: '青',
};

/* ───────────────────────── build ─────────────────────────
 * 30 张 = 10 名目 × 3：
 *   单位 15：127 潮汐幼灵(法1 1/1/2) / 128 溅跃小妖(法2 2/1/2) /
 *            133 潮卫·堤灵(法3 2/2/4 守卫) / 140 涡流长老(法4 3/2/4 涡流3) /
 *            136 月潮终曲·海灵圣母(法6 5/4/7 战吼全体+1/+1)
 *   点杀 6 ：131 深海重压(法3 对1单位3伤) / 灰 290 碎晶冲击(通用2 对1单位3伤)
 *   过牌 9 ：138 连击共鸣(法1 抽2) / 130 潮位罗盘(法2 地标,进场抽1) / 灰 286 褪色符文(通用1 抽1)
 * 费用曲线 1-2 / 3-4 / 5-6 / 7+ ＝ 18 / 9 / 3 / 0。
 */
function build(pool) {
  void pool; // 卡组为固定清单，卡号均在主色青+灰池内，由 validateDeck 兜底校验
  return [
    { id: 'LQ01-127', n: 3 },
    { id: 'LQ01-128', n: 3 },
    { id: 'LQ01-133', n: 3 },
    { id: 'LQ01-140', n: 3 },
    { id: 'LQ01-136', n: 3 },
    { id: 'LQ01-131', n: 3 },
    { id: 'LQ01-138', n: 3 },
    { id: 'LQ01-130', n: 3 },
    { id: 'LQ01-290', n: 3 },
    { id: 'LQ01-286', n: 3 },
  ];
}

/* ───────────────────────── 工具 ───────────────────────── */

const REMOVAL = { 'LQ01-131': 3, 'LQ01-290': 3 }; // 点杀（对 1 个敌方单位 3 伤）
const CYCLE = { 'LQ01-138': 5, 'LQ01-130': 3, 'LQ01-286': 3 }; // 过牌件

function unitByUid(board, uid) {
  for (let i = 0; i < board.length; i++) if (board[i].uid === uid) return board[i];
  return null;
}

function hasKw(u, kw) { return !!(u && u.kw && u.kw.indexOf(kw) >= 0); }

/* ───────────────────────── choose ─────────────────────────
 * 优先级：斩杀直击 → early 灵体 → 点杀威胁 → 138 抽 2 → 最贵单位铺场
 *        → 升灵 → 余费过牌 → 直击（威胁换血例外）→ 守卫有利攻击 → late 灵体 → pass
 */
function choose(view, moves) {
  if (!moves || !moves.length) return null;

  const me = view.me;
  const opp = view.opp;
  const fallback = moves[moves.length - 1]; // 引擎把 pass 压在最后

  const plays = moves.filter(function (m) { return m.type === 'play'; });
  const attacks = moves.filter(function (m) { return m.type === 'attack'; });
  const faceAtks = attacks.filter(function (m) { return m.target === 'face'; });
  const avatarMv = moves.find(function (m) { return m.type === 'avatar'; }) || null;
  const ascends = moves.filter(function (m) { return m.type === 'ascend'; });

  // 1) 斩杀：可直击 IMP 总和 ≥ 对手生命，且攻击者数超过潜在阻挡数（有漏网直击）
  if (faceAtks.length) {
    let imp = 0;
    const seen = {};
    for (let i = 0; i < faceAtks.length; i++) {
      const m = faceAtks[i];
      if (seen[m.uid]) continue;
      seen[m.uid] = 1;
      const u = unitByUid(me.board, m.uid);
      if (u) imp += u.imp;
    }
    const blockers = opp.board.filter(function (u) { return !u.attacked && !u.frozen; }).length;
    if (imp >= opp.life && Object.keys(seen).length > blockers) return bestFace(faceAtks, me);
  }

  // 2) early 灵体（默认灵体温蒂妮：免费抽 1，先开先受益）
  const timing = (me.avatar && me.avatar.timing) || 'early';
  if (avatarMv && timing !== 'late') return avatarMv;

  // 3) 点杀：优先消灭真正的威胁（atk≥3，或残血 atk≥2，或残血守卫）
  const rm = pickRemoval(plays, me, opp);
  if (rm) return rm;

  // 4) 连击共鸣（1 费抽 2）——最优先的过牌
  const p138 = plays.find(function (m) { const c = me.hand[m.i]; return c && c.id === 'LQ01-138'; });
  if (p138) return p138;

  // 5) 铺场：出最贵的单位（填满曲线）
  const unitPlay = pickUnit(plays, me);
  if (unitPlay) return unitPlay;

  // 6) 升灵：场面宽裕时把小单位换成外枢大件
  const asc = pickAscend(ascends, view);
  if (asc) return asc;

  // 7) 余费过牌（罗盘 / 褪色符文）
  const cyc = plays.find(function (m) { const c = me.hand[m.i]; return c && CYCLE[c.id]; });
  if (cyc) return cyc;

  // 8) 威胁换血：atk≥4 的敌方大件若能白吃，先换掉
  const trade = pickThreatTrade(attacks, me, opp);
  if (trade) return trade;

  // 9) 直击
  if (faceAtks.length) return bestFace(faceAtks, me);

  // 10) 守卫在场：只打「白吃」或「消血且自保」的仗
  const guardAtk = bestGuardAttack(attacks, me, opp);
  if (guardAtk) return guardAtk;

  // 11) late 灵体（本回合有效的群体增益，出完牌再开）
  if (avatarMv) return avatarMv;

  return fallback;
}

/* IMP 最高的攻击者先走（若被挡也优先消耗对方阻挡名额） */
function bestFace(faceAtks, me) {
  let best = faceAtks[0];
  let bv = -1;
  for (let i = 0; i < faceAtks.length; i++) {
    const u = unitByUid(me.board, faceAtks[i].uid);
    const v = u ? u.imp : 0;
    if (v > bv) { bv = v; best = faceAtks[i]; }
  }
  return best;
}

/* 点杀目标：能点死优先，其次威胁最大；只对值得用牌的目标出手 */
function pickRemoval(plays, me, opp) {
  let best = null;
  let bs = 0;
  for (let i = 0; i < plays.length; i++) {
    const m = plays[i];
    const c = me.hand[m.i];
    if (!c || !REMOVAL[c.id] || m.target == null) continue;
    const t = unitByUid(opp.board, m.target);
    if (!t) continue;
    const dying = t.hp <= REMOVAL[c.id];
    const worthy = t.atk >= 3 || (dying && t.atk >= 2) || (dying && hasKw(t, '守卫'));
    if (!worthy) continue;
    let s = t.atk * 2 + t.hp;
    if (dying) s += 6;
    if (hasKw(t, '守卫')) s += 4; // 守卫挡直击，优先开路
    if (hasKw(t, '守护1') || hasKw(t, '守护2')) s += 2;
    if (s > bs) { bs = s; best = m; }
  }
  return bs > 0 ? best : null;
}

/* 铺场：最贵单位优先；136 海灵圣母场面太小时略降权（buff 收益低） */
function pickUnit(plays, me) {
  let best = null;
  let bs = -1;
  for (let i = 0; i < plays.length; i++) {
    const m = plays[i];
    const c = me.hand[m.i];
    if (!c || c.type !== '单位') continue;
    let s = (c.cost ? c.cost.n : 0) * 10 + (c.atk || 0) * 2 + (c.hp || 0);
    if (c.id === 'LQ01-136' && me.board.length < 2) s -= 40;
    if (m.target != null) { // 133 堤灵的 buff 目标：选最耐久的友方
      const t = unitByUid(me.board, m.target);
      if (t) s += Math.min(8, t.hp);
    }
    if (s > bs) { bs = s; best = m; }
  }
  return bs >= 0 ? best : null;
}

/* 升灵：场≥3 起考虑——敌面宽→深渊潮主(AOE2)；断牌/后期→大潮谐律盘(抽3)；否则潮汐共鸣锚(直击2) */
function pickAscend(ascends, view) {
  if (!ascends.length) return null;
  const me = view.me;
  const opp = view.opp;
  if (me.board.length < 3) return null;
  let want = null;
  if (opp.board.length >= 2) want = 'LQ01-276';
  else if (view.round >= 7 || me.hand.length <= 2) want = 'LQ01-277';
  else want = 'LQ01-275';
  if (want === 'LQ01-277' && me.board.length < 4) want = 'LQ01-275';
  if (want === 'LQ01-276' && me.board.length < 4) want = 'LQ01-275';
  return ascends.find(function (m) { return m.id === want; }) || ascends[0];
}

/* 威胁换血：无守卫时，atk≥4 的敌方大件能被我白吃（目标死、我不死）就先换 */
function pickThreatTrade(attacks, me, opp) {
  let best = null;
  let bs = 0;
  for (let i = 0; i < attacks.length; i++) {
    const m = attacks[i];
    if (m.target === 'face') continue;
    const u = unitByUid(me.board, m.uid);
    const t = unitByUid(opp.board, m.target);
    if (!u || !t || t.atk < 4) continue;
    if (u.atk >= t.hp && t.atk < u.hp) {
      const s = t.atk * 2 + t.hp;
      if (s > bs) { bs = s; best = m; }
    }
  }
  return bs > 0 ? best : null;
}

/* 守卫攻击：白吃(10+) > 消血自保(2)；同分选目标威胁大的 */
function bestGuardAttack(attacks, me, opp) {
  let best = null;
  let bs = 0;
  for (let i = 0; i < attacks.length; i++) {
    const m = attacks[i];
    if (m.target === 'face') continue;
    const u = unitByUid(me.board, m.uid);
    const t = unitByUid(opp.board, m.target);
    if (!u || !t) continue;
    const kills = u.atk >= t.hp;
    const dies = t.atk >= u.hp;
    let s = 0;
    if (kills && !dies) s = 10 + t.atk;
    else if (kills && dies) s = t.atk - (u.atk + u.imp);
    else if (!dies) s = 2; // 消血且自保
    if (s > bs) { bs = s; best = m; }
  }
  return bs > 0 ? best : null;
}

/* ───────────────────────── block ─────────────────────────
 * 防守方阻挡窗口：攻击者＝对方场上已宣告攻击(且未被冻结)的单位中 IMP 最大者（保守取威胁上限）。
 * 规则：要被打死必挡；能换掉攻击者且自保必挡；能挡刀不死也挡；白死不挡。
 */
function block(view, bmoves) {
  if (!bmoves || !bmoves.length) return null;
  const me = view.me;
  const opp = view.opp;
  const noBlock = bmoves.find(function (m) { return m.type === 'noBlock'; }) || bmoves[bmoves.length - 1];
  const blocks = bmoves.filter(function (m) { return m.type === 'block'; });
  if (!blocks.length) return noBlock;

  let attacker = null;
  let ai = -1;
  for (let i = 0; i < opp.board.length; i++) {
    const u = opp.board[i];
    if (u.attacked && !u.frozen && u.imp > ai) { ai = u.imp; attacker = u; }
  }
  if (!attacker) return noBlock;

  const lethal = attacker.imp >= me.life;
  let best = null;
  let bs = -100;
  for (let i = 0; i < blocks.length; i++) {
    const b = unitByUid(me.board, blocks[i].uid);
    if (!b) continue;
    const kills = b.atk >= attacker.hp;
    const dies = attacker.atk >= b.hp;
    let s = -6;
    if (kills && !dies) s = 12;
    else if (kills && dies) s = 4;
    else if (!dies) s = 2;
    if (kills) s += Math.min(6, attacker.atk);
    if (b.atk <= 1 && b.imp <= 1) s += 3; // 低价值单位挡刀不心疼
    if (s > bs) { bs = s; best = blocks[i]; }
  }
  if (lethal) return best || blocks[0]; // 濒死：哪怕白死也要挡
  return bs > 0 ? best : noBlock;
}
