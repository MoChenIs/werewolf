const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./room-manager');
const { GameEngine } = require('./game-engine');
const { processWerewolfAction, getWerewolfTargets } = require('./roles/werewolf');
const { processSeerAction, getSeerTargets } = require('./roles/seer');
const { processWitchAction, getWitchInfo } = require('./roles/witch');
const { processHunterAction, getHunterTargets } = require('./roles/hunter');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const roomManager = new RoomManager();

const PORT = process.env.PORT || 9919;

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io 连接
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
 // 给新玩家发房间信息
 socket.emit('room_joined', roomManager.getRoomInfo(result.room));
 socket.emit('your_info', { seat: result.player.seat, playerId: socket.id });
 // 通知房间其他人（带完整玩家列表，更新 UI）
 io.to(roomId).emit('room_joined', roomManager.getRoomInfo(result.room));
 io.to(roomId).emit('player_joined', { seat: result.player.seat, name: result.player.name, isAi: false });
 });

 // 房主添加 AI
 socket.on('add_ai', () => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room) return socket.emit('error', { code: 'NO_ROOM', message: '你不在房间中' });
 if (room.host !== socket.id) return socket.emit('error', { code: 'NOT_HOST', message: '只有房主可以添加AI' });
 if (room.status !== 'waiting') return socket.emit('error', { code: 'GAME_STARTED', message: '游戏已开始' });
 if (room.players.size >= room.config.maxPlayers) return socket.emit('error', { code: 'ROOM_FULL', message: '房间已满' });

 const result = roomManager.addAiPlayer(room.id);
 if (result.error) return socket.emit('error', { ...result });

 io.to(room.id).emit('player_joined', { seat: result.player.seat, name: result.player.name, isAi: true });
 io.to(room.id).emit('room_joined', roomManager.getRoomInfo(room));
 });

 // 玩家离开
 socket.on('leave_room', () => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room) return;

 if (room.status === 'playing') {
 // 游戏中有人退出 → 游戏结束
 const player = room.players.get(socket.id);
 if (player) {
 socket.leave(room.id);
 room.players.forEach((p) => {
 const isGood = p.role !== 'werewolf';
 const playerWon = false;
 io.to(p.id).emit('game_over', {
 winner: 'none', message: `${player.name} 退出游戏，本局终止`, youWon: false,
 roles: Array.from(room.players.values()).map(r => ({ seat: r.seat, name: r.name, role: r.role }))
 });
 });
 room.status = 'ended';
 socket.emit('left_room');
 }
 } else {
 const result = roomManager.leaveRoom(socket.id);
 if (result.error) return;
 if (result.action === 'left') {
 socket.leave(result.roomId);
 socket.to(result.roomId).emit('player_left', { seat: result.seat, name: result.name });
 if (result.newHost) {
 io.to(result.roomId).emit('host_changed', { newHost: result.newHost });
 }
 socket.emit('left_room');
 } else if (result.action === 'destroyed') {
 socket.emit('left_room');
 }
 }
 });

 // 开始游戏
 socket.on('start_game', () => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room) return socket.emit('error', { code: 'NO_ROOM', message: '你不在房间中' });
 if (room.host !== socket.id) return socket.emit('error', { code: 'NOT_HOST', message: '只有房主可以开始游戏' });
 if (room.players.size < 4) return socket.emit('error', { code: 'NOT_ENOUGH', message: '至少需要4名玩家' });

 const engine = new GameEngine(room);
 room.game = engine;
 room.status = 'playing';
 engine.startGame();

 // 私密发送身份
 room.players.forEach((player) => {
 io.to(player.id).emit('game_started', { role: player.role });
 });

 // 广播游戏开始
 io.to(room.id).emit('phase_change', {
 phase: 'night_werewolf',
 message: ' 狼人行动中'
 });

 // 告知狼人队友
 const werewolves = engine.getWerewolves();
 const werewolfSeats = werewolves.map(w => ({ seat: w.seat, name: w.name }));
 werewolves.forEach(w => {
 io.to(w.id).emit('night_teammates', { teammates: werewolfSeats.filter(t => t.seat !== w.seat) });
 });

 // 通知所有狼人投票选择目标
 const targets = Array.from(room.players.values()).filter(p => p.isAlive).map(p => ({ seat: p.seat, name: p.name }));
 engine.werewolfVotes = {};
 werewolves.forEach(w => {
 io.to(w.id).emit('your_turn', {
 seat: w.seat,
 action: 'night_kill',
 isYou: true,
 targets
 });
 });

 // AI 狼人自动投票，确保不卡流程
 autoProcessAiNight(room, io);
 });

 // 房主开始白天发言
 socket.on('start_free_speech', () => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room || room.host !== socket.id) return;
 const engine = room.game;
 if (!engine || engine.phase !== 'dawn_death_announce') return;

 const result = engine.startFreeSpeech();
 io.to(room.id).emit('phase_change', { phase: 'free_speech', message: ' 讨论开始' });
 startSpeechTimerForSpeaker(room, io);
 });

 // 玩家提交发言
 socket.on('player_speech', ({ content }) => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room || !room.game) return;
 const engine = room.game;
 const player = room.players.get(socket.id);
 if (!player || !player.isAlive) return;
 if (engine.phase !== 'free_speech' && engine.phase !== 'tie_speech') return;

 const expectedSeat = engine.phase === 'tie_speech'
 ? engine.tieOrder[engine.currentTieSpeaker]
 : engine.dayOrder[engine.currentSpeaker];
 if (player.seat !== expectedSeat) return;

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
 engine.addLog('speech', `${player.seat}号发言: ${filtered}`, player.seat);
 });

 // 提前结束发言
 socket.on('end_speech', () => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room || !room.game) return;
 const engine = room.game;
 if (engine.phase !== 'free_speech' && engine.phase !== 'tie_speech') return;
 const player = room.players.get(socket.id);
 if (!player) return;

 if (engine.phase === 'tie_speech') {
 const expectedSeat = engine.tieOrder[engine.currentTieSpeaker];
 if (player.seat !== expectedSeat) return;
 clearTimeout(room._speechTimer);
 const next = engine.nextTieSpeaker();
 if (next.phase === 'tie_vote') {
 io.to(room.id).emit('phase_change', { phase: 'tie_vote', message: '开始重新表决', tiedSeats: engine.tieOrder });
 autoVoteForAiPlayers(room, io);
 room._voteTimer = setTimeout(() => {
 if (room.game.phase !== 'tie_vote') return;
 const r = room.game.executeVote();
 r.phase = 'tie_vote';
 handleVoteResult(room, io, r);
 }, engine.voteDuration);
 } else {
 startTieSpeaker(room, io, next.speaker);
 }
 } else {
 const expectedSeat = engine.dayOrder[engine.currentSpeaker];
 if (player.seat !== expectedSeat) return;
 clearTimeout(room._speechTimer);
 const next = engine.nextSpeaker();
 handleSpeechTransition(room, io, next);
 }
 });

 // 投票
 socket.on('vote', ({ targetSeat }) => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room || !room.game) return;
 const engine = room.game;
 const player = room.players.get(socket.id);
 if (!player || !player.isAlive) return;
 if (engine.phase !== 'vote' && engine.phase !== 'tie_vote') return;

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
 clearTimeout(room._voteTimer);
 const result = engine.executeVote();
 if (engine.phase === 'tie_vote') {
 result.phase = 'tie_vote'; // 标记为重投结果
 }
 handleVoteResult(room, io, result);
 }
 });

 // 夜间行动
 socket.on('night_action', ({ target, action, save, killTarget }) => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room || !room.game) return;
 const engine = room.game;

 let result;
 switch (action) {
 case 'kill':
 result = processWerewolfAction(engine, socket.id, target);
 if (!result.success) break;

 const voter = engine.room.players.get(socket.id);
 if (!voter) break;

 // 记录狼人投票（AI 狼人自动投随机目标）
 engine.werewolfVotes[voter.seat] = target;
 const aliveWerewolves = engine.getWerewolves().filter(w => w.isAlive);
 const totalWolves = aliveWerewolves.length;

 // AI 狼人自动补齐投票
 const nonWolfTargets = Array.from(room.players.values()).filter(p => p.isAlive && p.role !== 'werewolf');
 aliveWerewolves.forEach(w => {
 if (w.isAi && engine.werewolfVotes[w.seat] === undefined) {
 const pick = nonWolfTargets.length > 0
 ? nonWolfTargets[Math.floor(Math.random() * nonWolfTargets.length)].seat
 : 0;
 engine.werewolfVotes[w.seat] = pick;
 }
 });

 const votedCount = Object.keys(engine.werewolfVotes).length;

 // 广播投票给其他狼人
 aliveWerewolves.forEach(w => {
 io.to(w.id).emit('werewolf_vote', {
 votes: { ...engine.werewolfVotes },
 voter: voter.seat,
 target
 });
 });

 // 所有狼人都投票了，统计结果
 if (votedCount >= totalWolves) {
 const tally = {};
 Object.values(engine.werewolfVotes).forEach(t => {
 if (t) tally[t] = (tally[t] || 0) + 1;
 });

 const maxVotes = Math.max(...Object.values(tally), 0);
 const topTargets = Object.entries(tally).filter(([_, c]) => c === maxVotes);

 if (topTargets.length === 1 && maxVotes >= Math.ceil(totalWolves / 2)) {
 // 多数决：击杀目标
 engine.nightActions.werewolfKill = parseInt(topTargets[0][0]);
 aliveWerewolves.forEach(w => {
 io.to(w.id).emit('night_result', { message: `已确认击杀 ${topTargets[0][0]}号` });
 });
 engine.werewolfVotes = {};
 handleNightPhase(room, io, engine.advanceNight());
 } else if (topTargets.length >= totalWolves) {
 // 全部分歧：统一意见
 engine.werewolfVotes = {};
 aliveWerewolves.forEach(w => {
 io.to(w.id).emit('werewolf_disagree');
 });
 } else {
 // 平票（如 4狼 2:2）：重新投票
 engine.werewolfVotes = {};
 aliveWerewolves.forEach(w => {
 io.to(w.id).emit('werewolf_disagree');
 });
 }
 }
 break;
 case 'investigate':
 result = processSeerAction(engine, socket.id, target);
 if (result.success) {
 io.to(socket.id).emit('night_result', { message: result.message });
 handleNightPhase(room, io, engine.advanceNight());
 }
 break;
 case 'shoot':
 result = processHunterAction(engine, socket.id, target);
 if (result.success) {
 io.to(room.id).emit('death_announce', { seat: result.target.seat, name: result.target.name });
 io.to(room.id).emit('night_result', { message: result.message });
 handleNightPhase(room, io, engine.advanceNight());
 }
 break;
 case 'witch':
 result = processWitchAction(engine, socket.id, { save, killTarget });
 if (result.success) {
 io.to(socket.id).emit('night_result', { message: result.message });
 handleNightPhase(room, io, engine.advanceNight());
 }
 break;
 }

 if (result && result.error) {
 socket.emit('error', { code: 'ACTION_FAILED', message: result.error });
 }
 });

 // 再来一局
 socket.on('play_again', () => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room || room.status !== 'ended') return;

 if (!room.playAgainVotes) room.playAgainVotes = new Set();
 room.playAgainVotes.add(socket.id);

 // 人类玩家总数（AI 自动同意）
 const totalHumans = Array.from(room.players.values()).filter(p => !p.isAi).length;
 const votedCount = room.playAgainVotes.size;

 // 全 AI 局直接重开
 if (totalHumans === 0) return restartGame(room);

 io.to(room.id).emit('play_again_count', {
 count: votedCount,
 total: totalHumans
 });

 // 所有人类玩家都同意 = 重开
 if (votedCount >= totalHumans) restartGame(room);
 });

 // 猎人被动技能：死亡后带走一人
 socket.on('hunter_shoot', ({ targetSeat }) => {
 const room = roomManager.findRoomBySocket(socket.id);
 if (!room || !room.game) return;
 const engine = room.game;
 const player = room.players.get(socket.id);
 if (!player || player.role !== 'hunter') return;
 if (engine.hunterUsedAbility) return;

 engine.hunterUsedAbility = true;
 if (room._hunterTimer) { clearTimeout(room._hunterTimer); room._hunterTimer = null; }

 // 票杀时暴露身份并播报，夜间杀不播报
 const revealRole = engine.phase === 'final_words' || engine.phase === 'tie_vote';

 if (targetSeat && targetSeat > 0) {
 const target = Array.from(room.players.values()).find(p => p.seat === targetSeat);
 if (target && target.isAlive) {
 target.isAlive = false;
 if (revealRole) {
 io.to(room.id).emit('death_announce', { seat: target.seat, name: target.name });
 io.to(room.id).emit('night_result', { message: ` 猎人带走${targetSeat}号 ${target.name}` });
 }
 }
 }
 });

 socket.on('disconnect', () => {
 console.log(`[断开] 玩家断开: ${socket.id}`);
 const room = roomManager.findRoomBySocket(socket.id);
 if (room) {
 const player = room.players.get(socket.id);
 if (player) {
 player.disconnected = true;

 // 延迟5秒广播断线，给页面刷新/短暂断网留出重连时间
 const dcKey = `_dc_${socket.id}`;
 room[dcKey] = setTimeout(() => {
 delete room[dcKey];
 io.to(room.id).emit('player_disconnected', { seat: player.seat });
 io.to(room.id).emit('phase_change', {
 phase: room.game ? room.game.phase : 'waiting',
 players: Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
 }))
 });
 }, 5000);

 // 60秒后根据房间状态处理
 room._disconnectTimer = setTimeout(() => {
 if (!player.disconnected) return;
 if (player.disconnected && room.status === 'waiting') {
 const result = roomManager.leaveRoom(socket.id);
 if (result.action === 'left') {
 io.to(room.id).emit('player_left', { seat: result.seat, name: result.name });
 if (result.newHost) {
 io.to(room.id).emit('host_changed', { newHost: result.newHost });
 }
 }
 } else if (player.disconnected && room.status === 'playing') {
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

 // 重连
 socket.on('reconnect_player', ({ roomId, seat }) => {
 const room = roomManager.rooms.get(roomId);
 if (!room) return socket.emit('error', { code: 'NO_ROOM', message: '房间不存在' });

 let player = null;
 for (const [, p] of room.players) {
 if (p.seat === seat) {
 player = p;
 break;
 }
 }

 if (!player) return socket.emit('error', { code: 'NOT_IN_ROOM', message: '你不在这个房间中' });

 const oldId = player.id;
 // 更新 Map 键和新 ID
 room.players.delete(oldId);
 player.id = socket.id;
 room.players.set(socket.id, player);
 player.disconnected = false;
 socket.join(roomId);

 // 取消断线广播延迟（页面刷新后5秒内重连就不显示断线提示）
 const dcKey = `_dc_${oldId}`;
 if (room[dcKey]) {
 clearTimeout(room[dcKey]);
 delete room[dcKey];
 }

 if (room._disconnectTimer) {
 clearTimeout(room._disconnectTimer);
 room._disconnectTimer = null;
 }

 // 重连玩家如果是房主，更新房间 host 指向新 ID
 if (room.host === oldId) {
 room.host = socket.id;
 io.to(roomId).emit('host_changed', { newHost: socket.id });
 }

 // 通知所有人断线状态已恢复
 io.to(roomId).emit('player_reconnected', { seat: player.seat });
 // 更新全房间的玩家列表（含断线状态恢复）
 io.to(roomId).emit('phase_change', {
 phase: room.game ? room.game.phase : 'waiting',
 players: Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
 }))
 });

 socket.emit('your_info', { seat: player.seat, playerId: socket.id });
 socket.emit('room_joined', roomManager.getRoomInfo(room));

 if (room.game) {
 const engine = room.game;
 socket.emit('game_started', { role: player.role });
 socket.emit('phase_change', {
 phase: engine.phase,
 message: `欢迎回来，当前是 ${engine.phase}`,
 players: Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
 }))
 });

 // 如果当前是发言阶段，推送计时
 if (engine.phase === 'free_speech' && engine.speechStartTime) {
 socket.emit('timer_sync', {
 startTimestamp: engine.speechStartTime,
 duration: engine.speechDuration
 });
 }

 // 恢复当前阶段的行动 UI 状态
 restorePlayerTurn(room, engine, socket, player);
 }
 });
});

