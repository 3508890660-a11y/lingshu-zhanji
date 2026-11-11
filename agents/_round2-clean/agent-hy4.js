/* agent-hy4.js — 显示名 hy4 / 模型 hy4std
 * 自选主色：红（激情 · 门槛不消耗）
 * 策略：赤刃三段抢血（低曲线冲锋快攻）
 * 依据：01§3 激情门槛 + 回合末递减补牌形成前期爆发窗口；
 *       02§3.3 红卡密集冲锋/怒火/战吼打脸/直伤，§9 预组 YD01-03 外枢为空。
 */

const meta = {
  name: 'hy4 · 赤刃三段抢血',
  desc: '执行模型 hy4std；颜色 红；策略 赤刃三段抢血；依据卡面冲锋/怒火/直伤与激情门槛递减补牌规则，采用低曲线铺场抢血快攻',
  id: 'model:hy4',
  color: '红'
};

/* ---------- 构筑意图：10 名目 ×3，全部压在激情 1~4 的抢血曲线 ---------- */
// 037 赤刃幼虎 / 038 怒火新兵 / 039 熔岩裂爪 / 051 掷火散兵 / 040 暴走狂犬
// 043 血斧掷颅手 / 044 烬原猛虎 / 052 战鼓蛮兵 / 041 烈阳断刃 / 042 焚天血咒
const CORE_IDS = [
  'LQ01-037', 'LQ01-038', 'LQ01-039', 'LQ01-051', 'LQ01-040',
  'LQ01-043', 'LQ01-044', 'LQ01-052', 'LQ01-041', 'LQ01-042'
];

/* ---------- 防御性小工具 ---------- */
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}
function idNum(id) {
  const p = String(id || '').split('-');
  const n = parseInt(p[p.length - 1], 10);
  return isFinite(n) ? n : 0;
}
function isRedCard(c) {
  const n = idNum(c && c.id);
  return n >= 37 && n <= 54;
}
function cardText(c) {
  if (!c) return '';
  const parts = [];
  if (typeof c.text === 'string') parts.push(c.text);
  if (Array.isArray(c.kw)) {
    for (let i = 0; i < c.kw.length; i++) parts.push(String(c.kw[i]));
  }
  return parts.join(' ');
}
function costN(c) {
  if (!c) return 0;
  const co = c.cost;
  if (typeof co === 'number') return num(co);
  if (co && typeof co === 'object') return num(co.n);
  return 0;
}
function findUnit(board, uid) {
  if (!Array.isArray(board)) return null;
  for (let i = 0; i < board.length; i++) {
    const u = board[i];
    if (u && u.uid === uid) return u;
  }
  return null;
}
function estimateDamage(c) {
  const t = String((c && c.text) || '');
  let mx = 0, mm;
  const re = /(\d+)\s*点(?:伤害|冲击)/g;
  while ((mm = re.exec(t)) !== null) {
    const v = parseInt(mm[1], 10) || 0;
    if (v > mx) mx = v;
  }
  if (mx === 0) {
    const re2 = /(?:造成|改为)\s*(\d+)\s*点/g;
    while ((mm = re2.exec(t)) !== null) {
      const v = parseInt(mm[1], 10) || 0;
      if (v > mx) mx = v;
    }
  }
  return mx > 0 ? mx : 3;
}

/* ---------- build：自评卡面，凑齐 10 名目 ×3 = 30 ---------- */
function buildCardScore(c) {
  if (!c) return -1e9;
  let s = 0;
  s += Math.max(0, 7 - costN(c)) * 10;   // 低费优先（快攻曲线）
  if (c.type === '单位') s += 40;
  else if (c.type === '法术' || c.type === '瞬间') s += 20;
  else if (c.type === '结界' || c.type === '地标') s += 8;
  if (isRedCard(c)) s += 60;              // 主色优先，避免补到灰卡破坏纯粹性
  const t = cardText(c);
  if (/冲锋/.test(t)) s += 25;
  if (/怒火/.test(t)) s += 12;
  if (/对对手/.test(t)) s += 10;
  s += num(c.atk) * 3 + num(c.imp) * 3 + num(c.hp);
  return s;
}

