// ========== LLM API 客户端 ==========
// 负责调用大模型 API 生成发言
// 支持 OpenAI 兼容接口，可配置超时、重试、回退

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ===== 加载配置 =====
function loadConfig() {
  // 1. 先尝试环境变量
  let apiKey = process.env.ANTHROPIC_AUTH_TOKEN || '';
  let baseUrl = process.env.ANTHROPIC_BASE_URL || '';
  let model = process.env.ANTHROPIC_MODEL || '';

  // 2. 环境变量为空时，尝试从 Claude Code 配置文件读取
  if (!apiKey || !baseUrl) {
    const settingsPaths = [
      // Windows
      path.join(os.homedir(), '.claude', 'settings.json'),
      // 项目级
      path.join(__dirname, '..', '..', '.claude', 'settings.json'),
    ];

    for (const settingsPath of settingsPaths) {
      try {
        if (fs.existsSync(settingsPath)) {
          const raw = fs.readFileSync(settingsPath, 'utf-8');
          const settings = JSON.parse(raw);
          if (settings.env) {
            if (!apiKey) apiKey = settings.env.ANTHROPIC_AUTH_TOKEN || '';
            if (!baseUrl) baseUrl = settings.env.ANTHROPIC_BASE_URL || '';
            if (!model) model = settings.env.ANTHROPIC_MODEL || '';
          }
          if (apiKey) {
            console.log('[LLM] 从配置文件加载: ' + settingsPath);
            break;
          }
        }
      } catch (e) {
        // 忽略读取错误
      }
    }
  }

  // 3. 仍然为空时，尝试项目根目录的 .env 文件
  if (!apiKey) {
    const envPath = path.join(__dirname, '..', '..', '.env');
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('ANTHROPIC_AUTH_TOKEN=')) {
            apiKey = trimmed.split('=')[1].replace(/^["']|["']$/g, '');
          }
          if (trimmed.startsWith('ANTHROPIC_BASE_URL=')) {
            baseUrl = trimmed.split('=')[1].replace(/^["']|["']$/g, '');
          }
          if (trimmed.startsWith('ANTHROPIC_MODEL=')) {
            model = trimmed.split('=')[1].replace(/^["']|["']$/g, '');
          }
        }
        if (apiKey) console.log('[LLM] 从 .env 文件加载');
      }
    } catch (e) { /* ignore */ }
  }

  return {
    apiKey,
    baseUrl: baseUrl || 'https://model-router.edu-aliyun.com',
    model: model || 'qwen/deepseek-v4-pro/v2',
  };
}

const envConfig = loadConfig();

// ===== 配置 =====
const llmConfig = {
  enabled: true,
  baseUrl: envConfig.baseUrl,
  apiKey: envConfig.apiKey,
  model: envConfig.model,
  timeout: 30000,         // 30秒超时（推理模型需要更久）
  maxTokens: 4096,        // 推理模型需要大量 token（思考+回答）
  temperature: 0.9,
  maxRetries: 2,
  fallbackToTemplate: true,
};

// 是否已打印过配置信息
let _configLogged = false;

/**
 * 获取 LLM 配置（首次调用打印诊断信息）
 */
function getConfig() {
  if (!_configLogged) {
    const hasKey = !!llmConfig.apiKey;
    console.log('[LLM] 配置:');
    console.log('  baseUrl: ' + llmConfig.baseUrl);
    console.log('  model:   ' + llmConfig.model);
    console.log('  enabled: ' + llmConfig.enabled);
    console.log('  hasKey:  ' + hasKey);
    if (!hasKey) {
      console.log('[LLM] ⚠️  未找到 API Key！AI 将使用模板发言。');
      console.log('[LLM] 💡 解决方法：');
      console.log('[LLM]    1. 创建 D:\\code\\hb\\werewolf\\.env 文件，内容：');
      console.log('[LLM]       ANTHROPIC_AUTH_TOKEN=sk-c318d7c8a1ab257472e9b5e2ead9a714b1576987edc09ffc');
      console.log('[LLM]       ANTHROPIC_BASE_URL=https://model-router.edu-aliyun.com');
      console.log('[LLM]       ANTHROPIC_MODEL=qwen/deepseek-v4-pro/v2');
      console.log('[LLM]    2. 或在终端设置环境变量后启动');
    }
    _configLogged = true;
  }
  return llmConfig;
}

/**
 * 设置 / 更新配置
 */
function setConfig(updates) {
  Object.assign(llmConfig, updates);
}

/**
 * 调用 LLM API 生成发言
 * @param {object} params
 * @param {string} params.systemPrompt - 系统提示词
 * @param {string} params.userPrompt - 用户提示词
 * @returns {Promise<string>} 发言内容
 */
async function generateSpeech({ systemPrompt, userPrompt }) {
  const config = getConfig();
  if (!config.enabled || !config.apiKey) {
    throw new Error('LLM 未启用或无 API Key');
  }

  let lastError = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await callApi(config, systemPrompt, userPrompt);
      const cleaned = cleanSpeech(result);
      if (cleaned.length < 5) {
        throw new Error('LLM 返回内容过短: ' + JSON.stringify(result.substring(0, 100)));
      }
      return cleaned;
    } catch (e) {
      lastError = e;
      console.log('[LLM] 第' + (attempt + 1) + '次失败: ' + e.message);
      if (attempt < config.maxRetries) {
        await sleep(800);
      }
    }
  }
  throw lastError || new Error('LLM 调用失败');
}

