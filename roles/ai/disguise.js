// ========== AI 伪装策略引擎 ==========

const { getOrCreateAIState, setDisguise } = require('./AIState');
const { getModifiedParams } = require('./emotion');
const { getMemory, getRememberedClaims } = require('./memory');
const { weightedRandomSelect, chance, randInt, jitter } = require('./utils');

/**
 * 评估并决定 AI 的伪装策略
 * @param {object} engine - 游戏引擎
 * @param {object} player - AI 玩家
 * @returns {object} disguise 状态
 */
function evaluateDisguise(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return { fakeRole: null };

  // 一局只评估一次（后续由其他逻辑触发重新评估）
  if (state._disguiseEvaluated) return state.disguise;

  let result;

  switch (player.role) {
    case 'werewolf':
      result = evaluateWolfDisguise(engine, player);
      break;
    case 'seer':
    case 'witch':
    case 'hunter':
      result = evaluatePowerRoleDisguise(engine, player);
      break;
    default:
      // 平民不需要伪装
      result = { fakeRole: null };
  }

  setDisguise(player, result);
  return result;
}

// ==================== 狼人伪装 ====================

/**
 * 狼人伪装评估
 */
function evaluateWolfDisguise(engine, player) {
  const state = getOrCreateAIState(player);
  const p = state.personality;
  const mod = getModifiedParams(player);

  // 选项池：初始权重
  const options = [
    { role: null, label: '不伪装', weight: 30 },
    { role: 'villager', label: '跳平民', weight: 50 },
    { role: 'seer', label: '跳预言家', weight: 0 },
    { role: 'witch', label: '跳女巫', weight: 0 },
    { role: 'hunter', label: '跳猎人', weight: 0 },
  ];

  // ===== 跳预言家评分 =====
  let seerScore = 0;

  // 狼人阵营优势
  const wolfCount = getAliveWolfCount(engine);
  const totalAlive = getAliveCount(engine);
  const wolfRatio = wolfCount / Math.max(1, totalAlive);

  seerScore += wolfRatio * 30;          // 狼占比越高越敢跳
  seerScore += p.aggression * 6;        // 激进的敢跳
  seerScore += p.eloquence * 4;         // 表达好才跳得像
  seerScore += mod.aggressionBonus * 3; // 情绪加成
  seerScore += (Math.random() - 0.5) * 30; // 随机扰动

  // 是否有人跳预言家了
  const seerClaimants = getSeerClaimants(engine);
  if (seerClaimants.length === 0) {
    seerScore += 25; // 没人跳，先跳为强
  } else if (seerClaimants.length === 1) {
    seerScore += 15; // 可以悍跳
  } else {
    seerScore -= 20; // 太多人跳了，不凑热闹
  }

  if (seerScore > 100) {
    options[2].weight = Math.min(80, seerScore - 50);
  }

  // ===== 跳女巫评分（被查杀时反打） =====
  if (isBeingAccused(engine, player.seat)) {
    options[3].weight = p.eloquence * 5 + (Math.random() * 20) + 20;
  }

  // ===== 跳猎人评分（劣势局搅局） =====
  if (wolfRatio < 0.2) {
    options[4].weight = p.aggression * 4 + (Math.random() * 20) + 10;
  }

  // 加权随机选择
  const selected = weightedRandomSelect(options, options.map(o => o.weight));

  if (selected.role === 'seer') {
    const fakeTarget = selectFakeSeerTarget(engine, player);
    return {
      fakeRole: 'seer',
      fakeKillTarget: fakeTarget,
      fakeReason: generateFakeReason(engine, player, fakeTarget),
    };
  }

  return { fakeRole: selected.role };
}

// ==================== 神职伪装 ====================

/**
 * 神职（预言家/女巫/猎人）伪装评估
 */
function evaluatePowerRoleDisguise(engine, player) {
  const state = getOrCreateAIState(player);
  const p = state.personality;
  const mod = getModifiedParams(player);

  let score = 0;

  // 被怀疑了？→ 更想藏
  if (isPlayerSuspected(engine, player.seat)) score += 30;

  // 狼人数量多？→ 更想藏
  const wolfCount = getAliveWolfCount(engine);
  score += wolfCount * 5;

  // 女巫有解药 → 预言家可以稍微不怕
  if (player.role === 'seer' && witchHasSave(engine)) score -= 10;

  // 预言家验到关键信息 → 更想活，更想藏
  if (player.role === 'seer' && wolfCount >= 2) score += 15;

  // 人格因素
  score -= p.aggression * 4;   // 激进的更想亮身份带队
  score += p.stability * 3;    // 稳定的更喜欢藏

  // 情绪影响
  score += mod.revealChance * 20; // 情绪波动时藏不住

  // 随机扰动
  score += (Math.random() - 0.5) * 20;

  const shouldHide = score > 50;

  if (shouldHide) {
    return { fakeRole: 'villager' };
  }
  return { fakeRole: null };
}

// ==================== 亮身份判定 ====================

/**
 * 判定 AI 是否应该亮出真实身份
 */