// ========== 辅助函数 ==========

function restorePlayerTurn(room, engine, socket, player) {
 // 发言阶段：恢复当前发言者信息
 if (engine.phase === 'free_speech') {
 const speakerSeat = engine.dayOrder[engine.currentSpeaker];
 // 如果是当前发言者，恢复倒计时
 if (player.seat === speakerSeat && engine.speechStartTime) {
 socket.emit('timer_sync', {
 startTimestamp: engine.speechStartTime,
 duration: engine.speechDuration
 });
 }
 socket.emit('your_turn', {
 seat: speakerSeat,
 action: 'speech',
 timeLimit: engine.speechDuration,
 isYou: player.seat === speakerSeat
 });
 return;
 }

 // 夜间阶段：如果该玩家应该行动，恢复操作面板
 if (engine.phase.startsWith('night_')) {
 let shouldAct = false;
 let actionData = null;

 switch (engine.phase) {
 case 'night_werewolf':
 if (player.role === 'werewolf' && player.isAlive) {
 shouldAct = true;
 actionData = { action: 'night_kill', targets: getWerewolfTargets(engine) };
 }
 break;
 case 'night_seer':
 if (player.role === 'seer' && player.isAlive) {
 shouldAct = true;
 actionData = { action: 'investigate', targets: getSeerTargets(engine) };
 }
 break;
 case 'night_witch':
 if (player.role === 'witch' && player.isAlive) {
 shouldAct = true;
 actionData = { action: 'witch', info: getWitchInfo(engine, player.id) };
 socket.emit('witch_info', actionData.info);
 }
 break;
 }

 if (shouldAct) {
 socket.emit('your_turn', {
 seat: player.seat,
 action: actionData.action,
 isYou: true,
 ...actionData
 });
 }
 }
}

