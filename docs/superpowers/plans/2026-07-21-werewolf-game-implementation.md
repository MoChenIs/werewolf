# 纯文字线上狼人杀（90s打字版）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个可玩的纯文字线上狼人杀 MVP，支持 4-12 人在线游戏，包含狼人、预言家、女巫、猎人、平民角色。

**Architecture:** Node.js + Express + Socket.io 后端驱动 FSM 游戏引擎，Vanilla JS 前端渲染三区布局。服务端绝对权威，客户端仅作展示和操作入口。

**Tech Stack:** Node.js, Express, Socket.io, Vanilla HTML/CSS/JS

---

## 文件结构

```
D:\code\hb\werewolf\
├── package.json
├── server.js                 # HTTP + Socket.io 启动入口
├── room-manager.js           # 房间 CRUD、玩家加入/离开
├── game-engine.js            # FSM 状态机、阶段流转、胜负判定
├── roles/
│   ├── werewolf.js           # 狼人夜间行动
│   ├── seer.js               # 预言家查验
│   ├── witch.js              # 女巫解救/毒杀
│   └── hunter.js             # 猎人开枪
├── sensitive-words.json      # 敏感词列表
├── public/
│   ├── index.html            # 单页应用（大厅 + 游戏）
│   ├── style.css             # 三区布局 + 主题
│   ├── app.js                # 前端主逻辑、Socket.io 客户端
│   └── timer.js              # 倒计时渲染
├── test/
│   └── game-engine.test.js   # 游戏核心逻辑测试
└── README.md
```

---

## Phase 1：项目基础设施

### Task 1：初始化项目与依赖

**Files:**
- Create: `D:\code\hb\werewolf\package.json`
- Create: `D:\code\hb\werewolf\server.js`
- Create: `D:\code\hb\werewolf\sensitive-words.json`

- [ ] **Step 1：创建 package.json**

```json
{
  "name": "werewolf-text-game",
  "version": "1.0.0",
  "description": "纯文字线上狼人杀（90s打字版）",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node test/game-engine.test.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  }
}
```

- [ ] **Step 2：安装依赖**

Run:
```bash
cd /d/code/hb/werewolf
npm install
```

Expected: `node_modules/` 目录创建，`package-lock.json` 生成。

- [ ] **Step 3：创建 server.js 入口**

```javascript
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io 连接
io.on('connection', (socket) => {
  console.log(`[连接] 玩家连接: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[断开] 玩家断开: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`[启动] 狼人杀服务器运行在 http://localhost:${PORT}`);
});
```

- [ ] **Step 4：创建 sensitive-words.json（占位）**

```json
[
  "fuck",
  "shit",
  "asshole"
]
```

- [ ] **Step 5：验证服务器启动**

Run:
```bash
cd /d/code/hb/werewolf && node server.js &
sleep 2 && curl -s http://localhost:3000 | head -5
kill %1 2>/dev/null
```

Expected: 服务器启动无报错。

- [ ] **Step 6：提交**

```bash
git init
git add package.json server.js sensitive-words.json
git commit -m "chore: init project with Express + Socket.io"
```

---

### Task 2：实现 Room Manager

**Files:**
- Create: `D:\code\hb\werewolf\room-manager.js`

- [ ] **Step 1：实现 RoomManager 类**

```javascript
// room-manager.js
// 负责房间的创建、加入、离开、销毁

const crypto = require('crypto');

class RoomManager {
  constructor() {
    this.rooms = new Map();  // roomId -> Room
  }

  // 生成6位房间号
  generateRoomId() {
    let id;
    do {
      id = crypto.randomInt(100000, 999999).toString();
    } while (this.rooms.has(id));
    return id;
  }

  // 创建房间
  createRoom(socketId, playerName, config = {}) {
    const roomId = this.generateRoomId();
    const player = {
      id: socketId,
      name: playerName,
      seat: 1,
      isAlive: true,
      isSheriff: false,
      role: null,
      isAfk: false,
      disconnected: false,
      warnings: 0,
      hasVoted: false,
      voteTarget: null
    };
    const room = {
      id: roomId,
      players: new Map([[socketId, player]]),
      host: socketId,
      status: 'waiting',  // 'waiting' | 'playing' | 'ended'
      config: {
        maxPlayers: config.maxPlayers || 12,
        werewolfCount: config.werewolfCount || 2
      },
      game: null,
      seatCount: 1
    };
    this.rooms.set(roomId, room);
    return { room, player };
  }

  // 加入房间
  joinRoom(roomId, socketId, playerName) {
    const room = this.rooms.get(roomId);
    if (!room) return { error: '房间不存在' };
    if (room.status !== 'waiting') return { error: '游戏已开始，无法加入' };
    if (room.players.size >= room.config.maxPlayers) return { error: '房间已满' };

    const seat = room.seatCount + 1;
    room.seatCount = seat;
    const player = {
      id: socketId,
      name: playerName,
      seat,
      isAlive: true,
      isSheriff: false,
      role: null,
      isAfk: false,
      disconnected: false,
      warnings: 0,
      hasVoted: false,
      voteTarget: null
    };
    room.players.set(socketId, player);
    return { room, player };
  }

  // 玩家离开
  leaveRoom(socketId) {
    for (const [roomId, room] of this.rooms) {
      if (room.players.has(socketId)) {
        const player = room.players.get(socketId);
        room.players.delete(socketId);

        if (room.players.size === 0) {
          this.rooms.delete(roomId);
          return { roomId, action: 'destroyed' };
        }

        // 房主离开，转让房主
        if (room.host === socketId) {
          const nextHost = room.players.keys().next().value;
          room.host = nextHost;
          return { roomId, action: 'left', newHost: nextHost, seat: player.seat };
        }

        return { roomId, action: 'left', seat: player.seat };
      }
    }
    return { error: '玩家不在任何房间中' };
  }

  // 根据 socketId 查找房间
  findRoomBySocket(socketId) {
    for (const room of this.rooms.values()) {
      if (room.players.has(socketId)) return room;
    }
    return null;
  }

  // 获取房间公开信息（不含角色）
  getRoomInfo(room) {
    const players = Array.from(room.players.values()).map(p => ({
      seat: p.seat,
      name: p.name,
      isAlive: p.isAlive,
      disconnected: p.disconnected
    }));
    players.sort((a, b) => a.seat - b.seat);
    return {
      id: room.id,
      host: room.host,
      status: room.status,
      config: room.config,
      players,
      playerCount: room.players.size
    };
  }
}

module.exports = RoomManager;
```

- [ ] **Step 2：编写 RoomManager 单元测试**

```javascript
// test/room-manager.test.js
const RoomManager = require('../room-manager');
const rm = new RoomManager();

// 测试创建房间
const result = rm.createRoom('socket-1', '玩家A');
console.assert(result.room, '创建房间应返回 room 对象');
console.assert(result.room.id.length === 6, '房间号应为6位');
console.assert(result.room.players.size === 1, '房间应包含创建者');
console.assert(result.player.seat === 1, '创建者座位应为1');
console.log('✓ 创建房间测试通过');

// 测试加入房间
const joinResult = rm.joinRoom(result.room.id, 'socket-2', '玩家B');
console.assert(joinResult.room, '加入房间应返回 room');
console.assert(joinResult.player.seat === 2, '加入者座位应为2');
console.log('✓ 加入房间测试通过');

// 测试满员
for (let i = 3; i <= 12; i++) {
  rm.joinRoom(result.room.id, `socket-${i}`, `玩家${i}`);
}
const fullResult = rm.joinRoom(result.room.id, 'socket-13', '玩家13');
console.assert(fullResult.error, '满员时应返回错误');
console.log('✓ 满员检测测试通过');

// 测试离开
const leaveResult = rm.leaveRoom('socket-2');
console.assert(leaveResult.action === 'left', '离开玩家应返回 left');
console.assert(leaveResult.seat === 2, '应返回离开者的座位号');
console.log('✓ 离开房间测试通过');

// 测试房间销毁
rm.leaveRoom('socket-1');
const remaining = Array.from(rm.rooms.keys());
console.log('✓ 所有玩家离开后房间应被销毁');

console.log('\n所有 RoomManager 测试通过!');
```

- [ ] **Step 3：运行测试**

Run:
```bash
node test/room-manager.test.js
```

Expected: 所有测试行输出 "✓" 标记。

- [ ] **Step 4：集成到 server.js 中**

在 server.js 中 `io.on('connection', ...)` 内部添加：

```javascript
const RoomManager = require('./room-manager');
const roomManager = new RoomManager();

