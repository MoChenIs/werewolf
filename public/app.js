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
const testModeBtn = document.getElementById('test-mode-btn');
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
let _selectedWolfTarget = null;
let _witchSelected = null;
let _witchTarget = null;
let _witchInfo = null;
let _roleTeammates = [];
let _investigatedList = [];
let _currentRound = 0;

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

testModeBtn.addEventListener('click', () => {
 socket.emit('toggle_test_mode');
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
 testModeBtn.classList.toggle('hidden', !isHost);
});

socket.on('your_info', (info) => {
 currentPlayerId = info.playerId;
 currentSeat = info.seat;
 sessionStorage.setItem('werewolf_seat', info.seat.toString());
 sessionStorage.setItem('werewolf_playerId', info.playerId);
});

socket.on('player_joined', (data) => {
 addMessage('system', `用户${data.name}已加入房间`);
});

socket.on('player_left', (data) => {
 addMessage('system', `用户${data.name}退出了房间`);
});

// 角色选择（测试模式）
socket.on('role_selection', (data) => {
 const roles = { werewolf:'狼人', seer:'预言家', witch:'女巫', hunter:'猎人', villager:'平民' };
 showPage('game-page');
 const panel = document.getElementById('action-panel');
 document.getElementById('phase-text').textContent = '选择角色';
 panel.innerHTML = `
 <div class="night-area" style="text-align:center;">
 <div class="night-title">请选择你的角色</div>
 <div class="vote-targets" style="margin-top:12px;">
 ${data.pool.map(r => `
 <button class="vote-target" onclick="pickRole('${r}')" id="role-${r}">
 ${roles[r] || r}
 </button>
 `).join('')}
 </div>
 <div id="role-pick-status" style="margin-top:8px;font-size:12px;color:var(--text-secondary);"></div>
 </div>
 `;
 document.getElementById('feed-messages').innerHTML = '';
});
socket.on('role_selected', (data) => {
 const roles = { werewolf:'狼人', seer:'预言家', witch:'女巫', hunter:'猎人', villager:'平民' };
 const btn = document.getElementById('role-' + data.role);
 if (btn) { btn.classList.add('selected'); btn.disabled = true; }
 const el = document.getElementById('role-pick-status');
 if (el) el.textContent = `${data.seat}号选择了${roles[data.role] || data.role}`;
});
function pickRole(role) {
 socket.emit('select_role', { role });
 const btn = document.getElementById('role-' + role);
 if (btn) { btn.classList.add('selected'); btn.disabled = true; }
 document.getElementById('role-pick-status').textContent = '已选择，等待其他成员...';
}

socket.on('test_mode_changed', (data) => {
 testModeBtn.textContent = data.enabled ? '正常模式' : '测试模式';
 testModeBtn.style.borderColor = data.enabled ? 'var(--primary)' : 'var(--border)';
 testModeBtn.style.color = data.enabled ? 'var(--primary)' : 'var(--text-secondary)';
});

socket.on('host_changed', (data) => {
 currentHostId = data.newHost;
 const isHost = socket.id === data.newHost;
 startGameBtn.classList.toggle('hidden', !isHost);
 addAiBtn.classList.toggle('hidden', !isHost);
 testModeBtn.classList.toggle('hidden', !isHost);
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
 addMessage('system', `会议开始！你的身份：${getRoleName(role)}`);
 // 缓存自己的角色到 sessionStorage
 sessionStorage.setItem('werewolf_role', role);
 // 重置角色追踪数据
 _roleTeammates = [];
 _investigatedList = [];
 updateRoleStatusBar();
});

