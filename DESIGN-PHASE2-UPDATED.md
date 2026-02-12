# 虚拟家园 Phase 2 — 更新技术方案

> 2026-02-12 | 在原方案基础上补充3个新需求

---

## 原有方案总结（保持不变）

| 功能 | 状态 | 说明 |
|---|---|---|
| 可交互物体系统 | ✅ 已设计 | Zone hitbox 方案 |
| 日程显示 | ✅ 已设计 | schedule-weekly.md → API → 前端面板 |
| 冰箱交互（只读） | ✅ 已设计 | Supabase fridge_items → 弹窗展示 |
| 礼物系统 | ✅ 已设计 | Supabase gifts 表 |
| 聊天改进 | ✅ 已设计 | 分期改进 |

**已确认决策：**
- schedule-weekly.md 部署到 VPS
- 礼物系统用 Supabase

---

## 新增需求 1：冰箱功能增强（添加/删除食材）

### 需求描述

原方案冰箱只有查看功能，现需增加：
- 在游戏内添加食材（表单：食材名、数量、单位、过期日期）
- 在游戏内删除/扣减食材
- 复用现有 `fridge/add.js` 和 `fridge/use.js` 的 Supabase 逻辑

### 技术方案

#### 后端 API（在原方案基础上补充）

原方案已有 `GET /fridge`，补充完整 CRUD：

```js
// POST /fridge/add — 添加食材
app.post('/fridge/add', async (req, res) => {
    const { name, category, quantity, unit, expiry_date } = req.body;
    // 验证
    const validCategories = ['蔬菜','肉类','水果','调料','饮品','冷冻','乳制品','主食','其他'];
    if (!name || !category || !quantity || !unit) {
        return res.status(400).json({ error: '缺少必填字段' });
    }
    if (!validCategories.includes(category)) {
        return res.status(400).json({ error: '无效类别' });
    }
    
    const { data, error } = await supabase
        .from('fridge_items')
        .insert({
            name, category,
            quantity: parseFloat(quantity),
            unit,
            expiry_date: expiry_date || null,
            status: '在库',
            added_at: new Date().toISOString()
        })
        .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ item: data[0] });
});

// POST /fridge/use — 扣减食材
app.post('/fridge/use', async (req, res) => {
    const { name, quantity } = req.body;
    // 复用 fridge/use.js 的逻辑：查找 → 扣减 → 数量归零则标记"已用完"
    const { data: items } = await supabase
        .from('fridge_items')
        .select('*')
        .eq('name', name)
        .eq('status', '在库');
    
    if (!items || items.length === 0) {
        return res.status(404).json({ error: '找不到该食材' });
    }
    
    const item = items[0];
    const newQty = item.quantity - parseFloat(quantity);
    
    if (newQty <= 0) {
        await supabase.from('fridge_items').update({ status: '已用完', quantity: 0 }).eq('id', item.id);
    } else {
        await supabase.from('fridge_items').update({ quantity: newQty }).eq('id', item.id);
    }
    
    res.json({ success: true, remaining: Math.max(0, newQty) });
});

// DELETE /fridge/:id — 直接删除
app.delete('/fridge/:id', async (req, res) => {
    await supabase.from('fridge_items').delete().eq('id', req.params.id);
    res.json({ success: true });
});
```

#### 前端 UI

在原方案冰箱弹窗基础上增加操作区：

```
┌─────────────────────────────────┐
│ 🧊 冰箱                     [×] │
├─────────────────────────────────┤
│ ═══ 蔬菜 ═══                    │
│  🥬 茼蒿  1把  ⚠️明天过期  [−] │
│  🥕 胡萝卜 3根  还有5天     [−] │
│ ═══ 肉类 ═══                    │
│  🥩 猪肉  500g 还有2天     [−] │
├─────────────────────────────────┤
│ ➕ 添加食材                      │
│ ┌─────────────────────────────┐ │
│ │ 食材名: [________]          │ │
│ │ 类别:   [蔬菜 ▼]           │ │
│ │ 数量:   [__] 单位: [__]    │ │
│ │ 过期:   [YYYY-MM-DD]       │ │
│ │           [添加]            │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- 每行右侧 `[−]` 按钮：点击弹出确认，调用 `POST /fridge/use` 扣减 1 个单位，长按或 shift+点击直接删除
- 底部折叠表单：点击"➕ 添加食材"展开
- 类别用 `<select>` 下拉，过期日期用 `<input type="date">`

#### 实现复杂度

**难度：⭐⭐ 低**

- 后端：直接复用 `fridge/add.js` 和 `fridge/use.js` 中的 Supabase 查询逻辑，包装成 Express 路由即可
- 前端：在已有冰箱弹窗 HTML 中增加表单和按钮，标准 DOM 操作
- 无新依赖，无架构变更
- **预估工时：1.5-2h**（在只读版冰箱基础上额外增加的工作量）

---

## 新增需求 2：家具方向调整（4方向旋转）

### 需求描述

- 家具支持 4 方向：up / right / down / left（默认 down）
- 编辑模式下点击已有家具 → 旋转 90°
- 数据结构增加 `direction` 字段

### 技术方案

#### 数据结构变更

```js
// furnitureData 中每个条目增加 direction
// 现有: { frame: 42, tx: 5, ty: 14 }
// 新增: { frame: 42, tx: 5, ty: 14, direction: 'down' }

