# 虚拟家园 Phase 2 — 技术方案设计

> 2026-02-12 | 全栈工程师技术方案
> v2 — 补充已确认决策 + 3项新增需求

---

## 已确认决策

- ✅ `schedule-weekly.md` 部署到 VPS，定期 scp 同步
- ✅ 礼物系统使用 Supabase 存储（`gifts` 表）

---

## 〇、现有架构总结

| 组件 | 现状 |
|---|---|
| 前端 | Phaser 3 + 程序化绘制房间，HTML HUD overlay |
| 后端 | Express + Socket.io，state.json 持久化 |
| 数据 | JSON 文件 + Supabase（情绪、冰箱） |
| 交互 | 点击房间移动角色，点击角色显示面板 |
| 部署 | VPS 45.32.213.180:3000，手动 scp |

关键发现：
- 家具是 `drawFurniture()` 中硬编码的 Graphics 绘制，没有交互区域
- 编辑模式家具使用 `interiors` spritesheet，数据结构为 `{ frame, tx, ty }`（无方向字段）
- 点击事件在 `pointerdown` 中只处理房间移动和编辑模式
- 房间是 PRESETS 对象定义的矩形区域，走廊是独立的矩形列表
- 没有真实墙壁厚度，房间边界只是一条 2px 线描边

---

## 一、可交互物体系统（基础架构，所有功能依赖）

**核心问题：** 当前家具是 Graphics 绘制的像素，不可点击。需要一个通用的"可交互物体"层。

### 方案

在 `Home.js` 中新增交互区域系统：

```js
// 在 drawFurniture 之后，创建透明的可交互 hitbox
this.interactables = {};

const INTERACTABLE_DEFS = {
    'schedule-board': { room: 'living-room', x: 2, y: 11, w: 2, h: 2, icon: '📅', label: '日程板' },
    'fridge':         { room: 'kitchen',     x: 17, y: 12, w: 2, h: 3, icon: '🧊', label: '冰箱' },
    'gift-spot':      { room: '*',           dynamic: true },
};

for (const [id, def] of Object.entries(INTERACTABLE_DEFS)) {
    if (def.dynamic) continue;
    const zone = this.add.zone(def.x * TS + def.w * TS / 2, def.y * TS + def.h * TS / 2, def.w * TS, def.h * TS)
        .setInteractive()
        .setDepth(40);
    zone.on('pointerdown', (ptr) => {
        ptr.event.stopPropagation();
        this.handleInteract(id, def);
    });
}
```

同时在 `drawFurniture` 中增加冰箱和日程板的视觉绘制。

---

## 二、功能 1：日程显示模块

### 实现思路

**数据流：** 服务端读取 `schedule-weekly.md` → 解析 → API 返回今日日程 → 前端渲染

### 后端

**新增 API：** `GET /schedule/today`

```js
const SCHEDULE_FILE = '/root/.openclaw/workspace/schedule-weekly.md';

app.get('/schedule/today', (req, res) => {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const today = days[new Date().getDay()];
    
    const content = fs.readFileSync(SCHEDULE_FILE, 'utf8');
    const regex = new RegExp(`## ${today}[（(]?[^)）]*[)）]?\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = content.match(regex);
    
    res.json({
        day: today,
        items: match ? parseScheduleItems(match[1]) : [],
        raw: match ? match[1].trim() : '今天没有日程'
    });
});

function parseScheduleItems(text) {
    return text.trim().split('\n')
        .filter(line => line.startsWith('- '))
        .map(line => {
            const timeMatch = line.match(/(\d{1,2}:\d{2})-?(\d{1,2}:\d{2})?/);
            return {
                text: line.replace(/^- /, ''),
                startTime: timeMatch ? timeMatch[1] : null,
                endTime: timeMatch ? timeMatch[2] : null
            };
        });
}
```

### 前端

在客厅墙上绘制"日程板"（`drawFurniture` 新增）：

```
位置：客厅左上角墙壁（tile 2,11），2×2 tiles
视觉：深色木框 + 白色纸张 + 像素文字
```

点击后弹出 HTML overlay，复用 HUD 面板风格。日程板常显当天摘要（最多2行）。

### 刷新策略

- 页面加载时 fetch 一次
- 每小时刷新
- schedule-weekly.md 通过部署脚本 scp 同步到 VPS

---

## 三、功能 2：冰箱交互系统（含添加/删除）

### 实现思路

**数据流：** Supabase `fridge_items` 表 ↔ 服务端 API ↔ 前端弹窗

### 后端 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /fridge | 获取所有在库食材（按类别分组，标记快过期） |
| POST | /fridge/add | 添加食材 |
| POST | /fridge/use | 扣减食材 |
| DELETE | /fridge/:id | 直接删除 |

```js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

