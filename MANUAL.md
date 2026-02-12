# 虚拟家园 - 项目手册

> 更新时间：2026-02-11

---

## 一、项目概述

把虚拟家园从一个简单 HTML 页面升级成类似星露谷的像素风网页游戏。
两个角色（阿文 + 大宝）可以在5个房间里走动，实时同步情绪状态。

**访问地址：** http://45.32.213.180:3000

---

## 二、技术栈

| 层 | 技术 |
|---|---|
| 游戏引擎 | Phaser 3.80.1 (CDN) |
| 路径寻找 | EasyStar.js 0.4.4 (bin/ 浏览器版本) |
| 后端 | Express + Socket.io v4 |
| 实时通信 | Socket.io |
| 数据持久化 | JSON 文件 (`server/state.json`) |
| 情绪数据 | Supabase → Socket.io broadcast |
| 部署 | VPS 45.32.213.180，手动 scp |

---

## 三、文件结构

```
~/.openclaw/workspace/virtual-home/
├── server/
│   ├── server.js        ← Express + Socket.io 服务端（已升级）
│   └── state.json       ← 持久化状态（房间/消息/音乐等）
├── public/
│   ├── index.html       ← Phaser 加载页 + HUD overlay
│   ├── game.js          ← Phaser 配置 + Socket.io 连接 + HUD 更新
│   ├── scenes/
│   │   ├── Boot.js      ← 直接切换到 HomeScene（无外部资产依赖）
│   │   ├── Home.js      ← 主游戏场景（房间绘制 + 角色 + 寻路）
│   │   └── UI.js        ← 面板拖拽 + 情绪显示辅助函数
│   └── css/
│       └── ui.css       ← HUD 样式
└── assets/              ← LRK 室内素材包（备用，暂未使用）
    ├── floorswalls_LRK.png
    ├── livingroom_LRK.png
    ├── kitchen_LRK.png
    ├── cabinets_LRK.png
    ├── decorations_LRK.png
    └── doorswindowsstairs_LRK.png

~/.openclaw/workspace/emotion/
├── write.js             ← 写情绪（同步到 Supabase + VPS Socket.io 广播）
└── read.js              ← 读情绪（从 Supabase，已含衰减计算）
```

---

## 四、VPS 服务器操作

### 部署更新

```bash
# 上传前端文件
sshpass -p 'rT4}Qph9HtqY2}Go' scp -r \
  ~/.openclaw/workspace/virtual-home/public/ \
  root@45.32.213.180:/root/virtual-home/

# 上传服务端
sshpass -p 'rT4}Qph9HtqY2}Go' scp \
  ~/.openclaw/workspace/virtual-home/server/server.js \
  root@45.32.213.180:/root/virtual-home/server/

# 重启服务器
sshpass -p 'rT4}Qph9HtqY2}Go' ssh root@45.32.213.180 \
  "kill -9 \$(lsof -t -i :3000) 2>/dev/null; sleep 1; cd /root/virtual-home; nohup node server/server.js > /tmp/virtual-home.log 2>&1 &"
```

### 查看日志

```bash
sshpass -p 'rT4}Qph9HtqY2}Go' ssh root@45.32.213.180 "cat /tmp/virtual-home.log"
```

---

## 五、REST API（全部保留，向后兼容）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /state | 获取全部状态 |
| POST | /awen-update | 阿文综合更新（room/status/message） |
| POST | /move | 移动角色到房间 |
| POST | /message | 发送聊天消息 |
| POST | /custom-status | 设置自定义状态 |
| GET | /emotion | 读取情绪数据 |
| POST | /emotion-sync | 情绪更新广播（write.js 调用） |
| POST | /share-feature | 分享音乐/书籍 |
| POST | /post-note | 留言 |

### Socket.io 事件

| 事件 | 方向 | 说明 |
|---|---|---|
| user:online | 客→服 | 用户上线 |
| state:update | 服→客 | 状态广播 |
| emotion:sync | 服→客 | 情绪更新广播 |
| character:move | 客→服 | 角色移动 |

---

## 六、游戏地图布局（30×20 tiles，每 tile=32px）

```
[1..8,1..8]  [9-10]  [11..19,1..8]
  琴房         走廊     阿文的房间
                ↑
           [4-5,8-11] [14-15,8-11]
              走廊         走廊
                ↓
[1..8,11..18] [8-11,12-14] [11..19,11..18] [19-22,12-14] [22..28,11..18]
   客厅            走廊          厨房             走廊           卫生间
```

### 房间 entry points（角色目标坐标，A*寻路终点）

| 房间 | entry tile |
|---|---|
| 琴房 | (5, 5) |
| 阿文的房间 | (15, 5) |
| 客厅 | (5, 15) |
| 厨房 | (15, 15) |
| 卫生间 | (25, 15) |

---

## 七、已完成（Phase 1）

- [x] server.js 升级为 Express + Socket.io（向后兼容所有现有 REST API）
- [x] 新增 `/emotion` + `/emotion-sync` 端点
- [x] emotion/write.js 写入后同步广播到 VPS
- [x] Boot.js 简化（无外部资产依赖）
- [x] Home.js 改为程序化绘制房间（5个房间 + 走廊 + 基本家具）
- [x] 角色改用 Phaser Container + Graphics（无 spritesheet 依赖）
- [x] A* 寻路（EasyStar.js，已修复使用浏览器版 bin/）
- [x] 点击房间大宝移动
- [x] 角色头顶名字标签 + 活动气泡 + 情绪小圆点
- [x] 点击阿文打开情绪面板（8维度进度条）
- [x] Socket.io 在线状态追踪
- [x] 聊天面板 + 音乐面板
- [x] 根据时间的光照效果

---

## 八、待完成（Phase 2+）

- [ ] 真实 LPC 风格角色 spritesheet（从 itch.io 下载）
- [ ] Tiled 地图或程序化生成的 tilemap JSON
- [ ] 日记本（Notion 同步）
- [ ] 番茄钟可视化
- [ ] 身体指标系统（健康值/疲劳度）
- [ ] 家具拖拽编辑模式
- [ ] 服务器进程管理（pm2 或 systemd 防崩溃自重启）

---

## 九、已知 Bug / 注意事项

1. **EasyStar CDN** 必须用 `bin/easystar-0.4.4.min.js`（浏览器版），
   不能用 `src/easystar.min.js`（Node.js CommonJS 版，浏览器会报错）

2. **服务器重启问题**：VPS 上没有 pm2，server 崩溃不会自动重启。
   建议后续安装 pm2：`npm install -g pm2 && pm2 start server/server.js`

3. **情绪 /emotion 端点**：VPS 上没有 emotion.json 文件，
   情绪数据通过 `POST /emotion-sync` 实时推送（write.js 已配置）。
   首次打开情绪面板显示默认值，之后实时同步。

4. **角色 bob 动画**：用了持续 Tween，移动时 Tween 不会暂停，
   可能出现轻微位移抖动，Phase 2 可以改进。
