> ⚠ **本文件已作废（2026-11-06）**：本轮任务说明要求子代理读 `README.md` 第 4/5 节与卡表原文，而这两份材料含平衡实测，导致 11/12 模型选了同一主色。现行任务说明是 `agents/brief/04_任务说明.md`，资料包为 `agents/brief/`。本文件仅作历史留档，不要再用于派发任务。

# 12 模型「颜色构筑」AI 脚本任务说明（灵枢战纪）

> 本轮目标：每个模型先读**灵枢战纪的基础规则**与**第一弹完整卡表**，自行选择 1 个颜色作为主色，构筑一副合规卡组，再把卡组与打法实现成游戏可直接加载的 AI 脚本。
> 颜色、卡组曲线、关键卡与打法全部由模型自己决定，主代理不指定任何方向。每个 subagent 只负责表格中自己那一行。

## 一、你要做什么

1. **读规则**：`README.md` 第 4 节（脚本接口）、5.1（回合状态机）、5.2（十一色资源）、5.3（战斗结算）、5.4（生命卡与胜负）、5.6（规则覆盖）、5.7（灵体卡）。
2. **读卡表**：`../灵枢战纪/卡包/第一弹_灵枢觉醒_卡表.md` 中与你所选颜色对应的章节（§3.1 白 / §3.2 黑 / §3.3 红 / §3.4 绿 / §3.5 蓝 / §3.6 紫 / §3.7 橙 / §3.8 青 / §3.9 银 / §3.10 粉 / §3.11 金），以及 §3.12 灵体、§3.14 外枢、§3.15 灰、§四 GQ01 泛用包、§九 预组。
3. **读引擎**：`js/engine/rules.js` 的 `legalMoves()`、`makeView()`、`validateDeck()`、`playMatch()`；`js/engine/cards.gen.js` 的卡牌字段与 `effects` DSL；`js/data/avatars.js`、`js/data/ascendants.js`、`js/data/precons.js`。
4. **自选颜色**：主色必须是 `白 / 黑 / 红 / 绿 / 蓝 / 紫 / 橙 / 青 / 银 / 粉 / 金` 之一；`灰` 是泛用包，只能混入主色，不能作为主色。
5. **构筑卡组**：写 `build(pool)`，返回 30 张卡组（金为 10 张固定主卡组）；同名牌 ≤3（`LQ01-181` 例外，固定 4 张）；不能混色，灰色除外。
6. **写对战脚本**：写 `choose(view, moves)`，可选写 `block(view, bmoves)`；只能从引擎枚举的合法动作里挑一个。
7. **写公开设计说明**：`agents/design/<id>.md`，六节，说明颜色、卡组、曲线、动作优先级、特殊机制与弱点。

## 二、允许读什么 / 禁止读什么

允许：

- `README.md` 第 4、5 节；
- `js/engine/rules.js`、`js/engine/cards.gen.js`、`js/data/avatars.js`、`js/data/ascendants.js`、`js/data/precons.js`、`js/data/lifecards.js`、`js/data/market.js`；
- `js/ai/deckbuild.js`（`scoreCard` / `autoBuild` / `colorPool` 是公开工具）；
- `../灵枢战纪/卡包/第一弹_灵枢觉醒_卡表.md`；
- 你自己那一份脚本与设计说明。

禁止：

- 读取 `js/ai/builtin.js`（已有 AI 实现）与 `js/ai/loader.js` 以外的 AI 代码；
- 读取 `tools/*.mjs`（自检工具只运行、不阅读）；
- 读取其他 subagent 的脚本、设计说明、进度文件（`agents/agent-*.js`、`agents/design/*.md`、`agents/progress/*.json`，自己那份除外）；
- 读取 `agents/results.*`（如果存在）；
- 向主代理询问「该选什么颜色 / 什么卡组」。本轮这些都由你自己判断。

## 三、颜色选择与卡组构筑要求

### 3.1 先读清楚这个颜色的“资源是什么”

十一色的资源不是同一种“费用池”，脚本必须按 `view.me.res` 的真实含义使用：