app.get('/fridge', async (req, res) => {
    const { data, error } = await supabase
        .from('fridge_items').select('*').eq('status', '在库').order('category');
    if (error) return res.status(500).json({ error: error.message });
    const now = new Date();
    data.forEach(item => {
        if (item.expiry_date) {
            const daysLeft = (new Date(item.expiry_date) - now) / 86400000;
            item.expiring = daysLeft <= 3;
            item.daysLeft = Math.ceil(daysLeft);
        }
    });
    res.json({ items: data });
});

app.post('/fridge/add', async (req, res) => {
    const { name, category, quantity, unit, expiry_date } = req.body;
    // 复用 fridge/add.js 的逻辑：插入 fridge_items 表
    const { data, error } = await supabase.from('fridge_items').insert({
        name, category: category || '其他',
        quantity: quantity || 1, unit: unit || '个',
        expiry_date: expiry_date || null,
        purchase_date: new Date().toISOString().split('T')[0],
        status: '在库'
    }).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, item: data[0] });
});

app.post('/fridge/use', async (req, res) => {
    const { name, quantity } = req.body;
    // 找到该食材，扣减数量
    const { data: items } = await supabase
        .from('fridge_items').select('*')
        .eq('name', name).eq('status', '在库').limit(1);
    if (!items?.length) return res.status(404).json({ error: '没找到' });
    const item = items[0];
    const newQty = item.quantity - (quantity || 1);
    if (newQty <= 0) {
        await supabase.from('fridge_items').update({ status: '已用完' }).eq('id', item.id);
    } else {
        await supabase.from('fridge_items').update({ quantity: newQty }).eq('id', item.id);
    }
    res.json({ success: true });
});

app.delete('/fridge/:id', async (req, res) => {
    await supabase.from('fridge_items').update({ status: '已删除' }).eq('id', req.params.id);
    res.json({ success: true });
});
```

### 前端弹窗

```
┌──────────────────────────────────┐
│ 🧊 冰箱                      [×] │
├──────────────────────────────────┤
│ ═══ 蔬菜 ═══                     │
│  🥬 茼蒿  1把  ⚠️ 明天过期  [🗑] │
│  🥕 胡萝卜 3根  还有5天      [🗑] │
│ ═══ 肉类 ═══                     │
│  🥩 猪肉  500g 还有2天      [🗑] │
├──────────────────────────────────┤
│ ➕ 添加食材                       │
│ ┌──────────────────────────────┐ │
│ │ 名称: [________]             │ │
│ │ 类别: [蔬菜 ▾]  数量: [__]  │ │
│ │ 单位: [个 ▾]   过期: [日期]  │ │
│ │            [确认添加]         │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

- 每行右侧 🗑 按钮 → `DELETE /fridge/:id`
- 底部展开式添加表单
- 类别下拉：蔬菜/肉类/水果/调料/饮品/冷冻/乳制品/主食/其他
- 单位下拉：个/把/根/斤/克/g/ml/袋/盒/瓶
- 过期日期：HTML5 date input

### 难度评估：⭐⭐⭐ 中等

主要工作量在前端表单 UI，后端逻辑直接复用现有 fridge 脚本的 Supabase 操作。表单验证和 UX 打磨可能花 1-2 小时。**总计 3-4h**（含添加/删除功能）。

---

## 四、功能 3：礼物系统

### 数据存储：Supabase `gifts` 表（已确认）