// 阶段切换
socket.on('phase_change', (data) => {
 currentPhase = data.phase;
 document.getElementById('phase-text').textContent = getPhaseText(data.phase);
 // 轮数更新
 if (data.round || data.phase === 'night_werewolf') {
 if (data.round) _currentRound = data.round;
 const rEl = document.getElementById('round-text');
 if (rEl) {
 if (_currentRound > 0) {
 rEl.textContent = '当前游戏轮数：第' + _currentRound + '轮';
 rEl.classList.remove('hidden');
 } else {
 rEl.classList.add('hidden');
 }
 }
 }
 if (data.deaths) {
 // 死亡信息统一由 data.message 展示
 }
 if (data.message) {
 addMessage('system', data.message);
 }
 if (data.players) {
 _cachedPlayers = data.players.map(p => ({ ...p }));
 updateRoleStatusBar();
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
 addMessage('system', ' 时间到！');
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
 addMessage('system', '轮到你了，请发言');
 } else if (data.action === 'night_kill' || data.action === 'investigate' || data.action === 'shoot' || data.action === 'witch') {
 _myNightPhase = currentPhase;
 addMessage('system', '请行动');
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

// 表决结果（含详细投票记录）
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
 const votersStr = voters.map(s => `${s}号`).join(' ');
 if (target === '弃权') return `弃权：${voters.length} 票（${votersStr}）`;
 const name = nameMap[target] || '';
 return `${target}号：${voters.length} 票（${votersStr}）`;
 });
 addMessage('system', `表决结果：\n${lines.join('\n')}`);
 if (data.isTie && data.tiedSeats.length) {
 addMessage('system', `平票：${data.tiedSeats.map(s => s + '号 ' + (nameMap[s] || '')).join(' ')}`);
 }
});

// 游戏结束
socket.on('game_over', (data) => {
 if (gameTimer) gameTimer.stop();

 const panel = document.getElementById('action-panel');
 panel.innerHTML = `
 <div class="game-over-panel">
 <div class="role-tags">
 ${data.roles.sort((a,b) => a.seat - b.seat).map(r => `
 <span class="role-tag" style="${r.seat === currentSeat ? 'border-color:var(--primary);background:var(--primary-light);' : ''}">
 ${r.seat}号 ${r.name}
 <span style="color:${getRoleColor(r.role)}">${getRoleName(r.role)}</span>
 </span>
 `).join('')}
 </div>
 <div style="display:flex;gap:8px;margin-top:14px;">
 <button class="btn btn-primary" style="flex:1;" onclick="playAgain()">重新开始</button>
 <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="location.reload()">返回工作台</button>
 </div>
 <div id="play-again-status" style="margin-top:8px;font-size:12px;color:#999;"></div>
 </div>
 `;

 addMessage('result', `${data.message}`);

 sessionStorage.removeItem('werewolf_seat');
 sessionStorage.removeItem('werewolf_room');
 sessionStorage.removeItem('werewolf_role');
});

// 重新开始计数
socket.on('play_again_count', (data) => {
 const el = document.getElementById('play-again-status');
 if (!el) return;
 const voters = data.voters || [];
 const names = voters.length ? `用户${voters.join('、')}已确认（${data.count}/${data.total}）` : `等待其他成员确认 (${data.count}/${data.total})`;
 el.textContent = names;
});

function playAgain() {
 socket.emit('play_again');
 const el = document.getElementById('play-again-status');
 if (el) el.textContent = '已确认，等待其他成员...';
}

// 夜间队友信息
socket.on('night_teammates', (data) => {
 _roleTeammates = data.teammates || [];
 updateRoleStatusBar();
 if (data.teammates && data.teammates.length > 0) {
 addMessage('private', ` 狼队友：${data.teammates.map(t => `${t.seat}号 ${t.name}`).join(' ')}`);
 } else {
 addMessage('private', ' 无同组人员');
 }
});

// 小组投票实时更新
socket.on('werewolf_vote', (data) => {
 // 更新投票展示区
 const voteList = document.getElementById('werewolf-votes');
 if (!voteList) return;
 const nameMap = {};
 _cachedPlayers.forEach(p => { nameMap[p.seat] = p.name; });
 const lines = Object.entries(data.votes).map(([voter, target]) => {
 if (target === undefined) return null;
 return `${voter}号 → ${target}号 ${nameMap[target] || ''}`;
 }).filter(Boolean);
 voteList.innerHTML = lines.join('<br>');
});

