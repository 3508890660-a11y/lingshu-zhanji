/**
 * app.js —— 观战台前端。
 *
 * 数据流：选脚本/颜色 → 脚本 build() 出卡组 → playMatch() 无头跑完 → 得到 steps[]
 *        → 播放器只做「按索引渲染快照」，与对局本身完全解耦。
 */
import { playMatch, validateDeck } from '../engine/rules.js';
import { CARDS } from '../engine/cards.gen.js';
import { colorPool, autoBuild, deckToText, textToDeck, normalizeDeck, scoreCard } from '../ai/deckbuild.js';
import { BUILTIN } from '../ai/builtin.js';
import { loadUserScripts, saveUserScript, removeUserScript, compileScript, getTemplate } from '../ai/loader.js';
import { PRECONS } from '../data/precons.js';

const COLORS = ['白', '黑', '红', '绿', '蓝', '紫', '橙', '青', '银', '粉', '金', '灰'];
const LS_DECK = 'lq01.decks.v1';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const S = {
  scripts: [],
  agents: [],
  side: [
    { scriptId: 'aggro', color: '红', deck: '' },
    { scriptId: 'control', color: '白', deck: '' },
  ],
  steps: [],
  idx: 0,
  timer: null,
  playing: false,
  speed: 5,
  build: new Map(),
};

/* ───────────────────────── 初始化 ───────────────────────── */

function init() {
  S.scripts = [...BUILTIN, ...loadUserScripts(), ...S.agents];

  for (const side of [0, 1]) {
    const aiSel = $(`.sel-ai[data-side="${side}"]`);
    const cSel = $(`.sel-color[data-side="${side}"]`);
    aiSel.innerHTML = S.scripts.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
    aiSel.value = S.side[side].scriptId;
    cSel.innerHTML = COLORS.map((c) => `<option value="${c}">${c}</option>`).join('');
    cSel.value = S.side[side].color;

    aiSel.addEventListener('change', () => {
      S.side[side].scriptId = aiSel.value;
      const sc = currentScript(side);
      if (sc.color) {
        S.side[side].color = sc.color;
        cSel.value = sc.color;
      }
      autoDeckFor(side);
      setStatus(`左/右方脚本已切换为「${sc.name}」${sc.color ? `（${sc.color}）` : ''}`);
    });
    cSel.addEventListener('change', () => {
      S.side[side].color = cSel.value;
      autoDeckFor(side);
    });

    // 预组：一键把该副的 30 张填进卡组框，并同步颜色
    const preSel = $(`.sel-pre[data-side="${side}"]`);
    preSel.innerHTML = '<option value="">（脚本 / 自动组卡）</option>'
      + PRECONS.map((p) => `<option value="${p.id}">${p.id} ${p.name}·${p.color}</option>`).join('');
    preSel.addEventListener('change', () => {
      const p = PRECONS.find((x) => x.id === preSel.value);
      if (!p) { autoDeckFor(side); return; }
      cSel.value = p.color;
      S.side[side].color = p.color;
      S.side[side].deck = deckToText(p.deck);
      $(`#deck${side}`).value = S.side[side].deck;
      checkDeck(side, `预组 ${p.id}「${p.name}」${p.chain ? '｜另附进化链 4 张' : ''}`);
      setStatus(`已载入预组「${p.name}」（${p.color}·${p.avatar}）`);
    });
  }

  const saved = safeJSON(localStorage.getItem(LS_DECK)) || {};
  if (saved[0]) S.side[0].deck = saved[0];
  if (saved[1]) S.side[1].deck = saved[1];

  autoDeckFor(0);
  autoDeckFor(1);

  $('#btn-run').addEventListener('click', run);
  $('#btn-play').addEventListener('click', togglePlay);
  $('#btn-step').addEventListener('click', () => { pause(); stepForward(); });
  $('#btn-reset').addEventListener('click', () => { pause(); run(); });
  $('#speed').addEventListener('input', (e) => { S.speed = Number(e.target.value); });
  $('#seed').addEventListener('change', () => { pause(); run(); });

  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${b.dataset.tab}`));
  }));

  $$('[data-act="autobuild"]').forEach((b) => b.addEventListener('click', () => {
    autoDeckFor(Number(b.dataset.side));
    setStatus('已按当前脚本重建卡组');
  }));

  $('#scriptsrc').value = getTemplate();
  $('#btn-save-script').addEventListener('click', onSaveScript);
  $('#btn-load-agents').addEventListener('click', loadAgentScripts);
  $('#scriptname').value = '我的脚本';
  renderScriptList();

  initBuild();

  // 预跑一局，打开页面就有东西看
  run();
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }

function currentScript(side) {
  return S.scripts.find((s) => s.id === S.side[side].scriptId) || S.scripts[0];
}

/* ───────────────────────── 组卡 ───────────────────────── */

function buildPool(color) {
  return colorPool(color).map((c) => ({ ...c, score: scoreCard(c) }));
}

/** 用脚本的 build() 出卡组；脚本没写 / 写坏了就退回自动组卡 */
function deckFromScript(side) {
  const sc = currentScript(side);
  const color = S.side[side].color;
  const pool = buildPool(color);
  let list = null;
  let note = '自动组卡';
  if (typeof sc.build === 'function') {
    try {
      const r = sc.build(pool, { color });
      list = typeof r === 'string' ? textToDeck(r) : r;
      note = `脚本 ${sc.name} 组卡`;
    } catch (e) {
      note = `脚本组卡失败（${e.message}），已回退自动组卡`;
      list = null;
    }
  }
  if (!list || !list.length) { list = autoBuild(pool, { names: 10 }); note = note === '自动组卡' ? '自动组卡' : note; }
  const norm = normalizeDeck(list);
  const v = validateDeck(norm, { min: 25, max: 40 });
  if (!v.ok) {
    const fb = autoBuild(pool, { names: 10 });
    return { list: fb, note: `脚本卡组不合规（${v.errors[0]}）→ 已回退自动组卡`, valid: true };
  }
  return { list: norm, note, valid: true };
}

function autoDeckFor(side) {
  const { list, note } = deckFromScript(side);
  S.side[side].deck = deckToText(list);
  $(`#deck${side}`).value = S.side[side].deck;
  const pre = $(`.sel-pre[data-side="${side}"]`);
  if (pre) pre.value = '';
  checkDeck(side, note);
}