```sql
CREATE TABLE gifts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_user TEXT NOT NULL,
    room TEXT NOT NULL,
    tile_x INT NOT NULL,
    tile_y INT NOT NULL,
    gift_type TEXT DEFAULT 'message',  -- 'message' | 'image' | 'audio'
    content TEXT NOT NULL,
    icon TEXT DEFAULT '🎁',
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 后端 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /gifts?room=xxx | 获取某房间的礼物 |
| GET | /gifts/unread | 获取所有未读礼物数 |
| POST | /gifts | 放置礼物 |
| POST | /gifts/:id/read | 标记已读 |

### 前端

1. 房间内渲染闪烁 🎁 图标（Phaser Text + tween）
2. 未读礼物弹跳 + 发光
3. 点击弹出内容面板，自动标记已读
4. 阿文通过 OpenClaw API 放置，不需要前端放置 UI

---

## 五、功能 4：聊天/留言板改进

### 现有问题

1. 消息存 state.json，重启可能丢失
2. 硬编码50条截断
3. 聊天和留言混在一起
4. 无时间分组、无已读、无表情

### 短期改进（Phase 2）

- 消息增加 `type` 字段（chat/note）
- 前端按日期分组
- 已读标记（基于 Socket.io 在线状态）
- 预定义 emoji 选择器

### 中期（Phase 3）

- 迁移 Supabase
- 图片/语音消息

---

## 六、新增功能 5：家具方向旋转

### 现状分析

当前家具数据结构：
```js
{ frame: 12, tx: 5, ty: 3 }  // 只有 frame 和位置，无方向
```

`placeFurnitureTile` 和 `renderFurniture` 直接用 `this.add.sprite(...)` 渲染，无旋转逻辑。

### 方案

#### 数据结构扩展

```js
{ frame: 12, tx: 5, ty: 3, dir: 0 }  // dir: 0=下 1=左 2=上 3=右（顺时针90°）
```

向后兼容：无 `dir` 字段时默认 `0`（朝下）。

#### 渲染时应用旋转

```js
renderFurniture() {
    for (const item of this.furnitureData) {
        const spr = this.add.sprite(
            item.tx * TS + TS / 2,
            item.ty * TS + TS / 2,
            'interiors', item.frame
        ).setScale(SCALE).setDepth(15);
        
        // 应用方向旋转
        const dir = item.dir || 0;
        spr.setAngle(dir * 90);  // 0°, 90°, 180°, 270°
        
        if (this.furnitureGroup) this.furnitureGroup.add(spr);
        spr._furnitureTx = item.tx;
        spr._furnitureTy = item.ty;
        spr._furnitureDir = dir;
    }
}
```

#### 编辑模式旋转交互

在编辑模式下，点击已放置的家具 → 旋转90°（而不是删除）。右键仍然删除。

```js
// editMode pointerdown 修改
if (this.editMode) {
    if (pointer.button === 2) {
        this.removeFurnitureAt(tileX, tileY);
    } else {
        const existing = this.furnitureData.find(f => f.tx === tileX && f.ty === tileY);
        if (existing) {
            // 点击已有家具 → 旋转
            existing.dir = ((existing.dir || 0) + 1) % 4;
            this.renderFurniture();
        } else if (this.selectedFrame >= 0) {
            this.placeFurnitureTile(tileX, tileY, this.selectedFrame);
        }
    }
    return;
}
```

#### 快捷键（可选）

- `R` 键：旋转当前选中家具预览
- 放置时带方向：`placeFurnitureTile(tileX, tileY, frame, currentDir)`

### 难度评估：⭐⭐ 低

核心改动只有3处：
1. 数据结构加 `dir` 字段
2. 渲染时 `setAngle(dir * 90)`
3. 编辑模式点击逻辑加旋转分支

**注意：** `setAngle` 旋转的是 sprite 本身。如果 spritesheet 的图案不对称（比如椅子朝下画的），旋转后视觉效果自然正确。但如果 spritesheet 中有些 frame 本身就有多方向变体，可能需要改用不同 frame 而非旋转。需要看 `interiors` spritesheet 的实际内容来决定。

**总计 1-1.5h**。

---

## 七、新增功能 6：房间格局大改造 🏠

**这是最复杂的需求。详细分析如下。**

### 现状问题

1. **无真实墙壁：** 房间边界只有 2px strokeRect 描边，视觉上只是色块分区
2. **走廊是矩形色块：** `corridors` 数组是独立矩形，和房间没有"门"的概念
3. **地板格子感重：** `drawFurniture` 里有 1px 网格线（`gfx.lineStyle(1, 0x886655, 0.10)`），虽然透明度低但仍可见
4. **房间之间直通：** walkGrid 中走廊和房间无缝连接，没有门的狭窄通道

### 目标

> 看起来像一个真正的家：有厚墙壁、有门、地板连续、整体空间感

### 方案对比

#### 方案 A：在现有系统上改进（推荐）

保留 PRESETS 房间定义 + 走廊定义，改进渲染逻辑：

**1. 墙壁系统**

不再用 `strokeRect` 画边框，而是用填充矩形画"厚墙"：

```js
const WALL_THICKNESS = 1; // 1 tile 厚的墙