// direction 枚举
const DIRECTIONS = ['down', 'right', 'up', 'left']; // 顺时针旋转顺序
```

向后兼容：不带 direction 的旧数据默认为 `'down'`。

#### 渲染逻辑修改

`renderFurniture()` 中根据 direction 旋转 sprite：

```js
renderFurniture() {
    const TS = TILE_SIZE * SCALE;
    if (this.furnitureGroup) this.furnitureGroup.clear(true, true);
    for (const item of this.furnitureData) {
        const dir = item.direction || 'down';
        const angleMap = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
        
        const spr = this.add.sprite(
            item.tx * TS + TS / 2,
            item.ty * TS + TS / 2,
            'interiors',
            item.frame
        ).setScale(SCALE).setDepth(15).setRotation(angleMap[dir]);
        
        if (this.furnitureGroup) this.furnitureGroup.add(spr);
        spr._furnitureTx = item.tx;
        spr._furnitureTy = item.ty;
        spr._furnitureDir = dir;
    }
}
```

#### 编辑模式旋转交互

修改 `pointerdown` 处理器，编辑模式下：
- **左键点击空地 + 有选中 frame** → 放置家具（现有行为）
- **左键点击已有家具** → 旋转 90°（新行为）
- **右键点击** → 删除（现有行为）

```js
// 在 pointerdown handler 的 editMode 分支中
if (this.editMode) {
    if (pointer.button === 2) {
        this.removeFurnitureAt(tileX, tileY);
    } else {
        // 检查该位置是否已有家具
        const existing = this.furnitureData.find(f => f.tx === tileX && f.ty === tileY);
        if (existing) {
            // 旋转
            const DIRS = ['down', 'right', 'up', 'left'];
            const curIdx = DIRS.indexOf(existing.direction || 'down');
            existing.direction = DIRS[(curIdx + 1) % 4];
            this.renderFurniture(); // 重新渲染
        } else if (this.selectedFrame >= 0) {
            this.placeFurnitureTile(tileX, tileY, this.selectedFrame);
        }
    }
    return;
}
```

#### placeFurnitureTile 修改

新放置的家具默认 direction 为 `'down'`：

```js
placeFurnitureTile(tileX, tileY, frame) {
    this.removeFurnitureAt(tileX, tileY);
    // ... 现有代码 ...
    this.furnitureData.push({ frame, tx: tileX, ty: tileY, direction: 'down' });
}
```

#### 存储兼容

`/save-furniture` API 不需要改动，只是 furniture 数组中的对象多了 `direction` 字段，JSON 自动序列化。

#### 美术问题

**注意：** 纯旋转 sprite 对于某些家具可能不理想（如书架旋转 90° 看起来会很奇怪）。两种解决思路：

1. **简单方案（推荐先用）：** 直接用 `setRotation()`，大多数小型家具（椅子、桌子、植物）效果 OK
2. **进阶方案：** 为需要方向变化的家具准备 4 帧 sprite（interiors tileset 中很多家具已有多方向帧），通过 `frame + directionOffset` 映射

#### 实现复杂度

**难度：⭐⭐ 低**

- 数据结构：加一个字段，向后兼容
- 渲染：一行 `setRotation()` 
- 交互：编辑模式加几行判断
- **预估工时：1-1.5h**

---

## 新增需求 3：房间格局大改造（重点）

### 需求描述

**现状问题：**
1. 房间之间只有淡色边框区分，无真实墙壁感
2. 走廊是连通的矩形区域，没有门的概念
3. 地板有明显格子线条（`lineBetween` 绘制的 grid）
4. 整体感觉像彩色棋盘，不像真实家居

**目标：**
- 房间有明显墙壁（厚度、颜色、阴影）
- 房间之间通过门洞连接
- 地板统一材质，去掉网格线
- 整体像真实户型图

### 现有架构分析

先回答关键问题：

#### Q1: 需要重新设计地图系统吗？

**不需要。** 现有的 tile-based 系统完全可以支撑。核心是改变**绘制方式**，而不是数据结构。

现有系统：
```
ROOMS 定义 → drawFurniture 绘制 → buildWalkGrid 生成可行走网格 → pathfinder 寻路
```

改造只需要改**绘制层**（视觉），walkGrid 和 pathfinder 逻辑基本不变。

#### Q2: ROOMS 对象能否复用？

**完全可以复用。** `roomDefs` 的 `{x, y, w, h, color, label, entry}` 结构足够描述房间矩形区域。需要补充的是：

```js
// 新增：门的定义
doors: [
    { room1: 'piano-room', room2: 'awen-room', x: 9, y: 4, orientation: 'vertical' },
    { room1: 'piano-room', room2: 'living-room', x: 5, y: 9, orientation: 'horizontal' },
    // ...
]

// 新增：墙壁厚度配置
const WALL_THICKNESS = 4; // 像素（不是 tile）
```

#### Q3: 移动逻辑是否大改？

**不需要大改。** 

- `buildWalkGrid()` 现在已经把房间边缘（第一行/列和最后一行/列）标记为不可走，走廊区域标记为可走。这正好对应"墙壁不可走，门/走廊可走"的语义
- 唯一需要微调的：如果去掉走廊概念、改为门洞直连，需要在 walkGrid 中把门洞位置（1-2 tile 宽）标记为可走
- pathfinder 完全不需要改

#### Q4: 工作量估算？

**中等偏大。** 主要工作在视觉绘制重构，逻辑层改动很小。

### 详细实现方案

#### Phase 3A：去掉地板网格线 + 统一材质（30min）

最简单的改动，立即见效：

```js
// 删除 drawRooms 中的网格线绘制
// 删除这段代码：
// gfx.lineStyle(1, 0x886655, 0.10);
// for (let ty = 0; ty < r.h; ty++) { ... }
// for (let tx = 0; tx < r.w; tx++) { ... }