function checkDeck(side, note = '') {
  const list = normalizeDeck(textToDeck($(`#deck${side}`).value));
  const v = validateDeck(list, { min: 25, max: 40 });
  const el = $(`#deckinfo${side}`);
  el.className = 'deckinfo ' + (v.ok ? 'ok' : 'err');
  el.textContent = v.ok
    ? `${v.total} 张 · ${v.color} · ${list.length} 个名目${note ? ' · ' + note : ''}`
    : `✗ ${v.errors.join('；')}`;
  return { list, ok: v.ok };
}

$('#deck0')?.addEventListener?.('input', () => checkDeck(0));
$('#deck1')?.addEventListener?.('input', () => checkDeck(1));

/* ───────────────────────── 开局 ───────────────────────── */

function run() {
  pause();
  const seed = Number($('#seed').value) || 1;

  const decks = [0, 1].map((side) => {
    S.side[side].deck = $(`#deck${side}`).value;
    const r = checkDeck(side);
    if (r.ok) return r.list;
    const fb = autoBuild(buildPool(S.side[side].color), { names: 10 });
    $(`#deck${side}`).value = deckToText(fb);
    checkDeck(side, '（原卡组不合规，已回退）');
    return fb;
  });

  const sa = currentScript(0);
  const sb = currentScript(1);

  try {
    const res = playMatch({
      deckA: decks[0], deckB: decks[1],
      colorA: S.side[0].color, colorB: S.side[1].color,
      seed, scriptA: sa, scriptB: sb,
      nameA: `左·${sa.name}`, nameB: `右·${sb.name}`,
    });
    S.steps = res.steps;
    S.idx = 0;
    render(0, true);
    $('#progress').textContent = `0 / ${S.steps.length}`;
    setStatus(`开局完成：${S.steps.length} 步，种子 ${seed}`);
    play();   // 观战台默认自动开跑
  } catch (e) {
    setStatus(`开局失败：${e.message}`);
    console.error(e);
  }
}

/* ───────────────────────── 播放控制 ───────────────────────── */

function delay() { return Math.max(60, 900 / S.speed); }

function togglePlay() {
  if (!S.steps.length) return;
  if (S.playing) pause(); else play();
}

