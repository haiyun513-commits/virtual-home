const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
// ============================================
// Supabase (for fridge) - optional dependency
// ============================================
let supabase = null;
try {
    console.log('[DEBUG] Starting Supabase init...');
    const dotenvPath = path.join(__dirname, '../memory-system/.env');
    console.log('[DEBUG] dotenvPath:', dotenvPath);
    console.log('[DEBUG] File exists:', fs.existsSync(dotenvPath));
    if (fs.existsSync(dotenvPath)) {
        require('dotenv').config({ path: dotenvPath });
        console.log('[DEBUG] dotenv loaded');
        console.log('[DEBUG] SUPABASE_URL:', process.env.SUPABASE_URL ? 'set' : 'not set');
        console.log('[DEBUG] SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'set' : 'not set');
    } else {
        console.log('[DEBUG] .env file not found');
    }
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
        const { createClient } = require('@supabase/supabase-js');
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        console.log('✅ Supabase connected');
    } else {
        console.log('[DEBUG] Supabase env vars not found, skipping init');
    }
} catch (e) {
    console.log('⚠️ Supabase not available:', e.message);
}

const PORT = 3000;
const STATE_FILE = path.join(__dirname, 'state.json');
const EMOTION_FILE = path.join('/root/.openclaw/workspace/emotion/emotion.json');

// ============================================
// 初始状态
// ============================================
let gameState = {
    users: {
        awen: { room: 'awen-room', activity: '在房间里' },
        dabao: { room: 'living-room', activity: '在客厅' }
    },
    messages: [],
    sharedFeatures: { music: null, book: null },
    notes: [],
    pomodoro: { current: null, history: [] },
    furniture: []
};

// ============================================
// 状态持久化
// ============================================
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            gameState = { ...gameState, ...JSON.parse(data) };
            // 初始化大宝为离线
            if (gameState.users.dabao) gameState.users.dabao.online = false;
            console.log('✅ 状态已加载');
        }
    } catch (e) {
        console.error('❌ 加载状态失败:', e.message);
    }
}

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(gameState, null, 2));
    } catch (e) {
        console.error('❌ 保存状态失败:', e.message);
    }
}

function roomActivity(user, room) {
    const map = {
        'piano-room':  { awen: '在听大宝弹琴', dabao: '在练琴' },
        'awen-room':   { awen: '在看书',       dabao: '来找阿文了' },
        'living-room': { awen: '在客厅待着',   dabao: '在客厅休息' },
        'kitchen':     { awen: '在备茶点',     dabao: '在厨房' },
        'bathroom':    { awen: '洗漱中',       dabao: '洗漱中' },
        'outdoor':     { awen: '出门遛弯中',   dabao: '出门了' }
    };
    return map[room]?.[user] || '在这里';
}

// ============================================
// Express + Socket.io
// ============================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// CORS
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ============================================
// Socket.io 在线状态
// ============================================
const onlineUsers = {};

io.on('connection', (socket) => {
    console.log(`🔌 新连接: ${socket.id}`);

    socket.on('user:online', ({ user }) => {
        onlineUsers[socket.id] = user;
        if (gameState.users[user]) {
            gameState.users[user].online = true;
            saveState();
        }
        io.emit('state:update', gameState);
        console.log(`👤 ${user} 上线`);
    });

    socket.on('character:move', ({ user, room }) => {
        if (gameState.users[user]) {
            gameState.users[user].room = room;
            gameState.users[user].activity = roomActivity(user, room);
            saveState();
            io.emit('state:update', gameState);
        }
    });

    socket.on('disconnect', () => {
        const user = onlineUsers[socket.id];
        if (user && gameState.users[user]) {
            gameState.users[user].online = false;
            saveState();
            io.emit('state:update', gameState);
            console.log(`👤 ${user} 离线`);
        }
        delete onlineUsers[socket.id];
    });
});

// ============================================
// REST API (完整保留，向后兼容)
// ============================================

// GET /state
app.get('/state', (req, res) => {
    res.json(gameState);
});

// POST /move
app.post('/move', (req, res) => {
    const { user, room } = req.body;
    if (!gameState.users[user]) return res.status(400).json({ success: false, error: 'Invalid user' });
    gameState.users[user].room = room;
    gameState.users[user].activity = roomActivity(user, room);
    saveState();
    io.emit('state:update', gameState);
    res.json({ success: true, state: gameState });
});

// POST /message
app.post('/message', (req, res) => {
    const { user, message } = req.body;
    gameState.messages.push({ user, message, timestamp: new Date().toISOString() });
    if (gameState.messages.length > 50) gameState.messages = gameState.messages.slice(-50);
    saveState();
    io.emit('state:update', gameState);
    res.json({ success: true, state: gameState });
});

// POST /custom-status
app.post('/custom-status', (req, res) => {
    const { user, status } = req.body;
    if (!gameState.users[user]) return res.status(400).json({ success: false });
    gameState.users[user].activity = status;
    saveState();
    io.emit('state:update', gameState);
    res.json({ success: true, state: gameState });
});

// POST /clear-chat
app.post('/clear-chat', (req, res) => {
    gameState.messages = [];
    saveState();
    res.json({ success: true, state: gameState });
});

// POST /share-feature
app.post('/share-feature', (req, res) => {
    const { user, type, content } = req.body;
    if (!gameState.sharedFeatures) gameState.sharedFeatures = { music: null, book: null };
    gameState.sharedFeatures[type] = { user, content, timestamp: new Date().toISOString() };
    saveState();
    io.emit('state:update', gameState);
    res.json({ success: true, state: gameState });
});