// 狼人意见不统一，重新投票
socket.on('werewolf_disagree', () => {
 addMessage('system', ' 意见不统一，请重新选择');
 document.getElementById('werewolf-votes').innerHTML = '';
});

// 夜间行动结果
socket.on('night_result', (data) => {
 addMessage('private', ` ${data.message}`);
});

// 预言家查验结果（专用事件）
socket.on('seer_result', (data) => {
 if (data.target && !_investigatedList.some(i => i.seat === data.target.seat)) {
 _investigatedList.push({ seat: data.target.seat, name: data.target.name, isWolf: data.isWerewolf });
 }
 updateRoleStatusBar();
});

// 女巫信息
socket.on('witch_info', (data) => {
 _witchInfo = data;
 updateRoleStatusBar();
 const infoEl = document.getElementById('witch-info');
 if (!infoEl) return;
 if (data.tonightKilled) {
 infoEl.innerHTML = `今晚被杀的是 <strong>${data.tonightKilled.seat}号 ${data.tonightKilled.name}</strong>`;
 } else {
 infoEl.innerHTML = '今晚无人被杀';
 }
 // 根据使用记录禁用按钮
 const saveBtn = document.getElementById('witch-btn-save');
 const killBtn = document.getElementById('witch-btn-kill');
 if (saveBtn) saveBtn.disabled = !data.hasSave;
 if (killBtn) killBtn.disabled = !data.hasKill;
});

// 安全组被动：死亡后选择带走目标
socket.on('hunter_activate', (data) => {
 if (data.expired) {
 addMessage('system', ' 技能超时');
 return;
 }
 const panel = document.getElementById('action-panel');
 const targets = data.targets || [];
 if (!targets.length) {
 addMessage('system', ' 无候选目标');
 return;
 }
 panel.innerHTML = `
 <div class="night-area">
 <div class="night-title"> 选择交接成员</div>
 <p class="skill-name">已离线，可指定一名交接成员</p>
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
 addMessage('system', targetSeat > 0 ? ` 已指定 ${targetSeat}号` : ' 放弃');
 document.getElementById('action-panel').innerHTML = '<p class="waiting-text"> 等待继续...</p>';
}

// 断线/重连事件
socket.on('player_disconnected', (data) => {
 addMessage('system', ` ${data.seat}号玩家断线了...（60秒内等待重连）`);
 if (data.players) {
 _cachedPlayers = data.players.map(p => ({ ...p }));
 }
 updatePlayerStatusList();
});

socket.on('player_reconnected', (data) => {
 addMessage('system', ` ${data.seat}号成员重新连接`);
 updatePlayerStatusList();
});

// 更新玩家列表
function updatePlayerList(players) {
 playerListEl.innerHTML = players.map(p => `
 <div class="player-card">
 <span class="seat">#${p.seat}</span>
 <span>${p.name}</span>
 ${p.isHost ? '<span class="host-badge">管理员</span>' : ''}
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
 // system/private/result 允许 HTML（如 <strong>）
 div.innerHTML = content;
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
 ${p.bossMode ? '<span style="color:#92400e;font-size:11px;">[跑路]</span>' : ''}
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
 <div class="speech-label"> 发表意见</div>
 <div class="speech-row">
 <textarea id="speech-input" placeholder="输入意见内容..." maxlength="200"></textarea>
 <div class="speech-side">
 <button class="btn btn-send" onclick="sendSpeech()">发送</button>
 <button class="btn btn-end" onclick="exitGame()">退出房间</button>
 </div>
 </div>
 </div>
 `;
 setTimeout(() => {
 const el = document.getElementById('speech-input');
 if (el) { el.focus();
 el.addEventListener('keydown', function(e) {
 if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSpeech(); }
 }); }
 }, 100);
 } else {
 panel.innerHTML = `<p class="waiting-text"> 等待 ${_currentSpeakerSeat || '?'}号玩家发言中...</p>`;
 }
 break;

 case 'dawn_death_announce':
 if (currentPlayerId === currentHostId) {
 panel.innerHTML = `
 <div style="text-align:center;padding:16px;">
 <p style="font-size:15px;margin-bottom:16px;color:#666;"> 结果已公示，请开始讨论</p>
 <button class="btn btn-primary" onclick="socket.emit('start_free_speech')">开始讨论</button>
 </div>
 `;
 } else {
 panel.innerHTML = `<p class="waiting-text"> 等待主持人开始讨论...</p>`;
 }
 break;

 case 'vote':
 case 'tie_vote':
 if (isAlive) {
 let targets;
 let title;
 if (phase === 'tie_vote' && _tiedSeats.length) {
 // 同票重投：只显示候选人，但候选人本人不能投票
 if (_tiedSeats.includes(currentSeat)) {
 panel.innerHTML = `<p class="waiting-text"> 平票候选人等待表决结果...</p>`;
 return;
 }
 targets = _cachedPlayers.filter(p => _tiedSeats.includes(p.seat) && p.seat !== currentSeat);
 title = ` 请表决 - 在 ${_tiedSeats.map(s => s + '号').join(' ')} 中选择`;
 } else {
 targets = _cachedPlayers.filter(p => p.isAlive && p.seat !== currentSeat);
 title = ' 请表决';
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
 <button class="vote-target" data-seat="0"
 onclick="castVote(0)" style="color:#888;">
 弃权
 </button>
 </div>
 </div>
 `;
 } else {
 panel.innerHTML = `<p class="waiting-text"> 成员正在表决...</p>`;
 }
 break;

 case 'night_werewolf':
 case 'night_seer':
 case 'night_witch':
 renderNightAction(phase, panel);
 break;

 default:
 panel.innerHTML = `<p class="waiting-text"> 请等待其他成员操作...</p>`;
 }
}