function play() {
  if (S.idx >= S.steps.length - 1) { S.idx = 0; render(0, true); }
  S.playing = true;
  $('#btn-play').textContent = '⏸ 暂停';
  const tick = () => {
    if (!S.playing) return;
    if (S.idx >= S.steps.length - 1) { pause(); return; }
    stepForward();
    S.timer = setTimeout(tick, delay());
  };
  S.timer = setTimeout(tick, delay());
}

function pause() {
  S.playing = false;
  clearTimeout(S.timer);
  $('#btn-play').textContent = '▶ 播放';
}

function stepForward() {
  if (S.idx >= S.steps.length - 1) return;
  S.idx++;
  render(S.idx);
}

/* ───────────────────────── 渲染 ───────────────────────── */

function render(i, full = false) {
  const step = S.steps[i];
  if (!step) return;
  const snap = step.snap;
  const [a, b] = snap.P;

  // 市场区（金）：5 张公共明牌，购买价写在名字前
  const mk = $('#market');
  const row = $('#marketrow');
  if (mk && row) {
    const list = snap.market || [];
    mk.hidden = list.length === 0;
    row.innerHTML = list.map((c) => {
      const price = c.cost?.n ?? 0;
      return `<span class="mk-card" title="${c.name}"><b>${price}金</b>${shortName(c.name)}</span>`;
    }).join('');
  }

  for (const side of [0, 1]) {
    const p = snap.P[side];
    const root = $(`#p${side}`);
    root.classList.toggle('active', snap.active === side && !snap.over);
    $('.stat.life .v', root).textContent = p.life;
    // 金的资源栏要塞下「金币 + 行动值」两件事，用短写法避免换行
    $('.stat.res .v', root).textContent = p.av !== undefined
      ? `金${p.res}｜行${p.av}`
      : `${p.resName} ${p.res}`;
    $('.stat.deck .v', root).textContent = p.deck;
    const av = $('.avatar', root);
    if (av) {
      $('.aname', av).textContent = p.avatar || '—';
      // 外枢区余量（还没降临的）与除外区张数，直接挂在灵体说明后面
      const zone = p.outerTotal
        ? `　｜外枢 ${p.outerReady}/${p.outerTotal}${p.exile ? ` · 除外 ${p.exile}` : ''}`
        : '';
      $('.adesc', av).textContent = (p.avatarDesc || '') + zone;
      av.title = p.avatarDesc || '';
      av.classList.toggle('used', !!p.avatarUsed);
    }
    $('.handcount', root).textContent = `（${p.handCount}）`;
    renderHand(root, p);
    renderBoard(root, p);
    renderLands(root, p);
  }

  $('#roundtext').textContent = snap.over
    ? (snap.winner >= 0 ? `对局结束 · ${snap.P[snap.winner].name} 获胜` : '对局结束 · 平局')
    : `第 ${snap.round} 轮 · ${snap.P[snap.active].name} 行动`;
  $('#phases').textContent = snap.over ? '' : `${snap.P[snap.active].color} · ${snap.P[snap.active].resName} ${snap.P[snap.active].res}`;

  renderLog(i, full);
  $('#progress').textContent = `${i} / ${S.steps.length - 1}`;
}

const shortName = (n) => (n.length > 7 ? n.slice(0, 7) + '…' : n);

function renderHand(root, p) {
  const box = $('.hand', root);
  box.innerHTML = p.hand.map((c) => cardLine(c, p.color)).join('');
}

function cardLine(c, color) {
  const cost = c.cost ? `${c.cost.k}${c.cost.n}` : '—';
  const st = c.atk != null ? `${c.atk}/${c.imp}/${c.hp}` : (c.type || '');
  return `<div class="card" style="border-left-color:var(--c-${c.color || color || '灰'})" title="${esc(c.text || '')}">
    <span class="cost">${cost}</span>
    <span class="nm">${esc(c.name)}</span>
    <span class="st">${st}</span>
  </div>`;
}