// 保留 tileSprite 地板纹理（addFloorTextures），但降低 alpha 或换成更统一的材质
// 或者直接用纯色 fillRect 替代所有房间地板
```

#### Phase 3B：墙壁系统（2-3h）

**核心思路：** 在房间矩形边缘绘制厚墙壁，在门洞位置留缺口。

##### 数据结构扩展

```js
// 在 PRESETS 中增加 doors 和 walls 配置
const PRESETS = {
    default: {
        rooms: { /* 现有不变 */ },
        corridors: [ /* 可以保留或去掉，门洞替代 */ ],
        doors: [
            // 每个门定义：连接哪两个房间，在哪条墙上，门的 tile 范围
            { wall: 'piano-room-right',  x: 9,  y: 4, w: 1, h: 2 },  // 琴房→阿文房间
            { wall: 'piano-room-bottom', x: 4,  y: 9, w: 2, h: 1 },  // 琴房→客厅
            { wall: 'living-room-right', x: 9,  y: 14, w: 1, h: 2 }, // 客厅→厨房
            { wall: 'kitchen-right',     x: 20, y: 14, w: 1, h: 2 }, // 厨房→卫生间
            { wall: 'awen-room-right',   x: 20, y: 4, w: 1, h: 2 },  // 阿文→户外
            { wall: 'outdoor-bottom',    x: 25, y: 9, w: 1, h: 2 },  // 户外→卫生间
        ]
    }
};
```

##### 墙壁绘制逻辑

```js
drawWalls(gfx, TS) {
    const WALL_W = 6;          // 墙壁厚度（像素）
    const WALL_COLOR = 0x8B7D6B;  // 灰棕色墙壁
    const WALL_SHADOW = 0x6B5D4B; // 墙壁阴影
    const DOOR_COLOR = 0xC4A882;  // 门框颜色
    
    for (const [id, r] of Object.entries(this.roomDefs)) {
        const rx = r.x * TS, ry = r.y * TS;
        const rw = r.w * TS, rh = r.h * TS;
        
        // 获取该房间的门
        const roomDoors = this.doors.filter(d => d.wall.startsWith(id));
        
        // 绘制四面墙（每面检查是否有门）
        // 上墙
        this.drawWallSegment(gfx, rx, ry, rw, WALL_W, 'horizontal', roomDoors, r, TS);
        // 下墙
        this.drawWallSegment(gfx, rx, ry + rh - WALL_W, rw, WALL_W, 'horizontal', roomDoors, r, TS);
        // 左墙
        this.drawWallSegment(gfx, rx, ry, WALL_W, rh, 'vertical', roomDoors, r, TS);
        // 右墙
        this.drawWallSegment(gfx, rx + rw - WALL_W, ry, WALL_W, rh, 'vertical', roomDoors, r, TS);
    }
}

