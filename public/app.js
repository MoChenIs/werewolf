// public/app.js - 前端主逻辑
const socket = io();

// 断线重连：检查是否有保存的游戏状态
(function tryReconnect() {
  const savedSeat = sessionStorage.getItem('werewolf_seat');
  const savedRoom = sessionStorage.getItem('werewolf_room');
  if (savedSeat && savedRoom) {
    socket.emit('reconnect_player', {
      roomId: savedRoom,
      seat: parseInt(savedSeat)
    });
  }
})();

// DOM 引用
const lobbyPage = document.getElementById('lobby-page');
const roomPage = document.getElementById('room-page');
const gamePage = document.getElementById('game-page');
const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const lobbyError = document.getElementById('lobby-error');
const roomIdDisplay = document.getElementById('room-id-display');
const playerCountDisplay = document.getElementById('player-count-display');
const playerListEl = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');
const addAiBtn = document.getElementById('add-ai-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

let currentPlayerId = null;
let currentSeat = null;
let currentRoomId = null;
let currentHostId = null;
let gameTimer = null;
let currentPhase = null;
let _cachedPlayers = [];
let _currentSpeakerSeat = null;
let _myNightPhase = null;
let _tiedSeats = [];

// 页面切换
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(pageId).classList.remove('hidden');
}

// 显示错误（全局 Toast，任何页面都可见）
function showError(msg) {
  const toast = document.getElementById('global-toast');
  if (toast) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
  }
  // 同时也在大厅错误区显示（如果有）
  lobbyError.textContent = msg;
  lobbyError.classList.remove('hidden');
  setTimeout(() => lobbyError.classList.add('hidden'), 3500);
}

// ========== 客户端事件 ==========
createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || `玩家${Math.floor(Math.random()*1000)}`;
  socket.emit('create_room', { playerName: name });
});

startGameBtn.addEventListener('click', () => {
  socket.emit('start_game');
});

addAiBtn.addEventListener('click', () => {
  socket.emit('add_ai');
});

leaveRoomBtn.addEventListener('click', () => {
  socket.emit('leave_room');
});

joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || `玩家${Math.floor(Math.random()*1000)}`;
  const roomId = roomIdInput.value.trim();
  if (!roomId) return showError('请输入房间号');
  socket.emit('join_room', { roomId, playerName: name });
});

// ========== 服务端事件 ==========
socket.on('room_joined', (info) => {
  currentRoomId = info.id;
  currentHostId = info.host;
  sessionStorage.setItem('werewolf_room', info.id);
  showPage('room-page');
  roomIdDisplay.textContent = info.id;
  updatePlayerList(info.players);
  updatePlayerCount(info.playerCount, info.config.maxPlayers);
  const isHost = socket.id === info.host;
  startGameBtn.classList.toggle('hidden', !isHost);
  addAiBtn.classList.toggle('hidden', !isHost);
});

socket.on('your_info', (info) => {
  currentPlayerId = info.playerId;
  currentSeat = info.seat;
  sessionStorage.setItem('werewolf_seat', info.seat.toString());
  sessionStorage.setItem('werewolf_playerId', info.playerId);
});

socket.on('player_joined', (data) => {
  addMessage('system', `新成员加入：${data.name}（${data.seat}号）${data.isAi ? '🤖 ' : ''}`);
});

socket.on('player_left', (data) => {
  addMessage('system', `成员离开：${data.seat}号`);
});

socket.on('host_changed', (data) => {
  currentHostId = data.newHost;
  const isHost = socket.id === data.newHost;
  startGameBtn.classList.toggle('hidden', !isHost);
  addAiBtn.classList.toggle('hidden', !isHost);
});

socket.on('left_room', () => {
  sessionStorage.removeItem('werewolf_seat');
  sessionStorage.removeItem('werewolf_room');
  sessionStorage.removeItem('werewolf_role');
  currentRoomId = null;
  _cachedPlayers = [];
  currentPhase = null;
  showPage('lobby-page');
});

socket.on('error', (data) => {
  showError(data.message);
});

// ========== 游戏事件 ==========

// 游戏开始
socket.on('game_started', ({ role }) => {
  // 清空旧聊天记录
  document.getElementById('feed-messages').innerHTML = '';
  showPage('game-page');
  addMessage('system', `游戏开始！你的身份是：${getRoleName(role)}`);
  // 缓存自己的角色到 sessionStorage
  sessionStorage.setItem('werewolf_role', role);
});