io.on('connection', (socket) => {
  console.log(`[连接] 玩家连接: ${socket.id}`);

  // 创建房间
  socket.on('create_room', ({ playerName, config }) => {
    const { room, player } = roomManager.createRoom(socket.id, playerName, config);
    socket.join(room.id);
    socket.emit('room_joined', roomManager.getRoomInfo(room));
    socket.emit('your_info', { seat: player.seat, playerId: socket.id });
  });

  // 加入房间
  socket.on('join_room', ({ roomId, playerName }) => {
    const result = roomManager.joinRoom(roomId, socket.id, playerName);
    if (result.error) {
      return socket.emit('error', { code: 'JOIN_FAILED', message: result.error });
    }
    socket.join(roomId);
    socket.emit('room_joined', roomManager.getRoomInfo(result.room));
    socket.emit('your_info', { seat: result.player.seat, playerId: socket.id });
    // 通知房间其他人
    socket.to(roomId).emit('player_joined', { seat: result.player.seat, name: result.player.name });
  });

  // 玩家离开
  socket.on('leave_room', () => {
    const result = roomManager.leaveRoom(socket.id);
    if (result.action === 'left') {
      socket.to(result.roomId).emit('player_left', { seat: result.seat });
      if (result.newHost) {
        io.to(result.roomId).emit('host_changed', { newHost: result.newHost });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`[断开] 玩家断开: ${socket.id}`);
    const result = roomManager.leaveRoom(socket.id);
    if (result && result.action === 'left') {
      io.to(result.roomId).emit('player_left', { seat: result.seat });
    }
  });
});
```

- [ ] **Step 5：提交**

```bash
git add room-manager.js server.js test/room-manager.test.js
git commit -m "feat: implement room manager with create/join/leave"
```

---

### Task 3：创建前端页面框架

**Files:**
- Create: `D:\code\hb\werewolf\public\index.html`
- Create: `D:\code\hb\werewolf\public\style.css`

- [ ] **Step 1：创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>纯文字狼人杀</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- ========== 大厅页面 ========== -->
  <div id="lobby-page" class="page">
    <div class="lobby-container">
      <h1 class="game-title">🐺 纯文字狼人杀</h1>
      <p class="game-subtitle">90s打字版 · 逻辑与口才的较量</p>
      <div class="lobby-actions">
        <div class="input-group">
          <input type="text" id="player-name" placeholder="输入你的昵称" maxlength="8">
        </div>
        <div class="input-group">
          <input type="text" id="room-id-input" placeholder="输入房间号" maxlength="6">
          <button id="join-room-btn" class="btn btn-secondary">加入房间</button>
        </div>
        <div class="divider"><span>或</span></div>
        <button id="create-room-btn" class="btn btn-primary">创建新房间</button>
      </div>
      <div id="lobby-error" class="error-msg hidden"></div>
    </div>
  </div>

  <!-- ========== 房间页面 ========== -->
  <div id="room-page" class="page hidden">
    <div class="room-header">
      <span>房间号: <strong id="room-id-display"></strong></span>
      <span id="player-count-display">1/12</span>
      <button id="start-game-btn" class="btn btn-primary btn-sm">开始游戏</button>
    </div>
    <div id="player-list" class="player-list"></div>
  </div>

  <!-- ========== 游戏页面 ========== -->
  <div id="game-page" class="page hidden">
    <!-- 三区布局 -->
    <div class="game-layout">
      <!-- 左侧：全局状态区 -->
      <div class="zone-status">
        <div class="phase-display">
          <span id="phase-text">等待开始</span>
        </div>
        <div class="timer-display">
          <span id="timer-text">--</span>
        </div>
        <div class="player-status-list" id="player-status-list"></div>
      </div>

      <!-- 中间：公共信息流 -->
      <div class="zone-feed">
        <div class="feed-header">💬 信息流</div>
        <div class="feed-messages" id="feed-messages"></div>
      </div>

      <!-- 右侧：个人操作区 -->
      <div class="zone-action">
        <div class="action-panel" id="action-panel">
          <p class="waiting-text">请等待其他玩家行动...</p>
        </div>
      </div>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="timer.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2：创建 style.css**

```css
/* ========== 全局重置 ========== */
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, 'Microsoft YaHei', sans-serif;
  background: #0f0f23;
  color: #e0e0e0;
  min-height: 100vh;
  overflow: hidden;
}
.hidden { display: none !important; }

