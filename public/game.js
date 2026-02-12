// ============================================
// 阿文和大宝的家 - Phaser Game Config
// ============================================

// Layout preset cycling
window.currentLayout = 'default';
const LAYOUT_CYCLE = ['default', 'cozy'];

const TILE_SIZE = 16;
const SCALE = 2;
const MAP_WIDTH = 30;  // tiles
const MAP_HEIGHT = 20; // tiles

const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: MAP_WIDTH * TILE_SIZE * SCALE,
    height: MAP_HEIGHT * TILE_SIZE * SCALE,
    pixelArt: true,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [BootScene, HomeScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

// Global state shared between scenes
const gameState = {
    socket: null,
    currentUser: 'dabao',
    characters: {},
    emotionData: null,
    serverState: null,
    roomPositions: {
        'piano-room':  { x: 4, y: 4 },
        'awen-room':   { x: 16, y: 4 },
        'living-room': { x: 4, y: 13 },
        'kitchen':     { x: 16, y: 13 },
        'bathroom':    { x: 26, y: 13 }
    }
};

// Connect Socket.io
function initSocket() {
    const socket = io();
    gameState.socket = socket;

    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('user:online', { user: gameState.currentUser });
    });

    socket.on('state:update', (state) => {
        gameState.serverState = state;
        updateCharactersFromState(state);
        updateHUD(state);
    });

    socket.on('emotion:sync', (data) => {
        gameState.emotionData = data;
        updateEmotionDisplay(data);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected');
    });

    // Initial state fetch
    fetch('/state')
        .then(r => r.json())
        .then(state => {
            gameState.serverState = state;
            updateCharactersFromState(state);
            updateHUD(state);
        });
}

function updateCharactersFromState(state) {
    if (!state || !state.users) return;
    const homeScene = game.scene.getScene('HomeScene');
    if (!homeScene || !homeScene.scene.isActive()) return;

    for (const [user, data] of Object.entries(state.users)) {
        if (homeScene.moveCharacterToRoom) {
            homeScene.moveCharacterToRoom(user, data.room, data.activity);
        }
    }
}

function updateHUD(state) {
    if (!state || !state.users) return;

    const awen = state.users.awen;
    const dabao = state.users.dabao;

    if (awen) {
        const el = document.getElementById('awen-activity');
        if (el && el.contentEditable !== 'true') el.textContent = awen.activity || '...';
        const dot = document.getElementById('awen-online');
        if (dot) dot.className = 'online-dot' + (awen.online ? ' online' : '');
    }
    if (dabao) {
        const el = document.getElementById('dabao-activity');
        if (el && el.contentEditable !== 'true') el.textContent = dabao.activity || '...';
        const dot = document.getElementById('dabao-online');
        if (dot) dot.className = 'online-dot' + (dabao.online ? ' online' : '');
    }

    // Update chat
    if (state.messages) {
        updateChatMessages(state.messages);
    }

    // Update music
    if (state.sharedFeatures && state.sharedFeatures.music) {
        updateMusicDisplay(state.sharedFeatures.music);
    }

    // Update notes
    if (state.notes !== undefined) {
        updateNotesPanel(state.notes);
    }
}

function updateEmotionDisplay(data) {
    // Will be called from emotion:sync event
    // Handled in UI.js
}

