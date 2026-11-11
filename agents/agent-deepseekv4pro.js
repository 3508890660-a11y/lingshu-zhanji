// ============================================================
// 《灵枢战纪》AI 脚本 · deepseek v4pro
// 主色：红 · 策略：赤潮冲锋
// 胜利方式：拉格纳给全员冲锋 → 铺满低费单位反复踢脸 →
//           rally（拉格纳/血红爆发/战鼓蛮兵）叠高 IMP → 焚天血咒直伤斩杀
// ============================================================

const meta = {
  name: 'deepseek v4pro · 赤潮冲锋',
  desc: '执行模型 deepseek-v4-pro；颜色 红；策略 赤潮冲锋；全员冲锋铺场踢脸，rally 叠 IMP，焚天血咒直伤收尾',
  id: 'model:deepseekv4pro',
  color: '红'
};

// 卡组：10 名目 ×3 = 30 张（全红，无灰）
// 引擎口径说明：怒火新兵/暴走狂犬的「怒火」、焚天血咒的「6 伤条件」、
// 血红爆发的「追加伤害」均未编码为 effects，按纯白板身材与 rally/dmg 读取。
const DECK = [
  { id: 'LQ01-037', n: 3 }, // 赤刃幼虎 1/1/1 冲锋（1 费）
  { id: 'LQ01-038', n: 3 }, // 怒火新兵 2/1/1 冲锋（1 费）
  { id: 'LQ01-040', n: 3 }, // 暴走狂犬 1/3/2 IMP3 打脸核心（2 费）
  { id: 'LQ01-051', n: 3 }, // 掷火散兵 2/1/2 战吼打脸 1（2 费）
  { id: 'LQ01-039', n: 3 }, // 熔岩裂爪 2/1/2 冲锋（2 费）
  { id: 'LQ01-043', n: 3 }, // 血斧掷颅手 3/1/2 战吼打脸 1 冲锋（3 费）
  { id: 'LQ01-044', n: 3 }, // 烬原猛虎 3/2/2 冲锋 IMP2（3 费）
  { id: 'LQ01-052', n: 3 }, // 战鼓蛮兵 3/2/2 战吼 rally IMP+1（3 费）
  { id: 'LQ01-042', n: 3 }, // 焚天血咒 打脸 4（4 费）
  { id: 'LQ01-046', n: 3 }  // 血红爆发 rally 全体 IMP+1（6 费）
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

function ofType(moves, t) {
  const out = [];
  for (let i = 0; i < moves.length; i++) if (moves[i].type === t) out.push(moves[i]);
  return out;
}

// 铺场单位：低费优先；战鼓蛮兵（战吼 rally）故意晚打，让更多单位吃到 IMP+1
function pickUnit(view, units) {
  let best = null, bestCost = Infinity, bestImp = -1;
  for (let i = 0; i < units.length; i++) {
    const c = handCard(view, units[i]);
    if (!c) continue;
    const n = (c.cost && c.cost.n) || 9;
    const imp = c.imp || 0;
    const effCost = (c.id === 'LQ01-052') ? n + 1 : n; // rally 单位后置
    if (effCost < bestCost || (effCost === bestCost && imp > bestImp)) {
      bestCost = effCost; bestImp = imp; best = units[i];
    }
  }
  return best;
}

// 有守卫时（攻击被强制指向守卫）：优先用能杀守卫且自己不死的高 ATK 单位去撞
function pickAttack(view, atks) {
  let best = null, bestScore = -1e9;
  for (let i = 0; i < atks.length; i++) {
    const m = atks[i];
    const u = myUnit(view, m.uid);
    const t = oppUnit(view, m.target);
    if (!u || !t) continue;
    const atk = u.atk || 0;
    const thp = t.hp || 0;
    const tatk = t.atk || 0;
    const uhp = u.hp || 0;
    let s = atk;
    if (atk >= thp) s += 100;  // 能直接换掉守卫
    if (tatk < uhp) s += 50;   // 自身不吃死
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

    const plays = ofType(moves, 'play');
    const atks = ofType(moves, 'attack');
    const avs = ofType(moves, 'avatar');

    const faceAtks = atks.filter(function (m) { return m.target === 'face'; });

    // 1) 斩杀：当前可打脸总伤害已够打死
    if (faceAtks.length) {
      let dmg = 0;
      for (let i = 0; i < faceAtks.length; i++) {
        const u = myUnit(view, faceAtks[i].uid);
        if (u) dmg += (u.imp || 0);
      }
      if (dmg >= (opp.life || 0)) return faceAtks[0];
    }

    // 焚天血咒直伤斩杀（打脸 4）
    const burn = plays.filter(function (m) {
      const c = handCard(view, m);
      return c && c.id === 'LQ01-042';
    });
    if (burn.length && (opp.life || 0) <= 4) return burn[0];

    // 2) 铺单位（冲锋，进场即可打脸）
    const units = plays.filter(function (m) {
      const c = handCard(view, m);
      return c && c.type === '单位';
    });
    if (units.length) return pickUnit(view, units);

    // 3) 灵体启动（拉格纳：1 激情 → 全体 IMP+1，late 时机，铺完场再开）
    if (avs.length) return avs[0];

    // 4) 血红爆发（rally，攻击前开，叠 IMP）
    const rally = plays.filter(function (m) {
      const c = handCard(view, m);
      return c && c.id === 'LQ01-046';
    });
    if (rally.length) return rally[0];

    // 5) 焚天血咒（直伤打脸）
    if (burn.length) return burn[0];

    // 6) 打脸
    if (faceAtks.length) return faceAtks[0];

    // 7) 有守卫则撞守卫
    if (atks.length) return pickAttack(view, atks);

    // 8) 兜底：pass
    return last;
  } catch (e) {
    return last;
  }
}

// 阻挡：红是打脸快攻，默认不挡保留打点；只有生命危险时用 IMP 最低的单位垫刀
function block(view, bmoves) {
  if (!bmoves || bmoves.length === 0) return null;
  const blocks = ofType(bmoves, 'block');
  const noBlocks = ofType(bmoves, 'noBlock');
  const me = view.me || {};
  if (blocks.length && (me.life || 0) <= 6) {
    let best = null, bestImp = Infinity;
    for (let i = 0; i < blocks.length; i++) {
      const u = myUnit(view, blocks[i].uid);
      if (!u) continue;
      const imp = u.imp || 0;
      if (imp < bestImp) { bestImp = imp; best = blocks[i]; }
    }
    if (best) return best;
  }
  if (noBlocks.length) return noBlocks[0];
  return bmoves[bmoves.length - 1];
}