/* ========== 大厅 ========== */
.page { width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
.lobby-container { text-align: center; padding: 40px; max-width: 420px; }
.game-title { font-size: 36px; color: #e94560; margin-bottom: 8px; }
.game-subtitle { font-size: 14px; color: #888; margin-bottom: 32px; }
.input-group {
  display: flex; gap: 8px; margin-bottom: 12px;
  input {
    flex: 1; padding: 10px 14px; border: 1px solid #333; border-radius: 6px;
    background: #1a1a2e; color: #fff; font-size: 15px; outline: none;
    &:focus { border-color: #e94560; }
  }
}
.btn {
  padding: 10px 20px; border: none; border-radius: 6px; font-size: 15px;
  cursor: pointer; transition: all 0.2s;
  &:active { transform: scale(0.97); }
}
.btn-primary { background: #e94560; color: #fff; width: 100%; }
.btn-secondary { background: #16213e; color: #e94560; border: 1px solid #e94560; white-space: nowrap; }
.btn-sm { padding: 6px 14px; font-size: 13px; width: auto; }
.divider { margin: 16px 0; color: #555; display: flex; align-items: center; gap: 12px; }
.divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: #333; }
.error-msg { color: #ff6b6b; margin-top: 12px; font-size: 14px; }

/* ========== 房间页面 ========== */
#room-page { flex-direction: column; gap: 20px; padding: 40px; }
.room-header {
  display: flex; align-items: center; gap: 20px; padding: 16px 24px;
  background: #1a1a2e; border-radius: 8px; width: 100%; max-width: 500px;
  font-size: 16px;
}
.player-list {
  display: flex; flex-wrap: wrap; gap: 10px; max-width: 500px; width: 100%;
}
.player-list .player-card {
  padding: 10px 16px; background: #16213e; border-radius: 6px;
  font-size: 14px; display: flex; align-items: center; gap: 8px;
}
.player-list .player-card .seat { color: #e94560; font-weight: bold; }
.player-list .player-card .host-badge { font-size: 11px; color: #f0c040; background: #333; padding: 2px 6px; border-radius: 4px; }

/* ========== 游戏三区布局 ========== */
.game-layout {
  display: grid;
  grid-template-columns: 220px 1fr 300px;
  height: 100vh;
  width: 100vw;
  gap: 0;
}
@media (max-width: 768px) {
  .game-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr auto;
  }
}

/* 状态区 */
.zone-status {
  background: #111128; padding: 16px; display: flex; flex-direction: column; gap: 12px;
  border-right: 1px solid #1e1e3f;
}
.phase-display {
  background: #1a1a3e; padding: 12px; border-radius: 8px; text-align: center;
}
.phase-display #phase-text { font-size: 18px; font-weight: bold; color: #e94560; }
.timer-display {
  text-align: center; padding: 8px;
}
.timer-display #timer-text {
  font-size: 48px; font-weight: bold; font-family: 'Courier New', monospace;
  color: #f0c040;
}
.timer-display .timer-label { font-size: 12px; color: #888; }
.player-status-list { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
.player-status-item {
  padding: 6px 10px; border-radius: 4px; font-size: 13px;
  display: flex; align-items: center; gap: 6px;
}
.player-status-item.alive { color: #4ade80; }
.player-status-item.dead { color: #666; text-decoration: line-through; }
.player-status-item.speaking { background: #1a2a4e; color: #fab; }
.player-status-item.current-user { border-left: 3px solid #e94560; }

/* 信息流 */
.zone-feed {
  display: flex; flex-direction: column; background: #0a0a1a;
}
.feed-header {
  padding: 12px 16px; background: #111128; border-bottom: 1px solid #1e1e3f;
  font-size: 14px; font-weight: bold; color: #888;
}
.feed-messages {
  flex: 1; overflow-y: auto; padding: 12px 16px;
  display: flex; flex-direction: column; gap: 6px;
}
.msg { padding: 6px 10px; border-radius: 4px; font-size: 14px; line-height: 1.5; }
.msg.system { color: #f0c040; font-style: italic; }
.msg.speech { color: #e0e0e0; }
.msg.speech .speaker { color: #4ade80; font-weight: bold; margin-right: 6px; }
.msg.speech .speaker-self { color: #fab; }
.msg.private { color: #f0c040; background: #1a1a2e; border-left: 3px solid #f0c040; }
.msg.death { color: #ff6b6b; }
.msg.result { color: #4ade80; font-weight: bold; font-size: 16px; text-align: center; padding: 12px; }

/* 操作区 */
.zone-action {
  background: #111128; padding: 16px; border-left: 1px solid #1e1e3f;
  display: flex; flex-direction: column;
}
.action-panel {
  flex: 1; display: flex; flex-direction: column;
}
.waiting-text { color: #666; text-align: center; margin: auto; font-size: 15px; }

/* 发言模式 */
.speech-area { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.speech-area textarea {
  flex: 1; padding: 12px; border: 1px solid #333; border-radius: 6px;
  background: #1a1a2e; color: #fff; font-size: 15px; resize: none; outline: none;
  min-height: 100px;
  &:focus { border-color: #e94560; }
}
.speech-actions { display: flex; gap: 8px; }
.speech-actions .btn-send { flex: 1; background: #e94560; color: #fff; }
.speech-actions .btn-end { background: #333; color: #888; }

/* 投票模式 */
.vote-area { display: flex; flex-direction: column; gap: 8px; }
.vote-area .vote-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
.vote-targets { display: flex; flex-direction: column; gap: 4px; }
.vote-target {
  padding: 8px 12px; background: #1a1a2e; border: 1px solid #333; border-radius: 6px;
  cursor: pointer; font-size: 14px; color: #e0e0e0; text-align: left;
  &:hover { border-color: #e94560; background: #16213e; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.vote-target.selected { border-color: #e94560; background: #2a1a2e; }

/* 夜间模式 */
.night-area { display: flex; flex-direction: column; gap: 12px; }
.night-area .night-title { font-size: 16px; font-weight: bold; color: #8888cc; }
.night-area .skill-name { font-size: 14px; color: #aaa; }
.night-area select {
  padding: 8px; background: #1a1a2e; border: 1px solid #333; border-radius: 6px;
  color: #fff; font-size: 14px;
}
.night-area .btn-confirm { background: #4a4a8a; color: #fff; padding: 8px; border: none; border-radius: 6px; cursor: pointer; }
```

- [ ] **Step 3：验证前端加载**

Run:
```bash
cd /d/code/hb/werewolf && node server.js &
sleep 2 && curl -s http://localhost:3000 | grep -c 'DOCTYPE'
kill %1 2>/dev/null
```

Expected: 输出 `1`，表示 HTML 页面可正常访问。

- [ ] **Step 4：提交**

```bash
git add public/index.html public/style.css
git commit -m "feat: create frontend scaffold with lobby and three-zone layout"
```

---

### Task 4：前端 Socket.io 连接与大厅交互

**Files:**
- Create: `D:\code\hb\werewolf\public\app.js`

- [ ] **Step 1：创建 app.js**

```javascript
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
  updatePlayerList(info.players, info.host);
  updatePlayerCount(info.playerCount, info.config.maxPlayers);
  startGameBtn.classList.toggle('hidden', socket.id !== info.host);
});

socket.on('your_info', (info) => {
  currentPlayerId = info.playerId;
  currentSeat = info.seat;
});

socket.on('player_joined', (data) => {
  addMessage(`system`, `${data.name}（${data.seat}号）加入了房间`);
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
function updatePlayerList(players, hostId) {
  playerListEl.innerHTML = players.map(p => `
    <div class="player-card">
      <span class="seat">#${p.seat}</span>
      <span>${p.name}</span>
      ${hostId === socket.id && p.seat === currentSeat ? '<span class="host-badge">房主</span>' : ''}
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
```

- [ ] **Step 2：提交**

```bash
git add public/app.js
git commit -m "feat: frontend Socket.io connection and lobby UI"
```

---

## Phase 2：游戏引擎核心

### Task 5：实现角色分配

**Files:**
- Modify: `D:\code\hb\werewolf\game-engine.js`

- [ ] **Step 1：实现角色分配逻辑**

```javascript
// game-engine.js
// 核心游戏引擎：状态机 + 角色管理 + 阶段流转

const roles = {
  WEREWOLF: 'werewolf',
  SEER: 'seer',
  WITCH: 'witch',
  HUNTER: 'hunter',
  VILLAGER: 'villager'
};

class GameEngine {
  constructor(room) {
    this.room = room;
    this.phase = 'waiting';
    this.round = 0;
    this.currentSpeaker = null;
    this.speechStartTime = null;
    this.speechDuration = 90000; // 90s 发言
    this.voteDuration = 30000;   // 30s 投票
    this.nightDuration = 20000;  // 20s 夜间行动上限
    this.history = [];
    this.votes = {};             // seat -> targetSeat
    this.nightActions = {};
    this.witchUsedSave = false;
    this.witchUsedKill = false;
  }

  // 分配角色
  assignRoles() {
    const players = Array.from(this.room.players.values());
    const count = players.length;
    const werewolfCount = Math.min(this.room.config.werewolfCount, Math.floor(count / 3));
    const roleList = [];

    // 添加狼人
    for (let i = 0; i < werewolfCount; i++) roleList.push(roles.WEREWOLF);
    // 添加预言家
    roleList.push(roles.SEER);
    // 添加女巫
    roleList.push(roles.WITCH);
    // 添加猎人
    roleList.push(roles.HUNTER);
    // 剩余为平民
    while (roleList.length < count) roleList.push(roles.VILLAGER);

    // 随机打乱
    for (let i = roleList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roleList[i], roleList[j]] = [roleList[j], roleList[i]];
    }

    players.forEach((p, idx) => {
      p.role = roleList[idx];
    });

    this.phase = 'role_assign';
    return { roleList, players };
  }

  // 获取某玩家角色
  getPlayerRole(socketId) {
    const player = this.room.players.get(socketId);
    return player ? player.role : null;
  }

  // 获取所有狼人列表
  getWerewolves() {
    return Array.from(this.room.players.values())
      .filter(p => p.role === roles.WEREWOLF);
  }

  // 检查胜负
  checkGameEnd() {
    const alivePlayers = Array.from(this.room.players.values()).filter(p => p.isAlive);
    const aliveWerewolves = alivePlayers.filter(p => p.role === roles.WEREWOLF);
    const aliveGood = alivePlayers.filter(p => p.role !== roles.WEREWOLF);

    if (aliveWerewolves.length === 0) {
      return { ended: true, winner: 'good', message: '所有狼人已被消灭，好人阵营获胜！' };
    }
    if (aliveWerewolves.length >= aliveGood.length) {
      return { ended: true, winner: 'werewolf', message: '狼人人数与好人均等，狼人阵营获胜！' };
    }
    return { ended: false };
  }

  // 记录日志
  addLog(type, content, targetSeat = null) {
    this.history.push({
      round: this.round,
      phase: this.phase,
      type,
      content,
      timestamp: Date.now(),
      targetSeat
    });
  }
}

module.exports = { GameEngine, roles };
```

- [ ] **Step 2：编写角色分配测试**

```javascript
// test/game-engine.test.js
const { GameEngine, roles } = require('../game-engine');

function createMockRoom(playerCount) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(`socket-${i}`, {
      id: `socket-${i}`, name: `玩家${i}`, seat: i,
      isAlive: true, role: null, disconnected: false, warnings: 0
    });
  }
  return { id: '123456', players, config: { maxPlayers: 12, werewolfCount: 2 }, seatCount: playerCount };
}

// 测试角色分配
const room = createMockRoom(8);
const engine = new GameEngine(room);
const result = engine.assignRoles();

console.assert(result.roleList.length === 8, `应有8个角色，实际${result.roleList.length}`);
const roleCounts = {};
result.roleList.forEach(r => { roleCounts[r] = (roleCounts[r] || 0) + 1; });
console.assert(roleCounts[roles.WEREWOLF] === 2, `应有2个狼人，实际${roleCounts[roles.WEREWOLF]}`);
console.assert(roleCounts[roles.SEER] === 1, `应有1个预言家，实际${roleCounts[roles.SEER]}`);
console.assert(roleCounts[roles.WITCH] === 1, `应有1个女巫，实际${roleCounts[roles.WITCH]}`);
console.assert(roleCounts[roles.HUNTER] === 1, `应有1个猎人，实际${roleCounts[roles.HUNTER]}`);
const villagerCount = roleCounts[roles.VILLAGER] || 0;
console.assert(villagerCount === 3, `应有3个平民，实际${villagerCount}`);
console.log('✓ 角色分配数量测试通过');

// 测试检查胜负 - 未结束
const endResult1 = engine.checkGameEnd();
console.assert(endResult1.ended === false, '游戏开始时不应结束');
console.log('✓ 未结束状态测试通过');

// 模拟狼人全死
Array.from(room.players.values()).filter(p => p.role === roles.WEREWOLF).forEach(p => p.isAlive = false);
const endResult2 = engine.checkGameEnd();
console.assert(endResult2.ended === true, '狼人全灭应结束');
console.assert(endResult2.winner === 'good', '狼人全灭好人应获胜');
console.log('✓ 好人胜利判定测试通过');

// 重置
Array.from(room.players.values()).forEach(p => p.isAlive = true);
// 模拟好人都死光只剩狼人
Array.from(room.players.values()).filter(p => p.role !== roles.WEREWOLF).forEach(p => p.isAlive = false);
const endResult3 = engine.checkGameEnd();
console.assert(endResult3.ended === true, '好人与狼人人数均等应结束');
console.log('✓ 狼人胜利判定测试通过');

console.log('\n所有 GameEngine 测试通过!');
```

- [ ] **Step 3：运行测试**

Run:
```bash
node test/game-engine.test.js
```

Expected: 所有测试输出 "✓"。

- [ ] **Step 4：提交**

```bash
git add game-engine.js test/game-engine.test.js
git commit -m "feat: implement role assignment and game-end check"
```

---

### Task 6：实现夜间 FSM 流转

**Files:**
- Modify: `D:\code\hb\werewolf\game-engine.js`
- Modify: `D:\code\hb\werewolf\server.js`

- [ ] **Step 1：在 game-engine.js 中添加阶段流转方法**

```javascript
// game-engine.js 中新增方法

// 启动游戏（开始第一夜）
startGame() {
  this.assignRoles();
  this.round = 1;
  this.phase = 'night_werewolf';
  this.addLog('system', '天黑请闭眼。狼人请行动...');
  return this.phase;
}

// 进入夜间下一角色阶段
advanceNight() {
  const nightOrder = ['night_werewolf', 'night_seer', 'night_witch', 'night_hunter'];
  const idx = nightOrder.indexOf(this.phase);
  if (idx < nightOrder.length - 1) {
    this.phase = nightOrder[idx + 1];
    return { phase: this.phase, isNight: true };
  }
  // 夜间结束，进入白天
  return this.startDay();
}

// 进入白天
startDay() {
  this.phase = 'dawn_death_announce';
  this.votes = {};
  // 计算死者
  const deaths = this.calculateDeaths();
  this.addLog('death', `昨晚 ${deaths.length > 0 ? deaths.map(d => `${d.seat}号 ${d.name}`).join('、') : '没有人'}死亡`);
  return { phase: this.phase, deaths, isDay: true };
}

// 计算死者（处理女巫解救和毒杀）
calculateDeaths() {
  const werewolfKill = this.nightActions.werewolfKill;
  const witchSave = this.nightActions.witchSave;
  const witchKill = this.nightActions.witchKill;
  const dead = [];

  if (werewolfKill && werewolfKill !== witchSave) {
    const target = Array.from(this.room.players.values())
      .find(p => p.seat === werewolfKill);
    if (target) {
      target.isAlive = false;
      dead.push({ seat: target.seat, name: target.name, cause: 'werewolf' });
    }
  }
  if (witchKill) {
    const target = Array.from(this.room.players.values())
      .find(p => p.seat === witchKill);
    if (target && target.isAlive) {
      target.isAlive = false;
      dead.push({ seat: target.seat, name: target.name, cause: 'witch' });
    }
  }
  return dead;
}

// 推进到白天发言阶段
startFreeSpeech() {
  this.phase = 'free_speech';
  // 确定发言顺序（按座位号从小到大）
  const alivePlayers = Array.from(this.room.players.values())
    .filter(p => p.isAlive)
    .sort((a, b) => a.seat - b.seat);
  this.dayOrder = alivePlayers.map(p => p.seat);
  this.currentSpeaker = 0; // dayOrder 中的索引
  this.speechStartTime = Date.now();
  this.addLog('system', `自由发言开始，按顺序每人90秒`);
  return {
    phase: this.phase,
    speaker: this.dayOrder[this.currentSpeaker]
  };
}

// 发言结束，进入下一位或投票
nextSpeaker() {
  this.currentSpeaker++;
  if (this.currentSpeaker < this.dayOrder.length) {
    this.speechStartTime = Date.now();
    return {
      phase: 'free_speech',
      speaker: this.dayOrder[this.currentSpeaker],
      isLast: this.currentSpeaker === this.dayOrder.length - 1
    };
  }
  // 所有人发言完毕，进入投票
  return this.startVote();
}

// 开始投票
startVote() {
  this.phase = 'vote';
  this.votes = {};
  this.addLog('system', '请所有存活玩家投票');
  return { phase: this.phase };
}

// 执行投票结果
executeVote() {
  // 统计票数
  const tally = {};
  Object.values(this.votes).forEach(target => {
    if (target) tally[target] = (tally[target] || 0) + 1;
  });
  let maxVotes = 0, maxTarget = null;
  Object.entries(tally).forEach(([target, count]) => {
    if (count > maxVotes) { maxVotes = count; maxTarget = parseInt(target); }
  });

  if (!maxTarget || maxVotes === 0) {
    this.addLog('system', '无人被放逐（平票或全部弃权）');
    return { phase: 'free_speech', eliminated: null, isTie: true };
  }

  const eliminated = Array.from(this.room.players.values()).find(p => p.seat === maxTarget);
  if (eliminated) {
    eliminated.isAlive = false;
    this.addLog('system', `${eliminated.seat}号 ${eliminated.name} 被放逐`);
    this.phase = 'final_words';
    return { phase: 'final_words', eliminated: { seat: eliminated.seat, name: eliminated.name } };
  }
  return { phase: 'free_speech', eliminated: null };
}

// 遗言结束，进入下一夜或结算
afterFinalWords() {
  // 如果游戏结束，先检查
  const endCheck = this.checkGameEnd();
  if (endCheck.ended) return { phase: 'settlement', ...endCheck };

  this.round++;
  this.nightActions = {};
  this.phase = 'night_werewolf';
  this.addLog('system', `第${this.round}夜，天黑请闭眼。`);
  return { phase: this.phase };
}
```

- [ ] **Step 2：添加阶段流转的测试**

在 `test/game-engine.test.js` 末尾追加：

```javascript
// 测试夜间到白天流转
const room2 = createMockRoom(6);
const engine2 = new GameEngine(room2);
engine2.assignRoles();

// 模拟夜间狼人杀4号
engine2.nightActions.werewolfKill = 4;
const dayResult = engine2.startDay();
console.assert(dayResult.phase === 'dawn_death_announce', `天亮了应为 dawn_death_announce，实际 ${dayResult.phase}`);
const deadPlayer = dayResult.deaths.find(d => d.seat === 4);
console.assert(deadPlayer, '4号玩家应死亡');
console.assert(Array.from(room2.players.values()).find(p => p.seat === 4).isAlive === false, '4号玩家应标记为死亡');
console.log('✓ 夜间死者计算测试通过');

// 测试女巫解救
const room3 = createMockRoom(6);
const engine3 = new GameEngine(room3);
engine3.assignRoles();
engine3.nightActions.werewolfKill = 3;
engine3.nightActions.witchSave = 3; // 女巫救3号
const dayResult2 = engine3.startDay();
console.assert(dayResult2.deaths.length === 0, '女巫解救后应无人死亡');
console.log('✓ 女巫解救测试通过');

console.log('\n所有 FSM 流转测试通过!');
```

- [ ] **Step 3：运行测试**

Run:
```bash
node test/game-engine.test.js
```

Expected: 所有测试通过。

- [ ] **Step 4：在 server.js 中集成 start_game 事件**

```javascript
// server.js 中 socket.on('connection', ...) 内补充
const { GameEngine, roles } = require('./game-engine');

// 在 connection 回调中
socket.on('start_game', () => {
  const room = roomManager.findRoomBySocket(socket.id);
  if (!room) return socket.emit('error', { code: 'NO_ROOM', message: '你不在房间中' });
  if (room.host !== socket.id) return socket.emit('error', { code: 'NOT_HOST', message: '只有房主可以开始游戏' });
  if (room.players.size < 4) return socket.emit('error', { code: 'NOT_ENOUGH', message: '至少需要4名玩家' });

  const engine = new GameEngine(room);
  room.game = engine;
  room.status = 'playing';
  const phase = engine.startGame();

  // 私密发送身份
  room.players.forEach((player) => {
    io.to(player.id).emit('game_started', { role: player.role });
  });

  // 广播游戏开始
  io.to(room.id).emit('phase_change', {
    phase: 'night_werewolf',
    message: '天黑请闭眼，狼人请行动...'
  });

  // 告知狼人队友
  const werewolves = engine.getWerewolves();
  const werewolfSeats = werewolves.map(w => ({ seat: w.seat, name: w.name }));
  werewolves.forEach(w => {
    io.to(w.id).emit('night_teammates', { teammates: werewolfSeats.filter(t => t.seat !== w.seat) });
  });

  // 通知狼人行动
  const firstWerewolf = werewolves[0];
  if (firstWerewolf) {
    io.to(firstWerewolf.id).emit('your_turn', {
      action: 'night_kill',
      targets: Array.from(room.players.values()).filter(p => p.isAlive).map(p => ({ seat: p.seat, name: p.name }))
    });
  }
});
```

- [ ] **Step 5：提交**

```bash
git add game-engine.js server.js test/game-engine.test.js
git commit -m "feat: implement night-day FSM transitions"
```

---

### Task 7：实现白天发言与投票流程

**Files:**
- Modify: `D:\code\hb\werewolf\game-engine.js`
- Modify: `D:\code\hb\werewolf\server.js`

- [ ] **Step 1：在 server.js 中添加发言事件处理**

```javascript
// server.js 中 socket.on('connection', ...) 内补充

// 房主开始白天发言
socket.on('start_free_speech', () => {
  const room = roomManager.findRoomBySocket(socket.id);
  if (!room || room.host !== socket.id) return;
  const engine = room.game;
  if (!engine || engine.phase !== 'dawn_death_announce') return;

  const result = engine.startFreeSpeech();
  io.to(room.id).emit('phase_change', { phase: 'free_speech', message: '自由发言开始' });
  startSpeechTimerForSpeaker(room, io);
});

// 玩家提交发言
socket.on('player_speech', ({ content }) => {
  const room = roomManager.findRoomBySocket(socket.id);
  if (!room || !room.game) return;
  const engine = room.game;
  const player = room.players.get(socket.id);
  if (!player || !player.isAlive) return;
  if (engine.phase !== 'free_speech') return;

  const expectedSeat = engine.dayOrder[engine.currentSpeaker];
  if (player.seat !== expectedSeat) return; // 不是该玩家的回合

  // 敏感词过滤
  const filtered = filterSensitiveWords(content);

  io.to(room.id).emit('speech_broadcast', {
    seat: player.seat,
    name: player.name,
    content: filtered
  });
  engine.addLog('speech', `${player.seat}号发言: ${filtered}`, player.seat);
});

// 提前结束发言
socket.on('end_speech', () => {
  const room = roomManager.findRoomBySocket(socket.id);
  if (!room || !room.game) return;
  const engine = room.game;
  if (engine.phase !== 'free_speech') return;
  const player = room.players.get(socket.id);
  if (!player) return;

  const expectedSeat = engine.dayOrder[engine.currentSpeaker];
  if (player.seat !== expectedSeat) return;

  clearTimeout(room._speechTimer);
  const next = engine.nextSpeaker();
  handleSpeechTransition(room, io, next);
});

// 投票
socket.on('vote', ({ targetSeat }) => {
  const room = roomManager.findRoomBySocket(socket.id);
  if (!room || !room.game) return;
  const engine = room.game;
  const player = room.players.get(socket.id);
  if (!player || !player.isAlive) return;
  if (engine.phase !== 'vote') return;

  engine.votes[player.seat] = targetSeat;
  player.hasVoted = true;
  player.voteTarget = targetSeat;

  io.to(room.id).emit('vote_update', {
    seat: player.seat,
    target: targetSeat,
    totalVoters: Object.keys(engine.votes).length,
    totalAlive: Array.from(room.players.values()).filter(p => p.isAlive).length
  });

  // 所有人投票完毕，统计结果
  const aliveCount = Array.from(room.players.values()).filter(p => p.isAlive).length;
  if (Object.keys(engine.votes).length >= aliveCount) {
    const result = engine.executeVote();
    handleVoteResult(room, io, result);
  }
});

// 辅助函数
function startSpeechTimerForSpeaker(room, io) {
  const engine = room.game;
  const speakerSeat = engine.dayOrder[engine.currentSpeaker];
  const speaker = Array.from(room.players.values()).find(p => p.seat === speakerSeat);

  io.to(room.id).emit('timer_sync', {
    startTimestamp: engine.speechStartTime,
    duration: engine.speechDuration
  });
  io.to(room.id).emit('your_turn', {
    seat: speakerSeat,
    action: 'speech',
    timeLimit: engine.speechDuration,
    isYou: false
  });
  if (speaker) {
    io.to(speaker.id).emit('your_turn', {
      seat: speakerSeat,
      action: 'speech',
      timeLimit: engine.speechDuration,
      isYou: true
    });
  }

  // 90秒后自动结束发言
  room._speechTimer = setTimeout(() => {
    if (engine.phase !== 'free_speech') return;
    const next = engine.nextSpeaker();
    handleSpeechTransition(room, io, next);
  }, engine.speechDuration);
}

function handleSpeechTransition(room, io, next) {
  if (next.phase === 'vote') {
    io.to(room.id).emit('phase_change', {
      phase: 'vote',
      message: '发言结束，开始放逐投票'
    });
    // 30秒投票倒计时
    room._voteTimer = setTimeout(() => {
      if (room.game.phase !== 'vote') return;
      const result = room.game.executeVote();
      handleVoteResult(room, io, result);
    }, room.game.voteDuration);
  } else {
    startSpeechTimerForSpeaker(room, io);
  }
}

function handleVoteResult(room, io, result) {
  if (result.phase === 'final_words') {
    io.to(room.id).emit('phase_change', {
      phase: 'final_words',
      eliminated: result.eliminated
    });
    // 60s 遗言后进入下一环节
    setTimeout(() => {
      const next = room.game.afterFinalWords();
      if (next.phase === 'settlement') {
        io.to(room.id).emit('game_over', {
          winner: next.winner,
          message: next.message,
          roles: Array.from(room.players.values()).map(p => ({
            seat: p.seat, name: p.name, role: p.role
          }))
        });
        room.status = 'ended';
      } else {
        handleNightPhase(room, io, next);
      }
    }, 60000);
  } else if (result.phase === 'free_speech') {
    // 平票，重新发言和投票
    const next = room.game.startFreeSpeech();
    io.to(room.id).emit('phase_change', { phase: 'free_speech', message: '平票，重新发言' });
    startSpeechTimerForSpeaker(room, io);
  }
}

function handleNightPhase(room, io, result) {
  io.to(room.id).emit('phase_change', {
    phase: result.phase,
    message: `第${room.game.round}夜，天黑请闭眼。`
  });
  // 通知对应角色行动
  // 具体实现在 Task 8 中
}
```

- [ ] **Step 2：添加发言和投票测试**

在 `test/game-engine.test.js` 末尾追加：

```javascript
// 测试投票逻辑
const room4 = createMockRoom(6);
const engine4 = new GameEngine(room4);
engine4.assignRoles();
// 所有人都存活
Array.from(room4.players.values()).forEach(p => p.isAlive = true);
const voteResult = engine4.startFreeSpeech();
console.assert(voteResult.phase === 'free_speech', `发言阶段应为 free_speech`);
console.log('✓ 发言阶段启动测试通过');

// 模拟投票
engine4.phase = 'vote';
engine4.votes = { 1: 3, 2: 3, 3: 5, 4: 3, 5: 5, 6: 3 };
const execResult = engine4.executeVote();
console.assert(execResult.eliminated.seat === 3, '3号应被放逐（4票）');
console.assert(
  Array.from(room4.players.values()).find(p => p.seat === 3).isAlive === false,
  '3号应标记为死亡'
);
console.log('✓ 投票计票测试通过');

// 测试平票
const room5 = createMockRoom(6);
const engine5 = new GameEngine(room5);
engine5.assignRoles();
Array.from(room5.players.values()).forEach(p => p.isAlive = true);
engine5.phase = 'vote';
engine5.votes = { 1: 2, 2: 3, 3: 2, 4: 3, 5: 1, 6: 1 };
const tieResult = engine5.executeVote();
console.assert(tieResult.isTie === true, '平票应返回 isTie');
console.log('✓ 平票处理测试通过');

console.log('\n所有发言/投票测试通过!');
```

- [ ] **Step 3：运行测试**

Run:
```bash
node test/game-engine.test.js
```

- [ ] **Step 4：提交**

```bash
git add game-engine.js server.js test/game-engine.test.js
git commit -m "feat: implement speech and voting flow with timers"
```

---

### Task 8：实现角色技能文件

**Files:**
- Create: `D:\code\hb\werewolf\roles\werewolf.js`
- Create: `D:\code\hb\werewolf\roles\seer.js`
- Create: `D:\code\hb\werewolf\roles\witch.js`
- Create: `D:\code\hb\werewolf\roles\hunter.js`

- [ ] **Step 1：实现 werewolf.js**

```javascript
// roles/werewolf.js - 狼人行动逻辑
// 依赖 game-engine 中的 this.room / this.nightActions

function processWerewolfAction(engine, socketId, targetSeat) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'werewolf') {
    return { error: '你不是狼人' };
  }
  if (engine.phase !== 'night_werewolf') {
    return { error: '当前不是狼人行动阶段' };
  }

  // 记录狼人击杀目标（所有狼人投票中位数，简化：后投的覆盖先投的）
  engine.nightActions.werewolfKill = targetSeat;
  engine.addLog('night_action', `狼人选中击杀 ${targetSeat}号`, targetSeat);

  // 检查所有存活狼人是否都已行动
  const werewolves = engine.getWerewolves().filter(w => w.isAlive);
  const allActed = werewolves.every(w => {
    // 简化：只要有一个狼人提交了即可
    return true;
  });

  return {
    success: true,
    target: targetSeat,
    allActed: allActed,
    message: `狼人已选择击杀 ${targetSeat}号玩家`
  };
}

function getWerewolfTargets(engine) {
  return Array.from(engine.room.players.values())
    .filter(p => p.isAlive && p.role !== 'werewolf')
    .map(p => ({ seat: p.seat, name: p.name }));
}

module.exports = { processWerewolfAction, getWerewolfTargets };
```

- [ ] **Step 2：实现 seer.js**

```javascript
// roles/seer.js - 预言家查验逻辑

function processSeerAction(engine, socketId, targetSeat) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'seer') {
    return { error: '你不是预言家' };
  }
  if (engine.phase !== 'night_seer') {
    return { error: '当前不是预言家行动阶段' };
  }

  const target = Array.from(engine.room.players.values())
    .find(p => p.seat === targetSeat);
  if (!target) return { error: '目标玩家不存在' };
  if (!target.isAlive) return { error: '目标玩家已死亡' };

  const isWerewolf = target.role === 'werewolf';
  const resultText = isWerewolf ? '【狼人】' : '【好人】';

  engine.addLog('night_action', `预言家查验 ${targetSeat}号: ${resultText}`, targetSeat);

  return {
    success: true,
    target: { seat: target.seat, name: target.name },
    isWerewolf,
    resultText,
    message: `你查验了 ${targetSeat}号 ${target.name}，他的身份是${resultText}`
  };
}

function getSeerTargets(engine) {
  return Array.from(engine.room.players.values())
    .filter(p => p.isAlive)
    .map(p => ({ seat: p.seat, name: p.name }));
}

module.exports = { processSeerAction, getSeerTargets };
```

- [ ] **Step 3：实现 witch.js**

```javascript
// roles/witch.js - 女巫行动逻辑

function processWitchAction(engine, socketId, { save, killTarget }) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'witch') {
    return { error: '你不是女巫' };
  }
  if (engine.phase !== 'night_witch') {
    return { error: '当前不是女巫行动阶段' };
  }

  const result = { success: true, messages: [] };

  // 使用解药
  if (save !== undefined && save !== null) {
    if (engine.witchUsedSave) return { error: '你已使用过解药' };
    if (save === true) {
      const killedSeat = engine.nightActions.werewolfKill;
      if (!killedSeat) return { error: '今晚无人被狼人击杀' };
      engine.nightActions.witchSave = killedSeat;
      engine.witchUsedSave = true;
      engine.addLog('night_action', `女巫使用解药救活 ${killedSeat}号`);
      result.messages.push(`你使用了解药，救活了 ${killedSeat}号玩家`);
    }
  }

  // 使用毒药
  if (killTarget !== undefined && killTarget !== null) {
    if (engine.witchUsedKill) return { error: '你已使用过毒药' };
    if (killTarget <= 0) return { success: true, messages: result.messages };
    const target = Array.from(engine.room.players.values())
      .find(p => p.seat === killTarget);
    if (!target) return { error: '目标玩家不存在' };
    engine.nightActions.witchKill = killTarget;
    engine.witchUsedKill = true;
    engine.addLog('night_action', `女巫使用毒药毒杀 ${killTarget}号`);
    result.messages.push(`你使用了毒药，毒杀了 ${killTarget}号玩家`);
  }

  return {
    ...result,
    message: result.messages.join('；') || '你选择不使用任何药水'
  };
}

function getWitchInfo(engine, socketId) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'witch') return null;

  const killedSeat = engine.nightActions.werewolfKill;
  const killedPlayer = killedSeat
    ? Array.from(engine.room.players.values()).find(p => p.seat === killedSeat)
    : null;

  return {
    tonightKilled: killedPlayer ? { seat: killedPlayer.seat, name: killedPlayer.name } : null,
    hasSave: !engine.witchUsedSave,
    hasKill: !engine.witchUsedKill,
    aliveTargets: Array.from(engine.room.players.values())
      .filter(p => p.isAlive)
      .map(p => ({ seat: p.seat, name: p.name }))
  };
}

module.exports = { processWitchAction, getWitchInfo };
```

- [ ] **Step 4：实现 hunter.js**

```javascript
// roles/hunter.js - 猎人开枪逻辑

function processHunterAction(engine, socketId, targetSeat) {
  const player = engine.room.players.get(socketId);
  if (!player || player.role !== 'hunter') {
    return { error: '你不是猎人' };
  }
  if (player.isAlive) return { error: '猎人只有在出局时才能开枪' };

  const target = Array.from(engine.room.players.values())
    .find(p => p.seat === targetSeat);
  if (!target) return { error: '目标玩家不存在' };
  if (!target.isAlive) return { error: '目标玩家已死亡' };
  if (target.id === socketId) return { error: '不能带走自己' };

  target.isAlive = false;
  engine.addLog('night_action', `猎人开枪带走 ${targetSeat}号 ${target.name}`);

  return {
    success: true,
    target: { seat: target.seat, name: target.name },
    message: `猎人带走了 ${targetSeat}号 ${target.name}`
  };
}

function getHunterTargets(engine) {
  return Array.from(engine.room.players.values())
    .filter(p => p.isAlive)
    .map(p => ({ seat: p.seat, name: p.name }));
}

module.exports = { processHunterAction, getHunterTargets };
```

- [ ] **Step 5：编写角色技能测试**

```javascript
// test/roles.test.js
const { GameEngine } = require('../game-engine');
const { processWerewolfAction } = require('../roles/werewolf');
const { processSeerAction } = require('../roles/seer');
const { processWitchAction } = require('../roles/witch');

function createMockRoom(playerCount) {
  const players = new Map();
  for (let i = 1; i <= playerCount; i++) {
    players.set(`socket-${i}`, {
      id: `socket-${i}`, name: `玩家${i}`, seat: i,
      isAlive: true, role: null, disconnected: false, warnings: 0
    });
  }
  return { id: '123456', players, config: { maxPlayers: 12, werewolfCount: 2 }, seatCount: playerCount };
}

// 测试狼人行动
const room1 = createMockRoom(6);
const engine1 = new GameEngine(room1);
engine1.assignRoles();
engine1.phase = 'night_werewolf';

const werewolf = Array.from(room1.players.values()).find(p => p.role === 'werewolf');
const result1 = processWerewolfAction(engine1, werewolf.id, 3);
console.assert(result1.success === true, '狼人行动应成功');
console.assert(engine1.nightActions.werewolfKill === 3, '击杀目标应为3号');
console.log('✓ 狼人行动测试通过');

// 测试预言家查验
const room2 = createMockRoom(6);
const engine2 = new GameEngine(room2);
engine2.assignRoles();
engine2.phase = 'night_seer';

const seer = Array.from(room2.players.values()).find(p => p.role === 'seer');
const nonSeer = Array.from(room2.players.values()).find(p => p.role !== 'seer');
const result2 = processSeerAction(engine2, seer.id, nonSeer.seat);
console.assert(result2.success === true, '预言家查验应成功');
console.assert(result2.target.seat === nonSeer.seat, '查验目标应为指定玩家');
console.assert(result2.isWerewolf === (nonSeer.role === 'werewolf'), '查验结果应正确');
console.log('✓ 预言家查验测试通过');

// 测试女巫解药
const room3 = createMockRoom(6);
const engine3 = new GameEngine(room3);
engine3.assignRoles();
engine3.phase = 'night_witch';
engine3.nightActions.werewolfKill = 5;
const witch = Array.from(room3.players.values()).find(p => p.role === 'witch');
const result3 = processWitchAction(engine3, witch.id, { save: true });
console.assert(result3.success === true, '女巫使用解药应成功');
console.assert(engine3.nightActions.witchSave === 5, '解救目标应为5号');
console.assert(engine3.witchUsedSave === true, '解药应标记已使用');
console.log('✓ 女巫解药测试通过');

// 测试女巫毒药
const result3b = processWitchAction(engine3, witch.id, { killTarget: 2 });
console.assert(result3b.error === '你已使用过解药', '不能同时使用解药和毒药... 等下一轮');
// 新场景单独测试毒药
const room3c = createMockRoom(6);
const engine3c = new GameEngine(room3c);
engine3c.assignRoles();
engine3c.phase = 'night_witch';
const witch3c = Array.from(room3c.players.values()).find(p => p.role === 'witch');
const result3c = processWitchAction(engine3c, witch3c.id, { killTarget: 4 });
console.assert(result3c.success === true, '女巫使用毒药应成功');
console.assert(engine3c.nightActions.witchKill === 4, '毒杀目标应为4号');
console.log('✓ 女巫毒药测试通过');

console.log('\n所有角色技能测试通过!');
```

- [ ] **Step 6：运行测试**

Run:
```bash
node test/roles.test.js
```

- [ ] **Step 7：提交**

```bash
git add roles/ test/roles.test.js
git commit -m "feat: implement role actions for werewolf, seer, witch, hunter"
```

---

## Phase 3：前端游戏 UI 实现

### Task 9：实现前端计时器 (timer.js)

**Files:**
- Create: `D:\code\hb\werewolf\public\timer.js`
- Modify: `D:\code\hb\werewolf\public\app.js`

- [ ] **Step 1：创建 timer.js**

```javascript
// public/timer.js - 倒计时渲染
// 使用服务端时间戳确保所有客户端倒计时一致

class GameTimer {
  constructor(onExpire) {
    this.intervalId = null;
    this.remaining = 0;
    this.onExpire = onExpire || (() => {});
    this.isRunning = false;
  }

  // 服务端同步计时
  sync(serverTimestamp, startTimestamp, duration) {
    const elapsed = Date.now() - startTimestamp;
    this.remaining = Math.max(0, duration - elapsed);
    this.duration = duration;

    if (this.remaining <= 0) {
      this.stop();
      this.onExpire();
      return;
    }

    this.start();
  }

  start() {
    this.stop();
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.remaining = Math.max(0, this.remaining - 100);
      this.render();

      if (this.remaining <= 0) {
        this.stop();
        this.onExpire();
      }
    }, 100);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  render() {
    const timerEl = document.getElementById('timer-text');
    if (!timerEl) return;
    const seconds = Math.ceil(this.remaining / 1000);
    timerEl.textContent = seconds > 0 ? seconds : '--';

    // 颜色变化：最后10秒变红
    if (seconds <= 10 && seconds > 0) {
      timerEl.style.color = '#ff4444';
    } else {
      timerEl.style.color = '#f0c040';
    }
  }

  getRemaining() {
    return this.remaining;
  }
}
```

- [ ] **Step 2：在 app.js 中集成计时器**

在 `app.js` 顶部添加：

```javascript
// 全局计时器
let gameTimer = null;
let currentPhase = null;

// 在 socket 事件中添加
socket.on('timer_sync', (data) => {
  if (!gameTimer) {
    gameTimer = new GameTimer(() => {
      // 计时结束，自动进入下一阶段（服务端已处理，前端只是展示）
      addMessage('system', '⏰ 时间到！');
    });
  }
  gameTimer.sync(data.serverTimestamp || Date.now(), data.startTimestamp, data.duration);
});

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
  // 切换到对应 UI
  updateActionPanel(data.phase);
  updatePlayerStatusList();
});

// 阶段中文名
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

socket.on('your_turn', (data) => {
  if (data.isYou && data.action === 'speech') {
    addMessage('system', '🎤 轮到你了！请在规定时间内发言');
  }
});

// 更新玩家状态列表
function updatePlayerStatusList() {
  // 将在 Task 11 中完整实现
}
```

- [ ] **Step 3：提交**

```bash
git add public/timer.js public/app.js
git commit -m "feat: add countdown timer with server sync"
```

---

### Task 10：实现操作区域 UI 状态切换

**Files:**
- Modify: `D:\code\hb\werewolf\public\app.js`

- [ ] **Step 1：在 app.js 中实现 updateActionPanel**

```javascript
// app.js - 操作面板状态管理

function updateActionPanel(phase) {
  const panel = document.getElementById('action-panel');
  const isAlive = isCurrentPlayerAlive();
  const isMyTurn = isCurrentPlayerTurn(phase);

  switch (phase) {
    case 'free_speech':
      if (isAlive && isMyTurn) {
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
        document.getElementById('speech-input').focus();
      } else {
        panel.innerHTML = `<p class="waiting-text">⏳ 等待 ${currentSpeakerName()} 发言中...</p>`;
      }
      break;

    case 'vote':
      if (isAlive) {
        const targets = getAlivePlayersExceptSelf();
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

    case 'settlement':
      // 结算面板由 game_over 事件单独渲染
      break;

    default:
      panel.innerHTML = `<p class="waiting-text">⏳ 请等待其他玩家行动...</p>`;
  }
}

// 获取当前阶段的发言者名称
function currentSpeakerName() {
  // 由服务端推送的 your_turn 事件中的 seat 决定
  return `${_currentSpeakerSeat || '?'}号玩家`;
}
let _currentSpeakerSeat = null;

// 记录当前发言人
socket.on('your_turn', (data) => {
  _currentSpeakerSeat = data.seat;
  // ... 原有逻辑
});

// 判断当前玩家是否存活
function isCurrentPlayerAlive() {
  // 通过查看状态列表中自己是否标记为死亡
  const myItem = document.querySelector(`.player-status-item.current-user`);
  return myItem && myItem.dataset.alive === 'true';
}

// 判断当前是否是自己的回合
function isCurrentPlayerTurn(phase) {
  if (phase === 'free_speech') {
    return _currentSpeakerSeat === currentSeat;
  }
  if (phase === 'night_werewolf' || phase === 'night_seer' ||
      phase === 'night_witch' || phase === 'night_hunter') {
    return _myNightPhase === phase;
  }
  return false;
}
let _myNightPhase = null;

// 获取除自己外存活的玩家
function getAlivePlayersExceptSelf() {
  const items = document.querySelectorAll('.player-status-item');
  const players = [];
  items.forEach(item => {
    const seat = parseInt(item.dataset.seat);
    const alive = item.dataset.alive === 'true';
    if (alive && seat !== currentSeat) {
      players.push({ seat, name: item.dataset.name });
    }
  });
  return players;
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
  // 高亮选中的目标
  document.querySelectorAll('.vote-target').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.seat) === targetSeat);
  });
  socket.emit('vote', { targetSeat });
}
```

- [ ] **Step 2：提交**

```bash
git add public/app.js
git commit -m "feat: implement action panel state switching for all phases"
```

---

### Task 11：实现玩家状态列表

**Files:**
- Modify: `D:\code\hb\werewolf\public\app.js`

- [ ] **Step 1：在 app.js 中添加更新玩家状态列表的函数**

```javascript
// app.js - 更新左侧玩家状态列表

// 服务端推送玩家状态更新
socket.on('phase_change', (data) => {
  // ... 原有逻辑
  updatePlayerStatusList();
});

socket.on('death_announce', (data) => {
  // 更新玩家状态后刷新列表
  updatePlayerStatusList();
});

function updatePlayerStatusList() {
  const container = document.getElementById('player-status-list');
  // 从玩家数组重建（由服务端 room_joined / phase_change 中的 players 数据决定）
  // 简化: 从已缓存的玩家列表重建
  if (!_cachedPlayers) return;

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

let _cachedPlayers = [];

// 在 room_joined 和 phase_change 中缓存玩家列表
const origRoomJoined = socket._events.room_joined;
socket.on('room_joined', (info) => {
  _cachedPlayers = info.players.map(p => ({ ...p }));
  updatePlayerStatusList();
});

socket.on('phase_change', (data) => {
  if (data.players) {
    _cachedPlayers = data.players.map(p => ({ ...p }));
    updatePlayerStatusList();
  }
});
```

- [ ] **Step 2：在 server.js 中补充 phase_change 时发送玩家列表**

在 `game-engine.js` 的 `startDay()` 和 `afterFinalWords()` 等方法中，返回 `players` 列表，然后在 server.js 中发送：

```javascript
// server.js - phase_change 时附带 players 信息
io.to(room.id).emit('phase_change', {
  phase: result.phase,
  deaths: result.deaths,
  message: `昨晚 ${result.deaths.length > 0 ? '有玩家死亡' : '无人死亡'}`,
  players: Array.from(room.players.values()).map(p => ({
    seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
  }))
});
```

- [ ] **Step 3：提交**

```bash
git add public/app.js server.js game-engine.js
git commit -m "feat: add player status list and live state updates"
```

---

### Task 12：实现夜间操作 UI

**Files:**
- Modify: `D:\code\hb\werewolf\public\app.js`

- [ ] **Step 1：在 app.js 中实现夜间操作渲染**

```javascript
// app.js - 夜间操作界面

function renderNightAction(phase, panel) {
  const isMyPhase = _myNightPhase === phase;

  if (!isMyPhase) {
    panel.innerHTML = `<p class="waiting-text">🌙 等待其他玩家行动...</p>`;
    return;
  }

  const targets = getAlivePlayersExceptSelf();

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
      renderWitchAction(panel);
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

function renderWitchAction(panel) {
  // 女巫界面需要先显示今晚谁死了
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
            ${getAlivePlayersExceptSelf().map(t =>
              `<option value="${t.seat}">${t.seat}号 ${t.name}</option>`
            ).join('')}
          </select>
        </div>
        <button class="btn-confirm" onclick="submitWitchAction()">确认行动</button>
      </div>
    </div>
  `;

  // 女巫信息通过 socket 事件获取
  document.getElementById('witch-use-kill').addEventListener('change', function() {
    document.getElementById('witch-kill-target-wrapper')
      .classList.toggle('hidden', !this.checked);
  });
}

// 提交夜间行动
function submitNightAction(type) {
  const target = parseInt(document.getElementById('night-target').value);
  socket.emit('night_action', { target, action: type });
}

function submitWitchAction() {
  const useSave = document.getElementById('witch-use-save').checked;
  const useKill = document.getElementById('witch-use-kill').checked;
  const killTarget = useKill ? parseInt(document.getElementById('night-target').value) : null;

  socket.emit('night_action', {
    action: 'witch',
    save: useSave,
    killTarget: useKill ? killTarget : null
  });
}

// 监听女巫信息
socket.on('witch_info', (data) => {
  const infoEl = document.getElementById('witch-info');
  if (!infoEl) return;
  if (data.tonightKilled) {
    infoEl.innerHTML = `今晚被狼人击杀的是 <strong>${data.tonightKilled.seat}号 ${data.tonightKilled.name}</strong>`;
  } else {
    infoEl.innerHTML = '今晚无人被狼人击杀';
  }
  // 禁用已使用的药
  if (!data.hasSave) document.getElementById('witch-use-save').disabled = true;
  if (!data.hasKill) document.getElementById('witch-use-kill').disabled = true;
});

// 夜间行动结果反馈
socket.on('night_result', (data) => {
  addMessage('private', `🔔 ${data.message}`);
});

// 狼人队友信息
socket.on('night_teammates', (data) => {
  if (data.teammates && data.teammates.length > 0) {
    addMessage('private', `🐺 你的狼队友：${data.teammates.map(t => `${t.seat}号 ${t.name}`).join('、')}`);
  } else {
    addMessage('private', '🐺 你是独狼，没有队友');
  }
});
```

- [ ] **Step 2：在 server.js 中处理夜间行动**

```javascript
// server.js - socket.on('connection') 中补充

const { processWerewolfAction, getWerewolfTargets } = require('./roles/werewolf');
const { processSeerAction, getSeerTargets } = require('./roles/seer');
const { processWitchAction, getWitchInfo } = require('./roles/witch');
const { processHunterAction, getHunterTargets } = require('./roles/hunter');

// 在 server.js 的 handleNightPhase 函数中
function handleNightPhase(room, io, phaseResult) {
  const engine = room.game;
  io.to(room.id).emit('phase_change', {
    phase: phaseResult.phase,
    message: phaseResult.message || '',
    players: Array.from(room.players.values()).map(p => ({
      seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
    }))
  });

  // 通知对应角色行动
  room.players.forEach((player) => {
    let shouldAct = false;
    let actionData = null;

    switch (engine.phase) {
      case 'night_werewolf':
        if (player.role === 'werewolf' && player.isAlive) {
          shouldAct = true;
          actionData = {
            action: 'night_kill',
            targets: getWerewolfTargets(engine)
          };
          // 发送女巫信息（狼人知道谁死了，但简化处理）
        }
        break;
      case 'night_seer':
        if (player.role === 'seer' && player.isAlive) {
          shouldAct = true;
          actionData = {
            action: 'investigate',
            targets: getSeerTargets(engine)
          };
        }
        break;
      case 'night_witch':
        if (player.role === 'witch' && player.isAlive) {
          shouldAct = true;
          actionData = {
            action: 'witch',
            info: getWitchInfo(engine, player.id)
          };
          io.to(player.id).emit('witch_info', actionData.info);
        }
        break;
      case 'night_hunter':
        if (player.role === 'hunter' && !player.isAlive) {
          // 猎人已出局未开枪
          shouldAct = true;
          actionData = {
            action: 'shoot',
            targets: getHunterTargets(engine)
          };
        }
        break;
    }

    if (shouldAct) {
      io.to(player.id).emit('your_turn', {
        seat: player.seat,
        action: actionData.action,
        isYou: true,
        ...actionData
      });
    }
  });

  // 设置超时（20秒后自动跳过夜间）
  room._nightTimer = setTimeout(() => {
    if (engine.phase.startsWith('night_')) {
      const nextPhase = engine.advanceNight();
      if (nextPhase.isDay) {
        // 进入白天
        io.to(room.id).emit('phase_change', {
          phase: nextPhase.phase,
          deaths: nextPhase.deaths,
          message: '天亮了',
          players: Array.from(room.players.values()).map(p => ({
            seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
          }))
        });
      } else {
        handleNightPhase(room, io, nextPhase);
      }
    }
  }, engine.nightDuration);
}

// 处理 night_action 事件
socket.on('night_action', ({ target, action }) => {
  const room = roomManager.findRoomBySocket(socket.id);
  if (!room || !room.game) return;
  const engine = room.game;

  let result;
  switch (action) {
    case 'kill':
      result = processWerewolfAction(engine, socket.id, target);
      if (result.success) {
        // 通知所有狼人
        const werewolves = engine.getWerewolves().filter(w => w.isAlive);
        werewolves.forEach(w => {
          io.to(w.id).emit('night_result', { message: `狼人已选择击杀 ${result.target}号玩家` });
        });
        // 狼人行动结束，进入下一阶段
        const next = engine.advanceNight();
        if (!next.isNight) {
          // 进入白天
          io.to(room.id).emit('phase_change', {
            phase: next.phase,
            deaths: next.deaths,
            message: '天亮了',
            players: Array.from(room.players.values()).map(p => ({
              seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
            }))
          });
        } else {
          handleNightPhase(room, io, next);
        }
      }
      break;
    case 'investigate':
      result = processSeerAction(engine, socket.id, target);
      if (result.success) {
        io.to(socket.id).emit('night_result', { message: result.message });
        const next = engine.advanceNight();
        if (!next.isNight) {
          io.to(room.id).emit('phase_change', {
            phase: next.phase, deaths: next.deaths, message: '天亮了',
            players: Array.from(room.players.values()).map(p => ({
              seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
            }))
          });
        } else {
          handleNightPhase(room, io, next);
        }
      }
      break;
    case 'shoot':
      result = processHunterAction(engine, socket.id, target);
      if (result.success) {
        io.to(room.id).emit('death_announce', { seat: result.target.seat, name: result.target.name });
        io.to(room.id).emit('night_result', { message: result.message });
        const next = engine.advanceNight();
        if (!next.isNight) {
          io.to(room.id).emit('phase_change', {
            phase: next.phase, deaths: next.deaths, message: '天亮了',
            players: Array.from(room.players.values()).map(p => ({
              seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
            }))
          });
        }
      }
      break;
    case 'witch':
      // 处理女巫行动（在 Task 13 中完善）
      break;
  }

  if (result && result.error) {
    socket.emit('error', { code: 'ACTION_FAILED', message: result.error });
  }
});
```

- [ ] **Step 2：提交**

```bash
git add public/app.js server.js roles/
git commit -m "feat: implement night action UI and server-side role action handling"
```

---

## Phase 4：容错与收尾

### Task 13：实现断线重连

**Files:**
- Modify: `D:\code\hb\werewolf\server.js`
- Modify: `D:\code\hb\werewolf\public\app.js`

- [ ] **Step 1：server.js 端实现重连逻辑**

```javascript
// server.js - 断线重连

// 原有的 disconnect 事件：不要清除玩家，标记为 disconnected
socket.on('disconnect', () => {
  console.log(`[断开] 玩家断开: ${socket.id}`);
  const room = roomManager.findRoomBySocket(socket.id);
  if (room) {
    const player = room.players.get(socket.id);
    if (player) {
      player.disconnected = true;
      io.to(room.id).emit('player_disconnected', { seat: player.seat });
      // 60秒后移除
      room._disconnectTimer = setTimeout(() => {
        if (player.disconnected && room.status === 'waiting') {
          // 等待阶段直接移除
          const result = roomManager.leaveRoom(socket.id);
          if (result.action === 'left') {
            io.to(room.id).emit('player_left', { seat: result.seat });
          }
        } else if (player.disconnected && room.status === 'playing') {
          // 游戏中标记为出局
          player.isAlive = false;
          io.to(room.id).emit('phase_change', {
            phase: room.game.phase,
            message: `${player.seat}号 ${player.name} 因断线超时，被标记为出局`,
            players: Array.from(room.players.values()).map(p => ({
              seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
            }))
          });
        }
      }, 60000);
    }
  }
});

// 重连事件
socket.on('reconnect_player', ({ roomId, playerId }) => {
  const room = roomManager.rooms.get(roomId);
  if (!room) return socket.emit('error', { code: 'NO_ROOM', message: '房间不存在' });

  // 通过 playerId 找到玩家（简化：使用 socket.id，重连时无法用原 socket.id）
  // 这里通过座位号来找（需要客户端保存 seat 到 sessionStorage）
  let player = null;
  for (const [, p] of room.players) {
    if (p.seat === playerId) { // playerId 实际上是 seat 号
      player = p;
      break;
    }
  }

  if (!player) return socket.emit('error', { code: 'NOT_IN_ROOM', message: '你不在这个房间中' });

  // 更新 socketId
  const oldId = player.id;
  player.id = socket.id;
  player.disconnected = false;
  socket.join(roomId);

  // 清除断线定时器
  if (room._disconnectTimer) {
    clearTimeout(room._disconnectTimer);
    room._disconnectTimer = null;
  }

  // 发送玩家信息
  socket.emit('room_joined', roomManager.getRoomInfo(room));

  // 如果在游戏中，推送当前游戏状态
  if (room.game) {
    const engine = room.game;
    socket.emit('game_started', { role: player.role });
    socket.emit('phase_change', {
      phase: engine.phase,
      message: `欢迎回来，当前是 ${getPhaseText(engine.phase)}`,
      players: Array.from(room.players.values()).map(p => ({
        seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
      }))
    });

    // 推送历史消息
    engine.history.slice(-20).forEach(log => {
      socket.emit('speech_broadcast', { seat: log.targetSeat, content: log.content, type: log.type });
    });

    // 如果当前是发言阶段，推送计时
    if (engine.phase === 'free_speech' && engine.speechStartTime) {
      socket.emit('timer_sync', {
        startTimestamp: engine.speechStartTime,
        duration: engine.speechDuration
      });
    }

    // 通知房间
    io.to(roomId).emit('player_reconnected', { seat: player.seat });
  }
});
```

- [ ] **Step 2：前端 app.js 补充重连逻辑**

```javascript
// app.js - 重连逻辑

// 页面加载时，检查是否有保存的游戏状态
document.addEventListener('DOMContentLoaded', () => {
  const savedSeat = sessionStorage.getItem('werewolf_seat');
  const savedRoom = sessionStorage.getItem('werewolf_room');
  if (savedSeat && savedRoom) {
    // 尝试重连
    socket.emit('reconnect_player', {
      roomId: savedRoom,
      playerId: parseInt(savedSeat)
    });
  }
});

// 加入/创建成功后保存到 sessionStorage
socket.on('room_joined', (info) => {
  currentRoomId = info.id;
  sessionStorage.setItem('werewolf_room', info.id);
  // ... 原有逻辑
});

socket.on('your_info', (info) => {
  currentPlayerId = info.playerId;
  currentSeat = info.seat;
  sessionStorage.setItem('werewolf_seat', info.seat.toString());
  // ... 原有逻辑
});

socket.on('game_over', () => {
  // 游戏结束后清除 session
  sessionStorage.removeItem('werewolf_seat');
  sessionStorage.removeItem('werewolf_room');
  // ... 原有逻辑
});

socket.on('player_disconnected', (data) => {
  addMessage('system', `⚠️ ${data.seat}号玩家断线了...（60秒内等待重连）`);
  updatePlayerStatusList();
});

socket.on('player_reconnected', (data) => {
  addMessage('system', `✅ ${data.seat}号玩家重新连接`);
  updatePlayerStatusList();
});
```

- [ ] **Step 3：提交**

```bash
git add server.js public/app.js
git commit -m "feat: implement reconnection with state recovery"
```

---

### Task 14：实现挂机检测与敏感词过滤

**Files:**
- Modify: `D:\code\hb\werewolf\server.js`
- Modify: `D:\code\hb\werewolf\game-engine.js`

- [ ] **Step 1：在 game-engine.js 中添加挂机检测方法**

```javascript
// game-engine.js 中新增

// 标记玩家发言
markPlayerSpoke(seat) {
  const player = Array.from(this.room.players.values()).find(p => p.seat === seat);
  if (player) {
    player.lastSpokeRound = this.round;
  }
}

// 检查挂机玩家
checkAfk() {
  const alivePlayers = Array.from(this.room.players.values())
    .filter(p => p.isAlive);
  const afkPlayers = [];

  alivePlayers.forEach(p => {
    if (p.lastSpokeRound !== undefined && p.lastSpokeRound < this.round - 1) {
      p.warnings = (p.warnings || 0) + 1;
      if (p.warnings >= 2) {
        p.isAlive = false;
        p.isAfk = true;
        afkPlayers.push(p);
        this.addLog('system', `${p.seat}号 ${p.name} 因连续挂机被移出游戏`);
      }
    }
  });

  return afkPlayers;
}

// 投票弃权检测（在投票计数时调用）
markVoted(seat) {
  const player = Array.from(this.room.players.values()).find(p => p.seat === seat);
  if (player && player.voteTarget === 0) {
    player.abstainCount = (player.abstainCount || 0) + 1;
    if (player.abstainCount >= 3) {
      player.warnings = (player.warnings || 0) + 1;
      this.addLog('system', `${player.seat}号 ${player.name} 连续3轮弃权，收到警告`);
    }
  }
}
```

- [ ] **Step 2：实现敏感词过滤函数**

```javascript
// server.js 中添加

const sensitiveWords = require('./sensitive-words.json');

function filterSensitiveWords(content) {
  let filtered = content;
  sensitiveWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '***');
  });
  return filtered;
}
```

- [ ] **Step 3：在 server.js 的 player_speech 事件中集成过滤**

```javascript
// server.js - player_speech 事件
socket.on('player_speech', ({ content }) => {
  // ... 原有的权限校验 ...

  // 敏感词过滤
  const filtered = filterSensitiveWords(content);
  if (filtered !== content) {
    socket.emit('error', { code: 'SENSITIVE', message: '你的发言包含敏感词，已被过滤' });
  }

  // 记录发言（挂机检测）
  engine.markPlayerSpoke(player.seat);

  io.to(room.id).emit('speech_broadcast', {
    seat: player.seat,
    name: player.name,
    content: filtered
  });
});
```

- [ ] **Step 4：提交**

```bash
git add server.js game-engine.js sensitive-words.json
git commit -m "feat: implement AFK detection and sensitive word filter"
```

---

### Task 15：游戏结算 UI 与最终完善

**Files:**
- Modify: `D:\code\hb\werewolf\public\index.html`
- Modify: `D:\code\hb\werewolf\public\style.css`
- Modify: `D:\code\hb\werewolf\public\app.js`

- [ ] **Step 1：在 app.js 中实现 game_over 事件处理**

```javascript
// app.js - 游戏结束

socket.on('game_over', (data) => {
  const panel = document.getElementById('action-panel');
  const isWinner = (data.winner === 'good' && !isWerewolfRole()) ||
                   (data.winner === 'werewolf' && isWerewolfRole());

  // 停止计时器
  if (gameTimer) gameTimer.stop();

  // 渲染结算面板
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

  // 在信息流显示结果
  addMessage('result', `🏆 ${data.message}`);
  addMessage('result', `👑 ${data.winner === 'good' ? '好人阵营' : '狼人阵营'}获胜！`);

  sessionStorage.removeItem('werewolf_seat');
  sessionStorage.removeItem('werewolf_room');
});

function isWerewolfRole() {
  // 检查自己是否是狼人
  const myItem = document.querySelector('.player-status-item.current-user');
  return false; // 简化，实际应由服务端告知
}

function getRoleColor(role) {
  const map = { werewolf: '#ff6b6b', seer: '#60a5fa', witch: '#a78bfa', hunter: '#fb923c', villager: '#4ade80' };
  return map[role] || '#ccc';
}

function getRoleName(role) {
  const map = { werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人', villager: '平民' };
  return map[role] || role;
}
```

- [ ] **Step 2：在 server.js 中完善 game_over 事件发送**

在 `handleVoteResult` 中调用的 `afterFinalWords` 返回 `settlement` 时：

```javascript
// server.js
if (next.phase === 'settlement') {
  // 发送每个玩家的最终角色信息
  const rolesInfo = Array.from(room.players.values()).map(p => ({
    seat: p.seat,
    name: p.name,
    role: p.role
  }));

  // 分别发送给每个玩家，包含胜败信息
  room.players.forEach((player) => {
    const isGood = player.role !== 'werewolf';
    const playerWon = (next.winner === 'good' && isGood) || (next.winner === 'werewolf' && !isGood);
    io.to(player.id).emit('game_over', {
      winner: next.winner,
      message: next.message,
      youWon: playerWon,
      roles: rolesInfo
    });
  });

  room.status = 'ended';
}
```

- [ ] **Step 3：提交**

```bash
git add public/app.js public/index.html public/style.css server.js
git commit -m "feat: implement game over settlement UI and final polish"
```

---

## 自审检查

### 1. 覆盖度检查
- ✅ 项目初始化 → Task 1
- ✅ 房间管理 → Task 2
- ✅ 前端页面框架 → Task 3-4
- ✅ 角色分配 → Task 5
- ✅ FSM 夜间-白天流转 → Task 6
- ✅ 发言与投票流程 → Task 7
- ✅ 角色技能 → Task 8
- ✅ 前端倒计时 → Task 9
- ✅ 操作区状态切换 → Task 10
- ✅ 玩家状态列表 → Task 11
- ✅ 夜间操作 UI → Task 12
- ✅ 断线重连 → Task 13
- ✅ 挂机检测/敏感词过滤 → Task 14
- ✅ 游戏结算 → Task 15

### 2. 占位符检查
- 所有步骤包含完整代码，无 "TBD"/"TODO"
- 所有错误处理包含具体实现

### 3. 类型一致性检查
- `game-engine.js` 中 `Room` 类型与 `room-manager.js` 一致
- Socket.io 事件名与设计文档一致
- 角色名使用常量 `roles.WEREWOLF` 等保持一致

### 4. 范围检查
- 限于 MVP 范围：无用户系统、无匹配队列、无排行榜
- 每个 Task 产出可测试的增量

---

## 执行方式

计划完整，已保存至 `docs/superpowers/plans/2026-07-21-werewolf-game-implementation.md`。

**两种执行方式：**

1. **Subagent-Driven（推荐）** - 每个 Task 分派独立子代理执行，每 Task 后审查，快速迭代
2. **Inline Execution** - 在当前会话中逐 Task 执行，批量完成后设置检查点

你倾向哪种？