function updateChatMessages(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = '';
    (messages || []).slice(-20).forEach(msg => {
        const div = document.createElement('div');
        div.className = `chat-msg ${msg.user}`;
        const name = msg.user === 'awen' ? '阿文' : '大宝';
        const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `<span class="msg-name">${name}</span> <span class="msg-text">${msg.message}</span> <span class="msg-time">${time}</span>`;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

function updateMusicDisplay(music) {
    const info = document.getElementById('music-info');
    const embed = document.getElementById('music-embed');
    if (!info) return;

    if (music && music.content) {
        const who = music.user === 'awen' ? '阿文' : '大宝';

        if (music.content.includes('spotify.com/track/')) {
            const trackId = music.content.match(/track\/([a-zA-Z0-9]+)/);
            if (trackId && embed) {
                embed.innerHTML = `<iframe src="https://open.spotify.com/embed/track/${trackId[1]}?theme=0" width="100%" height="80" frameborder="0" allow="autoplay; encrypted-media" loading="lazy"></iframe>`;
                info.textContent = `${who} 在听`;
            }
        } else {
            if (embed) embed.innerHTML = '';
            info.textContent = `${who} 在听: ${music.content}`;
        }
    } else {
        if (embed) embed.innerHTML = '';
        info.textContent = '暂无播放';
    }
}

// Init clock
function updateClock() {
    const el = document.getElementById('clock');
    const period = document.getElementById('time-period');
    if (!el) return;

    const now = new Date();
    el.textContent = now.toLocaleString('zh-CN', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const hour = now.getHours();
    let p = '';
    if (hour >= 5 && hour < 8) p = '🌅 清晨';
    else if (hour >= 8 && hour < 12) p = '☀️ 上午';
    else if (hour >= 12 && hour < 14) p = '🌞 中午';
    else if (hour >= 14 && hour < 18) p = '🌤️ 下午';
    else if (hour >= 18 && hour < 20) p = '🌆 傍晚';
    else if (hour >= 20 && hour < 23) p = '🌙 晚上';
    else p = '✨ 深夜';
    if (period) period.textContent = p;
}

// Init chat input
function initChatInput() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    if (!input || !sendBtn) return;

    const send = () => {
        const text = input.value.trim();
        if (!text) return;
        fetch('/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: gameState.currentUser, message: text })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                input.value = '';
                updateHUD(data.state);
            }
        });
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') send(); });

    // User selector
    document.querySelectorAll('.user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.user-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            gameState.currentUser = btn.dataset.user;
        });
    });

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetch('/state').then(r => r.json()).then(state => {
                gameState.serverState = state;
                updateCharactersFromState(state);
                updateHUD(state);
            });
        });
    }

    // Chat toggle
    const toggleBtn = document.getElementById('toggle-chat');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const body = document.getElementById('chat-body');
            if (body) body.classList.toggle('collapsed');
        });
    }

    // Panel close
    document.querySelectorAll('.panel-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.panel').classList.add('hidden');
        });
    });

    // Music panel toggle
    const musicToggleBtn = document.getElementById('music-toggle-btn');
    if (musicToggleBtn) {
        musicToggleBtn.addEventListener('click', () => {
            const panel = document.getElementById('music-panel');
            if (panel) panel.classList.toggle('hidden');
        });
    }

    // Music user selector (separate from chat user selector)
    const musicUserBtns = document.querySelectorAll('#music-panel .user-btn');
    musicUserBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            musicUserBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Music share button
    const musicShareBtn = document.getElementById('music-share-btn');
    const musicInput = document.getElementById('music-link-input');
    if (musicShareBtn && musicInput) {
        const shareMusic = () => {
            const link = musicInput.value.trim();
            if (!link) return;
            const activeBtn = document.querySelector('#music-panel .user-btn.active');
            const user = activeBtn ? activeBtn.dataset.user : gameState.currentUser;
            fetch('/share-feature', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, type: 'music', content: link })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    musicInput.value = '';
                    updateMusicDisplay(data.state.sharedFeatures.music);
                }
            });
        };
        musicShareBtn.addEventListener('click', shareMusic);
        musicInput.addEventListener('keypress', e => { if (e.key === 'Enter') shareMusic(); });
    }

    // Music clear button
    const musicClearBtn = document.getElementById('music-clear-btn');
    if (musicClearBtn) {
        musicClearBtn.addEventListener('click', () => {
            fetch('/share-feature', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: gameState.currentUser, type: 'music', content: null })
            }).then(r => r.json()).then(data => {
                if (data.success) updateMusicDisplay(null);
            });
        });
    }
}

// Init layout toggle
function initLayoutToggle() {
    const btn = document.getElementById('layout-btn');
    if (!btn) return;
    let idx = 0;
    btn.addEventListener('click', () => {
        idx = (idx + 1) % LAYOUT_CYCLE.length;
        window.currentLayout = LAYOUT_CYCLE[idx];
        btn.title = `布局: ${window.currentLayout}`;
        const homeScene = game.scene.getScene('HomeScene');
        if (homeScene) homeScene.scene.restart();
    });
}