const sensitiveWords = require('./sensitive-words.json');

function filterSensitiveWords(content) {
 let filtered = content;
 sensitiveWords.forEach(word => {
 const regex = new RegExp(word, 'gi');
 filtered = filtered.replace(regex, '***');
 });
 return filtered;
}

function startSpeechTimerForSpeaker(room, io) {
 const engine = room.game;
 const speakerSeat = engine.dayOrder[engine.currentSpeaker];
 const speaker = Array.from(room.players.values()).find(p => p.seat === speakerSeat);

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
 // 倒计时仅发给当前发言者，其他玩家看到 `--`
 if (speaker && !speaker.isAi) {
 io.to(speaker.id).emit('timer_sync', {
 startTimestamp: engine.speechStartTime,
 duration: engine.speechDuration
 });
 }

 room._speechTimer = setTimeout(() => {
 if (engine.phase !== 'free_speech') return;
 const next = engine.nextSpeaker();
 handleSpeechTransition(room, io, next);
 }, engine.speechDuration);

 // 已死亡/断线玩家自动跳过发言
 if (!speaker || !speaker.isAlive || speaker.disconnected) {
 clearTimeout(room._speechTimer);
 const next = engine.nextSpeaker();
 handleSpeechTransition(room, io, next);
 return;
 }

 // AI 玩家自动结束发言
 if (speaker.isAi) {
 clearTimeout(room._speechTimer);
 const next = engine.nextSpeaker();
 handleSpeechTransition(room, io, next);
 }
}

