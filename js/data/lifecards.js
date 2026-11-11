/**
 * lifecards.js —— 编外卡 SM01「生命卡」的引擎侧数据。
 *
 * 与卡表 §10.2 一一对应：每色 4 张特效 + 共用 16 张基础。
 * 所有特效都是**无指定目标**的小效果，因为受伤触发时没有"选择目标"的时机——
 * 这条限制是刻意的：生命卡是挨打时的小回响，不是第二个卡组。
 */
export const LIFE_TOTAL = 20;
export const LIFE_BASE = { id: 'SM01-001', name: '深红之核', effects: [] };

const S = (id, name, ...effects) => ({ id, name, effects });

export const LIFE_SPECIALS = {
  白: [
    S('SM01-002', '圣痕残页', { do: 'draw', n: 1 }),
    S('SM01-003', '殉难印记', { do: 'heal', n: 1 }),
    S('SM01-004', '救赎微光', { do: 'buffAll', atk: 0, hp: 1 }),
    S('SM01-005', '军团誓约', { do: 'token', n: 1, name: '士兵', atk: 1, imp: 1, hp: 1 }),
  ],
  黑: [
    S('SM01-006', '痛楚回响', { do: 'res', n: 2 }),
    S('SM01-007', '骨灰余温', { do: 'mill', n: 1 }, { do: 'draw', n: 1 }),
    S('SM01-008', '夜祷残页', { do: 'dmg', n: 1, target: 'face' }),
    S('SM01-009', '尸衣碎片', { do: 'buffAll', atk: 1, hp: 0 }),
  ],
  红: [
    S('SM01-010', '孽血烙印', { do: 'draw', n: 1 }),
    S('SM01-011', '赤棘鳞甲', { do: 'heal', n: 1 }),
    S('SM01-012', '狂热印记', { do: 'res', n: 1 }),
    S('SM01-013', '殉道血誓', { do: 'dmg', n: 2, target: 'face' }),
  ],
  绿: [
    S('SM01-014', '腐叶层', { do: 'res', n: 1 }),
    S('SM01-015', '年轮刻痕', { do: 'buffAll', atk: 1, hp: 1 }),
    S('SM01-016', '藤蔓缠绕', { do: 'freeze' }),
    S('SM01-017', '地脉余响', { do: 'draw', n: 1 }),
  ],
  蓝: [
    S('SM01-018', '折角书页', { do: 'draw', n: 1 }),
    S('SM01-019', '冰晶残片', { do: 'freeze' }),
    S('SM01-020', '演算残稿', { do: 'draw', n: 2 }),
    S('SM01-021', '逆流书签', { do: 'bounce' }),
  ],
  紫: [
    S('SM01-022', '混沌尘', { do: 'res', n: 1 }),
    S('SM01-023', '骰骨碎片', { do: 'draw', n: 1 }),
    S('SM01-024', '虚空裂隙', { do: 'dmg', n: 1, target: 'face' }),
    S('SM01-025', '万面残片', { do: 'res', n: 2 }),
  ],
  橙: [
    S('SM01-026', '淬渣', { do: 'res', n: 1 }),
    S('SM01-027', '炉灰', { do: 'draw', n: 1 }),
    S('SM01-028', '断刃残片', { do: 'buffAll', atk: 1, hp: 0 }),
    S('SM01-029', '齿轮咬合', { do: 'res', n: 2 }),
  ],
  青: [
    S('SM01-030', '潮沫', { do: 'draw', n: 1 }),
    S('SM01-031', '贝壳回响', { do: 'res', n: 1 }),
    S('SM01-032', '漩涡残迹', { do: 'dmg', n: 1, target: 'unit' }),
    S('SM01-033', '月汐碎光', { do: 'heal', n: 1 }),
  ],
  银: [
    S('SM01-034', '方阵残旗', { do: 'token', n: 1, name: '银翼新兵', atk: 1, imp: 1, hp: 2 }),
    S('SM01-035', '共鸣余音', { do: 'draw', n: 1 }),
    S('SM01-036', '断裂枪头', { do: 'buffAll', atk: 1, hp: 0 }),
    S('SM01-037', '誓约刻印', { do: 'buffAll', atk: 0, hp: 1 }),
  ],
  粉: [
    S('SM01-038', '断线', { do: 'draw', n: 1 }),
    S('SM01-039', '缎屑', { do: 'heal', n: 1 }),
    S('SM01-040', '魂火残烬', { do: 'dmg', n: 1, target: 'face' }),
    S('SM01-041', '织痕', { do: 'buffAll', atk: 1, hp: 1 }),
  ],
  金: [
    S('SM01-042', '旧账页', { do: 'res', n: 1 }),
    S('SM01-043', '铜板磨痕', { do: 'draw', n: 1 }),
    S('SM01-044', '当票存根', { do: 'buffAll', atk: 1, hp: 0 }),
    S('SM01-045', '家徽残片', { do: 'heal', n: 1 }),
  ],
};

export function buildLifeDeck(color, rng) {
  const sp = LIFE_SPECIALS[color] || [];   // 灰色是支援池，没有专属生命卡 → 20 张全基础
  const arr = [];
  for (let i = 0; i < LIFE_TOTAL - sp.length; i++) arr.push(LIFE_BASE);
  for (const c of sp) arr.push(c);
  return rng.shuffle(arr);
}
