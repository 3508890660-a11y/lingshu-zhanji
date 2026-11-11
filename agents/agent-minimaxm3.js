/* ============================================================================
 * agents/agent-minimaxm3.js
 * 绿 · 地脉拓殖·巨木升格
 *
 * 引擎口径要点（本脚本依赖、均已在 brief/01 与 js/engine 中核对）：
 *   · 绿的资源 = 2 + 地标数（回合开始刷新）＋灵体被动 +1 ＋灵体启动 +2（免费）
 *   · 绿的抽牌在回合末补至「地标数 + 1」——地标数同时是法力上限与手牌上限
 *   · 升灵素材 = 己方场上单位 SR 合计 ≥ N（引擎按 SR 从小到大自动凑）
 *   · 攻击灵体是「直击 IMP」，只有「践踏」溢出才会打到脸上
 * ==========================================================================*/

const meta = {
  name: 'MiniMax M3 · 地脉拓殖·巨木升格',
  desc: '执行模型 minimax-m3；颜色 绿；策略 地脉拓殖·巨木升格；地标拓殖换法力和手牌上限，献祭林冠漫步者换苍林守望，践踏巨兽用 IMP 磨穿 20 点生命。',
  id: 'model:minimaxm3',
  color: '绿'
};

/* ─────────────────────────── 一、卡组 ─────────────────────────── */
/* 30 张 / 16 名目：5 张地标（法力+手牌双资源）、3 张抽牌、15 张单位、7 张解场与互动 */
const DECK = [
  ['LQ01-298', 3],   // 祭品石（通用1 地标 · 进场 +2 法力）——净赚 1 点的启动器
  ['LQ01-056', 1],   // 幼叶之池（法力1 地标 · +1 法力）
  ['LQ01-061', 1],   // 母神共鸣地（法力2 地标 · +2 法力）
  ['LQ01-286', 3],   // 褪色符文（通用1 · 抽 1）——绿没有回合开始抽牌，只能靠它
  ['LQ01-057', 2],   // 摇篮藤根（法力2 · 守卫 1/2/3 · SR2）
  ['LQ01-055', 2],   // 盖亚幼株（法力1 · 成长 1/1/1 · SR1）
  ['LQ01-069', 2],   // 蜉蝣食菌虻（法力1 · 进场 +1 法力 · SR1）
  ['LQ01-063', 3],   // 林冠漫步者（法力3 · SR3 · 升格素材）
  ['LQ01-065', 2],   // 荒原猛犸（法力4 · 4/3/4 践踏）
  ['LQ01-066', 2],   // 裂地巨犀（法力5 · 5/4/5 践踏）
  ['LQ01-067', 2],   // 林冠泰坦（法力6 · 6/5/6 践踏再生）
  ['LQ01-060', 2],   // 落叶风暴（法力3 · 全体敌方 2 伤）
  ['LQ01-058', 2],   // 荆棘绞杀（法力2 · 3 点伤害）
  ['LQ01-294', 1],   // 遣返（通用2 · 回手 1 单位）
  ['LQ01-295', 1],   // 凝滞（通用2 · 冻结 1 单位）
  ['LQ01-296', 1]    // 逆流（通用2 瞬间 · 反击无效化 1 张法术）
];

function build(pool) {
  const have = new Set((pool || []).map((c) => c && c.id));
  const out = [];
  let total = 0;
  for (const [id, n] of DECK) {
    if (!have.has(id)) continue;          // 卡池里没有就跳过，绝不返回非法卡号
    out.push({ id: id, n: n });
    total += n;
  }
  if (total < 25) {
    // 兜底：卡池异常时用便宜牌补齐（同名 ≤3，总数仍 ≤30）
    const used = new Set(out.map((o) => o.id));
    for (const c of pool || []) {
      if (total >= 30) break;
      if (!c || !c.id || used.has(c.id)) continue;
      if (!c.cost || (c.cost.n || 0) > 3) continue;
      out.push({ id: c.id, n: 1 });
      used.add(c.id);
      total += 1;
    }
  }
  return out;
}

/* ─────────────────────────── 二、常量表 ─────────────────────────── */

/* 场上单位的 SR（引擎按 BY_ID 取 SR；升灵素材只算这些） */
const SR_BY_NAME = {
  '盖亚幼株': 1,
  '蜉蝣食菌虻': 1,
  '摇篮藤根': 2,
  '林冠漫步者': 3,
  '荒原猛犸': 4,
  '裂地巨犀': 5,
  '林冠泰坦': 6
};