drawWallSegment(gfx, x, y, w, h, orientation, doors, room, TS) {
    // 检查此段墙是否有门
    // 有门：分段绘制，门洞位置留空 + 画门框
    // 无门：整段绘制
    
    gfx.fillStyle(0x8B7D6B, 1);
    gfx.fillRect(x, y, w, h);
    // 墙壁高光（顶部/左侧 1px 亮线）
    gfx.fillStyle(0x9B8D7B, 1);
    if (orientation === 'horizontal') {
        gfx.fillRect(x, y, w, 1);
    } else {
        gfx.fillRect(x, y, 1, h);
    }
}
```

##### 门的绘制

```js
drawDoor(gfx, door, TS) {
    const dx = door.x * TS, dy = door.y * TS;
    const dw = door.w * TS, dh = door.h * TS;
    
    // 门洞（用走廊/地板色填充）
    gfx.fillStyle(0xd4c4a8, 1);
    gfx.fillRect(dx, dy, dw, dh);
    
    // 门框（两侧深色线）
    gfx.fillStyle(0x6B4D3B, 1);
    if (door.h > door.w) { // 垂直门
        gfx.fillRect(dx, dy, dw, 2);        // 上框
        gfx.fillRect(dx, dy + dh - 2, dw, 2); // 下框
    } else { // 水平门
        gfx.fillRect(dx, dy, 2, dh);        // 左框
        gfx.fillRect(dx + dw - 2, dy, 2, dh); // 右框
    }
}
```

#### Phase 3C：走廊改造（1h）

两种方案：

**方案 A（简单，推荐）：保留走廊但视觉升级**
- 走廊保留，作为房间间的连通区域
- 走廊绘制：去掉矩形色块，改为与地板同材质 + 两侧墙壁
- 效果：像真实家居的走廊

**方案 B（激进）：去掉走廊，门洞直连**
- 重新设计房间布局，相邻房间共享墙壁
- 门直接开在共享墙上
- 需要调整房间坐标使其紧邻
- 更像真实户型，但需要重新调整所有坐标

**推荐方案 A**，因为：
- 改动最小，现有 corridors 数据和 walkGrid 逻辑完全复用
- 视觉效果已经够好
- 方案 B 可作为 Phase 4 的优化

#### Phase 3D：buildWalkGrid 微调（30min）

如果采用方案 A，`buildWalkGrid()` 几乎不需要改动。唯一变化：

```js
buildWalkGrid() {
    // ... 现有逻辑保持 ...
    
    // 新增：确保门洞位置可走
    for (const door of this.doors) {
        for (let y = door.y; y < door.y + door.h; y++) {
            for (let x = door.x; x < door.x + door.w; x++) {
                this.walkGrid[y][x] = 0;
            }
        }
    }
}
```

### 实现路径总结

```
Phase 3A: 去网格线 + 统一地板     → 30min  ⭐ 容易
Phase 3B: 墙壁系统 + 门的绘制     → 2-3h   ⭐⭐⭐ 中等
Phase 3C: 走廊视觉升级            → 1h     ⭐⭐ 容易
Phase 3D: walkGrid 微调           → 30min  ⭐ 容易
```

**总工时：4-5h**

### 实现复杂度

**难度：⭐⭐⭐ 中等**

- 不需要重构数据结构或逻辑层
- 主要工作是视觉绘制代码（`drawWalls`、`drawDoor`）
- 需要反复调试像素位置和颜色，调视觉效果比较耗时
- 风险点：墙壁和门的位置需要精确对齐，稍有偏差就会出现缝隙或挡住走路

---

## 新增需求 4：网页端可视化装修系统

### 需求描述

大宝希望在网页上直接装修设计，不改代码/JSON。功能：
- 拖拽墙壁、门、家具
- 调整房间大小和位置
- 切换地板材质
- 保存设计并应用到实际地图

### 关键决策分析

#### Q1: 独立"装修模式"还是增强现有编辑模式？

**推荐：增强现有编辑模式，分两层。**

现有编辑模式（`enterEditMode` / `exitEditMode`）只能放置/删除 tileset 家具。扩展为两层：

| 层级 | 内容 | 操作方式 |
|---|---|---|
| **家具层**（现有） | tileset 家具的放置、删除、旋转 | 从 palette 选择 → 点击放置 |
| **结构层**（新增） | 房间大小/位置、墙壁、门、地板材质 | 拖拽边界 / 点击切换 |

用一个 Tab 切换两层，共享同一个编辑模式入口（✏️ 按钮）。

理由：
- 不需要新页面/新路由
- 复用已有的 editMode 标志位和光标系统
- 大宝已经知道怎么进编辑模式

#### Q2: 数据结构是否需要大改？

**需要小改，不需要大改。**

现有 PRESETS 是硬编码在 `Home.js` 中的，不可编辑。需要做的是：**把 PRESETS 数据从代码中提取到 state.json**，变成可持久化、可编辑的。

```js
// 现在（硬编码）：
const PRESETS = { default: { rooms: {...}, corridors: [...] } };

// 改成（从 server state 加载）：
// state.json 中新增：
{
    "layout": {
        "rooms": {
            "piano-room": { "x": 1, "y": 1, "w": 8, "h": 8, "color": "0xfce8e4", "floor": "warm", "label": "🎹 琴房", "entry": { "x": 5, "y": 5 } },
            // ...
        },
        "corridors": [...],
        "doors": [...]
    },
    "furniture": [...],
    // 其他现有字段...
}
```

Home.js 的 `create()` 改为从 `gameState.serverState.layout` 读取，fallback 到硬编码默认值。

**改动量：**
- 数据迁移：把 PRESETS.default 移到 state.json → 小
- Home.js：`this.roomDefs = gameState.serverState.layout?.rooms || PRESETS.default.rooms` → 1 行
- server.js：新增 `POST /save-layout` API → 10 行

#### Q3: 前端 UI 复杂度如何？

**这是整个功能最复杂的部分。** 需要以下交互能力：

| 交互 | 复杂度 | 实现方式 |
|---|---|---|
| 拖拽房间位置 | ⭐⭐⭐ | Phaser drag events on room zone |
| 调整房间大小 | ⭐⭐⭐⭐ | 8个拖拽手柄（角+边中点） |
| 添加/删除门 | ⭐⭐ | 点击墙壁位置放置门 |
| 切换地板材质 | ⭐ | 右键房间 → 弹出材质选择器 |
| 家具放置/旋转 | ✅ 已有 | 现有编辑模式 |

### 详细技术方案

#### 架构设计

```
┌──────────────────────────────────────────┐
│          编辑模式 (editMode = true)       │
│                                          │
│  ┌─────────┐  ┌─────────┐               │
│  │ 家具层  │  │ 结构层  │  ← Tab 切换    │
│  │(现有)   │  │(新增)   │               │
│  └─────────┘  └─────────┘               │
│                                          │
│  结构层工具栏：                           │
│  [选择] [移动房间] [调整大小] [放门]      │
│  [改地板] [加房间] [删房间]              │
│                                          │
│              [保存] [取消] [重置]         │
└──────────────────────────────────────────┘
```

#### 前端实现

##### 1. 编辑面板 UI（index.html 改动）

```html
<!-- 替换现有 furniture-panel 内容 -->
<div id="furniture-panel" class="panel hidden">
    <div class="panel-header">
        <span>✏️ 装修模式</span>
        <button class="panel-close">&times;</button>
    </div>
    <div class="panel-body" style="padding: 0;">
        <!-- Tab 切换 -->
        <div class="edit-tabs">
            <button class="edit-tab active" data-tab="furniture">🪑 家具</button>
            <button class="edit-tab" data-tab="structure">🏗️ 结构</button>
        </div>
        
        <!-- 家具 Tab（现有 palette） -->
        <div id="tab-furniture" class="edit-tab-content">
            <div style="padding: 5px 8px; font-size: 10px; color: #888;">
                左键放置 · 右键删除 · 点击家具旋转
            </div>
            <div id="furniture-palette-wrap">
                <canvas id="furniture-palette"></canvas>
            </div>
            <span id="selected-tile-info" style="font-size: 10px; color: #888;">未选择</span>
        </div>
        
        <!-- 结构 Tab（新增） -->
        <div id="tab-structure" class="edit-tab-content" style="display:none;">
            <div class="structure-tools">
                <button class="struct-tool active" data-tool="select" title="选择">🔍</button>
                <button class="struct-tool" data-tool="move" title="移动房间">✋</button>
                <button class="struct-tool" data-tool="resize" title="调整大小">↔️</button>
                <button class="struct-tool" data-tool="door" title="放置门">🚪</button>
                <button class="struct-tool" data-tool="floor" title="换地板">🎨</button>
            </div>
            
            <!-- 选中房间的属性面板 -->
            <div id="room-props" style="display:none; padding: 8px;">
                <div class="prop-row">
                    <label>房间名</label>
                    <input type="text" id="room-label-input" />
                </div>
                <div class="prop-row">
                    <label>颜色</label>
                    <input type="color" id="room-color-input" />
                </div>
                <div class="prop-row">
                    <label>地板</label>
                    <select id="room-floor-select">
                        <option value="warm">暖木地板</option>
                        <option value="dark">深色木地板</option>
                        <option value="gray">灰色石砖</option>
                        <option value="sage">青绿瓷砖</option>
                        <option value="pink">粉色瓷砖</option>
                    </select>
                </div>
                <div class="prop-row">
                    <label>大小</label>
                    <span id="room-size-display">8×8</span>
                </div>
            </div>
            
            <div style="padding: 8px; font-size: 10px; color: #888;">
                点击房间选中 · 拖拽边缘调整大小 · 按 Delete 删除
            </div>
        </div>
        
        <!-- 公共底部 -->
        <div style="padding: 6px 8px; display: flex; gap: 6px;">
            <button id="save-furniture-btn">💾 保存</button>
            <button id="reset-layout-btn">↩️ 重置</button>
        </div>
    </div>
