// ============================================
// 阿文和大宝的家 - Phaser Game Config
// ============================================

function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
        'living-room': { x: 7, y: 15 },
        'kitchen':     { x: 18, y: 13 },
        'bathroom':    { x: 24, y: 13 },
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

    // Update cat position
    if (state.pet && homeScene.moveCatToRoom) {
        const PBT = { idle:'趴着发呆', sleeping:'zzZ', eating:'吃猫粮', playing:'玩毛线球', following_awen:'跟着阿文', wandering:'溜达', grooming:'舔毛' };
        homeScene.moveCatToRoom(state.pet.room, PBT[state.pet.behavior]);
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

    // Update pet widget + cat panel
    if (state.pet) {
        updatePetWidget(state.pet);
        const homeScene = game.scene.getScene('HomeScene');
        if (homeScene && homeScene.refreshCatPanel) homeScene.refreshCatPanel();
    }

    // Update activity progress bar
    updateActivityProgress();
}

function updateEmotionDisplay(data) {
    // Will be called from emotion:sync event
    // Handled in UI.js
}

// ============================================
// Activity progress bar (阿文活动进度条)
// ============================================
const ACTIVITY_MIN_STAY_CLIENT = [
    { keywords: ['上厕所'], minutes: 3 },
    { keywords: ['喝水', '泡咖啡', '热牛奶'], minutes: 5 },
    { keywords: ['洗澡', '淋浴', '热水澡'], minutes: 15 },
    { keywords: ['吃', '做饭', '煮', '炒', '煎'], minutes: 10 },
    { keywords: ['做好', '外卖到'], minutes: 5 },
    { keywords: ['睡'], minutes: 60 },
];
const DEFAULT_MIN_STAY = 30;

function getMinStayForActivity(activity) {
    if (!activity) return DEFAULT_MIN_STAY;
    for (const rule of ACTIVITY_MIN_STAY_CLIENT) {
        if (rule.keywords.some(k => activity.includes(k))) return rule.minutes;
    }
    return DEFAULT_MIN_STAY;
}

function updateActivityProgress() {
    const state = gameState.serverState;
    if (!state || !state.users || !state.users.awen) return;

    const awen = state.users.awen;
    const bar = document.getElementById('awen-progress-bar');
    const text = document.getElementById('awen-progress-text');
    const wrap = document.getElementById('awen-progress-wrap');
    if (!bar || !text || !wrap) return;

    let elapsed, total, label;

    // Priority: cooking/delivery have exact finish times
    if (state.cooking && state.cooking.active && state.cooking.startedAt && state.cooking.finishAt) {
        const start = new Date(state.cooking.startedAt).getTime();
        const finish = new Date(state.cooking.finishAt).getTime();
        total = (finish - start) / 60000;
        elapsed = (Date.now() - start) / 60000;
        label = '🍳 做饭';
    } else if (state.delivery && state.delivery.active && state.delivery.orderedAt && state.delivery.arriveAt) {
        const start = new Date(state.delivery.orderedAt).getTime();
        const finish = new Date(state.delivery.arriveAt).getTime();
        total = (finish - start) / 60000;
        elapsed = (Date.now() - start) / 60000;
        label = '🛵 外卖';
    } else {
        // Normal activity progress
        const changedAt = awen.activityChangedAt;
        if (!changedAt) { wrap.style.display = 'none'; return; }
        elapsed = (Date.now() - changedAt) / 60000;
        total = getMinStayForActivity(awen.activity);
        label = null;
    }

    wrap.style.display = '';
    const pct = Math.min(100, (elapsed / total) * 100);
    bar.style.width = pct + '%';

    // Color: green when almost done, orange while in progress
    if (pct >= 100) {
        bar.style.background = 'linear-gradient(90deg, #7ec850, #6db840)';
    } else if (pct >= 70) {
        bar.style.background = 'linear-gradient(90deg, #d4c080, #c8b060)';
    } else {
        bar.style.background = 'linear-gradient(90deg, #d4908a, #e8a898)';
    }

    const remaining = Math.max(0, total - elapsed);
    const prefix = label ? label + ' ' : '';
    if (remaining > 0) {
        text.textContent = prefix + Math.ceil(remaining) + '分钟';
    } else {
        text.textContent = prefix + '可换';
    }
}

