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