// 阶段切换
socket.on('phase_change', (data) => {
  currentPhase = data.phase;
  document.getElementById('phase-text').textContent = getPhaseText(data.phase);
  if (data.deaths) {
    data.deaths.forEach(d => {
      addMessage('death', `☠️ ${d.seat}号 ${d.name} 死亡`);
    });
  }
  if (data.message) {
    addMessage('system', data.message);
  }
  if (data.players) {
    _cachedPlayers = data.players.map(p => ({ ...p }));
  }
  // 同票重投阶段记录候选人
  if (data.phase === 'tie_vote' && data.tiedSeats) {
    _tiedSeats = data.tiedSeats;
  } else if (data.phase !== 'tie_vote' && data.phase !== 'tie_speech') {
    _tiedSeats = [];
  }
  updateActionPanel(data.phase);
  updatePlayerStatusList();
});

// 计时器同步
socket.on('timer_sync', (data) => {
  if (!gameTimer) {
    gameTimer = new GameTimer(() => {
      addMessage('system', '⏰ 时间到！');
    });
  }
  gameTimer.sync(data.serverTimestamp || Date.now(), data.startTimestamp, data.duration);
});

// 轮到某玩家行动
socket.on('your_turn', (data) => {
  _currentSpeakerSeat = data.seat;

  // 发言阶段及时刷新当前发言者编号
  if (data.action === 'speech') {
    updateActionPanel(currentPhase);
  }

  if (data.isYou) {
    if (data.action === 'speech') {
      addMessage('system', '🎤 轮到你了！请在规定时间内发言');
    } else if (data.action === 'night_kill' || data.action === 'investigate' || data.action === 'shoot' || data.action === 'witch') {
      _myNightPhase = currentPhase;
      addMessage('system', `🌙 请行动`);
      updateActionPanel(currentPhase);
    }
  }
});

// 发言广播
socket.on('speech_broadcast', (data) => {
  addMessage('speech', data.content, `${data.seat}号 ${data.name}`);
});

// 投票更新
socket.on('vote_update', (data) => {
  addMessage('system', `${data.seat}号已表决 (${data.totalVoters}/${data.totalAlive})`);
});

// 投票结果（含详细投票记录）
socket.on('vote_result', (data) => {
  const nameMap = {};
  _cachedPlayers.forEach(p => { nameMap[p.seat] = p.name; });

  // 按得票数分组：targetSeat → [voterSeat, ...]
  const groups = {};
  Object.entries(data.rawVotes).forEach(([voter, target]) => {
    const key = target == 0 ? '弃权' : target;
    if (!groups[key]) groups[key] = [];
    groups[key].push(parseInt(voter));
  });

  // 按票数从高到低排序
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

  const lines = sorted.map(([target, voters]) => {
    const votersStr = voters.map(s => `${s}号`).join('、');
    if (target === '弃权') return `弃权：${voters.length} 票（${votersStr}）`;
    const name = nameMap[target] || '';
    return `${target}号：${voters.length} 票（${votersStr}）`;
  });
  addMessage('system', `📋 表决结果：\n${lines.join('\n')}`);
  if (data.isTie && data.tiedSeats.length) {
    addMessage('system', `⚖️ 同票：${data.tiedSeats.map(s => s + '号 ' + (nameMap[s] || '')).join('、')}`);
  }
});

