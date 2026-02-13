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
        'bathroom':    { x: 26, y: 13 },
        'outdoor':     { x: 25, y: 4 }
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

    // 体征紧急需求 → 阿文说话气泡（红色，持续10秒）
    socket.on('awen:urgent-needs', (needs) => {
        if (!needs || needs.length === 0) return;
        const scene = game?.scene?.scenes?.[0];
        if (!scene || !scene.showSpeechBubble) return;
        const n = needs[0];
        if (n.dialogue) scene.showSpeechBubble('awen', n.dialogue, 10000);
    });

    // 体征中等需求 → 阿文小声嘟囔（短一点，5秒）
    socket.on('awen:mild-needs', (needs) => {
        if (!needs || needs.length === 0) return;
        const scene = game?.scene?.scenes?.[0];
        if (!scene || !scene.showSpeechBubble) return;
        const n = needs[0];
        if (n.dialogue) scene.showSpeechBubble('awen', n.dialogue, 5000);
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

// Money panel
function initMoneyPanel() {
    const toggleBtn = document.getElementById('money-toggle-btn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        const panel = document.getElementById('money-panel');
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            loadMoneyData();
        } else {
            panel.classList.add('hidden');
        }
    });

    document.querySelector('#money-panel .panel-close').addEventListener('click', () => {
        document.getElementById('money-panel').classList.add('hidden');
    });
}

function loadMoneyData() {
    const container = document.getElementById('money-content');
    if (!container) return;
    container.innerHTML = '<div class="money-loading">加载中...</div>';

    fetch('/money')
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                container.innerHTML = '<div class="no-data">暂无数据</div>';
                return;
            }
            const warn = data.warning ? ' money-warn' : '';
            let html = `
                <div class="money-overview">
                    <div class="money-balance${warn}">$${data.balance.toFixed(2)}</div>
                    <div class="money-countdown">距3月11日还有 <b>${data.daysLeft}</b> 天</div>
                    <div class="money-budget">每天可用 <b>$${data.dailyBudget.toFixed(2)}</b></div>
                    ${data.warning ? '<div class="money-alert">余额不足$200</div>' : ''}
                </div>
                <div class="money-stats">
                    <div class="money-stat"><span>今日支出</span><span>$${data.todaySpent.toFixed(2)}</span></div>
                    <div class="money-stat"><span>本周支出</span><span>$${data.weekSpent.toFixed(2)}</span></div>
                    <div class="money-stat"><span>累计收入</span><span>$${data.totalIncome.toFixed(2)}</span></div>
                </div>`;

            if (data.todayFood && data.todayFood.length > 0) {
                html += '<div class="money-section-title">今日饮食</div>';
                data.todayFood.forEach(f => {
                    const cost = parseFloat(f.cost);
                    const costStr = cost > 0 ? `$${cost.toFixed(2)}` : '免费';
                    html += `<div class="money-food-item"><span>${f.meal}</span><span>${f.content}</span><span class="money-food-cost">${costStr}</span></div>`;
                });
            }

            if (data.recentExpenses && data.recentExpenses.length > 0) {
                html += '<div class="money-section-title">最近支出</div>';
                data.recentExpenses.forEach(e => {
                    const time = new Date(e.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
                    html += `<div class="money-expense-item"><span>${time}</span><span>${e.category}</span><span>${e.description || ''}</span><span class="money-expense-amount">-$${parseFloat(e.amount).toFixed(2)}</span></div>`;
                });
            }

            container.innerHTML = html;
        })
        .catch(() => {
            container.innerHTML = '<div class="no-data">加载失败</div>';
        });
}

// Listen for money updates via socket
function initMoneySocket() {
    if (!gameState.socket) return;
    gameState.socket.on('money:update', () => {
        const panel = document.getElementById('money-panel');
        if (panel && !panel.classList.contains('hidden')) {
            loadMoneyData();
        }
        const foodPanel = document.getElementById('food-log-panel');
        if (foodPanel && !foodPanel.classList.contains('hidden')) {
            loadFoodLogData();
        }
    });
}

// Food log panel
function initFoodLogPanel() {
    const toggleBtn = document.getElementById('food-log-btn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        const panel = document.getElementById('food-log-panel');
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            loadFoodLogData();
        } else {
            panel.classList.add('hidden');
        }
    });

    document.querySelector('#food-log-panel .panel-close').addEventListener('click', () => {
        document.getElementById('food-log-panel').classList.add('hidden');
    });
}

