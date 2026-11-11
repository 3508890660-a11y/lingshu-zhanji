/**
 * fuzz.mjs —— 不变量模糊测试：跑大量随机对局，逐条检查"引擎不该出现"的状态。
 * 用法：node tools/fuzz.mjs [局数]
 *
 * 检查项：
 *   1. 生命 ∈ [0, 20]（生命卡组张数）
 *   2. 资源 ≥ 0、手牌 ≤ 20
 *   3. 场上单位 0 < hp ≤ maxHp（死单位不得留场）
 *   4. 牌库/手牌里不得出现衍生物（'TOKEN'）——重构会把弃牌区洗回，衍生物不该进去
 *   5. 日志里不得出现 NaN / undefined / null
 *   6. 不得出现「（无事件）」步——那意味着 legalMoves 给了动作但 applyMove 返回 false
 *   7. 对局必须在 4000 步内结束（否则是死循环）
 *   8. 外枢灵体不得进入牌库／手牌／弃牌区（只能在场或外枢区）
 *   9. 牌张守恒：deck+hand+grave+board+lands+forge+perms 的"可追踪卡"总数不因对局而漂移
 */
import { CARDS } from '../js/engine/cards.gen.js';
import { playMatch, validateDeck } from '../js/engine/rules.js';
import { PRECONS } from '../js/data/precons.js';
import * as B from '../js/ai/builtin.js';

const byId = new Map(CARDS.map((c) => [c.id, c]));
const N = Number(process.argv[2] || 60);

/** 随机走子脚本：只用 legalMoves 里给出的动作，但故意乱选，用来撞顺序类 bug */
const RANDOM = {
  id: 'random', name: '随机',
  choose(view, moves) {
    // 有 40% 概率优先攻击，其余纯随机
    if (Math.random() < 0.4) {
      const atk = moves.filter((m) => m.type === 'attack');
      if (atk.length) return atk[Math.floor(Math.random() * atk.length)];
    }
    return moves[Math.floor(Math.random() * moves.length)];
  },
  block(view, moves) {
    if (!moves.length) return null;
    return Math.random() < 0.5 ? moves[Math.floor(Math.random() * moves.length)] : null;
  },
};

/** 只数"可追踪的真实卡"（衍生物与外枢不计） */
function deckableCount(p) {
  let n = 0;
  const add = (id) => { if (byId.has(id)) n++; };
  p.deck.forEach(add);
  p.hand.forEach(add);
  p.grave.forEach(add);
  (p.exile || []).forEach(add);
  p.lands.forEach((l) => add(l.id));
  (p.forge || []).forEach(add);
  (p.perms || []).forEach((x) => add(x.id));
  p.board.forEach((u) => { add(u.id); (u.equip || []).forEach(add); });
  // 粉色魂装源：叠在灵体下方，仍属该玩家的卡（活跃＋已消耗）
  (p.souls || []).forEach((s) => add(s.id));
  (p.soulGrave || []).forEach((s) => add(s.id));
  return n;
}

const issues = [];
const note = (kind, msg) => { if (!issues.some((x) => x.kind === kind)) issues.push({ kind, msg }); };
const counts = {};
const add = (k, n = 1) => { counts[k] = (counts[k] || 0) + n; };

let games = 0, totalSteps = 0, maxSteps = 0, draws = 0;