function build(pool) {
  const src = Array.isArray(pool) ? pool : [];
  const byId = Object.create(null);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c && typeof c.id === 'string') byId[c.id] = c;
  }
  const deck = [];
  const used = Object.create(null);
  for (let i = 0; i < CORE_IDS.length; i++) {
    const id = CORE_IDS[i];
    if (byId[id] && !used[id]) {
      deck.push({ id: id, n: 3 });
      used[id] = 1;
    }
  }
  // 兜底：若个别核心名目不在 pool（编号差异/过滤差异），按自评补足到 10 名目
  if (deck.length < 10) {
    const cands = src.slice().sort(function (a, b) {
      return buildCardScore(b) - buildCardScore(a);
    });
    for (let j = 0; j < cands.length && deck.length < 10; j++) {
      const c = cands[j];
      if (!c || typeof c.id !== 'string' || used[c.id]) continue;
      const okType = c.type === '单位' || c.type === '法术' || c.type === '瞬间' ||
                     c.type === '结界' || c.type === '地标' || c.type === '装备';
      if (!okType) continue;
      deck.push({ id: c.id, n: 3 });
      used[c.id] = 1;
    }
  }
  return deck;   // 每名目 3 张，≤10 名目，纯主色+灰（pool 已过滤）
}

/* ---------- choose：动作评分（分数越高越优先） ----------
 * 层级：铺冲锋单位 > 灵体过载 > 打脸直伤 > 打脸攻击 > 清单位 > 其它 > pass
 * 斩杀模式：faceDmg + 打脸直伤 ≥ opp.life 时，给打脸动作加巨额 bonus。
 */
const P_UNIT = 700, P_AVATAR = 660, P_BURN = 620, P_SPELL = 500,
      P_FACE = 500, P_ENCH = 340, P_OTHER_PLAY = 260,
      P_ASCEND = 100, P_BUY = 90, P_PASS = -1, P_UNKNOWN = -2,
      LETHAL_BONUS = 3000;

function playScore(v, m, lethal) {
  const me = v.me || {};
  const hand = Array.isArray(me.hand) ? me.hand : [];
  const c = hand[m.i];
  if (!c) return P_PASS;          // 越界索引：不主动选
  const t = cardText(c);
  const n = costN(c);
  let s;
  switch (c.type) {
    case '单位':
      s = P_UNIT;
      if (/冲锋/.test(t)) s += 40;
      if (/怒火/.test(t)) s += 15;
      s += num(c.atk) * 4 + num(c.imp) * 6 + num(c.hp) * 2;
      s -= n * 6;
      if (isRedCard(c)) s += 30;
      break;
    case '法术':
    case '瞬间':
      s = P_SPELL;
      if (/对对手/.test(t) && /伤害|冲击|造成/.test(t)) {
        s = P_BURN;
        s += estimateDamage(c) * 8;
        if (lethal) s += LETHAL_BONUS;
      } else if (/伤害|破坏|冻结/.test(t)) {
        s += 60 + estimateDamage(c) * 4;
      } else {
        s += 30;
      }
      s -= n * 5;
      break;
    case '结界':
      s = P_ENCH;
      if (/冲锋|IMP|攻击|伤害/.test(t)) s += 40;
      s -= n * 4;
      break;
    default:
      s = P_OTHER_PLAY - n * 4;
      break;
  }
  return s;
}

