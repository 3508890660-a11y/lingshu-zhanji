/**
 * 《灵枢战纪》颜色构筑 AI 脚本 · step5preview
 * 执行模型 step-5-preview｜主色：青（法力）｜策略：潮汐连击
 *
 * 思路：青是唯一"打得多 → 回合末抽得多"的自循环颜色（回合末按打出数÷2 额外抽牌）。
 * 本脚本把每个回合的出牌数拉满：1 费抽 2（连击共鸣）开局滚雪球，
 * 中盘涡流长老随出牌数涨攻，6 费月潮终曲拍板并给全场 +1/+1。
 * 只从引擎枚举的合法动作里挑一个；不修改 view/moves；无跨局状态。
 */
const meta = {
  name: 'step5preview · 潮汐连击',
  desc: '执行模型 step-5-preview；颜色 青；策略 潮汐连击；1 费抽 2 滚起出牌数，回合末按打出数回手，涡流长老与月潮终曲终结。',
  id: 'model:step5preview',
  color: '青',
};

/* ── 卡组：10 个名目 ×3 ＝ 30 张（青 27 ＋ 灰 3）── */
const DECK = [
  { id: 'LQ01-127', n: 3 }, // 潮汐幼灵      法力1  1/1/2 潮汐（涨潮 +1 ATK）
  { id: 'LQ01-138', n: 3 }, // 连击共鸣      法力1  抽 2
  { id: 'LQ01-129', n: 3 }, // 潮汐号令      法力2  抽 1（青卡自动切换潮汐）
  { id: 'LQ01-128', n: 3 }, // 溅跃小妖      法力2  2/1/2
  { id: 'LQ01-290', n: 3 }, // 碎晶冲击      通用2  对 1 个单位 3 点伤害（灰）
  { id: 'LQ01-131', n: 3 }, // 深海重压      法力3  对 1 个单位 3 点伤害
  { id: 'LQ01-135', n: 3 }, // 潮汐帷幕      法力3  结界：全体获得守护1
  { id: 'LQ01-140', n: 3 }, // 涡流长老      法力4  3/2/4 涡流3（本回合每用 1 张卡 +1 ATK）
  { id: 'LQ01-143', n: 3 }, // 大潮调律师    法力4  3/2/4
  { id: 'LQ01-136', n: 3 }, // 月潮终曲      法力6  5/4/7 潮汐＋战吼全体 +1/+1
];

function build() {
  return DECK.map((x) => ({ id: x.id, n: x.n }));
}

/* ── 常量与工具 ── */
const KEY_UNITS = { '涡流长老': 1, '大潮调律师': 1, '月潮终曲·海灵圣母': 1 };
const SR_OF = { '潮汐幼灵': 1, '溅跃小妖': 2, '涡流长老': 4, '大潮调律师': 4, '月潮终曲·海灵圣母': 6 };
const ASC_SR = { 'LQ01-275': 3, 'LQ01-276': 5, 'LQ01-277': 6 };
const AV_COST = { '潮汐唤者·温蒂妮': 0, '风暴织者·泽菲': 1, '谐律潮汐·调和师': 2 };
const has = (arr, x) => Array.isArray(arr) && arr.indexOf(x) >= 0;

/** 单位威胁值：解场瞄准与交换评估共用 */
function threat(u) {
  let v = (u.atk || 0) * 1.2 + (u.imp || 0) * 1.5 + (u.hp || 0) * 0.25;
  for (const k of (u.kw || [])) {
    if (k === '冲锋') v += 1;
    else if (k === '践踏') v += 1.2;
    else if (k === '疾风') v += 0.8;
    else if (k === '圣盾') v += 0.8;
    else if (k === '守卫') v += 0.6;
    else if (k === '成长') v += 1.2;
    else if (k.indexOf('涡流') === 0) v += 1.5;
    else if (k === '团结') v += 0.5;
    else if (k.indexOf('守护') === 0) v += 0.4;
  }
  return v;
}

/** 指向敌方单位的直伤合计（碎晶冲击/深海重压都是 3） */
function dmgOf(card) {
  let n = 0;
  for (const e of (card && card.effects) || []) {
    if (e.do === 'dmg' && e.target === 'enemyUnit') n += e.n || 0;
  }
  return n;
}

/* ── 出牌：给每个合法 play 打分，取最高 ── */
function pickPlay(view, plays) {
  const me = view.me, opp = view.opp;
  const myN = (me.board || []).length, oppN = (opp.board || []).length;
  let best = null;
  for (const m of plays) {
    const card = (me.hand || [])[m.i];
    if (!card) continue;
    const name = card.name;
    let s;
    if (name === '连击共鸣') s = 10;                       // 1 费抽 2：引擎核心
    else if (name === '月潮终曲·海灵圣母') {                // 终局板：有场面/抢血/空场才急
      s = (myN >= 1 || opp.life <= 14 || oppN === 0) ? 11 : 6;
    } else if (name === '碎晶冲击' || name === '深海重压') {
      const d = dmgOf(card);
      const t = (opp.board || []).find((u) => u.uid === m.target);
      if (!t || t.hp > d || has(t.kw, '圣盾')) continue;   // 解不掉就留着
      const tv = threat(t);
      if (tv < 2.8 && oppN > 1) continue;                  // 只换有价值的目标
      s = 9 + Math.min(2, tv * 0.2);
    } else if (name === '涡流长老') s = 8;
    else if (name === '潮汐号令') s = 7;
    else if (name === '潮汐帷幕') s = myN >= 2 ? 7.5 : 2;  // 守护1 覆盖率
    else if (name === '大潮调律师') s = 6.5;
    else if (name === '溅跃小妖') s = 6;
    else if (name === '潮汐幼灵') s = 5.5;
    else s = 4;                                            // 未知卡兜底：照常打出
    if (!best || s > best.s) best = { m: m, s: s };
  }
  return best ? best.m : null;
}

