// agent-hy3.js · 纯红快攻「赤焰疾袭」
// 执行模型 ID: hy3   显示名: hy3   主色: 红（激情·门槛不消耗）
// 策略：以大量带冲锋的红色单位当回合抢血，配合直伤法术收尾的纯红快攻。
// 接口硬契约：零 import/require；不修改 view/moves；返回 moves 里的对象引用；兜底 pass。

const meta = {
  name: 'hy3 · 赤焰疾袭',
  desc: '执行模型 hy3；颜色 红；策略 赤焰疾袭；以冲锋单位抢血、直伤法术收尾的纯红快攻',
  id: 'model:hy3',
  color: '红'
};

// 主卡组：纯红 30 张，10 名目 ×3，费用曲线偏 1~2 费。
// 选牌依据（仅卡面+规则）：全部单位带冲锋（含灵体被动赋予），可当回合攻击；
// 焚天血咒为直伤收尾；烈阳断刃清场阻挡；烽燧传令官免费铺场。
const DECK = {
  'LQ01-037': 3, // 赤刃幼虎 激情1 1/1/1 冲锋
  'LQ01-038': 3, // 怒火新兵 激情1 2/1/1 冲锋·怒火
  'LQ01-039': 3, // 熔岩裂爪 激情2 2/1/2 冲锋
  'LQ01-040': 3, // 暴走狂犬 激情2 1/3/2 怒火(IMP+1)
  'LQ01-041': 3, // 烈阳断刃 激情2 瞬间 对单位3伤（清阻挡）
  'LQ01-042': 3, // 焚天血咒 激情4 对对手4~6伤（收尾直伤）
  'LQ01-043': 3, // 血斧掷颅手 激情3 3/1/2 冲锋·战吼对手1
  'LQ01-044': 3, // 烬原猛虎 激情3 3/2/2 冲锋
  'LQ01-051': 3, // 掷火散兵 激情2 2/1/2 战吼对手1
  'LQ01-053': 3  // 烽燧传令官 激情2 1/1/2 战吼免费打激情≤2红单位
};

function build(pool) {
  const byId = {};
  for (const c of pool) byId[c.id] = c;
  const deck = [];
  let total = 0;
  for (const id in DECK) {
    if (byId[id]) {
      deck.push({ id, n: DECK[id] });
      total += DECK[id];
    }
  }
  // 安全兜底：若红池缺失某张，用最便宜的红单位补齐到 30
  if (total < 30) {
    const fillers = ['LQ01-037', 'LQ01-038', 'LQ01-039', 'LQ01-051', 'LQ01-040'];
    for (const id of fillers) {
      if (total >= 30) break;
      if (byId[id]) {
        const need = 3 - (DECK[id] || 0);
        const add = Math.min(need, 30 - total);
        if (add > 0) {
          const found = deck.find(d => d.id === id);
          if (found) found.n += add;
          else deck.push({ id, n: add });
          total += add;
        }
      }
    }
  }
  return deck;
}

// ---- 工具 ----
function costNum(c) {
  if (!c) return 99;
  if (typeof c.cost === 'number') return c.cost;
  if (c.cost && typeof c.cost.n === 'number') return c.cost.n;
  return 99;
}

function findPass(moves) {
  const p = moves.find(m => m.type === 'pass');
  return p || moves[moves.length - 1];
}

// 判断一张手牌是否是对对手造成直伤（收尾用）
function hitsOpponent(c) {
  return !!(c && c.text && c.text.indexOf('对手') >= 0);
}
// 判断一张手牌是否需要对敌方单位指定目标（清阻挡/去除）
function targetsUnit(c) {
  return !!(c && c.text && c.text.indexOf('对 1 个单位') >= 0);
}

function choose(view, moves) {
  if (!moves || !moves.length) return undefined;
  const passMove = findPass(moves);
  const me = view.me || {};
  const opp = view.opp || {};

  // 1) 启动灵体能力（红A·狂战士：过载1 本回合单位 IMP+1），在攻击前提升抢血效率
  if (me.avatar && !me.avatar.used) {
    const av = moves.find(m => m.type === 'avatar');
    if (av) return av;
  }

  const plays = moves.filter(m => m.type === 'play' && m.i != null);
  const cardOf = (m) => (me.hand && me.hand[m.i]) || null;

  // 2) 优先铺场：打出最便宜的红色单位（当回合即可冲锋攻击）
  let cheapest = null, cheapestCost = 99;
  for (const m of plays) {
    const c = cardOf(m);
    if (c && c.type === '单位') {
      const co = costNum(c);
      if (co < cheapestCost) { cheapestCost = co; cheapest = m; }
    }
  }
  if (cheapest) return cheapest;

  // 3) 已无单位可铺：用所有可用单位攻击对手脸（守卫由引擎强制约束）
  const faceAttacks = moves.filter(m => m.type === 'attack' && m.target === 'face');
  if (faceAttacks.length) return faceAttacks[0];

  // 4) 直伤法术收尾（焚天血咒等对对手造成伤害的牌）
  for (const m of plays) {
    if (hitsOpponent(cardOf(m))) return m;
  }

  // 5) 对手有威胁单位时，用去除牌清场（烈阳断刃等对单位指定伤害）
  if (opp.board && opp.board.length) {
    for (const m of plays) {
      const c = cardOf(m);
      if (targetsUnit(c) && m.target != null) return m;
    }
  }

  // 6) 其余打牌兜底（如带战吼的单位若漏过、或结界）
  if (plays.length) return plays[0];

  // 7) 只剩下攻击敌方单位的动作（守卫强制）
  const unitAttacks = moves.filter(m => m.type === 'attack' && m.target !== 'face');
  if (unitAttacks.length) return unitAttacks[0];

  return passMove;
}

// 可选阻挡：快攻不主动换血，默认不阻挡，保留单位继续抢血。
function block(view, bmoves) {
  if (!bmoves || !bmoves.length) return undefined;
  const no = bmoves.find(b => b.type === 'noBlock');
  return no || bmoves[bmoves.length - 1];
}