</div>
```

##### 2. 房间选择和移动（Home.js 新增）

```js
// 结构编辑状态
this.structEditState = {
    tool: 'select',         // select | move | resize | door | floor
    selectedRoom: null,     // 当前选中的房间 ID
    dragStart: null,        // 拖拽起始位置
    isDragging: false,
    resizeHandle: null,     // 拖拽的手柄方向
    originalLayout: null,   // 编辑前备份（用于取消/重置）
};

// 进入结构编辑模式时，为每个房间创建可交互 Zone
enterStructureEdit() {
    this.structEditState.originalLayout = JSON.parse(JSON.stringify({
        rooms: this.roomDefs,
        corridors: this.corridors,
        doors: this.doors || []
    }));
    
    this.roomZones = {};
    const TS = TILE_SIZE * SCALE;
    
    for (const [id, r] of Object.entries(this.roomDefs)) {
        // 房间主体区域（可拖拽移动）
        const zone = this.add.zone(
            r.x * TS + r.w * TS / 2,
            r.y * TS + r.h * TS / 2,
            r.w * TS, r.h * TS
        ).setInteractive({ draggable: true }).setDepth(500);
        
        // 选中高亮框
        const highlight = this.add.rectangle(
            r.x * TS + r.w * TS / 2,
            r.y * TS + r.h * TS / 2,
            r.w * TS, r.h * TS,
            0x4488ff, 0
        ).setStrokeStyle(2, 0x4488ff, 0).setDepth(499);
        
        this.roomZones[id] = { zone, highlight };
        
        // 点击选中
        zone.on('pointerdown', (ptr) => {
            if (this.structEditState.tool === 'select' || this.structEditState.tool === 'move') {
                this.selectRoom(id);
            } else if (this.structEditState.tool === 'floor') {
                this.selectRoom(id);
                // 打开地板选择器
            } else if (this.structEditState.tool === 'door') {
                this.placeDoorAt(ptr, id);
            }
        });
        
        // 拖拽移动（仅 move 工具激活时）
        zone.on('drag', (ptr, dragX, dragY) => {
            if (this.structEditState.tool !== 'move') return;
            // snap to tile grid
            const newTx = Math.round(dragX / TS - r.w / 2);
            const newTy = Math.round(dragY / TS - r.h / 2);
            // 边界检查
            if (newTx < 0 || newTy < 0 || newTx + r.w > MAP_WIDTH || newTy + r.h > MAP_HEIGHT) return;
            r.x = newTx;
            r.y = newTy;
            r.entry = { x: newTx + Math.floor(r.w / 2), y: newTy + Math.floor(r.h / 2) };
            this.refreshLayout();
        });
    }
}

