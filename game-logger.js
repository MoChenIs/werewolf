// ========== 游戏日志记录模块 ==========
// 每局游戏结束后自动追加到 server-data/games.json
// 提供 API 读取所有历史游戏数据

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'server-data');
const DATA_FILE = path.join(DATA_DIR, 'games.json');

// 当前进行中的游戏记录
let _currentGame = null;

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ===== 游戏生命周期 =====

/**
 * 开始新游戏
 */
function startGame(room) {
  _currentGame = {
    gameId: generateGameId(),
    startTime: new Date().toISOString(),
    endTime: null,
    players: [],
    winner: null,
    rounds: [{ round: 1, events: [] }],
  };

  // 记录玩家信息
  for (const [, p] of room.players) {
    _currentGame.players.push({
      seat: p.seat,
      name: p.name,
      role: p.role,
      isAi: !!p.isAi,
      isAlive: true,
    });
  }
}

/**
 * 结束当前游戏，写入文件
 */
function endGame(winner) {
  if (!_currentGame) return;
  _currentGame.endTime = new Date().toISOString();
  _currentGame.winner = winner;

  // 更新玩家存活状态
  // (存活状态在事件中已有记录，这里做最终快照)

  // 写入文件
  ensureDataDir();
  let games = [];
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      games = JSON.parse(raw);
      if (!Array.isArray(games)) games = [];
    }
  } catch (e) {
    games = [];
  }

  games.push(_currentGame);

  // 限制最多保留 100 局（防止文件过大）
  if (games.length > 100) {
    games = games.slice(-100);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(games, null, 2), 'utf-8');
  console.log(`[Logger] 游戏 ${_currentGame.gameId} 已保存 (${games.length} 局)`);

  _currentGame = null;
}

// ===== 事件记录 =====

function _ensureCurrent() {
  if (!_currentGame) return null;
  const round = _currentGame.rounds[_currentGame.rounds.length - 1];
  return round;
}

function _ensureRound(roundNum) {
  if (!_currentGame) return null;
  let round = _currentGame.rounds[_currentGame.rounds.length - 1];
  if (round.round !== roundNum) {
    round = { round: roundNum, events: [] };
    _currentGame.rounds.push(round);
  }
  return round;
}

function logSpeech(seat, name, content) {
  const round = _ensureCurrent();
  if (!round) return;
  round.events.push({
    type: 'speech',
    seat,
    name,
    content,
    time: new Date().toISOString(),
  });
}

function logVote(votes, eliminated, isTie) {
  const round = _ensureCurrent();
  if (!round) return;
  round.events.push({
    type: 'vote',
    votes,
    eliminated: eliminated ? { seat: eliminated.seat, name: eliminated.name } : null,
    isTie: !!isTie,
    time: new Date().toISOString(),
  });
}

function logNightAction(phase, action, target, by) {
  const round = _ensureCurrent();
  if (!round) return;
  round.events.push({
    type: 'night',
    phase,
    action,
    target,
    by,
    time: new Date().toISOString(),
  });
}

function logDeath(deaths) {
  const round = _ensureCurrent();
  if (!round) return;
  round.events.push({
    type: 'death',
    deaths: deaths.map(d => ({ seat: d.seat, name: d.name, cause: d.cause || 'unknown' })),
    time: new Date().toISOString(),
  });
}

function logPhaseChange(phase, message) {
  const round = _ensureCurrent();
  if (!round) return;
  round.events.push({
    type: 'phase',
    phase,
    message,
    time: new Date().toISOString(),
  });
}

function newRound(roundNum) {
  _ensureRound(roundNum);
}

// ===== 读取 API =====

/**
 * 获取所有游戏记录
 */
function getAllGames() {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.log('[Logger] 读取历史数据失败:', e.message);
  }
  return [];
}

/**
 * 获取指定游戏
 */
function getGame(gameId) {
  const games = getAllGames();
  return games.find(g => g.gameId === gameId) || null;
}

/**
 * 获取最近 N 局摘要
 */
function getRecentSummaries(n = 10) {
  const games = getAllGames();
  return games.slice(-n).map(g => ({
    gameId: g.gameId,
    startTime: g.startTime,
    winner: g.winner,
    playerCount: g.players.length,
    roundCount: g.rounds.length,
    aiCount: g.players.filter(p => p.isAi).length,
  }));
}

// ===== 工具函数 =====

function generateGameId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `${date}-${time}`;
}

module.exports = {
  startGame,
  endGame,
  logSpeech,
  logVote,
  logNightAction,
  logDeath,
  logPhaseChange,
  newRound,
  getAllGames,
  getGame,
  getRecentSummaries,
};