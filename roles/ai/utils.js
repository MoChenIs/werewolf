// ========== AI 工具函数 ==========

/**
 * 加权随机选择
 * @param {any[]} items - 候选项数组
 * @param {number[]} weights - 对应权重数组
 * @returns {any} 选中的候选项
 */
function weightedRandomSelect(items, weights) {
  if (!items || !items.length) return null;
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * 随机整数 [min, max]
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 从数组中随机选一个
 */
function randomChoice(arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 数组洗牌（Fisher-Yates）
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 按概率判定
 * @param {number} probability - 0~1
 * @returns {boolean}
 */
function chance(probability) {
  return Math.random() < probability;
}

/**
 * 在 base 附近做随机偏移
 * @param {number} base
 * @param {number} range - 偏移范围
 * @returns {number}
 */
function jitter(base, range) {
  return base + (Math.random() - 0.5) * range * 2;
}

/**
 * 从数组中移除指定元素，返回新数组
 */
function without(arr, item) {
  return arr.filter(i => i !== item);
}

/**
 * 对象深拷贝（简单版本，适用于纯数据对象）
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 安全的读数组（越界返回 undefined）
 */
function safeGet(arr, index) {
  if (!arr || index < 0 || index >= arr.length) return undefined;
  return arr[index];
}

module.exports = {
  weightedRandomSelect,
  randInt,
  randomChoice,
  shuffle,
  chance,
  jitter,
  without,
  clone,
  safeGet,
};