function handleSpeechTransition(room, io, next) {
 if (next.phase === 'vote') {
 io.to(room.id).emit('phase_change', {
 phase: 'vote',
 message: ' 讨论结束，开始表决'
 });
 // AI 自动投票
 autoVoteForAiPlayers(room, io);
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
 // 广播投票明细（谁投了谁）
 io.to(room.id).emit('vote_result', {
 rawVotes: result.rawVotes || {},
 tally: result.tally || {},
 eliminated: result.eliminated || null,
 isTie: result.isTie || false,
 tiedSeats: result.tiedSeats || []
 });

 if (result.phase === 'final_words') {
 // 查找被票出局的玩家角色
 const eliminatedPlayer = Array.from(room.players.values()).find(p => p.seat === result.eliminated.seat);
 const isHunterEliminated = eliminatedPlayer && eliminatedPlayer.role === 'hunter';

 // 被票出局的如果是猎人，触发被动技能
 triggerHunterPassive(room, io);

 const messages = [`${result.eliminated.seat}号玩家被票决`];
 if (isHunterEliminated) messages.push(`${result.eliminated.seat}号玩家是猎人`);

 io.to(room.id).emit('phase_change', {
 phase: 'final_words',
 eliminated: result.eliminated,
 message: messages.join('，')
 });
 handleAfterFinalWords(room, io, room.game);
 } else if (result.phase === 'tie') {
 // 同票 — 候选人各发言一轮，然后重新投票
 const tieResult = room.game.startTieBreak(result.tiedSeats);
 io.to(room.id).emit('phase_change', {
 phase: 'tie_speech',
 message: `同票：${result.tiedSeats.map(s => s + '号').join('、')} 各发言一轮`,
 tiedSeats: result.tiedSeats
 });
 startTieSpeaker(room, io, tieResult.speaker);
 } else if (result.phase === 'tie_vote') {
 // 同票重投结束
 if (result.eliminated) {
 // 查找被票出局的玩家角色
 const eliminatedPlayer = Array.from(room.players.values()).find(p => p.seat === result.eliminated.seat);
 const isHunterEliminated = eliminatedPlayer && eliminatedPlayer.role === 'hunter';

 // 被票出局的如果是猎人，触发被动技能
 triggerHunterPassive(room, io);

 const messages = [`${result.eliminated.seat}号玩家被票决`];
 if (isHunterEliminated) messages.push(`${result.eliminated.seat}号玩家是猎人`);

 io.to(room.id).emit('phase_change', {
 phase: 'final_words',
 eliminated: result.eliminated,
 message: messages.join('，')
 });
 handleAfterFinalWords(room, io, room.game);
 } else {
 // 再次同票，无人出局 → 进入下一夜
 io.to(room.id).emit('phase_change', {
 phase: 'free_speech',
 message: '再次同票，无人出局，进入下一轮'
 });
 setTimeout(() => {
 const next = room.game.afterFinalWords();
 if (next.phase === 'settlement') {
 const rolesInfo = Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, role: p.role
 }));
 room.players.forEach((player) => {
 const isGood = player.role !== 'werewolf';
 const playerWon = (next.winner === 'good' && isGood) || (next.winner === 'werewolf' && !isGood);
 io.to(player.id).emit('game_over', {
 winner: next.winner, message: next.message, youWon: playerWon, roles: rolesInfo
 });
 });
 room.status = 'ended';
 } else {
 handleNightPhase(room, io, next);
 }
 }, 2000);
 }
 }
}

