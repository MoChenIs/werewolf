// ========== AI 仿真发言生成 ==========
// 发言动机由规则引擎决定，发言内容由 LLM 生成（失败回退模板）

const { getOrCreateAIState } = require('./AIState');
const { updateEmotion, getModifiedParams, wasFakeExposed } = require('./emotion');
const { getMemory, getRememberedClaims } = require('./memory');
const { evaluateDisguise, shouldReveal, getAliveWolfCount, getSeerClaimants, isPlayerSuspected } = require('./disguise');
const { generateFromTemplate, getTemplate, fillTemplate, TEMPLATES } = require('./templates');
const { randomChoice, chance, randInt } = require('./utils');
const llmClient = require('./llm-client');

// 角色中文名映射
const ROLE_NAMES = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  villager: '平民',
};

/**
 * 主入口：生成 AI 发言（异步，调用 LLM）
 * @param {object} engine - 游戏引擎
 * @param {object} player - AI 玩家
 * @returns {Promise<string>} 发言内容
 */
async function generateSpeech(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return '...';

  // 1. 更新情绪
  updateEmotion(engine, player);
  const mod = getModifiedParams(player);

  // 2. 评估伪装
  evaluateDisguise(engine, player);

  // 3. 决定发言动机
  const motive = decideSpeechMotive(engine, player);

  // 4. 生成发言（LLM 优先，失败回退模板）
  let speech = await generateSpeechContent(motive, engine, player);

  // 5. 嘴瓢检查（LLM 发言也有嘴瓢概率）
  speech = maybeSlip(speech, player, mod);

  // 6. 如果空字符串，用兜底发言
  if (!speech || !speech.trim()) {
    speech = generateFromTemplate('neutral', 'idle');
  }

  return speech.trim();
}

// ==================== 动机决策 ====================

/**
 * 决定发言动机
 */
function decideSpeechMotive(engine, player) {
  const state = getOrCreateAIState(player);
  if (!state) return { type: 'idle' };

  // 亮身份模式
  if (shouldReveal(engine, player)) {
    return { type: 'reveal', role: player.role };
  }

  // 伪装模式
  if (state.disguise.fakeRole === 'seer') {
    return decideWolfSeerMotive(engine, player);
  }
  if (state.disguise.fakeRole === 'villager' &&
      (player.role === 'seer' || player.role === 'witch' || player.role === 'hunter')) {
    return decidePowerVillagerMotive(engine, player);
  }

  // 正常模式
  return decideNeutralMotive(engine, player);
}

/**
 * 狼人跳预言家的发言动机
 */
function decideWolfSeerMotive(engine, player) {
  const state = getOrCreateAIState(player);

  // 有人对跳？
  const otherClaimants = getSeerClaimants(engine)
    .filter(s => s !== player.seat);

  if (otherClaimants.length > 0 && chance(0.7)) {
    return {
      type: 'fightBack',
      target: randomChoice(otherClaimants),
    };
  }

  // 带队投查杀目标
  if (state.disguise.fakeKillTarget && chance(0.6)) {
    return { type: 'claim', target: state.disguise.fakeKillTarget };
  }

  // 编新的查杀
  return { type: 'lead', target: null };
}

/**
 * 神职跳平民的发言动机
 */
function decidePowerVillagerMotive(engine, player) {
  const state = getOrCreateAIState(player);

  // 如果自己阵营有危险 → 以平民视角推出去
  const wolfCount = getAliveWolfCount(engine);
  if (wolfCount > 2 && chance(0.5)) {
    // 选一个看起来可疑的
    const targets = getSuspiciousTargets(engine, player);
    if (targets.length > 0) {
      return { type: 'subtlePush', target: randomChoice(targets) };
    }
  }

  // 有人被冤枉？保一手
  // 简化为随机保一个人
  if (chance(0.25)) {
    return { type: 'defend', target: null };
  }

  // 没明确目标 → 划水
  return { type: 'uncertain' };
}

/**
 * 中立发言动机
 */
function decideNeutralMotive(engine, player) {
  const roll = Math.random();

  if (roll < 0.3) {
    // 攻击
    const targets = getSuspiciousTargets(engine, player);
    if (targets.length > 0) {
      return { type: 'attack', target: randomChoice(targets) };
    }
  }

  if (roll < 0.45) {
    // 防守/保人
    return { type: 'defend', target: null };
  }

  if (roll < 0.65) {
    // 跟风
    return { type: 'follow', target: null };
  }

  // 划水
  return { type: 'idle' };
}

// ==================== 内容生成 ====================

