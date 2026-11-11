/**
 * deckbuild.js —— 组卡工具：给脚本与 UI 共用的"卡池 → 30 张"实现。
 *
 * 卡组可以用两种方式表达：
 *   1. 结构化：[{id:'LQ01-037', n:3}, ...]
 *   2. 文本：`3x LQ01-037` 或 `LQ01-037×3` 逐行
 * 脚本的 build() 返回哪一种都行，引擎会统一成结构化再校验。
 */
import { CARDS } from '../engine/cards.gen.js';
import { STACK_EXEMPT } from '../engine/rules.js';

export const PLAYABLE = CARDS.filter((c) => !c.unsupported);

export function colorPool(color) {
  if (color === '灰') return PLAYABLE.filter((c) => c.color === '灰');
  return PLAYABLE.filter((c) => c.color === color || c.color === '灰');
}

/** 单卡粗评分：只用于"没有 build() 的脚本"兜底，以及 UI 的推荐排序 */
export function scoreCard(c) {
  if (c.type === '单位') {
    let v = (c.atk || 0) * 1.0 + (c.imp || 0) * 1.2 + (c.hp || 0) * 1.1;
    for (const k of c.kw) {
      if (k === '冲锋') v += 1.2;
      if (k === '守卫') v += 0.8;
      if (k === '践踏') v += 1.0;
      if (k === '圣盾') v += 1.2;
      if (k === '成长') v += 1.5;
      if (k === '再生') v += 0.8;
      if (k === '团结') v += 0.6;
      if (k === '疾风') v += 0.8;
    }
    return v / Math.max(1, (c.cost?.n || 1) * 0.8);
  }
  let v = 0;
  for (const e of c.effects) {
    if (e.do === 'dmg') v += e.n * 1.4;
    if (e.do === 'aoe') v += e.n * 2.2;
    if (e.do === 'aoeRandom') v += e.n * e.picks * 1.1;
    if (e.do === 'draw') v += e.n * 2.0;
    if (e.do === 'destroy') v += 5;
    if (e.do === 'freeze') v += 2.5;
    if (e.do === 'bounce') v += 2.2;
    if (e.do === 'token') v += e.n * 2.2;
    if (e.do === 'buffAll') v += (e.atk + e.hp) * 2.0;
    if (e.do === 'buff') v += (e.atk + e.hp) * 1.2;
    if (e.do === 'heal') v += e.n * 1.0;
    if (e.do === 'res') v += e.n * 1.1;
    if (e.do === 'gold') v += e.n * 1.0;
    if (e.do === 'shield') v += e.n * 1.5;
    if (e.do === 'grant') v += 1.2;
    if (e.do === 'grantAll') v += 2.0;
  }
  return v / Math.max(1, (c.cost?.n || 1) * 0.9);
}

/** 按"每名 3 张、取前 N 个名目"组一副 30 张 */
export function autoBuild(pool, { names = 10, prefer = () => 0, maxCost = 99 } = {}) {
  const list = pool
    .filter((c) => (c.cost?.n ?? 0) <= maxCost)
    .map((c) => ({ c, s: scoreCard(c) + prefer(c) }))
    .sort((a, b) => b.s - a.s);

  const picked = [];
  const usedTypes = { 单位: 0, 法术: 0 };
  // 先保证 6 个名目的单位（没有单位会被白打）
  for (const { c } of list) {
    if (picked.length >= 6) break;
    if (c.type === '单位' && !picked.includes(c)) { picked.push(c); usedTypes.单位++; }
  }
  for (const { c } of list) {
    if (picked.length >= names) break;
    if (!picked.includes(c)) picked.push(c);
  }
  const n = picked.length;
  const per = n ? Math.floor(30 / n) : 0;
  const out = picked.map((c, i) => ({ id: c.id, n: per + (i < 30 - per * n ? 1 : 0) })).filter((x) => x.n > 0);
  return out;
}

/* ── 文本 ⇄ 结构 ── */

export function deckToText(list) {
  return list.map((x) => `${x.n}x ${x.id}`).join('\n');
}

export function textToDeck(text) {
  const out = [];
  for (const raw of String(text || '').split(/[\n,;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = line.match(/^(\d+)\s*[x×*]\s*([A-Za-z]{2}\d{2}-\d{3})$/i);
    if (!m) m = line.match(/^([A-Za-z]{2}\d{2}-\d{3})\s*[x×*]\s*(\d+)$/i);
    if (!m) continue;
    const n = Number(m[1].length <= 2 && /^\d+$/.test(m[1]) ? m[1] : m[2]);
    const id = (/^\d+$/.test(m[1]) ? m[2] : m[1]).toUpperCase();
    out.push({ id, n });
  }
  return out;
}

/** 规范化：合并同 id、裁剪到 3 张上限 */
export function normalizeDeck(list) {
  const map = new Map();
  for (const it of list) {
    if (!it || !it.id) continue;
    const id = String(it.id).toUpperCase();
    // 上限不是恒为 3：金色的【制式铜币】按规则 5.9 是固定牌库预置 ×4（STACK_EXEMPT）
    const cap = STACK_EXEMPT.get(id) ?? 3;
    map.set(id, Math.min(cap, (map.get(id) || 0) + (it.n || 1)));
  }
  return [...map.entries()].map(([id, n]) => ({ id, n }));
}