function startTieSpeaker(room, io, speakerSeat) {
 const engine = room.game;
 const speaker = Array.from(room.players.values()).find(p => p.seat === speakerSeat);

 io.to(room.id).emit('your_turn', {
 seat: speakerSeat,
 action: 'speech',
 timeLimit: engine.speechDuration,
 isYou: false
 });
 if (speaker) {
 // 倒计时仅发给当前发言者
 if (!speaker.isAi) {
 io.to(speaker.id).emit('timer_sync', {
 startTimestamp: Date.now(),
 duration: engine.speechDuration
 });
 }
 io.to(speaker.id).emit('your_turn', {
 seat: speakerSeat,
 action: 'speech',
 timeLimit: engine.speechDuration,
 isYou: true
 });
 }

 // AI 或已断线玩家自动跳过
 if (!speaker || !speaker.isAlive || speaker.disconnected || speaker.isAi) {
 const next = engine.nextTieSpeaker();
 if (next.phase === 'tie_vote') {
 io.to(room.id).emit('phase_change', { phase: 'tie_vote', message: '开始重新表决', tiedSeats: engine.tieOrder });
 autoVoteForAiPlayers(room, io);
 room._voteTimer = setTimeout(() => {
 if (room.game.phase !== 'tie_vote') return;
 const r = room.game.executeVote();
 r.phase = 'tie_vote';
 handleVoteResult(room, io, r);
 }, engine.voteDuration);
 } else {
 startTieSpeaker(room, io, next.speaker);
 }
 return;
 }

 // 正常发言倒计时
 room._speechTimer = setTimeout(() => {
 if (engine.phase !== 'tie_speech') return;
 const next = engine.nextTieSpeaker();
 if (next.phase === 'tie_vote') {
 io.to(room.id).emit('phase_change', { phase: 'tie_vote', message: '开始重新表决', tiedSeats: engine.tieOrder });
 autoVoteForAiPlayers(room, io);
 room._voteTimer = setTimeout(() => {
 if (room.game.phase !== 'tie_vote') return;
 const r = room.game.executeVote();
 r.phase = 'tie_vote';
 handleVoteResult(room, io, r);
 }, engine.voteDuration);
 } else {
 startTieSpeaker(room, io, next.speaker);
 }
 }, engine.speechDuration);
}