/**
 * 根据动机生成发言内容（LLM 优先，失败回退模板）
 */
async function generateSpeechContent(motive, engine, player) {
  const config = llmClient.getConfig();
  if (!config.enabled || !config.apiKey) {
    return templateSpeechContent(motive, engine, player);
  }

  try {
    const { systemPrompt, userPrompt } = buildPrompt(motive, engine, player);
    const speech = await llmClient.generateSpeech({ systemPrompt, userPrompt });
    if (speech && speech.trim()) {
      return speech;
    }
  } catch (e) {
    console.log('[LLM] 发言生成失败，回退模板:', e.message);
  }

  return templateSpeechContent(motive, engine, player);
}

/**
 * 模板发言（LLM 不可用时的回退）
 */
function templateSpeechContent(motive, engine, player) {
  const state = getOrCreateAIState(player);
  const p = state.personality;

  switch (motive.type) {
    case 'reveal':
      return generateRevealSpeech(motive.role, player, engine);

    case 'claim': {
      const target = motive.target || (state.disguise.fakeKillTarget || 0);
      return generateFromTemplate('wolfFakeSeer', 'claim', {
        target,
        round: state.memory.round,
        result: '查杀',
      });
    }

    case 'fightBack': {
      const target = motive.target || 0;
      const tpl = randomChoice([
        ...TEMPLATES.wolfFakeSeer.fightBack,
        ...TEMPLATES.wolfFakeSeer.explain,
      ]);
      return fillTemplate(tpl, { target });
    }

    case 'lead': {
      const target = state.disguise.fakeKillTarget || 0;
      return generateFromTemplate('wolfFakeSeer', 'lead', { target });
    }

    case 'subtlePush': {
      const target = motive.target || 0;
      return generateFromTemplate('powerVillager', 'subtlePush', { target });
    }

    case 'defend': {
      const target = motive.target || findDefendTarget(engine, player);
      if (target > 0) {
        const tpl = randomChoice([
          ...TEMPLATES.powerVillager.defend,
          ...TEMPLATES.neutral.defend,
        ]);
        return fillTemplate(tpl, { target });
      }
      return generateFromTemplate('neutral', 'idle');
    }

    case 'attack': {
      const target = motive.target || 0;
      return generateFromTemplate('neutral', 'attack', { target });
    }

    case 'follow': {
      const followTarget = findFollowTarget(engine, player);
      if (followTarget > 0) {
        return generateFromTemplate('neutral', 'follow', { target: followTarget });
      }
      return generateFromTemplate('neutral', 'idle');
    }

    case 'idle':
      return generateFromTemplate('neutral', 'idle');

    case 'uncertain':
    default:
      return generateFromTemplate('powerVillager', 'uncertain');
  }
}

// ==================== Prompt 构建 ====================

/**
 * 构建 LLM Prompt
 */
function buildPrompt(motive, engine, player) {
  const state = getOrCreateAIState(player);
  const p = state.personality;
  const disguise = state.disguise;

  // === 系统提示词 ===
  const systemPrompt = buildSystemPrompt(player, state, p, disguise, engine);

  // === 用户提示词 ===
  const userPrompt = buildUserPrompt(motive, engine, player, state, disguise);

  return { systemPrompt, userPrompt };
}

/**
 * 构建系统提示词：定义角色、性格、背景
 */
