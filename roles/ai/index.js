// ========== AI 统一代理层 ==========
// 接管所有 AI 决策，提供与现有系统兼容的接口

const actions = require('./actions');
const speechModule = require('./speech');
const voteModule = require('./vote');
const { getOrCreateAIState, resetAllAIStates, setRound } = require('./AIState');
const { evaluateDisguise } = require('./disguise');
const { updateEmotion } = require('./emotion');
const { tryRemember, cleanOldMemory } = require('./memory');

/**
 * AI 狼人夜间行动（返回目标，由 server.js 处理投票系统）
 * @param {object} engine - 游戏引擎
 * @param {object} player - AI 玩家
 * @returns {{ target: number }}
 */
function aiWolfNightAction(engine, player) {
  const result = actions.processWerewolf(engine, player);
  if (result.target > 0) {
    engine.addLog('night_action', `狼人AI选中击杀 ${result.target}号`, result.target);
  }
  return result;
}

/**
 * AI 预言家夜间行动
 * @param {object} engine
 * @param {object} player
 * @returns {{ target: number, isWerewolf: boolean }}
 */
function aiSeerNightAction(engine, player) {
  const result = actions.processSeer(engine, player);
  if (result.target > 0) {
    engine.nightActions.seerTarget = result.target;
    engine.addLog('night_action', `预言家AI选中查验 ${result.target}号`, result.target);
  }
  return result;
}

/**
 * AI 女巫夜间行动
 * @param {object} engine
 * @param {object} player
 */
function aiWitchNightAction(engine, player) {
  const result = actions.processWitch(engine, player);
  if (result.save && engine.nightActions.werewolfKill) {
    engine.nightActions.witchSave = engine.nightActions.werewolfKill;
    engine.witchUsedSave = true;
    engine.addLog('night_action', `女巫AI使用解药救活 ${engine.nightActions.werewolfKill}号`);
  }
  if (result.kill) {
    engine.nightActions.witchKill = result.kill;
    engine.witchUsedKill = true;
    engine.addLog('night_action', `女巫AI使用毒药毒杀 ${result.kill}号`);
  }
  return result;
}

/**
 * AI 猎人行动
 * @param {object} engine
 * @param {object} player
 * @returns {number} 目标 seat
 */
function aiHunterAction(engine, player) {
  const result = actions.processHunter(engine, player);
  return result.target;
}

/**
 * AI 发言生成（异步，调用 LLM）
 * @param {object} engine
 * @param {object} player
 * @returns {Promise<string>} 发言内容
 */
async function aiGenerateSpeech(engine, player) {
  return speechModule.generateSpeech(engine, player);
}

/**
 * AI 投票（替换 autoVoteForAiPlayers 中的随机逻辑）
 * @param {object} engine
 * @param {object} player
 * @param {number[]} [tieSeats] - 同票重投时的候选人列表
 * @returns {number} 目标 seat (0 = 弃权)
 */
function aiVote(engine, player, tieSeats) {
  // 设置候选人限制
  if (tieSeats && tieSeats.length > 0) {
    // 同票重投时限制范围
    // 后续可以在 vote 模块中处理
  }
  return voteModule.generateVote(engine, player);
}

/**
 * 新游戏开始时初始化 AI 状态
 */
function initNewGame(room) {
  resetAllAIStates();
  // 为每个 AI 玩家创建状态
  for (const [, player] of room.players) {
    if (player.isAi) {
      getOrCreateAIState(player);
    }
  }
}

/**
 * 新轮次开始
 */
function onNewRound(player, round) {
  setRound(player, round);
  cleanOldMemory(player);
}

/**
 * 记录 AI 记忆中的事件
 */
function rememberEvent(player, type, seat, content) {
  tryRemember(player, { type, seat, content, round: 0 /* 由内部管理 */ });
}

module.exports = {
  // 夜间行动
  aiWolfNightAction,
  aiSeerNightAction,
  aiWitchNightAction,
  aiHunterAction,
  // 发言投票
  aiGenerateSpeech,
  aiVote,
  // 生命周期
  initNewGame,
  onNewRound,
  rememberEvent,
  // 子模块导出（供直接访问）
  actions,
  speech: speechModule,
  vote: voteModule,
  AIState: {
    getOrCreateAIState,
    resetAllAIStates,
  },
  disguise: {
    evaluateDisguise,
  },
};
