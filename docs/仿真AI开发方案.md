# 仿真 AI 开发方案

> 基于[仿真 AI 设计方案](./仿真AI设计方案.md)的完整落地开发计划  
> 目标：不修改任何现有代码，通过新增文件 + 替换函数内部逻辑实现

---

## 目录

1. [总体策略](#1-总体策略)
2. [技术架构](#2-技术架构)
3. [开发阶段总览](#3-开发阶段总览)
4. [第一阶段：基础设施](#4-第一阶段基础设施)
5. [第二阶段：人格与情绪](#5-第二阶段人格与情绪)
6. [第三阶段：伪装引擎](#6-第三阶段伪装引擎)
7. [第四阶段：角色行为改造](#7-第四阶段角色行为改造)
8. [第五阶段：发言与投票](#8-第五阶段发言与投票)
9. [第六阶段：集成与测试](#9-第六阶段集成与测试)
10. [测试策略](#10-测试策略)
11. [风险与应对](#11-风险与应对)
12. [附录：验收清单](#12-附录验收清单)

---

## 1. 总体策略

### 开发原则

| 原则 | 说明 |
|------|------|
| **不改现有代码** | 通过代理模式或入口替换，所有新逻辑写在新增文件中 |
| **自底向上** | 先建基础设施（工具函数），再建状态管理（人格/情绪/记忆），最后改造行为逻辑 |
| **可独立验证** | 每个阶段完成后，可通过纯逻辑测试验证，不需要跑完整游戏 |
| **可渐进回滚** | 每个角色的行为改造可以独立开关配置 |

### 术语说明

| 术语 | 含义 |
|------|------|
| `AIState` | 每个 AI 玩家的运行时状态对象，包含人格、情绪、伪装、记忆 |
| `FakeRole` | AI 对外宣称的身份（可能是假的） |
| `RealRole` | AI 的真实身份 |
| **代理模式** | 在现有函数外加一层包装，不修改原文件内容 |

---

## 2. 技术架构

### 2.1 文件结构

```
D:\code\hb\werewolf\
├── docs\
│   ├── 仿真AI设计方案.md     ← 设计文档（已有）
│   └── 仿真AI开发方案.md     ← 本文件
│
├── roles\
│   ├── werewolf.js          ← 不修改，只替换内部逻辑
│   ├── seer.js              ← 同上
│   ├── witch.js             ← 同上
│   ├── hunter.js            ← 同上
│   ├── ai-speech.js         ← 同上
│   ├── ai-vote.js           ← 同上
│   │
│   └── ai\                  ← 新增目录：所有 AI 仿真代码
│       ├── index.js          ← 统一导出，代理注册
│       ├── AIState.js        ← AI 运行时状态管理
│       ├── personality.js    ← 人格生成与管理
│       ├── emotion.js        ← 情绪状态机
│       ├── memory.js         ← 信息过滤与遗忘
│       ├── disguise.js       ← 伪装策略引擎
│       ├── speech.js         ← 仿真发言生成
│       ├── vote.js           ← 仿真投票逻辑
│       ├── actions.js        ← 各角色夜间行动逻辑
│       ├── templates.js      ← 发言模板库
│       └── utils.js          ← 工具函数（加权随机等）
```

### 2.2 数据流

```
游戏引擎触发 AI 决策
        │
        ▼
┌─────────────────────────────────────────┐
│          代理层 (index.js)                │
│  接管现有 roles/ 下各函数的导出            │
│  在调用原始逻辑前注入 AIState             │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         AI 状态层 (AIState.js)            │
│  · 管理当前 AI 的人格/情绪/伪装/记忆      │
│  · 提供 get/set 接口                     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│         决策层 (各模块)                   │
│  · personality.js → 人格参数              │
│  · emotion.js    → 情绪状态              │
│  · memory.js     → 信息过滤              │
│  · disguise.js   → 伪装决策              │
│  · speech.js     → 发言生成              │
│  · vote.js       → 投票决策              │
│  · actions.js    → 夜间行动              │
└──────────────┬──────────────────────────┘
               │
               ▼
     返回标准格式结果（接口不变）
```

### 2.3 配置驱动

所有仿真行为通过配置开关控制，可以在 `game-config.js` 或 `server.js` 中注入：

```javascript
// 配置示例
const aiConfig = {
    enabled: true,              // 全局开关：false = 回退到原始 AI
    personality: { enabled: true },
    disguise: { enabled: true },
    emotion: { enabled: true },
    speech: { slipChance: 0.10 },
    voting: { noiseRange: 2.0 },
};
```

---

## 3. 开发阶段总览

| 阶段 | 内容 | 预估工时 | 产出 |
|------|------|---------|------|
| **一** | 基础设施（utils + AIState + 代理层） | 2h | 可运行的 AI 状态容器 |
| **二** | 人格 + 情绪 + 记忆模块 | 2h | 可独立测试的三模块 |
| **三** | 伪装引擎 | 2h | 狼/神伪装决策逻辑 |
| **四** | 角色行为改造（夜间行动） | 2h | 4 个角色替换函数 |
| **五** | 发言 + 投票改造 | 2h | 仿真发言和投票 |
| **六** | 集成测试 + 调优 | 2h | 完整的可运行系统 |

**总计：约 12 小时**

---

## 4. 第一阶段：基础设施

### 4.1 工具函数 `ai/utils.js`

```javascript
// ===== 加权随机选择 =====
// items: 候选项数组, weights: 对应权重数组
// 返回值：选中的候选项（非索引）
function weightedRandomSelect(items, weights) → item

// ===== 随机整数 =====
function randInt(min, max) → number

// ===== 从数组中随机选一个 =====
function randomChoice(arr) → item

// ===== 数组洗牌 =====
function shuffle(arr) → arr

// ===== 按概率判定 =====
// probability: 0~1，返回 true 的概率
function chance(probability) → boolean

// ===== 在 base 附近做随机偏移（用于加噪声） =====
function jitter(base, range) → number

// ===== 安全的读数组（越界返回 undefined） =====
function safeGet(arr, index) → any
```

**验收标准：**
- 每个函数有单元测试覆盖
- `weightedRandomSelect` 在大量调用下分布符合预期
- `chance(0.7)` 在 1000 次调用中约 700 次返回 true

### 4.2 AI 状态管理 `ai/AIState.js`

```javascript
// ===== 创建/获取 AI 状态 =====
// 每个 AI player 绑定一个 AIState，用 player.id 或 player.seat 做 key
function getOrCreateAIState(player) → AIState

// ===== AIState 数据结构 =====
AIState = {
    // 基本
    playerId: string,
    seat: number,
    realRole: string,           // 真实角色（常量）

    // 人格（初始化时生成）
    personality: Personality,

    // 情绪（动态更新）
    emotion: 'calm',            // calm | nervous | excited | revenge

    // 伪装（动态更新）
    disguise: DisguiseState,

    // 记忆（动态更新）
    memory: MemoryState,

    // 游戏记录（动态追加）
    gameLog: GameLogEntry[],
}
```

```javascript
// ===== 清空所有 AI 状态（新游戏时调用） =====
function resetAllAIStates()
```

**验收标准：**
- `getOrCreateAIState` 对同一 player 返回同一对象
- `resetAllAIStates` 清空所有状态
- 不依赖任何现有游戏逻辑，纯内存操作

### 4.3 代理层 `ai/index.js`

这是接入现有系统的关键。两种方案：

#### 方案 A：入口替换（推荐）

在 `server.js`（或 `game-engine.js`）中引用 AI 模块，不再直接调用原始 `roles/` 函数：

```javascript
// 原来：
const { processWerewolfAction } = require('./roles/werewolf');

// 改为：
const { processWerewolfAction } = require('./roles/ai');
```

`ai/index.js` 暴露与 `roles/` 各文件**完全一致的接口**：

```javascript
const aiActions = require('./actions');
const aiSpeech = require('./speech');
const aiVote = require('./vote');
const { getOrCreateAIState } = require('./AIState');
const { getAiConfig } = require('../game-config');  // 假设有全局配置

// 狼人决策 — 接口与 roles/werewolf.js 一致
function processWerewolfAction(engine, player) {
    const config = getAiConfig();
    if (!config.enabled) {
        // 回退到原始逻辑
        return require('../werewolf').processWerewolfAction(engine, player);
    }
    getOrCreateAIState(player);
    return aiActions.processWerewolf(engine, player);
}

// 预言家决策 — 接口与 roles/seer.js 一致
function processSeerAction(engine, player) { ... }

// 女巫决策
function processWitchAction(engine, player) { ... }

// 猎人决策
function processHunterAction(engine, player) { ... }

// AI 发言
function generateAiSpeech(engine, player) { ... }

// AI 投票
function generateAiVote(engine, player) { ... }

module.exports = {
    processWerewolfAction,
    processSeerAction,
    processWitchAction,
    processHunterAction,
    generateAiSpeech,
    generateAiVote,
};
```

#### 方案 B：猴子补丁（激进，不推荐）

在 `server.js` 启动时覆盖原模块导出：

```javascript
// 在 server.js 开头
const aiPatch = require('./roles/ai/patch');
aiPatch.apply();  // 替换所有 roles/ 下的函数
```

**不推荐**，因为隐式修改难以追踪。

#### 方案 A 的集成位置

在 `server.js` 中，查找所有 `require('./roles/...')` 和 `require('../roles/...')`，替换为 `require('./roles/ai')`。替换点：

| 原引用 | 替换为 |
|--------|-------|
| `require('./roles/werewolf')` | `require('./roles/ai')` |
| `require('./roles/seer')` | `require('./roles/ai')` |
| `require('./roles/witch')` | `require('./roles/ai')` |
| `require('./roles/hunter')` | `require('./roles/ai')` |
| `require('./roles/ai-speech')` | `require('./roles/ai')` |
| `require('./roles/ai-vote')` | `require('./roles/ai')` |

**也可以不改引用**：直接修改 `roles/` 下的各文件，在文件头部把原始函数存下来，然后替换导出：

```javascript
// roles/werewolf.js 修改版
const { getOrCreateAIState } = require('./ai/AIState');
const { processWerewolf: aiProcess } = require('./ai/actions');
const { getAiConfig } = require('../game-config');

// 保存原始函数（如果需要回退）
const original = module.exports;

module.exports = {
    processWerewolfAction(engine, player) {
        const config = getAiConfig();
        if (!config.enabled) return original.processWerewolfAction(engine, player);
        getOrCreateAIState(player);
        return aiProcess(engine, player);
    },
    // ... 其他函数
};
```

**推荐**：使用"替换引用"方式，不改 `roles/` 下的任何文件。

---

## 5. 第二阶段：人格与情绪

### 5.1 人格生成 `ai/personality.js`

```javascript
const { randInt, randomChoice } = require('./utils');

// 人格模板
const PERSONALITY_TEMPLATES = {
    aggressive:   { aggression: 9, paranoia: 3, stubbornness: 7, memory: 4, eloquence: 3, stability: 5 },
    schemer:      { aggression: 5, paranoia: 8, stubbornness: 8, memory: 7, eloquence: 7, stability: 8 },
    honest:       { aggression: 2, paranoia: 3, stubbornness: 4, memory: 6, eloquence: 5, stability: 7 },
    confused:     { aggression: 4, paranoia: 5, stubbornness: 3, memory: 2, eloquence: 3, stability: 4 },
    dramaQueen:   { aggression: 7, paranoia: 6, stubbornness: 2, memory: 5, eloquence: 9, stability: 3 },
    steady:       { aggression: 3, paranoia: 7, stubbornness: 6, memory: 8, eloquence: 6, stability: 9 },
};

function generatePersonality(useTemplates = true, templateWeight = 0.3) {
    if (useTemplates && Math.random() < templateWeight) {
        const template = randomChoice(Object.values(PERSONALITY_TEMPLATES));
        return { ...template };  // 复制一份
    }
    return {
        aggression:  randInt(0, 10),
        paranoia:    randInt(0, 10),
        stubbornness: randInt(0, 10),
        memory:      randInt(0, 10),
        eloquence:   randInt(0, 10),
        stability:   randInt(0, 10),
    };
}

// 获取人格特征标签（用于调试显示）
function getPersonalityLabel(personality) → string[]
```

**单元测试：**
- 生成 100 个 AI，所有维度值在 0~10 范围内
- 使用模板时，返回的对象与模板匹配
- 不使用模板时，各维度有足够的随机性

### 5.2 情绪状态机 `ai/emotion.js`

```javascript
// 更新情绪（每次 AI 决策前调用）
function updateEmotion(player, engine) → string

// 情绪对参数的调节系数
const EMOTION_MODIFIERS = {
    calm:    { speechLength: 1.0, disguiseAbility: 1.0, slipChance: 1.0, aggressionBonus: 0, revealChance: 0.0 },
    nervous: { speechLength: 0.7, disguiseAbility: 0.7, slipChance: 2.0, aggressionBonus: 0, revealChance: 0.2 },
    excited: { speechLength: 0.5, disguiseAbility: 0.5, slipChance: 3.0, aggressionBonus: 3, revealChance: 0.6 },
    revenge: { speechLength: 2.0, disguiseAbility: 0.1, slipChance: 5.0, aggressionBonus: 5, revealChance: 1.0 },
};

// 获取情绪调节后的参数
function getModifiedParams(player) → { speechLength, disguiseAbility, slipChance, aggressionBonus, revealChance }
```

**核心逻辑：**

```javascript
function updateEmotion(player, engine) {
    const p = getOrCreateAIState(player);
    let state = p.emotion || 'calm';

    const attackCount = countAttacksOnPlayer(engine, player.seat);

    if (wasJustVotedOut(engine, player.seat) && state === 'excited') {
        state = 'revenge';
    } else if (attackCount >= 3 || wasFakeExposed(engine, player)) {
        state = p.personality.stability > 6 ? 'nervous' : 'excited';
    } else if (attackCount >= 1) {
        state = p.personality.stability > 7 ? 'calm' : 'nervous';
    }

    p.emotion = state;
    return state;
}
```

**单元测试：**
- 攻击 0 次 → calm
- 攻击 1 次 + 低 stability → nervous
- 攻击 3 次 → excited
- 被投票出局 + excited → revenge

### 5.3 记忆系统 `ai/memory.js`

```javascript
// 记录一个事件
function rememberEvent(player, event) → void
// event = { type: 'speech'|'vote'|'death'|'claim', seat, round, content }

// 判断是否记得某个事件
function shouldForget(memoryScore, eventImportance) → boolean

// 获取 AI 当前记得的所有事件
function getMemory(player) → event[]

// 清除旧记忆（每轮结束调用）
function cleanOldMemory(player) → void

// 获取 AI 对特定玩家的记忆摘要
function getMemoryAbout(player, targetSeat) → { speeches, votes }
```

**遗忘概率：**

```javascript
const EVENT_IMPORTANCE = {
    speech: 0.6,   // 普通发言——容易忘
    vote:   1.0,   // 投票——比较重要
    death:  0.9,   // 死亡——重要
    claim:  1.2,   // 跳身份——很重要
    self_claim: 1.5, // 自己跳的身份——不容易忘
};

function shouldForget(memoryScore, eventType) {
    const importance = EVENT_IMPORTANCE[eventType] || 0.5;
    const forgetChance = (1 - memoryScore / 12) * (1 / importance);
    return Math.random() < forgetChance;
}
```

---

## 6. 第三阶段：伪装引擎

### 6.1 核心文件 `ai/disguise.js`

这是整套方案的灵魂模块。

```javascript
const { getOrCreateAIState, getDisguise } = require('./AIState');
const { chance, weightedRandomSelect, jitter, randInt } = require('./utils');
const { getModifiedParams } = require('./emotion');

// ===== 主入口：决定本角色本局是否伪装，伪装成什么 =====
function evaluateDisguise(engine, player) → DisguiseState

// ===== 狼人伪装评估 =====
function evaluateWolfDisguise(engine, player) → DisguiseState

// ===== 神职伪装评估 =====
function evaluatePowerRoleDisguise(engine, player) → DisguiseState

// ===== 获取当前伪装身份（如果没有伪装，返回真实身份） =====
function getEffectiveRole(player) → string

// ===== 判断 AI 是否应该亮出真实身份 =====
function shouldReveal(engine, player) → boolean
```

### 6.2 狼人伪装逻辑

```javascript
function evaluateWolfDisguise(engine, player) {
    const state = getOrCreateAIState(player);
    const p = state.personality;
    const mod = getModifiedParams(player);

    // 选项池
    const options = [
        { role: null,               label: '不伪装', weight: 30 },
        { role: 'villager',         label: '跳平民', weight: 50 },
        { role: 'seer',             label: '跳预言家', weight: 0 },
        { role: 'witch',            label: '跳女巫',   weight: 0 },
        { role: 'hunter',           label: '跳猎人',   weight: 0 },
    ];

    // —— 跳预言家评分 ——
    let seerScore = 0;
    const wolfCount = getAliveWolfCount(engine);
    const totalAlive = getAliveCount(engine);
    const wolfRatio = wolfCount / Math.max(1, totalAlive);

    seerScore += wolfRatio * 30;          // 狼占比越高越敢跳
    seerScore += p.aggression * 6;        // 激进的敢跳
    seerScore += p.eloquence * 4;         // 表达能力好才跳得像
    seerScore += (getSeerClaimants(engine).length === 0) ? 20 : -10;  // 没人抢跳？
    seerScore += mod.aggressionBonus * 3; // 情绪激动加成
    seerScore += (Math.random() - 0.5) * 30; // 随机扰动

    if (seerScore > 100) {
        options[2].weight = Math.min(80, seerScore - 50);
    }

    // —— 跳女巫评分 ——（被查杀时反打）
    if (isBeingAccused(engine, player.seat)) {
        options[3].weight = p.eloquence * 5 + (Math.random() * 20);
    }

    // —— 跳猎人评分 ——（劣势局）
    if (wolfRatio < 0.2) {
        options[4].weight = p.aggression * 4 + (Math.random() * 20);
    }

    // 加权随机选择
    const selected = weightedRandomSelect(options, options.map(o => o.weight));

    if (selected.role === 'seer') {
        return {
            fakeRole: 'seer',
            fakeKillTarget: selectFakeSeerTarget(engine, player),
            fakeReason: generateFakeReason(engine, player),
        };
    }

    return { fakeRole: selected.role };
}
```

### 6.3 神职伪装逻辑

```javascript
function evaluatePowerRoleDisguise(engine, player) {
    const state = getOrCreateAIState(player);
    const p = state.personality;
    const mod = getModifiedParams(player);

    // 默认不伪装（亮明身份）
    let shouldHide = false;
    let score = 0;

    // 被怀疑了？→ 更想藏
    if (isPlayerSuspected(engine, player.seat)) score += 30;

    // 狼人数量多？→ 更想藏
    score += getAliveWolfCount(engine) * 5;

    // 女巫有解药 → 预言家可以稍微不那么怕
    if (player.role === 'seer' && witchHasSave(engine)) score -= 10;
    if (player.role === 'seer' && getAliveWolfCount(engine) >= 2) score += 15; // 狼多，预言家价值高

    // 人格因素
    score -= p.aggression * 4;   // 激进的更喜欢亮身份带队
    score += p.stability * 3;    // 稳定的更喜欢藏

    // 情绪影响
    score += mod.revealChance * 20; // 情绪波动时藏不住

    score += (Math.random() - 0.5) * 20; // 随机扰动

    shouldHide = score > 50;

    if (shouldHide) {
        return { fakeRole: 'villager' };
    }
    return { fakeRole: null };  // 不伪装
}
```

### 6.4 伪装相关的辅助函数

```javascript
// AI 是否应该亮身份（在即将被投出/有重要信息时）
function shouldReveal(engine, player) {
    const state = getOrCreateAIState(player);
    if (!state.disguise.fakeRole) return false;  // 没伪装就不用亮

    // 即将被投票出局
    if (isAboutToBeVotedOut(engine, player.seat)) return true;

    // 有重要信息（预言家验到狼、女巫毒到人等）
    if (player.role === 'seer' && hasUnrevealedWolf(engine, player)) {
        return state.personality.stability < 6;  // 不稳定的憋不住
    }

    return false;
}

// 被揭穿伪装时的处理
function onDisguiseExposed(engine, player) {
    const state = getOrCreateAIState(player);
    state.emotion = 'excited';  // 直接进入激动状态
    // 接下来发言会语无伦次、嘴瓢概率暴增
}
```

---

## 7. 第四阶段：角色行为改造

### 7.1 `ai/actions.js` — 夜间行动

四个角色的夜间行动函数，每一个都集成人格/情绪/伪装：

#### 狼人 `processWerewolf(engine, player) → { target }`

```javascript
function processWerewolf(engine, player) {
    const state = getOrCreateAIState(player);
    const p = state.personality;
    const mod = getModifiedParams(player);

    // 1. 如果伪装成预言家 — 优先制造"查杀应验"
    if (state.disguise.fakeRole === 'seer' && state.disguise.fakeKillTarget) {
        const target = findPlayerBySeat(engine, state.disguise.fakeKillTarget);
        if (target && target.isAlive && Math.random() < 0.6) {
            return { target: target.seat };
        }
    }

    // 2. 刀已知的威胁（预言家/女巫）
    const threats = identifyThreats(engine, player);
    if (threats.length > 0 && Math.random() < 0.65) {
        return { target: weightedRandomSelect(threats, threats.map(t => t.threatScore)) };
    }

    // 3. 跟队友意见
    const packConsensus = getWolfPackTarget(engine);
    if (packConsensus && p.aggression < 6 && Math.random() < 0.5) {
        return { target: packConsensus };
    }

    // 4. 误刀队友（低概率）
    const teammates = getAliveTeammates(engine, player);
    if (teammates.length > 0 && Math.random() < 0.08 * (1 - p.memory / 10)) {
        return { target: randomChoice(teammates).seat };
    }

    // 5. 随机
    const targets = getAlivePlayers(engine).filter(p => p.seat !== player.seat && !isTeammate(p));
    return { target: randomChoice(targets).seat };
}
```

#### 预言家 `processSeer(engine, player) → { target }`

```javascript
function processSeer(engine, player) {
    const state = getOrCreateAIState(player);
    const p = state.personality;

    // 如果跳了平民，优先查跳神职的人（验证身份）
    if (state.disguise.fakeRole === 'villager') {
        const claimers = getClaimedPowerRoles(engine);
        if (claimers.length > 0 && Math.random() < 0.6) {
            return { target: weightedRandomSelect(claimers) };
        }
    }

    // 查自己怀疑的人
    const suspects = buildSuspectList(engine, player);
    if (suspects.length > 0 && Math.random() < 0.7) {
        return { target: weightedRandomSelect(suspects) };
    }

    // 重复查验（记性差）
    const prevTargets = getPreviousInvestTargets(player);
    if (prevTargets.length > 0 && Math.random() < 0.15 * (1 - p.memory / 10)) {
        return { target: randomChoice(prevTargets) };
    }

    // 随机
    const targets = getAlivePlayers(engine).filter(p => p.seat !== player.seat);
    return { target: randomChoice(targets).seat };
}
```

#### 女巫 `processWitch(engine, player) → { action, target }`

```javascript
function processWitch(engine, player) {
    const state = getOrCreateAIState(player);
    const p = state.personality;
    const killed = getTonightKilled(engine);
    const action = { save: false, kill: null };

    // 解药
    if (player.hasSave && killed) {
        let saveChance = 50;
        if (isKnownGood(engine, killed)) saveChance += 30;
        if (isSuspectedByPlayer(engine, player, killed)) saveChance -= 30;
        if (state.disguise.fakeRole === 'villager') saveChance -= 15;
        if (player.round === 1) saveChance += 25; // 首夜倾向救人
        saveChance += (Math.random() - 0.5) * 20;
        action.save = saveChance > 50;
    }

    // 毒药
    if (player.hasKill) {
        let killChance = 25;
        const wolf = getConfirmedWolf(engine, player);
        if (wolf) killChance += 30;
        killChance += p.aggression * 3;
        if (state.disguise.fakeRole === 'villager') killChance -= 10;
        if (Math.random() * 100 < killChance) {
            action.kill = wolf ? wolf.seat : randomChoice(getAlivePlayers(engine).filter(p => p.seat !== player.seat)).seat;
        }
    }

    return action;
}
```

#### 猎人 `processHunter(engine, player) → { target }`

```javascript
function processHunter(engine, player) {
    const state = getOrCreateAIState(player);
    const p = state.personality;
    const mod = getModifiedParams(player);
    const targets = getAlivePlayers(engine).filter(p => p.seat !== player.seat);

    // 报复性带人（被投票出局时）
    if (state.emotion === 'revenge') {
        const voters = getPlayerVoters(engine, player.seat);
        if (voters.length > 0 && Math.random() < 0.6) {
            return { target: randomChoice(voters).seat };
        }
    }

    // 带自己最怀疑的人
    const suspects = buildSuspectList(engine, player);
    if (suspects.length > 0 && Math.random() < 0.7) {
        return { target: weightedRandomSelect(suspects) };
    }

    // 随机
    return { target: randomChoice(targets).seat };
}
```

---

## 8. 第五阶段：发言与投票

### 8.1 仿真发言 `ai/speech.js`

```javascript
const TEMPLATES = require('./templates');

// 主入口：生成 AI 发言
function generateSpeech(engine, player) → string {
    const state = getOrCreateAIState(player);
    const mod = getModifiedParams(player);

    // 1. 更新情绪
    updateEmotion(player, engine);

    // 2. 决定发言动机
    const motive = decideSpeechMotive(engine, player);

    // 3. 选择模板
    let speech = selectTemplate(motive, engine, player);

    // 4. 嘴瓢检查
    speech = maybeSlip(speech, player);

    // 5. 根据情绪调整语气
    speech = applyEmotionStyle(speech, state.emotion);

    // 6. 根据表达能力调整长度
    speech = adjustSpeechLength(speech, mod.speechLength, player);

    return speech;
}
```

### 8.2 发言模板 `ai/templates.js`

```javascript
const TEMPLATES = {
    // === 狼人跳预言家 ===
    wolfFakeSeer: {
        claim: [
            '我是预言家，昨晚查了 {target} 号，他是狼人！',
            '我第 {round} 晚查的是 {target} 号，{result}！',
            '{target} 号是我的查杀，大家今天跟我出 {target}。',
        ],
        fightBack: [
            '{target} 号跟我对跳是吧？那你就是狼。',
            '这个 {target} 号绝对是悍跳狼，大家不要信他。',
            '真预言家在这里，{target} 号是假的对跳狼。',
        ],
        explain: [
            '我验 {target} 号是因为他上一轮发言太划水了。',
            '我首验 {target} 号是因为他位置比较偏。',
            '{target} 号这轮发言暴露了，和我验的结果吻合。',
        ],
    },

    // === 神职跳平民带节奏 ===
    powerVillager: {
        subtlePush: [
            '我是平民，但我感觉 {target} 号的发言不太像好人。',
            '我没什么身份，就是个平民，不过 {target} 号真的可疑。',
            '我是平民，我觉得 {target} 号说的有道理。',
            '虽然我是平民，但我建议大家关注一下 {target} 号。',
            '平民视角来看，{target} 号如果是狼不会这么说的。',
        ],
        defend: [
            '我是平民，{target} 号的发言我觉得没问题。',
            '我觉得 {target} 号应该是好人，我直觉很准的。',
        ],
        uncertain: [
            '我是平民，目前没什么特别的想法。',
            '我再想想，信息还不够。',
            '先听听大家怎么说吧。',
        ],
    },

    // === 中立/普通发言 ===
    neutral: {
        attack: [
            '我觉得 {target} 号有问题。',
            '我怀疑 {target} 号，他投票很有问题。',
            '{target} 号一直在划水/跟风，我点一票。',
        ],
        defend: [
            '我觉得 {target} 号是好人。',
            '{target} 号不像狼啊，你们别乱投。',
            '保一手 {target} 号，我觉得他是好人。',
        ],
        follow: [
            '同意 {target} 号说的。',
            '我也觉得 {target} 号有点可疑。',
            '跟 {target} 号票。',
        ],
        idle: [
            '我再想想。',
            '信息还不够，不好说。',
            '你们怎么看？',
            '先听听其他人怎么说。',
        ],
    },

    // === 亮身份 ===
    reveal: {
        seer: [
            '好吧，我是预言家，{target} 号是我查出来的狼。',
            '我摊牌了，我是预言家，大家信我一次。',
        ],
        witch: [
            '我是女巫，昨晚我救了/毒了 {target} 号。',
            '行吧我是女巫，解药已经用了。',
        ],
        hunter: [
            '行吧我是猎人，你们别投我，我有枪。',
        ],
    },

    // === 嘴瓢 ===
    slip: [
        '我是预言...呃，我是平民，我说错了。',
        '我觉得 {target} 号是好人...等等，我不确定。',
        '昨晚我是说...白天，我看到 {target} 号很可疑。',
        '我验...我是说我感觉 {target} 号不对劲。',
    ],
};
```

### 8.3 发言动机决策

```javascript
function decideSpeechMotive(engine, player) {
    const state = getOrCreateAIState(player);

    // 亮身份模式
    if (shouldReveal(engine, player)) {
        return { type: 'reveal', role: player.role };
    }

    // 伪装模式下：按伪装身份发言
    if (state.disguise.fakeRole === 'seer') {
        return decideWolfSeerMotive(engine, player);
    }
    if (state.disguise.fakeRole === 'villager' && isPowerRole(player.role)) {
        return decidePowerVillagerMotive(engine, player);
    }

    // 正常模式
    return decideNeutralMotive(engine, player);
}

function decideWolfSeerMotive(engine, player) {
    const state = getOrCreateAIState(player);

    // 有人对跳？
    const otherClaimants = getSeerClaimants(engine).filter(s => s !== player.seat);
    if (otherClaimants.length > 0 && Math.random() < 0.7) {
        return { type: 'fightBack', target: randomChoice(otherClaimants) };
    }

    // 带队投查杀目标
    if (state.disguise.fakeKillTarget && Math.random() < 0.6) {
        return { type: 'claim', target: state.disguise.fakeKillTarget };
    }

    // 编新的查杀
    return { type: 'claim', target: selectFakeSeerTarget(engine, player) };
}

function decidePowerVillagerMotive(engine, player) {
    const state = getOrCreateAIState(player);

    // 有验到的狼？→ 以平民视角推出去
    const foundWolf = getUnrevealedInvestigatedWolf(engine, player);
    if (foundWolf && Math.random() < 0.7) {
        return { type: 'subtlePush', target: foundWolf.seat };
    }

    // 有人被错怀疑？→ 以平民视角保一下
    const knownGood = getInvestigatedGood(engine, player);
    if (knownGood && isPlayerSuspected(engine, knownGood.seat) && Math.random() < 0.5) {
        return { type: 'defend', target: knownGood.seat };
    }

    // 没明确目标 → 划水
    return { type: 'uncertain' };
}
```

### 8.4 嘴瓢实现

```javascript
function maybeSlip(speech, player) {
    const state = getOrCreateAIState(player);
    const mod = getModifiedParams(player);
    const slipChance = 0.15 * mod.slipChance;  // 基础 15%，情绪会放大

    if (Math.random() > slipChance) return speech;

    // 三种嘴瓢
    const slipType = Math.random();
    if (slipType < 0.3 && state.disguise.fakeRole) {
        // 说漏真实身份
        return speech.replace('我是平民', '我是' + getRoleName(state.realRole))
                    .replace('我是预言家', '我其实是' + getRoleName(state.realRole));
    }
    if (slipType < 0.6 && state.disguise.fakeRole) {
        // 跳身份时卡壳
        return randomChoice(TEMPLATES.slip).replace('{target}', '');
    }
    // 前后矛盾
    return speech + '呃不对，我不是这个意思...';
}
```

### 8.5 仿真投票 `ai/vote.js`

```javascript
function generateVote(engine, player) → number {
    const state = getOrCreateAIState(player);
    const p = state.personality;
    const mod = getModifiedParams(player);

    const candidates = getAlivePlayers(engine).filter(c => c.seat !== player.seat);
    const weights = candidates.map(c => {
        let score = 0;

        // 基础怀疑分
        score += computeSuspicion(engine, player, c) * 3;

        // 伪装身份影响
        if (state.disguise.fakeRole === 'seer') {
            // 狼跳预言家：投不跟自己票的人
            if (!followedMyVote(engine, player, c)) score += 5;
            // 投自己编的查杀
            if (c.seat === state.disguise.fakeKillTarget) score += 10;
        }
        if (state.disguise.fakeRole === 'villager' && state.realRole === 'seer') {
            // 预言家跳平民：投验出的狼，保验出的好人
            if (isInvestigatedWolf(engine, player, c)) score += 8;
            if (isInvestigatedGood(engine, player, c)) score -= 5;
        }

        // 从众效应（低 aggression 更明显）
        score += getBandwagonBonus(engine, c) * (1 - p.aggression / 12);

        // 固执加成
        if (previouslyVoted(engine, player, c.seat)) score += p.stubbornness * 0.5;

        // 情绪加成
        score += mod.aggressionBonus;

        // 随机扰动
        score += (Math.random() - 0.5) * 2;

        return Math.max(0, score);
    });

    // 弃权判定（胆小/犹豫）
    if (p.aggression < 3 && Math.random() < 0.15) return 0;

    const selected = weightedRandomSelect(candidates, weights);
    return selected.seat;
}
```

---

## 9. 第六阶段：集成与测试

### 9.1 集成步骤

```
Step 1: 创建 ai/ 目录及所有文件（空函数体）
Step 2: 连接代理层（index.js），验证不修改现有代码即可接入
Step 3: 逐个模块填充逻辑，每填一个跑一次测试
Step 4: 全部填充后，开启全量 AI 仿真模式
Step 5: 运行测试游戏，观察 AI 行为
Step 6: 根据观察调优参数
```

### 9.2 配置集成

在 `server.js` 中新增配置加载：

```javascript
// 在启动时或房间创建时读取 AI 配置
const aiConfig = {
    enabled: true,
    personality: { enabled: true, useTemplates: true, templateWeight: 0.3 },
    disguise: { enabled: true },
    emotion: { enabled: true },
    speech: { slipChance: 0.10 },
    voting: { noiseRange: 2.0 },
};

// 通过 socket 事件透传给 AI 模块
global.__aiConfig = aiConfig;
```

也可以做成游戏创建时的可选配置项，让玩家选择"普通 AI"或"仿真 AI"。

### 9.3 调试辅助

在 `ai/index.js` 中增加调试输出：

```javascript
function logAIDecision(player, action, decision) {
    if (getAiConfig().debug?.showAIState) {
        const state = getOrCreateAIState(player);
        console.log(`[AI] ${player.name}(${getRoleName(player.role)}) → ${action}:`, {
            emotion: state.emotion,
            fakeRole: state.disguise.fakeRole,
            decision: decision,
        });
    }
}
```

---

## 10. 测试策略

### 10.1 单元测试（每个模块独立）

| 模块 | 测试项 | 工具 |
|------|--------|------|
| `utils.js` | 加权随机分布、jitter 范围 | 纯函数，可直接跑 |
| `personality.js` | 维度范围、模板匹配 | 直接跑 |
| `emotion.js` | 攻击次数→状态映射 | mock engine |
| `memory.js` | 遗忘概率、事件记录 | 直接跑 |
| `disguise.js` | 各角色伪装决策路径 | mock engine + player |
| `speech.js` | 模板选择、嘴瓢触发 | 直接跑 |
| `vote.js` | 加权投票结果范围 | mock engine |

### 10.2 集成测试

```
Test 1: 6 人局，全部 AI，观察游戏能否正常结束
  - 验收标准：无崩溃，无死循环，每局在 30 轮内结束

Test 2: 记录 20 局游戏的 AI 行为统计
  - 狼人跳预言家概率是否在合理范围（10%~35%）
  - 神职跳平民概率是否在合理范围（40%~70%）
  - 每局至少出现 1 次嘴瓢
  - 每局至少出现 1 次投票失误（投了好人）

Test 3: 回退测试
  - 设置 aiConfig.enabled = false → AI 行为回到原始逻辑
  - 验收标准：与原始版本表现一致

Test 4: 长期运行
  - 100 局连续运行
  - 验收标准：无内存泄漏、无状态污染
```

### 10.3 调优参数

根据测试结果调整以下参数：

| 参数 | 默认值 | 调优方向 |
|------|-------|---------|
| `seerClaimBaseThreshold` | 100 | 狼人跳预言家频率（调低则更频繁） |
| `slipChance` | 0.10 | 嘴瓢频率 |
| `noiseRange` | 2.0 | 投票随机扰动（调高则更不靠谱） |
| `bandwagonBase` | 0.4 | 从众效应（调高则更多跟票） |
| `templateWeight` | 0.3 | 人格模板比例（调高则更有辨识度） |

---

## 11. 风险与应对

| 风险 | 概率 | 影响 | 应对方案 |
|------|------|------|---------|
| AI 频繁跳身份导致游戏失衡 | 中 | 高 | 配置全局开关，调整 `seerClaimBaseThreshold` |
| AI 逻辑不一致被玩家看出是机器 | 低 | 低 | 增加嘴瓢、增加随机扰动 |
| 仿真 AI 决策性能下降 | 低 | 中 | 缓存 AIState，减少每次决策的计算量 |
| 遗忘系统导致 AI 无法做出有效决策 | 中 | 中 | 保底策略：遗忘率太高时启用"随机但合理"的 fallback |
| 多个 AI 之间的伪装互相冲突 | 中 | 中 | 在伪装决策中加入"已知跳身份玩家"的判定 |
| 玩家觉得 AI 太强（狼跳预言家太难识别） | 低 | 低 | 调高嘴瓢概率和逻辑漏洞频率 |

---

## 12. 附录：验收清单

### 功能验收

- [ ] AI 每局生成不同的人格参数
- [ ] 狼人 AI 会在优势局评估跳预言家
- [ ] 狼人 AI 跳预言家后会发查杀、带队、攻击对跳者
- [ ] 狼人 AI 如果被揭穿会情绪激动
- [ ] 预言家 AI 会跳平民并以平民视角带节奏
- [ ] 女巫 AI 会跳平民，在关键时刻才亮身份
- [ ] 猎人 AI 被投出后会报复性带人
- [ ] AI 会遗忘信息（尤其是低记忆力的 AI）
- [ ] AI 会嘴瓢，说出与身份矛盾的话
- [ ] AI 投票受从众效应和随机扰动影响
- [ ] AI 情绪状态会影响所有决策
- [ ] 关闭仿真 AI 开关后回退到原始逻辑

### 质量验收

- [ ] 所有现有测试用例通过
- [ ] 连续 10 局游戏无崩溃
- [ ] 每局 AI 行为无明显重复
- [ ] 玩家无法在 3 轮内判断某个玩家一定是 AI
- [ ] 代码覆盖率 ≥ 80%

### 部署验收

- [ ] 所有新增代码在 `roles/ai/` 目录下
- [ ] 不修改 `roles/*.js` 中的现有代码
- [ ] 配置项集中管理
- [ ] 有完善的调试日志
