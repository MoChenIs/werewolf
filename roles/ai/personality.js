// ========== AI 人格生成与管理 ==========

const { randInt, randomChoice } = require('./utils');

// 人格模板
const PERSONALITY_TEMPLATES = {
  // 莽夫 - 激进、敢跳、但漏洞多
  aggressive: {
    label: '莽夫',
    aggression: 9, paranoia: 3, stubbornness: 7,
    memory: 4, eloquence: 3, stability: 5,
  },
  // 阴谋家 - 善于伪装、逻辑严密
  schemer: {
    label: '阴谋家',
    aggression: 5, paranoia: 8, stubbornness: 8,
    memory: 7, eloquence: 7, stability: 8,
  },
  // 老实人 - 不擅长说谎
  honest: {
    label: '老实人',
    aggression: 2, paranoia: 3, stubbornness: 4,
    memory: 6, eloquence: 5, stability: 7,
  },
  // 糊涂蛋 - 记性差、表达差
  confused: {
    label: '糊涂蛋',
    aggression: 4, paranoia: 5, stubbornness: 3,
    memory: 2, eloquence: 3, stability: 4,
  },
  // 戏精 - 表达好但情绪不稳定
  dramaQueen: {
    label: '戏精',
    aggression: 7, paranoia: 6, stubbornness: 2,
    memory: 5, eloquence: 9, stability: 3,
  },
  // 稳健派 - 沉稳、藏得深
  steady: {
    label: '稳健派',
    aggression: 3, paranoia: 7, stubbornness: 6,
    memory: 8, eloquence: 6, stability: 9,
  },
};

const TEMPLATE_KEYS = Object.keys(PERSONALITY_TEMPLATES);

/**
 * 生成随机人格
 * @param {object} [options]
 * @param {boolean} [options.useTemplates=true] - 是否使用模板
 * @param {number} [options.templateWeight=0.3] - 模板概率
 * @returns {object} 人格对象 { aggression, paranoia, stubbornness, memory, eloquence, stability, label? }
 */
function generatePersonality(options = {}) {
  const {
    useTemplates = true,
    templateWeight = 0.3,
  } = options;

  if (useTemplates && Math.random() < templateWeight) {
    const key = randomChoice(TEMPLATE_KEYS);
    return { ...PERSONALITY_TEMPLATES[key], _template: key };
  }

  return {
    label: '随机',
    aggression: randInt(0, 10),
    paranoia: randInt(0, 10),
    stubbornness: randInt(0, 10),
    memory: randInt(0, 10),
    eloquence: randInt(0, 10),
    stability: randInt(0, 10),
  };
}

/**
 * 获取人格特征标签列表
 * @param {object} personality
 * @returns {string[]}
 */
function getPersonalityLabels(personality) {
  const labels = [];
  if (!personality) return labels;

  if (personality.aggression >= 8) labels.push('激进');
  else if (personality.aggression <= 3) labels.push('保守');

  if (personality.paranoia >= 8) labels.push('多疑');
  if (personality.stubbornness >= 8) labels.push('固执');
  if (personality.memory <= 3) labels.push('健忘');
  if (personality.eloquence >= 8) labels.push('善辩');
  else if (personality.eloquence <= 3) labels.push('嘴笨');

  if (personality.stability >= 8) labels.push('沉稳');
  else if (personality.stability <= 3) labels.push('情绪化');

  return labels;
}

/**
 * 格式化人格为字符串（用于调试）
 */
function formatPersonality(personality) {
  if (!personality) return '无';
  const labels = getPersonalityLabels(personality);
  const labelStr = labels.length ? ` (${labels.join(', ')})` : '';
  return `${personality.label || '随机'}${labelStr}`;
}

module.exports = {
  generatePersonality,
  getPersonalityLabels,
  formatPersonality,
  PERSONALITY_TEMPLATES,
};