/**
 * 实际 API 调用
 */
function callApi(config, systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const body = JSON.stringify({
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    });

    const url = new URL(config.baseUrl);
    // 确保路径以 /v1/chat/completions 结尾
    let apiPath = url.pathname;
    if (!apiPath.endsWith('/v1/chat/completions')) {
      apiPath = apiPath.replace(/\/$/, '') + '/v1/chat/completions';
    }

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      timeout: config.timeout,
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data);
            let content = json.choices?.[0]?.message?.content;

            // DeepSeek 推理模型：content 为空时，尝试从 reasoning_content 提取
            if (!content || !content.trim()) {
              const reasoning = json.choices?.[0]?.message?.reasoning_content;
              if (reasoning && reasoning.trim()) {
                console.log('[LLM] content为空，使用reasoning_content兜底');
                // 取 reasoning 的最后一部分作为发言（去掉思考过程前缀）
                content = extractSpeechFromReasoning(reasoning);
              }
            }

            // Anthropic 格式兼容
            if (!content) {
              content = json.content?.[0]?.text;
            }

            if (content && content.trim()) {
              if (process.env.DEBUG_LLM) {
                console.log('[LLM] 响应长度: ' + content.length + ' 字符');
              }
              resolve(content);
            } else {
              reject(new Error('API 返回内容为空: ' + JSON.stringify(json).substring(0, 300)));
            }
          } catch (e) {
            reject(new Error('JSON 解析失败: ' + e.message + ' | 原始: ' + data.substring(0, 200)));
          }
        } else {
          reject(new Error('HTTP ' + res.statusCode + ': ' + data.substring(0, 300)));
        }
      });
    });

    req.on('error', (e) => reject(new Error('网络错误: ' + e.message)));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });

    req.write(body);
    req.end();
  });
}

/**
 * 清理 LLM 输出
 */
function cleanSpeech(text) {
  if (!text) return '';
  let result = text.trim();
  // 去掉引号包裹
  result = result.replace(/^["'「『](.*)["'」』]$/, '$1');
  // 去掉思考前缀
  result = result.replace(/^(发言[：:]|输出[：:]|回答[：:])\s*/i, '');
  // 限制长度（防止 LLM 过度发挥）
  if (result.length > 300) {
    result = result.substring(0, 300);
  }
  return result || text.trim();
}

/**
 * 从推理模型的 reasoning_content 中提取发言
 * DeepSeek V4 会先输出思考过程，最后才是回答
 */
function extractSpeechFromReasoning(reasoning) {
  // 尝试找到发言标记
  const markers = ['发言：', '发言:', '回答：', '回答:', '说：', '输出：'];
  for (const marker of markers) {
    const idx = reasoning.lastIndexOf(marker);
    if (idx >= 0) {
      return reasoning.substring(idx + marker.length).trim();
    }
  }
  // 没有标记：取最后 200 字符作为发言
  if (reasoning.length > 200) {
    return reasoning.substring(reasoning.length - 200).trim();
  }
  return reasoning.trim();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = {
  getConfig,
  setConfig,
  generateSpeech,
};