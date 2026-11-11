// hy4 · 千叠锻炉·联结滚雪  ——  橙色（锻造）中速构筑
// 编译方式：new Function('api', src + '; return {build, choose, meta}')
// 纯 JS 源码，零依赖；不修改 view/moves，choose/block 只返回传入数组里的对象引用。

var meta = {
  name: 'hy4 · 千叠锻炉·联结滚雪',
  desc: '执行模型 hy4std；颜色 橙；策略 千叠锻炉·联结滚雪；装备优先贴单位、锻造区只补 1~2 件、升灵前置接管推血的中速构筑',
  id: 'model:hy4',
  color: '橙'
};

// 30 张：橙 24 ＋ 灰 6；12 个名目，同名均 ≤3；曲线 1–2 费 23｜3–4 费 7｜5–6 费 0｜7+ 0
function build(pool) {
  var plan = [
    ['LQ01-109', 3], ['LQ01-110', 3], ['LQ01-111', 3], ['LQ01-113', 3],
    ['LQ01-114', 3], ['LQ01-119', 2], ['LQ01-123', 3], ['LQ01-116', 3],
    ['LQ01-117', 2], ['LQ01-118', 2], ['LQ01-284', 2], ['LQ01-286', 1]
  ];
  var arr = Array.isArray(pool) ? pool : [];
  var have = Object.create(null);
  var i, c;
  for (i = 0; i < arr.length; i++) {
    c = arr[i];
    if (c && c.id) have[c.id] = c;
  }
  var out = [], total = 0, seen = Object.create(null), j, id, n;
  for (j = 0; j < plan.length && total < 30; j++) {
    id = plan[j][0]; n = plan[j][1];
    if (!have[id] || seen[id]) continue;
    seen[id] = 1;
    if (n > 3) n = 3;
    if (total + n > 30) n = 30 - total;
    if (n > 0) { out.push({ id: id, n: n }); total += n; }
  }
  // 兜底：若个别硬编码卡号不在 pool，用 pool 里的橙/灰卡补足到 30，避免依赖引擎回退
  if (total < 30) {
    for (i = 0; i < arr.length && total < 30; i++) {
      c = arr[i];
      if (!c || !c.id || seen[c.id]) continue;
      if (c.color && c.color !== '橙' && c.color !== '灰') continue;
      seen[c.id] = 1;
      out.push({ id: c.id, n: 1 });
      total += 1;
    }
  }
  return out;
}

function choose(view, moves) {
  // 空数组 / 非法入参：不抛异常，安全兜底
  if (!Array.isArray(moves) || moves.length === 0) {
    return moves ? moves[moves.length - 1] : undefined;
  }
  var me = (view && view.me) ? view.me : {};
  var opp = (view && view.opp) ? view.opp : {};
  var res = (typeof me.res === 'number') ? me.res : 0;
  var forge = (typeof me.forge === 'number') ? me.forge : 0;
  var board = Array.isArray(me.board) ? me.board : [];
  var oppBoard = Array.isArray(opp.board) ? opp.board : [];
  var hand = Array.isArray(me.hand) ? me.hand : [];
  var avatarUsed = !!(me.avatar && me.avatar.used);

  // 按类型分组，保存的是原数组里的对象引用（不 sort、不修改 moves）
  var byType = Object.create(null), i, m;
  for (i = 0; i < moves.length; i++) {
    m = moves[i];
    if (!m || typeof m.type !== 'string') continue;
    if (!byType[m.type]) byType[m.type] = [];
    byType[m.type].push(m);
  }
  var avatarMoves = byType['avatar'] || [];
  var ascendMoves = byType['ascend'] || [];
  var playMoves = byType['play'] || [];
  var attackMoves = byType['attack'] || [];
  var passMoves = byType['pass'] || [];

  // 1) 灵体启动：弗吉奥「1 锻造 → 锻造值 +2」净赚资源，先于出牌与攻击；used 双保险
  if (!avatarUsed && avatarMoves.length && res >= 1) return avatarMoves[0];

  // 2) 升灵前置：外枢灵体是本套唯一高 IMP 推血源，降临的 +5 锻造 / 全体增益
  //    在铺场之前结算才当回合可用；场面 ≥2 才换，避免献祭后无装备载体
  if (ascendMoves.length && board.length >= 2) return ascendMoves[0];

  // 3) 出牌统一评分：装备贴单位 ≫ 铺低费单位 > 过牌/清场 > 补锻造区
  //    forge 不再单独前置吞装备；锻造区只补到 <2 件，避免锻造值溢出无高费卡消费
  var best = null, bestS = -1e9, pm, idx, card, cn, text, s;
  for (i = 0; i < playMoves.length; i++) {
    pm = playMoves[i];
    if (!pm) continue;
    if (pm.mode === 'forge') {
      s = forge < 2 ? 6 : 1;
    } else {
      idx = pm.i;
      card = (typeof idx === 'number' && idx >= 0 && idx < hand.length) ? hand[idx] : null;
      s = 0;
      if (card) {
        cn = (card.cost && typeof card.cost.n === 'number') ? card.cost.n : 2;
        s += (4 - cn) * 2;
        text = (typeof card.text === 'string') ? card.text
             : (typeof card.name === 'string' ? card.name : '');
        // 核心修复：装备贴到单位，让冲锋 / 身材 / 耐久当回合生效
        if (card.type === '装备' && pm.target !== undefined && pm.target !== null) s += 12;
        if (card.type === '单位') s += 5;
        if (/抽/.test(text)) s += 3;
        if (/所有敌方单位|对所有/.test(text) && oppBoard.length >= 2) s += 4;
      }
      if (pm.target !== undefined && pm.target !== null) s += 2;
    }
    if (s > bestS) { bestS = s; best = pm; }
  }
  if (best) return best;

  // 4) 斩杀/推血：能打脸先打脸，否则打单位清守卫（守卫强制目标由 legalMoves 过滤）
  var face = null, unitAtk = null, am;
  for (i = 0; i < attackMoves.length; i++) {
    am = attackMoves[i];
    if (!am) continue;
    if (am.target === 'face') { face = am; break; }
    if (!unitAtk) unitAtk = am;
  }
  if (face) return face;
  if (unitAtk) return unitAtk;

  // 5) 兜底：所有想做的动作都不再可选（或为未知类型）→ pass
  if (passMoves.length) return passMoves[0];
  return moves[moves.length - 1];
}

function block(view, bmoves) {
  if (!Array.isArray(bmoves) || bmoves.length === 0) {
    return bmoves ? bmoves[bmoves.length - 1] : undefined;
  }
  var noBlock = null, blockMove = null, i, b;
  for (i = 0; i < bmoves.length; i++) {
    b = bmoves[i];
    if (!b) continue;
    if (b.type === 'noBlock') noBlock = b;
    else if (b.type === 'block' && !blockMove) blockMove = b;
  }
  // 橙守卫墙耐久高、专为承伤设计：有阻挡窗口就挡
  if (blockMove) return blockMove;
  if (noBlock) return noBlock;
  return bmoves[bmoves.length - 1];
}