| 色 | 资源 | 实装口径（以 `rules.js` 的 `getRes/refreshRes` 为准） | 关键限制 |
|---|---|---|---|
| 白 | AP | 3；第 5 回合起 4、第 9 回合起 5 | 消耗；回合开始抽 1 |
| 黑 | 牺牲 | `2 + floor(回合/2)` | 消耗；回合开始抽 1；可用生命换抽 |
| 红 | 激情 | `min(2×回合, 10)` | **门槛不消耗**；回合末弃光手牌再补至 `(10−激情)÷2` |
| 绿 | 法力 | `2 + 地标数` | 消耗；回合末补至 `地标数+1` |
| 蓝 | 手牌 | `min(6, 当前手牌数)`，`res` 效果可临时突破 | **门槛不消耗**；每回合最多打 2 张 |
| 紫 | 灵脉 | 每回合投 `min(3+floor(回合/3),6)` 枚 D6 求和；混沌每点 −3 | 消耗；大成功累计抽牌 |
| 橙 | 锻造 | `3 + 锻造区装备产出`（上限 10） | 消耗；装备可横置进锻造区 |
| 青 | 法力 | `min(回合+1, 6)` | 消耗；回合末按打出数额外抽 |
| 银 | 共鸣 | `max(1, 场上卡牌数 + 地标数)`，回合开始快照 | **门槛不消耗**；每回合最多打 3 张 |
| 粉 | 灵压 | `[0,2,4,6,8]` 灵压等级，下限 1；骑升 0.7 | **门槛不消耗**；每回合最多打 2 张 |
| 金 | 金币 | 基础 5 + 金币卡产出；行动值 `av` 每回合重置 1 | 主卡组 10 张固定牌；市场牌靠 `buy` 购买 |

> `README.md` §5.2 是概览；橙与金的个别数字与实装略有差异，以 `rules.js` 为准。

### 3.2 卡组要求

- **主色**：11 色中选 1 个；`灰` 不能单独成主色。
- **张数**：非金 30 张（引擎允许 25–40，但本轮统一 30 张，便于对照）；金为主卡组 10 张固定牌（`LQ01-181`×4、`182`×2、`183`×1、`184`×2、`185`×1），市场牌库由引擎自动加入。银按卡表 §九的 8/11/8/2/1 配方，不要硬套 10 名目×3。粉的主卡组 30 张（进化链 4 张引擎未实装，不要写进 `build`）。
- **同名牌**：≤3；`LQ01-181` 例外为 4。
- **颜色**：只能主色 + 灰；不能混两个主色。
- **结构**：默认 10 个卡名 ×3 张；如果走银的配方或特殊曲线，必须说明理由。
- **费用曲线**：给出 `1–2 / 3–4 / 5–6 / 7+` 四档目标张数，合计 30（金为 10）。
- **关键卡**：至少 3 张具体卡名 + 数值（费用/ATK/IMP/HP/关键词/效果），说明它们为什么支撑你的胜利方式。
- **预组**：可以读 `js/data/precons.js` 的预组作为基线，但必须说明你改了哪些卡、为什么；不能原样照抄后声称“自建”。

### 3.3 组卡函数

```js
function build(pool) {
  // pool: 已按主色 + 灰过滤的卡对象数组
  // 字段：id, name, type('单位'|'法术'|'装备'|'地标'|'结界'|'金币卡'), cost:{k,n},
  //       atk, imp, hp, kw:[], effects:[], rare, text, sr, av
  // 没有预计算 score；用 api.scoreCard(c) 或自己的评分
  return [{ id: 'LQ01-037', n: 3 }, ...]; // 或 '3x LQ01-037' 文本
}
```

- `api` 注入：`CARDS`、`scoreCard`、`autoBuild`、`byId`、`costOf`。
- 返回 `null` / 抛异常 → 引擎回退 `autoBuild`；本轮验收要求你**自己返回合规卡组**，不依赖回退。
- 不要依赖 `pool` 里的 `score` 字段（`colorPool` 返回的是原始卡对象，没有预计算 score）。

## 四、脚本硬性接口要求

脚本是**一段源码**，不是 ES 模块；不要写 `import` / `export`。游戏用 `new Function('api', src + '; return {build, choose, meta}')` 编译。

```js
const meta = {
  name: '显示名 · 你的策略名',   // 必须包含本行「显示名」，测试做大小写不敏感匹配
  desc: '执行模型 <模型ID>；颜色 <色>；策略 <策略名>；<一句话理由>',
  id: 'model:<短 id>',
  color: '<主色>'
};

function build(pool) { ... }

function choose(view, moves) {
  // 必须返回 moves 里的某一个对象；不得返回新造对象
  return moves[moves.length - 1]; // 兜底：pass
}

// 可选：防守方阻挡窗口
function block(view, bmoves) {
  // bmoves: [{type:'block', uid}, {type:'noBlock'}]；返回其中一个
  return bmoves[bmoves.length - 1];
}
```