function renderBoard(root, p) {
  const box = $('.board', root);
  box.innerHTML = p.board.map((u) => {
    const cls = ['card', 'unit'];
    if (u.attacked) cls.push('tapped');
    if (u.frozen) cls.push('frozen');
    const kw = u.kw.length ? `<div class="kw">${u.kw.map((k) => `<i>${k}</i>`).join('')}</div>` : '';
    const eq = u.equips?.length ? `<div class="kw"><i>装 ${u.equips.length}</i></div>` : '';
    return `<div class="${cls.join(' ')}" style="border-left-color:var(--c-${p.color})" title="${esc(u.name)}">
      <div class="row1"><span class="name">${esc(u.name)}</span></div>
      <div class="nums">${u.atk} / ${u.imp} / ${u.hp}</div>
      ${kw}${eq}
    </div>`;
  }).join('') || '<div class="label" style="opacity:.5">空场</div>';
}

function renderLands(root, p) {
  const box = $('.lands', root);
  box.innerHTML = (p.lands || []).map((l) => `<span class="land">${esc(l)}</span>`).join('');
}

function renderLog(i, full) {
  const box = $('#log');
  let cur = Number(box.dataset.i ?? -1);
  if (full || i <= cur) { box.innerHTML = ''; cur = -1; }
  for (let k = cur + 1; k <= i; k++) {
    const t = S.steps[k]?.text || '';
    for (const line of String(t).split('\n')) {
      if (!line.trim()) continue;
      const d = document.createElement('div');
      d.className = 'ln ' + classify(line);
      d.textContent = line;
      box.appendChild(d);
    }
  }
  box.dataset.i = String(i);
  box.scrollTop = box.scrollHeight;
}

function classify(l) {
  if (/——/.test(l)) return 'turn';
  if (/获胜|平局|结束/.test(l)) return 'end';
  if (/被破坏|倒下/.test(l)) return 'kill';
  if (/受到|直击|伤害|践踏|疾风/.test(l)) return 'dmg';
  if (/打出|登场|装备|生成|进场/.test(l)) return 'play';
  if (/※|牌库已空|投 /.test(l)) return 'sys';
  return '';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function setStatus(t) { $('#statusline').textContent = t; }

/* ───────────────────────── 脚本编辑 ───────────────────────── */

function onSaveScript() {
  const src = $('#scriptsrc').value;
  const name = ($('#scriptname').value || '').trim() || '未命名脚本';
  try {
    compileScript(src, name);                       // 先编译，报错就不落盘
  } catch (e) {
    $('#scriptinfo').className = 'deckinfo err';
    $('#scriptinfo').textContent = `✗ 编译失败：${e.message}`;
    return;
  }
  saveUserScript(name, src);
  S.scripts = [...BUILTIN, ...loadUserScripts(), ...S.agents];
  refreshScriptSelects();
  renderScriptList();
  $('#scriptinfo').className = 'deckinfo ok';
  $('#scriptinfo').textContent = `✓ 已保存「${name}」，可在左右下拉框里选用`;
}

function refreshScriptSelects() {
  for (const side of [0, 1]) {
    const sel = $(`.sel-ai[data-side="${side}"]`);
    const cur = S.side[side].scriptId;
    sel.innerHTML = S.scripts.map((s) => `<option value="${s.id}">${s.name}${s.user ? '（我的）' : s.agent ? '（模型）' : ''}</option>`).join('');
    sel.value = S.scripts.some((s) => s.id === cur) ? cur : S.scripts[0].id;
    S.side[side].scriptId = sel.value;
  }
}

/** 载入 agents/ 下的 12 个模型脚本；只进内存，不写 localStorage */
async function loadAgentScripts() {
  const btn = $('#btn-load-agents');
  btn.disabled = true;
  try {
    const manifest = await fetch('./agents/agents.json', { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`agents.json ${r.status}`);
      return r.json();
    });
    const loaded = [];
    for (const a of manifest.agents) {
      if (S.agents.some((s) => s.id === `agent:${a.id}`)) continue;
      const src = await fetch(`./${a.file}`, { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`${a.file} ${r.status}`);
        return r.text();
      });
      const compiled = compileScript(src, a.model);
      compiled.id = `agent:${a.id}`;
      compiled.agent = true;
      compiled.model = a.model;
      compiled.color = a.color;
      compiled.agentId = a.id;
      loaded.push(compiled);
    }
    S.agents.push(...loaded);
    S.scripts = [...BUILTIN, ...loadUserScripts(), ...S.agents];
    refreshScriptSelects();
    renderScriptList();
    $('#scriptinfo').className = 'deckinfo ok';
    $('#scriptinfo').textContent = `✓ 已载入 ${loaded.length} 个模型脚本（共 ${S.agents.length} 个），可在左右下拉框选择；脚本只在本页内存中，刷新后需重新载入`;
    setStatus(`已载入 ${loaded.length} 个模型脚本`);
  } catch (e) {
    $('#scriptinfo').className = 'deckinfo err';
    $('#scriptinfo').textContent = `✗ 模型脚本载入失败：${e.message}（请通过 node server.mjs 启动后访问）`;
  } finally {
    btn.disabled = false;
  }
}