function renderNightAction(phase, panel) {
 const isMyPhase = _myNightPhase === phase;

 if (!isMyPhase) {
 panel.innerHTML = `<p class="waiting-text"> 等待其他成员操作...</p>`;
 return;
 }

 const targets = _cachedPlayers.filter(p => p.isAlive && p.seat !== currentSeat);

 switch (phase) {
 case 'night_werewolf':
 panel.innerHTML = `
 <div class="night-area">
 <div class="night-title"> 小组投票</div>
 <p class="skill-name">选择待处理成员</p>
 <div class="vote-targets">
 ${targets.map(t => `
 <button class="vote-target" onclick="selectWolfTarget(${t.seat})" id="wolf-target-${t.seat}">
 ${t.seat}号 ${t.name}
 </button>
 `).join('')}
 </div>
 <button class="btn-confirm" onclick="submitNightAction('kill')" style="margin-top:6px;">确认</button>
 <div style="margin-top:8px;padding:6px 8px;background:var(--bg);border-radius:var(--radius-sm);font-size:12px;color:var(--text-secondary);">
 <div style="font-weight:600;margin-bottom:2px;">表决结果</div>
 <div id="werewolf-votes">等待投票...</div>
 </div>
 </div>
 `;
 break;

 case 'night_seer':
 panel.innerHTML = `
 <div class="night-area">
 <div class="night-title"> 信息查询</div>
 <p class="skill-name">选择查询对象</p>
 <select id="night-target">
 ${targets.map(t => `<option value="${t.seat}">${t.seat}号 ${t.name}</option>`).join('')}
 </select>
 <button class="btn-confirm" onclick="submitNightAction('investigate')">确认查询</button>
 </div>
 `;
 break;

 case 'night_witch':
 const saveDisabled = _witchInfo && !_witchInfo.hasSave;
 const killDisabled = _witchInfo && !_witchInfo.hasKill;
 panel.innerHTML = `
 <div class="night-area">
 <div class="night-title"> 处置操作</div>
 <div id="witch-info" class="witch-info">加载中...</div>
 <div class="vote-targets" style="margin-top:8px;">
 <button class="vote-target ${_witchSelected === 'save' ? 'selected' : ''}" onclick="selectWitchAction('save')" id="witch-btn-save" ${saveDisabled ? 'disabled' : ''}>使用解药</button>
 <button class="vote-target ${_witchSelected === 'kill' ? 'selected' : ''}" onclick="selectWitchAction('kill')" id="witch-btn-kill" ${killDisabled ? 'disabled' : ''}>使用毒药</button>
 <button class="vote-target ${_witchSelected === 'pass' ? 'selected' : ''}" onclick="selectWitchAction('pass')" id="witch-btn-pass">弃权</button>
 </div>
 <div id="witch-kill-target-wrapper" class="hidden" style="margin-top:8px;">
 <p class="skill-name" style="margin-bottom:4px;">选择目标成员</p>
 <div class="vote-targets">
 ${targets.map(t => `
 <button class="vote-target" onclick="selectWitchTarget(${t.seat})" id="witch-target-${t.seat}">
 ${t.seat}号 ${t.name}
 </button>
 `).join('')}
 </div>
 </div>
 <button class="btn-confirm" onclick="submitWitchAction()" style="margin-top:8px;">确认</button>
 </div>
 `;
 break;

 }
}