### 4.1 `view` 字段

```ts
{
  turn, round, active,
  me: {
    color, life, res, resName,
    avatar: { name, desc, used, timing },       // timing: 'early' | 'late'
    hand: [{ id, name, type, cost, atk, imp, hp, kw, effects, text, sr, av }],
    board: [{ uid, name, atk, imp, hp, maxHp, kw, frozen, attacked, equips }],
    lands: string[], deck: number, grave: number, plays: number,
    av: number | undefined,                      // 金：行动值
    forge: number, outerReady: number, exile: number
  },
  opp: { color, life, res, resName, handCount, board, lands, deck, grave },
  market: [{ id, name, type, cost, atk, imp, hp, kw, av }],  // 公共市场（金）
  over
}
```

- `me.hand` 是完整卡面；`opp.handCount` 只有数量——**不能偷看对手手牌**。
- `me.board` 的 `atk/imp` 是**当前值**（已含 buff），`hp/maxHp` 是当前/上限。

### 4.2 `moves` 类型

| 类型 | 字段 | 说明 |
|---|---|---|
| `play` | `{ i, target?, mode? }` | `i` 是手牌下标；`target` 是需要指定目标的卡的单位 uid；`mode:'forge'` 是橙色装备横置进锻造区 |
| `avatar` | `{}` | 启动灵体能力，每回合 1 次 |
| `buy` | `{ i }` | 金：购买市场区第 `i` 张 |
| `ascend` | `{ id }` | 升灵仪式：降临外枢灵体 |
| `attack` | `{ uid, target }` | `target` 是敌方单位 uid 或 `'face'` |
| `pass` | `{}` | 结束回合 |

- 引擎已经把“费用不够、目标不合法、每回合打出上限、召唤失调、守卫强制目标”等全部过滤掉；你只需要排序和挑一个。
- `block(view, bmoves)` 里 `bmoves` 只有 `block`（uid）与 `noBlock`。

### 4.3 硬约束

- 必须返回 `moves` 数组里的**某一个对象引用**，不要新建 `{type:'pass'}`；`block` 同理返回 `bmoves` 里的对象。
- 不得修改 `view` / `moves` / `bmoves`；不得对原数组 `sort()`（要排序先 `slice()`）。
- 零依赖：不得出现 `import` / `require`。
- 不得死循环、不得抛异常、单次决策不超过 3000ms。
- 任何未知 `moves` 类型都要安全兜底到 `pass`（或最后一个合法动作）。
- 不得硬编码卡牌实例 uid；卡号/卡名可以硬编码，但必须对未知卡与效果兜底。

## 五、自检与验收

写完先做语法检查：

```bash
cd "/f/producing/novel/EX4以自创card game为主题/game_lq01"
node --check "agents/agent-<id>.js"
```

再跑自检（编译 → 组卡 → 校验 → 20 局）：

```bash
cd "/f/producing/novel/EX4以自创card game为主题/game_lq01"
node tools/agent-selftest.mjs "agents/agent-<id>.js" <主色> 20
```

自检会打印：meta、卡组张数/名目/曲线、对 `CONTROL` 的胜负、平均步数、异常/短局/长局。**必须做到 `errors=0, short=0, long=0`**；如果出现异常，修脚本后重跑。自检只读脚本，不写文件。

如果 Bash 找不到 `node`，先执行：

```bash
export PATH="/c/Users/张涵/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:/usr/bin:/bin:$PATH"
```

**不要**运行 `tools/agents-run.mjs`（完整循环赛由主代理统一跑）、不要启动服务、不要运行 `audit/fuzz/matrix` 等重工具。

## 六、进度上报（必须）

用 Bash 依次执行 5 条命令，`<id>` 换成自己的短 id，note 必须写出本轮的颜色与构筑判断：