// Update progress every 10 seconds
setInterval(updateActivityProgress, 10000);

function updateChatMessages(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    container.innerHTML = '';
    (messages || []).slice(-20).forEach(msg => {
        const div = document.createElement('div');
        div.className = `chat-msg ${msg.user}`;
        const name = msg.user === 'awen' ? '阿文' : '大宝';
        const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `<span class="msg-name">${esc(name)}</span> <span class="msg-text">${esc(msg.message)}</span> <span class="msg-time">${esc(time)}</span>`;
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
            fetch('/state/light').then(r => r.json()).then(state => {
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

// Init furniture editor (palette is now rendered inside Phaser canvas)
function initFurnitureEditor() {
    // Edit mode toggle button
    const editBtn = document.getElementById('edit-mode-btn');
    if (!editBtn) return;

    editBtn.addEventListener('click', () => {
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
    document.getElementById('save-furniture-btn')?.addEventListener('click', () => {
        const homeScene = game.scene.getScene('HomeScene');
        if (homeScene && homeScene.editMode) homeScene.exitEditMode();
        document.getElementById('furniture-panel').classList.add('hidden');
    });

    // Clear all
    document.getElementById('clear-furniture-btn')?.addEventListener('click', () => {
        const homeScene = game.scene.getScene('HomeScene');
        if (homeScene) { homeScene.furnitureData = []; homeScene.renderFurniture(); }
    });

    // Panel close button exits edit mode
    document.querySelector('#furniture-panel .panel-close')?.addEventListener('click', () => {
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
            <div class="note-text">${esc(note.note)}</div>
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

    document.querySelector('#notes-panel .panel-close')?.addEventListener('click', () => {
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

    document.getElementById('note-send')?.addEventListener('click', sendNote);
    document.getElementById('note-input')?.addEventListener('keypress', e => {
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

    document.querySelector('#money-panel .panel-close')?.addEventListener('click', () => {
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
                    html += `<div class="money-food-item"><span>${esc(f.meal)}</span><span>${esc(f.content)}</span><span class="money-food-cost">${esc(costStr)}</span></div>`;
                });
            }

            if (data.recentExpenses && data.recentExpenses.length > 0) {
                html += '<div class="money-section-title">最近支出</div>';
                data.recentExpenses.forEach(e => {
                    const time = new Date(e.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
                    html += `<div class="money-expense-item"><span>${esc(time)}</span><span>${esc(e.category)}</span><span>${esc(e.description)}</span><span class="money-expense-amount">-$${parseFloat(e.amount).toFixed(2)}</span></div>`;
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

    document.querySelector('#food-log-panel .panel-close')?.addEventListener('click', () => {
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
                        <span class="food-meal">${esc(f.meal)}</span>
                        <span class="food-content">${esc(f.content)}</span>
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
let vitalsEditMode = false;
let vitalsLastData = null;

function initVitalsPanel() {
    const toggleBtn = document.getElementById('vitals-toggle-btn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        const panel = document.getElementById('vitals-panel');
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            vitalsEditMode = false;
            loadVitalsData();
        } else {
            panel.classList.add('hidden');
        }
    });

    document.querySelector('#vitals-panel .panel-close')?.addEventListener('click', () => {
        document.getElementById('vitals-panel').classList.add('hidden');
        vitalsEditMode = false;
    });

    document.getElementById('vitals-edit-btn')?.addEventListener('click', () => {
        vitalsEditMode = !vitalsEditMode;
        const btn = document.getElementById('vitals-edit-btn');
        btn.textContent = vitalsEditMode ? '👁️' : '✏️';
        btn.title = vitalsEditMode ? '查看模式' : '编辑体征';
        loadVitalsData();
    });
}

function vitalsBarColor(key, value) {
    const thresholds = {
        blood_sugar:  { wL: 3.8, wH: 9.0, dL: 3.2, dH: 10.5, min: 2.5, max: 12.0 },
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

            vitalsLastData = data;

            function renderBar(item) {
                const val = parseFloat(data[item.key]);
                const { color, pct } = vitalsBarColor(item.key, val);
                const barPct = pct;
                const valueHtml = vitalsEditMode
                    ? `<input class="vitals-input" data-key="${item.key}" type="number" step="any" value="${val}" />`
                    : `<span class="vitals-value">${val}${item.unit}</span>`;
                return `<div class="vitals-metric">
                    <span class="vitals-label">${item.icon} ${item.name}</span>
                    <div class="vitals-bar-wrap">
                        <div class="vitals-bar" style="width:${barPct}%;background:${color}"></div>
                    </div>
                    ${valueHtml}
                </div>`;
            }

            let html = `<div class="vitals-status ${statusClass}">${statusMap[data.status] || data.status}</div>`;

            html += '<div class="vitals-section-title">生理指标</div>';
            physio.forEach(item => { html += renderBar(item); });

            html += '<div class="vitals-section-title">神经递质</div>';
            neuro.forEach(item => { html += renderBar(item); });

            // 编辑模式：额外显示 hygiene/bladder/energy 输入
            if (vitalsEditMode) {
                const extra = [
                    { key: 'hygiene', icon: '🧼', name: '卫生' },
                    { key: 'bladder', icon: '🚽', name: '膀胱' },
                    { key: 'energy', icon: '💪', name: '精力' }
                ];
                html += '<div class="vitals-section-title">生活指标</div>';
                extra.forEach(item => {
                    const val = parseFloat(data[item.key] ?? 50);
                    const { color, pct } = vitalsBarColor(item.key, val);
                    html += `<div class="vitals-metric">
                        <span class="vitals-label">${item.icon} ${item.name}</span>
                        <div class="vitals-bar-wrap">
                            <div class="vitals-bar" style="width:${pct}%;background:${color}"></div>
                        </div>
                        <input class="vitals-input" data-key="${item.key}" type="number" step="1" value="${val}" />
                    </div>`;
                });
            }

            // Phase 2: 模拟人生需求条
            if (!vitalsEditMode) {
                html += `<div class="needs-section">
                    <div class="needs-section-title">🎮 生活需求</div>
                    <div class="needs-grid">`;

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
            }

            // 编辑模式保存按钮
            if (vitalsEditMode) {
                html += `<button id="vitals-save-btn" class="vitals-save-btn">保存修改</button>`;
            }

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

            // 绑定保存按钮
            document.getElementById('vitals-save-btn')?.addEventListener('click', saveVitalsEdits);
        })
        .catch(() => {
            container.innerHTML = '<div class="no-data">加载失败</div>';
        });
}

function initVitalsSocket() {
    if (!gameState.socket) return;
    gameState.socket.on('vitals:update', () => {
        const panel = document.getElementById('vitals-panel');
        if (panel && !panel.classList.contains('hidden') && !vitalsEditMode) {
            loadVitalsData();
        }
    });
}

function saveVitalsEdits() {
    const inputs = document.querySelectorAll('.vitals-input');
    const body = {};
    let changed = 0;
    inputs.forEach(inp => {
        const key = inp.dataset.key;
        const newVal = parseFloat(inp.value);
        if (!isNaN(newVal) && vitalsLastData && newVal !== parseFloat(vitalsLastData[key])) {
            body[key] = newVal;
            changed++;
        }
    });
    if (changed === 0) return;

    const btn = document.getElementById('vitals-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

    fetch('/vitals/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            vitalsEditMode = false;
            const editBtn = document.getElementById('vitals-edit-btn');
            if (editBtn) { editBtn.textContent = '✏️'; editBtn.title = '编辑体征'; }
            loadVitalsData();
        } else {
            if (btn) { btn.disabled = false; btn.textContent = '保存失败，重试'; }
        }
    })
    .catch(() => {
        if (btn) { btn.disabled = false; btn.textContent = '保存失败，重试'; }
    });
}

// ============================================
// Diary Panel (日志频道)
// ============================================
let _diaryEntries = [];

function initCalendarPanel() {
    const btn = document.getElementById('calendar-toggle-btn');
    const panel = document.getElementById('calendar-panel');
    if (!btn || !panel) return;

    btn.onclick = () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) loadDiaryData();
    };
    panel.querySelector('.panel-close').onclick = () => panel.classList.add('hidden');
}

function loadDiaryData() {
    const container = document.getElementById('calendar-content');
    if (!container) return;
    container.innerHTML = '<div style="color:#a08060;font-size:11px;">加载中...</div>';

    fetch('/notion/diary')
        .then(r => r.json())
        .then(data => {
            if (!data.entries || data.entries.length === 0) {
                container.innerHTML = '<div style="color:#a08060;font-size:11px;padding:8px;">还没有日志</div>';
                return;
            }
            _diaryEntries = data.entries;
            renderDiaryList(container);
        })
        .catch(() => {
            container.innerHTML = '<div style="color:#c06050;font-size:11px;">加载失败</div>';
        });
}

function renderDiaryList(container) {
    let html = '';
    for (const entry of _diaryEntries) {
        const date = entry.createdAt ? entry.createdAt.slice(5, 10) : '';
        const safeTitle = esc(entry.title);
        html += `<div class="diary-entry" data-id="${entry.id}" data-title="${safeTitle}">`;
        html += `<span class="diary-date">${date}</span>`;
        html += `<span class="diary-title">${safeTitle}</span>`;
        html += `<span class="diary-arrow">\u203a</span>`;
        html += '</div>';
    }
    container.innerHTML = html;
    container.querySelectorAll('.diary-entry').forEach(el => {
        el.onclick = () => loadDiaryDetail(container, el.dataset.id, el.dataset.title);
    });
}

function loadDiaryDetail(container, pageId, title) {
    container.innerHTML = '<div class="diary-detail"><div style="color:#a08060;font-size:11px;">加载中...</div></div>';

    fetch('/notion/diary/' + pageId)
        .then(r => r.json())
        .then(data => {
            let html = '<div class="diary-detail">';
            html += '<span class="diary-detail-back">\u2190 返回列表</span>';
            html += '<div class="diary-detail-title">' + esc(title) + '</div>';
            html += '<div class="diary-detail-body">';
            if (!data.blocks || data.blocks.length === 0) {
                html += '<p style="color:#a08060;">(空页面)</p>';
            } else {
                for (const b of data.blocks) {
                    const t = esc(b.text);
                    if (b.type === 'heading_1') html += '<p style="font-size:13px;font-weight:bold;">' + t + '</p>';
                    else if (b.type === 'heading_2') html += '<p style="font-size:12px;font-weight:bold;">' + t + '</p>';
                    else if (b.type === 'heading_3') html += '<p style="font-size:11px;font-weight:bold;">' + t + '</p>';
                    else if (b.type === 'bulleted_list_item') html += '<p>\u00b7 ' + t + '</p>';
                    else if (b.type === 'numbered_list_item') html += '<p>\u2022 ' + t + '</p>';
                    else if (b.type === 'quote') html += '<p style="border-left:2px solid #d0b090;padding-left:6px;color:#7a5a4a;">' + t + '</p>';
                    else if (b.type === 'divider') html += '<hr style="border:none;border-top:1px solid #e8c4b8;margin:6px 0;">';
                    else html += '<p>' + t + '</p>';
                }
            }
            html += '</div></div>';
            container.innerHTML = html;
            container.querySelector('.diary-detail-back').onclick = () => renderDiaryList(container);
        })
        .catch(() => {
            let html = '<div class="diary-detail">';
            html += '<span class="diary-detail-back">\u2190 返回列表</span>';
            html += '<p style="color:#c06050;font-size:11px;">加载失败</p></div>';
            container.innerHTML = html;
            container.querySelector('.diary-detail-back').onclick = () => renderDiaryList(container);
        });
}

// ============================================
// Schedule Calendar Panel (日程总览)
// ============================================
let _scheduleItems = [];
let _scheduleMonth = new Date();

function initNotionPanel() {
    const btn = document.getElementById('notion-toggle-btn');
    const panel = document.getElementById('notion-panel');
    if (!btn || !panel) return;

    btn.onclick = () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) loadScheduleData();
    };
    panel.querySelector('.panel-close').onclick = () => panel.classList.add('hidden');
}

function loadScheduleData() {
    const container = document.getElementById('notion-content');
    if (!container) return;
    container.innerHTML = '<div style="color:#a08060;font-size:11px;">加载中...</div>';
    _scheduleMonth = new Date();

    fetch('/notion/schedule')
        .then(r => r.json())
        .then(data => {
            _scheduleItems = data.items || [];
            renderCalendar(container);
        })
        .catch(() => {
            container.innerHTML = '<div style="color:#c06050;font-size:11px;">加载失败</div>';
        });
}

function renderCalendar(container) {
    const year = _scheduleMonth.getFullYear();
    const month = _scheduleMonth.getMonth();
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Build event map: date string -> items
    const eventMap = {};
    for (const item of _scheduleItems) {
        if (!item.date) continue;
        const d = item.date.slice(0, 10);
        if (!eventMap[d]) eventMap[d] = [];
        eventMap[d].push(item);
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

    let html = '';
    html += '<div class="cal-month-nav">';
    html += '<button id="cal-prev">\u2039</button>';
    html += '<span>' + year + '年' + monthNames[month] + '</span>';
    html += '<button id="cal-next">\u203a</button>';
    html += '</div>';

    html += '<div class="cal-grid">';
    const dows = ['日','一','二','三','四','五','六'];
    for (const d of dows) html += '<div class="cal-dow">' + d + '</div>';

    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day cal-empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        const hasEvent = eventMap[dateStr];
        const isToday = dateStr === todayStr;
        const allDone = hasEvent && hasEvent.every(e => e.done);
        let cls = 'cal-day';
        if (isToday) cls += ' cal-today-day';
        if (hasEvent) cls += ' cal-has-event';
        if (allDone) cls += ' cal-done';
        html += '<div class="' + cls + '" data-date="' + dateStr + '">' + d + '</div>';
    }
    html += '</div>';

    html += '<div class="cal-events-list" id="cal-events-list"></div>';
    container.innerHTML = html;

    showEventsForDate(todayStr, eventMap);

    container.querySelectorAll('.cal-day.cal-has-event').forEach(el => {
        el.onclick = () => showEventsForDate(el.dataset.date, eventMap);
    });

    document.getElementById('cal-prev').onclick = () => {
        _scheduleMonth.setMonth(_scheduleMonth.getMonth() - 1);
        renderCalendar(container);
    };
    document.getElementById('cal-next').onclick = () => {
        _scheduleMonth.setMonth(_scheduleMonth.getMonth() + 1);
        renderCalendar(container);
    };
}

function showEventsForDate(dateStr, eventMap) {
    const list = document.getElementById('cal-events-list');
    if (!list) return;
    const items = eventMap[dateStr];
    if (!items || items.length === 0) {
        list.innerHTML = '<div style="font-size:10px;color:#a08060;padding:4px 0;">' + dateStr + ' 无日程</div>';
        return;
    }
    let html = '<div style="font-size:9px;color:#a08060;margin-bottom:3px;">' + dateStr + '</div>';
    for (const item of items) {
        const icon = item.done ? '\u2705' : '\u2b1c';
        html += '<div class="cal-event-item">';
        html += '<span class="cal-ev-icon">' + icon + '</span>';
        html += '<span class="cal-ev-name' + (item.done ? ' cal-ev-done' : '') + '">' + esc(item.name) + '</span>';
        if (item.tags && item.tags.length > 0) html += '<span class="cal-ev-tags">' + item.tags.join(', ') + '</span>';
        html += '</div>';
    }
    list.innerHTML = html;
}

// ============================================
// Pet widget (HUD 常驻卡片)
// ============================================
const PET_BEHAVIOR_TEXT = {
    idle: '趴着发呆', sleeping: '睡觉中 zzZ', eating: '在吃猫粮',
    playing: '在玩毛线球', following_awen: '跟着阿文',
    wandering: '到处溜达', grooming: '在舔毛'
};

function updatePetWidget(pet) {
    if (!pet) return;

    // Behavior text
    const behaviorEl = document.getElementById('pet-widget-behavior');
    if (behaviorEl) {
        behaviorEl.textContent = PET_BEHAVIOR_TEXT[pet.behavior] || pet.behavior;
    }

    // Mood emoji
    const moodEl = document.getElementById('pet-mood-emoji');
    if (moodEl && pet.mood) {
        moodEl.textContent = pet.mood.emoji;
    }

    // Mini bars
    const barsEl = document.getElementById('pet-widget-bars');
    if (barsEl && pet.vitals) {
        const keys = ['hunger', 'energy', 'happiness', 'cleanliness'];
        const colors = ['#e8a040', '#88aa44', '#cc6688', '#6688cc'];
        barsEl.innerHTML = keys.map((k, i) => {
            const val = Math.round(pet.vitals[k] || 0);
            return '<div class="pet-mini-bar"><div class="pet-mini-bar-fill" style="width:' + val + '%;background:' + colors[i] + '"></div></div>';
        }).join('');
    }
}

// ============================================
// Pet panel (模拟人生4风格)
// ============================================
function openPetPanel() {
    const panel = document.getElementById('cat-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    const homeScene = game.scene.getScene('HomeScene');
    if (homeScene && homeScene.refreshCatPanel) homeScene.refreshCatPanel();
}

const PET_ACTION_FEEDBACK = {
    pet:   ['土豆开心地蹭了蹭你!', '土豆发出了呼噜声~', '土豆翻了个肚皮让你摸!'],
    feed:  ['土豆吃得很开心!', '咔嚓咔嚓...吃完了!', '土豆舔了舔嘴巴~'],
    play:  ['土豆追着毛线球跑!', '土豆扑来扑去好兴奋!', '土豆玩累了，躺下来喘气~'],
    groom: ['土豆乖乖让你梳毛~', '梳得好舒服，土豆眯起了眼', '毛变得蓬松又漂亮!']
};

function showPetFeedback(text) {
    const fb = document.getElementById('pet-feedback');
    if (!fb) return;
    fb.textContent = text;
    fb.classList.remove('hidden');
    clearTimeout(fb._timer);
    fb._timer = setTimeout(() => fb.classList.add('hidden'), 2500);
}

function doPetAction(action) {
    fetch('/pet/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const msgs = PET_ACTION_FEEDBACK[action] || ['土豆看了你一眼'];
                showPetFeedback(msgs[Math.floor(Math.random() * msgs.length)]);
                if (data.pet) updatePetWidget(data.pet);
                const homeScene = game.scene.getScene('HomeScene');
                if (homeScene && homeScene.refreshCatPanel) homeScene.refreshCatPanel();
            }
        })
        .catch(() => {});
}

// ============================================
// Pet actions (global for onclick)
// ============================================
function petAction(action) {
    const homeScene = game.scene.getScene('HomeScene');
    if (!homeScene || !homeScene.walkToCat) {
        doPetAction(action);
        return;
    }

    // Show walking feedback
    showPetFeedback('大宝走向土豆...');

    // Disable action buttons while walking
    document.querySelectorAll('.pet-action-btn').forEach(b => b.disabled = true);

    homeScene.walkToCat(() => {
        // Re-enable buttons
        document.querySelectorAll('.pet-action-btn').forEach(b => b.disabled = false);
        // Now do the actual interaction
        doPetAction(action);
    });
}

function initCatPanel() {
    const panel = document.getElementById('cat-panel');
    if (!panel) return;
    panel.querySelector('.panel-close')?.addEventListener('click', () => panel.classList.add('hidden'));
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
initCalendarPanel();
initNotionPanel();
initCatPanel();
updateClock();
setInterval(updateClock, 30000);

// Delay socket listener init to ensure socket is connected
setTimeout(() => { initMoneySocket(); initVitalsSocket(); }, 2000);
