/**
 * precons.js —— 第一弹 11 副预组的卡组清单（卡表 §9.3 的引擎侧镜像）。
 *
 * 约定：
 *   - 主卡组一律 30 张（粉 30＋进化链 4，引擎暂不实现进化链，只装主卡组）；
 *   - 金为 10 固定 ＋ 30 市场 ＝ 40 张；
 *   - 全部是 LQ01 的重印，没有独占卡。
 */
const R = (from, to, n = 3) => {
  const out = [];
  for (let i = from; i <= to; i++) out.push({ id: `LQ01-${String(i).padStart(3, '0')}`, n });
  return out;
};

export const PRECONS = [
  {
    id: 'YD01-01', name: '秩序之盾', color: '白', avatar: '圣殿指挥官·奥蕾莉亚',
    deck: R(1, 10),
  },
  {
    id: 'YD01-02', name: '永夜葬列', color: '黑', avatar: '亡灵君主·泽拉斯',
    deck: [...R(19, 24), ...R(29, 32)],
  },
  {
    id: 'YD01-03', name: '赤潮', color: '红', avatar: '狂战士·拉格纳',
    deck: R(37, 46),
  },
  {
    id: 'YD01-04', name: '地脉先觉', color: '绿', avatar: '森林先知·盖亚',
    deck: R(55, 64),
  },
  {
    id: 'YD01-05', name: '静海书库', color: '蓝', avatar: '大法师·梅林',
    deck: R(73, 82),
  },
  {
    id: 'YD01-06', name: '万面骰', color: '紫', avatar: '骰子大师·卡奥斯',
    deck: R(91, 100),
  },
  {
    id: 'YD01-07', name: '千叠锻炉', color: '橙', avatar: '淬炼大师·弗吉奥',
    deck: R(109, 118),
  },
  {
    id: 'YD01-08', name: '潮汐回廊', color: '青', avatar: '潮汐唤者·温蒂妮',
    deck: R(127, 136),
  },
  {
    id: 'YD01-09', name: '方阵起誓', color: '银', avatar: '银翼元帅·艾莉丝',
    // 门槛配方 8/11/8/2/1 —— 不是 10 名目 ×3
    deck: [
      { id: 'LQ01-145', n: 3 }, { id: 'LQ01-146', n: 3 }, { id: 'LQ01-147', n: 2 },
      { id: 'LQ01-149', n: 3 }, { id: 'LQ01-150', n: 3 }, { id: 'LQ01-151', n: 3 }, { id: 'LQ01-154', n: 2 },
      { id: 'LQ01-152', n: 3 }, { id: 'LQ01-156', n: 3 }, { id: 'LQ01-161', n: 2 },
      { id: 'LQ01-153', n: 1 }, { id: 'LQ01-158', n: 1 },
      { id: 'LQ01-162', n: 1 },
    ],
  },
  {
    id: 'YD01-10', name: '魂刃初醒', color: '粉', avatar: '魂刃少女·蕾 Lv0',
    deck: R(163, 172),   // ＋进化链 LQ01-248~251（引擎未实现骑升链，仅列于此）
    chain: ['LQ01-248', 'LQ01-249', 'LQ01-250', 'LQ01-251'],
  },
  {
    id: 'YD01-11', name: '市井学徒', color: '金', avatar: '商业巨子·摩根',
    // 规则 5.9：金的**主卡组只有 10 张固定牌**；市场牌库（30~60 张）属**额外卡组**，
    // 靠「购买」而非「抽牌」进入手牌。此前把 30 张市场牌塞进主卡组＝让金付两次钱。
    deck: [
      { id: 'LQ01-181', n: 4 }, { id: 'LQ01-182', n: 2 }, { id: 'LQ01-183', n: 1 },
      { id: 'LQ01-184', n: 2 }, { id: 'LQ01-185', n: 1 },
    ],
    market: R(186, 214, 1),   // 29 个名目，每名目 1 张 ＝ 市场牌库
  },
];

export const PRECON_BY_COLOR = Object.fromEntries(PRECONS.map((p) => [p.color, p]));