function renderScriptList() {
  const box = $('#scriptlist');
  const users = S.scripts.filter((s) => s.user);
  if (!users.length) { box.innerHTML = '<div class="deckinfo">还没有自定义脚本。左侧写一个，点「保存并加载」。</div>'; return; }
  box.innerHTML = '';
  for (const u of users) {
    const row = document.createElement('div');
    row.className = 'scriptitem';
    row.innerHTML = `<div><div class="t">${esc(u.name)}${u.broken ? ' ⚠' : ''}</div><div class="d">${esc(u.desc || '')}</div></div>`;
    const del = document.createElement('button');
    del.className = 'mini';
    del.textContent = '删除';
    del.addEventListener('click', () => {
      removeUserScript(u.key);
      S.scripts = [...BUILTIN, ...loadUserScripts(), ...S.agents];
      refreshScriptSelects();
      renderScriptList();
    });
    const load = document.createElement('button');
    load.className = 'mini';
    load.textContent = '载入';
    load.addEventListener('click', () => { $('#scriptsrc').value = u.src || ''; $('#scriptname').value = u.name; });
    const btns = document.createElement('div');
    btns.style.display = 'flex'; btns.style.gap = '4px';
    btns.append(load, del);
    row.appendChild(btns);
    box.appendChild(row);
  }
}

/* ───────────────────────── 组卡器 ───────────────────────── */

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