function attackScore(v, m, lethal) {
  const me = v.me || {}, opp = v.opp || {};
  const board = Array.isArray(me.board) ? me.board : [];
  const oboard = Array.isArray(opp.board) ? opp.board : [];
  const au = findUnit(board, m.uid);
  const imp = num(au && au.imp);
  const atk = num(au && au.atk);
  const hp = num(au && au.hp);
  if (m.target === 'face') {
    let s = P_FACE + imp * 12;   // 01§5：IMP 直击扣生命
    if (lethal) s += LETHAL_BONUS;
    return s;
  }
  const du = findUnit(oboard, m.target);
  const dHp = num(du && du.hp);
  const dAtk = num(du && du.atk);
  let s = 200;
  if (dHp > 0 && atk >= dHp) s += 120;   // 能击杀
  if (dAtk < hp) s += 60;                // 不会同归于尽
  else s -= 80;
  s += dHp * 2 + dAtk * 2 + imp * 2;    // 优先拆高威胁/守卫
  return s;
}

function avatarScore(v) {
  const me = v.me || {};
  const board = Array.isArray(me.board) ? me.board : [];
  // 拉格纳「过载1：本回合你的单位 IMP+1」——场上有单位、攻击前启动最赚
  return board.length > 0 ? P_AVATAR : P_AVATAR - 400;
}

function scoreMove(v, m, lethal) {
  switch (m.type) {
    case 'play':   return playScore(v, m, lethal);
    case 'attack': return attackScore(v, m, lethal);
    case 'avatar': return avatarScore(v);
    case 'ascend': return P_ASCEND;   // 红无外枢，不主动升灵
    case 'buy':    return P_BUY;      // 红无市场
    case 'pass':   return P_PASS;
    default:       return P_UNKNOWN; // 未知类型：压在 pass 之下，安全兜底
  }
}

function computeLethal(v, moves) {
  const me = v.me || {}, opp = v.opp || {};
  const board = Array.isArray(me.board) ? me.board : [];
  const hand = Array.isArray(me.hand) ? me.hand : [];
  let faceDmg = 0, hasFace = false, burnDmg = 0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m) continue;
    if (m.type === 'attack' && m.target === 'face') {
      hasFace = true;
      const u = findUnit(board, m.uid);
      faceDmg += num(u && u.imp);
    } else if (m.type === 'play') {
      const c = hand[m.i];
      if (c) {
        const t = cardText(c);
        if (/对对手/.test(t) && /伤害|冲击|造成/.test(t)) burnDmg += estimateDamage(c);
      }
    }
  }
  const life = num(opp.life);
  return life > 0 && (faceDmg + burnDmg) >= life && (hasFace || burnDmg > 0);
}

function choose(view, moves) {
  if (!Array.isArray(moves) || moves.length === 0) {
    return (moves && moves.length) ? moves[moves.length - 1] : undefined;
  }
  const v = view || {};
  const lethal = computeLethal(v, moves);
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!m) continue;
    const s = scoreMove(v, m, lethal);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  // 兜底：始终返回 moves 里的对象引用
  return best ? best : moves[moves.length - 1];
}

/* ---------- block：快攻保留进攻兵力，仅生命吃紧时挡 ---------- */
function block(view, bmoves) {
  const arr = Array.isArray(bmoves) ? bmoves : [];
  if (arr.length === 0) return { type: 'noBlock' }; // 契约外极端兜底
  const last = arr[arr.length - 1];
  const blocks = [];
  let noBlock = null;
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    if (!m) continue;
    if (m.type === 'block') blocks.push(m);
    else if (m.type === 'noBlock' && noBlock === null) noBlock = m;
  }
  const me = (view && view.me) || {};
  const life = num(me.life);
  // 生命 > 8：不阻挡，保留单位继续抢血
  if (life > 8 || blocks.length === 0) {
    return noBlock ? noBlock : last;
  }
  // 生命 ≤ 8：用最耐打的单位阻挡保命（生命 = 生命卡组，掉光判负）
  const board = Array.isArray(me.board) ? me.board : [];
  let best = blocks[0], bestHp = -1;
  for (let i = 0; i < blocks.length; i++) {
    const m = blocks[i];
    const u = findUnit(board, m.uid);
    const hp = u ? num(u.hp) : 0;
    if (hp > bestHp) { bestHp = hp; best = m; }
  }
  return best;
}
