/**
 * market.js —— 金色市场牌库（规则 5.9 的「额外卡组」）。
 *
 * 市场牌不进主卡组：金色主卡组只有 10 张固定牌，其余全部靠**购买**进入手牌。
 * 这里给的是默认市场牌库（第一弹 LQ01-186~214，29 个名目各 1 张）。
 */
export const GOLD_MARKET = (() => {
  const out = [];
  for (let i = 186; i <= 214; i++) out.push({ id: `LQ01-${String(i).padStart(3, '0')}`, n: 1 });
  return out;
})();
