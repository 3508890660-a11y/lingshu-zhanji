// KIMI 2.8preview ・ 圣盾军团（白色守护中速）
// 依据仅限 agents/brief 内 01 基本规则 / 02 卡表 / 03 脚本接口。
// 零 import / require；不修改 view / moves；不硬编码 uid。

const meta = {
  name: 'KIMI 2.8preview · 圣盾军团',
  desc: '执行模型 kimi-k2.8-preview；颜色 白；策略 圣盾军团（守护军团中速）；依据卡面：奥蕾莉亚铺士兵+全体守护1，团结单位吃白色密度滚雪球',
  id: 'model:kimi28preview',
  color: '白'
};

// ---- 卡组（30 张 · 纯白 10 名目 ×3，不混灰，保住团结与守护联动） ----
// 相对预组 YD01-01 的改动：
//   去掉 005 圣光震荡（AP3 全场打2偏控制、抢节奏弱）、006 肃正之槌（AP4 且只打
//   攻击中/横置单位，太慢）；
//   加入 011 殉道者卫兵（AP2 2/1/2，殉道抽1+灵体回1，补白色过牌短板）、
//        014 安息祷言（AP3 抉择 救赎3 / 升天2抽1，后期续航）。
// 曲线（按 AP 费）：1 费 6 张 / 2 费 15 张 / 3 费 9 张 / 4+ 0 张。
const PLAN = [
  { id: 'LQ01-001', n: 3 },  // 圣光新兵    AP1 1/1/1
  { id: 'LQ01-002', n: 3 },  // 团结轻骑    AP2 2/1/2 团结
  { id: 'LQ01-003', n: 3 },  // 守护之盾    AP1 守护2
  { id: 'LQ01-004', n: 3 },  // 救赎圣辉    AP2 救赎2
  { id: 'LQ01-007', n: 3 },  // 圣盾亲卫    AP2 1/1/2 圣盾
  { id: 'LQ01-008', n: 3 },  // 军团中坚    AP3 3/2/3 团结+守护1
  { id: 'LQ01-009', n: 3 },  // 守护阵列    AP3 结界 全体守护1+灵体减伤
  { id: 'LQ01-010', n: 3 },  // 募兵号令    AP2 双士兵（1/1/1 守护1）
  { id: 'LQ01-011', n: 3 },  // 殉道者卫兵  AP2 2/1/2 殉道抽1
  { id: 'LQ01-014', n: 3 }   // 安息祷言    AP3 抉择
];

function build(pool) {
  const byId = {};
  for (const c of pool) byId[c.id] = c;
  const deck = [];
  for (const e of PLAN) {
    if (byId[e.id]) deck.push({ id: e.id, n: e.n });
  }
  // 兜底：若个别卡缺失，用费用最低的白/灰单位补齐到 30 张、且不超同名 3 张。
  if (deck.reduce((a, e) => a + e.n, 0) < 30) {
    const fillers = pool
      .filter((c) => c.type === '单位' && !deck.some((e) => e.id === c.id))
      .sort((a, b) => (a.cost.n - b.cost.n) || (b.atk + b.hp) - (a.atk + a.hp));
    let total = deck.reduce((a, e) => a + e.n, 0);
    for (const f of fillers) {
      if (total >= 30) break;
      deck.push({ id: f.id, n: Math.min(3, 30 - total) });
      total += Math.min(3, 30 - total);
    }
  }
  return deck;
}

// ---------- 工具 ----------

function readyUnits(board) {
  return board.filter((u) => !u.frozen && !u.attacked);
}

function myUnitByUid(view, uid) {
  return view.me.board.find((u) => u.uid === uid);
}

function oppUnitByUid(view, uid) {
  return view.opp.board.find((u) => u.uid === uid);
}

// 本回合「打向脸」的潜在斩杀量
function faceDamage(view, moves) {
  let sum = 0;
  for (const m of moves) {
    if (m.type === 'attack' && m.target === 'face') {
      const u = myUnitByUid(view, m.uid);
      if (u) sum += Math.max(0, u.atk);
    }
  }
  return sum;
}

// ---------- choose ----------

