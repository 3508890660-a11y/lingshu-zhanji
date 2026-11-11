// ============================================================================
// deepseek v4pro · 纯红冲锋快攻
// 执行模型：deepseek-v4-pro
// 主色：红（资源：激情 · 门槛制不消耗）
// 策略名：赤潮突袭
//
// 思路（只依据卡面文本与基本规则，不含任何赛果/平衡信息）：
//   1. 激情是门槛制（规则 §3）：min(2×回合,10)，打牌不消耗资源，
//      因此每回合能把所有费用 ≤ 当前激情的牌都打出去，铺场节奏极快。
//   2. 红卡几乎全员带「冲锋」，进场当回合即可攻击（规则 §5 冲锋豁免召唤失调）。
//   3. 红A 灵体「狂战士·拉格纳」被动给全体冲锋、启动全体 IMP+1（本回合），
//      直接放大打脸伤害。
//   4. 「焚天血咒」4 激情直伤 4/6 点，可绕过守卫斩杀。
//
// 卡组（30 张 · 10 名目 ×3，全红）：
//   怒火新兵×3 / 赤刃幼虎×3 / 熔岩裂爪×3 / 暴走狂犬×3 / 掷火散兵×3
//   血斧掷颅手×3 / 烬原猛虎×3 / 烈阳断刃×3 / 焚天血咒×3 / 血红爆发×3
// ============================================================================

const meta = {
  name: 'deepseek v4pro · 赤潮突袭',
  desc: '执行模型 deepseek-v4-pro；颜色 红；策略 纯红冲锋快攻；门槛制激情铺场 + 冲锋打脸 + 直伤斩杀',
  id: 'model:deepseekv4pro',
  color: '红'
};

// ---------------------------------------------------------------------------
// build(pool)：返回 30 张合规卡组（红色主色，同名牌 ≤3）。
// 不依赖 pool，直接按卡号硬编码（接口约定卡号可硬编码）。
// ---------------------------------------------------------------------------
function build(pool) {
  const deck = [
    { id: 'LQ01-038', n: 3 }, // 怒火新兵   激情1  2/1/1  冲锋、怒火
    { id: 'LQ01-037', n: 3 }, // 赤刃幼虎   激情1  1/1/1  冲锋
    { id: 'LQ01-039', n: 3 }, // 熔岩裂爪   激情2  2/1/2  冲锋
    { id: 'LQ01-040', n: 3 }, // 暴走狂犬   激情2  1/3/2  怒火（攻击时 IMP+1）
    { id: 'LQ01-051', n: 3 }, // 掷火散兵   激情2  2/1/2  战吼：对对手造成 1 点伤害
    { id: 'LQ01-043', n: 3 }, // 血斧掷颅手 激情3  3/1/2  冲锋、战吼：对对手造成 1 点伤害
    { id: 'LQ01-044', n: 3 }, // 烬原猛虎   激情3  3/2/2  冲锋
    { id: 'LQ01-041', n: 3 }, // 烈阳断刃   激情2  瞬间   对 1 个单位造成 3 点伤害
    { id: 'LQ01-042', n: 3 }, // 焚天血咒   激情4  法术   对对手造成 4 点伤害（有单位被破坏则 6）
    { id: 'LQ01-046', n: 3 }  // 血红爆发   激情6  特殊   本回合单位 IMP+1、攻击追伤
  ];
  return deck;
}

