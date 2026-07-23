// ========== AI 仿真投票 ==========

const { getOrCreateAIState } = require('./AIState');
const { updateEmotion, getModifiedParams } = require('./emotion');
const { getMemory, getMemoryAbout } = require('./memory');
const { getAliveWolfCount } = require('./disguise');
const { weightedRandomSelect, chance, jitter } = require('./utils');

/**
 * 生成 AI 投票目标
 * @param {object} engine - 游戏引擎
 * @param {object} player - AI 玩家
 * @returns {number} 目标 seat（0 = 弃权）
 */
function generateVote(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return 0;

  const p = state.personality;
  const mod = getModifiedParams(player);

  // 更新情绪
  updateEmotion(engine, player);

  // 获取候选玩家
  let candidates = [];
  try {
    candidates = Array.from(engine.room.players.values())
      .filter(c => c.isAlive && c.seat !== player.seat);
  } catch (e) {
    return 0;
  }

  if (!candidates.length) return 0;

  // 计算每个候选人的得分
  const weights = candidates.map(c => {
    return computeVoteScore(engine, player, c, state, p, mod);
  });

  // 弃权判定
  if (p.aggression < 3 && chance(0.15)) return 0;
  if (mod.aggressionBonus < 0 && chance(0.1)) return 0;

  const selected = weightedRandomSelect(candidates, weights);
  return selected ? selected.seat : 0;
}

/**
 * 计算对一个候选人的投票得分
 */
function computeVoteScore(engine, player, candidate, state, p, mod) {
  let score = 0;

  // ===== 1. 基础怀疑分 =====
  score += computeSuspicionScore(engine, player, candidate, state);

  // ===== 2. 伪装身份影响 =====
  if (state.disguise.fakeRole === 'seer') {
    // 狼跳预言家：投不跟自己票的人
    if (!didFollowMyLead(engine, candidate, state)) {
      score += 5;
    }
    // 投自己编的查杀
    if (candidate.seat === state.disguise.fakeKillTarget) {
      score += 10;
    }
  }

  if (state.disguise.fakeRole === 'villager' &&
      (state.realRole === 'seer' || state.realRole === 'witch')) {
    // 神跳平民：基于真实信息微调
    if (state.realRole === 'seer') {
      // 这里接入预言家的查验结果
      // 由于无法直接访问引擎的查验记录，留空
    }
  }

  // ===== 3. 狼人团队投票策略 =====
  if (state.realRole === 'werewolf') {
    const wolfVoteBonus = computeWolfVoteBonus(engine, player, candidate, p);
    score += wolfVoteBonus;
  }

  // ===== 4. 从众效应 =====
  score += computeBandwagonBonus(engine, candidate) * (1 - p.aggression / 12);

  // ===== 5. 固执加成 =====
  if (hasPreviouslyVotedFor(engine, player, candidate.seat)) {
    score += p.stubbornness * 0.5;
  }

  // ===== 6. 情绪加成 =====
  score += mod.aggressionBonus;

  // ===== 7. 随机扰动 =====
  score += (Math.random() - 0.5) * 3;

  return Math.max(0, score);
}

/**
 * 计算基础怀疑分
 */
function computeSuspicionScore(engine, player, candidate, state) {
  let score = 10; // 基准分

  // 从记忆中查找该候选人的负面信息
  const memAbout = getMemoryAbout(player, candidate.seat);

  // 不记得这个人 → 中等怀疑
  if (!memAbout.speeches.length && !memAbout.votes.length) {
    score += 2;
  }

  // 如果有负面发言
  for (const sp of memAbout.speeches) {
    if (sp.content) {
      // 简单关键词检测
      if (sp.content.includes('狼') || sp.content.includes('可疑') ||
          sp.content.includes('有问题') || sp.content.includes('不信')) {
        score += 3;
      }
    }
  }

  // 狼人对非狼人队友的基础怀疑（实际是装的，但狼人会装出怀疑好人的样子）
  if (state.realRole === 'werewolf' && candidate.role !== 'werewolf') {
    score += 3; // 狼人需要在白天装出怀疑好人的样子
  }

  // 波动
  score += (Math.random() - 0.5) * 4;

  return score;
}

/**
 * 狼人团队投票加成
 * 根据团队策略决定是否冲票或分票
 */
function computeWolfVoteBonus(engine, player, candidate, personality) {
  const wolfCount = getAliveWolfCount(engine);
  const totalAlive = getAliveCount(engine);

  if (!totalAlive) return 0;

  const wolfRatio = wolfCount / totalAlive;

  // 冲票策略：狼多且激进
  if (wolfRatio > 0.35 && personality.aggression > 5) {
    // 倾向于集中投同一个目标
    const packTarget = getWolfPackTarget(engine);
    if (packTarget === candidate.seat) {
      return 10; // 冲票加成
    }
  }

  // 分票策略：劣势局分散投票伪装
  if (wolfRatio < 0.2) {
    // 不额外加分，保持自然
    return 0;
  }

  return 0;
}

/**
 * 从众效应：多少人投了这个人
 */
function computeBandwagonBonus(engine, candidate) {
  // 简单实现：基于记忆中的投票统计
  // 这里无法直接获取全量投票数据，所以用随机近似
  // 实际使用时可以接入引擎的投票追踪系统
  return Math.random() * 3;
}

/**
 * 是否曾经投过这个人
 */
function hasPreviouslyVotedFor(engine, player, targetSeat) {
  const state = getOrCreateAIState(player);
  if (!state) return false;

  for (const evt of state.memory.events) {
    if (evt.type === 'vote' && evt.content === String(targetSeat)) {
      return true;
    }
  }
  return false;
}

/**
 * 玩家是否跟了我的票
 */
function didFollowMyLead(engine, candidate, state) {
  for (const evt of state.memory.events) {
    if (evt.type === 'vote' && evt.seat === candidate.seat) {
      return true;
    }
  }
  return false;
}

/**
 * 获取狼人冲票目标
 */
function getWolfPackTarget(engine) {
  // 简单实现：返回最近被攻击最多的非狼玩家
  if (!engine || !engine.room) return null;
  try {
    const nonWolves = Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.role !== 'werewolf');
    if (!nonWolves.length) return null;
    return nonWolves[Math.floor(Math.random() * nonWolves.length)].seat;
  } catch (e) { return null; }
}

/**
 * 获取存活玩家总数（从 disguise 模块导入以避免循环依赖）
 */
function getAliveCount(engine) {
  if (!engine || !engine.room) return 0;
  try {
    return Array.from(engine.room.players.values()).filter(p => p.isAlive).length;
  } catch (e) { return 0; }
}

module.exports = {
  generateVote,
  computeVoteScore,
};