```bash
cd "/f/producing/novel/EX4以自创card game为主题/game_lq01"
node tools/report-progress.mjs <id> running 10 "读取规则与卡表" "<已确认的资源口径、卡表章节与关键卡>"
node tools/report-progress.mjs <id> running 40 "选定颜色与卡组" "<主色 + 一句话构筑理由>"
node tools/report-progress.mjs <id> running 70 "编写脚本" "<曲线、关键卡、choose 的优先级取舍>"
node tools/report-progress.mjs <id> running 90 "语法与自检" "node --check 与 selftest 结果"
node tools/report-progress.mjs <id> completed 100 "已完成" "自选 <主色>；脚本与设计说明已落盘"
```

## 七、公开设计说明

`agents/design/<id>.md` 用中文写六节：

1. **颜色与卡组构想**：为什么选这个颜色；至少 3 张具体卡名 + 数值。
2. **核心思路**：胜利方式（快攻/中速/控制/组合），资源怎么滚起来。
3. **卡组清单与曲线**：完整 10 个卡名（或银的配方/金的 10 张）、四档费用曲线、关键卡与配合。
4. **动作优先级**：斩杀、出牌顺序、灵体启动时机、升灵、阻挡、何时 pass。
5. **特殊机制适配**：生命卡、外枢/升灵、地标、锻造区、市场、骰池、门槛色等与你主色相关的机制。
6. **取舍与已知弱点**：这套卡组怕什么、为什么仍然这样选。

文件开头必须三行：

```text
执行模型 ID：<本行模型 ID>
自选颜色：<主色>（资源：<资源名>）
自选策略：<你起的策略名称>
```

只写可审阅的设计说明，不写内部推理过程。

## 八、禁止事项

- 不改动 `js/engine/*`、`js/data/*`、`js/ui/*`、`js/ai/*`、`index.html`、`server.mjs`、`tools/*`、`agents/agents.json` 或任何其他文件。
- 不修改其他 subagent 的脚本、设计说明、进度文件。
- 只写 `agents/agent-<id>.js` 与 `agents/design/<id>.md`；进度只通过 `tools/report-progress.mjs` 写。
- 不运行完整循环赛、不启动服务、不运行 `npm test`（本项目没有测试脚本）、不修改端口。
- 不在 `agents/` 下新建额外文件（临时文件用完删除）。

## 九、任务分配表

| 短 id | 显示名 | 模型 ID | 脚本文件 | 设计说明 |
|---|---|---|---|---|
| `hy4` | hy4 | `hy4std` | `agents/agent-hy4.js` | `agents/design/hy4.md` |
| `hy3` | hy3 | `hy3` | `agents/agent-hy3.js` | `agents/design/hy3.md` |
| `glm53` | GLM5.3 | `glm-5.3` | `agents/agent-glm53.js` | `agents/design/glm53.md` |
| `glm53flash` | GLM5.3flash | `glm-5.3-flash` | `agents/agent-glm53flash.js` | `agents/design/glm53flash.md` |
| `minimaxm3` | MiniMax M3 | `minimax-m3-pay` | `agents/agent-minimaxm3.js` | `agents/design/minimaxm3.md` |
| `minimaxm31flash` | MiniMax M3.1flash | `minimax-m3.1-flash` | `agents/agent-minimaxm31flash.js` | `agents/design/minimaxm31flash.md` |
| `kimi31pro` | KIMI 3.1pro | `kimi-k3.1-pro` | `agents/agent-kimi31pro.js` | `agents/design/kimi31pro.md` |
| `kimi28preview` | KIMI 2.8preview | `kimi-k2.8-preview` | `agents/agent-kimi28preview.js` | `agents/design/kimi28preview.md` |
| `deepseekv41flash` | deepseek v4.1flash | `deepseek-v4.1-flash` | `agents/agent-deepseekv41flash.js` | `agents/design/deepseekv41flash.md` |
| `deepseekv4pro` | deepseek v4pro | `deepseek-v4-pro` | `agents/agent-deepseekv4pro.js` | `agents/design/deepseekv4pro.md` |
| `step5preview` | step5preview | `step-5-preview` | `agents/agent-step5preview.js` | `agents/design/step5preview.md` |
| `mimov26pro` | MIMO-v2.6-pro | `mimo-v2.6-pro` | `agents/agent-mimov26pro.js` | `agents/design/mimov26pro.md` |

> 颜色不预先分配；如果多个模型选到同一主色，用各自的卡组清单、曲线与转型条件区分。

完成后用一句话汇报：脚本路径、自选主色、策略名称、`node --check` 与 selftest 的结果。