/* 廉价 chip：价值打 0.4 折，ascend 时优先被引擎当素材吃掉 */
const CHIP_NAMES = ['盖亚幼株', '蜉蝣食菌虻'];
/* 主力输出：不允许被当成升灵素材 */
const CORE_NAMES = ['林冠泰坦', '裂地巨犀', '荒原猛犸'];

/* 外枢灵体：门槛（素材 SR 合计）与净值 */
const ASC_NEED = { 'LQ01-266': 3, 'LQ01-267': 3, 'LQ01-268': 5 };
const ASC_VALUE = { 'LQ01-266': 11.6, 'LQ01-267': 10.9, 'LQ01-268': 12.5 };
const ASC_MIN_NET = 4.0;

/* 出牌基础分（越大越优先） */
const PLAY_SCORE = {
  '林冠泰坦': 14,
  '裂地巨犀': 11,
  '荒原猛犸': 8.5,
  '祭品石': 7,
  '母神共鸣地': 6,
  '幼叶之池': 5.5,
  '褪色符文': 4.5,
  '摇篮藤根': 4,
  '林冠漫步者': 3.6,
  '蜉蝣食菌虻': 3,
  '盖亚幼株': 2.2
};

/* 值得用【逆流】反击掉的对手法术（全是 aoe / 直伤脸） */
const COUNTER_WORTH = {
  'LQ01-024': 1,   // 亡绝祷歌：全体 2 伤
  'LQ01-042': 1,   // 焚天血咒：4 点直伤脸
  'LQ01-005': 1,   // 圣光震荡：全体 2 伤
  'LQ01-006': 1,   // 肃正之槌：全体 3 伤
  'LQ01-049': 1,   // 熔火爆破：随机 2 个 2 伤
  'LQ01-072': 1,   // 藤海怒涛：全体 3 伤
  'LQ01-291': 1    // 回响震荡：全体 1 伤
};

/* ─────────────────────────── 三、工具 ─────────────────────────── */

function kwOf(u) {
  return (u && u.kw) ? u.kw : [];
}
function hasKw(u, k) {
  return kwOf(u).indexOf(k) >= 0;
}
/* 单位通用价值：IMP 是脸伤来源，ATK 是交换与践踏溢出，耐久是存活 */
function uval(u) {
  if (!u) return 0;
  let v = (u.imp || 0) * 1.0 + (u.atk || 0) * 0.5 + (u.hp || 0) * 0.3;
  if (hasKw(u, '践踏')) v += 1.2;
  return v;
}
/* chip 折价 */
function cval(u) {
  if (!u) return 0;
  return CHIP_NAMES.indexOf(u.name) >= 0 ? uval(u) * 0.4 : uval(u);
}

/* 复刻引擎 bestGuard：守护会不会替灵体挡下这一击 */
function pickGuard(oppBoard, atk, imp, oppLife) {
  const gs = (oppBoard || []).filter((u) => hasKw(u, '守护1') || hasKw(u, '守护2'));
  const ok = gs.filter((u) => {
    const k = kwOf(u).filter((x) => x === '守护1' || x === '守护2')[0];
    const x = Number(String(k || '守护0').slice(2)) || 0;
    return Math.max(0, atk - x) < (u.hp || 0) || oppLife <= imp;
  });
  if (!ok.length) return null;
  return ok.slice().sort((a, b) => (b.hp || 0) - (a.hp || 0))[0];
}

/* 复刻引擎 pickMaterials：按 SR 从小到大凑够门槛 */
function pickMaterials(board, need) {
  const units = (board || [])
    .filter((u) => (SR_BY_NAME[u.name] || 0) > 0)
    .slice()
    .sort((a, b) => (SR_BY_NAME[a.name] || 0) - (SR_BY_NAME[b.name] || 0));
  const picked = [];
  let sum = 0;
  for (const u of units) {
    if (sum >= need) break;
    picked.push(u);
    sum += SR_BY_NAME[u.name] || 0;
  }
  return sum >= need ? { picked: picked, sum: sum } : null;
}

/* 卡面效果读取（hand 里有完整 effects） */
function effOf(c) {
  return (c && c.effects) ? c.effects : [];
}

/* ─────────────────────────── 四、攻击评估 ─────────────────────────── */

