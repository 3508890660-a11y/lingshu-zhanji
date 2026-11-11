/**
 * avatars.js —— 灵体卡（LQ01-215~247）的引擎侧数据。
 *
 * 33 张灵体各有一条**被动**与一条**启动能力**。规则书给的是自然语言，
 * 这里翻成 6 类钩子 + 一套"不指定目标的启动效果"：
 *
 *   被动钩子
 *     auraAtk{n}        你的单位进场时 +n ATK
 *     auraHp{n}         你的单位进场时 +n 耐久
 *     auraKw{kw}        你的单位进场时获得关键词
 *     turnStartRes{n}   回合开始额外 +n 资源
 *     turnStartDraw{n}  回合开始额外抽 n
 *     turnStartToken    回合开始生成一个衍生物
 *     lifeDraw          生命卡移入损伤区时抽 1（每回合 1 次）
 *     damagedAtk{n}     你的单位每次受伤，本回合 ATK+n
 *     deathDraw{n}      你的单位被破坏时抽 n（每回合 1 次）
 *     deathRes{n}       你的单位被破坏时 +n 资源
 *     diceBonus{n}      骰池每回合多投 n 枚（紫）
 *     enterAtk{n}       你打出一张牌时，全体 +n ATK（本回合）
 *     secondCardDraw    你本回合第 2 张牌结算后抽 1
 *
 *   启动能力（每回合 1 次，不指定目标）
 *     cost: {k:'AP'|'res', n} 或 null（免费）
 *     effects: 复用卡牌效果 DSL
 *
 * ⚠ 凡原卡面依赖未实装系统（升灵／魂装／市场／潮汐／连击）的，这里给的是
 *    **保功能、弃细节**的等价物，逐条在 README §7.3 列出，不假装是原效果。
 */

const A = (id, name, color, branch, passive, cost, effects, desc) => {
  // 时机：只有「本回合有效」的群体增益必须等到铺完场再开，其余一律开局先开
  const timing = effects.some((e) => e.do === 'rally') ? 'late' : 'early';
  return { id, name, color, branch, passive, active: { cost, effects, timing }, desc };
};