// Init furniture editor palette
function initFurnitureEditor() {
    const canvas = document.getElementById('furniture-palette');
    if (!canvas) return;

    const TILE = 16, ZOOM = 2, COLS = 16;
    const ctx = canvas.getContext('2d');
    let paletteImg = null;
    let selectedCol = -1, selectedRow = -1;

    const img = new Image();
    img.onload = () => {
        paletteImg = img;
        canvas.width  = img.width * ZOOM;
        canvas.height = img.height * ZOOM;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = 'assets/modern-interiors/Interiors_free_16x16.png';

    canvas.addEventListener('click', (e) => {
        if (!paletteImg) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const col = Math.floor((e.clientX - rect.left) * scaleX / (TILE * ZOOM));
        const row = Math.floor((e.clientY - rect.top)  * scaleY / (TILE * ZOOM));
        selectedCol = col; selectedRow = row;
        const frame = row * COLS + col;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(paletteImg, 0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth   = 2;
        ctx.strokeRect(col * TILE * ZOOM, row * TILE * ZOOM, TILE * ZOOM, TILE * ZOOM);

        const homeScene = game.scene.getScene('HomeScene');
        if (homeScene) {
            homeScene.selectedFrame = frame;
            if (homeScene.updateRotationDisplay) {
                homeScene.updateRotationDisplay();
            }
        }

        const info = document.getElementById('selected-tile-info');
        if (info && (!homeScene || !homeScene.updateRotationDisplay)) {
            info.textContent = `已选 frame ${frame} (r${row} c${col})`;
        }
    });

    // Edit mode toggle button
    document.getElementById('edit-mode-btn').addEventListener('click', () => {
        const panel = document.getElementById('furniture-panel');
        const homeScene = game.scene.getScene('HomeScene');
        if (!homeScene) return;

        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            if (!homeScene.editMode) homeScene.enterEditMode();
        } else {
            panel.classList.add('hidden');
            if (homeScene.editMode) homeScene.exitEditMode();
        }
    });

    // Save and exit
    document.getElementById('save-furniture-btn').addEventListener('click', () => {
        const homeScene = game.scene.getScene('HomeScene');
        if (homeScene && homeScene.editMode) homeScene.exitEditMode();
        document.getElementById('furniture-panel').classList.add('hidden');
    });

    // Clear all
    document.getElementById('clear-furniture-btn').addEventListener('click', () => {
        const homeScene = game.scene.getScene('HomeScene');
        if (homeScene) { homeScene.furnitureData = []; homeScene.renderFurniture(); }
    });

    // Panel close button exits edit mode
    document.querySelector('#furniture-panel .panel-close').addEventListener('click', () => {
        const homeScene = game.scene.getScene('HomeScene');
        if (homeScene && homeScene.editMode) homeScene.exitEditMode();
    });
}

// Notes panel
function updateNotesPanel(notes) {
    const list = document.getElementById('notes-list');
    if (!list) return;

    if (!notes || notes.length === 0) {
        list.innerHTML = '<div class="no-data">还没有留言</div>';
        return;
    }

    list.innerHTML = [...notes].reverse().map(note => {
        const time = new Date(note.timestamp).toLocaleString('zh-CN', {
            month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const author = note.user === 'awen' ? '阿文' : '大宝';
        const ts = note.timestamp.replace(/"/g, '');
        return `<div class="note-item">
            <div class="note-meta">
                <span class="note-author ${note.user}">${author}</span>
                <span class="note-time">${time}</span>
                <button class="note-delete" data-ts="${ts}">×</button>
            </div>
            <div class="note-text">${note.note}</div>
        </div>`;
    }).join('');

    list.querySelectorAll('.note-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            fetch('/delete-note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timestamp: btn.dataset.ts })
            }).then(r => r.json()).then(data => {
                if (data.success) updateNotesPanel(data.state.notes);
            });
        });
    });
}

function initNotesPanel() {
    const toggleBtn = document.getElementById('notes-toggle-btn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        document.getElementById('notes-panel').classList.toggle('hidden');
    });

    document.querySelector('#notes-panel .panel-close').addEventListener('click', () => {
        document.getElementById('notes-panel').classList.add('hidden');
    });

    const sendNote = () => {
        const input = document.getElementById('note-input');
        const text = input.value.trim();
        if (!text) return;
        const activeBtn = document.querySelector('.note-user-btn.active');
        const user = activeBtn ? activeBtn.dataset.user : 'dabao';
        fetch('/post-note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, note: text })
        }).then(r => r.json()).then(data => {
            if (data.success) { input.value = ''; updateNotesPanel(data.state.notes); }
        });
    };

    document.getElementById('note-send').addEventListener('click', sendNote);
    document.getElementById('note-input').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendNote();
    });

    document.querySelectorAll('.note-user-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.note-user-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

// Init inline status editing
function initStatusEdit() {
    ['awen', 'dabao'].forEach(user => {
        const el = document.getElementById(`${user}-activity`);
        if (!el) return;

        el.title = '点击编辑';

        el.addEventListener('click', () => {
            if (el.contentEditable === 'true') return;
            el.dataset.original = el.textContent;
            el.contentEditable = 'true';
            el.focus();
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });

        el.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
            if (e.key === 'Escape') {
                el.textContent = el.dataset.original || '...';
                el.contentEditable = 'false';
            }
        });

        el.addEventListener('blur', () => {
            if (el.contentEditable !== 'true') return;
            el.contentEditable = 'false';
            const status = el.textContent.trim();
            if (!status) { el.textContent = el.dataset.original || '...'; return; }
            fetch('/custom-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, status })
            }).then(r => r.json()).then(data => {
                if (data.success) updateHUD(data.state);
                const homeScene = game.scene.getScene('HomeScene');
                if (homeScene && homeScene.setCharacterActivity) {
                    homeScene.setCharacterActivity(user, status);
                }
            });
        });
    });
}

// Start
const game = new Phaser.Game(config);

initSocket();
initChatInput();
initLayoutToggle();
initFurnitureEditor();
initNotesPanel();
initStatusEdit();
updateClock();
setInterval(updateClock, 30000);