function handleAfterFinalWords(room, io, engine) {
 // 短暂展示结果后立即进入下一轮（5秒）
 setTimeout(() => {
 const next = engine.afterFinalWords();
 if (next.phase === 'settlement') {
 const rolesInfo = Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, role: p.role
 }));
 room.players.forEach((player) => {
 const isGood = player.role !== 'werewolf';
 const playerWon = (next.winner === 'good' && isGood) || (next.winner === 'werewolf' && !isGood);
 io.to(player.id).emit('game_over', {
 winner: next.winner, message: next.message, youWon: playerWon, roles: rolesInfo
 });
 });
 room.status = 'ended';
 } else {
 handleNightPhase(room, io, next);
 }
 }, 5000);
}

const phaseFlowNames = {
 night_werewolf: ' 狼人',
 night_seer: ' 预言家',
 night_witch: ' 女巫',
 night_hunter: ' 猎人'
};

function handleNightPhase(room, io, result) {
 const engine = room.game;

 // 上一阶段结束提示
 if (result.prevPhase && phaseFlowNames[result.prevPhase]) {
 io.to(room.id).emit('phase_change', {
 phase: result.phase,
 message: `${phaseFlowNames[result.prevPhase]}行动结束`,
 players: Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
 }))
 });
 }

 // 天亮消息
 if (result.phase === 'dawn_death_announce') {
 // 夜间死亡后检查游戏是否结束
 if (checkAndHandleGameEnd(room, io)) return;

 // 猎人夜间死亡触发被动（不暴露身份）
 triggerHunterPassive(room, io, false);

 const deaths = result.deaths || [];
 const deathMsg = deaths.length
 ? `${deaths.map(d => `${d.seat}号玩家死亡`).join('、')}`
 : ' 昨晚是平安夜';
 io.to(room.id).emit('phase_change', {
 phase: result.phase, deaths,
 message: ` ${deathMsg}`,
 players: Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
 }))
 });
 return;
 }

 const phaseMsg = phaseFlowNames[result.phase];
 io.to(room.id).emit('phase_change', {
 phase: result.phase,
 message: phaseMsg ? `${phaseMsg}行动中` : (result.message || ` 第${room.game.round}轮·进行中`),
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
 // 女巫信息在面板渲染后发送（确保 DOM 元素已存在）
 if (engine.phase === 'night_witch' && player.role === 'witch') {
 io.to(player.id).emit('witch_info', actionData.info);
 }
 }
 });

 // AI 全自动跳过（当前阶段没有人类行动者时）
 autoProcessAiNight(room, io);

 // 设置超时（20秒后自动跳过夜间）
 room._nightTimer = setTimeout(() => {
 if (engine.phase.startsWith('night_')) {
 const nextPhase = engine.advanceNight();
 if (nextPhase.isDay) {
 // 天亮：先发上一阶段结束（handleNightPhase 不处理天亮）
 if (nextPhase.prevPhase && phaseFlowNames[nextPhase.prevPhase]) {
 io.to(room.id).emit('phase_change', {
 phase: nextPhase.phase, deaths: nextPhase.deaths,
 message: `${phaseFlowNames[nextPhase.prevPhase]}行动结束`,
 players: Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
 }))
 });
 }
 if (checkAndHandleGameEnd(room, io)) return;
 triggerHunterPassive(room, io, false);
 const deaths = nextPhase.deaths || [];
 const deathMsg = deaths.length
 ? `${deaths.map(d => `${d.seat}号玩家死亡`).join('、')}`
 : ' 昨晚是平安夜';
 io.to(room.id).emit('phase_change', {
 phase: nextPhase.phase, deaths,
 message: ` ${deathMsg}`,
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

// ========== 游戏结束检查（通用） ==========

function checkAndHandleGameEnd(room, io) {
 const engine = room.game;
 if (!engine) return false;
 const endCheck = engine.checkGameEnd();
 if (!endCheck.ended) return false;

 const rolesInfo = Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, role: p.role
 }));
 room.players.forEach((player) => {
 const isGood = player.role !== 'werewolf';
 const playerWon = (endCheck.winner === 'good' && isGood) || (endCheck.winner === 'werewolf' && !isGood);
 io.to(player.id).emit('game_over', {
 winner: endCheck.winner, message: endCheck.message, youWon: playerWon, roles: rolesInfo
 });
 });
 room.status = 'ended';
 return true;
}

