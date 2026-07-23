# 仿真 AI 设计方案

> 让 AI 像人类一样思考、犯错、伪装、带节奏  
> 不修改任何现有代码，只替换 AI 决策模块内部逻辑

---

## 目录

1. [设计哲学](#1-设计哲学)
2. [AI 人格参数系统](#2-ai-人格参数系统)
3. [信息处理模型](#3-信息处理模型)
4. [角色身份认知与伪装策略](#4-角色身份认知与伪装策略)
5. [发言生成](#5-发言生成)
6. [投票逻辑](#6-投票逻辑)
7. [夜间行动模型](#7-夜间行动模型)
8. [情绪状态机](#8-情绪状态机)
9. [接口设计](#9-接口设计)
10. [全局参数配置](#10-全局参数配置)
11. [全流程示例](#11-全流程示例)

---

## 1. 设计哲学

### 核心原则

> **人不是"弱化的理性体"，而是"带了人格滤镜和伪装本能的信息处理器"**

传统 AI 是"根据真实身份做出最有效的动作"。  
仿真 AI 是**"根据真实身份、局势、人格，决定扮演一个什么角色、说什么话、带什么节奏"**。

关键区别：

| 维度 | 传统 AI | 仿真 AI |
|------|---------|---------|
| 身份 | 真实身份决定一切行为 | 真实身份决定目标，但表面身份可以伪装 |
| 决策 | 选最优解 | 选"看起来合理且符合自己利益"的解 |
| 信息 | 全知 | 带噪感知 + 选择性遗忘 |
| 错误 | 无 | 嘴瓢、情绪化、记忆偏差、判断失误 |
| 伪装 | 不伪装（或固定策略） | 根据局势动态决定是否跳身份、跳什么身份 |

### 三条设计准则

| 准则 | 解释 |
|------|------|
| **伪装本能** | 每个 AI 都会根据当前局势评估"隐藏真实身份"和"跳假身份"的收益 |
| **角色一致性** | 一旦选定伪装身份，后续言行要与该身份一致（除非情绪崩溃或嘴瓢） |
| **有限理性** | 所有决策都带随机扰动，没有"确定的最优解" |

---

## 2. AI 人格参数系统

### 2.1 六维人格空间

每个 AI 玩家在游戏开始时随机生成一组人格向量，整局生效。

| 参数 `key` | 范围 | 中文名 | 高分表现 | 低分表现 |
|-----------|------|--------|---------|---------|
| `aggression` | 0~10 | 激进程度 | 敢于跳身份、主动带节奏、硬刚 | 怂、随大流、不敢出头 |
| `paranoia` | 0~10 | 多疑程度 | 看谁都像狼、对跳身份高度警惕 | 轻信他人、很容易相信跳身份 |
| `stubbornness` | 0~10 | 固执程度 | 认定的事很难改变、一条路走到黑 | 容易被说服、见风使舵 |
| `memory` | 0~10 | 记性 | 准确记得所有人的发言和投票 | 忘掉关键信息、跳身份后忘了圆 |
| `eloquence` | 0~10 | 表达能力 | 编身份有条有理、骗术高明 | 语焉不详、跳身份漏洞百出 |
| `stability` | 0~10 | 情绪稳定性 | 被揭穿时沉着应对 | 被质疑就慌乱、自爆 |

### 2.2 人格生成策略

```javascript
function generatePersonality() {
    return {
        aggression:  randInt(0, 10),
        paranoia:    randInt(0, 10),
        stubbornness: randInt(0, 10),
        memory:      randInt(0, 10),
        eloquence:   randInt(0, 10),
        stability:   randInt(0, 10)
    };
}
```

**人格模板**（可选，30% 概率启用）：

| 模板 | aggression | paranoia | stubbornness | memory | eloquence | stability | 典型行为 |
|------|-----------|----------|-------------|-------|----------|----------|---------|
| 莽夫 | 9 | 3 | 7 | 4 | 3 | 5 | 狼人直接跳预言家，漏洞百出 |
| 阴谋家 | 5 | 8 | 8 | 7 | 7 | 8 | 深思熟虑后跳身份，逻辑严密 |
| 老实人 | 2 | 3 | 4 | 6 | 5 | 7 | 拿到神职也不会跳，老实说真话 |
| 糊涂蛋 | 4 | 5 | 3 | 2 | 3 | 4 | 跳了身份忘了自己跳的是什么 |
| 戏精 | 7 | 6 | 2 | 5 | 9 | 3 | 随心所欲跳身份，被戳穿就演下去 |
| 稳健派 | 3 | 7 | 6 | 8 | 6 | 9 | 神职藏得很好，狼人也不太敢跳 |

---

## 3. 信息处理模型

### 3.1 信息过滤管道

```
原始信息流（所有发言/投票/行动通知）
        │
        ▼
   ┌─────────────────┐
   │  记性过滤器      │ ← 根据 memory 参数决定保留比例
   │  每轮结束后，    │    memory=10 保留 100%
   │  按概率丢弃信息  │    memory=0  保留 40%
   └─────────────────┘
        │
        ▼
   ┌─────────────────┐
   │  偏见放大器      │ ← 根据 paranoia 参数
   │  对怀疑对象的    │    高多疑：将"中性发言"记成"可疑"
   │  信息做歪曲处理  │    低多疑：将"可疑发言"记为"中性"
   └─────────────────┘
        │
        ▼
   ┌─────────────────┐
   │  身份滤镜        │ ← AI 自己的伪装身份会影响判断
   │  如果 AI 跳了    │     狼跳预言家 → 倾向于认定真预言家在"悍跳"
   │  假身份，会      │     神跳平民   → 倾向于认为别人跳神职"不怀好意"
   │  产生确认偏差    │
   └─────────────────┘
        │
        ▼
    AI 的"主观事实"
```

### 3.2 遗忘机制

```javascript
function shouldForget(memory, eventImportance) {
    // eventImportance: 投票=1.0, 发言=0.6, 行动=0.8, 自己跳的身份=0.3（不容易忘）
    const forgetChance = (1 - memory / 12) * (1 / eventImportance);
    return Math.random() < forgetChance;
}
```

**关键**：自己主动说出去的话（跳身份、带节奏发言）遗忘概率降低，因为"自己说过的话容易记住"。

---

## 4. 角色身份认知与伪装策略

这是整套方案的核心。AI 不再"是什么就说什么"，而是根据**真实身份、局势、人格**三要素决策如何呈现自己。

### 4.1 伪装决策框架

```
输入：真实身份 + 局势 + 人格参数
        │
        ▼
   ┌─────────────────────────────┐
   │ 步骤1：评估当前风险          │
   │ · 我是否可能成为今晚目标？    │
   │ · 我的阵营是否优势？         │
   │ · 是否已经有人怀疑我？       │
   └──────────┬──────────────────┘
              ▼
   ┌─────────────────────────────┐
   │ 步骤2：选择表面身份          │
   │ · 保持真实身份（不伪装）      │
   │ · 跳平民（隐藏自己）          │
   │ · 跳某个神职（主动带节奏）    │
   └──────────┬──────────────────┘
              ▼
   ┌─────────────────────────────┐
   │ 步骤3：后续言行校验          │
   │ · 我的发言是否与表面身份一致？│
   │ · 我是否在无意中暴露了真实身份│
   │ · 我是否该改口/圆场？        │
   └─────────────────────────────┘
```

### 4.2 狼人伪装策略

#### 4.2.1 是否跳预言家？

狼人跳预言家是高风险高回报策略。AI 评估以下因素：

```javascript
function shouldClaimSeerAsWolf(engine, player, personality) {
    let score = 50; // 基准分，>100 则跳

    // 狼人阵营优势 → 更倾向于跳（可以利用高容错率搅局）
    const wolfCount = getAliveWolfCount(engine);
    const goodCount = getAliveGoodCount(engine);
    const wolfAdvantage = wolfCount / Math.max(1, goodCount);
    score += wolfAdvantage * 30;  // 狼人优势越大越敢跳

    // 激进程度 → 激进狼更敢跳
    score += personality.aggression * 6;

    // 表达能力 → 表达能力好才跳得像
    score += personality.eloquence * 4;

    // 是否有人已经跳预言家
    const alreadyClaimed = getSeerClaimants(engine);
    if (alreadyClaimed.length === 0) {
        score += 20; // 还没人跳，先跳为强
    } else if (alreadyClaimed.length === 1) {
        score += 10; // 有人跳了，可以考虑对跳
    } else {
        score -= 20; // 已经一堆人跳了，不凑热闹
    }

    // 情绪状态
    if (player.emotion === 'excited') score += 15;  // 激动时容易冲动跳
    if (player.emotion === 'nervous') score -= 20;  // 紧张时不敢跳

    // 随机扰动
    score += (Math.random() - 0.5) * 30;

    return score > 100;
}
```

#### 4.2.2 跳哪个身份？

| 身份 | 适用场景 | 风险 | 收益 |
|------|---------|------|------|
| **预言家** | 狼人优势大、还没人跳、aggression 高 | 高（容易被真预言家对跳戳穿） | 高（可以带队把好人投出去） |
| **女巫** | 需要自保、不想和预言家对跳 | 中（女巫可以毒人，容易被质疑） | 中（可以解释为什么没救人） |
| **猎人** | 劣势局搅局、想活到后期 | 低（猎人死前才有威胁） | 中（很少有人会揭穿猎人） |
| **平民** | 默认（什么都不跳） | 低 | 低 |

#### 4.2.3 狼人跳预言家后的行为规则

一旦狼人决定跳预言家，后续的发言必须与"我是一个预言家"一致：

- **查验结果**：编造一个查验结果，优先说"查杀"（查到的对象是狼人），因为查杀更有煽动性
- **验人逻辑**：需要解释为什么验了某人（"他上一轮发言很奇怪"、"他一直在划水"）
- **对立面处理**：
  - 如果有人对跳预言家 → 认定对方是悍跳狼，攻击对方
  - 如果没人对跳 → 继续带队，享受"坐实预言家"的待遇
- **遗忘风险**：如果 `memory` 很低，可能会忘记自己编的查验结果，前后矛盾

```javascript
function generateSeerFakeClaim(engine, player, personality) {
    // 选一个"查杀"目标
    const killTarget = selectFakeSeerTarget(engine, player);
    // 编一个查验结果
    const result = {
        target: killTarget,
        isWolf: true,  // 优先说查杀，更有煽动力
    };
    // 编一个查验理由
    const reason = pickFakeReason(killTarget, engine);

    return {
        claim: 'seer',
        fakeResult: result,
        reason: reason,
        confidence: personality.eloquence * 10 + (Math.random() * 20),
    };
}
```

#### 4.2.4 狼人跳其他身份的场景

| 场景 | 跳什么 | 话术 |
|------|-------|------|
| 被预言家查杀 | 跳平民，说预言家是假的 | "我不是狼，这个预言家一定是假的，大家别信他" |
| 被女巫威胁 | 跳猎人，震慑女巫别毒 | "我是猎人，想毒我就来" |
| 劣势局想搅浑 | 跳女巫，报假银水 | "我昨晚救了 X 号，他是好人" |

### 4.3 神职伪装策略

#### 4.3.1 是否跳平民？

预言家、女巫等神职在暴露身份后会被狼人刀，因此有强烈的动机隐藏身份。

```javascript
function shouldClaimVillagerAsPower(engine, player, personality) {
    let score = 0;

    // 目前安全吗？
    const isSuspected = isPlayerSuspected(engine, player.seat);
    if (isSuspected) score += 30;  // 被怀疑了，更要藏

    // 狼人数量
    const wolfCount = getAliveWolfCount(engine);
    score += wolfCount * 5;  // 狼越多越要藏

    // 女巫的解药是否还在？
    if (player.role === 'seer' && witchHasSave(engine)) {
        score -= 10; // 女巫有解药，被刀了还能救
    }

    // 人格因素
    score -= personality.aggression * 4;  // 激进的更倾向于亮身份带队
    score += personality.stability * 3;   // 稳定的更倾向于稳健隐藏

    // 随机扰动
    score += (Math.random() - 0.5) * 20;

    // score > 50 → 跳平民
    return score > 50;
}
```

#### 4.3.2 神职跳平民后的"带节奏"策略

隐藏身份不等于不做事。神职跳平民后，通过"以一个平民的视角"来影响讨论方向。

**预言家带节奏：**

| 真实行动 | 伪装话术 | 效果 |
|---------|---------|------|
| 查验 2 号是好人 | "我是平民，我觉得 2 号的发言应该不是狼" | 保护好人，又不暴露自己 |
| 查验 3 号是狼人 | "我是平民，但我看 3 号的行动很可疑，大家注意一下" | 带票出狼，不暴露身份 |
| 没有明确信息 | "我是平民，目前没什么特别的想法，先听听大家的" | 混在人群中 |

**女巫带节奏：**

| 真实行动 | 伪装话术 | 效果 |
|---------|---------|------|
| 夜里救了某人 | "我是平民，我觉得 X 号昨晚都没被刀应该是个好人吧？" | 递话暗示 |
| 夜里毒了某人 | "我是平民，昨天 X 号的发言太像狼了" | 为自己的毒人做铺垫 |
| 没人可救 | "我是平民，今晚应该没人死吧？" | 试探信息 |

#### 4.3.3 神职何时亮身份？

```javascript
function shouldRevealIdentity(engine, player, personality) {
    // 只有在危急时才亮身份

    // 1. 即将被投票出局
    if (isAboutToBeVotedOut(engine, player.seat)) {
        return true;
    }

    // 2. 自己的查验结果非常重要，不说出来好人要输
    if (player.role === 'seer' && hasCriticalInfo(engine, player)) {
        return personality.stability < 6; // 不稳定的预言家憋不住
    }

    // 3. 女巫需要正视角
    if (player.role === 'witch' && canConfirmWithSave(engine, player)) {
        return personality.stability < 4; // 情绪化女巫忍不住炫耀
    }

    // 4. 人格因素
    if (personality.aggression > 7 && Math.random() < 0.3) {
        return true; // 激进的憋不住
    }

    return false;
}
```

#### 4.3.4 神职的"身份矛盾"处理

神职跳平民最怕的是：

1. **被预言家查杀** → "我是平民，他一定是假预言家"（硬着头皮圆）
2. **被狼人跳自己身份** → 看情况决定是否对跳
3. **被要求拍身份** → 用"我是平民，你们不用管我是谁"搪塞
4. **自己不小心说漏嘴**（受 `memory` 和 `stability` 影响）→ 改口/圆场

### 4.4 各角色伪装策略总表

| 真实身份 | 表面身份 | 适用场景 | 带节奏方式 | 翻车风险 |
|---------|---------|---------|-----------|---------|
| **狼人** | 预言家 | 优势局、没人跳 | 发假查杀、带队出好人 | 真预言家对跳 |
| **狼人** | 预言家 | 劣势局搅浑 | 乱发查杀、扰乱视线 | 逻辑漏洞被抓住 |
| **狼人** | 猎人或平民 | 不想引人注目 | 跟风投票、划水 | - |
| **狼人** | 女巫 | 被查杀时反打 | 报假银水、说真女巫是狼 | 真女巫毒你 |
| **预言家** | 平民 | 默认策略 | 以平民视角输出查验结论 | 发言太像神被狼抿出来 |
| **预言家** | 平民 | 被怀疑时 | 假装平民自证、实则带节奏 | 被投票出局 |
| **女巫** | 平民 | 默认策略（尤其解药用完后） | 暗示谁被救了、谁可疑 | 狼人抿出你是女巫 |
| **女巫** | 平民 | 毒人后 | 用平民视角解释为什么此人该毒 | 暴露信息 |
| **猎人** | 平民 | 默认策略 | 低调跟票 | 被投票出局忘了亮身份 |
| **猎人** | 平民 | 被投票出局时 | "我是猎人，你们投错人了" | - |

---

## 5. 发言生成

### 5.1 发言动机选择

发言动机由**真实身份**和**表面身份**共同决定，AI 可能为了维持伪装而选择与真实动机不同的发言：

```
当前信息 + 人格参数 + 伪装身份
        │
        ▼
   ┌─────────────────────────────────────┐
   │ 选择发言动机                          │
   │                                      │
   │ 狼人（真实）→ 但表面是预言家 →        │
   │   动机：发查杀、带队、攻击真预言家    │
   │                                      │
   │ 预言家（真实）→ 但表面是平民 →        │
   │   动机：以平民口吻输出有价值信息      │
   │                                      │
   │ 任何人 → 表面是真实身份 →             │
   │   动机：根据真实意图发言              │
   └─────────────────────────────────────┘
```

### 5.2 发言模板

按角色和伪装身份分类模板：

#### 狼人跳预言家模板

```
"我是预言家，昨晚查了 {seat} 号，他是狼人。"
"我第 {n} 晚查的是 {seat} 号，查杀！"
"{x} 号跟我对跳是吧？那你就是狼，大家信我的跟我走。"
"我的验人逻辑是：{seat} 号上一轮发言太划水了，所以验了他。"
"昨晚 {seat} 号倒牌了，我本来想验他的，可惜了。"
```

#### 预言家/女巫跳平民带节奏模板

```
"我是平民，但我感觉 {seat} 号的发言不太像好人。"
"我是平民，我觉得 {seat} 号说的有道理。"
"我是平民，{seat} 号如果是狼不会这么说的。"
"我没什么特别的身份，就是个平民，但我想说 {seat} 号真的可疑。"
"虽然我是平民，但我建议大家关注一下 {seat} 号。"
```

#### 神职被逼亮身份模板

```
"好吧，我是预言家，{seat} 号是我查出来的狼。"
"我本来不想说的，我是女巫，昨晚我救了/毒了 {seat} 号。"
"行吧我是猎人，你们别投我，我有枪。"
"算了不装了，我是女巫，解药已经用了。"
```

#### 嘴瓢/穿帮模板

```
"我是预言...呃，我是平民，我刚才说错了。"
"我觉得 {seat} 号是好人...等等，我是说我不确定。"
"我昨晚...我是说白天，我看到 {seat} 号很可疑。"
```

### 5.3 嘴瓢机制

AI 有 5%~15% 的概率（受 `stability` 影响）说出与当前伪装身份冲突的话：

```javascript
function maybeSlipOfTongue(intendedContent, player) {
    const slipChance = 0.15 - player.personality.stability * 0.01;
    if (Math.random() < slipChance) {
        // 两种嘴瓢：
        // 1. 说漏真实身份
        if (Math.random() < 0.3) return revealRealRole(player);
        // 2. 前后矛盾
        return contradictPreviousClaim(player);
    }
    return intendedContent;
}
```

---

## 6. 投票逻辑

### 6.1 投票目标加权

投票不再是简单看"谁是狼"，而是**伪装身份和真实身份共同作用**：

```javascript
function decideVote(candidates, engine, player) {
    const personality = player.personality;
    const weights = candidates.map(c => {
        let score = 0;

        // 基础分：基于信息的怀疑程度
        score += computeSuspicion(c, engine) * 3;

        // 伪装身份影响
        if (player.fakeRole === 'seer') {
            // 狼跳预言家：优先投不跟自己票的人
            if (didNotFollowMyLead(c)) score += 5;
            // 投自己"查杀"的人
            if (c.seat === player.fakeKillTarget) score += 10;
        }

        if (player.fakeRole === 'villager' && player.role === 'seer') {
            // 预言家跳平民：投自己查验出的狼人
            if (isInvestigatedWolf(c)) score += 8;
            // 保护自己验出的好人
            if (isInvestigatedGood(c)) score -= 5;
        }

        // 从众效应
        score += getBandwagonBonus(c, engine) * (1 - personality.aggression / 12);

        // 固执加成
        if (previouslySuspected(c, player)) {
            score += personality.stubbornness * 0.5;
        }

        // 随机扰动
        score += (Math.random() - 0.5) * 2;

        return Math.max(0, score);
    });

    return weightedRandomSelect(candidates, weights);
}
```

### 6.2 狼人冲票/分票策略

```
狼人冲票：所有狼人投同一个人 → 快速把人投出局
  - 条件：优势局、有明确的冲票目标（如真预言家）
  - 风险：容易被看出是团队作案

狼人分票：狼人分散投票 → 伪装成散票玩家
  - 条件：劣势局、不想暴露团队
  - 风险：目标票数不够，投不出人
```

```javascript
function getWolfVoteStrategy(engine, player) {
    const aliveWolves = getAliveWolves(engine);
    const wolfRatio = aliveWolves.length / getAliveCount(engine);

    if (wolfRatio > 0.4 && player.personality.aggression > 6) {
        return 'rush';  // 冲票
    }
    if (wolfRatio > 0.25 && player.personality.aggression > 4) {
        return 'semi_rush'; // 半冲票（大部分跟，一个分票）
    }
    return 'scatter'; // 分票
}
```

---

## 7. 夜间行动模型

### 7.1 狼人夜间决策

狼人夜间不仅要决定刀谁，还要考虑"这一刀是否符合我白天说的话"。

```javascript
function wolfKillDecision(engine, player, personality) {
    const aliveTargets = getAliveNonWolves(engine);

    // 如果狼人白天跳了预言家
    if (player.fakeRole === 'seer') {
        // 应该刀自己"查杀"的人，制造"预言家查杀精准"的假象
        const fakeKillTarget = findPlayerBySeat(player.fakeKillTarget);
        if (fakeKillTarget && fakeKillTarget.isAlive) {
            // 但不要太刻意，概率执行
            if (Math.random() < 0.6) return fakeKillTarget.seat;
        }
        // 或者刀真预言家（灭口）
        const realSeer = findRealSeer(engine);
        if (realSeer && realSeer.isAlive && Math.random() < 0.7) {
            return realSeer.seat;
        }
    }

    // 如果狼人跳了平民
    // 优先刀疑似神职
    const suspects = getSuspectedPowerRoles(engine);
    if (suspects.length > 0 && Math.random() < 0.7) {
        return weightedRandomSelect(suspects);
    }

    // 常规：刀自己怀疑的人
    const mySuspects = buildSuspectList(aliveTargets, player);
    if (mySuspects.length > 0) {
        return weightedRandomSelect(mySuspects);
    }

    // 随机（带遗忘的狼人）
    return randomChoice(aliveTargets);
}
```

### 7.2 预言家夜间决策

预言家的查验策略受"跳平民伪装"的影响：

```javascript
function seerInvestigateDecision(engine, player, personality) {
    // 如果跳了平民，优先查验"可能和自己对立的玩家"
    if (player.fakeRole === 'villager') {
        // 查那些跳神职的人——验证他们是不是真神
        const claimedPower = getClaimedPowerRoles(engine);
        if (claimedPower.length > 0 && Math.random() < 0.6) {
            return weightedRandomSelect(claimedPower);
        }
    }

    // 查自己怀疑的人
    const suspects = buildSuspectList(player);
    if (suspects.length > 0) {
        return weightedRandomSelect(suspects);
    }

    // 查没信息的人
    return randomChoice(getAlivePlayers(engine));
}
```

### 7.3 女巫夜间决策

女巫的解药/毒药使用受"想隐藏身份"的影响：

```javascript
function witchDecide(engine, player, personality) {
    const killedTonight = getTonightKilled(engine);
    const action = { save: false, kill: null };

    // 解药决策
    if (player.hasSave && killedTonight) {
        let saveChance = 50;

        // 被刀的人是自己查验过的好人？
        if (isKnownGood(killedTonight)) saveChance += 30;
        // 被刀的人是自己的怀疑对象？
        if (isSuspected(killedTonight)) saveChance -= 30;
        // 想隐藏身份 → 救人概率降低（怕暴露）
        if (player.fakeRole === 'villager') saveChance -= 15;

        // 随机扰动
        saveChance += (Math.random() - 0.5) * 20;

        if (saveChance > 50) {
            action.save = true;
        }
    }

    // 毒药决策
    if (player.hasKill) {
        let killChance = 25; // 女巫通常不太敢用毒

        // 有明确的狼人目标？
        const wolfTarget = getConfirmedWolf(engine, player);
        if (wolfTarget) killChance += 30;

        // 想隐藏身份 → 用毒概率降低
        if (player.fakeRole === 'villager') killChance -= 10;
        // 激进的更敢于用毒
        killChance += personality.aggression * 3;

        if (Math.random() * 100 < killChance) {
            action.kill = wolfTarget || randomChoice(getAlivePlayers(engine));
        }
    }

    return action;
}
```

---

## 8. 情绪状态机

### 8.1 状态定义

```
          ┌──────────┐
          │  平静     │ ← 初始状态
          └────┬─────┘
               │ 被攻击 1 次
               ▼
          ┌──────────┐
          │  紧张     │ → 发言变短、开始自证、容易穿帮
          └────┬─────┘
               │ 被攻击 2 次+ / 被揭穿
               ▼
          ┌──────────┐
          │  激动     │ → 冲动行事（狼人自爆、神职亮身份、乱咬人）
          └────┬─────┘
               │ 被投票出局
               ▼
          ┌──────────┐
          │  报复     │ → 遗言乱咬人，赌气性质
          └──────────┘
```

### 8.2 情绪对伪装的影响

| 状态 | 伪装能力 | 亮身份概率 | 嘴瓢概率 | 典型行为 |
|------|---------|-----------|---------|---------|
| 平静 | 正常 | 低 | 5%~10% | 正常伪装 |
| 紧张 | 下降 30% | 中 | 15%~25% | 狼人跳预言家开始语无伦次 |
| 激动 | 下降 50% | 高 | 30%~50% | 神职憋不住亮身份、狼人自爆 |
| 报复 | 崩溃 | 必然 | 极高 | 遗言乱咬人，不管真假 |

### 8.3 情绪触发

```javascript
function updateEmotion(player, engine) {
    const personality = player.personality;
    let state = player.emotion || 'calm';

    // 被攻击次数
    const attackCount = getAttacksOnPlayer(engine, player.seat);
    if (attackCount >= 3) {
        state = 'excited';
    } else if (attackCount >= 1) {
        state = 'nervous';
    }

    // 被揭穿伪装 → 直接激动
    if (wasFakeRoleExposed(engine, player)) {
        state = personality.stability > 6 ? 'nervous' : 'excited';
    }

    // 情绪稳定性缓冲
    if (state === 'nervous' && personality.stability > 7) {
        state = 'calm'; // 高稳定性的不轻易紧张
    }

    // 被投票出局 → 报复
    if (wasJustVotedOut(engine, player.seat) && state === 'excited') {
        state = 'revenge';
    }

    player.emotion = state;
}
```

---

## 9. 接口设计

### 9.1 现有接口（保持不变）

```javascript
// 狼人决策 — 返回目标 seat
function processWerewolfAction(engine, player) → { target: number }

// 预言家决策
function processSeerAction(engine, player) → { target: number }

// 女巫决策
function processWitchAction(engine, player) → { action, target }

// 猎人决策
function processHunterAction(engine, player) → { target: number }

// AI 发言
function generateAiSpeech(engine, player) → string

// AI 投票
function generateAiVote(engine, player) → number
```

### 9.2 新增数据结构

```javascript
// 每个 AI 玩家新增的运行时属性（不在 player 持久数据中，仅在决策时使用）
AIState = {
    // 人格（每局随机生成）
    personality: {
        aggression:  number,  // 0-10
        paranoia:    number,  // 0-10
        stubbornness: number, // 0-10
        memory:      number,  // 0-10
        eloquence:   number,  // 0-10
        stability:   number,  // 0-10
    },
    // 情绪状态
    emotion: 'calm' | 'nervous' | 'excited' | 'revenge',
    // 伪装身份
    disguise: {
        fakeRole: 'villager' | 'seer' | 'witch' | 'hunter' | null,  // null = 不伪装
        claimedRound: number,  // 第几轮跳的身份
        fakeKillTarget: number | null,  // 狼跳预言家时的查杀对象
        fakeSaveTarget: number | null,  // 狼跳女巫时的银水对象
    },
    // 记忆（本轮记住的事件）
    memory: {
        speeches:    Array,  // 记住的发言
        votes:       Array,  // 记住的投票
        nightKills:  Array,  // 记住的夜间死亡
        claims:      Array,  // 记住的跳身份事件
    }
}
```

### 9.3 注入方式

```javascript
// 方案 A：在原函数入口注入 AIState
// roles/werewolf.js → processWerewolfAction 内部
function processWerewolfAction(engine, player) {
    const aiState = getOrCreateAIState(player);  // 首次调用时创建
    const personality = aiState.personality;
    const disguise = aiState.disguise;
    // ... 带人格、伪装、情绪的决策逻辑
}

// 方案 B：代理模式（不改原文件）
const original = require('./roles/werewolf').processWerewolfAction;
exports.processWerewolfAction = function(engine, player) {
    ensureAIState(player);  // 注入 AI state
    return simulateHumanDecision(engine, player, 'werewolf');
};
```

推荐 **方案 A**——直接在原函数体内替换为仿真逻辑，直觉、好维护。

---

## 10. 全局参数配置

```javascript
aiConfig: {
    // 人格系统
    personality: {
        enabled: true,             // 是否启用
        useTemplates: true,        // 是否使用人格模板
        templateWeight: 0.3,       // 模板概率 vs 纯随机
    },
    // 伪装系统
    disguise: {
        enabled: true,             // 是否启用伪装逻辑
        wolf: {
            seerClaimEnabled: true,       // 狼是否能跳预言家
            seerClaimBaseThreshold: 100,   // 跳预言家阈值基准
            otherClaimsEnabled: true,      // 狼是否能跳其他神职
        },
        powerRole: {
            villagerClaimEnabled: true,    // 神是否能跳平民
            revealThreshold: 60,           // 亮身份阈值
        }
    },
    // 发言系统
    speech: {
        slipChanceBase: 0.10,      // 嘴瓢基础概率
        minResponseMs: 2000,        // 最小"思考时间"
        maxResponseMs: 8000,        // 最大"思考时间"
    },
    // 投票系统
    voting: {
        noiseRange: 2.0,           // 随机扰动强度
        bandwagonBase: 0.4,        // 从众效应基础系数
        wolfRushThreshold: 0.4,    // 狼人冲票比例阈值
    },
    // 情绪系统
    emotion: {
        enabled: true,              // 是否启用
        attackToNervous: 1,         // 几次攻击进入紧张
        attackToExcited: 3,         // 几次攻击进入激动
    },
    // 调试
    debug: {
        showAIState: false,         // 是否在 UI 显示 AI 状态（仅测试用）
    }
}
```

---

## 11. 全流程示例

### 12 人局：狼人阵营

**配置：** 3 狼人、1 预言家、1 女巫、1 猎人、6 平民

#### AI-1（狼人）：激进 8，多疑 3，记忆 7，表达 6，固执 4，稳定 6 ← 阴谋家模板

**第一夜**
- 夜间行动：决定刀 5 号（随机选了一个非狼人）
- 伪装决策：评估局势→狼人优势一般（3:9）→ aggression 8 → "我要跳预言家"

**第一天白天**
- 发言：**"我是预言家，昨晚查了 5 号，他是狼人！"**
- 真预言家（6 号）对跳：**"我才是真预言家，昨晚查了 3 号是好人，这个 1 号一定是悍跳狼！"**
- AI-1 反应（固执 4 → 容易被说服）：但 aggression 8 → 硬刚
- **"6 号你才是狼！你编不出查杀，只能编个金水！大家跟我走，今天出 5 号！"**

**投票环节**
- AI-1 投票 5 号（自己编的查杀目标）
- 另一狼人（AI-2，aggression 3）→ 犹豫 → 跟风投了 5 号
- 第三狼人（AI-3，aggression 6）→ 冲票 5 号
- 好人阵营票型分散 → **5 号（平民）被投票出局**

**第一夜再次**
- AI-1 满意：自己的预言家身份坐实了
- 夜间行动：刀真预言家（6 号）

**第二天白天**
- 6 号（真预言家）倒牌
- AI-1（悲愤）：**"6 号果然是预言家，狼人太狠了。但我还在，我是真的预言家！"**
- 发言：**"昨晚我查了 8 号，查杀！狼人团队浮出水面了！"**（其实编的）
- 8 号（女巫）→ 跳平民带节奏：**"我是平民，但我觉得 1 号跳得太急了，不太像真预言家"**
- AI-1（情绪：平静，没被攻击）→ **"8 号你就是在保队友！今天出 8 号！"**

---

#### AI-8（女巫）：激进 2，多疑 7，记忆 8，表达 6，固执 6，稳定 9 ← 稳健派模板

**第一夜**
- 夜间行动：首夜救了被刀的 9 号
- 伪装决策：我是女巫，不能暴露 → 跳平民

**第一天白天**
- 1 号跳预言家 → AI-8 判断（paranoia 7 → 高度警惕）：
  - "1 号跳得太急了，不太像真预言家"
  - 但真预言家 6 号也对跳了 → 观望
- 发言（跳平民）：**"我是平民，暂时看不出谁是真的，再听听。"**

**投票**
- 由于 1 号（狼）带节奏、好人分散 → 5 号被投出
- AI-8 投票 1 号（但成了少数票）

**第二天**
- 6 号（真预言家）死亡
- AI-8 确认："1 号是铁狼了"
- 但依然不亮身份（stability 9 → 沉得住气）
- 发言（跳平民带节奏）：**"我是平民，但我想说，如果 1 号是真预言家，为什么狼人刀的是 6 号？狼人帮真预言家清场吗？"**
- → 逻辑上有力，又不暴露自己

**入夜**
- AI-8 用毒药毒了 1 号（狼人）

**第三天**
- 1 号死亡 → 游戏继续
- AI-8 发言：**"看来 1 号果然是狼，我也跟着大家投对人了"**（假装自己是蒙的）

---

#### AI-6（真预言家）：激进 5，多疑 5，记忆 7，表达 7，固执 5，稳定 6 ← 普通

**第一夜**
- 查验 3 号 → 好人

**第一天白天**
- 1 号先跳预言家 → AI-6 必须对跳
- 发言：**"我才是真预言家，昨晚查了 3 号是好人。1 号一定是悍跳狼！"**
- 但没扛过狼人冲票

**第一夜（被刀）**
- 遗言：**"我是真预言家，1 号是狼，3 号是我的金水。大家不要被狼人骗了。"**

---

### 最终结果

- 狼人阵营因为 1 号成功跳预言家，获得了 2 天的带队权
- 女巫 8 号虽然赢了信息战，但隐藏身份导致好人阵营第一天投票失误
- 预言家 6 号虽然尽力，但被狼队冲票出局

**关键看点：**
- 1 号（狼跳预言家）→ 行为符合"激进、表达尚可、善于伪装"的人格
- 8 号（女巫跳平民）→ 行为符合"沉稳、多疑、不轻易亮底牌"的人格
- 6 号（真预言家被冲出去）→ 不是因为他表现差，而是狼人团队策略成功
- 整个过程中每个 AI 的行为都是可理解的、像真实玩家的

---

## 附录：文件结构

```
现有文件结构                      变化
─────────────────────────────────────────────────────
roles/
├── werewolf.js        ← 替换内部决策逻辑，接口不变
├── seer.js            ← 替换内部决策逻辑，接口不变
├── witch.js           ← 替换内部决策逻辑，接口不变
├── hunter.js          ← 替换内部决策逻辑，接口不变
├── ai-speech.js       ← 替换发言生成逻辑（含伪装身份匹配）
└── ai-vote.js         ← 替换投票逻辑

新增文件
├── ai-state.js        ← AI 状态管理（人格、情绪、伪装身份）
├── ai-personality.js  ← 人格生成与管理
├── ai-emotion.js      ← 情绪状态机
├── ai-disguise.js     ← 伪装策略引擎（核心新增）
├── ai-memory.js       ← 信息过滤与遗忘
└── ai-utils.js        ← 加权随机、模板引擎等工具函数
```

所有现有游戏流程（phase 流转、计时器、事件触发）都不需要修改。  
每个 AI 决策节点的入参和返回值格式保持不变，只替换"中间怎么算的"。
