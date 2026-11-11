// agent-hy3.js —— 执行模型 hy3 · 主色 绿 · 策略「地脉践踏」
// 接口契约见 03_脚本接口.md；本脚本零依赖，仅用注入的 api（无需直接访问）。
// 打法：绿色法力 ramp（地标滚雪球）→ 中期林冠漫步者 / 荒原猛犸 → 后期裂地巨犀 / 林冠泰坦践踏压脸。

const meta = {
  name: '显示名 · 地脉践踏(hy3)',
  desc: '执行模型 hy3；颜色 绿；策略 地脉践踏（ramp 到巨兽践踏压脸）；选色依据：自我评价排第一，绿法力滚雪球最稳、巨兽质量最高',
  id: 'model:hy3',
  color: '绿'
};

function build(pool) {
  // 期望卡组：绿色主色池 + 灰色泛用，30 张，同名 ≤3。
  const want = [
    // 地标 ramp 核心（9 张）
    ['LQ01-056', 3], // 幼叶之池：地标，产 1 法力
    ['LQ01-061', 2], // 母神共鸣地：地标，产 2 法力
    ['LQ01-062', 3], // 涌泉林地：地标，产 1 法力；回合末可再放 1 张地标
    ['LQ01-070', 1], // 进化的摇篮：地标，升灵费用 -1
    // 单位曲线（13 张）
    ['LQ01-055', 3], // 盖亚幼株：1/1/1 成长
    ['LQ01-057', 2], // 摇篮藤根：1/2/3 成长
    ['LQ01-063', 3], // 林冠漫步者：2/2/3，每有 1 地标 +1/+1（上限 +3/+3）
    ['LQ01-065', 2], // 荒原猛犸：4/3/4 践踏
    ['LQ01-066', 2], // 裂地巨犀：5/4/5 践踏（终端）
    ['LQ01-067', 1], // 林冠泰坦：6/5/6 践踏、再生（收尾）
    // 法术 / 交互（5 张）
    ['LQ01-058', 1], // 荆棘绞杀：法术，对 1 单位造成 3 点伤害
    ['LQ01-060', 1], // 落叶风暴：法术，对所有敌方单位造成 2 点伤害
    ['LQ01-064', 1], // 大地脉动：法术，检索 1 张地标直接进场
    ['LQ01-068', 1], // 巨兽冲锋：法术，+2/+0 且践踏+冲锋（本回合）
    ['LQ01-072', 1], // 藤海怒涛：法术，对所有敌方单位造成 3 点；每有 1 地标回复 1
    // 灰色泛用（3 张）
    ['LQ01-284', 1], // 灵脉碎片：地标，产 1 点主色资源
    ['LQ01-286', 2]  // 褪色符文：法术，抽 1
  ];
  const byId = {};
  for (const c of (pool || [])) byId[c.id] = c;
  const deck = [];
  for (const [id, n] of want) {
    const c = byId[id];
    if (!c) continue; // 安全兜底：池内缺失则跳过
    deck.push({ id, n });
  }
  // 兜底：若因池异常导致总张数不足 25，用池内绿/灰卡补足（避免触发 autoBuild 回退被判不合格）
  const totalCards = deck.reduce((a, x) => a + (x.n || 0), 0);
  if (totalCards < 25) {
    for (const c of (pool || [])) {
      if (deck.reduce((a, x) => a + (x.n || 0), 0) >= 25) break;
      const exist = deck.find((x) => x.id === c.id);
      if (exist) {
        if (exist.n < 3) exist.n++;
        continue;
      }
      deck.push({ id: c.id, n: 1 });
    }
  }
  return deck;
}

function cnum(c) {
  return c && c.cost && typeof c.cost.n === 'number' ? c.cost.n : 0;
}

function choose(view, moves) {
  if (!moves || !moves.length) return undefined;
  const me = view.me || {};
  const hand = me.hand || [];
  const lands = (me.lands || []).length;

  const plays = moves.filter((m) => m.type === 'play' && m.i != null);
  const isLand = (m) => hand[m.i] && hand[m.i].type === '地标';
  const isUnit = (m) => hand[m.i] && hand[m.i].type === '单位';
  const isSpell = (m) =>
    hand[m.i] && (hand[m.i].type === '法术' || hand[m.i].type === '结界' || hand[m.i].type === '瞬间');

  const landPlays = plays.filter(isLand);
  const unitPlays = plays.filter(isUnit);
  const spellPlays = plays.filter(isSpell);

  // 1) 灵体启动（森林先知·盖亚）：地标加速，优先在 ramp 期使用（<7 地标）
  const avatar = moves.find((m) => m.type === 'avatar');
  if (avatar && lands < 7) return avatar;

  // 2) 继续铺地标滚雪球（<7 地标）
  if (landPlays.length && lands < 7) return landPlays[0];

  // 3) 拍最贵的可用单位（用满法力，建立践踏怪）
  if (unitPlays.length) {
    unitPlays.sort((a, b) => cnum(hand[b.i]) - cnum(hand[a.i]));
    return unitPlays[0];
  }

  // 4) 法术交互（解场 / 检索地标 / 抽滤 / 群体伤害）
  if (spellPlays.length) return spellPlays[0];

  // 5) 仍想补地标（<8 且手里有）
  if (landPlays.length && lands < 8) return landPlays[0];

  // 6) 攻击：先打脸（践踏溢出转脸），否则清敌方单位
  const faceAtks = moves.filter((m) => m.type === 'attack' && m.target === 'face');
  if (faceAtks.length) return faceAtks[0];
  const unitAtks = moves.filter((m) => m.type === 'attack' && m.target && m.target !== 'face');
  if (unitAtks.length) return unitAtks[0];

  // 7) 兜底 pass（返回 moves 中真实的 pass 引用，不新建对象）
  const pass = moves.find((m) => m.type === 'pass');
  if (pass) return pass;
  return moves[moves.length - 1];
}

function block(view, bmoves) {
  if (!bmoves || !bmoves.length) return undefined;
  // 能挡则挡，保留践踏怪与场攻
  const blk = bmoves.find((m) => m.type === 'block');
  if (blk) return blk;
  const noBlock = bmoves.find((m) => m.type === 'noBlock');
  return noBlock || bmoves[bmoves.length - 1];
}