// ========== 再来一局 ==========

function restartGame(room) {
 room.playAgainVotes = null;
 room.status = 'waiting';
 room.players.forEach(p => {
 p.isAlive = true;
 p.role = null;
 p.hasVoted = false;
 p.voteTarget = null;
 p.disconnected = false;
 p.isAfk = false;
 p.warnings = 0;
 });
 room.seatCount = room.players.size;
 room.game = null;

 io.to(room.id).emit('room_joined', roomManager.getRoomInfo(room));
}

// ========== 猎人被动技能 ==========

function triggerHunterPassive(room, io, revealRole = true) {
 const engine = room.game;
 if (!engine || engine.hunterUsedAbility) return;

 const hunter = engine.getPendingHunter();
 if (!hunter) return;

 engine.hunterUsedAbility = true;

 if (hunter.isAi) {
 // AI 猎人随机带走一人（夜间不提示，白天统一公告死亡）
 const targets = Array.from(room.players.values()).filter(p => p.isAlive && p.seat !== hunter.seat);
 if (targets.length > 0) {
 const pick = targets[Math.floor(Math.random() * targets.length)];
 pick.isAlive = false;
 if (revealRole) {
 io.to(room.id).emit('death_announce', { seat: pick.seat, name: pick.name });
 io.to(room.id).emit('night_result', { message: ` 猎人带走${pick.seat}号 ${pick.name}` });
 }
 }
 return;
 }

 // 人类猎人：15秒内选择目标
 const targets = Array.from(room.players.values())
 .filter(p => p.isAlive && p.seat !== hunter.seat)
 .map(p => ({ seat: p.seat, name: p.name }));

 if (targets.length === 0) return;

 io.to(hunter.id).emit('hunter_activate', { targets, revealRole });

 room._hunterTimer = setTimeout(() => {
 room._hunterTimer = null;
 io.to(hunter.id).emit('hunter_activate', { targets: [], expired: true });
 }, 15000);
}

