# 纯文字线上狼人杀（90s打字版）开发设计方案

> 日期：2026-07-21
> 状态：已确认

## 一、项目概述

一款基于 Web 端的纯文字多人在线狼人杀游戏。核心特色为"90秒限时打字发言"机制。本项目为个人学习/技术验证项目，采用精简架构优先实现核心玩法。

### 技术栈
- **前端**：原生 HTML5 + CSS3 + Vanilla JS
- **后端**：Node.js + Express
- **通信**：Socket.io（服务端绝对权威，计时同步）
- **布局**：CSS Grid / Flexbox 三区自适应

### MVP 角色
狼人（2人）、预言家、女巫、猎人、平民（若干），**不包含警长竞选**。

---

## 二、项目结构

```
D:\code\hb\werewolf\
├── server.js              # 入口：Express + Socket.io 启动
├── game-engine.js         # 核心：有限状态机 + 游戏流程
├── room-manager.js        # 房间管理：创建、加入、离开、状态
├── public/                # 前端静态资源
│   ├── index.html         # 主页面（大厅 + 游戏界面）
│   ├── style.css          # 三区布局样式
│   ├── app.js             # 前端主逻辑（Socket.io 客户端）
│   └── timer.js           # 90s 倒计时渲染（客户端）
├── package.json
└── README.md
```

---

## 三、核心数据模型

### 房间 (Room)
```
id: string              # 6位房间号
players: Map<Player>    # 玩家列表
host: socketId          # 房主
status: 'waiting' | 'playing' | 'ended'
config: {
  maxPlayers: 12
  werewolfCount: 2
}
game: GameState | null
```

### 玩家 (Player)
```
id: string              # socketId
name: string            # 玩家昵称
seat: number            # 座位号（1-12）
isAlive: boolean
isSheriff: boolean      # 留作扩展
role: Role              # 身份（仅自己知晓）
isAfk: boolean
disconnected: boolean
score: number           # 信誉分
```

### 游戏状态 (GameState)
```
phase: Phase            # 当前阶段
round: number           # 第几天
players: Player[]
dayOrder: number[]      # 白天发言顺序
currentSpeaker: number  # 当前发言人座位号
speechTimer: Timer      # 发言计时
voteResults: Vote[]
nightActions: {}
history: LogEntry[]
```

### 阶段枚举 (Phase)
```
waiting | role_assign |
night_werewolf | night_seer | night_witch | night_hunter |
dawn_death_announce | last_words |
free_speech | vote | vote_result | final_words |
settlement
```

---

## 四、游戏状态机（FSM）

```
         [房主点击开始]
等待中 ─────────────────→ 发牌 ──→ 第一夜
                                       │
                           ┌───────────┼───────────┐
                           ▼           ▼           ▼
                      狼人行动    预言家查验    女巫行动
                           │           │           │
                           └───────────┴───────────┘
                                       │
                                       ▼
                                  猎人行动
                                       │
                                       ▼
                               天亮(死讯公告)
                                       │
                                       ▼
                               死者遗言(60s)
                                       │
                                       ▼
                             按顺序90s自由发言
                                       │
                                       ▼
                                 放逐投票
                                       │
                                       ▼
                               出局遗言(60s)
                                       │
                                       ▼
                           ┌── 检查胜负 ──┐
                           │              │
                           ▼              ▼
                        游戏结束       进入下一夜
                        (结算)         (回到黑夜)
```

### 关键设计规则
1. **服务端绝对权威**：所有阶段切换由 game-engine.js 控制，客户端仅渲染当前阶段 UI
2. **超时自动流转**：90s 发言 / 30s 投票 / 20s 夜间行动，超时自动进入下一阶段
3. **串行夜间行动**：狼人 → 预言家 → 女巫 → 猎人，依次唤醒，互不可见
4. **昼夜交替**：白天结束后进入下一夜，直到胜负条件满足

---

## 五、Socket.io 事件协议

### 客户端 → 服务端

| 事件              | 载荷                       | 说明              |
| --------------- | ------------------------ | --------------- |
| `join_room`     | `{ roomId, playerName }` | 加入房间            |
| `create_room`   | `{ playerName, config }` | 创建房间            |
| `start_game`    | `{}`                     | 房主开始游戏（需校验房主身份） |
| `player_speech` | `{ content }`            | 提交发言文本          |
| `end_speech`    | `{}`                     | 提前结束发言          |
| `night_action`  | `{ target, action }`     | 夜间操作（校验角色权限）    |
| `vote`          | `{ targetSeat }`         | 放逐投票            |
| `reconnect`     | `{ roomId, playerId }`   | 断线重连            |

### 服务端 → 客户端

| 事件                   | 载荷                                    | 说明           |
| -------------------- | ------------------------------------- | ------------ |
| `room_joined`        | `{ roomId, players, host }`           | 加入成功         |
| `game_started`       | `{ role }`                            | 游戏开始（私密发送身份） |
| `phase_change`       | `{ phase, data }`                     | 阶段切换         |
| `your_turn`          | `{ timeLimit }`                       | 轮到该玩家操作      |
| `speech_broadcast`   | `{ seat, name, content }`             | 广播发言         |
| `night_result`       | `{ result }`                          | 夜间行动结果（私密）   |
| `death_announce`     | `{ deaths }`                          | 天亮死讯公告       |
| `vote_update`        | `{ votes }`                           | 实时投票更新       |
| `vote_result`        | `{ result }`                          | 投票最终结果       |
| `game_over`          | `{ winner, roles }`                   | 游戏结束，全员揭底牌   |
| `player_joined`      | `{ player }`                          | 新玩家加入房间      |
| `player_left`        | `{ seat }`                            | 玩家离开房间       |
| `player_reconnected` | `{ seat }`                            | 玩家重连成功       |
| `timer_sync`         | `{ serverTime, startTime, duration }` | 计时同步         |
| `error`              | `{ code, message }`                   | 错误通知         |