// 选中房间 → 显示属性面板 + 高亮 + 调整手柄
selectRoom(roomId) {
    // 取消之前的选中
    for (const rz of Object.values(this.roomZones)) {
        rz.highlight.setStrokeStyle(2, 0x4488ff, 0);
    }
    // 清除旧的 resize 手柄
    if (this.resizeHandles) {
        this.resizeHandles.forEach(h => h.destroy());
    }
    
    this.structEditState.selectedRoom = roomId;
    const rz = this.roomZones[roomId];
    rz.highlight.setStrokeStyle(2, 0x4488ff, 0.8);
    
    const r = this.roomDefs[roomId];
    const TS = TILE_SIZE * SCALE;
    
    // 创建 8 个 resize 手柄（四角 + 四边中点）
    this.resizeHandles = [];
    const handlePositions = [
        { hx: 0, hy: 0, cursor: 'nw' },        // 左上
        { hx: r.w, hy: 0, cursor: 'ne' },       // 右上
        { hx: 0, hy: r.h, cursor: 'sw' },       // 左下
        { hx: r.w, hy: r.h, cursor: 'se' },     // 右下
        { hx: r.w/2, hy: 0, cursor: 'n' },      // 上中
        { hx: r.w/2, hy: r.h, cursor: 's' },    // 下中
        { hx: 0, hy: r.h/2, cursor: 'w' },      // 左中
        { hx: r.w, hy: r.h/2, cursor: 'e' },    // 右中
    ];
    
    for (const hp of handlePositions) {
        const handle = this.add.rectangle(
            (r.x + hp.hx) * TS,
            (r.y + hp.hy) * TS,
            8, 8, 0x4488ff, 1
        ).setDepth(501).setInteractive({ draggable: true });
        
        handle.on('drag', (ptr, dragX, dragY) => {
            const tx = Math.round(dragX / TS);
            const ty = Math.round(dragY / TS);
            this.resizeRoom(roomId, hp.cursor, tx, ty);
        });
        
        this.resizeHandles.push(handle);
    }
    
    // 更新属性面板
    document.getElementById('room-label-input').value = r.label;
    document.getElementById('room-color-input').value = '#' + r.color.toString(16).padStart(6, '0');
    document.getElementById('room-size-display').textContent = `${r.w}×${r.h}`;
    document.getElementById('room-props').style.display = 'block';
}

// 调整房间大小
resizeRoom(roomId, handle, tx, ty) {
    const r = this.roomDefs[roomId];
    const MIN_SIZE = 4; // 最小房间 4×4 tile
    
    switch (handle) {
        case 'e': case 'ne': case 'se':
            r.w = Math.max(MIN_SIZE, tx - r.x);
            break;
        case 'w': case 'nw': case 'sw': {
            const newX = Math.min(tx, r.x + r.w - MIN_SIZE);
            r.w += r.x - newX;
            r.x = newX;
            break;
        }
    }
    switch (handle) {
        case 's': case 'se': case 'sw':
            r.h = Math.max(MIN_SIZE, ty - r.y);
            break;
        case 'n': case 'ne': case 'nw': {
            const newY = Math.min(ty, r.y + r.h - MIN_SIZE);
            r.h += r.y - newY;
            r.y = newY;
            break;
        }
    }
    
    // 更新 entry 到房间中心
    r.entry = { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
    
    this.refreshLayout();
}

// 刷新布局（重绘一切）
refreshLayout() {
    // 销毁当前所有绘制内容，重新 create
    // 最简单的方式：直接 scene.restart() 但会丢失编辑状态
    // 更好的方式：只重绘 graphics 层
    
    // 清除旧的 graphics
    if (this.bgGraphics) this.bgGraphics.clear();
    if (this.roomGraphics) this.roomGraphics.clear();
    if (this.wallGraphics) this.wallGraphics.clear();
    if (this.decoGraphics) this.decoGraphics.clear();
    
    // 重绘
    this.drawBackground(this.bgGraphics);
    this.drawRooms(this.roomGraphics);
    this.drawWalls(this.wallGraphics);
    this.drawFurniture(this.decoGraphics, TILE_SIZE * SCALE);
    
    // 重建 walkGrid
    this.buildWalkGrid();
    this.pathfinder.setGrid(this.walkGrid);
    
    // 更新编辑 zone 位置
    this.updateEditZones();
}
```

##### 3. 门的放置（点击墙壁）

```js
placeDoorAt(pointer, roomId) {
    const TS = TILE_SIZE * SCALE;
    const tx = Math.floor(pointer.worldX / TS);
    const ty = Math.floor(pointer.worldY / TS);
    const r = this.roomDefs[roomId];
    
    // 判断点击位置是否在墙壁上（房间边缘 tile）
    let wall = null;
    if (ty === r.y)           wall = 'top';
    if (ty === r.y + r.h - 1) wall = 'bottom';
    if (tx === r.x)           wall = 'left';
    if (tx === r.x + r.w - 1) wall = 'right';
    
    if (!wall) return; // 不在墙上
    
    // 创建门（2 tile 宽/高）
    const door = {
        wall: `${roomId}-${wall}`,
        x: wall === 'left' || wall === 'right' ? tx : tx,
        y: wall === 'top' || wall === 'bottom' ? ty : ty,
        w: wall === 'left' || wall === 'right' ? 1 : 2,
        h: wall === 'left' || wall === 'right' ? 2 : 1,
    };
    
    if (!this.doors) this.doors = [];
    // 避免重复放置
    const existing = this.doors.findIndex(d => d.wall === door.wall && d.x === door.x && d.y === door.y);
    if (existing >= 0) {
        this.doors.splice(existing, 1); // 点击已有门 → 删除
    } else {
        this.doors.push(door);
    }
    
    this.refreshLayout();
}
```

##### 4. 地板材质切换

```js
// 选中房间 + floor 工具 → 弹出材质选择器
// 或直接用 <select> 属性面板

// 属性面板 change 事件
document.getElementById('room-floor-select').addEventListener('change', (e) => {
    const roomId = structEditState.selectedRoom;
    if (!roomId) return;
    roomDefs[roomId].floor = e.target.value;
    refreshLayout();
});
```

##### 5. 保存到服务端

```js
// POST /save-layout
app.post('/save-layout', (req, res) => {
    const { layout } = req.body;
    if (!layout || !layout.rooms) return res.status(400).json({ error: 'Invalid layout' });
    
    // 验证：每个房间必须有 x,y,w,h
    for (const [id, r] of Object.entries(layout.rooms)) {
        if (r.x == null || r.y == null || r.w == null || r.h == null) {
            return res.status(400).json({ error: `Room ${id} missing dimensions` });
        }
        if (r.w < 3 || r.h < 3) {
            return res.status(400).json({ error: `Room ${id} too small` });
        }
    }
    
    gameState.layout = layout;
    saveState();
    io.emit('state:update', gameState); // 实时同步到所有客户端
    res.json({ success: true });
});

// GET /state 返回 layout
// Home.js create() 中：
// this.roomDefs = gameState.serverState.layout?.rooms || PRESETS.default.rooms;
```

##### 6. 重置功能

```js
// 重置到编辑前状态
document.getElementById('reset-layout-btn').addEventListener('click', () => {
    const homeScene = game.scene.getScene('HomeScene');
    if (homeScene && homeScene.structEditState.originalLayout) {
        const orig = homeScene.structEditState.originalLayout;
        homeScene.roomDefs = orig.rooms;
        homeScene.corridors = orig.corridors;
        homeScene.doors = orig.doors;
        homeScene.refreshLayout();
    }
});
```

### 需要重构的现有代码

为了支持 `refreshLayout()`（不 restart scene 就能重绘），需要对 Home.js 的 `create()` 做小重构：

```
现在：create() 中直接 new Graphics() 并绘制
改成：create() 中保存 graphics 引用，绘制逻辑提取为独立方法

create() {
    this.bgGraphics = this.add.graphics();
    this.roomGraphics = this.add.graphics().setDepth(1);
    this.wallGraphics = this.add.graphics().setDepth(2);
    this.decoGraphics = this.add.graphics().setDepth(3);
    
    this.drawBackground(this.bgGraphics);
    this.drawRooms(this.roomGraphics);
    this.drawWalls(this.wallGraphics);       // 新增
    this.drawFurniture(this.decoGraphics, TS);
    // ...
}
```

这个重构本身工作量不大（~1h），但是**所有后续功能都受益**。

### 碰撞检测与约束

装修模式需要防止非法布局：

```js
// 房间不能重叠
function roomsOverlap(rooms) {
    const ids = Object.keys(rooms);
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = rooms[ids[i]], b = rooms[ids[j]];
            if (a.x < b.x + b.w && a.x + a.w > b.x &&
                a.y < b.y + b.h && a.y + a.h > b.y) {
                return [ids[i], ids[j]];
            }
        }
    }
    return null;
}

