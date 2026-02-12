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
                    'piano-room':  { x: 1,  y: 1, w: 8, h: 8,  color: 0xfce8e4, label: '🎹 琴房',      entry: { x: 5, y: 5 } },
                    'awen-room':   { x: 11, y: 1, w: 9, h: 8,  color: 0xeceef8, label: '📚 阿文的房间', entry: { x: 15, y: 5 } },
                    'living-room': { x: 1,  y: 11,w: 8, h: 8,  color: 0xfdf5e4, label: '🛋️ 客厅',       entry: { x: 5, y: 15 } },
                    'kitchen':     { x: 11, y: 11,w: 9, h: 8,  color: 0xe8f4e4, label: '🍳 厨房',       entry: { x: 15, y: 15 } },
                    'bathroom':    { x: 22, y: 11,w: 7, h: 8,  color: 0xe4eff8, label: '🚿 卫生间',     entry: { x: 25, y: 15 } },
                    'outdoor':     { x: 22, y: 1, w: 7, h: 8,  color: 0xd0e8c8, label: '🌿 外出',       entry: { x: 25, y: 4 } }
                },
                corridors: [
                    { x: 8,  y: 3,  w: 4, h: 3 },
                    { x: 8,  y: 12, w: 4, h: 3 },
                    { x: 4,  y: 8,  w: 2, h: 4 },
                    { x: 14, y: 8,  w: 2, h: 4 },
                    { x: 19, y: 12, w: 4, h: 3 },
                    { x: 19, y: 3,  w: 4, h: 3 },  // awen-room ↔ outdoor
                    { x: 24, y: 8,  w: 2, h: 4 },  // outdoor ↔ bathroom (vertical)
                ]
            },
            cozy: {
                rooms: {
                    'piano-room':  { x: 1,  y: 1, w: 9, h: 10, color: 0xfce8e4, label: '🎹 琴房',      entry: { x: 5, y: 6 } },
                    'awen-room':   { x: 12, y: 1, w: 9, h: 10, color: 0xeceef8, label: '📚 阿文的房间', entry: { x: 16, y: 6 } },
                    'living-room': { x: 1,  y: 13,w: 9, h: 7,  color: 0xfdf5e4, label: '🛋️ 客厅',       entry: { x: 5, y: 16 } },
                    'kitchen':     { x: 12, y: 13,w: 9, h: 7,  color: 0xe8f4e4, label: '🍳 厨房',       entry: { x: 16, y: 16 } },
                    'bathroom':    { x: 22, y: 11,w: 7, h: 9,  color: 0xe4eff8, label: '🚿 卫生间',     entry: { x: 25, y: 15 } },
                    'outdoor':     { x: 22, y: 1, w: 7, h: 8,  color: 0xd0e8c8, label: '🌿 外出',       entry: { x: 25, y: 4 } }
                },
                corridors: [
                    { x: 9,  y: 3,  w: 4, h: 3 },
                    { x: 9,  y: 13, w: 4, h: 2 },
                    { x: 4,  y: 10, w: 2, h: 4 },
                    { x: 15, y: 10, w: 2, h: 4 },
                    { x: 20, y: 13, w: 3, h: 3 },
                    { x: 20, y: 3,  w: 3, h: 3 },  // awen-room ↔ outdoor
                    { x: 24, y: 8,  w: 2, h: 4 },  // outdoor ↔ bathroom (vertical)
                ]
            }
        };

        const preset = PRESETS[window.currentLayout || 'default'];
        this.roomDefs  = preset.rooms;
        this.corridors = preset.corridors;

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

            // Floor pattern (subtle grid)
            gfx.lineStyle(1, 0x886655, 0.10);
            for (let ty = 0; ty < r.h; ty++) {
                gfx.lineBetween(r.x * TS, (r.y + ty) * TS, (r.x + r.w) * TS, (r.y + ty) * TS);
            }
            for (let tx = 0; tx < r.w; tx++) {
                gfx.lineBetween((r.x + tx) * TS, r.y * TS, (r.x + tx) * TS, (r.y + r.h) * TS);
            }

            // Wall border
            gfx.lineStyle(2, 0xc8a090, 1);
            gfx.strokeRect(r.x * TS, r.y * TS, r.w * TS, r.h * TS);

            // Inner wall highlight
            gfx.lineStyle(1, 0xd8b0a8, 0.5);
            gfx.strokeRect(r.x * TS + 1, r.y * TS + 1, r.w * TS - 2, r.h * TS - 2);
        }

        // Draw corridors
        for (const c of this.corridors) {
            gfx.fillStyle(0xd4c4a8, 1);
            gfx.fillRect(c.x * TS, c.y * TS, c.w * TS, c.h * TS);
        }

        // ============================================
        // Floor textures (LRK tileset, depth 1)
        // ============================================
        if (this.textures.exists('floorswalls')) {
            this.addFloorTextures(TS);
        }

        // ============================================
        // Draw furniture (simple decorative, depth 3)
        // ============================================
        const gfxDeco = this.add.graphics().setDepth(3);
        this.drawFurniture(gfxDeco, TS);

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

        // ============================================
        // Click to move (dabao)
        // ============================================
        this.input.on('pointerdown', (pointer) => {
            const tileX = Math.floor(pointer.worldX / TS);
            const tileY = Math.floor(pointer.worldY / TS);

            if (this.editMode) {
                if (pointer.button === 2) {
                    this.removeFurnitureAt(tileX, tileY);
                } else if (this.selectedFrame >= 0) {
                    this.placeFurnitureTile(tileX, tileY, this.selectedFrame);
                }
                return;
            }

            if (gameState.currentUser !== 'dabao') return;
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
    }

    // ----------------------------------------
    // Floor textures from LRK tileset
    // Pixel positions in floorswalls_LRK.png (224×256):
    //   Top section: 3 wall styles (row 1, y≈5) + 3 floor styles (row 2, y≈80)
    //   Bottom section: 4 color-variant floor styles (y≈156)
    //   Each swatch ≈ 64×64, gaps ≈ 11px, margin ≈ 5px
    // ----------------------------------------
    addFloorTextures(TS) {
        const fw = this.textures.get('floorswalls');

        // Register named frame regions (source x, y, w, h) if not already added
        const FRAMES = {
            'fw-floor-warm': [5,   80, 64, 64],  // warm orange/wood planks
            'fw-floor-gray': [80,  80, 64, 64],  // gray stone/tile
            'fw-floor-dark': [155, 80, 64, 64],  // dark rich wood
            'fw-floor-sage': [5,  156, 48, 48],  // sage green tile (bottom section)
            'fw-floor-pink': [59, 156, 48, 48],  // soft pink tile
        };
        for (const [name, [x, y, w, h]] of Object.entries(FRAMES)) {
            if (!fw.has(name)) fw.add(name, 0, x, y, w, h);
        }

        // Room → floor tile mapping
        const ROOM_FLOOR = {
            'piano-room':  'fw-floor-warm',
            'awen-room':   'fw-floor-dark',
            'living-room': 'fw-floor-warm',
            'kitchen':     'fw-floor-gray',
            'bathroom':    'fw-floor-gray',
            'outdoor':     null,
        };

        for (const [id, r] of Object.entries(this.roomDefs)) {
            const frame = ROOM_FLOOR[id];
            if (!frame) continue;
            this.add.tileSprite(
                r.x * TS, r.y * TS,
                r.w * TS, r.h * TS,
                'floorswalls', frame
            ).setOrigin(0, 0).setDepth(1).setAlpha(0.55);
        }
    }

    // ----------------------------------------
    // Draw simple furniture decorations
    // ----------------------------------------
    drawFurniture(gfx, TS) {
        const fcolor = 0x8c6048;  // warm brown wood
        const acolor = 0xa07858;  // medium warm wood

        // Piano (piano-room, top-right area)
        gfx.fillStyle(0x2a1810, 1);  // dark mahogany
        gfx.fillRect(2 * TS, 2 * TS, 4 * TS, 2 * TS);   // piano body
        gfx.fillStyle(0xeeeebb, 0.8);
        gfx.fillRect(2 * TS + 4, 2 * TS + 4, 4 * TS - 8, TS - 8); // keys area
        // Black keys
        gfx.fillStyle(0x111111, 1);
        for (let i = 0; i < 6; i++) {
            gfx.fillRect(2 * TS + 8 + i * 10, 2 * TS + 4, 6, TS - 14);
        }
        // Bench
        gfx.fillStyle(fcolor, 1);
        gfx.fillRect(2 * TS + 4, 4 * TS, 3 * TS, TS);

        // Bookshelf (awen-room, left wall)
        gfx.fillStyle(0x7a4a20, 1);  // warm oak wood
        gfx.fillRect(11 * TS + 2, 2 * TS, TS + 4, 5 * TS);
        // Books
        const bookColors = [0xcc4444, 0x44aacc, 0x88cc44, 0xccaa44, 0x8844cc];
        for (let i = 0; i < 5; i++) {
            gfx.fillStyle(bookColors[i], 0.7);
            gfx.fillRect(11 * TS + 4, (2 + i) * TS + 4, TS, TS - 8);
        }

        // Desk (awen-room)
        gfx.fillStyle(fcolor, 1);
        gfx.fillRect(13 * TS, 2 * TS, 4 * TS, TS + 4);
        // Monitor
        gfx.fillStyle(0x1a1a22, 1);
        gfx.fillRect(15 * TS - 16, 2 * TS + 2, 32, 22);
        gfx.lineStyle(1, 0x4488aa, 1);
        gfx.strokeRect(15 * TS - 16, 2 * TS + 2, 32, 22);

        // Sofa (living-room)
        gfx.fillStyle(0xe8c0b0, 1);  // blush rose sofa
        gfx.fillRect(2 * TS, 14 * TS, 5 * TS, 2 * TS);   // sofa
        gfx.fillStyle(0xd4a898, 1);  // slightly darker arms
        gfx.fillRect(2 * TS, 14 * TS, TS / 2, 2 * TS);   // arm L
        gfx.fillRect(7 * TS - TS / 2, 14 * TS, TS / 2, 2 * TS); // arm R
        // Coffee table
        gfx.fillStyle(acolor, 1);
        gfx.fillRect(3 * TS, 12 * TS, 3 * TS, TS + 8);

        // TV stand and screen (living-room, top wall)
        gfx.fillStyle(0x111111, 1);
        gfx.fillRect(3 * TS, 11 * TS + 2, 3 * TS, 2 * TS - 4);
        gfx.lineStyle(1, 0x224466, 0.8);
        gfx.strokeRect(3 * TS, 11 * TS + 2, 3 * TS, 2 * TS - 4);

        // Fridge (kitchen, right side) — interactive zone added in create()
        const fridgeX = 18 * TS;
        const fridgeY = 12 * TS + 6;
        // Body (silver)
        gfx.fillStyle(0xc8ccd0, 1);
        gfx.fillRect(fridgeX, fridgeY, TS * 2, TS * 3 + 8);
        // Outline
        gfx.lineStyle(2, 0x999da0, 1);
        gfx.strokeRect(fridgeX, fridgeY, TS * 2, TS * 3 + 8);
        // Top door (freezer)
        gfx.fillStyle(0xd4d8dc, 1);
        gfx.fillRect(fridgeX + 2, fridgeY + 2, TS * 2 - 4, TS + 4);
        // Bottom door (fridge)
        gfx.fillStyle(0xdce0e4, 1);
        gfx.fillRect(fridgeX + 2, fridgeY + TS + 8, TS * 2 - 4, TS * 2 - 4);
        // Handle
        gfx.fillStyle(0x888c90, 1);
        gfx.fillRect(fridgeX + TS * 2 - 8, fridgeY + 6, 3, TS - 2);
        gfx.fillRect(fridgeX + TS * 2 - 8, fridgeY + TS + 12, 3, TS * 2 - 12);
        // Divider line
        gfx.lineStyle(1, 0xa0a4a8, 1);
        gfx.lineBetween(fridgeX + 2, fridgeY + TS + 6, fridgeX + TS * 2 - 2, fridgeY + TS + 6);

        // Kitchen counter + stove
        gfx.fillStyle(0xd8c8a8, 1);  // warm cream marble counter
        gfx.fillRect(11 * TS + 2, 11 * TS + 2, 8 * TS - 4, TS + 4);  // counter top
        gfx.fillStyle(0xc4b090, 1);  // warm wood cabinets
        gfx.fillRect(11 * TS + 2, 12 * TS + 6, 4 * TS - 4, 2 * TS);  // lower cabinet
        // Stove burners
        gfx.fillStyle(0x2a2020, 1);
        gfx.lineStyle(1, 0x886644, 1);
        for (let i = 0; i < 4; i++) {
            const bx = (12 + Math.floor(i / 2)) * TS;
            const by = 11 * TS + 4 + (i % 2) * (TS / 2);
            gfx.strokeCircle(bx, by, 6);
        }

        // Outdoor - grass ground pattern (brighter green rows)
        gfx.fillStyle(0x4a9a30, 0.25);
        for (let ty = 2; ty < 8; ty++) {
            gfx.fillRect(23 * TS, ty * TS, 6 * TS, TS);
            ty++; // alternate rows
        }
        // Trees (simple circles - vibrant greens)
        const treePositions = [[23,2],[27,2],[23,6],[27,6],[25,4]];
        for (const [tx, ty] of treePositions) {
            gfx.fillStyle(0x2a7a1a, 1);
            gfx.fillCircle(tx * TS + TS/2, ty * TS + TS/2, TS * 0.7);
            gfx.fillStyle(0x44aa22, 0.8);
            gfx.fillCircle(tx * TS + TS/2, ty * TS + TS/2 - 4, TS * 0.5);
        }
        // Path (warm stone)
        gfx.fillStyle(0xd0b880, 1);
        gfx.fillRect(25 * TS, 2 * TS, TS, 6 * TS);

        // Bathtub (bathroom)
        gfx.fillStyle(0xe8f2fc, 1);  // light porcelain
        gfx.fillRect(23 * TS, 12 * TS, 4 * TS, 3 * TS);
        gfx.lineStyle(2, 0xa8c8e0, 1);
        gfx.strokeRect(23 * TS, 12 * TS, 4 * TS, 3 * TS);
        gfx.fillStyle(0xb8daf0, 0.6);  // soft blue water
        gfx.fillRect(23 * TS + 4, 12 * TS + 4, 4 * TS - 8, 3 * TS - 8);
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
            this.showCharacterPanel(name);
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
    }

    // ----------------------------------------
    // Move character to a room (with A* pathfinding)
    // ----------------------------------------
    moveCharacterToRoom(userName, roomId, activity) {
        const char = this.characters[userName];
        if (!char) return;

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

        if (char.currentRoom === roomId) return;
        char.currentRoom = roomId;

        const dest = roomDef.entry;
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

    walkPath(userName, path) {
        const char = this.characters[userName];
        if (!char || path.length < 2) return;
        // Stop bob tween while walking
        if (char.bobTween) { char.bobTween.stop(); char.bobTween = null; }
        char.isMoving  = true;
        char.path      = path;
        char.pathIndex = 1;
        this.walkNextStep(userName);
    }

    walkNextStep(userName) {
        const char = this.characters[userName];
        if (!char || char.pathIndex >= char.path.length) {
            if (char) {
                char.isMoving = false;
                // Restart bob tween at the arrived position
                char.bobTween = this.tweens.add({
                    targets: char.container, y: char.container.y - 2,
                    duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
                });
            }
            return;
        }

        const TS   = TILE_SIZE * SCALE;
        const step = char.path[char.pathIndex];
        const tx   = step.x * TS + TS / 2;
        const ty   = step.y * TS + TS / 2;

        this.tweens.add({
            targets: char.container,
            x: tx, y: ty,
            duration: 120,
            ease: 'Linear',
            onUpdate: () => {
                this.updateCharPos(char, char.container.x, char.container.y);
            },
            onComplete: () => {
                char.pathIndex++;
                this.walkNextStep(userName);
            }
        });
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
            })
            .catch(() => { this.furnitureData = []; });
    }

    renderFurniture() {
        const TS = TILE_SIZE * SCALE;
        if (this.furnitureGroup) this.furnitureGroup.clear(true, true);
        for (const item of this.furnitureData) {
            const spr = this.add.sprite(
                item.tx * TS + TS / 2,
                item.ty * TS + TS / 2,
                'interiors',
                item.frame
            ).setScale(SCALE).setDepth(15);

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

    placeFurnitureTile(tileX, tileY, frame) {
        this.removeFurnitureAt(tileX, tileY);
        const TS = TILE_SIZE * SCALE;
        const spr = this.add.sprite(
            tileX * TS + TS / 2,
            tileY * TS + TS / 2,
            'interiors',
            frame
        ).setScale(SCALE).setDepth(15);

        // Apply current rotation angle
        if (this.currentAngle !== 0) {
            spr.setAngle(this.currentAngle);
        }

        if (this.furnitureGroup) this.furnitureGroup.add(spr);
        spr._furnitureTx = tileX;
        spr._furnitureTy = tileY;
        spr._furnitureAngle = this.currentAngle;

        // Save with rotation angle
        const item = { frame, tx: tileX, ty: tileY };
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
            ptr.event.stopPropagation();
            this.showSchedulePopup();
        });

        // Fridge interactive zone (kitchen)
        const fridgeX = 18 * TS, fridgeY = 12 * TS + 6;
        const fridgeZone = this.add.zone(fridgeX + TS, fridgeY + TS * 1.5 + 4, TS * 2, TS * 3 + 8)
            .setInteractive({ useHandCursor: true }).setDepth(5);
        fridgeZone.on('pointerdown', (ptr) => {
            ptr.event.stopPropagation();
            this.showFridgePopup();
        });
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

    enterEditMode() {
        this.editMode = true;
        this.currentAngle = 0; // Reset rotation angle
        const TS = TILE_SIZE * SCALE;
        this.editCursor = this.add.rectangle(TS / 2, TS / 2, TS, TS, 0xffff00, 0.25)
            .setStrokeStyle(1, 0xffff00, 0.8)
            .setDepth(300)
            .setVisible(false);

        this.game.canvas.addEventListener('contextmenu', this._ctxHandler = e => e.preventDefault());

        this.input.on('pointermove', this._onEditMove = (ptr) => {
            if (!this.editCursor) return;
            const tx = Math.floor(ptr.worldX / TS);
            const ty = Math.floor(ptr.worldY / TS);
            this.editCursor.setPosition(tx * TS + TS / 2, ty * TS + TS / 2);
            this.editCursor.setVisible(true);
        });

        // Add keyboard listener for R key to rotate
        this._rotateKey = this.input.keyboard.on('keydown-R', () => {
            this.currentAngle = (this.currentAngle + 90) % 360;
            this.updateRotationDisplay();
        });

        const btn = document.getElementById('edit-mode-btn');
        if (btn) btn.classList.add('active');
        this.updateRotationDisplay();
    }

    updateRotationDisplay() {
        const info = document.getElementById('selected-tile-info');
        if (!info) return;
        const rotText = this.currentAngle !== 0 ? ` (旋转 ${this.currentAngle}°)` : '';
        const frameText = this.selectedFrame >= 0 ? `已选 frame ${this.selectedFrame}` : '未选择';
        info.textContent = frameText + rotText;
    }

    exitEditMode() {
        this.editMode = false;
        this.currentAngle = 0;
        if (this.editCursor) { this.editCursor.destroy(); this.editCursor = null; }
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
        const btn = document.getElementById('edit-mode-btn');
        if (btn) btn.classList.remove('active');

        fetch('/save-furniture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ furniture: this.furnitureData })
        });
    }
}