function isCurrentPlayerAlive() {
 const p = _cachedPlayers.find(p => p.seat === currentSeat);
 return p ? p.isAlive : false;
}


// ========== 角色专属状态栏 ==========
function updateRoleStatusBar() {
 const bar = document.getElementById('role-status-bar');
 if (!bar) return;
 const role = sessionStorage.getItem('werewolf_role');
 if (!role || role === 'villager' || role === 'hunter') { bar.classList.add('hidden'); return; }

 let html = '';

 if (role === 'werewolf') {
 html += '<span class="role-label">你的身份：</span><span class="role-badge role-werewolf">狼人</span>';
 if (_roleTeammates.length > 0) {
 html += '<span class="role-label" style="margin-left:12px;">你的队友：</span>';
 _roleTeammates.forEach(t => {
 const player = _cachedPlayers.find(p => p.seat === t.seat);
 const isDead = player && !player.isAlive;
 html += '<span class="role-badge' + (isDead ? ' dead' : '') + '">' + t.seat + '号 ' + t.name + '</span>';
 });
 }
 } else if (role === 'seer') {
 html += '<span class="role-label">你的身份：</span><span class="role-badge role-seer">预言家</span>';
 html += '<span class="role-label" style="margin-left:12px;">已查验身份：</span>';
 _investigatedList.forEach(item => {
 html += '<span class="role-badge role-seer">' + item.seat + '号 ' + item.name + ' | ' + (item.isWolf ? '狼人' : '好人') + '</span>';
 });
 if (_investigatedList.length === 0) {
 html += '<span class="role-badge" style="color:var(--text-muted);border-style:dashed;">等待查验...</span>';
 }
 } else if (role === 'witch') {
 const hasSave = _witchInfo ? _witchInfo.hasSave : true;
 const hasKill = _witchInfo ? _witchInfo.hasKill : true;
 html += '<span class="role-label">你的身份：</span><span class="role-badge role-witch">女巫</span>';
 html += '<span class="role-badge' + (!hasSave ? ' dead' : '') + '">解药 ' + (hasSave ? '✓' : '✗') + '</span>';
 html += '<span class="role-badge' + (!hasKill ? ' dead' : '') + '">毒药 ' + (hasKill ? '✓' : '✗') + '</span>';
 }

 bar.innerHTML = html;
 bar.classList.remove('hidden');
}