for (let i = 0; i < N; i++) {
  const a = PRECONS[i % PRECONS.length];
  const b = PRECONS[(i * 7 + 3) % PRECONS.length];
  const seed = 20000 + i;
  let res;
  try {
    res = playMatch({
      deckA: a.deck, deckB: b.deck, colorA: a.color, colorB: b.color,
      seed, scriptA: (i % 2 ? RANDOM : B.VALUE), scriptB: (i % 3 ? B.VALUE : RANDOM), nameA: a.color, nameB: b.color,
    });
  } catch (e) {
    note('crash', `${a.color} vs ${b.color} seed ${seed} 抛异常：${e.message}`);
    continue;
  }
  games++;
  totalSteps += res.steps.length;
  maxSteps = Math.max(maxSteps, res.steps.length);
  if (res.steps.length >= 4000) note('guard', `${a.color} vs ${b.color} 触发 4000 步上限`);
  if (res.winner === -1 && /回合上限/.test(res.log[res.log.length - 1] || '')) draws++;

  for (const st of res.steps) {
    const s = st.snap;
    if (!s) continue;
    for (const p of s.P) {
      if (p.life < 0 || p.life > 20) note('life', `${p.name} 生命 ${p.life} 越界`);
      if (p.res < 0) note('res', `${p.name}（${p.color}）资源 ${p.res} 为负`);
      // 规则 5.5：蓝色**手牌无上限**，不参与这条检查（但仍设 40 的硬上限防失控）
      const handLimit = p.color === '蓝' ? 40 : 20;
      if (p.hand.length > handLimit) note('hand', `${p.name} 手牌 ${p.hand.length} 张`);
      for (const u of p.board) {
        if (u.hp <= 0) note('deadunit', `${p.name} 场上残留 0 血单位【${u.name}】`);
        if (u.hp > (u.maxHp ?? u.hp)) note('hp', `${p.name}【${u.name}】hp ${u.hp} > maxHp ${u.maxHp}`);
        if (u.atk < 0 || u.imp < 0) note('negstat', `${p.name}【${u.name}】攻/冲为负 ${u.atk}/${u.imp}`);
      }
      for (const c of p.hand) {
        if (c.id === 'TOKEN') note('token', `${p.name} 手里有衍生物占位`);
        if (!byId.has(c.id) && c.id !== 'TOKEN') note('unknown', `手牌出现未知卡号 ${c.id}`);
      }
    }
    if (/NaN|undefined|null/.test(st.text || '')) note('nan', `日志出现非法值：${String(st.text).slice(0, 60)}`);
    if ((st.text || '').includes('（无事件）')) note('noevent', '出现「（无事件）」步：legalMoves 给了动作但 applyMove 失败');
    if (!st.text) note('emptytext', '存在空文本步');
  }

  // 衍生物是否被洗进牌库（重构）
  for (const p of res.game.players) {
    const tokenInDeck = p.deck.filter((id) => id === 'TOKEN').length;
    if (tokenInDeck) { note('tokendeck', `${p.color} 牌库里有 ${tokenInDeck} 张衍生物（重构把 TOKEN 洗回）`); }

    // 外枢灵体（LQ01-260~283）属额外区，**只能待在场上或外枢区**：
    // 一旦出现在牌库／手牌／弃牌区，就会变成抽到也打不出的永久死卡。
    const stray = [...p.deck, ...p.hand, ...p.grave].filter((id) => /^LQ01-2[6-8]\d$/.test(id));
    if (stray.length) note('ascendant', `${p.color} 的牌库/手牌/弃牌区出现外枢灵体 ${stray.length} 张：${stray.slice(0, 3).join(',')}`);
  }

  // 卡张守恒：开局张数 + 购买数 应当等于终局可追踪卡数（衍生物/外枢不计）
  const lists = [a.deck, b.deck];
  const cols = [a.color, b.color];
  for (let k = 0; k < 2; k++) {
    const live = res.game.players[k];
    const c0 = lists[k].reduce((t, it) => t + ((byId.has(it.id) ? it.n : 0)), 0);
    const c1 = deckableCount(live);
    const buys = res.log.filter((l) => l.startsWith(`${live.name} 购买【`)).length;
    if (c1 < c0) note('conservation', `${cols[k]} 卡张从 ${c0} 掉到 ${c1}（有卡凭空消失）`);
    if (c1 > c0 + buys) note('conservation+', `${cols[k]} 卡张从 ${c0} 涨到 ${c1}，购买 ${buys} 张——多出来了`);
    add('cards', c1);
  }
}

console.log(`模糊测试：${games} 局，平均 ${(totalSteps / Math.max(1, games)).toFixed(1)} 步，最长 ${maxSteps} 步，判和 ${draws} 局`);
if (!issues.length) {
  console.log('✓ 九项不变量全部通过');
} else {
  console.log(`✗ 发现 ${issues.length} 类问题：`);
  for (const it of issues) console.log(`  [${it.kind}] ${it.msg}`);
}