function initBuild() {
  $('#fcolor').innerHTML = '<option value="">全色</option>'
    + COLORS.map((c) => `<option value="${c}">${c}</option>`).join('');
  $('#ftype').innerHTML = '<option value="">全类型</option>'
    + [...new Set(CARDS.map((c) => c.type))].map((t) => `<option value="${t}">${t}</option>`).join('');
  $('#fcost').innerHTML = '<option value="">全费用</option>'
    + [1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">${n} 费</option>`).join('');

  for (const sel of ['#searchcard', '#fcolor', '#ftype', '#fcost']) {
    // select 上同时挂 input 与 change：部分环境只触发其一，漏挂会让筛选看起来"没反应"
    $(sel).addEventListener('input', renderPool);
    $(sel).addEventListener('change', renderPool);
  }
  $('#btn-clear').addEventListener('click', () => { S.build.clear(); renderPool(); renderBuild(); });
  $('#btn-to-left').addEventListener('click', () => applyBuildTo(0));
  $('#btn-to-right').addEventListener('click', () => applyBuildTo(1));

  renderPool();
  renderBuild();
}

function renderPool() {
  const q = $('#searchcard').value.trim().toLowerCase();
  const fc = $('#fcolor').value;
  const ft = $('#ftype').value;
  const fk = $('#fcost').value;
  const list = CARDS.filter((c) => !c.unsupported
    && (!fc || c.color === fc)
    && (!ft || c.type === ft)
    && (!fk || (c.cost?.n ?? 0) === Number(fk))
    && (!q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));

  $('#poolcount').textContent = `${list.length} 张`;
  const box = $('#poollist');
  box.innerHTML = '';
  for (const c of list) {
    const n = S.build.get(c.id) || 0;
    const row = document.createElement('div');
    row.className = 'pcard' + (n >= capOf(c.id) ? ' max' : '') + (isMkt(c) ? ' mkt' : '');
    row.style.borderLeftColor = `var(--c-${c.color})`;
    row.innerHTML = `<span class="cost">${c.cost ? c.cost.k + c.cost.n : '—'}</span>
      <span class="nm">${esc(c.name)}</span>
      <span class="st">${c.atk != null ? `${c.atk}/${c.imp}/${c.hp}` : c.type}</span>
      ${isMkt(c) ? '<span class="warn" title="市场牌：额外卡组，只能购买获得">市场</span>' : ''}
      ${c.approx ? '<span class="warn" title="引擎为近似实现（卡面与行为不完全一致）">⚠</span>' : ''}
      <span class="own">${n ? '×' + n : ''}</span>`;
    row.title = `${c.id}　${c.text || ''}`;
    row.addEventListener('click', () => addCard(c.id));
    box.appendChild(row);
  }
}

/** 同名上限：金色【制式铜币】按规则 5.9 是固定牌库预置 ×4 */
const capOf = (id) => (id === 'LQ01-181' ? 4 : 3);
/** 市场牌（LQ01-186~214）属额外卡组，只能在场上购买，不能进主卡组 */
const isMkt = (c) => c.color === '金' && Number(String(c.id).slice(5)) >= 186;

function addCard(id) {
  const card = CARDS.find((c) => c.id === id);
  if (card && isMkt(card)) {
    setStatus('市场牌属额外卡组，只能在场上用金币购买，不能放进主卡组');
    return;
  }
  const n = S.build.get(id) || 0;
  if (n >= capOf(id)) return;
  S.build.set(id, n + 1);
  renderPool();
  renderBuild();
}

function removeCard(id) {
  const n = S.build.get(id) || 0;
  if (n <= 1) S.build.delete(id); else S.build.set(id, n - 1);
  renderPool();
  renderBuild();
}

function renderBuild() {
  const list = [...S.build.entries()].map(([id, n]) => ({ id, n }));
  const box = $('#buildlist');
  box.innerHTML = '';
  if (!list.length) box.innerHTML = '<div class="deckinfo">点左边的卡加入卡组。同名最多 3 张，25~40 张可开局。</div>';
  for (const { id, n } of list) {
    const c = BY_ID.get(id);
    if (!c) continue;
    const row = document.createElement('div');
    row.className = 'brow';
    row.innerHTML = `<span class="n">×${n}</span><span class="nm">${esc(c.name)}</span>`;
    const minus = document.createElement('button');
    minus.className = 'mini';
    minus.textContent = '−';
    minus.addEventListener('click', () => removeCard(id));
    row.appendChild(minus);
    box.appendChild(row);
  }

  const total = list.reduce((s, x) => s + x.n, 0);
  $('#buildtotal').textContent = total;
  $('#buildnames').textContent = list.length;

  // 费用曲线
  const costs = {};
  for (const { id, n } of list) {
    const c = BY_ID.get(id);
    if (!c) continue;
    const k = Math.min(7, c.cost?.n ?? 1);
    costs[k] = (costs[k] || 0) + n;
  }
  const max = Math.max(1, ...Object.values(costs));
  const cbox = $('#curve');
  cbox.innerHTML = '';
  for (let k = 1; k <= 7; k++) {
    const v = costs[k] || 0;
    const slot = document.createElement('div');
    slot.className = 'cslot';
    slot.title = `${k === 7 ? '7+' : k} 费：${v} 张`;
    slot.innerHTML = `<div class="bar" style="height:${Math.max(2, (v / max) * 34)}px"></div><i>${k === 7 ? '7+' : k}</i>`;
    cbox.appendChild(slot);
  }

  const v = validateDeck(list, { min: 25, max: 40 });
  const info = $('#buildinfo');
  info.className = 'deckinfo ' + (v.ok ? 'ok' : (total ? 'err' : ''));
  info.textContent = total
    ? (v.ok ? `${total} 张 · ${v.color} · ${list.length} 个名目 ✓ 可开局` : v.errors.join('；'))
    : '空卡组';
}

function applyBuildTo(side) {
  const list = [...S.build.entries()].map(([id, n]) => ({ id, n }));
  const v = validateDeck(list, { min: 25, max: 40 });
  if (!v.ok) { setStatus(`卡组不合规：${v.errors[0]}`); return; }
  S.side[side].color = v.color;
  $(`.sel-color[data-side="${side}"]`).value = v.color;
  S.side[side].deck = deckToText(list);
  $(`#deck${side}`).value = S.side[side].deck;
  checkDeck(side, '来自组卡器');
  setStatus(`已载入${side === 0 ? '左' : '右'}方：${list.reduce((s, x) => s + x.n, 0)} 张 · ${v.color}`);
}

/* 输入即校验卡组 */
document.addEventListener('input', (e) => {
  if (e.target.id === 'deck0') checkDeck(0);
  if (e.target.id === 'deck1') checkDeck(1);
});

init();