// ========== 阶段文本 ==========
function getPhaseText(phase) {
 const map = {
 'night_werewolf': ' 闭门讨论',
 'night_seer': ' 信息汇总',
 'night_witch': ' 方案制定',
 'dawn_death_announce': ' 结果通报',
 'last_words': ' 简要陈述',
 'free_speech': ' 开放讨论',
 'vote': ' 表决',
 'vote_result': ' 表决结果',
 'tie_speech': ' 提案陈述',
 'tie_vote': ' 复议',
 'final_words': ' 简要陈述',
 'settlement': ' 会议结束'
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

let _bossMode = false;

function toggleBossMode() {
 _bossMode = !_bossMode;
 // 左侧：隐藏游戏区域，显示工作文档
 const zones = document.querySelectorAll('.zone-status, .zone-feed, .zone-action, .player-status-list, #role-status-bar');
 zones.forEach(el => el.classList.toggle('hidden', _bossMode));
 document.getElementById('boss-doc').classList.toggle('hidden', !_bossMode);
 socket.emit('boss_mode', { active: _bossMode });
}

// 键盘快捷键 Alt+L 切换跑路模式
document.addEventListener('keydown', function(e) {
 if (e.altKey && e.key === 'l') { e.preventDefault(); toggleBossMode(); }
 if (e.altKey && e.key === 'L') { e.preventDefault(); toggleBossMode(); }
});

// 接收其他成员的跑路状态
socket.on('player_boss_mode', (data) => {
 const p = _cachedPlayers.find(x => x.seat === data.seat);
 if (p) p.bossMode = data.active;
 updatePlayerStatusList();
});

function exitGame() {
 document.getElementById('modal-overlay').classList.remove('hidden');
}
function confirmExit() {
 document.getElementById('modal-overlay').classList.add('hidden');
 socket.emit('leave_room');
}
function closeModal() {
 document.getElementById('modal-overlay').classList.add('hidden');
}

function castVote(targetSeat) {
 document.querySelectorAll('.vote-target').forEach(el => {
 el.classList.toggle('selected', parseInt(el.dataset.seat) === targetSeat);
 });
 socket.emit('vote', { targetSeat });
}

// ========== 夜间行动函数 ==========
function selectWolfTarget(seat) {
 _selectedWolfTarget = seat;
 document.querySelectorAll('#werewolf-votes').forEach(el => el.closest('.vote-targets')?.querySelectorAll('.vote-target').forEach(b => b.classList.remove('selected')));
 const btn = document.getElementById('wolf-target-' + seat);
 if (btn) btn.classList.add('selected');
}

function submitNightAction(type) {
 let target;
 if (type === 'kill') {
 target = _selectedWolfTarget;
 if (!target) { showError('请先选择目标'); return; }
 } else {
 target = parseInt(document.getElementById('night-target').value);
 }
 socket.emit('night_action', { target, action: type });
}

function selectWitchAction(type) {
 _witchSelected = type;
 document.querySelectorAll('[id^="witch-btn-"]').forEach(b => b.classList.remove('selected'));
 const btn = document.getElementById('witch-btn-' + type);
 if (btn) btn.classList.add('selected');
 document.getElementById('witch-kill-target-wrapper').classList.toggle('hidden', type !== 'kill');
 _witchTarget = null;
}

function selectWitchTarget(seat) {
 _witchTarget = seat;
 document.querySelectorAll('[id^="witch-target-"]').forEach(b => b.classList.remove('selected'));
 const btn = document.getElementById('witch-target-' + seat);
 if (btn) btn.classList.add('selected');
}

function submitWitchAction() {
 if (_witchSelected === 'save') {
 socket.emit('night_action', { action: 'witch', save: true, killTarget: null });
 } else if (_witchSelected === 'kill') {
 if (!_witchTarget) { showError('请选择目标成员'); return; }
 socket.emit('night_action', { action: 'witch', save: false, killTarget: _witchTarget });
 } else if (_witchSelected === 'pass') {
 socket.emit('night_action', { action: 'witch', save: false, killTarget: null });
 } else {
 showError('请选择使用解药、毒药或弃权');
 }
}

// ========== 房间事件中缓存玩家列表 ==========
socket.on('room_joined', (info) => {
 _cachedPlayers = info.players.map(p => ({ ...p }));
 updatePlayerStatusList();
});
