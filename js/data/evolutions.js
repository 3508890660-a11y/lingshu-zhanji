/**
 * 粉色专属「进化链」附属卡组（规则 1.1 / 3.13 / 5.11）。
 *
 * - 每条链 4 张：Lv1~Lv4，规则上置于额外卡组区（场上对应「解放区」），
 *   但卡位从主卡组出（粉主卡组 30 ＋ 进化链 4 ＝ 34 卡位）。
 * - 骑升：费用阶段把下一阶叠放于当前灵体上，灵压随之上跳（0/2/4/6/8）。
 * - 原灵体成为「灵魂」＝ 1 个活跃魂装源，叠在灵体下方。
 * - 灵体 ATK/IMP 只有 Lv2 起才有（Lv2 起可亲自作战）。
 */
export const EVOLUTIONS = {
  // 流派 A：极速解放 —— 蕾
  'LQ01-242': [
    {
      id: 'LQ01-248', name: '蕾 Lv1·觉醒', lv: 1, pressure: 2, atk: 1, imp: 1,
      effects: [{ do: 'rideBuff', kw: '冲锋' }],
      desc: '骑升时：本回合蕾获得冲锋',
    },
    {
      id: 'LQ01-249', name: '蕾 Lv2·临战', lv: 2, pressure: 4, atk: 3, imp: 2,
      effects: [],
      desc: '蕾可亲自作战（每回合 1 次）',
    },
    {
      id: 'LQ01-250', name: '蕾 Lv3·寒风', lv: 3, pressure: 6, atk: 4, imp: 3,
      effects: [{ do: 'avatarPierce', n: 1 }],
      desc: '蕾的攻击结算后，若目标为灵体，追加 1 点冲击',
    },
    {
      id: 'LQ01-251', name: '蕾 Lv4·终焉', lv: 4, pressure: 8, atk: 6, imp: 4,
      effects: [{ do: 'avatarDouble', n: 2 }],
      desc: '蕾每回合可亲自攻击两次；「疾风」结算两次',
    },
  ],
  // 流派 B：灵魂控制 —— 莉莉丝
  'LQ01-243': [
    {
      id: 'LQ01-252', name: '莉莉丝 Lv1·缠缚', lv: 1, pressure: 2, atk: 1, imp: 1,
      effects: [{ do: 'soulDraw', n: 1 }],
      desc: '骑升时：耗灵魂 1，抽 1',
    },
    {
      id: 'LQ01-253', name: '莉莉丝 Lv2·渴血', lv: 2, pressure: 4, atk: 2, imp: 2,
      effects: [{ do: 'soulBurn', n: 1 }],
      desc: '你每次耗灵魂，对对手造成 1 点伤害',
    },
    {
      id: 'LQ01-254', name: '莉莉丝 Lv3·锁狱', lv: 3, pressure: 6, atk: 3, imp: 3,
      effects: [{ do: 'soulDiscount', n: 1 }],
      desc: '你的「耗灵魂」效果费用 −1（最低 0）',
    },
    {
      id: 'LQ01-255', name: '莉莉丝 Lv4·永夜', lv: 4, pressure: 8, atk: 4, imp: 4,
      effects: [{ do: 'soulHeal', n: 1 }],
      desc: '每回合首次耗灵魂时，将 1 张损伤区生命卡移回生命卡组',
    },
  ],
  // 流派 C：魂装双轨 —— 艾莉西亚
  'LQ01-244': [
    {
      id: 'LQ01-256', name: '艾莉西亚 Lv1·初织', lv: 1, pressure: 2, atk: 1, imp: 1,
      effects: [{ do: 'tutorAttire', n: 1 }],
      desc: '骑升时：从牌库检索 1 张「魂装」卡',
    },
    {
      id: 'LQ01-257', name: '艾莉西亚 Lv2·双轨', lv: 2, pressure: 4, atk: 2, imp: 2,
      effects: [{ do: 'soulCap', n: 1 }],
      desc: '魂装升格时，魂装源上限 +1',
    },
    {
      id: 'LQ01-258', name: '艾莉西亚 Lv3·华缎', lv: 3, pressure: 6, atk: 3, imp: 3,
      effects: [{ do: 'soulAura', n: 1 }],
      desc: '你的魂装外枢灵体 ATK/IMP 各 +1',
    },
    {
      id: 'LQ01-259', name: '艾莉西亚 Lv4·万衣', lv: 4, pressure: 8, atk: 4, imp: 4,
      effects: [{ do: 'soulLegend', n: 4 }],
      desc: '可召唤阶级 4 传说魂装外枢灵体',
    },
  ],
};

export const evolutionFor = (avatarId) => (EVOLUTIONS[avatarId] || []).map((c) => ({ ...c }));
export const isPinkAvatar = (avatarId) => Object.prototype.hasOwnProperty.call(EVOLUTIONS, avatarId);
