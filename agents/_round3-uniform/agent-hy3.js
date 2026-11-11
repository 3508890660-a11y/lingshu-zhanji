// 灵枢战纪 · 绿（地脉践踏中速）· 模型 hy3
// 纯绿 30 张：地标 ramp（幼叶之池/母神共鸣地）+ 践踏巨兽推脸 + 对敌 AoE/点杀解场。
// 资源口径（01 §3）：绿 = 法力 = 2 + 地标数（消耗制）；回合末补牌至 地标数+1。
// 因此地标既是加速也是抽牌引擎；践踏把场面直接转生命压力；AoE 仅打敌方单位，安全清场。

const meta = {
  name: 'hy3 · 地脉践踏',
  desc: '执行模型 hy3；颜色 绿；策略 地脉践踏中速（地标 ramp + 践踏推脸 + 对敌 AoE 解场）；理由仅来自卡面与规则。',
  id: 'model:hy3',
  color: '绿'
};

// build(pool)：自行返回 30 张合规卡组（不依赖引擎回退）。
// 全部为主色「绿」，同名 ≤3，张数 30，满足 validateDeck（01 §4）。
function build(pool) {
  return [
    { id: 'LQ01-056', n: 3 }, // 幼叶之池：地标，产1法力（ramp 起点）
    { id: 'LQ01-055', n: 3 }, // 盖亚幼株：1/1/1 成长（便宜场面/计数）
    { id: 'LQ01-061', n: 3 }, // 母神共鸣地：地标，产2法力（加速核心）
    { id: 'LQ01-057', n: 3 }, // 摇篮藤根：1/2/3 守卫（前期墙）
    { id: 'LQ01-058', n: 3 }, // 荆棘绞杀：对1单位3伤害（点杀解场）
    { id: 'LQ01-068', n: 2 }, // 巨兽冲锋：单位+2/+0 获践踏与冲锋（本回合推进器）
    { id: 'LQ01-060', n: 2 }, // 落叶风暴：对所有敌方单位2伤害（AoE）
    { id: 'LQ01-063', n: 3 }, // 林冠漫步者：2/2/3，每有1地标+1/+1（上限+3/+3）
    { id: 'LQ01-072', n: 2 }, // 藤海怒涛：对所有敌方单位3伤害；每有1地标回复1（AoE+续航）
    { id: 'LQ01-065', n: 3 }, // 荒原猛犸：4/3/4 践踏（主战践踏兽）
    { id: 'LQ01-066', n: 2 }, // 裂地巨犀：5/4/5 践踏（高阶践踏兽）
    { id: 'LQ01-067', n: 1 }  // 林冠泰坦：6/5/6 践踏、再生（收尾炸弹）
  ];
}

// 给一张 play 动作打分（仅依据手牌卡面，不读未知效果）。
function scorePlay(m, view) {
  const hand = view.me && view.me.hand ? view.me.hand : [];
  const c = (typeof m.i === 'number') ? hand[m.i] : null;
  if (!c) return 1;
  const type = c.type;
  const name = c.name || '';
  const kw = c.kw || [];
  const text = c.text || '';
  if (type === '地标') return 10;            // 地标：ramp + 抽牌引擎，优先
  if (name.indexOf('巨兽冲锋') >= 0) return 8; // 赋予践踏/冲锋，强节奏
  if (type === '法术') {
    if (text.indexOf('所有敌方') >= 0) return 5;          // 对敌 AoE（安全清场）
    if (text.indexOf('造成') >= 0 && text.indexOf('伤害') >= 0) return 7; // 单点伤害解
    return 3;
  }
  if (type === '单位') {
    let s = 6;
    if (kw.indexOf('践踏') >= 0) s += 2;       // 践踏：伤害直推脸
    if (kw.indexOf('守卫') >= 0) s += 1;       // 守卫：防御
    if (kw.indexOf('再生') >= 0) s += 1;
    return s;
  }
  if (type === '结界') return 4;
  return 2;
}

// choose(view, moves)：可解释的动作优先级
// 斩杀(脸伤够) → 关键解/铺场/ramp(前中期或局面未稳) → 攻击(推脸/换血) → 灵体 → 升灵 → pass
function choose(view, moves) {
  if (!moves || !moves.length) return { type: 'pass' };
  try {
    const me = view.me || {};
    const opp = view.opp || {};
    const myBoard = me.board || [];
    const oppBoard = opp.board || [];
    const myLands = me.lands || [];
    const turn = view.turn || 1;
    const oppLife = (typeof opp.life === 'number') ? opp.life : 99;

    const plays = moves.filter(m => m.type === 'play');
    const attacks = moves.filter(m => m.type === 'attack');
    const avatars = moves.filter(m => m.type === 'avatar');
    const ascends = moves.filter(m => m.type === 'ascend');

    // 1) 斩杀：算出本回合可直击脸的总伤害（含灵体亲自作战），够则连续脸攻
    const boardByUid = {};
    myBoard.forEach(u => { boardByUid[u.uid] = u; });
    let faceDmg = 0;
    attacks.forEach(a => {
      if (a.target === 'face') {
        if (a.avatar) faceDmg += 2; // 灵体直击保底估算
        else if (a.uid != null && boardByUid[a.uid]) faceDmg += (boardByUid[a.uid].atk || 0);
      }
    });
    if (faceDmg >= oppLife) {
      const face = attacks.filter(a => a.target === 'face');
      if (face.length) return face[0];
    }

    // 2) 解场/铺场/ramp：前中期、场面未稳、或本步最优是地标/解场/赋予时优先出牌
    if (plays.length) {
      const scored = plays.map(m => ({ m: m, s: scorePlay(m, view) }));
      scored.sort((a, b) => b.s - a.s);
      const best = scored[0];
      const wantDevelop = (turn <= 6) || best.s >= 8 || myBoard.length < 3 || myLands.length < 3;
      // 对手有威胁(≥2 个单位)且手里有解时，也优先解
      const needAnswer = (oppBoard.length >= 2) && (best.s >= 5);
      if (wantDevelop || needAnswer) return best.m;
    }

    // 3) 攻击：优先推脸；否则换血（引擎已过滤合法目标/守卫）
    if (attacks.length) {
      const face = attacks.filter(a => a.target === 'face');
      if (face.length) return face[0];
      return attacks[0];
    }

    // 4) 灵体能力（每回合1次，通常有益）
    if (avatars.length) return avatars[0];

    // 5) 升灵（若有外枢素材，降临终端）
    if (ascends.length) return ascends[0];

    // 6) pass
    return moves[moves.length - 1];
  } catch (e) {
    // 任何异常安全兜底到最后一个动作（通常为 pass）
    return moves[moves.length - 1];
  }
}

// block(view, bmoves)：默认不阻挡（绿地脉践踏走抢血路线）；无 noBlock 时回退末项
function block(view, bmoves) {
  if (!bmoves || !bmoves.length) return { type: 'noBlock' };
  const nb = bmoves.filter(m => m.type === 'noBlock');
  if (nb.length) return nb[0];
  return bmoves[bmoves.length - 1];
}