function buildSystemPrompt(player, state, p, disguise, engine) {
  const realRole = ROLE_NAMES[player.role] || player.role;
  const fakeRole = disguise.fakeRole ? ROLE_NAMES[disguise.fakeRole] : null;

  const parts = [
    '你是一个狼人杀游戏的玩家，你的发言要像真人一样自然。',
    '',
    `你的真实身份是【${realRole}】。`,
  ];

  if (fakeRole && fakeRole !== realRole) {
    parts.push(`你对外伪装成【${fakeRole}】，你的发言必须与这个身份一致。`);
    if (disguise.fakeKillTarget) {
      parts.push(`你编造了查验结果：${disguise.fakeKillTarget}号是狼人（查杀）。`);
    }
  } else {
    parts.push('你以真实身份发言。');
  }

  parts.push('');
  parts.push('你的性格：');
  parts.push(`- 激进程度 ${p.aggression}/10：` + (p.aggression >= 7 ? '敢于主动出击、带节奏' : p.aggression <= 3 ? '比较保守、随大流' : '一般'));
  parts.push(`- 表达能力 ${p.eloquence}/10：` + (p.eloquence >= 7 ? '口才好、能说会道' : p.eloquence <= 3 ? '嘴笨、不太会表达' : '普通'));
  parts.push(`- 情绪稳定 ${p.stability}/10：` + (p.stability >= 7 ? '沉着冷静' : p.stability <= 3 ? '容易慌乱' : '正常'));
  parts.push(`- 记忆力 ${p.memory}/10：` + (p.memory >= 7 ? '记性好' : p.memory <= 3 ? '记性差、容易忘事' : '一般'));
  parts.push(`- 多疑程度 ${p.paranoia}/10：` + (p.paranoia >= 7 ? '看谁都像狼' : p.paranoia <= 3 ? '轻信他人' : '一般'));
  parts.push(`- 固执程度 ${p.stubbornness}/10：` + (p.stubbornness >= 7 ? '认定的事很难改变' : p.stubbornness <= 3 ? '容易被说服' : '一般'));

  parts.push('');
  parts.push('发言要求：');
  parts.push('- 直接输出发言内容，不要思考、不要解释');
  parts.push('- 用中文口语，像真人聊天一样自然');
  parts.push('- 不要用"发言："、"回答："等前缀');
  parts.push('- 长度控制在 20-100 字，不要超过150字');
  if (p.eloquence >= 7) parts.push('- 你的表达能力强，说话有条理有说服力');
  if (p.eloquence <= 3) parts.push('- 你的表达能力弱，说话可能不太连贯');
  if (p.stability <= 3) parts.push('- 你情绪不稳定，紧张时容易说错话');

  return parts.join('\n');
}

/**
 * 构建用户提示词：当前局势 + 发言任务
 */
function buildUserPrompt(motive, engine, player, state, disguise) {
  const parts = [];

  // 基本信息
  parts.push(`你是${player.seat}号玩家"${player.name}"。`);
  parts.push(`当前第 ${engine.round || 1} 轮，游戏阶段：白天讨论。`);

  // 存活玩家
  const alivePlayers = [];
  const deadPlayers = [];
  try {
    for (const p of engine.room.players.values()) {
      if (p.isAlive) alivePlayers.push(p.seat);
      else deadPlayers.push(p.seat);
    }
  } catch (e) { /* ignore */ }
  parts.push(`存活玩家：${alivePlayers.join('号, ')}号。`);
  if (deadPlayers.length > 0) {
    parts.push(`已死亡：${deadPlayers.join('号, ')}号。`);
  }

  // 最近发生的事
  if (engine.history) {
    const recentLogs = engine.history.slice(-5);
    const recentEvents = recentLogs
      .filter(l => l.type === 'speech' || l.type === 'death' || l.type === 'system')
      .map(l => l.content)
      .slice(-3);
    if (recentEvents.length > 0) {
      parts.push('最近发生：');
      recentEvents.forEach(e => parts.push(`  ${e}`));
    }
  }

  // 伪装状态
  if (disguise.fakeRole === 'seer') {
    parts.push('');
    parts.push('你正在伪装预言家。');
    if (disguise.fakeKillTarget) {
      parts.push(`你之前声称查了${disguise.fakeKillTarget}号是狼人。`);
    }
  } else if (disguise.fakeRole === 'villager' && player.role !== 'villager') {
    parts.push('');
    parts.push('你正在伪装平民，隐藏真实身份。');
  }

  // 情绪状态
  if (state.emotion === 'nervous') {
    parts.push('你目前有点紧张，被质疑了。');
  } else if (state.emotion === 'excited') {
    parts.push('你目前情绪激动。');
  } else if (state.emotion === 'revenge') {
    parts.push('你即将出局，这是遗言。');
  }

  // 发言任务
  parts.push('');
  parts.push('发言任务：' + getMotiveDescription(motive, player, state, disguise));

  return parts.join('\n');
}

/**
 * 将动机转换为自然语言指令
 */
function getMotiveDescription(motive, player, state, disguise) {
  const target = motive.target || 0;
  const targetInfo = target > 0 ? `${target}号玩家` : '';

  switch (motive.type) {
    case 'claim':
      return `以预言家身份发查杀，说${targetInfo}是狼人，号召大家投票出他。`;
    case 'fightBack':
      return `攻击${targetInfo}，他在和你对跳预言家，你要维护自己"真预言家"的身份。`;
    case 'lead':
      return `以预言家身份带队，引导大家投票。`;
    case 'reveal':
      return `你决定亮出真实身份【${ROLE_NAMES[player.role] || player.role}】，告诉大家真相。`;
    case 'subtlePush':
      return `以平民身份暗示${targetInfo}可疑，但不要暴露你的真实身份。`;
    case 'attack':
      return `攻击${targetInfo}，表达你对他的怀疑。`;
    case 'defend':
      return targetInfo ? `帮${targetInfo}说话，你觉得他是好人。` : '帮你觉得是好人的人说话。';
    case 'follow':
      return targetInfo ? `赞同${targetInfo}的观点。` : '赞同上一个人的观点。';
    case 'idle':
      return '划水发言，说一些没有明确指向的话，观察局势。';
    case 'uncertain':
      return '表达你不确定的态度，说你需要更多信息。';
    default:
      return '根据当前局势自然发言。';
  }
}

