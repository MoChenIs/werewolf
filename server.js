const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./room-manager');
const { GameEngine } = require('./game-engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const roomManager = new RoomManager();

const PORT = process.env.PORT || 3000;

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
    if (player.seat !== expectedSeat) return;

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
      clearTimeout(room._voteTimer);
      const result = engine.executeVote();
      handleVoteResult(room, io, result);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[断开] 玩家断开: ${socket.id}`);
    const result = roomManager.leaveRoom(socket.id);
    if (result && result.action === 'left') {
      io.to(result.roomId).emit('player_left', { seat: result.seat });
      if (result.newHost) {
        io.to(result.roomId).emit('host_changed', { newHost: result.newHost });
      }
    }
  });
});

// ========== 辅助函数 ==========

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
  // 具体夜间角色通知在 Task 8 中实现
}

server.listen(PORT, () => {
  console.log(`[启动] 狼人杀服务器运行在 http://localhost:${PORT}`);
});