function choose(view, moves) {
  try {
    if (!Array.isArray(moves) || moves.length === 0) return null;

    // 0) 斩杀：可打脸伤害 >= 对手生命，全部打脸。
    if (faceDamage(view, moves) >= (view.opp.life || 0)) {
      const kills = moves.filter((m) => m.type === 'attack' && m.target === 'face');
      if (kills.length) {
        kills.sort((a, b) => {
          const ua = myUnitByUid(view, a.uid), ub = myUnitByUid(view, b.uid);
          return (ub ? ub.atk : 0) - (ua ? ua.atk : 0);
        });
        return kills[0];
      }
    }

    let best = null;
    let bestScore = -Infinity;
    const myReadyCount = readyUnits(view.me.board).length;
    const oppBoard = view.opp.board || [];

    for (const m of moves) {
      let s = null;
      switch (m.type) {

        case 'play': {
          const card = view.me.hand[m.i];
          if (!card) { s = -100; break; }
          const cost = (card.cost && card.cost.n) || 0;
          if (card.type === '单位') {
            s = 40 + cost * 6;
            const kw = card.kw || [];
            if (kw.indexOf('团结') >= 0) s += 5 + 2 * Math.max(0, view.me.board.length - 1);
            if (kw.indexOf('圣盾') >= 0) s += 4;
            if (kw.indexOf('守卫') >= 0) s += 3;
            // 落后时更积极下怪，领先时留一点资源给守护/抽牌
            if (view.me.board.length < oppBoard.length) s += 6;
          } else if (card.type === '结界' || card.type === '地标') {
            s = 36 + cost * 4;
          } else {
            // 法术：按名目给值
            s = spellScore(card, view, m);
          }
          break;
        }

        case 'attack': {
          const u = myUnitByUid(view, m.uid);
          if (!u) { s = -100; break; }
          if (m.target === 'face') {
            s = 30 + u.atk;
            // 快死了多抢血
            if ((view.opp.life || 20) <= 8) s += 12;
          } else {
            const t = oppUnitByUid(view, m.target);
            if (!t) { s = 5; break; }
            const kills = u.atk >= t.hp;
            const survives = u.hp > t.atk;
            if (kills && survives) s = 26 + u.atk;          // 无损解
            else if (kills) s = 20 + u.atk - Math.max(0, t.atk - u.hp); // 换掉
            else s = 4 + u.atk;                              // 磨血
            // 守护1 会被相邻替挡，打有守护的对象价值下调
            if ((t.kw || []).some((k) => /^守护/.test(k))) s -= 4;
          }
          break;
        }

        case 'avatar': {
          // 奥蕾莉亚 1AP 产士兵；1AP 打不掉大怪时优于空过
          s = 18;
          if (view.me.res >= 2 && myReadyCount === 0) s += 6;
          break;
        }

        case 'ascend': {
          s = view.me.outerReady > 0 ? 46 : 10;
          break;
        }

        case 'buy': {
          s = 12; // 金色市场兜底；本卡组非金不会走到
          break;
        }

        case 'pass':
          s = 0;
          break;

        default:
          s = -50; // 未知动作靠后，但不至于死循环
      }
      if (s !== null && s > bestScore) { bestScore = s; best = m; }
    }

    if (best) return best;
    return moves[moves.length - 1]; // 兜底 pass
  } catch (e) {
    return moves[moves.length - 1];
  }
}

// 法术分值：按卡面名目写死，未知法术保守给低分
function spellScore(card, view, move) {
  const grave = view.me.grave || 0;
  const myBoard = view.me.board || [];
  const oppBoard = view.opp.board || [];
  switch (card.name) {
    case '募兵号令':
      return 44 + 3 * myBoard.length; // 双士兵喂团结+守护
    case '救赎圣辉':
      return grave > 0 ? 34 + Math.min(6, grave) : -8;
    case '安息祷言':
      return grave > 0 ? 33 : 28; // 救赎3 或 升天2+抽1，均有价值
    case '守护之盾': {
      if (myBoard.length === 0) return -8;
      const t = move.target ? myUnitByUid(view, move.target) : null;
      return t && t.atk >= 3 ? 24 + t.atk : 8;
    }
    case '圣光震荡':
      return 20 + 6 * oppBoard.filter((u) => u.hp <= 2).length
        - 8 * myBoard.filter((u) => u.hp <= 2).length;
    default:
      return 14; // 未知法术：可打就打，别卡手
  }
}

// ---------- block（防守窗口） ----------

function block(view, bmoves) {
  try {
    if (!Array.isArray(bmoves) || bmoves.length === 0) return null;
    const onlyNo = bmoves.filter((m) => m.type === 'noBlock');
    if (onlyNo.length === bmoves.length) return onlyNo[0];

    // 找到正在攻击的对手单位（已攻击标记）
    const attackers = (view.opp.board || []).filter((u) => u.attacked);
    const atk = attackers.length
      ? attackers.reduce((a, u) => Math.max(a, u.atk), 0)
      : 2;

    let best = null;
    let bestScore = -Infinity;
    for (const m of bmoves) {
      if (m.type !== 'block') continue;
      const u = myUnitByUid(view, m.uid);
      if (!u) continue;
      const kills = u.atk >= atk;            // 粗估：能吃掉来攻者
      const survives = u.hp > atk;
      let s = kills ? 20 : 0;
      s += survives ? 10 : -6;
      s += atk;                               // 对手打越狠越该挡
      s -= u.atk + u.hp > 8 ? 6 : 0;          // 尽量别拿大件去挡小攻
      if (s > bestScore) { bestScore = s; best = m; }
    }
    // 小攻击（<=2）且我们挡不住任何东西时不挡，保场面
    if (best && atk <= 2 && bestScore < 24) best = null;
    return best || onlyNo[0] || bmoves[bmoves.length - 1];
  } catch (e) {
    return bmoves[bmoves.length - 1];
  }
}