/**
 * 亮身份发言
 */
function generateRevealSpeech(role, player, engine) {
  const state = getOrCreateAIState(player);

  switch (role) {
    case 'seer': {
      const target = state.disguise.fakeKillTarget || 0;
      return generateFromTemplate('reveal', 'seer', { target });
    }
    case 'witch':
      return generateFromTemplate('reveal', 'witch', { target: 0 });
    case 'hunter':
      return generateFromTemplate('reveal', 'hunter');
    default:
      return '我是好人，真的。';
  }
}

// ==================== 嘴瓢 ====================

/**
 * 嘴瓢检查
 */
function maybeSlip(speech, player, mod) {
  const state = getOrCreateAIState(player);
  if (!state) return speech;

  // 基础嘴瓢概率
  const slipChance = 0.12 * mod.slipChance;

  if (!chance(slipChance)) return speech;

  const slipType = Math.random();

  // 1. 说漏真实身份
  if (slipType < 0.25 && state.disguise.fakeRole) {
    const realName = ROLE_NAMES[state.realRole] || '';
    speech = speech.replace(/我是平民/g, `我是${realName}`);
    speech = speech.replace(/我是村民/g, `我是${realName}`);
    // 如果在跳预言家时说漏嘴
    if (state.realRole !== 'seer') {
      speech += ' 呃不对，我是说...';
    }
    return speech;
  }

  // 2. 跳身份卡壳
  if (slipType < 0.5 && state.disguise.fakeRole === 'seer') {
    const slipTpl = randomChoice(TEMPLATES.slip);
    return fillTemplate(slipTpl, { target: state.disguise.fakeKillTarget || 0 });
  }

  // 3. 逻辑前后矛盾
  if (slipType < 0.75) {
    const contradiction = randomChoice([
      '等等，我是不是记错了...',
      '不对，我重新说一下。',
      '算了我不确定了。',
      '当我没说。',
    ]);
    speech += ` ${contradiction}`;
    return speech;
  }

  // 4. 说错话改口
  const correction = randomChoice([
    '呃不对，我不是这个意思。',
    '说错了说错了。',
    '口误口误。',
  ]);
  speech += ` ${correction}`;
  return speech;
}

// ==================== 辅助函数 ====================

/**
 * 获取可疑目标列表
 */
function getSuspiciousTargets(engine, player) {
  if (!engine || !engine.room) return [];
  try {
    return Array.from(engine.room.players.values())
      .filter(p => p.isAlive && p.seat !== player.seat &&
        // 排除已知队友（狼人）
        !(player.role === 'werewolf' && p.role === 'werewolf'))
      .map(p => p.seat);
  } catch (e) { return []; }
}

/**
 * 找个目标来保
 */
function findDefendTarget(engine, player) {
  const targets = getSuspiciousTargets(engine, player);
  if (!targets.length) return 0;
  // 随机选一个（可能是好人坏人，类似真人）
  return randomChoice(targets);
}

/**
 * 找个目标跟风
 */
function findFollowTarget(engine, player) {
  // 查看记忆中有没有人发言了
  const state = getOrCreateAIState(player);
  if (!state) return 0;

  const recentEvents = state.memory.events.slice(-10);
  const speakers = recentEvents
    .filter(e => e.type === 'speech' && e.seat !== player.seat)
    .map(e => e.seat);

  if (speakers.length > 0) {
    return speakers[speakers.length - 1];
  }

  const targets = getSuspiciousTargets(engine, player);
  return targets.length > 1 ? targets[Math.floor(Math.random() * targets.length)] : 0;
}

/**
 * 调整发言长度（根据情绪参数）
 */
function adjustSpeechLength(speech, lengthModifier) {
  if (lengthModifier >= 1.0) return speech;

  // 缩短发言
  const words = speech.split('');
  const targetLen = Math.max(10, Math.floor(words.length * lengthModifier));
  if (words.length <= targetLen) return speech;

  return words.slice(0, targetLen).join('') + '...';
}

module.exports = {
  generateSpeech,
  decideSpeechMotive,
  maybeSlip,
  adjustSpeechLength,
};
