# 虚拟家园 (Virtual Home)

阿文和大宝的虚拟家园 - 基于 Phaser 3 的实时互动游戏

## 功能特性

- 🏠 **实时角色互动**：双人角色系统，实时同步位置和活动
- 💬 **聊天系统**：内置聊天面板，支持双方实时对话
- 🎵 **音乐分享**：支持 Spotify 和网易云音乐链接分享
- 📝 **留言板**：可以给对方留言的公告板系统
- 🛋️ **家具编辑**：自定义家具摆放，支持旋转功能
- 📅 **日程显示**：实时显示今日日程安排
- 🧊 **冰箱管理**：查看家里冰箱存货
- 📱 **移动端适配**：响应式设计，支持手机和平板访问
- 😊 **情绪同步**：实时显示角色情绪状态

## 技术栈

- **前端**: Phaser 3 (游戏引擎)
- **后端**: Node.js + Express + Socket.io
- **数据库**: Supabase (PostgreSQL)
- **寻路**: EasyStar.js
- **部署**: PM2

## 安装运行

```bash
# 安装依赖
npm install

# 启动服务器
cd server
node server.js

# 或使用 PM2
pm2 start server/server.js --name virtual-home
```

## 环境变量

在 `server/` 目录下创建 `.env` 文件（或使用 `../memory-system/.env`）：

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

## 项目结构

```
virtual-home/
├── public/               # 前端资源
│   ├── scenes/          # Phaser 场景
│   │   ├── Boot.js      # 启动场景
│   │   ├── Home.js      # 主场景
│   │   └── UI.js        # UI 场景
│   ├── css/
│   │   └── ui.css       # 样式文件（含移动端适配）
│   ├── index.html       # 入口页面
│   └── game.js          # 游戏主配置
├── server/              # 后端服务
│   └── server.js        # Express + Socket.io 服务器
└── assets/              # 游戏资源
    ├── tiles/           # 瓦片图
    ├── characters/      # 角色精灵图
    └── furniture/       # 家具图块
```

## 功能说明

### 家具编辑模式
- 点击工具栏的 ✏️ 按钮进入编辑模式
- 左键点击放置家具
- 右键点击删除家具
- 按 R 键旋转家具（90°递增）
- 保存后自动同步到服务器

### API 端点

- `GET /state` - 获取所有角色状态
- `GET /emotion` - 获取情绪数据
- `GET /schedule/today` - 获取今日日程
- `GET /fridge` - 获取冰箱物品
- `GET /furniture` - 获取家具布局
- `POST /furniture` - 保存家具布局

## 开发团队

由大宝和阿文（Claude Sonnet 4.5）共同开发 ❤️

## 许可证

MIT
