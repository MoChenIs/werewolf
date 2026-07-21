// public/app.js - 前端主逻辑
const socket = io();

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

let currentPlayerId = null;
let currentSeat = null;
let currentRoomId = null;
let gameTimer = null;
let currentPhase = null;
let _cachedPlayers = [];
let _currentSpeakerSeat = null;
let _myNightPhase = null;

// 页面切换
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(pageId).classList.remove('hidden');
}

// 显示错误
function showError(msg) {
  lobbyError.textContent = msg;
  lobbyError.classList.remove('hidden');
  setTimeout(() => lobbyError.classList.add('hidden'), 3000);
}

// ========== 客户端事件 ==========
createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || `玩家${Math.floor(Math.random()*1000)}`;
  socket.emit('create_room', { playerName: name });
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
  showPage('room-page');
  roomIdDisplay.textContent = info.id;
  updatePlayerList(info.players);
  updatePlayerCount(info.playerCount, info.config.maxPlayers);
  startGameBtn.classList.toggle('hidden', socket.id !== info.host);
});

socket.on('your_info', (info) => {
  currentPlayerId = info.playerId;
  currentSeat = info.seat;
});

socket.on('player_joined', (data) => {
  addMessage('system', `${data.name}（${data.seat}号）加入了房间`);
});

socket.on('player_left', (data) => {
  addMessage('system', `${data.seat}号玩家离开了房间`);
});

socket.on('host_changed', (data) => {
  startGameBtn.classList.toggle('hidden', socket.id !== data.newHost);
});

socket.on('error', (data) => {
  showError(data.message);
});

// ========== 游戏事件 ==========

// 游戏开始
socket.on('game_started', ({ role }) => {
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
  addMessage('system', `${data.seat}号玩家已投票 (${data.totalVoters}/${data.totalAlive})`);
});

// 游戏结束
socket.on('game_over', (data) => {
  if (gameTimer) gameTimer.stop();
  const myRole = sessionStorage.getItem('werewolf_role');
  const isGood = myRole !== 'werewolf';
  const isWinner = (data.winner === 'good' && isGood) || (data.winner === 'werewolf' && !isGood);

  const panel = document.getElementById('action-panel');
  panel.innerHTML = `
    <div style="text-align:center;padding:20px;">
      <h2 style="color:${isWinner ? '#4ade80' : '#ff6b6b'};font-size:24px;margin-bottom:16px;">
        ${isWinner ? '🎉 你赢了！' : '💀 你输了'}
      </h2>
      <p style="color:#f0c040;margin-bottom:20px;">${data.message}</p>
      <h3 style="margin-bottom:12px;color:#888;">全玩家底牌</h3>
      <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:20px;">
        ${data.roles.sort((a,b) => a.seat - b.seat).map(r => `
          <div style="padding:6px 12px;background:#1a1a2e;border-radius:4px;font-size:14px;
                      display:flex;justify-content:space-between;
                      ${r.seat === currentSeat ? 'border:1px solid #e94560;' : ''}">
            <span>${r.seat}号 ${r.name}</span>
            <span style="color:${getRoleColor(r.role)}">${getRoleName(r.role)}</span>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-primary" onclick="location.reload()">返回大厅</button>
    </div>
  `;

  addMessage('result', `🏆 ${data.message}`);
  addMessage('result', `👑 ${data.winner === 'good' ? '好人阵营' : '狼人阵营'}获胜！`);

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

// 更新玩家列表
function updatePlayerList(players) {
  playerListEl.innerHTML = players.map(p => `
    <div class="player-card">
      <span class="seat">#${p.seat}</span>
      <span>${p.name}</span>
      ${p.isHost ? '<span class="host-badge">房主</span>' : ''}
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

    case 'vote':
      if (isAlive) {
        const targets = _cachedPlayers.filter(p => p.isAlive && p.seat !== currentSeat);
        panel.innerHTML = `
          <div class="vote-area">
            <div class="vote-title">🗳️ 请投票 - 选择你怀疑的玩家</div>
            <div class="vote-targets" id="vote-targets">
              ${targets.map(t => `
                <button class="vote-target" data-seat="${t.seat}"
                  onclick="castVote(${t.seat})">
                  ${t.seat}号 ${t.name}
                </button>
              `).join('')}
              <button class="vote-target" data-seat="0"
                onclick="castVote(0)" style="color:#888;">
                弃权
              </button>
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
    case 'night_hunter':
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

    case 'night_hunter':
      panel.innerHTML = `
        <div class="night-area">
          <div class="night-title">🔫 猎人行动</div>
          <p class="skill-name">选择要带走的玩家</p>
          <select id="night-target">
            ${targets.map(t => `<option value="${t.seat}">${t.seat}号 ${t.name}</option>`).join('')}
          </select>
          <button class="btn-confirm" onclick="submitNightAction('shoot')">确认带走</button>
        </div>
      `;
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
    'night_werewolf': '🌙 黑夜 - 狼人行动',
    'night_seer': '🌙 黑夜 - 预言家查验',
    'night_witch': '🌙 黑夜 - 女巫行动',
    'night_hunter': '🌙 黑夜 - 猎人行动',
    'dawn_death_announce': '🌅 天亮 - 死讯公告',
    'last_words': '💀 遗言',
    'free_speech': '🗣️ 自由发言',
    'vote': '🗳️ 投票',
    'vote_result': '📊 投票结果',
    'final_words': '💀 出局遗言',
    'settlement': '🏆 游戏结束'
  };
  return map[phase] || phase;
}

function getRoleName(role) {
  const map = { werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人', villager: '平民' };
  return map[role] || role;
}

function getRoleColor(role) {
  const map = { werewolf: '#ff6b6b', seer: '#60a5fa', witch: '#a78bfa', hunter: '#fb923c', villager: '#4ade80' };
  return map[role] || '#ccc';
}

// ========== 全局函数（供 HTML onclick 调用） ==========
function sendSpeech() {
  const input = document.getElementById('speech-input');
  if (!input || !input.value.trim()) return;
  socket.emit('player_speech', { content: input.value.trim() });
  input.value = '';
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
