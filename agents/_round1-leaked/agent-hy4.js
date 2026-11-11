/* ============================================================
 * agent-hy4.js —— 《灵枢战纪》颜色构筑 AI
 * 主色：青（法力）｜策略：潮涌连打｜执行模型：hy4std / 显示名 hy4
 *
 * 思路一句话：低费铺场 → 用「流转」按出牌数补牌 → 涡流随连打变大
 * → 月潮终曲全体 +1/+1 收束。choose 只排序、只从合法 moves 里挑一个。
 * ============================================================ */

const meta = {
  name: 'hy4 · 潮涌连打',
  desc: '执行模型 hy4std；颜色 青；策略 潮涌连打；低费铺场触发流转与涡流，月潮终曲全体放大收束。',
  id: 'model:hy4',
  color: '青'
};

/* ── 组卡 ──────────────────────────────────────────────────
 * 纯青 30 张 ＝ 10 名目 ×3，不混灰、不混第二主色。
 * 卡号硬编码（引擎用 BY_ID 校验，pool 仅作卡池参考）。
 * 相对预组 YD01-08「青·潮汐回廊」(127~136) 做了四处替换：
 *   130 潮位罗盘 → 138 连击共鸣（2 费抽1 → 1 费抽2，节奏更紧）
 *   132 风暴脉冲 → 137 风暴信使（弱 AOE → 多一个 2 费铺场单位）
 *   134 涨潮反击 → 140 涡流长老（被动冻结 → 随出牌增攻的主动打手）
 *   135 潮汐帷幕 → 143 大潮调律师（偏防守结界 → 再补一个中期单位）
 * 保留 127/128/129/131/133/136。单位名目 4 → 7（21/30 张是单位）。
 */
const DECK_IDS = [
  'LQ01-127', 'LQ01-128', 'LQ01-129', 'LQ01-131', 'LQ01-133',
  'LQ01-136', 'LQ01-137', 'LQ01-138', 'LQ01-140', 'LQ01-143'
];

function build(pool) {
  // pool 已按「青 + 灰」过滤；这里返回固定的合规清单，不依赖回退。
  return DECK_IDS.map(function (id) { return { id: id, n: 3 }; });
}

/* ── 估值：单张出牌的价值（取最大者先打）────────────────── */
function playValue(view, m) {
  const me = view.me || {};
  const c = me.hand ? me.hand[m.i] : null;
  if (!c) return -1e9;
  const cost = (c.cost && typeof c.cost.n === 'number') ? c.cost.n : 0;
  // 基础分含「高费优先」：趁本回合法力足先把大牌打出去，避免剩下的费用喂不掉。
  let s = 8 + cost * 1.2;
  const kw = Array.isArray(c.kw) ? c.kw : [];
  const fx = Array.isArray(c.effects) ? c.effects : [];

  if (c.type === '单位') {
    s += 30 + (c.atk || 0) * 1.3 + (c.imp || 0) * 1.6 + (c.hp || 0) * 1.0;
    for (let i = 0; i < kw.length; i++) {
      const k = kw[i];
      if (typeof k !== 'string') continue;
      if (k === '冲锋' || k === '神速') s += 7;        // 当回合即可攻
      if (k.indexOf('涡流') === 0) s += 9;              // 随出牌数增攻，本套核心
      if (k === '潮汐') s += 2;
      if (k === '守卫') s += 3;
      if (k === '践踏') s += 3;
      if (k === '圣盾') s += 4;
      if (k === '成长') s += 4;
    }
  }
  // 效果价值（单位战吼与非单位一视同仁）
  for (let i = 0; i < fx.length; i++) {
    const e = fx[i];
    if (!e) continue;
    switch (e.do) {
      case 'draw': s += (e.n || 0) * 7; break;          // 补牌最贵：续连打
      case 'dmg': s += 5 + (e.n || 0); break;           // 点杀
      case 'aoe': s += 7 + (e.n || 0) * 2; break;
      case 'destroy': s += 10; break;
      case 'freeze': s += 5; break;
      case 'bounce': s += 5; break;
      case 'buff': s += 3 + (e.atk || 0) + (e.hp || 0); break;
      case 'buffAll': s += 7 + ((e.atk || 0) + (e.hp || 0)) * 2; break;
      case 'grantAll': s += 6; break;
      case 'token': s += (e.n || 0) * 5; break;
      case 'res': s += (e.n || 0) * 2; break;
      case 'heal': s += (e.n || 0); break;
      case 'shield': s += (e.n || 0) * 1.5; break;
      case 'revive': s += 6; break;
      default: break;                                  // 未知效果兜底
    }
  }
  // 需要指定目标的出牌：按目标质量微调，优先打死高威胁、buff 给最强攻击者。
  if (m.target != null) {
    const oppBoard = (view.opp && view.opp.board) || [];
    const myBoard = me.board || [];
    let eu = null, ou = null;
    for (let i = 0; i < oppBoard.length; i++) if (oppBoard[i].uid === m.target) eu = oppBoard[i];
    for (let i = 0; i < myBoard.length; i++) if (myBoard[i].uid === m.target) ou = myBoard[i];
    if (eu) {
      let dmg = null;
      for (let i = 0; i < fx.length; i++) if (fx[i] && fx[i].do === 'dmg') dmg = fx[i];
      s += (eu.atk || 0) + (eu.imp || 0) + ((dmg && eu.hp <= (dmg.n || 0)) ? 7 : 0);
    } else if (ou) {
      s += (ou.atk || 0) * 0.6;
    }
  }
  if (m.mode === 'forge') s -= 8;                        // 青无装备，锻造模式仅兜底降权
  return s;
}