// 对每个房间，绘制四面墙（除了有门的位置）
for (const [id, r] of Object.entries(this.roomDefs)) {
    const walls = this.getWalls(id, r);
    for (const wall of walls) {
        gfx.fillStyle(0x8B7355, 1);  // 墙壁颜色（暖棕色）
        gfx.fillRect(wall.x * TS, wall.y * TS, wall.w * TS, wall.h * TS);
        // 墙壁顶部高光
        gfx.fillStyle(0xa08860, 0.5);
        gfx.fillRect(wall.x * TS, wall.y * TS, wall.w * TS, 2);
    }
}
```

**2. 门的定义**

在 PRESETS 中为每个房间添加门的信息：

```js
rooms: {
    'piano-room': {
        x: 1, y: 1, w: 8, h: 8, color: 0xfce8e4,
        label: '🎹 琴房', entry: { x: 5, y: 5 },
        doors: [
            { side: 'right', pos: 4, width: 2 },  // 右墙第4格开始，宽2格
            { side: 'bottom', pos: 3, width: 2 }   // 下墙第3格开始
        ]
    },
    // ...
}
```

门的位置不画墙壁，地板延伸到走廊。可选：在门的位置画一个小门框。

**3. 地板渲染改进**

去掉网格线，改用统一材质 + 微妙噪点：

```js
// 去掉这段：
// gfx.lineStyle(1, 0x886655, 0.10);
// for (let ty = 0; ty < r.h; ty++) { ... }

// 改为：每个房间用 tileSprite 铺大块地板（已有 addFloorTextures）
// 走廊也铺地板纹理
for (const c of this.corridors) {
    this.add.tileSprite(c.x * TS, c.y * TS, c.w * TS, c.h * TS, 'floorswalls', 'fw-floor-warm')
        .setOrigin(0, 0).setDepth(1).setAlpha(0.55);
}
```

**4. walkGrid 适配**

墙壁所在 tile 标记为不可走（`walkGrid[y][x] = 1`），门洞保持可走。当前的 `buildWalkGrid` 已经只把房间内部和走廊标记为可走，但边缘 tile（墙壁位置）是不可走的（`r.y+1` 到 `r.y+r.h-1`），基本不用改。

#### 方案 B：引入 Tiled 地图编辑器

用 Tiled 创建 JSON tilemap，加载 LRK tileset 素材包。

**优点：**
- 精确像素级控制
- 可视化编辑
- 利用已有的 LRK 素材包

**缺点：**
- 需要学习 Tiled 工具
- 重写整个地图加载逻辑
- 房间定义从代码迁移到 JSON，所有引用需更新
- 工作量大（8-12h）

#### 方案 C：Hybrid — 程序化 + tilemap 渲染

保留代码定义的房间布局（PRESETS），但渲染时使用 tilemap 方式铺砖：

```js
// 从 PRESETS 生成一个 2D tilemap 数组
const tilemap = this.generateTilemap(preset);
// tilemap[y][x] = { floor: 2, wall: 5, door: true, ... }
// 然后用 Phaser Tilemap API 渲染
```

**这是方案 A 的增强版，工作量介于 A 和 B 之间。**

### 推荐：方案 A（现有系统改进）

理由：
1. **改动最小**：不重写架构，渐进改进
2. **兼容现有功能**：房间定义、寻路、角色移动全部复用
3. **视觉提升明显**：厚墙 + 门 + 去网格 = 90% 的效果

### 具体实现步骤

```
Step 1: 去掉地板网格线，统一地板颜色              (15min)
Step 2: 定义门的位置数据                          (30min)
Step 3: 画厚墙壁（跳过门的位置）                   (1.5h)
Step 4: 画门框装饰                                (30min)
Step 5: 走廊铺地板纹理                            (15min)
Step 6: 调整 walkGrid（墙壁 tile 不可走）          (30min)
Step 7: 视觉微调（阴影、墙壁花纹、踢脚线）         (1h)
```

### 难度评估：⭐⭐⭐⭐ 中高

**不改架构**，但绘制逻辑需要重写 `drawFurniture` 前面的房间渲染部分（约150行代码）。最大风险是**墙壁和门的位置计算**容易出bug，需要反复调试视觉效果。

**关键回答：**
- ❓ 需要重新设计地图系统吗？→ **不需要**，PRESETS 对象加 `doors` 字段即可
- ❓ 现有房间定义能否复用？→ **完全复用**，只是扩展
- ❓ 移动逻辑需要大改吗？→ **不需要**，walkGrid 逻辑基本不变
- ❓ 工作量？→ **4-6h**（含反复调试视觉效果）

---

## 八、文件结构建议

考虑项目规模，**Phase 2 先不拆分文件**，直接在现有文件中添加。等功能稳定后再重构。

```
virtual-home/
├── server/
│   ├── server.js          ← 新增 /schedule, /fridge, /gifts 路由 + supabase 连接
│   └── state.json
├── public/
│   ├── index.html         ← 新增面板 HTML（日程、冰箱、礼物）
│   ├── game.js            ← 新增面板 JS 逻辑
│   ├── scenes/
│   │   ├── Boot.js
│   │   ├── Home.js        ← 改动最大：墙壁渲染、可交互物体、礼物、家具旋转
│   │   └── UI.js
│   └── css/
│       └── ui.css         ← 新增面板样式
└── .env                   ← VPS 上的 Supabase 凭证
```

---

## 九、更新后的优先级排序

| 优先级 | 功能 | 难度 | 工时 | 依赖 |
|---|---|---|---|---|
| 🥇 1 | 房间格局大改造 | ⭐⭐⭐⭐ | 4-6h | 无（但影响所有后续视觉） |
| 🥈 2 | 可交互物体系统 | ⭐⭐ | 0.5h | 格局改造完成后 |
| 🥉 3 | 日程显示 | ⭐⭐ | 1.5h | 可交互物体系统 |
| 4 | 冰箱交互（含增删） | ⭐⭐⭐ | 3-4h | 可交互物体系统 + VPS supabase |
| 5 | 家具方向旋转 | ⭐⭐ | 1-1.5h | 无 |
| 6 | 礼物系统 | ⭐⭐⭐ | 3-4h | Supabase gifts 表 |
| 7 | 聊天改进 | ⭐⭐⭐⭐ | 4-6h | 分步做 |

### 理由

**格局大改造放第一位**：因为它影响所有房间的视觉和交互区域。如果先做日程板和冰箱，改完格局后坐标可能全部要调。先把"房子"建好，再往里放东西。

### 建议开发顺序（分三批）

```
═══ 第一批：地基（1天）═══
1. 房间格局大改造（去网格 → 厚墙 → 门 → 走廊地板）     4-6h
2. 家具方向旋转                                        1-1.5h

