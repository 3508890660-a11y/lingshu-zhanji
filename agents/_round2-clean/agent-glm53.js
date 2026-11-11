/**
 * agents/agent-glm53.js
 * GLM5.3 · 赤焰冲锋 —— 纯红快攻
 *
 * 执行模型：glm-5.3（显示名 GLM5.3）
 * 主色：红（资源：激情）
 * 信息依据：仅 agents/brief/01_基本规则.md、02_卡表.md 的卡面文本与规则口径。
 *
 * 选色逻辑（规则依据）：
 *  - 激情＝min(2×回合, 10)，门槛制不消耗，且红没有每回合打出上限（§3），
 *    满足门槛后可把手牌全部倾泻；
 *  - 回合末弃光手牌、补至 (10−激情)÷2：前 4 回合手牌供给最厚，第 5 回合起
 *    无补牌 —— 资源曲线天然前倾，是十一色里最明确的速攻口径；
 *  - 红A 灵体狂战士·拉格纳被动「红色单位获得冲锋」，进场当回合即可输出，
 *    与低费冲锋单位叠加成每回合稳定直击。
 *
 * 对局逻辑：
 *  1) 每回合先倾泻全部合法手牌：单位铺场 → 血红爆发（攻击增益）→
 *     指向去除（优先拆守卫）→ 焚天血咒（吃「本回合有单位被破坏」加成，最后打）；
 *  2) 手牌倾泻完启动灵体（拉格纳：本回合单位 IMP+1）；
 *  3) 攻击：直击（face）永远优先；只能打守卫时，优先能击杀／能站住的交换；
 *  4) 阻挡：生命 > 8 时不挡（保攻击手下一轮反打），濒死时用最硬的单位挡。
 *
 * 契约：零 import/require；choose/block 只返回 moves/bmoves 里的对象引用；
 *       不修改 view/moves/bmoves；未知动作类型兜底 pass；不硬编码 uid。
 */

const meta = {
  name: 'GLM5.3 · 赤焰冲锋',
  desc: '执行模型 glm-5.3；颜色 红；策略 赤焰冲锋；激情门槛每回合倾泻全部手牌，低费冲锋单位＋直伤收头',
  id: 'model:glm53',
  color: '红'
};

/* ==================== 一、卡组构筑（build） ==================== */

/**
 * 10 名目 ×3 ＝ 30 张，全部为红色主卡（LQ01-037~054 段），同名牌 ≤3。
 * 费用曲线（激情费）：
 *   1–2 档 15 张｜3–4 档 12 张｜5–6 档 3 张｜7+ 档 0 张
 * 相对预组「YD01-03 赤潮」的两处改动：
 *   暴走狂犬（激情2 1/3/2，无冲锋、ATK1）→ 掷火散兵（激情2 2/1/2，战吼打脸 1）；
 *   战意永燃（结界：单位获冲锋，与拉格纳被动重复）→ 焚心咒（激情3，对 1 单位 4 伤）。
 */
const DECK_PLAN = [
  ['LQ01-038', 3], // 怒火新兵：激情1 2/1/1 冲锋、怒火（本回合首次攻击 ATK+1）
  ['LQ01-037', 3], // 赤刃幼虎：激情1 1/1/1 冲锋
  ['LQ01-039', 3], // 熔岩裂爪：激情2 2/1/2 冲锋
  ['LQ01-051', 3], // 掷火散兵：激情2 2/1/2 战吼——进场对对手 1 伤
  ['LQ01-043', 3], // 血斧掷颅手：激情3 3/1/2 冲锋＋战吼对对手 1 伤
  ['LQ01-044', 3], // 烬原猛虎：激情3 3/2/2 冲锋
  ['LQ01-041', 3], // 烈阳断刃：激情2 对 1 个单位 3 伤（拆守卫）
  ['LQ01-048', 3], // 焚心咒：激情3 对 1 个单位 4 伤（拆大守卫）
  ['LQ01-042', 3], // 焚天血咒：激情4 对手 4 伤（本回合有单位被破坏则 6）
  ['LQ01-046', 3]  // 血红爆发：激情6 本回合全体 IMP+1＋每有单位攻击追 1 脸伤
];

function build(pool) {
  const have = Object.create(null);
  for (let i = 0; i < pool.length; i++) have[pool[i].id] = pool[i];

  const deck = [];
  let count = 0;
  for (let i = 0; i < DECK_PLAN.length; i++) {
    const id = DECK_PLAN[i][0];
    const n = DECK_PLAN[i][1];
    if (have[id]) {
      deck.push({ id: id, n: n });
      count += n;
    }
  }

  // 兜底补位：万一某名目不在 pool（正常不会发生），按总身材用单位补足 30 张。
  if (count < 30) {
    const used = Object.create(null);
    for (let i = 0; i < deck.length; i++) used[deck[i].id] = deck[i].n;
    const backups = pool
      .filter(function (c) { return c.type === '单位'; })
      .slice()
      .sort(function (a, b) {
        const sa = (a.atk || 0) + (a.imp || 0) + (a.hp || 0);
        const sb = (b.atk || 0) + (b.imp || 0) + (b.hp || 0);
        return sb - sa;
      });
    for (let i = 0; i < backups.length && count < 30; i++) {
      const c = backups[i];
      const cur = used[c.id] || 0;
      if (cur >= 3) continue; // 同名牌 ≤3
      const add = Math.min(3 - cur, 30 - count);
      if (add <= 0) continue;
      let entry = null;
      for (let j = 0; j < deck.length; j++) {
        if (deck[j].id === c.id) { entry = deck[j]; break; }
      }
      if (entry) entry.n += add;
      else deck.push({ id: c.id, n: add });
      used[c.id] = cur + add;
      count += add;
    }
  }
  return deck;
}