export const AVATARS = [
  // ── 白 ──
  A('LQ01-215', '圣殿指挥官·奥蕾莉亚', '白', 'A', [{ t: 'auraKw', kw: '守护1' }],
    { k: 'AP', n: 1 }, [{ do: 'token', n: 1, name: '士兵', atk: 1, imp: 1, hp: 1 }],
    '被动：你的单位获得守护1｜启动 1AP：生成 1 个士兵'),
  A('LQ01-216', '殉道圣女·塞西莉亚', '白', 'B', [{ t: 'lifeDraw' }],
    { k: 'AP', n: 2 }, [{ do: 'heal', n: 1 }, { do: 'draw', n: 1 }],
    '被动：生命卡受伤时抽 1（每回合 1 次）｜启动 2AP：回复 1 并抽 1'),
  A('LQ01-217', '秩序谐律师·雷吉乌斯', '白', 'C', [{ t: 'auraHp', n: 1 }],
    { k: 'AP', n: 2 }, [{ do: 'buffAll', atk: 0, hp: 1 }],
    '被动：你的单位 +0/+1｜启动 2AP：全体 +0/+1'),

  // ── 黑 ──
  A('LQ01-218', '痛苦工匠·莫德里斯', '黑', 'A', [{ t: 'damagedAtk', n: 1 }],
    null, [{ do: 'res', n: 3 }],
    '被动：你的单位每次受伤，本回合 ATK+1｜启动（免费）：获得 3 牺牲值（以磨损自身为代价的抽象）'),
  A('LQ01-219', '亡灵君主·泽拉斯', '黑', 'B', [{ t: 'deathDraw', n: 1 }],
    null, [{ do: 'revive', sr: 2 }],
    '被动：你的单位被破坏时抽 1（每回合 1 次）｜启动（免费）：从弃牌区捞回 1 个 SR≤2 的单位（横置）'),
  A('LQ01-220', '深渊魂铸师·莫尔菲斯', '黑', 'C', [{ t: 'deathRes', n: 1 }],
    null, [{ do: 'mill', n: 2 }, { do: 'res', n: 2 }],
    '被动：你的单位被破坏时 +1 牺牲值｜启动（免费）：磨 2 并 +2 牺牲值'),

  // ── 红 ──
  A('LQ01-221', '狂战士·拉格纳', '红', 'A', [{ t: 'auraKw', kw: '冲锋' }],
    { k: 'res', n: 1 }, [{ do: 'rally', imp: 1 }],
    '被动：你的单位获得冲锋｜启动 1 激情：全体 IMP+1（本回合）'),
  A('LQ01-222', '火焰法师·伊格尼斯', '红', 'B', [{ t: 'auraAtk', n: 1 }],
    { k: 'res', n: 2 }, [{ do: 'aoe', n: 2, side: 'enemy' }],
    '被动：你的单位 +1 ATK｜启动 2 激情：对所有敌方单位造成 2 点伤害'),
  A('LQ01-223', '战吼指挥官·卡恩', '红', 'C', [{ t: 'warcryDouble' }],
    { k: 'res', n: 1 }, [{ do: 'draw', n: 1 }],
    '被动：你的「战吼」触发两次｜启动 1 激情：抽 1'),

  // ── 绿 ──
  A('LQ01-224', '森林先知·盖亚', '绿', 'A', [{ t: 'turnStartRes', n: 1 }],
    null, [{ do: 'res', n: 2 }],
    '被动：回合开始额外 +1 法力｜启动（免费）：+2 法力（展示牌库顶置入地标的抽象）'),
  A('LQ01-225', '远古巨兽·贝希摩斯', '绿', 'B', [{ t: 'auraKw', kw: '践踏' }],
    { k: 'res', n: 2 }, [{ do: 'pumpBest', mul: 2 }],
    '被动：你的单位获得践踏｜启动 2 法力：你 ATK 最高的单位本回合 ATK 翻倍'),
  A('LQ01-226', '万物母神·盖亚', '绿', 'C', [{ t: 'auraHp', n: 1 }],
    { k: 'res', n: 2 }, [{ do: 'draw', n: 1 }, { do: 'res', n: 1 }],
    '被动：你的单位 +0/+1｜启动 2 法力：抽 1 并 +1 法力'),

  // ── 蓝 ──
  A('LQ01-227', '大法师·梅林', '蓝', 'A', [{ t: 'auraKw', kw: '守护1' }],
    null, [{ do: 'draw', n: 1 }],
    '被动：你的单位获得守护1｜启动（免费）：抽 1'),
  A('LQ01-228', '智者·阿基米德', '蓝', 'B', [{ t: 'auraHp', n: 1 }],
    null, [{ do: 'draw', n: 1 }],
    '被动：你的单位 +0/+1｜启动（免费）：抽 1'),
  A('LQ01-229', '时空术士·克罗诺', '蓝', 'C', [{ t: 'turnStartDraw', n: 1 }],
    null, [{ do: 'freeze' }],
    '被动：回合开始额外抽 1｜启动（免费）：冻结 1 个敌方单位'),

  // ── 紫 ──
  A('LQ01-230', '骰子大师·卡奥斯', '紫', 'A', [{ t: 'diceBonus', n: 2 }],
    null, [{ do: 'res', n: 2 }],
    '被动：骰池每回合多投 2 枚｜启动（免费）：+2 灵脉'),
  A('LQ01-231', '虚空领主·奈亚斯', '紫', 'B', [{ t: 'turnStartRes', n: 2 }],
    null, [{ do: 'res', n: 3 }],
    '被动：回合开始额外 +2 灵脉｜启动（免费）：+3 灵脉'),
  A('LQ01-232', '混沌编织者·艾恩', '紫', 'C', [{ t: 'auraAtk', n: 1 }, { t: 'tokenMaterial' }],
    { k: 'res', n: 1 }, [{ do: 'token', n: 1, name: '虚空衍生物', atk: 0, imp: 1, hp: 1 }],
    '被动：你的单位 +1 ATK｜启动 1 灵脉：生成 1 个虚空衍生物'),

  // ── 橙 ──
  A('LQ01-233', '淬炼大师·弗吉奥', '橙', 'A', [{ t: 'quenchCut' }],
    { k: 'res', n: 1 }, [{ do: 'res', n: 2 }],
    '被动：你的「淬炼」需求 −1（满 2 即触发）｜启动 1 锻造：锻造值 +2'),
  A('LQ01-234', '武器大师·艾琳', '橙', 'B', [{ t: 'turnStartRes', n: 1 }],
    null, [{ do: 'res', n: 2 }],
    '被动：回合开始额外 +1 锻造｜启动（免费）：锻造值 +2'),
  A('LQ01-235', '锻造网络·中枢AI', '橙', 'C', [{ t: 'auraAtk', n: 1 }],
    { k: 'res', n: 2 }, [{ do: 'res', n: 3 }],
    '被动：你的单位 +1 ATK｜启动 2 锻造：锻造值 +3'),

  // ── 青 ──
  A('LQ01-236', '潮汐唤者·温蒂妮', '青', 'A', [{ t: 'turnStartRes', n: 1 }],
    null, [{ do: 'draw', n: 1 }],
    '被动：回合开始额外 +1 法力｜启动（免费）：抽 1'),
  A('LQ01-237', '风暴织者·泽菲', '青', 'B', [{ t: 'secondCardDraw' }],
    { k: 'res', n: 1 }, [{ do: 'draw', n: 1 }],
    '被动：你本回合第 2 张牌结算后抽 1｜启动 1 法力：抽 1'),
  A('LQ01-238', '谐律潮汐·调和师', '青', 'C', [{ t: 'auraHp', n: 1 }],
    { k: 'res', n: 2 }, [{ do: 'res', n: 2 }, { do: 'draw', n: 1 }],
    '被动：你的单位 +0/+1｜启动 2 法力：+2 法力并抽 1'),

  // ── 银 ──
  A('LQ01-239', '银翼元帅·艾莉丝', '银', 'A', [{ t: 'auraAtk', n: 1 }],
    null, [{ do: 'token', n: 1, name: '银翼新兵', atk: 1, imp: 1, hp: 2 }],
    '被动：你的单位 +1 ATK｜启动（免费）：生成 1 个银翼新兵'),
  A('LQ01-240', '谐律大师·卢恩', '银', 'B', [{ t: 'auraHp', n: 1 }],
    null, [{ do: 'buffAll', atk: 1, hp: 0 }],
    '被动：你的单位 +0/+1｜启动（免费）：全体 +1 ATK（本回合）'),
  A('LQ01-241', '银翼方阵长·诺娃', '银', 'C', [{ t: 'auraKw', kw: '守卫' }, { t: 'tokenMaterial' }],
    { k: 'res', n: 1 }, [{ do: 'token', n: 1, name: '银翼新兵', atk: 1, imp: 1, hp: 2 }],
    '被动：你的单位获得守卫｜启动 1 共鸣：生成 1 个银翼新兵'),

  // ── 粉 ──
  A('LQ01-242', '魂刃少女·蕾 Lv0·初醒', '粉', 'A', [{ t: 'auraAtk', n: 1 }],
    null, [{ do: 'ride' }],
    '被动：你的单位 +1 ATK｜启动（免费）：骑升一级（灵压上限 8）'),
  A('LQ01-243', '魂缚姬·莉莉丝 Lv0', '粉', 'B', [{ t: 'deathDraw', n: 1 }],
    null, [{ do: 'dmg', n: 2, target: 'enemyUnit' }],
    '被动：你的单位被破坏时抽 1（每回合 1 次）｜启动（免费）：对 1 个敌方单位造成 2 点伤害'),
  A('LQ01-244', '魂装姬·艾莉西亚 Lv0', '粉', 'C', [{ t: 'auraHp', n: 1 }],
    null, [{ do: 'buffAll', atk: 1, hp: 1 }],
    '被动：你的单位 +0/+1｜启动（免费）：全体 +1/+1（本回合）'),

  // ── 金 ──
  A('LQ01-245', '商业巨子·摩根', '金', 'A', [{ t: 'turnStartRes', n: 1 }],
    null, [{ do: 'gold', n: 3 }],
    '被动：回合开始额外 +1 金｜启动（免费）：产 3 金'),
  A('LQ01-246', '即刻配送·艾克丝', '金', 'B', [{ t: 'auraAtk', n: 1 }],
    null, [{ do: 'res', n: 2 }],
    '被动：你的单位 +1 ATK｜启动（免费）：产 2 金'),
  A('LQ01-247', '极简主义者·莱恩', '金', 'C', [{ t: 'turnStartRes', n: 2 }],
    null, [{ do: 'draw', n: 1 }],
    '被动：回合开始额外 +2 金｜启动（免费）：抽 1'),
];

export const AVATAR_BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

/** 预组用的默认灵体：金色/其余取 A，黑取 B（与 §9.2 一致） */
export function defaultAvatar(color, branch) {
  const b = branch || (color === '黑' ? 'B' : 'A');
  return AVATARS.find((a) => a.color === color && a.branch === b)
    || AVATARS.find((a) => a.color === color)
    || AVATARS[0];
}