// POST /post-note
app.post('/post-note', (req, res) => {
    const { user, note } = req.body;
    if (!gameState.notes) gameState.notes = [];
    gameState.notes.push({ user, note, timestamp: new Date().toISOString() });
    if (gameState.notes.length > 50) gameState.notes = gameState.notes.slice(-50);
    saveState();
    io.emit('state:update', gameState);
    res.json({ success: true, state: gameState });
});

// POST /delete-note
app.post('/delete-note', (req, res) => {
    const { timestamp } = req.body;
    gameState.notes = (gameState.notes || []).filter(n => n.timestamp !== timestamp);
    saveState();
    io.emit('state:update', gameState);
    res.json({ success: true, state: gameState });
});

// POST /timer-action
app.post('/timer-action', (req, res) => {
    const { user, action, task } = req.body;
    if (!gameState.pomodoro) gameState.pomodoro = { current: null, history: [] };
    if (action === 'start') {
        gameState.pomodoro.current = { user, task, startTime: new Date().toISOString() };
    } else if (action === 'pause') {
        gameState.pomodoro.current = null;
    }
    saveState();
    res.json({ success: true, state: gameState });
});

// POST /save-pomodoro
app.post('/save-pomodoro', (req, res) => {
    const { user, task, duration } = req.body;
    if (!gameState.pomodoro) gameState.pomodoro = { current: null, history: [] };
    gameState.pomodoro.history.push({ user, task, duration, timestamp: new Date().toISOString() });
    if (gameState.pomodoro.history.length > 100) gameState.pomodoro.history = gameState.pomodoro.history.slice(-100);
    gameState.pomodoro.current = null;
    saveState();
    res.json({ success: true, state: gameState });
});

// POST /awen-update (阿文综合更新接口)
app.post('/awen-update', (req, res) => {
    const { room, status, message } = req.body;
    if (room) gameState.users.awen.room = room;
    if (status) {
        gameState.users.awen.activity = status;
    } else if (room) {
        gameState.users.awen.activity = roomActivity('awen', room);
    }
    if (message) {
        gameState.messages.push({ user: 'awen', message, timestamp: new Date().toISOString() });
        if (gameState.messages.length > 50) gameState.messages = gameState.messages.slice(-50);
    }
    saveState();
    io.emit('state:update', gameState);
    res.json({
        success: true,
        state: gameState,
        updated: {
            room: room || gameState.users.awen.room,
            status: gameState.users.awen.activity,
            messageSent: !!message
        }
    });
});

// GET /emotion (读取阿文情绪数据)
app.get('/emotion', async (req, res) => {
    if (!supabase) {
        return res.json({ calm: 3, happiness: 0, excitement: 0, sadness: 0, nervousness: 0, irritation: 0, heartache: 0, anger: 0, toward: '亲近' });
    }
    try {
        const { data, error } = await supabase
            .from('emotion_state')
            .select('*')
            .single();

        if (error) throw error;

        res.json({
            calm: data.calm || 0,
            happiness: data.happiness || 0,
            excitement: data.excitement || 0,
            sadness: data.sadness || 0,
            nervousness: data.nervousness || 0,
            irritation: data.irritation || 0,
            heartache: data.heartache || 0,
            anger: data.anger || 0,
            toward: data.toward || '亲近'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /save-furniture
app.post('/save-furniture', (req, res) => {
    const { furniture } = req.body;
    gameState.furniture = Array.isArray(furniture) ? furniture : [];
    saveState();
    io.emit('state:update', gameState);
    res.json({ success: true, state: gameState });
});

// POST /emotion-sync (情绪写入后广播，由emotion/write.js调用)
app.post('/emotion-sync', (req, res) => {
    io.emit('emotion:sync', req.body);
    res.json({ success: true });
});

// ============================================
// GET /schedule/today - 今日日程
// ============================================
app.get('/schedule/today', (req, res) => {
    try {
        const schedulePath = path.join(__dirname, '../../schedule-weekly.md');
        if (!fs.existsSync(schedulePath)) {
            return res.json({ day: '', items: [], raw: '日程文件不存在' });
        }
        const content = fs.readFileSync(schedulePath, 'utf8');
        const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const today = days[new Date().getDay()];

        // Parse the section for today
        const sections = content.split(/^## /m).filter(Boolean);
        let items = [];
        let raw = '';
        for (const section of sections) {
            const firstLine = section.split('\n')[0].trim();
            if (firstLine.startsWith(today)) {
                raw = section.trim();
                const lines = section.split('\n').slice(1);
                for (const line of lines) {
                    const match = line.match(/^- (.+)/);
                    if (match) items.push(match[1].trim());
                }
                break;
            }
        }
        res.json({ day: today, items, raw });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// GET /fridge - 冰箱食材列表
// ============================================
app.get('/fridge', async (req, res) => {
    if (!supabase) return res.json({ items: [], grouped: {} });
    try {
        const { data: items, error } = await supabase
            .from('fridge_items')
            .select('*')
            .eq('status', '在库')
            .order('category')
            .order('name');

        if (error) return res.status(500).json({ error: error.message });

        const now = new Date();
        const threeDays = 3 * 24 * 60 * 60 * 1000;

        const enriched = (items || []).map(item => {
            let expiring = false;
            let daysLeft = null;
            if (item.expiry_date) {
                const exp = new Date(item.expiry_date);
                daysLeft = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
                expiring = daysLeft <= 3;
            }
            return { ...item, expiring, daysLeft };
        });

        // Group by category
        const grouped = {};
        for (const item of enriched) {
            const cat = item.category || '其他';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
        }

        res.json({ items: enriched, grouped });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// 启动
// ============================================
loadState();
server.listen(PORT, () => {
    console.log(`
🏠 虚拟家园服务器 v2.0 (Express + Socket.io)
📍 http://localhost:${PORT}
💾 状态: ${STATE_FILE}
    `);
});