// ========== AI 辅助函数 ==========

// AI 自动投票
function autoVoteForAiPlayers(room, io) {
 const engine = room.game;
 if (!engine || (engine.phase !== 'vote' && engine.phase !== 'tie_vote')) return;

 // 同票重投时，AI 只能在候选人中选择
 const isTieVote = engine.phase === 'tie_vote';
 const tieSeats = isTieVote ? (engine.tieOrder || []) : null;

 for (const [, player] of room.players) {
 if (player.isAi && player.isAlive && !player.hasVoted) {
 let aliveTargets;
 if (isTieVote && tieSeats && tieSeats.length) {
 aliveTargets = Array.from(room.players.values())
 .filter(p => p.isAlive && tieSeats.includes(p.seat) && p.seat !== player.seat);
 } else {
 aliveTargets = Array.from(room.players.values())
 .filter(p => p.isAlive && p.seat !== player.seat);
 }
 const target = aliveTargets.length > 0
 ? aliveTargets[Math.floor(Math.random() * aliveTargets.length)].seat
 : 0;

 engine.votes[player.seat] = target;
 player.hasVoted = true;
 player.voteTarget = target;

 io.to(room.id).emit('vote_update', {
 seat: player.seat,
 target: target,
 totalVoters: Object.keys(engine.votes).length,
 totalAlive: Array.from(room.players.values()).filter(p => p.isAlive).length
 });
 }
 }

 // 检查是否所有存活玩家都已投票
 const aliveCount = Array.from(room.players.values()).filter(p => p.isAlive).length;
 if (Object.keys(engine.votes).length >= aliveCount) {
 clearTimeout(room._voteTimer);
 const result = engine.executeVote();
 handleVoteResult(room, io, result);
 }
}

// AI 自动夜间行动
function autoProcessAiNight(room, io) {
 const engine = room.game;
 if (!engine || !engine.phase.startsWith('night_')) return;

 let hasHumanActor = false;

 for (const [, player] of room.players) {
 let isActor = false;
 switch (engine.phase) {
 case 'night_werewolf':
 isActor = player.role === 'werewolf' && player.isAlive;
 break;
 case 'night_seer':
 isActor = player.role === 'seer' && player.isAlive;
 break;
 case 'night_witch':
 isActor = player.role === 'witch' && player.isAlive;
 break;
 }
 if (isActor && player.isAi) {
 // AI 执行该角色动作
 switch (engine.phase) {
 case 'night_werewolf': {
 const targets = Array.from(room.players.values())
 .filter(p => p.isAlive && p.role !== 'werewolf');
 if (targets.length > 0) {
 const pick = targets[Math.floor(Math.random() * targets.length)];
 engine.nightActions.werewolfKill = pick.seat;
 }
 break;
 }
 // 预言家/女巫 AI 不做任何操作（跳过）
 }
 }
 if (isActor && !player.isAi) {
 hasHumanActor = true;
 }
 }

 // 全部是 AI，直接推进
 if (!hasHumanActor) {
 clearTimeout(room._nightTimer);
 const next = engine.advanceNight();
 if (!next.isNight) {
 // 天亮：先发上一阶段结束
 if (next.prevPhase && phaseFlowNames[next.prevPhase]) {
 io.to(room.id).emit('phase_change', {
 phase: next.phase, deaths: next.deaths,
 message: `${phaseFlowNames[next.prevPhase]}行动结束`,
 players: Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
 }))
 });
 }
 if (checkAndHandleGameEnd(room, io)) return;
 triggerHunterPassive(room, io, false);
 const deaths = next.deaths || [];
 const deathMsg = deaths.length
 ? `${deaths.map(d => `${d.seat}号玩家死亡`).join('、')}`
 : ' 昨晚是平安夜';
 io.to(room.id).emit('phase_change', {
 phase: next.phase, deaths,
 message: ` ${deathMsg}`,
 players: Array.from(room.players.values()).map(p => ({
 seat: p.seat, name: p.name, isAlive: p.isAlive, disconnected: p.disconnected
 }))
 });
 } else {
 // 夜间下一阶段：handleNightPhase 统一发「结束+开始」
 handleNightPhase(room, io, next);
 }
 }
}

server.listen(PORT, () => {
 console.log(`[启动] 狼人杀服务器运行在 http://localhost:${PORT}`);
});
