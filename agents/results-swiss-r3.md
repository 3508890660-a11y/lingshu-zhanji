# 12 模型 · 瑞士轮 BO10

- 运行时间：2026-11-06T11:49:53.126Z
- 规模：12 位，瑞士轮 5 轮，每轮 6 对，每对 BO10（前 5 局 A 先手、后 5 局 B 先手）
- 总局数：**300**｜失败脚本：0
- 计分：BO 胜 1、BO 平 0.5；同分比局胜率，再比平均步数

## 最终排名

| 名次 | 模型 | 颜色 | BO 战绩 | 局战绩（胜-负-平） | 局胜率 | 平均步数 |
|---:|---|---|---|---|---:|---:|
| 1 | MIMO-v2.6-pro | 红 | 5-0-0（5 分） | 40-10-0 | 80% | 45.9 |
| 2 | deepseek v4pro | 红 | 4-1-0（4 分） | 43-7-0 | 86% | 41.5 |
| 3 | KIMI 2.8preview | 红 | 3-1-1（3.5 分） | 28-22-0 | 56% | 55.2 |
| 4 | MiniMax M3 | 绿 | 3-2-0（3 分） | 24-26-0 | 48% | 63.4 |
| 5 | KIMI 3.1pro | 红 | 3-2-0（3 分） | 19-30-1 | 39% | 63.3 |
| 6 | hy4 | 绿 | 2-2-1（2.5 分） | 27-23-0 | 54% | 72.1 |
| 7 | step5preview | 绿 | 2-2-1（2.5 分） | 21-29-0 | 42% | 70.7 |
| 8 | deepseek v4.1flash | 青 | 2-3-0（2 分） | 22-27-1 | 45% | 80.4 |
| 9 | MiniMax M3.1flash | 绿 | 2-3-0（2 分） | 22-28-0 | 44% | 93.2 |
| 10 | hy3 | 绿 | 1-3-1（1.5 分） | 20-30-0 | 40% | 87.7 |
| 11 | GLM5.3 | 青 | 1-4-0（1 分） | 21-29-0 | 42% | 88.1 |
| 12 | GLM5.3flash | 橙 | 0-5-0（0 分） | 12-38-0 | 24% | 100.2 |

## 各轮配对

### 第 1 轮

| 台 | 选手 A | 局分 | 选手 B | BO 胜者 | 备注 |
|---:|---|---|---|---|---|
| 1 | deepseekv41flash | 0-10 | deepseekv4pro | deepseekv4pro | — |
| 2 | glm53 | 10-0 | glm53flash | glm53 | — |
| 3 | hy3 | 1-9 | hy4 | hy4 | — |
| 4 | kimi28preview | 10-0 | kimi31pro | kimi28preview | — |
| 5 | mimov26pro | 8-2 | minimaxm3 | mimov26pro | — |
| 6 | minimaxm31flash | 4-6 | step5preview | step5preview | — |

### 第 2 轮

| 台 | 选手 A | 局分 | 选手 B | BO 胜者 | 备注 |
|---:|---|---|---|---|---|
| 1 | deepseekv4pro | 9-1 | kimi28preview | deepseekv4pro | — |
| 2 | glm53 | 1-9 | hy4 | hy4 | — |
| 3 | mimov26pro | 10-0 | step5preview | mimov26pro | — |
| 4 | minimaxm31flash | 3-7 | minimaxm3 | minimaxm3 | — |
| 5 | hy3 | 4-6 | deepseekv41flash | deepseekv41flash | — |
| 6 | kimi31pro | 7-3 | glm53flash | kimi31pro | — |

### 第 3 轮

| 台 | 选手 A | 局分 | 选手 B | BO 胜者 | 备注 |
|---:|---|---|---|---|---|
| 1 | deepseekv4pro | 4-6 | mimov26pro | mimov26pro | — |
| 2 | hy4 | 5-5 | kimi28preview | 平 | — |
| 3 | glm53 | 3-7 | minimaxm3 | minimaxm3 | — |
| 4 | kimi31pro | 7-3 | step5preview | kimi31pro | — |
| 5 | deepseekv41flash | 8-2 | minimaxm31flash | deepseekv41flash | — |
| 6 | hy3 | 8-2 | glm53flash | hy3 | — |

### 第 4 轮

| 台 | 选手 A | 局分 | 选手 B | BO 胜者 | 备注 |
|---:|---|---|---|---|---|
| 1 | mimov26pro | 6-4 | hy4 | mimov26pro | — |
| 2 | deepseekv4pro | 10-0 | minimaxm3 | deepseekv4pro | — |
| 3 | kimi31pro | 5-4（平 1） | deepseekv41flash | kimi31pro | — |
| 4 | kimi28preview | 6-4 | glm53 | kimi28preview | — |
| 5 | hy3 | 5-5 | step5preview | 平 | — |
| 6 | minimaxm31flash | 6-4 | glm53flash | minimaxm31flash | — |

### 第 5 轮

| 台 | 选手 A | 局分 | 选手 B | BO 胜者 | 备注 |
|---:|---|---|---|---|---|
| 1 | mimov26pro | 10-0 | kimi31pro | mimov26pro | — |
| 2 | deepseekv4pro | 10-0 | hy4 | deepseekv4pro | — |
| 3 | kimi28preview | 6-4 | deepseekv41flash | kimi28preview | — |
| 4 | minimaxm3 | 8-2 | hy3 | minimaxm3 | — |
| 5 | step5preview | 7-3 | glm53 | step5preview | — |
| 6 | minimaxm31flash | 7-3 | glm53flash | minimaxm31flash | 重赛 |

## 三轮对照（同一赛制：5 轮瑞士 + BO10）

| 模型 | 统一提示词 | 胜率反馈 | 先评色再选色 | 本轮名次 | 色(上→本) |
|---|---:|---:|---:|---:|---|
| MIMO-v2.6-pro | 42% | 39% | 80% | 1 | 绿→红 |
| deepseek v4pro | 52% | 53% | 86% | 2 | 绿→红 |
| KIMI 2.8preview | 68% | 74% | 56% | 3 | 绿→红 |
| MiniMax M3 | 46% | 47% | 48% | 4 | 绿→绿 |
| KIMI 3.1pro | 42% | 52% | 39% | 5 | 橙→红 |
| hy4 | 44% | 8% | 54% | 6 | 橙→绿 |
| step5preview | 68% | 57% | 42% | 7 | 蓝→绿 |
| deepseek v4.1flash | 27% | 48% | 45% | 8 | 绿→青 |
| MiniMax M3.1flash | 42% | 39% | 44% | 9 | 黑→绿 |
| hy3 | 54% | 62% | 40% | 10 | 绿→绿 |
| GLM5.3 | 29% | 43% | 42% | 11 | 绿→青 |
| GLM5.3flash | 86% | 78% | 24% | 12 | 红→橙 |

- 均值：50% / 50% / 50%
- 标准差：16.27 / 17.40 / 16.68
- 各轮颜色分布与场均：
  - 统一：红 1（86%）、蓝 1（68%）、绿 7（45%）、橙 2（43%）、黑 1（42%）
  - 反馈：红 1（78%）、绿 7（52%）、蓝 1（57%）、橙 2（30%）、黑 1（39%）
  - 评色：红 4（65%）、绿 5（46%）、青 2（44%）、橙 1（24%）