/* ==================== 二、决策辅助 ==================== */

function findUnit(board, uid) {
  if (!board) return null;
  for (let i = 0; i < board.length; i++) {
    if (board[i].uid === uid) return board[i];
  }
  return null;
}

function hasKw(u, kw) {
  return !!(u && u.kw && u.kw.indexOf(kw) >= 0);
}

/**
 * 出牌评分：倾泻顺序＝单位（铺场）→ 血红爆发（攻击增益）→
 * 指向去除（优先高威胁／守卫）→ 焚天血咒（最后打，吃破坏加成）。
 */
function scorePlay(view, m) {
  const hand = (view.me && view.me.hand) || [];
  const card = hand[m.i];
  if (!card) return 1;

  if (card.type === '单位') {
    // 冲锋单位当回合即可输出（拉格纳被动），优先入场
    let s = 50 + (card.atk || 0) + (card.imp || 0) + (card.hp || 0) * 0.1;
    if (hasKw(card, '冲锋')) s += 5;
    return s;
  }
  if (card.id === 'LQ01-046') {
    // 血红爆发：全体 IMP+1，须在攻击前结算
    return 45;
  }
  if (m.target !== undefined) {
    // 指向去除（烈阳断刃 3 伤／焚心咒 4 伤）：优先拆守卫与高 ATK
    const t = findUnit(view.opp && view.opp.board, m.target);
    let s = 25;
    if (t) {
      s += (t.atk || 0) * 2 + (t.hp || 0);
      if (hasKw(t, '守卫')) s += 20; // 拔守卫＝打开直击通道
    }
    return s;
  }
  if (card.id === 'LQ01-042') {
    // 焚天血咒：本回合有单位被破坏时 4→6，故放在去除之后结算
    return 10;
  }
  return 5;
}

/**
 * 攻击评分：直击（face）永远最高；对单位攻击优先「能击杀＋自己站得住＋目标高威胁」。
 */
function scoreAttack(view, m) {
  const me = findUnit(view.me && view.me.board, m.uid);
  const myAtk = me ? (me.atk || 0) : 0;
  const myHp = me ? (me.hp || 0) : 0;

  if (m.target === 'face') return 10000 + myAtk;

  const t = findUnit(view.opp && view.opp.board, m.target);
  if (!t) return 1;
  const tAtk = t.atk || 0;
  const tHp = t.hp || 0;

  let s = tAtk * 2 + myAtk;
  if (myAtk >= tHp) s += 500;   // 能换掉目标
  if (myHp > tAtk) s += 100;    // 自己能站住
  if (hasKw(t, '守卫')) s += 50; // 只能打守卫时优先拆守卫
  return s;
}

/* ==================== 三、主决策（choose） ==================== */

function choose(view, moves) {
  try {
    if (!moves || !moves.length) return null;
    const fallback = moves[moves.length - 1]; // 引擎兜底：最后一个动作（pass）

    if (view && view.over) return fallback;

    // 1) 倾泻手牌：激情为门槛不消耗、回合末手牌反正弃光，能打的全打
    let bestPlay = null;
    let bestPlayScore = -1;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m.type !== 'play') continue;
      const s = scorePlay(view, m);
      if (s > bestPlayScore) {
        bestPlayScore = s;
        bestPlay = m;
      }
    }
    if (bestPlay) return bestPlay;

    // 2) 灵体启动（拉格纳：本回合单位 IMP+1）：有攻击可打时在攻击前开
    let avatar = null;
    let attacks = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m.type === 'avatar') avatar = m;
      else if (m.type === 'attack') attacks.push(m);
    }
    const myBoard = (view.me && view.me.board) || [];
    if (avatar && attacks.length > 0 && myBoard.length > 0) return avatar;

    // 3) 攻击：按评分选最优（直击优先／守卫交换看击杀与存活）
    if (attacks.length > 0) {
      let bestAtk = null;
      let bestAtkScore = -1;
      for (let i = 0; i < attacks.length; i++) {
        const s = scoreAttack(view, attacks[i]);
        if (s > bestAtkScore) {
          bestAtkScore = s;
          bestAtk = attacks[i];
        }
      }
      if (bestAtk) return bestAtk;
    }

    // 4) 其余未知类型（buy/ascend 等红卡组不会出现）→ 兜底 pass
    return fallback;
  } catch (e) {
    return moves && moves.length ? moves[moves.length - 1] : null;
  }
}

/* ==================== 四、阻挡（block） ==================== */

function block(view, bmoves) {
  try {
    if (!bmoves || !bmoves.length) return null;
    const noBlock = bmoves[bmoves.length - 1]; // 末位兜底

    let no = null;
    const blocks = [];
    for (let i = 0; i < bmoves.length; i++) {
      const m = bmoves[i];
      if (m.type === 'noBlock') no = m;
      else if (m.type === 'block') blocks.push(m);
    }
    if (!no) no = noBlock;

    // 快攻原则：生命充足时不挡（保攻击手下一轮反打），濒死才挡
    const life = view && view.me ? view.me.life : 20;
    if (life > 8 || blocks.length === 0) return no;

    // 濒死：用最硬（耐久×2＋ATK）的单位挡最大的一刀
    let best = null;
    let bestScore = -1;
    const myBoard = (view.me && view.me.board) || [];
    for (let i = 0; i < blocks.length; i++) {
      const u = findUnit(myBoard, blocks[i].uid);
      if (!u) continue;
      const s = (u.hp || 0) * 2 + (u.atk || 0);
      if (s > bestScore) {
        bestScore = s;
        best = blocks[i];
      }
    }
    return best || no;
  } catch (e) {
    return bmoves && bmoves.length ? bmoves[bmoves.length - 1] : null;
  }
}