function loadFoodLogData() {
    const container = document.getElementById('food-log-content');
    if (!container) return;
    container.innerHTML = '<div class="food-loading">加载中...</div>';

    fetch('/money/food?days=7')
        .then(r => r.json())
        .then(data => {
            const logs = data.logs || [];
            if (logs.length === 0) {
                container.innerHTML = '<div class="food-empty">暂无饮食记录</div>';
                return;
            }

            // Group by log_date
            const groups = {};
            logs.forEach(item => {
                const d = item.log_date;
                if (!groups[d]) groups[d] = [];
                groups[d].push(item);
            });

            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            let html = '';

            Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(date => {
                const items = groups[date];
                const dt = new Date(date + 'T00:00:00');
                const label = `${dt.getMonth() + 1}/${dt.getDate()} 周${weekdays[dt.getDay()]}`;
                html += `<div class="food-day-header">${label}</div>`;

                let dayTotal = 0;
                items.forEach(f => {
                    const cost = parseFloat(f.cost) || 0;
                    dayTotal += cost;
                    const time = f.created_at ? new Date(f.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
                    const src = f.source || '';
                    const isFridge = src === '冰箱' || src === 'fridge';
                    const tagClass = isFridge ? 'fridge' : 'delivery';
                    const tagText = isFridge ? '冰箱' : (src || '外卖');
                    const costClass = cost > 0 ? 'paid' : 'free';
                    const costText = cost > 0 ? `$${cost.toFixed(0)}` : '免费';

                    html += `<div class="food-item">
                        <span class="food-time">${time}</span>
                        <span class="food-meal">${f.meal || ''}</span>
                        <span class="food-content">${f.content || ''}</span>
                        <span class="food-tag ${tagClass}">${tagText}</span>
                        <span class="food-cost ${costClass}">${costText}</span>
                        <span class="food-del" data-id="${f.id}">&times;</span>
                    </div>`;
                });

                if (dayTotal > 0) {
                    html += `<div class="food-day-total">当日外卖 $${dayTotal.toFixed(0)}</div>`;
                }
            });

            container.innerHTML = html;
            container.querySelectorAll('.food-del').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.dataset.id;
                    if (!id) return;
                    fetch(`/money/food/${id}`, { method: 'DELETE' })
                        .then(r => r.json())
                        .then(() => loadFoodLogData());
                });
            });
        })
        .catch(() => {
            container.innerHTML = '<div class="food-empty">加载失败</div>';
        });
}

// Vitals panel
function initVitalsPanel() {
    const toggleBtn = document.getElementById('vitals-toggle-btn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        const panel = document.getElementById('vitals-panel');
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            loadVitalsData();
        } else {
            panel.classList.add('hidden');
        }
    });

    document.querySelector('#vitals-panel .panel-close').addEventListener('click', () => {
        document.getElementById('vitals-panel').classList.add('hidden');
    });
}

function vitalsBarColor(key, value) {
    const thresholds = {
        blood_sugar:  { wL: 3.8, wH: 6.5, dL: 3.2, dH: 7.0, min: 2.5, max: 7.5 },
        body_temp:    { wL: 36.0, wH: 37.5, dL: 35.5, dH: 38.0, min: 35.0, max: 39.0 },
        hydration:    { wL: 35, dL: 20, min: 0, max: 100 },
        heart_rate:   { wL: 55, wH: 110, dL: 45, dH: 130, min: 40, max: 160 },
        stress:       { wH: 75, dH: 90, min: 0, max: 100 },
        blood_oxygen: { wL: 93, dL: 90, min: 85, max: 100 },
        dopamine:     { wL: 15, dL: 8, min: 0, max: 100 },
        serotonin:    { wL: 15, dL: 8, min: 0, max: 100 },
        oxytocin:     { wL: 10, dL: 5, min: 0, max: 100 },
        endorphin:    { min: 0, max: 100 }
    };
    const t = thresholds[key];
    if (!t) return { color: '#4ade80', pct: 50 };

    let isDanger = false, isWarn = false;
    if (t.dL !== undefined && value < t.dL) isDanger = true;
    if (t.dH !== undefined && value > t.dH) isDanger = true;
    if (t.wL !== undefined && value < t.wL) isWarn = true;
    if (t.wH !== undefined && value > t.wH) isWarn = true;

    const color = isDanger ? '#ef4444' : isWarn ? '#f59e0b' : '#4ade80';
    const pct = Math.max(0, Math.min(100, ((value - t.min) / (t.max - t.min)) * 100));
    return { color, pct };
}

// 需求映射：将体征指标映射到0-100的需求值
function needsMap(type, data) {
    if (type === 'hunger') {
        // blood_sugar 3.0-6.0 映射到 0-100
        const bs = parseFloat(data.blood_sugar || 5.0);
        return Math.max(0, Math.min(100, ((bs - 3.0) / 3.0) * 100));
    }
    return 50;
}