/* ── 升灵：模拟引擎的"按 SR 升序凑素材"，只打不亏的仪式 ── */
function pickAscend(view, ascMoves) {
  const me = view.me, opp = view.opp;
  const board = me.board || [];
  if (board.length < 4) return null;                       // 场面太薄不献祭
  if (board.length < 5 && (opp.board || []).length > 2) return null;
  let best = null;
  for (const m of ascMoves) {
    const need = ASC_SR[m.id] || 3;
    const units = board
      .map((u) => ({ u: u, sr: SR_OF[u.name] || 0 }))
      .filter((x) => x.sr > 0)
      .sort((a, b) => a.sr - b.sr);
    let sum = 0, take = 0, keyTaken = 0;
    for (const x of units) {
      if (sum >= need) break;
      sum += x.sr; take += 1;
      if (KEY_UNITS[x.u.name]) keyTaken += 1;
    }
    if (sum < need) continue;
    if (take > board.length - 2) continue;                 // 至少留 2 个单位
    if (keyTaken > 0) continue;                            // 不献祭关键单位
    const v = need + (m.id === 'LQ01-277' ? 3 : m.id === 'LQ01-276' ? 2 : 0);
    if (!best || v > best.v) best = { m: m, v: v };
  }
  return best ? best.m : null;
}

/* ── 攻击：只打稳赚的；空场打脸；落后时留一个阻挡者 ── */
function pickAttack(view, attacks) {
  const me = view.me, opp = view.opp;
  const myBoard = me.board || [], oppBoard = opp.board || [];
  const myT = {};
  for (const u of myBoard) myT[u.uid] = threat(u);
  const blockers = oppBoard.filter((u) => !u.attacked);
  let keeper = 0;
  if (!oppBoard.length && opp.life > 15 && me.life < 10) {
    let kp = null;
    for (const u of myBoard) if (!kp || (u.hp || 0) > (kp.hp || 0)) kp = u;
    if (kp) keeper = kp.uid;
  }
  const hasOtherFace = attacks.some((a) => a.target === 'face' && a.uid !== keeper);
  let best = null;
  for (const m of attacks) {
    const a = myBoard.find((x) => x.uid === m.uid);
    if (!a) continue;
    if (keeper && m.uid === keeper && m.target === 'face' && hasOtherFace && opp.life > 8) continue;
    let v;
    if (m.target === 'face') {
      if (!blockers.length) v = (a.imp || 0) + 2;          // 空场：稳击脸
      else {
        let bb = null;
        for (const b of blockers) {
          if (!bb || (b.atk || 0) > (bb.atk || 0) || ((b.atk || 0) === (bb.atk || 0) && (b.hp || 0) > (bb.hp || 0))) bb = b;
        }
        const kills = (a.atk || 0) >= (bb.hp || 0) && !has(bb.kw, '圣盾');
        const dies = (bb.atk || 0) >= (a.hp || 0);
        if (kills && !dies) v = (a.imp || 0) + 3;
        else if (kills && dies) v = 1.5 + threat(bb) * 0.5;
        else if (!dies) v = (a.imp || 0) * 0.4;
        else v = -2;                                       // 白送就不打
        if (opp.life <= 6) v += 1.5;                       // 抢血加权
      }
    } else {
      const t = oppBoard.find((u) => u.uid === m.target);
      if (!t) continue;
      const kills = (a.atk || 0) >= (t.hp || 0) && !has(t.kw, '圣盾');
      const dies = (t.atk || 0) >= (a.hp || 0);
      const tv = threat(t);
      if (kills && !dies) v = 3 + tv;
      else if (kills && dies) v = 1.5 + tv * 0.8 - myT[m.uid] * 0.15 - (KEY_UNITS[a.name] ? 2.5 : 0);
      else if (!dies) v = 0.8 + tv * 0.3;
      else v = -2.5 + tv * 0.15;                           // 换不掉不送死
    }
    if (!best || v > best.v) best = { m: m, v: v };
  }
  return best && best.v >= 1.2 ? best.m : null;
}