/* 返回这次攻击的面伤 / 收益 / 损失 */
function attackOutcome(view, m) {
  const me = view.me || {};
  const opp = view.opp || {};
  const u = (me.board || []).filter((x) => x.uid === m.uid)[0];
  if (!u) return null;
  let face = 0, gain = 0, loss = 0;

  if (m.target === 'face') {
    const g = pickGuard(opp.board || [], u.atk || 0, u.imp || 0, opp.life || 0);
    if (g) {
      // 守护代替：伤害打到守护单位身上，这一下打不到脸
      const k = kwOf(g).filter((x) => x === '守护1' || x === '守护2')[0];
      const x = Number(String(k || '守护0').slice(2)) || 0;
      const dmg = Math.max(0, (u.atk || 0) - x);
      if (dmg >= (g.hp || 0)) gain += uval(g);
      if ((g.atk || 0) >= (u.hp || 0)) loss += uval(u);
    } else {
      face = u.imp || 0;
    }
  } else {
    const t = (opp.board || []).filter((x) => x.uid === m.target)[0];
    if (!t) return null;
    if ((u.atk || 0) >= (t.hp || 0)) {
      gain += uval(t);
      if (hasKw(u, '践踏')) face += Math.max(0, (u.atk || 0) - (t.hp || 0));
    }
    if ((t.atk || 0) >= (u.hp || 0)) loss += uval(u);
  }
  return { face: face, gain: gain, loss: loss, unit: u };
}

/* 能一刀结束就结束 */
function findLethal(view, moves) {
  const life = (view.opp && view.opp.life) || 0;
  let best = null;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const o = attackOutcome(view, m);
    if (!o) continue;
    if (o.face >= life && life > 0) {
      if (!best || o.face > best.face) best = { m: m, face: o.face };
    }
  }
  return best ? best.m : null;
}

/* ─────────────────────────── 五、出牌评估 ─────────────────────────── */

function scorePlay(view, m) {
  const hand = (view.me && view.me.hand) || [];
  const c = hand[m.i];
  if (!c) return -1;
  if (c.name === '逆流') return -1;            // 逆流留在手里当反击，不在主阶段打
  const oppBoard = (view.opp && view.opp.board) || [];
  const myBoard = (view.me && view.me.board) || [];
  let s = -1;

  for (const e of effOf(c)) {
    if (e.do === 'dmg' && e.target === 'enemyUnit') {
      const t = oppBoard.filter((x) => x.uid === m.target)[0];
      const n = e.n || 0;
      if (!t) continue;
      if ((t.hp || 0) <= n) s = Math.max(s, uval(t) + 0.5);
      else if ((t.atk || 0) >= 4) s = Math.max(s, 1.4);   // 削大兽
    } else if (e.do === 'aoe' && e.side === 'enemy') {
      let v = 0;
      for (const u of oppBoard) v += (u.hp || 0) <= (e.n || 0) ? uval(u) + 0.5 : 0.3;
      s = Math.max(s, v >= 2.2 ? v : -1);
    } else if (e.do === 'bounce') {
      const t = oppBoard.filter((x) => x.uid === m.target)[0];
      if (t && ((t.imp || 0) >= 2 || (t.atk || 0) >= 4)) s = Math.max(s, uval(t));
    } else if (e.do === 'freeze' && m.target !== undefined) {
      const t = oppBoard.filter((x) => x.uid === m.target)[0];
      if (t && ((t.imp || 0) >= 2 || (t.atk || 0) >= 4)) s = Math.max(s, (t.imp || 0) + 0.6);
    } else if (e.do === 'draw') {
      s = Math.max(s, 3.0 + (e.n || 1) * 1.2);
    } else if (e.do === 'res') {
      s = Math.max(s, 1.0);
    } else if (e.do === 'buffAll') {
      s = Math.max(s, 1.6 + myBoard.length * 0.3);
    }
  }
  const base = PLAY_SCORE[c.name];
  if (base !== undefined) s = Math.max(s, base);
  return s;
}

function pickPlay(view, moves) {
  let best = null;
  for (const m of moves) {
    if (m.type !== 'play') continue;
    const s = scorePlay(view, m);
    if (s < 0) continue;
    if (!best || s > best.s) best = { m: m, s: s };
  }
  return best ? best.m : null;
}

/* ─────────────────────────── 六、升灵评估 ─────────────────────────── */