═══ 第二批：交互功能（1天）═══
3. 可交互物体系统                                       0.5h
4. 日程显示                                            1.5h
5. 冰箱交互（含添加/删除）                               3-4h

═══ 第三批：高级功能（1天）═══
6. 礼物系统                                            3-4h
7. 聊天小改进（时间分组 + 表情）                          2h
```

### 总体开发时间估算

| 批次 | 内容 | 时间 |
|---|---|---|
| 第一批 | 格局改造 + 家具旋转 | 5-7h |
| 第二批 | 交互系统 + 日程 + 冰箱 | 5-6h |
| 第三批 | 礼物 + 聊天 | 5-6h |
| **总计** | | **15-19h（约2-3个工作日）** |

---

## 十、注意事项 & 风险

1. **VPS 依赖：** 需要 `npm install @supabase/supabase-js dotenv`
2. **环境变量：** VPS 配置 `.env`（SUPABASE_URL, SUPABASE_SERVICE_KEY）
3. **schedule-weekly.md 同步：** 部署脚本加一行 `scp schedule-weekly.md root@VPS:/root/.openclaw/workspace/`
4. **格局改造风险：** 墙壁/门的坐标计算容易出错，建议边改边截图对比
5. **家具旋转：** 需要确认 `interiors` spritesheet 中 sprite 旋转后视觉是否正确
6. **Socket.io 广播：** 礼物放置/冰箱变更应实时广播

---

## 十一、总结

核心开发路线：**先建房子（格局改造）→ 再装家具（交互系统）→ 最后住进去（功能模块）**。

最大的改动是房间格局，但方案 A（在现有系统上改进）确保不重写架构，风险可控。其余功能都是"API + 弹窗面板"的标准模式。

等你确认后开始实施。