/* ── 估值：单次攻击的价值 ────────────────────────────────── */
function attackValue(view, m) {
  const me = view.me || {}, opp = view.opp || {};
  const myBoard = me.board || [], oppBoard = opp.board || [];
  let au = null;
  for (let i = 0; i < myBoard.length; i++) if (myBoard[i].uid === m.uid) au = myBoard[i];
  if (!au) return -1e9;

  if (m.target === 'face') {
    // 打脸优先：持续压血、推动对局收敛，避免我方不进攻导致长局。
    let s = 30 + (au.imp || 0) * 2;
    if (opp.life != null && opp.life <= (au.imp || 0)) s += 1000;   // 单发斩杀
    else if (opp.life != null && opp.life <= 6) s += 12;             // 接近斩杀加压
    return s;
  }
  let tu = null;
  for (let i = 0; i < oppBoard.length; i++) if (oppBoard[i].uid === m.target) tu = oppBoard[i];
  if (!tu) return -1e9;
  const kill = (au.atk || 0) >= (tu.hp || 0);   // 能打死
  const die = (tu.atk || 0) >= (au.hp || 0);    // 会战死
  let s = 0;
  if (kill) s += 10 + (tu.atk || 0) + (tu.imp || 0);  // 清掉威胁，按其身材给分
  if (!die) s += 7;                                    // 白赚
  if (die && !kill) s -= 12;                           // 亏本交换
  if (die && kill) s += 2;                             // 一换一，可接受
  return s;
}

/* ── 取分最高的动作（不 sort 原数组，纯遍历）────────────── */
function bestOf(arr, val) {
  let bm = null, bv = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = val(arr[i]);
    if (typeof v === 'number' && isFinite(v) && v > bv) { bv = v; bm = arr[i]; }
  }
  return bm;
}

/* ── 主决策 ──────────────────────────────────────────────── */
function _choose(view, moves) {
  if (!view || !moves || !moves.length) return null;
  if (view.over) return null;                          // → 兜底 pass

  const plays = [], attacks = [], avatars = [], buys = [];
  let pass = null;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m) continue;
    if (m.type === 'play') plays.push(m);
    else if (m.type === 'attack') attacks.push(m);
    else if (m.type === 'avatar') avatars.push(m);
    else if (m.type === 'buy') buys.push(m);
    else if (m.type === 'pass') pass = m;             // ascend / 未知类型：一律不主动取
  }
  if (!pass) pass = moves[moves.length - 1];

  const me = view.me || {}, opp = view.opp || {};
  const myBoard = me.board || [];

  // 1) 斩杀：可打脸的冲击总和 ≥ 对手生命时，直接连续打脸结束，不再浪费动作。
  const faceMoves = [];
  for (let i = 0; i < attacks.length; i++) if (attacks[i].target === 'face') faceMoves.push(attacks[i]);
  if (faceMoves.length) {
    let faceImp = 0;
    for (let i = 0; i < faceMoves.length; i++) {
      let au = null;
      for (let j = 0; j < myBoard.length; j++) if (myBoard[j].uid === faceMoves[i].uid) au = myBoard[j];
      faceImp += au ? (au.imp || 0) : 0;
    }
    if (faceImp > 0 && opp.life != null && faceImp >= opp.life) {
      const fm = bestOf(faceMoves, function (m) { return attackValue(view, m); });
      if (fm) return fm;
    }
  }

  // 2) 早期灵体：温蒂妮启动为免费抽 1（timing=early），先开再出牌，多一张可打。
  const av = avatars.length ? avatars[0] : null;
  const avInfo = me.avatar || {};
  if (av && avInfo.timing !== 'late' && !avInfo.used) return av;

  // 3) 出牌：每回合设 12 张上限，防止「抽牌→连打→再抽」把单回合拖成长局。
  const MAX_PLAYS = 12;
  if ((me.plays || 0) < MAX_PLAYS && plays.length) {
    const pm = bestOf(plays, function (m) { return playValue(view, m); });
    if (pm) return pm;
  }

  // 4) 后期灵体（rally 类群体 +IMP）：出完牌、进攻前再开，让增益吃到本次攻击。
  if (av && avInfo.timing === 'late' && !avInfo.used) return av;

  // 5) 攻击：只要有合法攻击就取分最高者（打脸优先、亏本交换靠分数排后）。
  //    始终保持进攻压力，避免双方对峙造成的长局；攻击会标记单位，循环必然收敛。
  if (attacks.length) {
    const am = bestOf(attacks, function (m) { return attackValue(view, m); });
    if (am) return am;
  }

  // 6) 升灵：会献祭掉铺开的场面，本套走宽场节奏，主动放弃（不取 ascend）。
  //    外枢灵体是可选额外卡组，取不取都不影响回合推进。

  // 7) 购买（仅金触发，青不会走到这里；兜底取第一个，避免未知局面卡住）。
  if (buys.length) return buys[0];

  // 8) 结束回合
  return pass;
}

function choose(view, moves) {
  // 兜底永远是 moves 里的同一个对象引用（legalMoves 末位必为 pass）。
  const fallback = (moves && moves.length) ? moves[moves.length - 1] : null;
  try {
    const r = _choose(view, moves);
    if (r) return r;
  } catch (e) {
    // 任何异常都安全落到 pass，不抛给引擎。
  }
  return fallback;
}