function pickAscend(view, moves) {
  const board = (view.me && view.me.board) || [];
  if ((view.round || 0) < 2) return null;      // 别在第一轮就把场面献祭光
  let best = null;
  for (const m of moves) {
    if (m.type !== 'ascend') continue;
    const need = ASC_NEED[m.id];
    const av = ASC_VALUE[m.id];
    if (need === undefined || av === undefined) continue;
    const mat = pickMaterials(board, need);
    if (!mat) continue;
    let lost = 0, bad = false;
    for (const u of mat.picked) {
      if (CORE_NAMES.indexOf(u.name) >= 0) { bad = true; break; }
      lost += cval(u);
    }
    if (bad) continue;
    const net = av - lost;
    if (net < ASC_MIN_NET) continue;
    if (!best || net > best.net) best = { m: m, net: net };
  }
  return best ? best.m : null;
}

/* ─────────────────────────── 七、攻击选择 ─────────────────────────── */

function pickAttack(view, moves) {
  let best = null;
  for (const m of moves) {
    if (m.type !== 'attack') continue;
    const o = attackOutcome(view, m);
    if (!o) continue;
    const s = o.face * 2.4 + o.gain - o.loss * 0.9;
    if (!best || s > best.s) best = { m: m, s: s };
  }
  if (best && best.s > 0.25) return best.m;
  return null;
}

/* ─────────────────────────── 八、主决策 ─────────────────────────── */

function choose(view, moves) {
  if (!view || !moves || !moves.length) return { type: 'pass' };
  try {
    // 1) 能斩杀就斩杀（面伤 = 直击 IMP + 践踏溢出）
    const lethal = findLethal(view, moves);
    if (lethal) return lethal;

    // 2) 灵体启动：盖亚免费 +2 法力，先开再花钱
    for (const m of moves) {
      if (m.type === 'avatar') return m;
    }

    // 3) 升灵：素材划算才献祭（266 的 +2 法力要赶在出牌前拿到）
    const asc = pickAscend(view, moves);
    if (asc) return asc;

    // 4) 出牌：解场 → 巨兽 → 地标 → 抽牌 → 小单位
    const play = pickPlay(view, moves);
    if (play) return play;

    // 5) 攻击
    const atk = pickAttack(view, moves);
    if (atk) return atk;
  } catch (err) {
    // 任何异常都退回 pass（引擎会按 pass 处理，不会计错）
  }
  return moves[moves.length - 1];
}

/* ─────────────────────────── 九、阻挡窗口 ─────────────────────────── */

function block(view, bmoves) {
  if (!bmoves || !bmoves.length) return null;
  const noBlock = bmoves[bmoves.length - 1];
  try {
    const me = view.me || {};
    const opp = view.opp || {};
    const myBoard = me.board || [];
    const oppBoard = opp.board || [];
    const ready = oppBoard.filter((u) => !u.attacked);
    if (!ready.length) return noBlock;

    let incImp = 0, incAtk = 0;
    for (const u of ready) {
      incImp += (u.imp || 0);
      if ((u.atk || 0) > incAtk) incAtk = u.atk || 0;
    }

    let best = null;
    for (const m of bmoves) {
      if (m.type !== 'block') continue;
      const b = myBoard.filter((x) => x.uid === m.uid)[0];
      if (!b) continue;
      let gain = 0, loss = 0;
      if ((b.hp || 0) <= incAtk) loss += cval(b);              // 挡完会被打死
      for (const a of ready) {
        if ((b.atk || 0) >= (a.hp || 0)) gain += uval(a) * 0.7; // 能不能换掉
      }
      const s = incImp * 0.9 + gain - loss * 0.9;
      if (!best || s > best.s) best = { m: m, s: s };
    }
    if (best && best.s > 0.6) return best.m;
    return noBlock;
  } catch (err) {
    return noBlock;
  }
}

/* ─────────────────────────── 十、响应窗口 ─────────────────────────── */

function respond(view, ctx, moves) {
  if (!moves || !moves.length) return null;
  const pass = moves.filter((m) => m.type === 'pass')[0] || null;
  try {
    if (ctx && ctx.kind === 'play' && ctx.card && COUNTER_WORTH[ctx.card.id]) {
      const hand = (view && view.me && view.me.hand) || [];
      for (const m of moves) {
        if (m.type !== 'respond') continue;
        const c = hand[m.i];
        if (c && c.id === 'LQ01-296') return m;
      }
    }
  } catch (err) {
    /* 放弃响应 */
  }
  return pass;
}
