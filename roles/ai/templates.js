// ========== AI 发言模板库 ==========

const { randomChoice } = require('./utils');

/**
 * 各场景发言模板
 * {target} = 目标玩家 seat
 * {round} = 当前轮次
 * {result} = 查杀/金水
 * {reason} = 理由
 */
const TEMPLATES = {
  // ========== 狼人跳预言家 ==========
  wolfFakeSeer: {
    claim: [
      '我是预言家，昨晚查了 {target} 号，他是狼人！',
      '我第 {round} 晚查的是 {target} 号，{result}！',
      '{target} 号是我的查杀，大家今天跟我出 {target}。',
      '终于轮到我了，我是预言家，{target} 号查杀。',
    ],
    fightBack: [
      '{target} 号跟我对跳是吧？那你就是狼。',
      '这个 {target} 号绝对是悍跳狼，大家不要信他。',
      '真预言家在这里，{target} 号是假的对跳狼。',
      '笑了，{target} 号你编不出查杀就只会复读我是狼？',
    ],
    explain: [
      '我验 {target} 号是因为他上一轮发言太划水了。',
      '我首验 {target} 号是因为他位置比较偏。',
      '{target} 号这轮发言暴露了，和我验的结果吻合。',
      '验 {target} 号是因为他总在跟风，不像好人心态。',
    ],
    lead: [
      '大家跟我走，今天出 {target} 号，明天我再报验人。',
      '今天全票打飞 {target} 号，他一定是狼。',
      '我是真预言家，大家不要被狼人带偏了。',
    ],
  },

  // ========== 神职跳平民带节奏 ==========
  powerVillager: {
    subtlePush: [
      '我是平民，但我感觉 {target} 号的发言不太像好人。',
      '我没什么身份，就是个平民，不过 {target} 号真的可疑。',
      '我是平民，我觉得 {target} 号说的有道理。',
      '虽然我是平民，但我建议大家关注一下 {target} 号。',
      '平民视角来看，{target} 号如果是狼不会这么说的。',
      '我是平民，但我投票会投 {target}，他的发言让我很不舒服。',
      '说不上来为什么，{target} 号的给我的感觉不太好。',
    ],
    defend: [
      '我是平民，{target} 号的发言我觉得没问题。',
      '我觉得 {target} 号应该是好人，我直觉很准的。',
      '{target} 号如果是狼不会这么聊天的，我是平民我保他。',
    ],
    uncertain: [
      '我是平民，目前没什么特别的想法。',
      '我再想想，信息还不够。',
      '先听听大家怎么说吧。',
      '这轮信息量有点大，让我消化一下。',
    ],
  },

  // ========== 中立/普通发言 ==========
  neutral: {
    attack: [
      '我觉得 {target} 号有问题。',
      '我怀疑 {target} 号，他投票很有问题。',
      '{target} 号一直在划水，我点一票。',
      '大家不觉得 {target} 号很反常吗？',
      '{target} 号的行为非常可疑。',
    ],
    defend: [
      '我觉得 {target} 号是好人。',
      '{target} 号不像狼啊，你们别乱投。',
      '保一手 {target} 号，我觉得他是好人。',
      '{target} 号这轮发言偏好的。',
    ],
    follow: [
      '同意 {target} 号说的。',
      '我也觉得 {target} 号有点可疑。',
      '跟 {target} 号票。',
      '和 {target} 号想法一样。',
    ],
    idle: [
      '我再想想。',
      '信息还不够，不好说。',
      '你们怎么看？',
      '先听听其他人怎么说。',
      '嗯... 我也说不准。',
      '让我再观察一下。',
    ],
  },

  // ========== 亮身份 ==========
  reveal: {
    seer: [
      '好吧，我是预言家，{target} 号是我查出来的狼。',
      '我摊牌了，我是预言家，{target} 号是狼人！',
      '不装了，我是预言家，{target} 号查杀。本来不想说的。',
    ],
    witch: [
      '我是女巫，昨晚我救了 {target} 号。',
      '行吧我是女巫，{target} 号是银水。',
      '我女巫，解药已经用了，{target} 号是我救的。',
    ],
    hunter: [
      '行吧我是猎人，你们别投我，我有枪。',
      '我是猎人，想带人的可以继续投我。',
    ],
  },

  // ========== 嘴瓢/穿帮 ==========
  slip: [
    '我是预言...呃，我是平民，我刚才说错了。',
    '我觉得 {target} 号是好人...等等，我是说我不确定。',
    '昨晚我...我是说白天，我看到 {target} 号很可疑。',
    '我验...我是说我感觉 {target} 号不对劲。',
    '我是女...我是说，我不认识那个谁。',
  ],
};

/**
 * 根据分类和子分类随机获取一条模板
 * @param {string} category - 主分类
 * @param {string} subCategory - 子分类
 * @returns {string} 模板字符串
 */
function getTemplate(category, subCategory) {
  const cat = TEMPLATES[category];
  if (!cat) return '';
  const sub = cat[subCategory];
  if (!sub || !sub.length) return '';
  return randomChoice(sub);
}

/**
 * 填充模板中的占位符
 * @param {string} template - 模板字符串
 * @param {object} vars - 占位符变量 { target, round, result, reason }
 * @returns {string}
 */
function fillTemplate(template, vars = {}) {
  let result = template;
  if (vars.target != null) result = result.replace(/\{target\}/g, String(vars.target));
  if (vars.round != null) result = result.replace(/\{round\}/g, String(vars.round));
  if (vars.result) result = result.replace(/\{result\}/g, vars.result);
  if (vars.reason) result = result.replace(/\{reason\}/g, vars.reason);
  return result;
}

/**
 * 从分类、子分类获取并填充一条模板
 */
function generateFromTemplate(category, subCategory, vars = {}) {
  const tpl = getTemplate(category, subCategory);
  if (!tpl) return '';
  return fillTemplate(tpl, vars);
}

module.exports = {
  TEMPLATES,
  getTemplate,
  fillTemplate,
  generateFromTemplate,
};