// ---------------------------------------------------------------------------
// choose(view, moves)：每步挑一个动作，直到 pass。
// 红色快攻的动作优先级（从高到低）：
//   1. 冲锋单位（优先带战吼直伤的「血斧掷颅手」）
//   2. 启动灵体（全体 IMP+1，攻击前开）
//   3. 血红爆发（rally IMP+1，攻击前开）
//   4. 攻击对手灵体（打脸）
//   5. 焚天血咒（直伤打脸，可绕过守卫斩杀）
//   6. 烈阳断刃（点杀解场 / 解守卫）
//   7. 攻击敌方单位（守卫挡路时）
//   8. 非冲锋单位（铺场）
//   9. 其他可打出的牌
//  10. pass
// ---------------------------------------------------------------------------
function choose(view, moves) {
  const me = view.me || {};
  const hand = me.hand || [];
  const M = moves || [];

  // 分类（不修改原数组）
  const plays = [];
  const faces = [];
  const unitAttacks = [];
  let avatarMove = null;
  for (let i = 0; i < M.length; i++) {
    const m = M[i];
    if (m.type === 'play') plays.push(m);
    else if (m.type === 'attack') {
      if (m.target === 'face') faces.push(m);
      else unitAttacks.push(m);
    } else if (m.type === 'avatar' && !avatarMove) {
      avatarMove = m;
    }
  }

  // 从 play move 取对应手牌卡面
  function cardOf(m) {
    if (m.type !== 'play') return null;
    return hand[m.i] || null;
  }

  // 1a. 冲锋 + 战吼直伤（血斧掷颅手：冲锋且 text 含「对对手造成」）
  for (let i = 0; i < plays.length; i++) {
    const c = cardOf(plays[i]);
    if (c && c.type === '单位' &&
        (c.kw || []).indexOf('冲锋') >= 0 &&
        (c.text || '').indexOf('对对手造成') >= 0) {
      return plays[i];
    }
  }

  // 1b. 冲锋单位（进场即可打脸）
  for (let i = 0; i < plays.length; i++) {
    const c = cardOf(plays[i]);
    if (c && c.type === '单位' && (c.kw || []).indexOf('冲锋') >= 0) {
      return plays[i];
    }
  }

  // 2. 启动灵体（红A 狂战士·拉格纳：全体 IMP+1，本回合）
  if (avatarMove && !me.avatar.used) {
    return avatarMove;
  }

  // 3. rally 牌（血红爆发：text 含 IMP+1，非单位）
  for (let i = 0; i < plays.length; i++) {
    const c = cardOf(plays[i]);
    if (c && c.type !== '单位' && (c.text || '').indexOf('IMP+1') >= 0) {
      return plays[i];
    }
  }

  // 4. 攻击对手灵体（打脸）
  if (faces.length) return faces[0];

  // 5. 直伤打脸法术（焚天血咒，绕过守卫）
  for (let i = 0; i < plays.length; i++) {
    const c = cardOf(plays[i]);
    if (c && c.type !== '单位' && (c.text || '').indexOf('对对手造成') >= 0) {
      return plays[i];
    }
  }

  // 6. 点杀（烈阳断刃：对 1 个单位造成 3 点伤害）
  for (let i = 0; i < plays.length; i++) {
    const c = cardOf(plays[i]);
    if (c && c.type !== '单位' && (c.text || '').indexOf('造成 3 点伤害') >= 0) {
      return plays[i];
    }
  }

  // 7. 攻击敌方单位（解守卫）
  if (unitAttacks.length) return unitAttacks[0];

  // 8. 非冲锋单位（铺场，含掷火散兵战吼直伤）
  for (let i = 0; i < plays.length; i++) {
    const c = cardOf(plays[i]);
    if (c && c.type === '单位') return plays[i];
  }

  // 9. 其他可打出的牌
  if (plays.length) return plays[0];

  // 10. 兜底：优先 pass，否则最后一项
  for (let i = 0; i < M.length; i++) {
    if (M[i].type === 'pass') return M[i];
  }
  return M[M.length - 1];
}

// ---------------------------------------------------------------------------
// block(view, bmoves)：红色快攻尽量不阻挡（保留攻击者，用生命换节奏）。
// ---------------------------------------------------------------------------
function block(view, bmoves) {
  const B = bmoves || [];
  // 有守卫单位时用它挡，否则不阻挡
  const board = (view && view.me && view.me.board) || [];
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (b.type !== 'block') continue;
    for (let j = 0; j < board.length; j++) {
      if (board[j].uid === b.uid && (board[j].kw || []).indexOf('守卫') >= 0) {
        return b;
      }
    }
  }
  for (let i = 0; i < B.length; i++) {
    if (B[i].type === 'noBlock') return B[i];
  }
  return B[B.length - 1];
}