function loadVitalsData() {
    const container = document.getElementById('vitals-content');
    if (!container) return;
    container.innerHTML = '<div class="vitals-loading">加载中...</div>';

    fetch('/vitals')
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                container.innerHTML = '<div class="no-data">暂无数据</div>';
                return;
            }

            const statusMap = {
                healthy: '😊 健康', mild: '😐 轻微不适',
                unwell: '😣 不适', critical: '⚠️ 严重'
            };
            const statusClass = data.status === 'critical' ? 'vitals-critical' :
                                data.status === 'unwell' ? 'vitals-unwell' :
                                data.status === 'mild' ? 'vitals-mild' : 'vitals-healthy';

            const physio = [
                { key: 'heart_rate', icon: '❤️', name: '心率', unit: ' bpm' },
                { key: 'blood_sugar', icon: '🩸', name: '血糖', unit: ' mmol/L' },
                { key: 'body_temp', icon: '🌡️', name: '体温', unit: '°C' },
                { key: 'hydration', icon: '💧', name: '水分', unit: '%' },
                { key: 'blood_oxygen', icon: '🫁', name: '血氧', unit: '%' },
                { key: 'stress', icon: '😰', name: '压力', unit: '' }
            ];
            const neuro = [
                { key: 'dopamine', icon: '⚡', name: '多巴胺', unit: '' },
                { key: 'serotonin', icon: '☀️', name: '血清素', unit: '' },
                { key: 'oxytocin', icon: '💕', name: '催产素', unit: '' },
                { key: 'endorphin', icon: '🏃', name: '内啡肽', unit: '' }
            ];

            function renderBar(item) {
                const val = parseFloat(data[item.key]);
                const { color, pct } = vitalsBarColor(item.key, val);
                // stress bar is inverted (high = bad)
                const barPct = item.key === 'stress' ? (100 - pct) : pct;
                return `<div class="vitals-metric">
                    <span class="vitals-label">${item.icon} ${item.name}</span>
                    <div class="vitals-bar-wrap">
                        <div class="vitals-bar" style="width:${barPct}%;background:${color}"></div>
                    </div>
                    <span class="vitals-value">${val}${item.unit}</span>
                </div>`;
            }

            let html = `<div class="vitals-status ${statusClass}">${statusMap[data.status] || data.status}</div>`;

            html += '<div class="vitals-section-title">生理指标</div>';
            physio.forEach(item => { html += renderBar(item); });

            html += '<div class="vitals-section-title">神经递质</div>';
            neuro.forEach(item => { html += renderBar(item); });

            // Phase 2: 模拟人生需求条
            html += `<div class="needs-section">
                <div class="needs-section-title">🎮 生活需求</div>
                <div class="needs-grid">`;

            // 需求映射
            const needs = [
                { icon: '🍔', name: '饥饿', value: needsMap('hunger', data), key: 'hunger' },
                { icon: '💧', name: '口渴', value: data.hydration || 50, key: 'thirst' },
                { icon: '🧼', name: '卫生', value: data.hygiene !== undefined ? data.hygiene : 80, key: 'hygiene' },
                { icon: '🚽', name: '如厕', value: data.bladder !== undefined ? data.bladder : 70, key: 'bladder' },
                { icon: '⚡', name: '娱乐', value: data.dopamine || 50, key: 'fun' },
                { icon: '💪', name: '精力', value: data.energy !== undefined ? data.energy : 85, key: 'energy' }
            ];

            for (const need of needs) {
                const pct = Math.max(0, Math.min(100, need.value));
                const barColor = pct < 20 ? '#ef4444' : pct < 40 ? '#f59e0b' : '#4ade80';
                const flashClass = pct < 20 ? ' need-danger' : '';
                html += `<div class="need-item">
                    <span class="need-icon">${need.icon}</span>
                    <div class="need-bar-wrap">
                        <div class="need-bar${flashClass}" style="width:${pct}%;background:${barColor}"></div>
                    </div>
                    <span class="need-label">${Math.round(pct)}</span>
                </div>`;
            }

            html += `</div></div>`;

            // 时间信息
            const now = Date.now();
            if (data.last_meal_at) {
                const m = Math.round((now - new Date(data.last_meal_at).getTime()) / 60000);
                html += `<div class="vitals-time">🍽️ 上次进食: ${m >= 60 ? Math.floor(m/60) + '小时前' : m + '分钟前'}</div>`;
            }
            if (data.last_drink_at) {
                const m = Math.round((now - new Date(data.last_drink_at).getTime()) / 60000);
                html += `<div class="vitals-time">🥤 上次喝水: ${m >= 60 ? Math.floor(m/60) + '小时前' : m + '分钟前'}</div>`;
            }
            if (data.sos_count > 0) {
                html += `<div class="vitals-sos">🆘 SOS: ${data.sos_count}/3</div>`;
            }

            container.innerHTML = html;
        })
        .catch(() => {
            container.innerHTML = '<div class="no-data">加载失败</div>';
        });
}

function initVitalsSocket() {
    if (!gameState.socket) return;
    gameState.socket.on('vitals:update', () => {
        const panel = document.getElementById('vitals-panel');
        if (panel && !panel.classList.contains('hidden')) {
            loadVitalsData();
        }
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
initMoneyPanel();
initVitalsPanel();
initFoodLogPanel();
updateClock();
setInterval(updateClock, 30000);

// Delay socket listener init to ensure socket is connected
setTimeout(() => { initMoneySocket(); initVitalsSocket(); }, 2000);