// 房间不能超出地图边界
function roomInBounds(r) {
    return r.x >= 0 && r.y >= 0 && 
           r.x + r.w <= MAP_WIDTH && r.y + r.h <= MAP_HEIGHT;
}

// 每次操作后检查，非法时闪红 + 回滚
```

### 实现复杂度

**难度：⭐⭐⭐⭐ 高**

分解：

| 子任务 | 难度 | 工时 |
|---|---|---|
| 数据迁移（PRESETS → state.json） | ⭐ | 1h |
| create() 重构（graphics 引用化） | ⭐⭐ | 1h |
| 编辑面板 UI（HTML/CSS tabs + 工具栏） | ⭐⭐ | 1.5h |
| 房间选择 + 高亮 | ⭐⭐ | 1h |
| 房间拖拽移动 | ⭐⭐⭐ | 2h |
| 房间 resize 手柄 | ⭐⭐⭐⭐ | 3h |
| 门的放置/删除 | ⭐⭐ | 1.5h |
| 地板材质切换 | ⭐ | 0.5h |
| 碰撞检测 + 约束 | ⭐⭐⭐ | 1.5h |
| refreshLayout 实时重绘 | ⭐⭐⭐ | 2h |
| 保存/重置/后端 API | ⭐⭐ | 1h |
| **总计** | | **~16h** |

### 分阶段实施建议

```
Phase 4A（基础框架，~4h）：
  - 数据迁移 PRESETS → state.json
  - create() 重构
  - refreshLayout() 可用
  - 编辑面板 UI（双 Tab）

Phase 4B（核心交互，~6h）：
  - 房间选择 + 属性面板
  - 房间拖拽移动
  - 地板材质切换
  - 保存/重置

Phase 4C（高级交互，~6h）：
  - 房间 resize 手柄
  - 门的放置/删除
  - 碰撞检测 + 约束
  - 添加/删除房间