function shouldReveal(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state || !state.disguise || !state.disguise.fakeRole) return false;

  const p = state.personality;

  // 即将被投票出局
  if (isAboutToBeVotedOut(engine, player.seat)) {
    // 高稳定性的可以忍到最后，低稳定性的憋不住
    if (p.stability > 7 && Math.random() < 0.3) return false;
    return true;
  }

  // 有重要信息没说（预言家验到狼）
  if (player.role === 'seer' && hasUnrevealedWolf(engine, player)) {
    return p.stability < 6;
  }

  // 女巫想正视角
  if (player.role === 'witch' && Math.random() < 0.15) {
    return p.stability < 5;
  }

  return false;
}

// ==================== 辅助函数 ====================

/**
 * 获取存活狼人数
 */
function getAliveWolfCount(engine) {
  if (!engine || !engine.room) return 0;
  try {
    return Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.role === 'werewolf').length;
  } catch (e) { return 0; }
}

/**
 * 获取存活玩家总数
 */
function getAliveCount(engine) {
  if (!engine || !engine.room) return 0;
  try {
    return Array.from(engine.room.players.values())
      .filter(p => p.isAlive).length;
  } catch (e) { return 0; }
}

/**
 * 获取已经跳预言家的玩家 seat 列表
 */
function getSeerClaimants(engine) {
  // 从引擎日志中查找声称自己是预言家的人
  const claimants = [];
  try {
    // 从 AI 的记忆系统中查找
    if (engine && engine.room) {
      for (const p of engine.room.players.values()) {
        const aiState = getOrCreateAIState(p);
        if (aiState && aiState.disguise && aiState.disguise.fakeRole === 'seer') {
          claimants.push(p.seat);
        }
      }
    }
  } catch (e) { /* ignore */ }
  return claimants;
}

/**
 * 玩家是否正在被指控
 */
function isBeingAccused(engine, seat) {
  if (!engine || !engine.getLogs) return false;
  try {
    const logs = engine.getLogs();
    if (!logs) return false;
    for (const log of logs.slice(-15)) {
      if (log.content && log.content.includes(`${seat}号`) &&
        (log.content.includes('狼') || log.content.includes('可疑') ||
         log.content.includes('投票') || log.content.includes('出局'))) {
        return true;
      }
    }
  } catch (e) { /* ignore */ }
  return false;
}

/**
 * 玩家是否被怀疑
 */
function isPlayerSuspected(engine, seat) {
  return isBeingAccused(engine, seat);
}

/**
 * 玩家是否即将被投票出局
 */
function isAboutToBeVotedOut(engine, seat) {
  // 简单实现：如果在最近的发言中多次被提到要投票
  if (!engine || !engine.getLogs) return false;
  let mentionCount = 0;
  try {
    const logs = engine.getLogs();
    if (!logs) return false;
    for (const log of logs.slice(-10)) {
      if (log.content && log.content.includes(`${seat}号`) &&
        log.content.includes('票')) {
        mentionCount++;
      }
    }
  } catch (e) { /* ignore */ }
  return mentionCount >= 2;
}

/**
 * 女巫是否还有解药
 */
function witchHasSave(engine) {
  if (!engine || !engine.room) return true;
  try {
    for (const p of engine.room.players.values()) {
      if (p.role === 'witch' && p.hasSave === false) return false;
    }
  } catch (e) { /* ignore */ }
  return true;
}

/**
 * 预言家是否验到了狼但还没说
 */
function hasUnrevealedWolf(engine, player) {
  // 这个需要从引擎中查询预言家之前的查验结果
  // 简化为：如果预言家存活且记录中有查到狼人
  try {
    // 这里依赖 game-engine 的 investigatedList 或类似机制
    // 暂时无法获取具体数据就返回 false
    return false;
  } catch (e) { return false; }
}

/**
 * 狼人选择假查杀目标
 */
function selectFakeSeerTarget(engine, player) {
  const state = getOrCreateAIState(player);
  if (!engine || !engine.room) return 0;

  try {
    const alivePlayers = Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.seat !== player.seat && p.role !== 'werewolf');

    if (!alivePlayers.length) return 0;

    // 优先选不是狼人的
    const nonWolves = alivePlayers.filter(p => p.role !== 'werewolf');
    if (nonWolves.length > 0 && Math.random() < 0.8) {
      return nonWolves[Math.floor(Math.random() * nonWolves.length)].seat;
    }
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].seat;
  } catch (e) { return 0; }
}

/**
 * 编造查验理由
 */
function generateFakeReason(engine, player, targetSeat) {
  const reasons = [
    '他上一轮发言划水',
    '他位置比较偏',
    '他投票跟风太明显',
    '他一直在带节奏',
    '他发言前后矛盾',
    '他太安静了，不正常',
    '他总盯着我',
  ];
  return reasons[Math.floor(Math.random() * reasons.length)];
}

module.exports = {
  evaluateDisguise,
  shouldReveal,
  // 导出辅助函数供其他模块使用
  getAliveWolfCount,
  getAliveCount,
  getSeerClaimants,
  isBeingAccused,
  isPlayerSuspected,
  isAboutToBeVotedOut,
  witchHasSave,
};