/* ── 阻挡宣告：稳换/无伤挡/濒死必挡 ── */
function block(view, bmoves) {
  const noBlock = bmoves.find((m) => m.type === 'noBlock') || bmoves[bmoves.length - 1];
  try {
    const oppBoard = (view.opp && view.opp.board) || [];
    const myBoard = (view.me && view.me.board) || [];
    const att = oppBoard.filter((u) => u.attacked).sort((x, y) => (y.imp || 0) - (x.imp || 0))[0] || oppBoard[0];
    if (!att) return noBlock;
    const life = (view.me && view.me.life) || 0;
    const mustBlock = life <= (att.imp || 0);
    let best = null;
    for (const m of bmoves) {
      if (m.type !== 'block') continue;
      const b = myBoard.find((u) => u.uid === m.uid);
      if (!b) continue;
      const kills = (b.atk || 0) >= (att.hp || 0) && !has(att.kw, '圣盾');
      const dies = (att.atk || 0) >= (b.hp || 0);
      let v = 0;
      if (kills) v += 3;
      if (!dies) v += 2;
      if (dies && !kills) v -= 3;
      if (mustBlock) v += 6;
      if (KEY_UNITS[b.name] && dies && !kills) v -= 4;     // 关键单位不做亏损交换
      if (!best || v > best.v) best = { m: m, v: v };
    }
    if (best && (best.v >= 2 || mustBlock)) return best.m;
    return noBlock;
  } catch (e) {
    return noBlock;
  }
}

/* ── 主决策 ── */
function decide(view, moves) {
  const me = view.me || {}, opp = view.opp || {};
  const myBoard = me.board || [], oppBoard = opp.board || [];
  const plays = moves.filter((m) => m.type === 'play');
  const attacks = moves.filter((m) => m.type === 'attack');
  const avMove = moves.find((m) => m.type === 'avatar') || null;
  const ascMoves = moves.filter((m) => m.type === 'ascend');
  const av = me.avatar || {};
  const avUsed = !!av.used;
  const avCost = AV_COST[av.name] || 0;

  // 灵体要花法力时，若手里有 6 费月潮终曲会差费，先出牌再开灵体
  let deferAv = false;
  if (avMove && !avUsed && avCost > 0) {
    const yue = (me.hand || []).some((c) => c.name === '月潮终曲·海灵圣母');
    if (yue && (me.res || 0) - avCost < 6) deferAv = true;
  }

  // 1) 斩杀：无守卫且总 IMP 够（留 2 点余量防补挡）就打脸
  const guards = oppBoard.filter((u) => has(u.kw, '守卫'));
  if (!guards.length) {
    let impSum = 0; const seen = {};
    for (const a of attacks) {
      if (a.target !== 'face' || seen[a.uid]) continue;
      seen[a.uid] = 1;
      const u = myBoard.find((x) => x.uid === a.uid);
      impSum += u ? (u.imp || 0) : 0;
    }
    if (impSum >= opp.life + (oppBoard.length ? 2 : 0)) {
      let bm = null, bi = -1;
      for (const a of attacks) {
        if (a.target !== 'face') continue;
        const u = myBoard.find((x) => x.uid === a.uid);
        const imp = u ? (u.imp || 0) : 0;
        if (imp > bi) { bi = imp; bm = a; }
      }
      if (bm) return bm;
    }
  }

  // 2) 涨潮抢攻：对手空场且潮汐幼灵显示 +1 ATK（=涨潮）时先打脸再出牌
  if (!oppBoard.length) {
    const sprout = myBoard.find((u) => u.name === '潮汐幼灵');
    if (sprout && (sprout.atk || 0) >= 2) {
      for (const a of attacks) {
        if (a.target !== 'face') continue;
        const u = myBoard.find((x) => x.uid === a.uid);
        if (u && has(u.kw, '潮汐')) return a;
      }
    }
  }

  // 3) 灵体：early 时机先开（抽牌/加法力都惠及本回合出牌）
  if (avMove && !avUsed && av.timing !== 'late' && !deferAv) return avMove;

  // 4) 先升灵再拍月潮：让外枢灵体也吃到 +1/+1
  if (ascMoves.length) {
    const yueNow = plays.some((m) => {
      const c = (me.hand || [])[m.i];
      return c && c.name === '月潮终曲·海灵圣母';
    });
    if (yueNow) {
      const mv = pickAscend(view, ascMoves);
      if (mv) return mv;
    }
  }

  // 5) 出牌（拉满出牌数 = 回合末抽牌引擎）
  if (plays.length) {
    const mv = pickPlay(view, plays);
    if (mv) return mv;
  }

  // 6) 升灵
  if (ascMoves.length) {
    const mv = pickAscend(view, ascMoves);
    if (mv) return mv;
  }

  // 7) 延迟/本回合限次的灵体（出完牌、攻击前开）
  if (avMove && !avUsed && (av.timing === 'late' || deferAv)) return avMove;

  // 8) 攻击
  if (attacks.length) {
    const mv = pickAttack(view, attacks);
    if (mv) return mv;
  }

  // 9) 兜底：灵体还没用就用掉
  if (avMove && !avUsed) return avMove;
  return null;
}

function choose(view, moves) {
  const pass = moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  try {
    return decide(view, moves) || pass;
  } catch (e) {
    return pass;
  }
}