### 计时同步机制
```
服务端下发的 timer_sync:
{
  serverTimestamp: 1742600000000,  // 服务端当前 Unix 时间戳
  startTimestamp:  1742599910000,  // 该阶段开始时间戳
  duration:        90000           // 阶段持续时长(ms)
}

客户端计算: remaining = (startTimestamp + duration) - Date.now()
所有客户端使用同一公式，确保倒计时绝对一致。
```

---

## 六、UI 三区布局（左-中-右）

### 左侧：全局状态区
- 当前游戏阶段（如"黑夜-狼人行动"）
- 90s 发言倒计时（大号字体醒目显示）
- 存活玩家列表及状态（绿色●存活 / 红色●死亡）
- 当前轮到哪位玩家（高亮标识）

### 中间：公共信息流
- 类聊天室滚动面板，按时间顺序排列
- 系统消息（淡黄色）
- 玩家发言（白色，标注说话者座位号）
- 轮到当前玩家发言时输入框高亮置顶

### 右侧：个人操作区
- **发言状态**：大文本输入框 + "发送"按钮 + "结束发言"按钮
- **夜间状态**：技能按钮组 + 目标选择下拉框 + "确认操作"按钮
- **等待状态**：锁定置灰，"请等待其他玩家行动..."
- **投票状态**：玩家列表可点击选择投票目标

### 自适应规则
- 桌面端（≥768px）：左-中-右三栏
- 后续可扩展移动端适配

---

## 七、角色技能逻辑

### 狼人（Werewolf）
- **夜间**：共同选择一名玩家击杀
- **狼人互认**：狼人之间互相知晓身份
- **行动**：下拉菜单选择击杀目标

### 预言家（Seer）
- **夜间**：查验一名玩家的真实身份
- **反馈**："你查验了 X号，他的身份是【狼人/好人】"

### 女巫（Witch）
- **夜间**：知晓当晚被狼人击杀的玩家
- **技能**：拥有一瓶解药和一瓶毒药（各仅一次）
- **解药**：救活被击杀的玩家
- **毒药**：毒杀任意一名玩家
- **操作**：选择是否使用解药/毒药及目标

### 猎人（Hunter）
- **出局时**：可以开枪带走一名玩家
- **触发**：被放逐或夜间被击杀时均可发动
- **操作**：选择一名玩家作为开枪目标

### 平民（Villager）
- **夜间**：无特殊能力
- **白天**：参与发言和投票

---

## 八、异常处理

### 断线重连
1. 玩家断线后，服务端保留其状态 60 秒
2. 其他玩家看到"X号玩家断线中..."
3. 60 秒内同一玩家重新加入，恢复游戏界面
4. 服务端推送：当前阶段、历史消息、当前状态
5. 超时未重连 → 标记为出局，公布消息

### 挂机检测
- 发言轮次无任何输入 → 警告
- 连续 3 轮投票弃权 → 警告
- 累计 2 次警告 → 从游戏中移除

### 敏感词过滤
- 服务端维护敏感词列表（JSON 配置文件）
- 发言命中敏感词 → 替换为 `***` 后广播
- 私信提示发送者

### 防作弊
- 服务端绝不发送全局角色信息
- 非操作时段界面锁定
- 计时依赖服务端时间戳

---

## 九、开发路线图

### Phase 1：基础设施（Day 1）
- [ ] 项目初始化、package.json、Express + Socket.io 搭建
- [ ] 房间创建/加入/离开逻辑
- [ ] 前端页面框架（三区布局 HTML + CSS）
- [ ] Socket.io 连接建立

### Phase 2：游戏核心（Day 2-3）
- [ ] FSM 游戏引擎（夜间阶段）
- [ ] 角色分配逻辑
- [ ] 90s 发言计时机制
- [ ] 白天投票逻辑
- [ ] 胜负判定

### Phase 3：角色技能（Day 3-4）
- [ ] 狼人行动 + 互认
- [ ] 预言家查验
- [ ] 女巫解药/毒药
- [ ] 猎人开枪
- [ ] 夜间私密反馈

### Phase 4：UI 完善（Day 4-5）
- [ ] 倒计时渲染组件
- [ ] 信息流（发言/系统消息）
- [ ] 操作区状态切换
- [ ] 夜间操作界面
- [ ] 投票界面

### Phase 5：容错与收尾（Day 5-6）
- [ ] 断线重连
- [ ] 挂机检测
- [ ] 敏感词过滤
- [ ] 异常边界处理
- [ ] 测试与调试

---

## 十、设计原则

1. **YAGNI**：不加入 MVP 不需要的功能（无用户系统、无匹配队列、无排行榜）
2. **服务端权威**：所有逻辑判断在服务端完成
3. **渐进迭代**：Phase 1-5 依次推进，每个阶段完成可测试
4. **最小依赖**：仅使用 Express + Socket.io 两个 npm 包
5. **代码自文档**：关键函数和状态流转添加注释
