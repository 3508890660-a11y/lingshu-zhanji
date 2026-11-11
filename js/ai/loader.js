/**
 * loader.js —— 脚本加载与沙箱。
 *
 * 用户脚本是一段声明了 `build` / `choose` 的 JS 源码，编译方式：
 *   new Function('api', src + '; return {build, choose, meta}')
 *
 * 这不是真正的安全沙箱（浏览器里也没有），它的作用是**结构约束**：
 *   - 脚本拿不到引擎内部的 g、players、rng，只能看到 view 的一份拷贝；
 *   - 脚本改不了状态，只能从 moves 里挑一个，挑错了引擎会回退到 pass。
 * 对本地单人观战工具来说，这个边界足够，也让脚本写起来极简。
 */
import { CARDS } from '../engine/cards.gen.js';
import { scoreCard, autoBuild } from './deckbuild.js';

const KEY = 'lq01.userScripts.v1';

export const API = {
  CARDS,
  scoreCard,
  autoBuild,
  byId: (id) => CARDS.find((c) => c.id === id),
  costOf: (c) => c?.cost?.n ?? 0,
};

const TEMPLATE = `// ── 自定义 AI 脚本 ──
// 必须实现 choose(view, moves)，可选 build(pool)。
// moves 是引擎枚举出的合法动作全集，返回值必须是其中某一个。
const meta = { name: '我的脚本', desc: '一句话说明' };

function build(pool) {
  // pool: 该颜色的可用卡 [{id,name,type,cost,atk,imp,hp,kw,effects,score}]
  // 返回 [{id,n}] 或 '3x LQ01-037' 这样的文本
  const units = pool.filter(c => c.type === '单位').sort((a,b) => b.score - a.score).slice(0, 8);
  const spells = pool.filter(c => c.type !== '单位').sort((a,b) => b.score - a.score).slice(0, 2);
  return [...units, ...spells].map(c => ({ id: c.id, n: 3 }));
}

function choose(view, moves) {
  // 1. 能斩杀就斩杀
  const face = moves.filter(m => m.type === 'attack' && m.target === 'face');
  let dmg = 0; const seen = new Set();
  for (const m of face) { if (seen.has(m.uid)) continue; seen.add(m.uid);
    const u = view.me.board.find(x => x.uid === m.uid); if (u) dmg += u.imp; }
  if (dmg >= view.opp.life && face.length) return face[0];

  // 2. 能出的牌先出（低费优先）
  const plays = moves.filter(m => m.type === 'play')
    .sort((a,b) => (view.me.hand[a.i]?.cost?.n ?? 0) - (view.me.hand[b.i]?.cost?.n ?? 0));
  if (plays.length) return plays[0];

  // 3. 打脸
  if (face.length) return face[0];

  // 4. 否则结束回合
  return moves[moves.length - 1];
}
`;

export function compileScript(source, fallbackName = '自定义脚本') {
  // 注意：`block` / `respond` 是可选的第二、第三钩子。旧版这里只导出 build/choose/meta，
  // 结果脚本里写了 block 也永远不会被调用（一直走 defaultBlock），respond 同理。
  const body = `${source}\n;return {
  build: typeof build === 'function' ? build : null,
  choose: typeof choose === 'function' ? choose : null,
  block: typeof block === 'function' ? block : null,
  respond: typeof respond === 'function' ? respond : null,
  meta: (typeof meta === 'object' && meta) || {}
};`;
  const factory = new Function('api', body);
  const obj = factory(API);
  if (typeof obj.choose !== 'function') throw new Error('脚本缺少 choose(view, moves)');
  return {
    id: obj.meta.id || `user:${obj.meta.name || fallbackName}`,
    name: obj.meta.name || fallbackName,
    desc: obj.meta.desc || '',
    build: obj.build,
    choose: obj.choose,
    block: obj.block || undefined,       // 阻挡窗口（可选）
    respond: obj.respond || undefined,   // 响应窗口：瞬间 / 反击（可选）
    user: true,
  };
}

export function loadUserScripts() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return arr.map((it) => {
      try { return { ...compileScript(it.src, it.name), src: it.src, key: it.key }; }
      catch (e) { return { id: `broken:${it.name}`, name: `${it.name}（编译失败）`, desc: e.message, broken: true, src: it.src, key: it.key }; }
    });
  } catch { return []; }
}

export function saveUserScript(name, src) {
  const key = `u_${Date.now()}`;
  const raw = localStorage.getItem(KEY);
  const arr = raw ? JSON.parse(raw) : [];
  arr.push({ key, name, src });
  localStorage.setItem(KEY, JSON.stringify(arr));
  return key;
}

export function removeUserScript(key) {
  const raw = localStorage.getItem(KEY);
  const arr = raw ? JSON.parse(raw) : [];
  localStorage.setItem(KEY, JSON.stringify(arr.filter((x) => x.key !== key)));
}

export function getTemplate() { return TEMPLATE; }