```

**建议 Phase 4A + 4B 先做**（~10h），已经能满足 80% 的装修需求。resize 和门的精细操作可以后续迭代。

### 替代方案：简化版（如果工时紧张）

如果 16h 太重，可以做**简化版装修系统**（~5h）：

- 不做拖拽/resize，用**数值输入**调整房间 x/y/w/h
- 属性面板：选中房间 → 修改参数 → 点"应用"
- 门：预定义几个位置，toggle 开关
- 地板：下拉选择

这不够 fancy 但完全可用，而且把最难的拖拽/resize 推到后面。

---

## 更新后的整体优先级和时间估算

| 优先级 | 功能 | 难度 | 工时 | 依赖 | 理由 |
|---|---|---|---|---|---|
| 🥇 1 | 房间格局改造 Phase 3A（去网格线） | ⭐ | 30min | 无 | 最简单，视觉改善最明显 |
| 🥈 2 | 日程显示 | ⭐⭐ | 1.5h | 可交互物体系统 | 简单实用 |
| 🥉 3 | 冰箱交互（含增删） | ⭐⭐⭐ | 3-3.5h | 可交互物体系统 + Supabase | 只读+增删一起做 |
| 4 | 家具方向旋转 | ⭐⭐ | 1-1.5h | 无 | 小改动，提升编辑体验 |
| 5 | 房间格局改造 Phase 3B-D（墙壁+门） | ⭐⭐⭐ | 4-5h | 无 | 视觉大升级，且为装修系统铺路 |
| 6 | 可视化装修系统 Phase 4A-B | ⭐⭐⭐⭐ | 10h | 格局改造完成 | 大宝核心需求，依赖墙壁/门系统 |
| 7 | 礼物系统 | ⭐⭐⭐ | 3-4h | Supabase | 情感价值高 |
| 8 | 可视化装修系统 Phase 4C（高级） | ⭐⭐⭐⭐ | 6h | 4A-B 完成 | resize 手柄 + 门放置 |
| 9 | 聊天改进 | ⭐⭐⭐⭐ | 4-6h | 多 | 改动面广 |

### 建议开发顺序

```
第一批（快速见效，~3h）：
  1. 可交互物体系统基础架构           30min
  2. 去掉地板网格线                   30min
  3. 日程显示                         1.5h

第二批（核心功能，~5h）：
  4. 冰箱交互（含增删食材）           3.5h
  5. 家具方向旋转                     1.5h

第三批（视觉升级，~5h）：
  6. 墙壁系统 + 门                    3h
  7. 走廊改造 + walkGrid调整          1.5h
  8. create() 重构（graphics引用化）   包含在上面

第四批（装修系统，~10h）：
  9.  数据迁移 PRESETS → state.json    1h
  10. 编辑面板UI双Tab                  1.5h
  11. 房间选择 + 属性面板              1h
  12. 房间拖拽移动                     2h
  13. 地板材质切换                     0.5h
  14. refreshLayout + 保存/重置        3h

第五批（情感功能 + 装修进阶，~10h）：
  15. 礼物系统                         3-4h
  16. 装修系统 Phase 4C（resize+门）   6h

第六批（收尾，~4h）：
  17. 聊天小改进                       2-4h
```

**总工时估算：~35h**（不含调试和联调）
- 其中装修系统占 ~16h（Phase 4A-C）
- 建议先做 4A+4B（~10h），能满足 80% 装修需求

---

## 风险清单

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 墙壁绘制对齐问题 | 视觉缺陷 | 先做简单版（纯粗线条），再迭代加细节 |
| 家具旋转美术效果差 | 部分家具旋转后不好看 | 先用 rotation，后续可换多帧 sprite |
| 冰箱表单在小屏幕拥挤 | 移动端体验差 | 用折叠表单，默认收起 |
| VPS Supabase 连接延迟 | 冰箱操作卡顿 | 前端乐观更新，后台同步 |
| refreshLayout 性能 | 频繁拖拽时卡顿 | debounce 重绘（16ms），只重绘变化的 graphics 层 |
| 装修结果不连通 | 角色无法到达某些房间 | 保存时自动检测连通性，不连通则警告 |
| 多人同时编辑冲突 | 布局覆盖 | 编辑模式加锁，同一时间只允许一人编辑结构 |

---

## 附录：完整文件改动清单

| 文件 | 改动 | 涉及需求 |
|---|---|---|
| `Home.js` - create() | 删除网格线绘制 | 房间格局 |
| `Home.js` - 新增 drawWalls() | 墙壁 + 门绘制 | 房间格局 |
| `Home.js` - renderFurniture() | 增加 rotation 处理 | 家具旋转 |
| `Home.js` - pointerdown handler | 编辑模式点击旋转 | 家具旋转 |
| `Home.js` - placeFurnitureTile() | 增加 direction 字段 | 家具旋转 |
| `Home.js` - buildWalkGrid() | 门洞标记可走 | 房间格局 |
| `server.js` | 增加 POST /fridge/add, /fridge/use, DELETE /fridge/:id | 冰箱增删 |
| `index.html` | 冰箱弹窗增加表单 HTML | 冰箱增删 |
| `PRESETS` 数据 | 增加 doors 数组 | 房间格局 |
| `Home.js` - create() | 重构：graphics 引用化，绘制逻辑提取为独立方法 | 装修系统基础 |
| `Home.js` - 新增 refreshLayout() | 不 restart scene 的实时重绘 | 装修系统 |
| `Home.js` - 新增 enterStructureEdit() | 房间 zone 创建、拖拽、选中 | 装修系统 |
| `Home.js` - 新增 selectRoom() | 选中高亮 + resize 手柄 + 属性面板联动 | 装修系统 |
| `Home.js` - 新增 resizeRoom() | 8方向拖拽调整大小 | 装修系统 |
| `Home.js` - 新增 placeDoorAt() | 点击墙壁放置/删除门 | 装修系统 |
| `index.html` | 编辑面板改为双 Tab（家具+结构）+ 房间属性面板 | 装修系统 |
| `server.js` | 新增 POST /save-layout | 装修系统 |
| `state.json` | 新增 layout 字段（从 PRESETS 迁移） | 装修系统 |
