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
