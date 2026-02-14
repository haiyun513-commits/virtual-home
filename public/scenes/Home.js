// ============================================
// Home Scene - Procedural room layout (no tilemap needed)
// ============================================

class HomeScene extends Phaser.Scene {
    constructor() {
        super({ key: 'HomeScene' });
        this.characters     = {};
        this.walkGrid       = null;
        this.pathfinder     = null;
        this.editMode       = false;
        this.furnitureGroup = null;
        this.editCursor     = null;
        this.selectedFrame  = -1;
        this.furnitureData  = [];
        this.currentAngle   = 0; // Current rotation angle for placing furniture (0, 90, 180, 270)
    }

    create() {
        const W = MAP_WIDTH;
        const H = MAP_HEIGHT;
        const TS = TILE_SIZE * SCALE; // 32px per tile

        // ============================================
        // Room layout presets
        // ============================================
        const PRESETS = {
            default: {
                rooms: {
                    'piano-room':  { x: 1,  y: 1, w: 8, h: 8,  color: 0xfce8e4, label: '💻 大宝的工作室', entry: { x: 5, y: 5 } },
                    'awen-room':   { x: 11, y: 1, w: 9, h: 8,  color: 0xeceef8, label: '📚 阿文的房间',   entry: { x: 15, y: 5 } },
                    'living-room': { x: 1,  y: 11,w: 13, h: 8, color: 0xfdf5e4, label: '🛋️ 客厅',         entry: { x: 7, y: 15 } },
                    'kitchen':     { x: 16, y: 11,w: 5, h: 4,  color: 0xe8f4e4, label: '🍳 厨房',         entry: { x: 18, y: 13 } },
                    'bathroom':    { x: 22, y: 11,w: 5, h: 4,  color: 0xe4eff8, label: '🚿 卫生间',       entry: { x: 24, y: 13 } },
                    'outdoor':     { x: 22, y: 1, w: 7, h: 8,  color: 0xd0e8c8, label: '🌿 外出',         entry: { x: 25, y: 4 } }
                },
                corridors: [
                    { x: 8,  y: 3,  w: 4, h: 3 },   // 工作室 ↔ 阿文房间
                    { x: 13, y: 12, w: 4, h: 3 },    // 客厅 ↔ 厨房
                    { x: 4,  y: 8,  w: 2, h: 4 },    // 工作室 ↔ 客厅
                    { x: 15, y: 8,  w: 2, h: 4 },    // 阿文房间 ↔ 客厅/厨房
                    { x: 20, y: 12, w: 3, h: 2 },    // 厨房 ↔ 卫生间
                    { x: 19, y: 3,  w: 4, h: 3 },    // 阿文房间 ↔ 外出
                    { x: 24, y: 8,  w: 2, h: 4 },    // 外出 ↔ 卫生间
                ],
                doors: [
                    { x: 9,  y: 4, w: 2, h: 1, type: 'horizontal' },  // 工作室 ↔ 阿文房间
                    { x: 5,  y: 9, w: 1, h: 2, type: 'vertical' },    // 工作室 ↔ 客厅
                    { x: 14, y: 13, w: 2, h: 1, type: 'horizontal' }, // 客厅 ↔ 厨房
                    { x: 16, y: 9, w: 1, h: 2, type: 'vertical' },    // 阿文房间 ↔ 客厅
                    { x: 21, y: 13, w: 1, h: 1, type: 'horizontal' }, // 厨房 ↔ 卫生间
                    { x: 20, y: 4, w: 2, h: 1, type: 'horizontal' },  // 阿文房间 ↔ 外出
                    { x: 25, y: 9, w: 1, h: 2, type: 'vertical' }     // 外出 ↔ 卫生间
                ]
            },
            cozy: {
                rooms: {
                    'piano-room':  { x: 1,  y: 1, w: 9, h: 10, color: 0xfce8e4, label: '💻 大宝的工作室', entry: { x: 5, y: 6 } },
                    'awen-room':   { x: 12, y: 1, w: 9, h: 10, color: 0xeceef8, label: '📚 阿文的房间',   entry: { x: 16, y: 6 } },
                    'living-room': { x: 1,  y: 13,w: 14, h: 7, color: 0xfdf5e4, label: '🛋️ 客厅',         entry: { x: 7, y: 16 } },
                    'kitchen':     { x: 17, y: 13,w: 5, h: 4,  color: 0xe8f4e4, label: '🍳 厨房',         entry: { x: 19, y: 15 } },
                    'bathroom':    { x: 22, y: 13,w: 5, h: 4,  color: 0xe4eff8, label: '🚿 卫生间',       entry: { x: 24, y: 15 } },
                    'outdoor':     { x: 22, y: 1, w: 7, h: 8,  color: 0xd0e8c8, label: '🌿 外出',         entry: { x: 25, y: 4 } }
                },
                corridors: [
                    { x: 9,  y: 3,  w: 4, h: 3 },
                    { x: 14, y: 14, w: 4, h: 2 },
                    { x: 4,  y: 10, w: 2, h: 4 },
                    { x: 15, y: 10, w: 2, h: 4 },
                    { x: 21, y: 14, w: 2, h: 2 },
                    { x: 20, y: 3,  w: 3, h: 3 },
                    { x: 24, y: 8,  w: 2, h: 4 },
                ],
                doors: [
                    { x: 10,  y: 4, w: 2, h: 1, type: 'horizontal' },
                    { x: 5,  y: 11, w: 1, h: 2, type: 'vertical' },
                    { x: 15, y: 15, w: 2, h: 1, type: 'horizontal' },
                    { x: 16, y: 11, w: 1, h: 2, type: 'vertical' },
                    { x: 22, y: 15, w: 1, h: 1, type: 'horizontal' },
                    { x: 21, y: 4, w: 2, h: 1, type: 'horizontal' },
                    { x: 25, y: 9, w: 1, h: 2, type: 'vertical' }
                ]
            }
        };

        const preset = PRESETS[window.currentLayout || 'default'];
        this.roomDefs  = preset.rooms;
        this.corridors = preset.corridors;
        this.doors     = preset.doors || [];  // 新增：加载门数据

        // ============================================
        // Draw background
        // ============================================
        const bg = this.add.graphics();
        bg.fillStyle(0xf0e4d4, 1);
        bg.fillRect(0, 0, W * TS, H * TS);

        // Draw outer floor (hallways / connecting areas)
        bg.fillStyle(0xe8d8c4, 1);
        bg.fillRect(TS, TS, (W - 2) * TS, (H - 2) * TS);

        // ============================================
        // Draw rooms
        // ============================================
        const gfx = this.add.graphics();

        for (const [id, r] of Object.entries(this.roomDefs)) {
            // Floor
            gfx.fillStyle(r.color, 1);
            gfx.fillRect(r.x * TS, r.y * TS, r.w * TS, r.h * TS);

            // Wall border (移除：改用新的墙壁渲染系统)
            // gfx.lineStyle(2, 0xc8a090, 1);
            // gfx.strokeRect(r.x * TS, r.y * TS, r.w * TS, r.h * TS);

            // Inner wall highlight
            // gfx.lineStyle(1, 0xd8b0a8, 0.5);
            // gfx.strokeRect(r.x * TS + 1, r.y * TS + 1, r.w * TS - 2, r.h * TS - 2);
        }

        // Draw corridors (Phase 3D: 添加踢脚线装饰)
        for (const c of this.corridors) {
            // 地板
            gfx.fillStyle(0xd4c4a8, 1);
            gfx.fillRect(c.x * TS, c.y * TS, c.w * TS, c.h * TS);

            // 踢脚线装饰
            gfx.lineStyle(2, 0x8B7355, 0.3);
            if (c.w > c.h) { // 水平走廊
                gfx.lineBetween(c.x * TS, c.y * TS, (c.x + c.w) * TS, c.y * TS);
                gfx.lineBetween(c.x * TS, (c.y + c.h) * TS, (c.x + c.w) * TS, (c.y + c.h) * TS);
            } else { // 垂直走廊
                gfx.lineBetween(c.x * TS, c.y * TS, c.x * TS, (c.y + c.h) * TS);
                gfx.lineBetween((c.x + c.w) * TS, c.y * TS, (c.x + c.w) * TS, (c.y + c.h) * TS);
            }
        }

        // ============================================
        // Walls and Doors (Phase 3C)
        // ============================================
        const wallGfx = this.add.graphics().setDepth(2);
        this.drawWalls(wallGfx, TS);

        const doorGfx = this.add.graphics().setDepth(3);
        this.drawDoors(doorGfx, TS);

        // ============================================
        // Floor textures (procedural, depth 1)
        // ============================================
        this.addFloorTextures(TS);

        // ============================================
        // Draw furniture (fantasy tileset sprites, depth 3)
        // ============================================
        this.drawDefaultFurniture(TS);

        // ============================================
        // Room labels
        // ============================================
        const labelStyle = {
            font: '10px monospace',
            fill: '#6a4848',
            backgroundColor: '#ffffff99',
            padding: { x: 3, y: 2 }
        };

        for (const [id, r] of Object.entries(this.roomDefs)) {
            this.add.text(
                r.x * TS + 4,
                r.y * TS + 2,
                r.label,
                labelStyle
            ).setDepth(10).setFontSize(10);
        }

        // ============================================
        // Build walkable grid
        // ============================================
        this.buildWalkGrid();

        // Setup pathfinding
        this.pathfinder = new EasyStar.js();
        this.pathfinder.setGrid(this.walkGrid);
        this.pathfinder.setAcceptableTiles([0]);
        this.pathfinder.enableDiagonals();
        this.pathfinder.disableCornerCutting();

        // ============================================
        // Furniture layer
        // ============================================
        this.furnitureGroup = this.add.group();
        this.loadFurniture();

        // ============================================
        // Interactive objects: Schedule board & Fridge
        // ============================================
        this.createInteractiveObjects(TS);

        // ============================================
        // Create characters
        // ============================================
        this.createCharacter('awen',  { x: 15 * TS, y: 5  * TS });
        this.createCharacter('dabao', { x: 5  * TS, y: 15 * TS });
        this.createCat({ x: 16 * TS, y: 6 * TS });

        // ============================================
        // Click to move (dabao only)
        // ============================================
        this.interactionHandled = false; // 交互物件点击标志
        this.input.on('pointerdown', (pointer) => {
            // 如果刚点了交互物件（冰箱/日程/家具等），不走路
            if (this.interactionHandled) {
                this.interactionHandled = false;
                return;
            }

            const tileX = Math.floor(pointer.worldX / TS);
            const tileY = Math.floor(pointer.worldY / TS);

            if (this.editMode) {
                // Don't place on palette area or while dragging palette
                if (this._palDragging) return;
                if (this._isOverPalette(pointer.worldX, pointer.worldY)) return;
                // Use 16px sub-grid for furniture placement (matches sprite native size)
                const subX = Math.floor(pointer.worldX / TILE_SIZE);
                const subY = Math.floor(pointer.worldY / TILE_SIZE);
                if (pointer.button === 2) {
                    // Remove all tiles in the selection area
                    const sw = this._selectionWidth || 1;
                    const sh = this._selectionHeight || 1;
                    for (let dr = 0; dr < sh; dr++)
                        for (let dc = 0; dc < sw; dc++)
                            this.removeFurnitureAt(subX + dc, subY + dr);
                } else if (this._selectedFrames && this._selectedFrames.length > 0) {
                    for (const { dc, dr, frame, sheet } of this._selectedFrames) {
                        this.placeFurnitureTile(subX + dc, subY + dr, frame, sheet);
                    }
                }
                return;
            }

            const room = this.getRoomAt(tileX, tileY);
            if (room && room !== this.characters.dabao?.currentRoom) {
                this.moveCharacterToRoom('dabao', room);
                fetch('/move', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user: 'dabao', room })
                });
            }
        });

        // ============================================
        // Time-based lighting
        // ============================================
        this.updateLighting();
        this.time.addEvent({ delay: 60000, callback: this.updateLighting, callbackScope: this, loop: true });

        // ============================================
        // Apply stored server state (fix race condition: fetch may resolve before scene is ready)
        // ============================================
        if (gameState.serverState && gameState.serverState.users) {
            for (const [user, data] of Object.entries(gameState.serverState.users)) {
                this.moveCharacterToRoom(user, data.room, data.activity);
            }
        }
        // Apply cat state
        if (gameState.serverState && gameState.serverState.pet) {
            const pet = gameState.serverState.pet;
            const PBT = { idle:'趴着发呆', sleeping:'zzZ', eating:'吃猫粮', playing:'玩毛线球', following_awen:'跟着阿文', wandering:'溜达', grooming:'舔毛' };
            this.moveCatToRoom(pet.room, PBT[pet.behavior]);
        }
    }

    // ----------------------------------------
    // Procedural floor patterns (seamless, no tileset needed)
    // ----------------------------------------
    addFloorTextures(TS) {
        const floorGfx = this.add.graphics().setDepth(1);

        // Room floor style: 'wood-light', 'wood-dark', 'tile-white', 'tile-blue'
        const ROOM_FLOOR = {
            'piano-room':  'wood-light',
            'awen-room':   'wood-dark',
            'living-room': 'wood-light',
            'kitchen':     'tile-white',
            'bathroom':    'tile-blue',
            'outdoor':     'grass',
        };

        for (const [id, r] of Object.entries(this.roomDefs)) {
            const style = ROOM_FLOOR[id];
            if (!style) continue;
            const rx = r.x * TS, ry = r.y * TS;
            const rw = r.w * TS, rh = r.h * TS;

            if (style === 'grass') {
                // Grass floor — natural green patches with dirt specks
                const grassColors = [0x6DB840, 0x7EC850, 0x5CA838, 0x8BD060];
                const patchSize = 8;
                for (let py = ry; py < ry + rh; py += patchSize) {
                    for (let px = rx; px < rx + rw; px += patchSize) {
                        const ci = ((px / patchSize | 0) * 7 + (py / patchSize | 0) * 13) % grassColors.length;
                        floorGfx.fillStyle(grassColors[ci], 1);
                        floorGfx.fillRect(px, py, patchSize, patchSize);
                    }
                }
                // Subtle dirt specks (deterministic positions based on room coords)
                floorGfx.fillStyle(0xA09060, 0.25);
                for (let i = 0; i < 15; i++) {
                    const dx = ((i * 37 + 11) % rw);
                    const dy = ((i * 53 + 7) % rh);
                    floorGfx.fillCircle(rx + dx, ry + dy, 2);
                }
            } else if (style.startsWith('wood')) {
                // Wood plank floor — horizontal planks with staggered joints
                const dark = style === 'wood-dark';
                const plankH = 8; // plank height in px
                const colors = dark
                    ? [0x7A654A, 0x8B7355, 0x806B4F, 0x917B5C]
                    : [0xBFA07A, 0xC4A882, 0xCAB08A, 0xB89870];

                for (let py = ry; py < ry + rh; py += plankH) {
                    const row = Math.floor((py - ry) / plankH);
                    const color = colors[row % colors.length];
                    floorGfx.fillStyle(color, 1);
                    floorGfx.fillRect(rx, py, rw, plankH);
                    // Plank gap line
                    floorGfx.fillStyle(dark ? 0x5C4A35 : 0xA08060, 0.4);
                    floorGfx.fillRect(rx, py + plankH - 1, rw, 1);
                    // Staggered vertical joints
                    const offset = (row % 2) * 40;
                    for (let jx = rx + offset; jx < rx + rw; jx += 80) {
                        floorGfx.fillRect(jx, py, 1, plankH);
                    }
                }
            } else {
                // Tile floor — grid pattern
                const blue = style === 'tile-blue';
                const tileSize = 16;
                const c1 = blue ? 0xD8E8F0 : 0xF0ECE6;
                const c2 = blue ? 0xC8DCE8 : 0xE8E2D8;
                const gap = blue ? 0xA0B8C8 : 0xCCC4B8;

                for (let ty = ry; ty < ry + rh; ty += tileSize) {
                    for (let tx = rx; tx < rx + rw; tx += tileSize) {
                        const checker = ((tx - rx) / tileSize + (ty - ry) / tileSize) % 2 === 0;
                        floorGfx.fillStyle(checker ? c1 : c2, 1);
                        floorGfx.fillRect(tx, ty, tileSize, tileSize);
                    }
                }
                // Grout lines
                floorGfx.lineStyle(1, gap, 0.5);
                for (let ty = ry; ty <= ry + rh; ty += tileSize) {
                    floorGfx.lineBetween(rx, ty, rx + rw, ty);
                }
                for (let tx = rx; tx <= rx + rw; tx += tileSize) {
                    floorGfx.lineBetween(tx, ry, tx, ry + rh);
                }
            }
        }
    }

    // ----------------------------------------
    // Fantasy tileset frame helper
    // Combined sheet: 4 packs of 768×768 stacked vertically (768×3072)
    // 48 cols × 192 rows of 16×16 frames
    // Each RPG Maker tile = 3×3 sub-tiles at 16×16
    // pack: 0=幻想室内1, 1=幻想室内2, 2=幻想室内3, 3=幻想室内4
    // ----------------------------------------
    fantasyFrame(pack, rmRow, rmCol, dx, dy) {
        return (pack * 48 + rmRow * 3 + dy) * 48 + (rmCol * 3 + dx);
    }

    // Place a rectangular sub-region from the fantasy spritesheet at native 16px scale
    // pack: which B sheet (0-3)
    // srcCol, srcRow: top-left sub-tile in 48-col grid (within that pack's 48 rows)
    // w, h: size in sub-tiles (16px each on screen)
    // tx, ty: destination game tile position (top-left anchor)
    placeRegion(pack, srcCol, srcRow, w, h, tx, ty, depth) {
        const TS = TILE_SIZE * SCALE; // 32
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const frame = (pack * 48 + srcRow + dy) * 48 + (srcCol + dx);
                this.add.sprite(
                    tx * TS + dx * 16 + 8,
                    ty * TS + dy * 16 + 8,
                    'fantasy', frame
                ).setScale(1).setDepth(depth || 3);
            }
        }
    }

    // Convenience: place full RPG Maker tile (3×3 = 48×48px) at game tile
    placeRMTile(pack, rmRow, rmCol, tx, ty, depth) {
        this.placeRegion(pack, rmCol * 3, rmRow * 3, 3, 3, tx, ty, depth);
    }

    // ----------------------------------------
    // Default furniture layout using fantasy tileset
    // placeRegion(pack, srcCol, srcRow, w, h, tx, ty)
    // Sizes match original drawFurniture dimensions
    // ----------------------------------------
    drawDefaultFurniture(TS) {
        // No default furniture — use furniture editor to place items
        this.bedTileX = 18; this.bedTileY = 4;
    }

    // ----------------------------------------
    // Build walk grid from room definitions
    // ----------------------------------------
    buildWalkGrid() {
        const W = MAP_WIDTH;
        const H = MAP_HEIGHT;

        // Init all as walls
        this.walkGrid = [];
        for (let y = 0; y < H; y++) {
            this.walkGrid[y] = new Array(W).fill(1);
        }

        // Mark rooms as walkable
        for (const r of Object.values(this.roomDefs)) {
            for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
                for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
                    if (y >= 0 && y < H && x >= 0 && x < W) {
                        this.walkGrid[y][x] = 0;
                    }
                }
            }
        }

        // Mark corridors as walkable
        for (const c of this.corridors) {
            for (let y = c.y; y < c.y + c.h; y++) {
                for (let x = c.x; x < c.x + c.w; x++) {
                    if (y >= 0 && y < H && x >= 0 && x < W) {
                        this.walkGrid[y][x] = 0;
                    }
                }
            }
        }

        // Phase 3D: 确保门洞可走
        if (this.doors) {
            for (const door of this.doors) {
                for (let y = door.y; y < door.y + door.h; y++) {
                    for (let x = door.x; x < door.x + door.w; x++) {
                        if (y >= 0 && y < H && x >= 0 && x < W) {
                            this.walkGrid[y][x] = 0;
                        }
                    }
                }
            }
        }
    }

    // ----------------------------------------
    // Create a character using pixel art sprite
    // ----------------------------------------
    createCharacter(name, pos) {
        const isAwen = name === 'awen';

        // Build a container so everything moves together
        const container = this.add.container(pos.x, pos.y).setDepth(50);

        // Shadow
        const shadow = this.add.ellipse(0, 20, 28, 8, 0x000000, 0.3);

        // Pixel art sprite (50×50, displayed at scale 1)
        const sprite = this.add.image(0, -4, 'char-' + name).setScale(1);

        container.add([shadow, sprite]);

        // Make interactive
        sprite.setInteractive();
        sprite.on('pointerdown', (ptr) => {
            ptr.event.stopPropagation();
            this.interactionHandled = true;
            const nearby = this.getEntitiesNear(container.x, container.y);
            if (nearby.length > 1) {
                this.showEntityPicker(nearby, ptr.worldX, ptr.worldY);
            } else {
                this.showCharacterPanel(name);
            }
        });

        // Name label
        const nameLabel = this.add.text(pos.x, pos.y - 26, isAwen ? '阿文' : '大宝', {
            font: '9px monospace',
            fill: '#ffffff',
            backgroundColor: isAwen ? '#5577aacc' : '#aa4466cc',
            padding: { x: 3, y: 1 }
        }).setOrigin(0.5, 1).setDepth(51);

        // Activity bubble
        const actBubble = this.add.text(pos.x, pos.y - 38, '', {
            font: '9px monospace', fill: '#3a2020',
            backgroundColor: '#ffffffee',
            padding: { x: 4, y: 2 },
            wordWrap: { width: 110 }
        }).setOrigin(0.5, 1).setDepth(52).setVisible(false);

        // Emotion dot
        const emotDot = this.add.circle(pos.x + 18, pos.y - 18, 4, 0xff88aa).setDepth(53);

        // Idle bob tween - store ref so we can stop/restart on move
        const bobTween = this.tweens.add({
            targets: container,
            y: pos.y - 2,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.characters[name] = {
            container, nameLabel, actBubble, emotDot,
            bobTween,
            // expose .x/.y via container for pathfinding
            get sprite() { return { x: container.x, y: container.y, setPosition(x,y){ container.setPosition(x,y); } }; },
            currentRoom: isAwen ? 'awen-room' : 'living-room',
            isMoving: false,
            path: [], pathIndex: 0,
            facing: 'down'
        };
    }

    // Override to handle container-based characters
    updateCharPos(char, px, py) {
        char.container.setPosition(px, py);
        char.nameLabel.setPosition(px, py - 26);
        char.actBubble.setPosition(px, py - 38);
        char.emotDot.setPosition(px + 18, py - 18);
        if (char.speechBubble && char.speechBubble.active) {
            char.speechBubble.setPosition(px, py - 50);
        }
    }

    // ----------------------------------------
    // Move character to a room (with A* pathfinding)
    // ----------------------------------------
    moveCharacterToRoom(userName, roomId, activity) {
        const char = this.characters[userName];
        if (!char) return;

        // If character is doing an action move, don't interfere
        if (char._actionInProgress) return;

        const TS = TILE_SIZE * SCALE;
        const roomDef = this.roomDefs[roomId];
        if (!roomDef) return;

        // Update activity bubble
        if (activity) {
            char.actBubble.setText(activity);
            char.actBubble.setVisible(true);
            this.time.delayedCall(6000, () => {
                if (char.actBubble) char.actBubble.setVisible(false);
            });
        }

        // Determine destination: zone target (based on activity) or room entry
        let dest = roomDef.entry;
        let zoneTarget = false;
        if (activity && this._zoneDefs) {
            const zoneMap = [
                { keywords: ['睡', '躺', '休息'], zone: 'bed' },
                { keywords: ['喝水', '咖啡', '牛奶', '热水'], zone: 'kitchen' },
                { keywords: ['洗澡', '淋浴'], zone: 'bathroom' },
                { keywords: ['厕所'], zone: 'bathroom' },
                { keywords: ['弹琴', '练琴'], zone: 'piano' },
                { keywords: ['游戏', '看剧'], zone: 'tv' },
                { keywords: ['电脑', '工作'], zone: 'computer' },
                { keywords: ['出门', '跑步', '散步', '晒太阳', '骑车', '咖啡店'], zone: 'outdoor' },
            ];
            for (const mapping of zoneMap) {
                if (mapping.keywords.some(k => activity.includes(k))) {
                    const zoneDef = this._zoneDefs[mapping.zone];
                    if (zoneDef) {
                        dest = { x: Math.floor(zoneDef.x / TS), y: Math.floor(zoneDef.y / TS) };
                        zoneTarget = true;
                    }
                    break;
                }
            }
        }

        // Skip if already at destination (same room + same tile)
        if (char._initialized) {
            const curTileX = Math.floor(char.container.x / TS);
            const curTileY = Math.floor(char.container.y / TS);
            if (char.currentRoom === roomId && curTileX === dest.x && curTileY === dest.y) return;
            // Same room but different zone target → still walk there
            if (char.currentRoom === roomId && !zoneTarget) return;
        }
        char.currentRoom = roomId;

        // First load: teleport directly, no walking animation
        if (!char._initialized) {
            char._initialized = true;
            this.teleportCharacter(userName, dest.x, dest.y);
            return;
        }

        const curTileX = Math.floor(char.container.x / TS);
        const curTileY = Math.floor(char.container.y / TS);

        if (this.pathfinder) {
            this.pathfinder.findPath(curTileX, curTileY, dest.x, dest.y, (path) => {
                if (path && path.length > 1) {
                    this.walkPath(userName, path);
                } else {
                    this.teleportCharacter(userName, dest.x, dest.y);
                }
            });
            this.pathfinder.calculate();
        } else {
            this.teleportCharacter(userName, dest.x, dest.y);
        }
    }

    // Move character to a specific action location (pixel coords), then callback
    moveCharacterToAction(userName, targetPos, activity, callback) {
        const char = this.characters[userName];
        if (!char) { if (callback) callback(); return; }

        // Lock: prevent state:update from interfering with this walk
        char._actionInProgress = true;
        // Safety timeout: clear flag after 15s in case of exception
        if (char._actionTimeout) clearTimeout(char._actionTimeout);
        char._actionTimeout = setTimeout(() => { char._actionInProgress = false; }, 15000);

        const TS = TILE_SIZE * SCALE;
        const targetTileX = Math.floor(targetPos.x / TS);
        const targetTileY = Math.floor(targetPos.y / TS);
        const destPx = targetPos.x;
        const destPy = targetPos.y;

        // Update current room based on target position
        const targetRoom = this.getRoomAt(targetTileX, targetTileY);
        if (targetRoom) {
            char.currentRoom = targetRoom;
            fetch('/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: userName, room: targetRoom })
            });
        }

        // Called when walk finishes (or immediately if no walk needed)
        const onArrival = () => {
            if (char.bobTween) { char.bobTween.stop(); char.bobTween = null; }
            this.updateCharPos(char, destPx, destPy);
            char.bobTween = this.tweens.add({
                targets: char.container, y: char.container.y - 2,
                duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
            if (activity) {
                char.actBubble.setText(activity);
                char.actBubble.setVisible(true);
                this.time.delayedCall(8000, () => {
                    if (char.actBubble) char.actBubble.setVisible(false);
                });
            }
            // Unlock: action move complete
            if (char._actionTimeout) { clearTimeout(char._actionTimeout); char._actionTimeout = null; }
            char._actionInProgress = false;
            if (callback) callback();
        };

        const curTileX = Math.floor(char.container.x / TS);
        const curTileY = Math.floor(char.container.y / TS);
        if (curTileX === targetTileX && curTileY === targetTileY) {
            onArrival();
            return;
        }

        if (this.pathfinder) {
            this.pathfinder.findPath(curTileX, curTileY, targetTileX, targetTileY, (path) => {
                if (path && path.length > 1) {
                    this.walkPath(userName, path, onArrival);
                } else {
                    onArrival();
                }
            });
            this.pathfinder.calculate();
        } else {
            onArrival();
        }
    }

    teleportCharacter(userName, tileX, tileY) {
        const char = this.characters[userName];
        if (!char) return;
        if (char.bobTween) { char.bobTween.stop(); char.bobTween = null; }
        const TS = TILE_SIZE * SCALE;
        const px = tileX * TS + TS / 2;
        const py = tileY * TS + TS / 2;
        this.updateCharPos(char, px, py);
        char.bobTween = this.tweens.add({
            targets: char.container, y: char.container.y - 2,
            duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    walkPath(userName, path, onComplete) {
        const char = this.characters[userName];
        if (!char || path.length < 2) { if (onComplete) onComplete(); return; }
        // Cancel any in-progress walk step tween
        if (char._walkTween) { char._walkTween.stop(); char._walkTween = null; }
        // Stop bob tween while walking
        if (char.bobTween) { char.bobTween.stop(); char.bobTween = null; }
        char._walkComplete = null; // discard old callback
        char.isMoving  = true;
        char.path      = path;
        char.pathIndex = 1;
        char._walkComplete = onComplete || null;
        this.walkNextStep(userName);
    }

    walkNextStep(userName) {
        const char = this.characters[userName];
        if (!char || char.pathIndex >= char.path.length) {
            if (char) {
                char.isMoving = false;
                if (char._walkComplete) {
                    const cb = char._walkComplete;
                    char._walkComplete = null;
                    cb();
                } else {
                    // Default: restart bob tween at the arrived position
                    char.bobTween = this.tweens.add({
                        targets: char.container, y: char.container.y - 2,
                        duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                    });
                }
            }
            return;
        }

        const TS   = TILE_SIZE * SCALE;
        const step = char.path[char.pathIndex];
        const tx   = step.x * TS + TS / 2;
        const ty   = step.y * TS + TS / 2;

        char._walkTween = this.tweens.add({
            targets: char.container,
            x: tx, y: ty,
            duration: 120,
            ease: 'Linear',
            onUpdate: () => {
                this.updateCharPos(char, char.container.x, char.container.y);
            },
            onComplete: () => {
                char._walkTween = null;
                char.pathIndex++;
                this.walkNextStep(userName);
            }
        });
    }

    // ----------------------------------------
    // Cat (土豆)
    // ----------------------------------------
    createCat(pos) {
        const container = this.add.container(pos.x, pos.y).setDepth(45);
        const shadow = this.add.ellipse(0, 12, 20, 6, 0x000000, 0.2);
        const sprite = this.add.image(0, -2, 'char-tudou').setScale(1);
        container.add([shadow, sprite]);

        sprite.setInteractive();
        sprite.on('pointerdown', (ptr) => {
            ptr.event.stopPropagation();
            this.interactionHandled = true;
            const nearby = this.getEntitiesNear(container.x, container.y);
            if (nearby.length > 1) {
                this.showEntityPicker(nearby, ptr.worldX, ptr.worldY);
            } else {
                this.showCatPanel();
            }
        });

        const nameLabel = this.add.text(pos.x, pos.y - 16, '土豆', {
            font: '8px monospace', fill: '#ffffff',
            backgroundColor: '#cc8844cc', padding: { x: 2, y: 1 }
        }).setOrigin(0.5, 1).setDepth(46);

        const actBubble = this.add.text(pos.x, pos.y - 26, '', {
            font: '8px monospace', fill: '#5a4020',
            backgroundColor: '#fff8eedd', padding: { x: 3, y: 1 },
            wordWrap: { width: 80 }
        }).setOrigin(0.5, 1).setDepth(47).setVisible(false);

        const bobTween = this.tweens.add({
            targets: container, y: pos.y - 1,
            duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        this.catSprite = {
            container, nameLabel, actBubble, bobTween,
            currentRoom: 'awen-room', isMoving: false,
            _initialized: false, _walkTween: null
        };
    }

    updateCatPos(px, py) {
        const cat = this.catSprite;
        if (!cat) return;
        cat.container.setPosition(px, py);
        cat.nameLabel.setPosition(px, py - 16);
        cat.actBubble.setPosition(px, py - 26);
    }

    moveCatToRoom(roomId, behaviorText) {
        const cat = this.catSprite;
        if (!cat) return;
        const TS = TILE_SIZE * SCALE;
        const roomDef = this.roomDefs[roomId];
        if (!roomDef) return;

        if (behaviorText) {
            cat.actBubble.setText(behaviorText);
            cat.actBubble.setVisible(true);
            this.time.delayedCall(5000, () => { if (cat.actBubble) cat.actBubble.setVisible(false); });
        }

        // Cat goes to an offset position so it doesn't overlap with character entry points
        const entry = roomDef.entry;
        const offsets = [{dx:1,dy:1},{dx:-1,dy:1},{dx:1,dy:-1},{dx:-1,dy:-1},{dx:2,dy:0},{dx:0,dy:2}];
        let dest = entry;
        for (const o of offsets) {
            const tx = entry.x + o.dx, ty = entry.y + o.dy;
            if (this.walkGrid && this.walkGrid[ty] && this.walkGrid[ty][tx] === 0) {
                dest = { x: tx, y: ty };
                break;
            }
        }

        // Skip if same room (unless first init)
        if (cat._initialized && cat.currentRoom === roomId) return;
        cat.currentRoom = roomId;

        if (!cat._initialized) {
            cat._initialized = true;
            this.teleportCat(dest.x, dest.y);
            return;
        }

        const curTileX = Math.floor(cat.container.x / TS);
        const curTileY = Math.floor(cat.container.y / TS);

        if (this.pathfinder) {
            this.pathfinder.findPath(curTileX, curTileY, dest.x, dest.y, (path) => {
                if (path && path.length > 1) this.walkCatPath(path);
                else this.teleportCat(dest.x, dest.y);
            });
            this.pathfinder.calculate();
        } else {
            this.teleportCat(dest.x, dest.y);
        }
    }

    teleportCat(tileX, tileY) {
        const cat = this.catSprite;
        if (!cat) return;
        if (cat.bobTween) { cat.bobTween.stop(); cat.bobTween = null; }
        const TS = TILE_SIZE * SCALE;
        const px = tileX * TS + TS / 2;
        const py = tileY * TS + TS / 2;
        this.updateCatPos(px, py);
        cat.bobTween = this.tweens.add({
            targets: cat.container, y: cat.container.y - 1,
            duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
    }

    walkCatPath(path) {
        const cat = this.catSprite;
        if (!cat || path.length < 2) return;
        if (cat._walkTween) { cat._walkTween.stop(); cat._walkTween = null; }
        if (cat.bobTween) { cat.bobTween.stop(); cat.bobTween = null; }
        cat.isMoving = true;
        cat._path = path;
        cat._pathIdx = 1;
        this.walkCatNextStep();
    }

    walkCatNextStep() {
        const cat = this.catSprite;
        if (!cat || cat._pathIdx >= cat._path.length) {
            if (cat) {
                cat.isMoving = false;
                cat.bobTween = this.tweens.add({
                    targets: cat.container, y: cat.container.y - 1,
                    duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
            }
            return;
        }
        const TS = TILE_SIZE * SCALE;
        const step = cat._path[cat._pathIdx];
        const tx = step.x * TS + TS / 2;
        const ty = step.y * TS + TS / 2;

        cat._walkTween = this.tweens.add({
            targets: cat.container, x: tx, y: ty,
            duration: 150, ease: 'Linear',
            onUpdate: () => { this.updateCatPos(cat.container.x, cat.container.y); },
            onComplete: () => { cat._walkTween = null; cat._pathIdx++; this.walkCatNextStep(); }
        });
    }

    showCatPanel() {
        const panel = document.getElementById('cat-panel');
        if (!panel) return;
        panel.classList.remove('hidden');
        this.refreshCatPanel();
    }

    // Walk dabao to a tile adjacent to the cat, then fire callback
    walkToCat(callback) {
        if (!this.catSprite) { if (callback) callback(); return; }
        const TS = TILE_SIZE * SCALE;
        const catTileX = Math.floor(this.catSprite.container.x / TS);
        const catTileY = Math.floor(this.catSprite.container.y / TS);

        // Check if dabao is already adjacent (within 1 tile)
        const dabao = this.characters.dabao;
        if (dabao) {
            const dTileX = Math.floor(dabao.container.x / TS);
            const dTileY = Math.floor(dabao.container.y / TS);
            if (Math.abs(dTileX - catTileX) <= 1 && Math.abs(dTileY - catTileY) <= 1) {
                if (callback) callback();
                return;
            }
        }

        // Find an adjacent walkable tile
        const offsets = [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0},{dx:1,dy:-1},{dx:-1,dy:-1},{dx:1,dy:1},{dx:-1,dy:1}];
        let targetTile = null;
        for (const o of offsets) {
            const tx = catTileX + o.dx;
            const ty = catTileY + o.dy;
            if (tx >= 0 && ty >= 0 && tx < MAP_WIDTH && ty < MAP_HEIGHT && this.walkGrid[ty] && this.walkGrid[ty][tx] === 0) {
                targetTile = { x: tx * TS + TS / 2, y: ty * TS + TS / 2 };
                break;
            }
        }

        if (!targetTile) {
            // No adjacent walkable tile, just callback immediately
            if (callback) callback();
            return;
        }

        this.moveCharacterToAction('dabao', targetTile, null, callback);
    }

    refreshCatPanel() {
        const pet = gameState.serverState?.pet;
        if (!pet) return;

        // Age
        const ageEl = document.getElementById('pet-profile-age');
        if (ageEl) {
            const age = pet.age !== undefined ? pet.age : 0;
            ageEl.textContent = '已收养 ' + age + ' 天';
        }

        // Mood card
        if (pet.mood) {
            const moodCard = document.getElementById('pet-mood-card');
            if (moodCard) moodCard.style.background = pet.mood.color;
            const moodEmoji = document.getElementById('pet-mood-emoji-big');
            if (moodEmoji) moodEmoji.textContent = pet.mood.emoji;
            const moodText = document.getElementById('pet-mood-text');
            if (moodText) moodText.textContent = pet.mood.text;
        }

        // Gradient need bars
        const vitalsEl = document.getElementById('cat-vitals');
        if (vitalsEl && pet.vitals) {
            const bars = [
                { key: 'hunger', label: '饱食', icon: '🍖', cssClass: '' },
                { key: 'energy', label: '精力', icon: '⚡', cssClass: 'energy' },
                { key: 'happiness', label: '心情', icon: '💕', cssClass: 'happiness' },
                { key: 'cleanliness', label: '清洁', icon: '✨', cssClass: 'cleanliness' }
            ];
            vitalsEl.innerHTML = bars.map(b => {
                const val = Math.round(pet.vitals[b.key] || 0);
                return '<div class="pet-need-row">' +
                    '<span class="pet-need-icon">' + b.icon + '</span>' +
                    '<span class="pet-need-label">' + b.label + '</span>' +
                    '<div class="pet-need-bar-wrap">' +
                    '<div class="pet-need-bar ' + b.cssClass + '" style="width:' + val + '%"></div></div>' +
                    '<span class="pet-need-value">' + val + '</span></div>';
            }).join('');
        }

        // Behavior + room
        const behaviorEl = document.getElementById('cat-behavior');
        if (behaviorEl) {
            const PBT = { idle:'趴着发呆', sleeping:'睡觉中 zzZ', eating:'在吃猫粮', playing:'在玩毛线球', following_awen:'跟着阿文', wandering:'到处溜达', grooming:'在舔毛' };
            const roomNames = { 'awen-room':'阿文房间', 'living-room':'客厅', 'kitchen':'厨房', 'piano-room':'琴房', 'bathroom':'卫生间' };
            behaviorEl.textContent = (PBT[pet.behavior] || pet.behavior) + ' · ' + (roomNames[pet.room] || pet.room);
        }
    }

    // ----------------------------------------
    // Get all interactive entities near a position (for overlap click detection)
    // ----------------------------------------
    getEntitiesNear(px, py, threshold) {
        threshold = threshold || 48;
        const entities = [];
        for (const [name, char] of Object.entries(this.characters)) {
            const dx = char.container.x - px;
            const dy = char.container.y - py;
            if (Math.sqrt(dx * dx + dy * dy) < threshold) {
                entities.push({ type: 'character', name: name, label: name === 'awen' ? '📚 阿文' : '💻 大宝' });
            }
        }
        if (this.catSprite) {
            const dx = this.catSprite.container.x - px;
            const dy = this.catSprite.container.y - py;
            if (Math.sqrt(dx * dx + dy * dy) < threshold) {
                entities.push({ type: 'cat', name: 'tudou', label: '🐱 土豆' });
            }
        }
        return entities;
    }

    // ----------------------------------------
    // Show entity picker popup when multiple entities overlap
    // ----------------------------------------
    showEntityPicker(entities, worldX, worldY) {
        // Remove existing picker
        let picker = document.getElementById('entity-picker');
        if (picker) picker.remove();

        picker = document.createElement('div');
        picker.id = 'entity-picker';

        picker.innerHTML = entities.map(e =>
            '<div class="picker-option" data-type="' + e.type + '" data-name="' + e.name + '">' + e.label + '</div>'
        ).join('');

        // Position near click relative to game container
        const canvas = document.querySelector('canvas');
        const rect = canvas.getBoundingClientRect();
        const cam = this.cameras.main;
        const screenX = (worldX - cam.scrollX) * cam.zoom + rect.left;
        const screenY = (worldY - cam.scrollY) * cam.zoom + rect.top;

        picker.style.left = Math.min(screenX, window.innerWidth - 120) + 'px';
        picker.style.top = Math.max(screenY - 10, 10) + 'px';
        document.body.appendChild(picker);

        const self = this;
        picker.querySelectorAll('.picker-option').forEach(opt => {
            opt.addEventListener('click', () => {
                picker.remove();
                if (opt.dataset.type === 'cat') {
                    self.showCatPanel();
                } else {
                    self.showCharacterPanel(opt.dataset.name);
                }
            });
        });

        // Close on click outside (delayed to avoid immediate trigger)
        setTimeout(() => {
            const closeHandler = (e) => {
                if (!picker.contains(e.target)) {
                    picker.remove();
                    document.removeEventListener('pointerdown', closeHandler);
                }
            };
            document.addEventListener('pointerdown', closeHandler);
        }, 100);
    }

    // ----------------------------------------
    // Get room ID at tile position
    // ----------------------------------------
    getRoomAt(tileX, tileY) {
        for (const [id, r] of Object.entries(this.roomDefs)) {
            if (tileX >= r.x && tileX < r.x + r.w &&
                tileY >= r.y && tileY < r.y + r.h) {
                return id;
            }
        }
        return null;
    }

    // ----------------------------------------
    // Show character info panel
    // ----------------------------------------
    showCharacterPanel(name) {
        const panel        = document.getElementById('char-panel');
        const panelName    = document.getElementById('panel-name');
        const emotionBars  = document.getElementById('emotion-bars');
        const towardEl     = document.getElementById('toward-display');
        if (!panel) return;

        panelName.textContent = name === 'awen' ? '阿文' : '大宝';
        panel.classList.remove('hidden');

        if (name === 'awen') {
            const render = (data) => {
                gameState.emotionData = data;
                this.renderEmotionBars(emotionBars, data);
                if (towardEl) towardEl.textContent = `toward: ${data.toward || '亲近'}`;
            };
            if (gameState.emotionData) {
                render(gameState.emotionData);
            } else {
                fetch('/emotion').then(r => r.json()).then(render).catch(() => {
                    if (emotionBars) emotionBars.innerHTML = '<div class="no-data">暂无数据</div>';
                });
            }
        } else {
            if (emotionBars) emotionBars.innerHTML = '<div class="no-data">大宝的状态神秘莫测</div>';
            if (towardEl) towardEl.textContent = '';
        }
    }

    renderEmotionBars(container, data) {
        if (!container || !data) return;
        const emotions = [
            { key: 'calm',        label: '平静', color: '#88aacc' },
            { key: 'happiness',   label: '开心', color: '#88cc88' },
            { key: 'excitement',  label: '兴奋', color: '#cccc44' },
            { key: 'sadness',     label: '低落', color: '#6688aa' },
            { key: 'nervousness', label: '紧张', color: '#aa88cc' },
            { key: 'irritation',  label: '烦躁', color: '#cc8844' },
            { key: 'heartache',   label: '心酸', color: '#cc6688' },
            { key: 'anger',       label: '生气', color: '#cc4444' }
        ];
        container.innerHTML = emotions.map(e => {
            const val = data[e.key] || 0;
            const pct = (val / 5) * 100;
            return `<div class="emo-row">
                <span class="emo-label">${e.label}</span>
                <div class="emo-bar-bg"><div class="emo-bar-fill" style="width:${pct}%;background:${e.color}"></div></div>
            </div>`;
        }).join('');
    }

    // ----------------------------------------
    // Time-based lighting overlay
    // ----------------------------------------
    updateLighting() {
        const hour = new Date().getHours();
        let tint  = 0xffffff, alpha = 0;

        if (hour >= 21 || hour < 5) {
            tint = 0x2244aa; alpha = 0.25;
        } else if (hour >= 18 && hour < 21) {
            tint = 0xddaa66; alpha = 0.12;
        } else if (hour >= 5 && hour < 7) {
            tint = 0xaabbaa; alpha = 0.08;
        }

        const cw = MAP_WIDTH  * TILE_SIZE * SCALE;
        const ch = MAP_HEIGHT * TILE_SIZE * SCALE;

        if (!this.lightOverlay) {
            this.lightOverlay = this.add.rectangle(cw / 2, ch / 2, cw * 2, ch * 2, tint, alpha)
                .setDepth(200).setScrollFactor(0);
        } else {
            this.lightOverlay.setFillStyle(tint, alpha);
        }
    }

    // ----------------------------------------
    // Furniture system
    // ----------------------------------------
    loadFurniture() {
        fetch('/state')
            .then(r => r.json())
            .then(state => {
                this.furnitureData = state.furniture || [];
                this.renderFurniture();
                // Apply saved zone positions
                if (state.zones) this.applyZonePositions(state.zones);
            })
            .catch(() => { this.furnitureData = []; });
    }

    // Reposition zone markers/zones to saved positions
    applyZonePositions(zones) {
        if (!zones || !this._zoneObjects) return;
        for (const [id, pos] of Object.entries(zones)) {
            const obj = this._zoneObjects[id];
            if (!obj || pos.x == null || pos.y == null) continue;
            obj.def.x = pos.x;
            obj.def.y = pos.y;
            obj.marker.setPosition(pos.x, pos.y);
            obj.emojiLabel.setPosition(pos.x - 6, pos.y - 16);
            obj.zone.setPosition(pos.x, pos.y);
        }
    }

    // Collect current zone positions for saving
    getZonePositions() {
        const positions = {};
        if (!this._zoneObjects) return positions;
        for (const [id, obj] of Object.entries(this._zoneObjects)) {
            positions[id] = { x: Math.round(obj.def.x), y: Math.round(obj.def.y) };
        }
        return positions;
    }

    renderFurniture() {
        if (this.furnitureGroup) this.furnitureGroup.clear(true, true);
        for (const item of this.furnitureData) {
            const sheetKey = item.sheet || 'fantasy';
            // Position on 16px sub-grid (native tile size)
            const spr = this.add.sprite(
                item.tx * TILE_SIZE + TILE_SIZE / 2,
                item.ty * TILE_SIZE + TILE_SIZE / 2,
                sheetKey,
                item.frame
            ).setScale(1).setDepth(15);

            // Apply rotation if angle is specified
            if (item.angle) {
                spr.setAngle(item.angle);
            }

            if (this.furnitureGroup) this.furnitureGroup.add(spr);
            spr._furnitureTx = item.tx;
            spr._furnitureTy = item.ty;
            spr._furnitureAngle = item.angle || 0;
        }
    }

    placeFurnitureTile(tileX, tileY, frame, sheetKey) {
        this.removeFurnitureAt(tileX, tileY);
        const sheet = sheetKey || 'fantasy';
        // Position on 16px sub-grid (native tile size)
        const spr = this.add.sprite(
            tileX * TILE_SIZE + TILE_SIZE / 2,
            tileY * TILE_SIZE + TILE_SIZE / 2,
            sheet,
            frame
        ).setScale(1).setDepth(15);

        // Apply current rotation angle
        if (this.currentAngle !== 0) {
            spr.setAngle(this.currentAngle);
        }

        if (this.furnitureGroup) this.furnitureGroup.add(spr);
        spr._furnitureTx = tileX;
        spr._furnitureTy = tileY;
        spr._furnitureAngle = this.currentAngle;

        // Save with rotation angle and sheet key
        const item = { frame, tx: tileX, ty: tileY };
        if (sheet !== 'fantasy') item.sheet = sheet;
        if (this.currentAngle !== 0) {
            item.angle = this.currentAngle;
        }
        this.furnitureData.push(item);
    }

    removeFurnitureAt(tileX, tileY) {
        if (!this.furnitureGroup) return;
        const toRemove = this.furnitureGroup.getChildren().filter(
            spr => spr._furnitureTx === tileX && spr._furnitureTy === tileY
        );
        toRemove.forEach(spr => this.furnitureGroup.remove(spr, true, true));
        this.furnitureData = this.furnitureData.filter(
            item => !(item.tx === tileX && item.ty === tileY)
        );
    }

    // ----------------------------------------
    // Update character activity bubble
    // ----------------------------------------
    setCharacterActivity(name, text) {
        const char = this.characters[name];
        if (!char) return;
        char.actBubble.setText(text);
        char.actBubble.setVisible(true);
        this.time.delayedCall(8000, () => {
            if (char.actBubble) char.actBubble.setVisible(false);
        });
    }

    // ----------------------------------------
    // Speech bubble (体征触发的说话气泡)
    // ----------------------------------------
    showSpeechBubble(name, text, duration = 8000) {
        const char = this.characters[name];
        if (!char) return;

        // 如果已有说话气泡，先销毁
        if (char.speechBubble) {
            char.speechBubble.destroy();
            char.speechBubble = null;
        }

        const px = char.container.x;
        const py = char.container.y - 50;

        const bubble = this.add.text(px, py, `💬 ${text}`, {
            font: 'bold 10px monospace',
            fill: '#4a3030',
            backgroundColor: '#fff3e0ee',
            padding: { x: 6, y: 3 },
            wordWrap: { width: 130 }
        }).setOrigin(0.5, 1).setDepth(55);

        char.speechBubble = bubble;

        // 浮上动画
        this.tweens.add({
            targets: bubble,
            y: py - 8,
            alpha: { from: 0, to: 1 },
            duration: 300,
            ease: 'Back.easeOut'
        });

        // 定时消失
        this.time.delayedCall(duration, () => {
            if (bubble && bubble.active) {
                this.tweens.add({
                    targets: bubble,
                    alpha: 0,
                    duration: 500,
                    onComplete: () => { bubble.destroy(); }
                });
            }
            if (char.speechBubble === bubble) char.speechBubble = null;
        });
    }

    // ----------------------------------------
    // Interactive objects (schedule board + fridge)
    // ----------------------------------------
    createInteractiveObjects(TS) {
        // Schedule board in living room (on the wall, top-left area)
        const schedGfx = this.add.graphics().setDepth(4);
        const sbx = 7 * TS, sby = 11 * TS + 4;
        // Board background
        schedGfx.fillStyle(0xf5e6d0, 1);
        schedGfx.fillRect(sbx, sby, TS * 2, TS * 2 - 4);
        schedGfx.lineStyle(2, 0x8c6048, 1);
        schedGfx.strokeRect(sbx, sby, TS * 2, TS * 2 - 4);
        // Lines on board
        schedGfx.lineStyle(1, 0xc8a888, 0.6);
        for (let i = 1; i <= 3; i++) {
            schedGfx.lineBetween(sbx + 4, sby + i * 12, sbx + TS * 2 - 4, sby + i * 12);
        }
        // Pin
        schedGfx.fillStyle(0xcc4444, 1);
        schedGfx.fillCircle(sbx + TS, sby + 4, 3);
        // Label
        this.add.text(sbx + 4, sby + 2, '📋', { font: '10px monospace' }).setDepth(5);

        // Schedule board interactive zone
        const schedZone = this.add.zone(sbx + TS, sby + TS - 2, TS * 2, TS * 2 - 4)
            .setInteractive({ useHandCursor: true }).setDepth(5);
        schedZone.on('pointerdown', (ptr) => {
            if (this.editMode) return;
            ptr.event.stopPropagation();
            this.interactionHandled = true;
            this.showSchedulePopup();
        });

        // Fridge interactive zone (kitchen)
        const fridgeX = 18 * TS, fridgeY = 12 * TS + 6;
        const fridgeZone = this.add.zone(fridgeX + TS, fridgeY + TS * 1.5 + 4, TS * 2, TS * 3 + 8)
            .setInteractive({ useHandCursor: true }).setDepth(5);
        fridgeZone.on('pointerdown', (ptr) => {
            if (this.editMode) return;
            ptr.event.stopPropagation();
            this.interactionHandled = true;
            this.showFridgePopup();
        });

        // ====== Phase 2: 模拟人生交互对象 (data-driven, draggable in edit mode) ======
        const roomCenter = (roomId, offX, offY) => {
            const r = this.roomDefs[roomId];
            if (!r) return { x: 0, y: 0 };
            return {
                x: (r.x + r.w / 2 + (offX || 0)) * TS,
                y: (r.y + r.h / 2 + (offY || 0)) * TS
            };
        };

        const bath = roomCenter('bathroom');
        const kit = roomCenter('kitchen');
        const lr = this.roomDefs['living-room'];
        const ar = this.roomDefs['awen-room'];
        const pr = this.roomDefs['piano-room'];
        const od = this.roomDefs['outdoor'];

        // Zone definitions: id → config
        this._zoneDefs = {
            bathroom: { x: bath.x, y: bath.y, w: 3*TS, h: 2*TS, icon: '🚿',
                title: '🚿 浴室', desc: '洗个澡恢复卫生值',
                actions: [{ label: '洗澡', action: 'shower', icon: '🚿' }, { label: '上厕所', action: 'toilet', icon: '🚽' }] },
            tv: { x: (lr.x+3)*TS, y: (lr.y+2)*TS, w: 3*TS, h: 2*TS, icon: '📺',
                title: '📺 客厅娱乐', desc: '放松一下',
                actions: [{ label: '看剧', action: 'tv', icon: '📺' }, { label: '打游戏', action: 'game', icon: '🎮' }] },
            bed: { x: (ar.x+ar.w-2.5)*TS, y: (ar.y+2)*TS, w: 3*TS, h: 3*TS, icon: '🛏️',
                title: '🛏️ 床', desc: '休息一下',
                actions: [{ label: '睡觉', action: 'sleep', icon: '😴' }] },
            kitchen: { x: kit.x, y: kit.y, w: 3*TS, h: 2*TS, icon: '🍳',
                title: '🍳 厨房', desc: '做点吃的或喝的',
                actions: [{ label: '做饭', action: 'cook', icon: '🍳' }, { label: '喝水', action: 'drink_water', icon: '💧' }, { label: '泡咖啡', action: 'drink_coffee', icon: '☕' }] },
            piano: { x: (pr.x+2)*TS, y: (pr.y+2)*TS, w: 3*TS, h: 2*TS, icon: '🎹',
                title: '🎹 钢琴', desc: '来弹首曲子',
                actions: [{ label: '认真练琴', action: 'piano_serious', icon: '🎵' }, { label: '随便弹弹', action: 'piano_casual', icon: '🎶' }] },
            computer: { x: (pr.x+5)*TS, y: (pr.y+2)*TS, w: 3*TS, h: 2*TS, icon: '💻',
                title: '💻 电脑', desc: '打开电脑',
                actions: [{ label: '玩电脑', action: 'computer_play', icon: '🎮' }, { label: '工作', action: 'computer_work', icon: '📊' }] },
            outdoor: { x: (od.x+od.w/2)*TS, y: (od.y+od.h/2)*TS, w: 4*TS, h: 3*TS, icon: '🚪',
                title: '🌿 出门', desc: '出去走走',
                actions: [{ label: '跑步', action: 'outdoor_run', icon: '🏃' }, { label: '散步', action: 'outdoor_walk', icon: '🚶' }, { label: '晒太阳', action: 'outdoor_sun', icon: '☀️' },
                    { label: '去超市', action: 'outdoor_market', icon: '🛒' }, { label: '坐地铁', action: 'outdoor_subway', icon: '🚇' }, { label: '去学校', action: 'outdoor_school', icon: '🏫' }] },
        };

        // Create zones with markers — positions will be updated from server state
        this._zoneObjects = {};
        for (const [id, def] of Object.entries(this._zoneDefs)) {
            const marker = this.add.circle(def.x, def.y, 5, 0xff6b6b, 0.7).setDepth(50);
            this.tweens.add({ targets: marker, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });
            const emojiLabel = this.add.text(def.x - 6, def.y - 16, def.icon, { fontSize: '10px' }).setDepth(50);

            const zone = this.add.zone(def.x, def.y, def.w, def.h)
                .setInteractive({ useHandCursor: true }).setDepth(5);
            zone.on('pointerdown', (ptr) => {
                if (this.editMode) return;
                ptr.event.stopPropagation();
                this.interactionHandled = true;
                this.showActionPopup(def.title, def.desc, def.actions, { x: def.x, y: def.y });
            });

            this._zoneObjects[id] = { marker, emojiLabel, zone, def };
        }

        // 🧊 Fridge marker
        const fridgeMarker = this.add.circle(fridgeX + TS, fridgeY + TS * 1.5, 4, 0xff6b6b, 0.7).setDepth(50);
        this.tweens.add({ targets: fridgeMarker, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });

        // 📋 Schedule marker
        const schedMarker = this.add.circle(sbx + TS, sby + TS, 4, 0xff6b6b, 0.7).setDepth(50);
        this.tweens.add({ targets: schedMarker, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });

        // 📱 Takeout phone (living room right wall)
        const phoneX = 11 * TS, phoneY = 11 * TS + 4;
        // Phone visual (small wall-mounted phone)
        const phoneGfx = this.add.graphics().setDepth(4);
        phoneGfx.fillStyle(0x444444, 1);
        phoneGfx.fillRoundedRect(phoneX, phoneY, TS * 1.2, TS * 1.5, 4);
        phoneGfx.fillStyle(0x66ccff, 1);
        phoneGfx.fillRoundedRect(phoneX + 4, phoneY + 4, TS * 1.2 - 8, TS - 4, 2);
        this.add.text(phoneX + 6, phoneY + 4, '📱', { font: '12px monospace' }).setDepth(5);
        this.add.text(phoneX + 2, phoneY + TS + 2, '外卖', { font: '8px sans-serif', color: '#ffffff' }).setDepth(5);

        const phoneZone = this.add.zone(phoneX + TS * 0.6, phoneY + TS * 0.75, TS * 1.5, TS * 2)
            .setInteractive({ useHandCursor: true }).setDepth(5);
        phoneZone.on('pointerdown', (ptr) => {
            if (this.editMode) return;
            ptr.event.stopPropagation();
            this.interactionHandled = true;
            this.showTakeoutPopup();
        });
        const phoneMarker = this.add.circle(phoneX + TS * 0.6, phoneY + TS * 0.75, 4, 0xff6b6b, 0.7).setDepth(50);
        this.tweens.add({ targets: phoneMarker, alpha: 0.3, duration: 800, yoyo: true, repeat: -1 });
    }

    showSchedulePopup() {
        const popup = document.getElementById('schedule-popup');
        const content = document.getElementById('schedule-content');
        if (!popup || !content) return;
        content.innerHTML = '<div class="no-data">加载中...</div>';
        popup.classList.remove('hidden');

        fetch('/schedule/today')
            .then(r => r.json())
            .then(data => {
                if (!data.items || data.items.length === 0) {
                    content.innerHTML = `<div class="schedule-day">${data.day || '今天'}</div><div class="no-data">今天没课，自由安排！🎉</div>`;
                } else {
                    content.innerHTML = `<div class="schedule-day">📅 ${data.day}</div>` +
                        data.items.map(item => `<div class="schedule-item">• ${item}</div>`).join('');
                }
            })
            .catch(() => {
                content.innerHTML = '<div class="no-data">加载失败</div>';
            });
    }

    showFridgePopup() {
        const popup = document.getElementById('fridge-popup');
        const content = document.getElementById('fridge-content');
        if (!popup || !content) return;
        content.innerHTML = '<div class="no-data">加载中...</div>';
        popup.classList.remove('hidden');

        fetch('/fridge')
            .then(r => r.json())
            .then(data => {
                if (!data.grouped || Object.keys(data.grouped).length === 0) {
                    content.innerHTML = '<div class="no-data">冰箱空空如也 🥲</div>';
                    return;
                }
                const categoryEmoji = { '蔬菜': '🥬', '肉类': '🥩', '水果': '🍎', '调料': '🧂', '饮品': '🥤', '冷冻': '🧊', '乳制品': '🥛', '主食': '🍚', '其他': '📦' };
                let html = '';
                for (const [cat, items] of Object.entries(data.grouped)) {
                    const emoji = categoryEmoji[cat] || '📦';
                    html += `<div class="fridge-category">${emoji} ${cat}</div>`;
                    for (const item of items) {
                        const expiryClass = item.expiring ? 'fridge-expiring' : '';
                        let expiryText = '';
                        if (item.daysLeft !== null) {
                            if (item.daysLeft <= 0) expiryText = '<span class="fridge-warn">⚠️ 已过期!</span>';
                            else if (item.daysLeft <= 3) expiryText = `<span class="fridge-warn">⚠️ ${item.daysLeft}天后过期</span>`;
                            else expiryText = `<span class="fridge-ok">${item.daysLeft}天</span>`;
                        }
                        html += `<div class="fridge-item ${expiryClass}">
                            <span class="fridge-name">${item.name}</span>
                            <span class="fridge-qty">${item.quantity}${item.unit}</span>
                            ${expiryText}
                        </div>`;
                    }
                }
                content.innerHTML = html;
            })
            .catch(() => {
                content.innerHTML = '<div class="no-data">加载失败</div>';
            });
    }

    // ----------------------------------------
    // Takeout popup (外卖面板)
    // ----------------------------------------
    showTakeoutPopup() {
        const popup = document.getElementById('takeout-popup');
        const statusEl = document.getElementById('takeout-status');
        const menuEl = document.getElementById('takeout-menu');
        if (!popup || !menuEl) return;

        statusEl.innerHTML = '';
        menuEl.innerHTML = '<div class="no-data">加载中...</div>';
        popup.classList.remove('hidden');

        // Check delivery status + load menu in parallel
        Promise.all([
            fetch('/state/light').then(r => r.json()),
            fetch('/takeout/menu').then(r => r.json())
        ]).then(([state, menuData]) => {
            // Show delivery status if active
            if (state.delivery && state.delivery.active) {
                const arrive = new Date(state.delivery.arriveAt);
                const now = new Date();
                const remainMin = Math.max(0, Math.round((arrive - now) / 60000));
                const who = state.delivery.orderer === 'dabao' ? '大宝' : '阿文';
                statusEl.innerHTML = `
                    <div class="takeout-delivery-status">
                        <div class="delivery-active">🛵 外卖配送中</div>
                        <div class="delivery-info">${who}点的 <b>${state.delivery.restaurant}</b> ${state.delivery.dish}</div>
                        <div class="delivery-info">💰 $${state.delivery.cost} · 约${remainMin}分钟到</div>
                    </div>`;
                menuEl.innerHTML = '<div class="no-data">外卖已在路上，等送到再点哦</div>';
                return;
            }

            if (state.cooking && state.cooking.active) {
                statusEl.innerHTML = `
                    <div class="takeout-delivery-status">
                        <div class="delivery-active">🍳 阿文在做饭</div>
                        <div class="delivery-info">${state.cooking.recipe}，再等等吧</div>
                    </div>`;
                menuEl.innerHTML = '<div class="no-data">阿文在做饭呢，先不点了</div>';
                return;
            }

            // Render menu
            const tierNames = { fast: '🍔 快餐', casual: '🍜 正餐', upscale: '✨ 高档' };
            const grouped = {};
            menuData.restaurants.forEach(r => {
                const tier = r.tier;
                if (!grouped[tier]) grouped[tier] = [];
                grouped[tier].push(r);
            });

            let html = '';
            for (const [tier, restaurants] of Object.entries(grouped)) {
                html += `<div class="takeout-tier">${tierNames[tier] || tier}</div>`;
                for (const r of restaurants) {
                    html += `<div class="takeout-restaurant">
                        <div class="takeout-r-header">
                            <span class="takeout-r-name">${r.name}</span>
                            <span class="takeout-r-price">${r.priceRange}</span>
                            <span class="takeout-r-time">~${r.deliveryMin}min</span>
                        </div>
                        <div class="takeout-dishes">`;
                    for (const dish of r.dishes) {
                        html += `<button class="takeout-dish-btn" data-restaurant="${r.name}" data-dish="${dish}">${dish}</button>`;
                    }
                    html += `</div></div>`;
                }
            }
            menuEl.innerHTML = html;

            // Bind click handlers
            menuEl.querySelectorAll('.takeout-dish-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const restaurant = btn.dataset.restaurant;
                    const dish = btn.dataset.dish;
                    this.orderTakeout(restaurant, dish);
                });
            });
        }).catch(() => {
            menuEl.innerHTML = '<div class="no-data">加载失败</div>';
        });
    }

    orderTakeout(restaurant, dish) {
        const statusEl = document.getElementById('takeout-status');
        const menuEl = document.getElementById('takeout-menu');

        menuEl.innerHTML = '<div class="no-data">下单中...</div>';

        fetch('/order-takeout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurant, dish, orderer: 'dabao' })
        })
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    let msg = '下单失败';
                    if (data.error === 'already_ordered') msg = `已经点过了！${data.restaurant} 的外卖还在路上`;
                    else if (data.error === 'already_cooking') msg = '阿文在做饭呢，等他做完再点';
                    menuEl.innerHTML = `<div class="no-data">${msg}</div>`;
                    return;
                }
                const arriveTime = new Date(data.arriveAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                statusEl.innerHTML = `
                    <div class="takeout-delivery-status">
                        <div class="delivery-active">✅ 下单成功！</div>
                        <div class="delivery-info">🏪 ${data.restaurant} · ${data.dish}</div>
                        <div class="delivery-info">💰 $${data.cost} · 约${data.deliveryMin}分钟 · 预计${arriveTime}到</div>
                    </div>`;
                menuEl.innerHTML = '';
            })
            .catch(() => {
                menuEl.innerHTML = '<div class="no-data">网络错误</div>';
            });
    }

    // ----------------------------------------
    // Phase 2: Action popup (模拟人生交互)
    // ----------------------------------------
    showActionPopup(title, desc, actions, targetPos) {
        const popup = document.getElementById('action-popup');
        const titleEl = document.getElementById('action-popup-title');
        const descEl = document.getElementById('action-popup-desc');
        const btnsEl = document.getElementById('action-popup-buttons');
        if (!popup) return;

        titleEl.textContent = title;
        btnsEl.innerHTML = '';

        // 角色选择行
        let selectedChar = 'dabao'; // 默认大宝（玩家）
        const charRow = document.createElement('div');
        charRow.className = 'action-char-toggle';
        const dabaoBtn = document.createElement('button');
        dabaoBtn.className = 'char-toggle-btn active';
        dabaoBtn.textContent = '大宝';
        const awenBtn = document.createElement('button');
        awenBtn.className = 'char-toggle-btn';
        awenBtn.textContent = '阿文';
        dabaoBtn.onclick = () => {
            selectedChar = 'dabao';
            dabaoBtn.classList.add('active');
            awenBtn.classList.remove('active');
        };
        awenBtn.onclick = () => {
            selectedChar = 'awen';
            awenBtn.classList.add('active');
            dabaoBtn.classList.remove('active');
        };
        charRow.appendChild(dabaoBtn);
        charRow.appendChild(awenBtn);

        descEl.innerHTML = '';
        descEl.appendChild(charRow);
        const descText = document.createElement('div');
        descText.textContent = desc;
        descText.style.marginTop = '6px';
        descEl.appendChild(descText);

        for (const act of actions) {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.textContent = `${act.icon} ${act.label}`;
            btn.onclick = () => {
                popup.classList.add('hidden');
                gameState.currentUser = selectedChar;
                // Move character to the action location first, then execute
                if (targetPos) {
                    this.moveCharacterToAction(selectedChar, targetPos, act.label, () => {
                        this.executeAction(act.action);
                    });
                } else {
                    this.executeAction(act.action);
                }
            };
            btnsEl.appendChild(btn);
        }

        popup.classList.remove('hidden');
    }

    executeAction(action) {
        // 大宝的操作：只更新状态栏，不影响体征
        if (gameState.currentUser === 'dabao') {
            this.executeDabaoAction(action);
            return;
        }

        const SERVER = '';  // same origin

        if (action === 'cook') {
            this.showCookingPanel();
            return;
        }
        if (action === 'drink_water') {
            fetch(SERVER + '/drink', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drink: '水', from_fridge: false })
            });
            return;
        }
        if (action === 'drink_coffee') {
            fetch(SERVER + '/drink', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drink: '咖啡', from_fridge: true })
            });
            return;
        }

        // Outdoor actions → update room + activity
        const outdoorDesc = {
            outdoor_run: '出门跑步', outdoor_walk: '出门散步', outdoor_sun: '出门晒太阳',
            outdoor_market: '去超市买东西', outdoor_subway: '坐地铁出门', outdoor_school: '去学校'
        };
        if (outdoorDesc[action]) {
            fetch(SERVER + '/awen-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ room: 'outdoor', status: outdoorDesc[action] })
            });
            return;
        }

        // Generic action (shower, toilet, sleep, game, tv)
        fetch(SERVER + '/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
        });
    }

    executeDabaoAction(action) {
        if (action === 'cook') {
            this.showCookingPanel();
            return;
        }
        const desc = {
            shower: '洗澡中', toilet: '上厕所', sleep: '在阿文床上躺着',
            game: '玩游戏', tv: '看剧', drink_water: '喝水', drink_coffee: '喝咖啡',
            piano_serious: '认真练琴', piano_casual: '随便弹弹',
            computer_play: '玩电脑', computer_work: '在工作',
            outdoor_run: '出门跑步', outdoor_walk: '出门散步', outdoor_sun: '晒太阳',
            outdoor_market: '去超市', outdoor_subway: '坐地铁', outdoor_school: '去学校'
        };
        const rooms = {
            shower: 'bathroom', toilet: 'bathroom', sleep: 'awen-room',
            game: 'living-room', tv: 'living-room', drink_water: 'kitchen', drink_coffee: 'kitchen',
            piano_serious: 'piano-room', piano_casual: 'piano-room',
            computer_play: 'piano-room', computer_work: 'piano-room',
            outdoor_run: 'outdoor', outdoor_walk: 'outdoor', outdoor_sun: 'outdoor',
            outdoor_market: 'outdoor', outdoor_subway: 'outdoor', outdoor_school: 'outdoor'
        };

        fetch('/custom-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: 'dabao', status: desc[action] || '在忙', room: rooms[action] || 'living-room' })
        });
    }

    // ----------------------------------------
    // Cooking panel: fetch recipes, pick one, start cooking
    // ----------------------------------------
    showCookingPanel() {
        const popup = document.getElementById('action-popup');
        const titleEl = document.getElementById('action-popup-title');
        const descEl = document.getElementById('action-popup-desc');
        const btnsEl = document.getElementById('action-popup-buttons');
        if (!popup) return;

        titleEl.textContent = '🍳 做饭';
        descEl.innerHTML = '<div style="color:#a07060;font-size:11px;">正在查看冰箱...</div>';
        btnsEl.innerHTML = '';
        popup.classList.remove('hidden');

        const isAwen = gameState.currentUser === 'awen';

        fetch('/cook/suggest')
            .then(r => r.json())
            .then(data => {
                btnsEl.innerHTML = '';
                if (!data.available || data.total === 0) {
                    descEl.innerHTML = '<div style="color:#c06050;font-size:11px;">冰箱里没有食材能做菜 😢</div>';
                    // 点外卖按钮
                    const orderBtn = document.createElement('button');
                    orderBtn.className = 'action-btn';
                    orderBtn.textContent = '🛵 点外卖';
                    orderBtn.onclick = () => {
                        popup.classList.add('hidden');
                        if (isAwen) {
                            fetch('/order-takeout', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({})
                            });
                        } else {
                            fetch('/custom-status', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user: 'dabao', status: '点外卖', room: 'living-room' })
                            });
                        }
                    };
                    btnsEl.appendChild(orderBtn);
                    return;
                }

                // 合并所有菜品
                const all = [
                    ...(data.available.simple || []),
                    ...(data.available.medium || []),
                    ...(data.available.complex || [])
                ];
                descEl.innerHTML = `<div style="color:#6a8a60;font-size:11px;">可做 ${all.length} 道菜（5分钟）</div>`;

                for (const recipe of all) {
                    const btn = document.createElement('button');
                    btn.className = 'action-btn';
                    btn.style.textAlign = 'left';
                    const stars = '⭐'.repeat(recipe.satisfaction || 1);
                    btn.innerHTML = `<span>${recipe.name}</span> <span style="font-size:10px;color:#a08060;">${recipe.ingredients.join('+')} ${stars}</span>`;
                    btn.onclick = () => {
                        popup.classList.add('hidden');
                        if (isAwen) {
                            fetch('/cook/start', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ recipe: recipe.name })
                            });
                        } else {
                            fetch('/custom-status', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user: 'dabao', status: `在做${recipe.name}`, room: 'kitchen' })
                            });
                        }
                    };
                    btnsEl.appendChild(btn);
                }

                // 也可以点外卖
                const orderBtn = document.createElement('button');
                orderBtn.className = 'action-btn';
                orderBtn.style.opacity = '0.7';
                orderBtn.textContent = '🛵 不想做了，点外卖';
                orderBtn.onclick = () => {
                    popup.classList.add('hidden');
                    if (isAwen) {
                        fetch('/order-takeout', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({})
                        });
                    } else {
                        fetch('/custom-status', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user: 'dabao', status: '点外卖', room: 'living-room' })
                        });
                    }
                };
                btnsEl.appendChild(orderBtn);
            })
            .catch(() => {
                descEl.innerHTML = '<div style="color:#c06050;font-size:11px;">加载失败</div>';
            });
    }

    // Update palette highlight rectangle during drag selection
    _updatePalHighlight() {
        if (this.paletteHighlight) this.paletteHighlight.destroy();
        const TS = this._palTS;
        const s = this._palSelStart;
        const e = this._palSelEnd;
        const c1 = Math.min(s.col, e.col);
        const r1 = Math.min(s.row, e.row);
        const c2 = Math.max(s.col, e.col);
        const r2 = Math.max(s.row, e.row);
        const w = (c2 - c1 + 1) * TS;
        const h = (r2 - r1 + 1) * TS;
        const x = this._palContentX + c1 * TS + w / 2;
        const y = this._palContentY + r1 * TS + h / 2;
        this.paletteHighlight = this.add.rectangle(x, y, w, h)
            .setStrokeStyle(2, 0xffff00, 1)
            .setFillStyle(0xffff00, 0.15)
            .setDepth(253);
        this.paletteContainer.add(this.paletteHighlight);
    }

    // Finalize palette selection: compute frames array and update cursor
    _finalizePalSelection() {
        const s = this._palSelStart;
        const e = this._palSelEnd;
        const c1 = Math.min(s.col, e.col);
        const r1 = Math.min(s.row, e.row);
        const c2 = Math.max(s.col, e.col);
        const r2 = Math.max(s.row, e.row);

        const sheetKey = this._currentSheetKey || 'fantasy';
        this._selectedFrames = [];
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
                const frame = sheetKey === 'park'
                    ? r * this._srcCols + c
                    : (this.palettePack * this._srcRows + r) * this._srcCols + c;
                this._selectedFrames.push({ dc: c - c1, dr: r - r1, frame, sheet: sheetKey });
            }
        }

        this._selectionWidth = c2 - c1 + 1;
        this._selectionHeight = r2 - r1 + 1;

        // Resize edit cursor to match selection
        const S = TILE_SIZE;
        if (this.editCursor) {
            this.editCursor.setSize(this._selectionWidth * S, this._selectionHeight * S);
        }

        const info = document.getElementById('selected-tile-info');
        if (info) {
            const n = this._selectedFrames.length;
            const label = sheetKey === 'park' ? '户外' : `Pack${this.palettePack + 1}`;
            info.textContent = n === 1
                ? `${label} #${this._selectedFrames[0].frame}`
                : `${label} ${this._selectionWidth}×${this._selectionHeight} (${n})`;
        }
    }

    // Check if world coordinates are over the palette area (accounting for drag offset)
    _isOverPalette(wx, wy) {
        if (!this.paletteContainer) return false;
        const ox = this.paletteContainer.x;
        const oy = this.paletteContainer.y;
        return wx >= this._palBounds.left + ox && wx <= this._palBounds.right + ox &&
               wy >= this._palBounds.top + oy && wy <= this._palBounds.bottom + oy;
    }

    enterEditMode() {
        this.editMode = true;
        this.currentAngle = 0;
        this.palettePack = 0;
        this._palDragging = false;
        this._palSelecting = false;
        this._selectedFrames = [];
        this._selectionWidth = 1;
        this._selectionHeight = 1;
        this._currentSheetKey = 'fantasy';

        // Cursor matches selection size (starts at 1×1 tile = 16×16)
        const S = TILE_SIZE;
        this.editCursor = this.add.rectangle(S / 2, S / 2, S, S, 0xffff00, 0.25)
            .setStrokeStyle(2, 0xffff00, 0.8)
            .setDepth(300)
            .setVisible(false);

        this.game.canvas.addEventListener('contextmenu', this._ctxHandler = e => e.preventDefault());

        // Make zone markers draggable in edit mode
        this._draggingZone = null;
        if (this._zoneObjects) {
            for (const [id, obj] of Object.entries(this._zoneObjects)) {
                // Enlarge hit area for easier grabbing
                obj.marker.setRadius(8).setAlpha(1).setInteractive({ useHandCursor: true });
                obj.marker._zoneId = id;
                obj.marker.on('pointerdown', (ptr) => {
                    ptr.event.stopPropagation();
                    this.interactionHandled = true;
                    this._draggingZone = id;
                });
            }
        }

        this.input.on('pointermove', this._onEditMove = (ptr) => {
            // Handle zone marker dragging
            if (this._draggingZone) {
                const obj = this._zoneObjects[this._draggingZone];
                if (obj) {
                    obj.def.x = ptr.worldX;
                    obj.def.y = ptr.worldY;
                    obj.marker.setPosition(ptr.worldX, ptr.worldY);
                    obj.emojiLabel.setPosition(ptr.worldX - 6, ptr.worldY - 16);
                    obj.zone.setPosition(ptr.worldX, ptr.worldY);
                }
                return;
            }
            // Handle palette dragging
            if (this._palDragging) {
                this.paletteContainer.setPosition(
                    ptr.worldX - this._palDragOffX,
                    ptr.worldY - this._palDragOffY
                );
                return;
            }
            // Handle palette drag-selection
            if (this._palSelecting) {
                const ox = this.paletteContainer ? this.paletteContainer.x : 0;
                const oy = this.paletteContainer ? this.paletteContainer.y : 0;
                const localX = ptr.worldX - this._palContentX - ox;
                const localY = ptr.worldY - this._palContentY - oy;
                const col = Math.max(0, Math.min(this._srcCols - 1, Math.floor(localX / this._palTS)));
                const row = Math.max(0, Math.min(this._srcRows - 1, Math.floor(localY / this._palTS)));
                this._palSelEnd = { col, row };
                this._updatePalHighlight();
                return;
            }
            if (!this.editCursor) return;
            if (this._isOverPalette(ptr.worldX, ptr.worldY)) {
                this.editCursor.setVisible(false);
                return;
            }
            const tx = Math.floor(ptr.worldX / S);
            const ty = Math.floor(ptr.worldY / S);
            const sw = (this._selectionWidth || 1) * S;
            const sh = (this._selectionHeight || 1) * S;
            this.editCursor.setPosition(tx * S + sw / 2, ty * S + sh / 2);
            this.editCursor.setVisible(true);
        });

        this.input.on('pointerup', this._onEditUp = () => {
            this._draggingZone = null;
            if (this._palSelecting) {
                this._palSelecting = false;
                this._finalizePalSelection();
            }
            this._palDragging = false;
        });

        this._rotateKey = this.input.keyboard.on('keydown-R', () => {
            this.currentAngle = (this.currentAngle + 90) % 360;
        });

        // Build Phaser in-canvas palette (RenderTexture, no scrolling needed)
        this.buildPalette();

        const btn = document.getElementById('edit-mode-btn');
        if (btn) btn.classList.add('active');

        // Wire up HTML category buttons to switch pack
        this._catClickHandler = (e) => {
            document.querySelectorAll('.fcat-btn').forEach(x => x.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const packVal = e.currentTarget.dataset.pack;
            if (packVal === 'park') {
                this._currentSheetKey = 'park';
                this._srcCols = 24;
                this._srcRows = 16;
                this.palettePack = 0;
            } else {
                this._currentSheetKey = 'fantasy';
                this._srcCols = 48;
                this._srcRows = 48;
                this.palettePack = parseInt(packVal);
            }
            this.rebuildPaletteTiles();
        };
        document.querySelectorAll('.fcat-btn').forEach(b => {
            b.addEventListener('click', this._catClickHandler);
        });
    }

    // Create palette using RenderTexture — shows original spritesheet layout at 0.5 scale
    buildPalette() {
        const CW = MAP_WIDTH * TILE_SIZE * SCALE;   // 960
        const CH = MAP_HEIGHT * TILE_SIZE * SCALE;   // 640
        const S = TILE_SIZE;                         // 16

        // Display full 48-col spritesheet in original layout at half scale
        const SRC_COLS = 48;
        const SRC_ROWS = 48;                         // per pack
        const PAL_SCALE = 0.5;
        const TS = S * PAL_SCALE;                    // 8px displayed per tile
        const PAD = 4;
        const HANDLE_H = 14;                         // drag handle height

        const contentW = SRC_COLS * TS;              // 384
        const contentH = SRC_ROWS * TS;              // 384
        const palW = contentW + PAD * 2;             // 392
        const palX = CW - palW;                      // 568
        const contentY = Math.floor((CH - contentH) / 2) + HANDLE_H; // below handle

        this._palScale = PAL_SCALE;
        this._palTS = TS;
        this._srcCols = SRC_COLS;
        this._srcRows = SRC_ROWS;
        this._palContentX = palX + PAD;
        this._palContentY = contentY;

        // Palette bounds (relative to container origin, for hit testing)
        this._palBounds = {
            left: palX,
            right: palX + palW,
            top: contentY - HANDLE_H,
            bottom: contentY + contentH
        };

        this.paletteContainer = this.add.container(0, 0).setDepth(250).setScrollFactor(0);

        // Semi-transparent background (covers handle + content area)
        const totalH = HANDLE_H + contentH + PAD;
        const bgCenterY = contentY - HANDLE_H + totalH / 2;
        const bg = this.add.rectangle(palX + palW / 2, bgCenterY, palW, totalH, 0x000000, 0.75);
        this.paletteContainer.add(bg);

        // Drag handle bar at top
        const handleY = contentY - HANDLE_H;
        const handle = this.add.rectangle(palX + palW / 2, handleY + HANDLE_H / 2, palW, HANDLE_H, 0x555555, 0.9)
            .setInteractive({ useHandCursor: true })
            .setDepth(255);
        this.paletteContainer.add(handle);
        const handleLabel = this.add.text(palX + palW / 2, handleY + HANDLE_H / 2, '≡ 拖动移动', {
            font: '9px sans-serif', color: '#bbb'
        }).setOrigin(0.5).setDepth(256);
        this.paletteContainer.add(handleLabel);

        // Drag setup
        handle.on('pointerdown', (ptr) => {
            this._palDragging = true;
            this._palDragOffX = ptr.worldX - this.paletteContainer.x;
            this._palDragOffY = ptr.worldY - this.paletteContainer.y;
            ptr.event.stopPropagation();
            this.interactionHandled = true;
        });

        // RenderTexture: draw tiles at native 16px, display at 0.5 scale
        this._palRT = this.add.renderTexture(
            this._palContentX, contentY, SRC_COLS * S, SRC_ROWS * S
        ).setOrigin(0, 0).setScale(PAL_SCALE).setDepth(251);
        this.paletteContainer.add(this._palRT);

        // Interactive zone over displayed area for click detection
        this._palZone = this.add.zone(
            this._palContentX + contentW / 2,
            contentY + contentH / 2,
            contentW, contentH
        ).setInteractive({ useHandCursor: true }).setDepth(252);
        this.paletteContainer.add(this._palZone);

        this._palZone.on('pointerdown', (ptr) => {
            ptr.event.stopPropagation();
            this.interactionHandled = true;
            // Start drag-selection
            const ox = this.paletteContainer.x;
            const oy = this.paletteContainer.y;
            const localX = ptr.worldX - this._palContentX - ox;
            const localY = ptr.worldY - this._palContentY - oy;
            const col = Math.floor(localX / TS);
            const row = Math.floor(localY / TS);
            if (col >= 0 && col < SRC_COLS && row >= 0 && row < SRC_ROWS) {
                this._palSelecting = true;
                this._palSelStart = { col, row };
                this._palSelEnd = { col, row };
                this._updatePalHighlight();
            }
        });

        this.paletteHighlight = null;
        this._paletteTileSprites = [];
        this.rebuildPaletteTiles();
    }

    // Redraw RenderTexture for current pack
    rebuildPaletteTiles() {
        if (!this._palRT) return;
        this._palRT.clear();
        const S = TILE_SIZE;
        const sheetKey = this._currentSheetKey || 'fantasy';
        const SRC_COLS = this._srcCols;
        const SRC_ROWS = this._srcRows;
        for (let row = 0; row < SRC_ROWS; row++) {
            for (let col = 0; col < SRC_COLS; col++) {
                const frame = sheetKey === 'park'
                    ? row * SRC_COLS + col
                    : (this.palettePack * SRC_ROWS + row) * SRC_COLS + col;
                this._palRT.drawFrame(sheetKey, frame, col * S, row * S);
            }
        }
        if (this.paletteHighlight) {
            this.paletteHighlight.destroy();
            this.paletteHighlight = null;
        }
    }

    exitEditMode() {
        this.editMode = false;
        this.currentAngle = 0;
        if (this.editCursor) { this.editCursor.destroy(); this.editCursor = null; }
        if (this.paletteContainer) { this.paletteContainer.destroy(true); this.paletteContainer = null; }
        if (this.paletteHighlight) { this.paletteHighlight.destroy(); this.paletteHighlight = null; }
        this._palRT = null;
        this._palZone = null;
        this._paletteTileSprites = null;
        if (this._rotateKey) {
            this.input.keyboard.off('keydown-R', this._rotateKey);
            this._rotateKey = null;
        }
        if (this._ctxHandler) {
            this.game.canvas.removeEventListener('contextmenu', this._ctxHandler);
            this._ctxHandler = null;
        }
        if (this._onEditMove) {
            this.input.off('pointermove', this._onEditMove);
            this._onEditMove = null;
        }
        if (this._onEditUp) {
            this.input.off('pointerup', this._onEditUp);
            this._onEditUp = null;
        }
        this._palDragging = false;
        this._draggingZone = null;
        if (this._catClickHandler) {
            document.querySelectorAll('.fcat-btn').forEach(b => {
                b.removeEventListener('click', this._catClickHandler);
            });
            this._catClickHandler = null;
        }

        // Restore zone markers to normal size and remove drag interactivity
        if (this._zoneObjects) {
            for (const obj of Object.values(this._zoneObjects)) {
                obj.marker.setRadius(5).removeInteractive();
                obj.marker.removeAllListeners('pointerdown');
            }
        }

        const btn = document.getElementById('edit-mode-btn');
        if (btn) btn.classList.remove('active');

        fetch('/save-furniture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ furniture: this.furnitureData, zones: this.getZonePositions() })
        });
    }

    // ============================================
    // Phase 3C: 墙壁和门渲染方法
    // ============================================

    drawWalls(gfx, TS) {
        const WALL_THICKNESS = 6;  // 墙壁厚度（像素）
        const WALL_MAIN   = 0x8B7355;
        const WALL_SHADOW = 0x6B5335;
        const WALL_LIGHT  = 0x9B8365;

        for (const [id, r] of Object.entries(this.roomDefs)) {
            const rx = r.x * TS;
            const ry = r.y * TS;
            const rw = r.w * TS;
            const rh = r.h * TS;

            // 四面墙壁
            this.drawWallSegment(gfx, rx, ry, rw, WALL_THICKNESS, 'top', id, TS);
            this.drawWallSegment(gfx, rx, ry + rh - WALL_THICKNESS, rw, WALL_THICKNESS, 'bottom', id, TS);
            this.drawWallSegment(gfx, rx, ry, WALL_THICKNESS, rh, 'left', id, TS);
            this.drawWallSegment(gfx, rx + rw - WALL_THICKNESS, ry, WALL_THICKNESS, rh, 'right', id, TS);
        }
    }

    drawWallSegment(gfx, x, y, w, h, side, roomId, TS) {
        const WALL_MAIN   = 0x8B7355;
        const WALL_SHADOW = 0x6B5335;
        const WALL_LIGHT  = 0x9B8365;

        // 检查该墙段是否有门
        const doorsOnThisWall = this.doors.filter(door => {
            const dx = door.x * TS, dy = door.y * TS;
            const dw = door.w * TS, dh = door.h * TS;
            return !(dx + dw < x || dx > x + w || dy + dh < y || dy > y + h);
        });

        // 绘制墙壁主体
        gfx.fillStyle(WALL_MAIN, 1);
        gfx.fillRect(x, y, w, h);

        // 添加阴影和高光
        gfx.fillStyle(WALL_SHADOW, 1);
        if (w > h) { // 水平墙
            gfx.fillRect(x, y + h - 2, w, 2);
        } else { // 垂直墙
            gfx.fillRect(x + w - 2, y, 2, h);
        }

        gfx.fillStyle(WALL_LIGHT, 1);
        if (w > h) {
            gfx.fillRect(x, y, w, 1);
        } else {
            gfx.fillRect(x, y, 1, h);
        }
    }

    drawDoors(gfx, TS) {
        // Stardew Valley style: open doorways, no door panels
        // Just clear the wall and add subtle door frame posts
        const CORRIDOR_COLOR = 0xd4c4a8;
        const FRAME_COLOR    = 0x7A6548;

        for (const door of this.doors) {
            const dx = door.x * TS;
            const dy = door.y * TS;
            const dw = door.w * TS;
            const dh = door.h * TS;

            // Clear wall area with corridor floor color
            gfx.fillStyle(CORRIDOR_COLOR, 1);
            gfx.fillRect(dx, dy, dw, dh);

            // Small door frame posts on each side (2px wide, subtle)
            gfx.fillStyle(FRAME_COLOR, 0.6);
            if (door.type === 'horizontal') {
                // Vertical posts on left and right edges
                gfx.fillRect(dx, dy, 2, dh);
                gfx.fillRect(dx + dw - 2, dy, 2, dh);
            } else {
                // Horizontal posts on top and bottom edges
                gfx.fillRect(dx, dy, dw, 2);
                gfx.fillRect(dx, dy + dh - 2, dw, 2);
            }
        }
    }
}