// 游戏结束
socket.on('game_over', (data) => {
  if (gameTimer) gameTimer.stop();
  const myRole = sessionStorage.getItem('werewolf_role');
  const isGood = myRole !== 'werewolf';
  const isWinner = (data.winner === 'good' && isGood) || (data.winner === 'werewolf' && !isGood);

  const panel = document.getElementById('action-panel');
  panel.innerHTML = `
    <div class="game-over-panel">
      <h2 style="color:${isWinner ? '#52c41a' : '#ff4d4f'};">
        ${isWinner ? '✅ 胜利' : '❌ 失败'}
      </h2>
      <p style="color:#666;margin-bottom:14px;">${data.message}</p>
      <h3 style="margin-bottom:10px;color:#999;font-size:13px;font-weight:400;">成员信息</h3>
      <div class="role-list">
        ${data.roles.sort((a,b) => a.seat - b.seat).map(r => `
          <div class="role-item" style="${r.seat === currentSeat ? 'border-color:#1890ff;background:#e6f7ff;' : ''}">
            <span>${r.seat}号 ${r.name}</span>
            <span style="color:${getRoleColor(r.role)}">${getRoleName(r.role)}</span>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-primary" onclick="location.reload()" style="margin-top:14px;">返回</button>
    </div>
  `;

  addMessage('result', `🏁 ${data.message}`);
  addMessage('result', `👥 ${data.winner === 'good' ? '好人胜利' : '狼人胜利'}`);

  sessionStorage.removeItem('werewolf_seat');
  sessionStorage.removeItem('werewolf_room');
  sessionStorage.removeItem('werewolf_role');
});

// 夜间队友信息
socket.on('night_teammates', (data) => {
  if (data.teammates && data.teammates.length > 0) {
    addMessage('private', `🐺 你的狼队友：${data.teammates.map(t => `${t.seat}号 ${t.name}`).join('、')}`);
  } else {
    addMessage('private', '🐺 你是独狼，没有队友');
  }
});

// 夜间行动结果
socket.on('night_result', (data) => {
  addMessage('private', `🔔 ${data.message}`);
});

// 女巫信息
socket.on('witch_info', (data) => {
  const infoEl = document.getElementById('witch-info');
  if (!infoEl) return;
  if (data.tonightKilled) {
    infoEl.innerHTML = `今晚被狼人击杀的是 <strong>${data.tonightKilled.seat}号 ${data.tonightKilled.name}</strong>`;
  } else {
    infoEl.innerHTML = '今晚无人被狼人击杀';
  }
  if (document.getElementById('witch-use-save')) {
    document.getElementById('witch-use-save').disabled = !data.hasSave;
  }
  if (document.getElementById('witch-use-kill')) {
    document.getElementById('witch-use-kill').disabled = !data.hasKill;
  }
});

// 猎人被动：死亡后选择带走目标
socket.on('hunter_activate', (data) => {
  if (data.expired) {
    addMessage('system', '⏰ 猎人技能超时');
    return;
  }
  const panel = document.getElementById('action-panel');
  const targets = data.targets || [];
  if (!targets.length) {
    addMessage('system', '🔫 无目标可带走');
    return;
  }
  panel.innerHTML = `
    <div class="night-area">
      <div class="night-title">🔫 选择带走目标</div>
      <p class="skill-name">你已出局，可以带走一名玩家</p>
      <div class="vote-targets">
        ${targets.map(t => `
          <button class="vote-target" onclick="hunterShoot(${t.seat})">
            ${t.seat}号 ${t.name}
          </button>
        `).join('')}
        <button class="vote-target" onclick="hunterShoot(0)" style="color:#999;">
          放弃
        </button>
      </div>
    </div>
  `;
});

function hunterShoot(targetSeat) {
  socket.emit('hunter_shoot', { targetSeat });
  addMessage('system', targetSeat > 0 ? `🔫 已选择带走 ${targetSeat}号` : '🔫 放弃技能');
  document.getElementById('action-panel').innerHTML = '<p class="waiting-text">⏳ 等待继续...</p>';
}

// 断线/重连事件
socket.on('player_disconnected', (data) => {
  addMessage('system', `⚠️ ${data.seat}号玩家断线了...（60秒内等待重连）`);
  if (data.players) {
    _cachedPlayers = data.players.map(p => ({ ...p }));
  }
  updatePlayerStatusList();
});

socket.on('player_reconnected', (data) => {
  addMessage('system', `✅ ${data.seat}号玩家重新连接`);
  updatePlayerStatusList();
});

// 更新玩家列表
function updatePlayerList(players) {
  playerListEl.innerHTML = players.map(p => `
    <div class="player-card">
      <span class="seat">#${p.seat}</span>
      <span>${p.name}</span>
      ${p.isHost ? '<span class="host-badge">房主</span>' : ''}
      ${p.isAi ? '<span class="ai-badge">AI</span>' : ''}
    </div>
  `).join('');
}

function updatePlayerCount(count, max) {
  playerCountDisplay.textContent = `${count}/${max}`;
}

// ========== 信息流消息 ==========
function addMessage(type, content, extra = '') {
  const feed = document.getElementById('feed-messages');
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  if (type === 'speech') {
    div.innerHTML = `<span class="speaker">${extra}</span>${content}`;
  } else {
    div.textContent = content;
  }
  feed.appendChild(div);
  feed.scrollTop = feed.scrollHeight;
}

// ========== 玩家状态列表 ==========
function updatePlayerStatusList() {
  const container = document.getElementById('player-status-list');
  if (!_cachedPlayers.length) return;

  container.innerHTML = _cachedPlayers
    .sort((a, b) => a.seat - b.seat)
    .map(p => {
      const isCurrent = p.seat === currentSeat;
      const isSpeaking = p.seat === _currentSpeakerSeat && currentPhase === 'free_speech';
      let statusClass = 'alive';
      if (!p.isAlive) statusClass = 'dead';
      if (isSpeaking) statusClass += ' speaking';
      if (isCurrent) statusClass += ' current-user';

      return `
        <div class="player-status-item ${statusClass}"
             data-seat="${p.seat}" data-name="${p.name}" data-alive="${p.isAlive}">
          <span class="status-dot">${p.isAlive ? '●' : '✕'}</span>
          <span>${p.seat}号 ${p.name}</span>
          ${isCurrent ? '<span>(你)</span>' : ''}
          ${p.disconnected ? '<span style="color:#888;font-size:11px;">[断线]</span>' : ''}
          ${p.isAi ? '<span style="color:#888;font-size:11px;">[AI]</span>' : ''}
        </div>
      `;
    }).join('');
}

// ========== 操作面板管理 ==========
function updateActionPanel(phase) {
  const panel = document.getElementById('action-panel');
  const isAlive = isCurrentPlayerAlive();

  switch (phase) {
    case 'free_speech':
    case 'tie_speech':
      if (isAlive && _currentSpeakerSeat === currentSeat) {
        panel.innerHTML = `
          <div class="speech-area">
            <div class="speech-label">🎤 你的发言（90秒）</div>
            <textarea id="speech-input" placeholder="输入你的发言内容..." maxlength="200"></textarea>
            <div class="speech-actions">
              <button class="btn btn-send" onclick="sendSpeech()">发送</button>
              <button class="btn btn-end" onclick="endSpeech()">结束发言</button>
            </div>
          </div>
        `;
        setTimeout(() => {
          const el = document.getElementById('speech-input');
          if (el) el.focus();
        }, 100);
      } else {
        panel.innerHTML = `<p class="waiting-text">⏳ 等待 ${_currentSpeakerSeat || '?'}号玩家发言中...</p>`;
      }
      break;

    case 'dawn_death_announce':
      if (currentPlayerId === currentHostId) {
        panel.innerHTML = `
          <div style="text-align:center;padding:16px;">
            <p style="font-size:15px;margin-bottom:16px;color:#666;">📋 结果已公示，请开始讨论</p>
            <button class="btn btn-primary" onclick="socket.emit('start_free_speech')">开始讨论</button>
          </div>
        `;
      } else {
        panel.innerHTML = `<p class="waiting-text">⏳ 等待主持人开始讨论...</p>`;
      }
      break;

    case 'vote':
    case 'tie_vote':
      if (isAlive) {
        let targets;
        let title;
        if (phase === 'tie_vote' && _tiedSeats.length) {
          // 同票重投：只显示候选人
          targets = _cachedPlayers.filter(p => _tiedSeats.includes(p.seat) && p.seat !== currentSeat);
          title = `🗳️ 请投票 - 在 ${_tiedSeats.map(s => s + '号').join('、')} 中选择`;
        } else {
          targets = _cachedPlayers.filter(p => p.isAlive && p.seat !== currentSeat);
          title = '🗳️ 请投票';
        }
        panel.innerHTML = `
          <div class="vote-area">
            <div class="vote-title">${title}</div>
            <div class="vote-targets" id="vote-targets">
              ${targets.map(t => `
                <button class="vote-target" data-seat="${t.seat}"
                  onclick="castVote(${t.seat})">
                  ${t.seat}号 ${t.name}
                </button>
              `).join('')}
              ${phase === 'tie_vote' ? `<button class="vote-target" data-seat="0"
                onclick="castVote(0)" style="color:#888;">
                弃权
              </button>` : ''}
            </div>
          </div>
        `;
      } else {
        panel.innerHTML = `<p class="waiting-text">⏳ 存活玩家正在投票...</p>`;
      }
      break;

    case 'night_werewolf':
    case 'night_seer':
    case 'night_witch':
      renderNightAction(phase, panel);
      break;

    default:
      panel.innerHTML = `<p class="waiting-text">⏳ 请等待其他玩家行动...</p>`;
  }
}

function renderNightAction(phase, panel) {
  const isMyPhase = _myNightPhase === phase;

  if (!isMyPhase) {
    panel.innerHTML = `<p class="waiting-text">🌙 等待其他玩家行动...</p>`;
    return;
  }

  const targets = _cachedPlayers.filter(p => p.isAlive && p.seat !== currentSeat);

  switch (phase) {
    case 'night_werewolf':
      panel.innerHTML = `
        <div class="night-area">
          <div class="night-title">🐺 狼人行动</div>
          <p class="skill-name">选择今晚要击杀的玩家</p>
          <select id="night-target">
            ${targets.map(t => `<option value="${t.seat}">${t.seat}号 ${t.name}</option>`).join('')}
          </select>
          <button class="btn-confirm" onclick="submitNightAction('kill')">确认击杀</button>
        </div>
      `;
      break;

    case 'night_seer':
      panel.innerHTML = `
        <div class="night-area">
          <div class="night-title">🔮 预言家查验</div>
          <p class="skill-name">选择要查验的玩家</p>
          <select id="night-target">
            ${targets.map(t => `<option value="${t.seat}">${t.seat}号 ${t.name}</option>`).join('')}
          </select>
          <button class="btn-confirm" onclick="submitNightAction('investigate')">确认查验</button>
        </div>
      `;
      break;

    case 'night_witch':
      panel.innerHTML = `
        <div class="night-area">
          <div class="night-title">🧪 女巫行动</div>
          <div id="witch-info" class="witch-info">加载中...</div>
          <div class="witch-actions" style="margin-top:12px;">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <input type="checkbox" id="witch-use-save"> 使用解药
            </label>
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <input type="checkbox" id="witch-use-kill"> 使用毒药
            </label>
            <div id="witch-kill-target-wrapper" class="hidden" style="margin-bottom:8px;">
              <p class="skill-name">选择毒杀目标</p>
              <select id="night-target">
                ${targets.map(t => `<option value="${t.seat}">${t.seat}号 ${t.name}</option>`).join('')}
              </select>
            </div>
          </div>
          <button class="btn-confirm" onclick="submitWitchAction()">确认行动</button>
        </div>
      `;
      // 毒药复选框切换显示目标选择
      setTimeout(() => {
        const killCheck = document.getElementById('witch-use-kill');
        if (killCheck) {
          killCheck.addEventListener('change', function() {
            document.getElementById('witch-kill-target-wrapper')
              .classList.toggle('hidden', !this.checked);
          });
        }
      }, 100);
      break;

  }
}

function isCurrentPlayerAlive() {
  const p = _cachedPlayers.find(p => p.seat === currentSeat);
  return p ? p.isAlive : false;
}

// ========== 阶段文本 ==========
function getPhaseText(phase) {
  const map = {
    'night_werewolf': '🌙 夜间·决策',
    'night_seer': '🌙 夜间·情报',
    'night_witch': '🌙 夜间·行动',
    'dawn_death_announce': '📋 结果公示',
    'last_words': '📝 陈述',
    'free_speech': '💬 讨论阶段',
    'vote': '📊 表决阶段',
    'vote_result': '📊 表决结果',
    'tie_speech': '💬 候选人发言',
    'tie_vote': '📊 再次表决',
    'final_words': '📝 陈述',
    'settlement': '🏁 结算'
  };
  return map[phase] || phase;
}

function getRoleName(role) {
  const map = { werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人', villager: '平民' };
  return map[role] || role;
}

function getRoleColor(role) {
  const map = { werewolf: '#ff4d4f', seer: '#1890ff', witch: '#722ed1', hunter: '#fa8c16', villager: '#52c41a' };
  return map[role] || '#999';
}

// ========== 全局函数（供 HTML onclick 调用） ==========
function sendSpeech() {
  const input = document.getElementById('speech-input');
  if (!input || !input.value.trim()) return;
  socket.emit('player_speech', { content: input.value.trim() });
  input.value = '';
  // 发言后自动结束自己的回合
  socket.emit('end_speech');
  addMessage('system', '✓ 发言已发送');
}

function endSpeech() {
  socket.emit('end_speech');
}

function castVote(targetSeat) {
  document.querySelectorAll('.vote-target').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.seat) === targetSeat);
  });
  socket.emit('vote', { targetSeat });
}

// ========== 夜间行动函数 ==========
function submitNightAction(type) {
  const target = parseInt(document.getElementById('night-target').value);
  socket.emit('night_action', { target, action: type });
}

function submitWitchAction() {
  const useSave = document.getElementById('witch-use-save').checked;
  const useKill = document.getElementById('witch-use-kill').checked;
  const killTarget = useKill ? parseInt(document.getElementById('night-target').value) : null;
  socket.emit('night_action', { action: 'witch', save: useSave, killTarget });
}

// ========== 房间事件中缓存玩家列表 ==========
socket.on('room_joined', (info) => {
  _cachedPlayers = info.players.map(p => ({ ...p }));
  updatePlayerStatusList();
});
