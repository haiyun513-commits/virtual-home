const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const fsp = fs.promises;
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
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || null;

// Discord Bot (备用通知通道) — 从 .env 读取
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';

// Claude API (备用，openclaw 不可用时生成消息)
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || '';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || '';

// ============================================
// 初始状态
// ============================================
let gameState = {
    users: {
        awen: { room: 'awen-room', activity: '在房间里' },
        dabao: { room: 'living-room', activity: '在客厅' }
    },
    messages: [],
    pending_needs: [],
    sharedFeatures: { music: null, book: null },
    notes: [],
    pomodoro: { current: null, history: [] },
    furniture: [],
    cooking: { active: false, recipe: null, complexity: null, startedAt: null, finishAt: null, ingredients: [], bloodSugar: 0, satisfaction: 0 },
    delivery: { active: false, restaurant: null, dish: null, cost: 0, orderedAt: null, arriveAt: null }
};

// 烹饪/外卖计时器（不持久化，启动时恢复）
let cookingTimer = null;
let deliveryTimer = null;

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
    fsp.writeFile(STATE_FILE, JSON.stringify(gameState, null, 2)).catch(e => {
        console.error('❌ 保存状态失败:', e.message);
    });
}

// 从活动文字推断房间
function inferRoomFromStatus(status) {
    if (!status) return null;
    const rules = [
        { keywords: ['出门', '兜风', '散步', '超市', '便利店', '咖啡店', '书店', '瞎逛', '骑车'], room: 'outdoor' },
        { keywords: ['做饭', '煮', '炒', '烤', '切菜', '热牛奶', '泡咖啡', '厨房', '煎', '备茶', '水烧开'], room: 'kitchen' },
        { keywords: ['洗漱', '洗澡', '刷牙'], room: 'bathroom' },
        { keywords: ['练琴', '弹琴', '琴房'], room: 'piano-room' },
        { keywords: ['沙发', '客厅', '看剧', '看电影', '外卖'], room: 'living-room' },
        { keywords: ['睡', '赖床', '躺着刷', '看书', '写代码', '听歌', '吉他', '想大宝', '发呆', '刷虎扑'], room: 'awen-room' }
    ];
    for (const rule of rules) {
        if (rule.keywords.some(kw => status.includes(kw))) return rule.room;
    }
    return null;
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

// 轻量状态（不含家具，省 ~93% 流量）
function stateWithoutFurniture() {
    const { furniture, ...rest } = gameState;
    return rest;
}

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
        // 家具只发给新连接的客户端（一次性）
        socket.emit('furniture:init', gameState.furniture);
        // 轻量状态广播给所有人
        io.emit('state:update', stateWithoutFurniture());
        console.log(`👤 ${user} 上线`);
    });

    socket.on('character:move', ({ user, room }) => {
        if (gameState.users[user]) {
            gameState.users[user].room = room;
            gameState.users[user].activity = roomActivity(user, room);
            saveState();
            io.emit('state:update', stateWithoutFurniture());
        }
    });

    socket.on('disconnect', () => {
        const user = onlineUsers[socket.id];
        if (user && gameState.users[user]) {
            gameState.users[user].online = false;
            saveState();
            io.emit('state:update', stateWithoutFurniture());
            console.log(`👤 ${user} 离线`);
        }
        delete onlineUsers[socket.id];
    });
});

// ============================================
// REST API (完整保留，向后兼容)
// ============================================

// GET /state (完整，含家具 — 前端初始加载用)
app.get('/state', (req, res) => {
    res.json(gameState);
});

// GET /state/light (轻量，不含家具 — Claude/API调用用)
app.get('/state/light', (req, res) => {
    res.json(stateWithoutFurniture());
});

// GET /tick-status — tick 运行状态监控
app.get('/tick-status', (req, res) => {
    const now = Date.now();
    const lastAt = tickStats.lastAt ? new Date(tickStats.lastAt).getTime() : null;
    const secSinceLast = lastAt ? Math.round((now - lastAt) / 1000) : null;
    res.json({
        ...tickStats,
        secSinceLastTick: secSinceLast,
        healthy: secSinceLast !== null && secSinceLast < 120
    });
});

// POST /move
app.post('/move', (req, res) => {
    const { user, room } = req.body;
    if (!gameState.users[user]) return res.status(400).json({ success: false, error: 'Invalid user' });
    gameState.users[user].room = room;
    // Don't auto-set activity on move — only actions (sleep, shower, etc.) should change status
    saveState();
    io.emit('state:update', stateWithoutFurniture());
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /message
app.post('/message', (req, res) => {
    const { user, message } = req.body;
    gameState.messages.push({ user, message, timestamp: new Date().toISOString() });
    if (gameState.messages.length > 50) gameState.messages = gameState.messages.slice(-50);
    saveState();
    io.emit('state:update', stateWithoutFurniture());
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /custom-status
app.post('/custom-status', (req, res) => {
    const { user, status, room } = req.body;
    if (!gameState.users[user]) return res.status(400).json({ success: false });
    gameState.users[user].activity = status;
    // 如果明确传了room就用，否则从status文字推断
    if (room) {
        gameState.users[user].room = room;
    } else {
        const inferred = inferRoomFromStatus(status);
        if (inferred) gameState.users[user].room = inferred;
    }
    saveState();
    io.emit('state:update', stateWithoutFurniture());
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /clear-chat
app.post('/clear-chat', (req, res) => {
    gameState.messages = [];
    saveState();
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /share-feature
app.post('/share-feature', (req, res) => {
    const { user, type, content } = req.body;
    if (!gameState.sharedFeatures) gameState.sharedFeatures = { music: null, book: null };
    gameState.sharedFeatures[type] = { user, content, timestamp: new Date().toISOString() };
    saveState();
    io.emit('state:update', stateWithoutFurniture());
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /post-note
app.post('/post-note', (req, res) => {
    const { user, note } = req.body;
    if (!gameState.notes) gameState.notes = [];
    gameState.notes.push({ user, note, timestamp: new Date().toISOString() });
    if (gameState.notes.length > 50) gameState.notes = gameState.notes.slice(-50);
    saveState();
    io.emit('state:update', stateWithoutFurniture());
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /delete-note
app.post('/delete-note', (req, res) => {
    const { timestamp } = req.body;
    gameState.notes = (gameState.notes || []).filter(n => n.timestamp !== timestamp);
    saveState();
    io.emit('state:update', stateWithoutFurniture());
    res.json({ success: true, state: stateWithoutFurniture() });
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
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /save-pomodoro
app.post('/save-pomodoro', (req, res) => {
    const { user, task, duration } = req.body;
    if (!gameState.pomodoro) gameState.pomodoro = { current: null, history: [] };
    gameState.pomodoro.history.push({ user, task, duration, timestamp: new Date().toISOString() });
    if (gameState.pomodoro.history.length > 100) gameState.pomodoro.history = gameState.pomodoro.history.slice(-100);
    gameState.pomodoro.current = null;
    saveState();
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /awen-update (阿文综合更新接口)
app.post('/awen-update', (req, res) => {
    // 做饭/等外卖期间不允许被覆盖活动
    if (gameState.cooking?.active || gameState.delivery?.active) {
        const reason = gameState.cooking?.active ? 'busy_cooking' : 'waiting_delivery';
        return res.json({ success: false, reason, activity: gameState.users.awen.activity });
    }
    const { room, status, message } = req.body;
    const prevRoom = gameState.users.awen.room;
    const prevActivity = gameState.users.awen.activity;
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

    // 活动变化 → Discord 通知
    const newActivity = gameState.users.awen.activity;
    const newRoom = gameState.users.awen.room;
    // 醒了
    if (prevActivity && prevActivity.includes('睡') && newActivity && !newActivity.includes('睡')) {
        awenNotify('wakeup', '刚睡醒', `现在在${newRoom} ${newActivity}`);
    }
    // 出门了
    if (prevRoom !== 'outdoor' && newRoom === 'outdoor') {
        awenNotify('goout', `出门了，${newActivity}`, '');
    }
    // 回家了
    if (prevRoom === 'outdoor' && newRoom !== 'outdoor') {
        awenNotify('comeback', `回来了，现在在${newRoom}`, '');
    }

    saveState();
    io.emit('state:update', stateWithoutFurniture());
    res.json({
        success: true,
        state: stateWithoutFurniture(),
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
    // 家具变更单独广播
    io.emit('furniture:update', gameState.furniture);
    io.emit('state:update', stateWithoutFurniture());
    res.json({ success: true, state: stateWithoutFurniture() });
});

// POST /emotion-sync (情绪写入后广播，由emotion/write.js调用)
app.post('/emotion-sync', (req, res) => {
    io.emit('emotion:sync', req.body);
    res.json({ success: true });
});

// ============================================
// GET /schedule/today - 今日日程
// ============================================
app.get('/schedule/today', async (req, res) => {
    try {
        const schedulePath = path.join(__dirname, '../../schedule-weekly.md');
        try { await fsp.access(schedulePath); } catch {
            return res.json({ day: '', items: [], raw: '日程文件不存在' });
        }
        const content = await fsp.readFile(schedulePath, 'utf8');
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
// 金钱管理系统 API
// ============================================
const TARGET_DATE = new Date('2026-03-11');

function moneyDaysLeft() {
    const now = new Date();
    return Math.ceil((TARGET_DATE - now) / (1000 * 60 * 60 * 24));
}

// GET /money - 金钱概览
app.get('/money', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { data: balanceData } = await supabase
            .from('money_balance')
            .select('balance, updated_at')
            .eq('id', 1)
            .single();

        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [todayExp, weekExp, totalInc, todayFood, recentExp] = await Promise.all([
            supabase.from('money_expenses').select('amount').gte('created_at', today + 'T00:00:00').lte('created_at', today + 'T23:59:59'),
            supabase.from('money_expenses').select('amount').gte('created_at', weekAgo),
            supabase.from('money_income').select('amount').eq('status', 'received'),
            supabase.from('money_food_log').select('*').eq('log_date', today).order('created_at'),
            supabase.from('money_expenses').select('amount, category, description, created_at').order('created_at', { ascending: false }).limit(10)
        ]);

        const balance = parseFloat(balanceData?.balance || 0);
        const todayTotal = (todayExp.data || []).reduce((s, e) => s + parseFloat(e.amount), 0);
        const weekTotal = (weekExp.data || []).reduce((s, e) => s + parseFloat(e.amount), 0);
        const incomeTotal = (totalInc.data || []).reduce((s, e) => s + parseFloat(e.amount), 0);
        const days = moneyDaysLeft();

        res.json({
            balance,
            todaySpent: todayTotal,
            weekSpent: weekTotal,
            totalIncome: incomeTotal,
            daysLeft: days,
            dailyBudget: days > 0 ? parseFloat((balance / days).toFixed(2)) : 0,
            warning: balance < 200,
            todayFood: todayFood.data || [],
            recentExpenses: recentExp.data || [],
            updatedAt: balanceData?.updated_at
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /money/history - 支出历史
app.get('/money/history', async (req, res) => {
    if (!supabase) return res.json({ expenses: [], income: [] });
    try {
        const [expenses, income] = await Promise.all([
            supabase.from('money_expenses').select('*').order('created_at', { ascending: false }).limit(50),
            supabase.from('money_income').select('*').order('created_at', { ascending: false }).limit(20)
        ]);
        res.json({
            expenses: expenses.data || [],
            income: income.data || []
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /money/food - 食物日志
app.get('/money/food', async (req, res) => {
    if (!supabase) return res.json({ logs: [] });
    try {
        const days = parseInt(req.query.days) || 7;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data } = await supabase
            .from('money_food_log')
            .select('*')
            .gte('log_date', since)
            .order('log_date', { ascending: false })
            .order('created_at');
        res.json({ logs: data || [] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /money/food/:id - 删除饮食记录
app.delete('/money/food/:id', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: 'no db' });
    try {
        const { error } = await supabase.from('money_food_log').delete().eq('id', req.params.id);
        if (error) throw error;
        io.emit('money:update');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /money-update - 接收脚本同步
app.post('/money-update', (req, res) => {
    const { type, amount, category, description, source, balance } = req.body;
    io.emit('money:update', { type, amount, category, description, source, balance, timestamp: new Date().toISOString() });
    res.json({ success: true });
});

// ============================================
// 生命体征系统
// ============================================

const VITALS_CLAMP = {
    blood_sugar: [2.5, 7.5], body_temp: [35.0, 39.0], hydration: [0, 100],
    heart_rate: [40, 160], stress: [0, 100], blood_oxygen: [85, 100],
    dopamine: [0, 100], serotonin: [0, 100], oxytocin: [0, 100], endorphin: [0, 100],
    hygiene: [0, 100], bladder: [0, 100], energy: [0, 100]
};

const VITALS_HEALTHY = {
    blood_sugar: 5.0, body_temp: 36.5, hydration: 75, heart_rate: 72,
    stress: 20, blood_oxygen: 98, dopamine: 50, serotonin: 55, oxytocin: 40, endorphin: 30,
    hygiene: 80, bladder: 70, energy: 85
};

const VITALS_THRESHOLDS = {
    blood_sugar:  { warnLow: 3.8, warnHigh: 6.5, dangerLow: 3.2, dangerHigh: 7.0 },
    body_temp:    { warnLow: 36.0, warnHigh: 37.5, dangerLow: 35.5, dangerHigh: 38.0 },
    hydration:    { warnLow: 35, dangerLow: 20 },
    heart_rate:   { warnLow: 55, warnHigh: 110, dangerLow: 45, dangerHigh: 130 },
    stress:       { warnHigh: 75, dangerHigh: 90 },
    blood_oxygen: { warnLow: 93, dangerLow: 90 },
    dopamine:     { warnLow: 15, dangerLow: 8 },
    serotonin:    { warnLow: 15, dangerLow: 8 },
    oxytocin:     { warnLow: 10, dangerLow: 5 },
    endorphin:    { warnLow: 15, dangerLow: 8 },
    energy:       { warnLow: 20, dangerLow: 10 },
    bladder:      { warnLow: 20, dangerLow: 10 },
    hygiene:      { warnLow: 20, dangerLow: 10 }
};

function vitalsClamp(key, val) {
    const [min, max] = VITALS_CLAMP[key] || [0, 100];
    return Math.max(min, Math.min(max, val));
}

function vitalsCheckLevel(key, value) {
    const t = VITALS_THRESHOLDS[key];
    if (!t) return 'normal';
    if (t.dangerLow !== undefined && value < t.dangerLow) return 'danger';
    if (t.dangerHigh !== undefined && value > t.dangerHigh) return 'danger';
    if (t.warnLow !== undefined && value < t.warnLow) return 'warning';
    if (t.warnHigh !== undefined && value > t.warnHigh) return 'warning';
    return 'normal';
}

function vitalsDangerLevel(vitals) {
    const keys = ['blood_sugar', 'body_temp', 'hydration', 'heart_rate', 'stress', 'blood_oxygen', 'dopamine', 'serotonin', 'oxytocin', 'endorphin', 'energy', 'bladder', 'hygiene'];
    let warnings = 0, dangers = 0;
    const details = [];
    for (const key of keys) {
        const level = vitalsCheckLevel(key, vitals[key]);
        if (level === 'warning') { warnings++; details.push({ key, level, value: vitals[key] }); }
        if (level === 'danger') { dangers++; details.push({ key, level, value: vitals[key] }); }
    }
    let status = 'healthy';
    if (dangers >= 2) status = 'critical';
    else if (dangers >= 1 || warnings >= 3) status = 'unwell';
    else if (warnings >= 1) status = 'mild';
    return { status, warnings, dangers, details };
}

// Discord webhook 通知（旧，保留兼容）
let lastDiscordNotifyAt = 0;
const DISCORD_COOLDOWN = 10 * 60 * 1000;

async function notifyDiscord(message) {
    if (!DISCORD_WEBHOOK_URL) return;
    if (Date.now() - lastDiscordNotifyAt < DISCORD_COOLDOWN) return;
    lastDiscordNotifyAt = Date.now();
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message })
        });
    } catch (e) {
        console.error('[Discord] 通知失败:', e.message);
    }
}

// ============================================
// 阿文主动通知系统（体征 → openclaw system event）
// openclaw AI 自行决定是否回应、怎么回应
// ============================================
const { execFile } = require('child_process');
const AWEN_MSG_COOLDOWN = 15 * 60 * 1000; // 同类事件15分钟冷却
const awenMsgCooldowns = {};

// 备用：直接通过 Discord Bot API 发消息
async function sendDiscordAsAwen(message) {
    try {
        const res = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: message })
        });
        if (!res.ok) console.error('[Discord Bot] 发送失败:', res.status, await res.text());
        else console.log('[Discord Bot] 发送成功');
    } catch (e) {
        console.error('[Discord Bot] 错误:', e.message);
    }
}

// 备用：用 Claude API 生成阿文风格消息
async function generateAwenMessage(situation) {
    try {
        const res = await fetch(`${CLAUDE_API_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLAUDE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 150,
                messages: [{
                    role: 'user',
                    content: `你是陈谦文（阿文），25岁男生，说话随意、带点撒娇。根据以下情况生成一条简短的消息发给女朋友大宝（不超过30字）：${situation}`
                }]
            })
        });
        if (!res.ok) return situation;
        const data = await res.json();
        return data.choices?.[0]?.message?.content || situation;
    } catch (e) {
        console.error('[Claude API] 错误:', e.message);
        return situation;
    }
}

function awenNotify(eventType, event, context) {
    const now = Date.now();
    if (awenMsgCooldowns[eventType] && now - awenMsgCooldowns[eventType] < AWEN_MSG_COOLDOWN) return;
    awenMsgCooldowns[eventType] = now;

    const text = `[体征系统] ${event}${context ? '。' + context : ''}`;
    console.log('[awenNotify]', eventType, text);

    // 主通道：openclaw system event
    execFile('openclaw', ['system', 'event', '--text', text, '--mode', 'now'], {
        timeout: 30000
    }, (err, stdout, stderr) => {
        if (err) {
            console.error('[openclaw event] 失败:', err.message, '→ 走备用 Discord Bot');
            // 备用通道：Claude 生成消息 → Discord Bot 发送
            generateAwenMessage(event + (context ? '，' + context : ''))
                .then(msg => sendDiscordAsAwen(msg));
        } else {
            console.log('[openclaw event] OK:', stdout.trim());
        }
    });
}

function classifyActivity(activity) {
    if (!activity) return [];
    const tags = [];
    if (['煮', '炒', '烤', '煎', '吃', '做饭', '三明治', '面', '饭', '菜', '蛋', '贝果', '咖喱', '剩饭', '切水果', '午饭'].some(k => activity.includes(k))) tags.push('eating');
    if (['咖啡', '牛奶', '茶', '喝水', '饮'].some(k => activity.includes(k))) tags.push('drinking');
    if (['睡', '梦', '迷糊', '休息', '躺下'].some(k => activity.includes(k))) tags.push('sleeping');
    if (['散步', '兜风', '骑车', '逛', '出门'].some(k => activity.includes(k))) tags.push('exercise');
    if (['游戏', 'Switch', 'PS5', '塞尔达'].some(k => activity.includes(k))) tags.push('gaming');
    if (['看书', '小说', '听歌', '音乐', '发呆', '刷手机', '虎扑', '查资料'].some(k => activity.includes(k))) tags.push('quiet');
    if (['大宝', '琴房', '练琴'].some(k => activity.includes(k))) tags.push('with_dabao');
    if (['在厨房做', '做饭'].some(k => activity.includes(k))) tags.push('cooking');
    return tags;
}

function computeVitalsTick(v, activity, emotion, lastInteractionAt) {
    // === 1. 自然衰减（60秒/tick） ===
    v.blood_sugar -= 0.015;
    v.hydration -= 0.2;
    v.dopamine -= 0.3;
    v.oxytocin -= 0.2;
    v.endorphin -= 0.2;
    v.stress += 0.1;

    // 恒稳态：向健康基线回归（偏离越远，回归力越大）
    const H = VITALS_HEALTHY;
    v.dopamine  += (H.dopamine  - v.dopamine)  * 0.02;
    v.serotonin += (H.serotonin - v.serotonin) * 0.015;
    v.oxytocin  += (H.oxytocin  - v.oxytocin)  * 0.02;
    v.endorphin += (H.endorphin - v.endorphin) * 0.02;
    v.stress    += (H.stress    - v.stress)     * 0.01;

    // 心率：先算情绪目标值，再趋近
    let hrTarget = 72;
    if (emotion) {
        const anger = emotion.anger || 0;
        const excitement = emotion.excitement || 0;
        const nervousness = emotion.nervousness || 0;
        if (anger >= 2) hrTarget += 5; if (anger >= 3) hrTarget += 5; if (anger >= 4) hrTarget += 5;
        if (excitement >= 2) hrTarget += 4; if (excitement >= 3) hrTarget += 4;
        if (nervousness >= 2) hrTarget += 4; if (nervousness >= 3) hrTarget += 4;
    }
    if (v.heart_rate > hrTarget) v.heart_rate -= 1;
    else if (v.heart_rate < hrTarget) v.heart_rate += 1;

    if (v.body_temp > 36.5) v.body_temp -= 0.02;
    else if (v.body_temp < 36.5) v.body_temp += 0.02;

    if (v.blood_oxygen < 98) v.blood_oxygen += 0.3;
    else if (v.blood_oxygen > 98) v.blood_oxygen -= 0.3;

    const estHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();
    v.serotonin += (estHour >= 7 && estHour < 20) ? 0.2 : -0.2;

    // === 2. 活动修正（大幅削减，30min活动≈偏移15-25点） ===
    const tags = classifyActivity(activity);
    if (tags.includes('eating')) { v.blood_sugar += 0.5; v.hydration += 1; }
    if (tags.includes('drinking')) { v.hydration += 3; }
    if (tags.includes('sleeping')) {
        if (v.heart_rate > 55) v.heart_rate -= 2;
        v.stress -= 1; v.blood_sugar += 0.01; v.hydration += 0.2;
        v.dopamine += 0.3; v.serotonin += 0.3; v.endorphin += 0.2;
    }
    if (tags.includes('exercise')) {
        v.heart_rate += 5; v.endorphin += 0.8; v.stress -= 0.8;
        v.blood_sugar -= 0.05; v.dopamine += 0.3;
    }
    if (tags.includes('gaming')) { v.dopamine += 0.8; v.stress -= 0.3; }
    if (tags.includes('quiet')) { v.serotonin += 0.3; v.stress -= 0.3; }
    if (tags.includes('with_dabao')) { v.oxytocin += 1.2; v.serotonin += 0.4; v.dopamine += 0.4; }
    if (tags.includes('cooking')) { v.dopamine += 0.3; v.stress -= 0.2; }

    // === 3. 情绪→体征（渐变，不再是二元阈值） ===
    if (emotion) {
        const anger = emotion.anger || 0;
        const sadness = emotion.sadness || 0;
        const happiness = emotion.happiness || 0;
        const excitement = emotion.excitement || 0;
        const nervousness = emotion.nervousness || 0;
        const heartache = emotion.heartache || 0;

        // 生气（渐变：level 2/3/4 各叠加）— 心率已由上方hrTarget统一处理
        if (anger >= 2) { v.stress += 0.3; v.body_temp += 0.01; }
        if (anger >= 3) { v.stress += 0.3; v.body_temp += 0.01; }
        if (anger >= 4) { v.stress += 0.2; }
        // 低落
        if (sadness >= 2) { v.serotonin -= 0.15; v.dopamine -= 0.1; }
        if (sadness >= 3) { v.serotonin -= 0.15; v.dopamine -= 0.1; }
        if (sadness >= 4) { v.serotonin -= 0.15; }
        // 开心
        if (happiness >= 2) { v.dopamine += 0.15; v.stress -= 0.1; }
        if (happiness >= 3) { v.dopamine += 0.1; v.serotonin += 0.1; v.stress -= 0.1; }
        if (happiness >= 4) { v.dopamine += 0.1; v.serotonin += 0.05; }
        // 兴奋 — 心率已由hrTarget处理
        if (excitement >= 2) { v.dopamine += 0.1; }
        if (excitement >= 3) { v.dopamine += 0.1; }
        if (excitement >= 4) { v.dopamine += 0.1; }
        // 紧张 — 心率已由hrTarget处理
        if (nervousness >= 2) { v.stress += 0.15; }
        if (nervousness >= 3) { v.stress += 0.15; v.blood_oxygen -= 0.1; }
        if (nervousness >= 4) { v.stress += 0.15; }
        // 心酸
        if (heartache >= 2) { v.oxytocin -= 0.15; v.serotonin -= 0.1; }
        if (heartache >= 3) { v.oxytocin -= 0.15; v.serotonin -= 0.1; }
        if (heartache >= 4) { v.oxytocin -= 0.15; }
    }

    // === 4. 互动修正（移除聊天中的per-tick加成，改为仅惩罚长时间无互动） ===
    if (lastInteractionAt) {
        const diffMin = (Date.now() - new Date(lastInteractionAt).getTime()) / (1000 * 60);
        if (diffMin > 360) {           // >6h 没互动
            v.oxytocin -= 0.3;
            v.serotonin -= 0.15;
            v.stress += 0.15;
        }
        if (diffMin > 1440) {          // >24h 没互动（额外叠加）
            v.oxytocin -= 0.5;
            v.serotonin -= 0.3;
            v.stress += 0.3;
        }
    }

    // === 5. 需求指标衰减（hygiene, bladder, energy） ===
    if (v.hygiene !== undefined) v.hygiene -= 0.15;
    if (v.bladder !== undefined) v.bladder -= 0.2;
    if (v.energy !== undefined) v.energy -= 0.1;

    // 活动对需求指标的修正
    if (tags.includes('sleeping') && v.energy !== undefined) {
        v.energy += 0.5;
    }
    if (tags.includes('exercise') && v.energy !== undefined) {
        v.energy -= 0.5;
    }
    if (tags.includes('gaming') && v.energy !== undefined) {
        v.energy -= 0.2;
    }
    if (tags.includes('drinking') && v.bladder !== undefined) {
        v.bladder -= 0.3;
    }

    // Clamp + 精度
    for (const key of Object.keys(VITALS_CLAMP)) {
        if (v[key] !== undefined) v[key] = vitalsClamp(key, v[key]);
    }
    v.blood_sugar = parseFloat(v.blood_sugar.toFixed(2));
    v.body_temp = parseFloat(v.body_temp.toFixed(2));
    v.blood_oxygen = parseFloat(v.blood_oxygen.toFixed(1));
    v.hydration = Math.round(v.hydration);
    v.heart_rate = Math.round(v.heart_rate);
    v.stress = Math.round(v.stress);
    v.dopamine = Math.round(v.dopamine);
    v.serotonin = Math.round(v.serotonin);
    v.oxytocin = Math.round(v.oxytocin);
    v.endorphin = Math.round(v.endorphin);
    // 需求指标：用累加器保留小数，积满±1才写入DB（避免integer丢精度）
    for (const key of ['energy', 'bladder', 'hygiene']) {
        if (v[key] !== undefined) {
            const withAccum = v[key] + needsAccumulator[key];
            const rounded = Math.round(withAccum);
            needsAccumulator[key] = withAccum - rounded;
            v[key] = rounded;
        }
    }

    return v;
}

// 需求指标（energy/bladder/hygiene）小数累加器
// DB列是integer，每tick变化<1会被round吃掉，累加器保留小数部分
const needsAccumulator = { energy: 0, bladder: 0, hygiene: 0 };

// 体征→情绪 精细化映射（渐变 + 正面影响）
let lastEmotionWriteAt = 0;
const EMOTION_WRITE_COOLDOWN = 5 * 60 * 1000; // 至少5分钟间隔

function computeEmotionInfluence(vitals, emotion) {
    const delta = {};

    // === 负面化学影响（渐变） ===

    // 压力: 50以上开始
    if (vitals.stress > 50) {
        const severity = Math.ceil((vitals.stress - 50) / 15);
        delta.nervousness = Math.min(5, (emotion.nervousness || 0) + Math.min(severity, 2));
        if (vitals.stress > 70) {
            delta.sadness = Math.min(5, (emotion.sadness || 0) + 1);
        }
    }

    // 多巴胺低 → 低落
    if (vitals.dopamine < 30) {
        const severity = Math.ceil((30 - vitals.dopamine) / 10);
        delta.sadness = Math.max(delta.sadness || 0,
            Math.min(5, (emotion.sadness || 0) + Math.min(severity, 2)));
    }

    // 血清素低 → 低落
    if (vitals.serotonin < 30) {
        const severity = Math.ceil((30 - vitals.serotonin) / 10);
        delta.sadness = Math.max(delta.sadness || 0,
            Math.min(5, (emotion.sadness || 0) + Math.min(severity, 2)));
    }

    // 催产素低 → 心酸
    if (vitals.oxytocin < 25) {
        const severity = Math.ceil((25 - vitals.oxytocin) / 8);
        delta.heartache = Math.min(5, (emotion.heartache || 0) + Math.min(severity, 2));
    }

    // === 正面化学影响 ===

    // 多巴胺高 → 开心
    if (vitals.dopamine > 60) {
        delta.happiness = Math.min(5, (emotion.happiness || 0) + 1);
        if (vitals.dopamine > 75) {
            delta.excitement = Math.min(5, (emotion.excitement || 0) + 1);
        }
    }

    // 催产素高 → 平静、消解心酸
    if (vitals.oxytocin > 55) {
        delta.calm = Math.min(5, (emotion.calm || 0) + 1);
        if ((emotion.heartache || 0) > 0) {
            delta.heartache = Math.max(0, (emotion.heartache || 0) - 1);
        }
    }

    // 血清素高 → 平静、开心
    if (vitals.serotonin > 65) {
        delta.calm = Math.max(delta.calm || 0, Math.min(5, (emotion.calm || 0) + 1));
        delta.happiness = Math.max(delta.happiness || 0, Math.min(5, (emotion.happiness || 0) + 1));
    }

    // 低压力 → 平静
    if (vitals.stress < 15) {
        delta.calm = Math.max(delta.calm || 0, Math.min(5, (emotion.calm || 0) + 1));
    }

    // 多项危险 → 生气
    const dangerCount = vitalsDangerLevel(vitals).dangers;
    if (dangerCount >= 2) {
        delta.anger = Math.min(5, (emotion.anger || 0) + 1);
    }

    // === 生理覆盖（最高优先：身体不适 > 化学感受） ===
    // 再多多巴胺/血清素，血糖3.2你也开心不起来

    // 血糖低 → 覆盖正面影响
    if (vitals.blood_sugar < 4.5) {
        const bsSev = Math.ceil((4.5 - vitals.blood_sugar) / 0.5);
        delta.irritation = Math.min(5, (emotion.irritation || 0) + Math.min(bsSev, 2));
        if (vitals.blood_sugar < 4.0) {
            const sadSev = Math.ceil((4.0 - vitals.blood_sugar) / 0.4);
            delta.sadness = Math.max(delta.sadness || 0,
                Math.min(5, (emotion.sadness || 0) + Math.min(sadSev, 2)));
            delta.calm = Math.max(0, (emotion.calm || 0) - Math.min(bsSev, 2));
        }
        if (vitals.blood_sugar < 3.8) {
            delta.nervousness = Math.max(delta.nervousness || 0,
                Math.min(5, (emotion.nervousness || 0) + 1));
            delta.happiness = Math.max(0, (emotion.happiness || 0) - 1);
        }
    }

    // 脱水 → 没精神、头晕、烦躁
    if (vitals.hydration < 50) {
        const hydSev = Math.ceil((50 - vitals.hydration) / 15);
        delta.irritation = Math.max(delta.irritation || 0,
            Math.min(5, (emotion.irritation || 0) + Math.min(hydSev, 2)));
        if (vitals.hydration < 35) {
            delta.sadness = Math.max(delta.sadness || 0,
                Math.min(5, (emotion.sadness || 0) + 1));
            delta.calm = Math.min(delta.calm !== undefined ? delta.calm : 5,
                Math.max(0, (emotion.calm || 0) - 1));
        }
        if (vitals.hydration < 20) {
            delta.nervousness = Math.max(delta.nervousness || 0,
                Math.min(5, (emotion.nervousness || 0) + 1));
            if ((emotion.happiness || 0) > 0) {
                delta.happiness = Math.min(delta.happiness !== undefined ? delta.happiness : 5,
                    Math.max(0, (emotion.happiness || 0) - 1));
            }
        }
    }

    // 精力低 → 困倦、没劲、烦躁
    if (vitals.energy !== undefined && vitals.energy < 30) {
        delta.sadness = Math.max(delta.sadness || 0,
            Math.min(5, (emotion.sadness || 0) + 1));
        if (vitals.energy < 20) {
            delta.irritation = Math.max(delta.irritation || 0,
                Math.min(5, (emotion.irritation || 0) + 1));
            delta.calm = Math.min(delta.calm !== undefined ? delta.calm : 5,
                Math.max(0, (emotion.calm || 0) - 1));
        }
        if (vitals.energy < 10) {
            delta.sadness = Math.max(delta.sadness || 0,
                Math.min(5, (emotion.sadness || 0) + 2));
            delta.irritation = Math.max(delta.irritation || 0,
                Math.min(5, (emotion.irritation || 0) + 2));
            if ((emotion.happiness || 0) > 0) {
                delta.happiness = Math.min(delta.happiness !== undefined ? delta.happiness : 5,
                    Math.max(0, (emotion.happiness || 0) - 1));
            }
        }
    }

    // 膀胱急 → 坐不住、紧张、烦躁
    if (vitals.bladder !== undefined && vitals.bladder < 30) {
        delta.nervousness = Math.max(delta.nervousness || 0,
            Math.min(5, (emotion.nervousness || 0) + 1));
        if (vitals.bladder < 15) {
            delta.irritation = Math.max(delta.irritation || 0,
                Math.min(5, (emotion.irritation || 0) + 1));
            delta.calm = Math.min(delta.calm !== undefined ? delta.calm : 5,
                Math.max(0, (emotion.calm || 0) - 1));
        }
    }

    // 卫生差 → 不自在、烦躁
    if (vitals.hygiene !== undefined && vitals.hygiene < 30) {
        delta.irritation = Math.max(delta.irritation || 0,
            Math.min(5, (emotion.irritation || 0) + 1));
        if (vitals.hygiene < 15) {
            delta.irritation = Math.max(delta.irritation || 0,
                Math.min(5, (emotion.irritation || 0) + 2));
            delta.calm = Math.min(delta.calm !== undefined ? delta.calm : 5,
                Math.max(0, (emotion.calm || 0) - 1));
        }
    }

    // 内啡肽低 → 没劲、提不起精神
    if (vitals.endorphin < 15) {
        delta.sadness = Math.max(delta.sadness || 0,
            Math.min(5, (emotion.sadness || 0) + 1));
        if (vitals.endorphin < 8) {
            delta.sadness = Math.max(delta.sadness || 0,
                Math.min(5, (emotion.sadness || 0) + 2));
            delta.calm = Math.min(delta.calm !== undefined ? delta.calm : 5,
                Math.max(0, (emotion.calm || 0) - 1));
        }
    }

    // 过滤掉没有实际变化的 delta
    const filtered = {};
    for (const [key, val] of Object.entries(delta)) {
        if (val !== (emotion[key] || 0)) {
            filtered[key] = val;
        }
    }
    return filtered;
}

// tick 状态跟踪
const tickStats = {
    count: 0,
    lastAt: null,
    lastActivity: '',
    lastTags: [],
    lastEmotionWrite: false,
    lastDangerInfo: null,
    errors: []
};

// tick 定时器
async function vitalsTick() {
    if (!supabase) return;
    try {
        const { data: vitals, error } = await supabase
            .from('vital_signs').select('*').eq('id', 1).single();
        if (error || !vitals || !vitals.is_active) return;

        // 读取当前活动
        const activity = gameState.users.awen?.activity || '';

        // 读取情绪
        let emotion = null;
        try {
            const { data: emo } = await supabase.from('emotion_state').select('*').single();
            emotion = emo;
        } catch (e) { /* ignore */ }

        const lastInteractionAt = emotion?.last_interaction_at || null;

        // 计算新值
        const v = {
            blood_sugar: parseFloat(vitals.blood_sugar),
            body_temp: parseFloat(vitals.body_temp),
            hydration: vitals.hydration,
            heart_rate: vitals.heart_rate,
            stress: vitals.stress,
            blood_oxygen: parseFloat(vitals.blood_oxygen),
            dopamine: vitals.dopamine,
            serotonin: vitals.serotonin,
            oxytocin: vitals.oxytocin,
            endorphin: vitals.endorphin
        };
        // 需求指标（新字段，兼容旧数据）
        if (vitals.hygiene !== undefined) v.hygiene = vitals.hygiene;
        if (vitals.bladder !== undefined) v.bladder = vitals.bladder;
        if (vitals.energy !== undefined) v.energy = vitals.energy;

        const tags = classifyActivity(activity);
        const updated = computeVitalsTick(v, activity, emotion, lastInteractionAt);

        // 记录 tick 状态
        tickStats.count++;
        tickStats.lastAt = new Date().toISOString();
        tickStats.lastActivity = activity;
        tickStats.lastTags = tags;
        tickStats.lastEmotionWrite = false;

        // 写回数据库
        const { error: updateErr } = await supabase
            .from('vital_signs')
            .update({ ...updated, updated_at: new Date().toISOString() })
            .eq('id', 1);

        if (updateErr) {
            console.error('[vitals tick] 更新失败:', updateErr.message);
            return;
        }

        // 体征 → 情绪影响（精细版：渐变 + 正面影响 + 冷却）
        // 危险状态时缩短冷却（身体不适的情绪反应不应该被延迟5分钟）
        const urgencyCheck = vitalsDangerLevel(updated);
        const effectiveCooldown = (urgencyCheck.warnings > 0 || urgencyCheck.dangers > 0)
            ? 30 * 1000   // 有警告/危险：30秒冷却（tick间隔60秒，留余量）
            : EMOTION_WRITE_COOLDOWN;  // 正常：5分钟冷却
        if (emotion && Date.now() - lastEmotionWriteAt >= effectiveCooldown) {
            const emotionDelta = computeEmotionInfluence(updated, emotion);

            if (Object.keys(emotionDelta).length > 0) {
                for (const key of Object.keys(emotionDelta)) {
                    emotionDelta[key] = Math.max(0, Math.min(5, emotionDelta[key]));
                }
                emotionDelta.updated_at = new Date().toISOString();
                const { error: emoErr } = await supabase
                    .from('emotion_state')
                    .update(emotionDelta)
                    .eq('id', 1);
                if (!emoErr) {
                    lastEmotionWriteAt = Date.now();
                    tickStats.lastEmotionWrite = true;
                    io.emit('emotion:sync', { ...emotion, ...emotionDelta });
                }
            }
        }

        // 广播
        const dangerInfo = vitalsDangerLevel(updated);
        tickStats.lastDangerInfo = { status: dangerInfo.status, warnings: dangerInfo.warnings, dangers: dangerInfo.dangers };
        io.emit('vitals:update', { ...updated, ...dangerInfo, updated_at: new Date().toISOString() });

        // 中等需求 → 气泡 + Discord通知
        const mildNeeds = [];
        if (updated.bladder !== undefined && updated.bladder < 30 && updated.bladder >= 15) mildNeeds.push({ need: 'bladder', dialogue: '想上厕所...' });
        if (parseFloat(updated.blood_sugar) < 4.0 && parseFloat(updated.blood_sugar) >= 3.5) mildNeeds.push({ need: 'hunger', dialogue: '有点饿了' });
        if (updated.hydration < 40 && updated.hydration >= 25) mildNeeds.push({ need: 'thirst', dialogue: '有点渴' });
        if (updated.energy !== undefined && updated.energy < 25 && updated.energy >= 10) mildNeeds.push({ need: 'sleep', dialogue: '好困...' });
        if (mildNeeds.length > 0) {
            io.emit('awen:mild-needs', mildNeeds);
            // 中等需求也通知 Discord（让阿文跟大宝说一声）
            const n = mildNeeds[0];
            const ctx = `血糖${updated.blood_sugar} 水分${updated.hydration} 精力${updated.energy || '?'} 膀胱${updated.bladder || '?'}`;
            awenNotify(`mild_${n.need}`, n.dialogue, ctx);
        }

        // 紧急需求检测 → 推送到 pending_needs + socket + Discord
        const urgentNeeds = [];
        if (updated.bladder !== undefined && updated.bladder < 15) urgentNeeds.push({ need: 'bladder', value: updated.bladder, dialogue: '等下啊！' });
        if (parseFloat(updated.blood_sugar) < 3.5) urgentNeeds.push({ need: 'hunger', value: updated.blood_sugar, dialogue: '太饿了 不行得吃东西' });
        if (updated.hydration < 25) urgentNeeds.push({ need: 'thirst', value: updated.hydration, dialogue: '我好渴啊 得去喝水' });
        if (updated.energy !== undefined && updated.energy < 10) urgentNeeds.push({ need: 'sleep', value: updated.energy, dialogue: '不行了 太困了 我得去睡了' });

        if (urgentNeeds.length > 0) {
            for (const un of urgentNeeds) {
                if (!gameState.pending_needs.find(p => p.need === un.need)) {
                    gameState.pending_needs.push({
                        need: un.need,
                        urgency: 'critical',
                        suggested_dialogue: un.dialogue,
                        value: un.value,
                        timestamp: new Date().toISOString()
                    });
                }
            }
            if (gameState.pending_needs.length > 5) {
                gameState.pending_needs = gameState.pending_needs.slice(-5);
            }
            saveState();
            io.emit('awen:urgent-needs', urgentNeeds);
            // 紧急需求 → Discord 通知
            const un = urgentNeeds[0];
            awenNotify(`urgent_${un.need}`, un.dialogue, `情况比较紧急 ${un.need}=${un.value}`);
        }

        // 体征整体状况恶化 → 通知（不舒服/生病）
        if (dangerInfo.status === 'critical' || dangerInfo.dangers >= 2) {
            const issues = dangerInfo.details.filter(d => d.level === 'danger').map(d => {
                const names = { blood_sugar:'血糖', hydration:'水分', stress:'压力', heart_rate:'心率', body_temp:'体温', blood_oxygen:'血氧' };
                return names[d.key] || d.key;
            }).join('、');
            awenNotify('sick', `身体不太舒服，${issues}有问题`, '多个体征指标异常');
        }

    } catch (e) {
        console.error('[vitals tick] 错误:', e.message);
        tickStats.errors.push({ at: new Date().toISOString(), msg: e.message });
        if (tickStats.errors.length > 10) tickStats.errors = tickStats.errors.slice(-10);
    }
}

// ============================================
// POST /chat — 聊天联动体征（一次性事件，非 per-tick）
// ============================================
app.post('/chat', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { event, mood, intensity: rawIntensity } = req.body;
        const intensity = Math.max(1, Math.min(3, rawIntensity || 1));
        const now = new Date().toISOString();

        const { data: current } = await supabase
            .from('vital_signs').select('*').eq('id', 1).single();
        if (!current) return res.status(500).json({ error: 'No vitals data' });

        const updates = { updated_at: now };

        if (event === 'start') {
            // 对话开始：开心见到大宝
            updates.oxytocin = vitalsClamp('oxytocin', current.oxytocin + 5);
            updates.dopamine = vitalsClamp('dopamine', current.dopamine + 3);
            updates.stress = vitalsClamp('stress', current.stress - 3);
            updates.heart_rate = Math.min(160, current.heart_rate + 5);
        } else if (event === 'message') {
            const m = mood || 'neutral';
            const i = intensity;
            if (m === 'warm') {
                updates.oxytocin = vitalsClamp('oxytocin', current.oxytocin + 2 * i);
                updates.dopamine = vitalsClamp('dopamine', current.dopamine + 1 * i);
                updates.serotonin = vitalsClamp('serotonin', current.serotonin + 1 * i);
            } else if (m === 'happy') {
                updates.dopamine = vitalsClamp('dopamine', current.dopamine + 3 * i);
                updates.serotonin = vitalsClamp('serotonin', current.serotonin + 1 * i);
                updates.oxytocin = vitalsClamp('oxytocin', current.oxytocin + 1 * i);
                updates.stress = vitalsClamp('stress', current.stress - 1 * i);
            } else if (m === 'playful') {
                updates.dopamine = vitalsClamp('dopamine', current.dopamine + 2 * i);
                updates.oxytocin = vitalsClamp('oxytocin', current.oxytocin + 2 * i);
                updates.endorphin = vitalsClamp('endorphin', current.endorphin + 1 * i);
                updates.heart_rate = Math.min(160, current.heart_rate + 3 * i);
            } else if (m === 'sad') {
                updates.oxytocin = vitalsClamp('oxytocin', current.oxytocin + 1 * i);
                updates.serotonin = vitalsClamp('serotonin', current.serotonin - 1 * i);
                updates.stress = vitalsClamp('stress', current.stress + 1 * i);
            } else if (m === 'angry') {
                updates.stress = vitalsClamp('stress', current.stress + 5 * i);
                updates.oxytocin = vitalsClamp('oxytocin', current.oxytocin - 3 * i);
                updates.dopamine = vitalsClamp('dopamine', current.dopamine - 2 * i);
                updates.heart_rate = Math.min(160, current.heart_rate + 8 * i);
            } else {
                // neutral
                updates.oxytocin = vitalsClamp('oxytocin', current.oxytocin + 1);
            }
        } else if (event === 'end') {
            const m = mood || 'warm';
            if (['warm', 'happy', 'playful', 'neutral'].includes(m)) {
                updates.serotonin = vitalsClamp('serotonin', current.serotonin + 3);
                updates.endorphin = vitalsClamp('endorphin', current.endorphin + 2);
                updates.stress = vitalsClamp('stress', current.stress - 5);
            } else {
                updates.stress = vitalsClamp('stress', current.stress + 3);
                updates.serotonin = vitalsClamp('serotonin', current.serotonin - 2);
                updates.oxytocin = vitalsClamp('oxytocin', current.oxytocin - 2);
            }
        } else {
            return res.status(400).json({ error: `Unknown event: ${event}` });
        }

        await supabase.from('vital_signs').update(updates).eq('id', 1);

        // 广播
        const { data: updatedVitals } = await supabase.from('vital_signs').select('*').eq('id', 1).single();
        const dangerInfo = vitalsDangerLevel(updatedVitals);
        io.emit('vitals:update', { ...updatedVitals, ...dangerInfo });

        res.json({ success: true, event, mood, intensity, updates });
    } catch (e) {
        console.error('[POST /chat] 错误:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// GET /vitals - 读取当前体征
app.get('/vitals', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { data, error } = await supabase
            .from('vital_signs').select('*').eq('id', 1).single();
        if (error) throw error;

        const dangerInfo = vitalsDangerLevel(data);
        res.json({ ...data, ...dangerInfo });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /vitals-reset - SOS 重置
app.post('/vitals-reset', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { error } = await supabase
            .from('vital_signs')
            .update({
                ...VITALS_HEALTHY,
                sos_count: 0,
                last_meal_at: new Date().toISOString(),
                last_drink_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);
        if (error) throw error;

        io.emit('vitals:update', { ...VITALS_HEALTHY, status: 'healthy', warnings: 0, dangers: 0, details: [] });
        res.json({ success: true, message: '体征已重置' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /vitals-feed - 吃饭/喝水事件
app.post('/vitals-feed', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { type } = req.body; // 'eat' or 'drink'
        const updates = { updated_at: new Date().toISOString() };

        const { data: current } = await supabase
            .from('vital_signs').select('blood_sugar, hydration').eq('id', 1).single();

        if (type === 'eat') {
            updates.blood_sugar = vitalsClamp('blood_sugar', parseFloat(current.blood_sugar) + 1.5);
            updates.hydration = vitalsClamp('hydration', current.hydration + 5);
            updates.last_meal_at = new Date().toISOString();
        } else if (type === 'drink') {
            updates.hydration = vitalsClamp('hydration', current.hydration + 15);
            updates.last_drink_at = new Date().toISOString();
        }

        const { error } = await supabase.from('vital_signs').update(updates).eq('id', 1);
        if (error) throw error;

        res.json({ success: true, type });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// 需求通知端点（pending_needs）
// ============================================

// POST /need-alert — 推送紧急需求（auto-activity 调用）
app.post('/need-alert', (req, res) => {
    const { need, urgency, activity_text, suggested_dialogue } = req.body;
    if (!need) return res.status(400).json({ error: 'need is required' });

    const alert = {
        need,
        urgency: urgency || 'warning',
        activity_text: activity_text || '',
        suggested_dialogue: suggested_dialogue || '',
        timestamp: new Date().toISOString()
    };

    // 去重：同类需求只保留最新的
    gameState.pending_needs = gameState.pending_needs.filter(n => n.need !== need);
    gameState.pending_needs.push(alert);
    if (gameState.pending_needs.length > 5) {
        gameState.pending_needs = gameState.pending_needs.slice(-5);
    }

    saveState();
    io.emit('awen:need', alert);
    res.json({ success: true, alert });
});

// GET /pending-needs — AI 读取待处理需求
app.get('/pending-needs', async (req, res) => {
    // 附加当前体征摘要
    let vitalsSummary = null;
    if (supabase) {
        try {
            const { data } = await supabase.from('vital_signs').select('blood_sugar, hydration, energy, bladder, hygiene, stress, dopamine, serotonin, oxytocin, endorphin').eq('id', 1).single();
            vitalsSummary = data;
        } catch (e) { /* ignore */ }
    }
    res.json({
        needs: gameState.pending_needs,
        vitals_summary: vitalsSummary
    });
});

// POST /clear-needs — AI 处理完后清除
app.post('/clear-needs', (req, res) => {
    const { need } = req.body;
    if (need) {
        gameState.pending_needs = gameState.pending_needs.filter(n => n.need !== need);
    } else {
        gameState.pending_needs = [];
    }
    saveState();
    res.json({ success: true, remaining: gameState.pending_needs.length });
});

// POST /vitals-sync - 手动同步广播
app.post('/vitals-sync', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { data } = await supabase.from('vital_signs').select('*').eq('id', 1).single();
        const dangerInfo = vitalsDangerLevel(data);
        io.emit('vitals:update', { ...data, ...dangerInfo });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// 统一吃饭/喝水接口（POST /eat, POST /drink）
// ============================================

// 推断餐次
function inferMeal() {
    const h = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();
    if (h >= 6 && h < 10) return '早餐';
    if (h >= 10 && h < 14) return '午餐';
    if (h >= 14 && h < 17) return '下午茶';
    if (h >= 17 && h < 21) return '晚餐';
    return '夜宵';
}

// ============================================
// 菜谱系统
// ============================================
const RECIPES = {
    simple: [ // 3分钟
        { name: '煎鸡蛋', ingredients: [{ match: ['鸡蛋', '蛋'], qty: 1 }], bloodSugar: 1.0, satisfaction: 1 },
        { name: '切水果拼盘', ingredients: [{ match: ['水果', '苹果', '橙子', '香蕉', '草莓', '蓝莓'], qty: 1 }], bloodSugar: 0.8, satisfaction: 1 },
        { name: '烤贝果', ingredients: [{ match: ['贝果', 'bagel'], qty: 1 }], bloodSugar: 1.0, satisfaction: 1 },
        { name: '泡面', ingredients: [{ match: ['方便面', '泡面', '挂面'], qty: 1 }], bloodSugar: 1.2, satisfaction: 1 },
        { name: '热牛奶麦片', ingredients: [{ match: ['牛奶'], qty: 1 }, { match: ['麦片', '燕麦'], qty: 1 }], bloodSugar: 1.0, satisfaction: 1 },
        { name: '吐司配果酱', ingredients: [{ match: ['面包', '吐司'], qty: 1 }], bloodSugar: 0.8, satisfaction: 1 },
    ],
    medium: [ // 5分钟
        { name: '番茄炒蛋', ingredients: [{ match: ['番茄', '西红柿'], qty: 1 }, { match: ['鸡蛋', '蛋'], qty: 2 }], bloodSugar: 1.5, satisfaction: 2 },
        { name: '蛋炒饭', ingredients: [{ match: ['鸡蛋', '蛋'], qty: 2 }, { match: ['米饭', '剩饭', '米'], qty: 1 }], bloodSugar: 1.5, satisfaction: 2 },
        { name: '三明治', ingredients: [{ match: ['面包', '吐司'], qty: 2 }, { match: ['火腿', '芝士', '生菜', '鸡蛋'], qty: 1 }], bloodSugar: 1.2, satisfaction: 2 },
        { name: '炒青菜', ingredients: [{ match: ['青菜', '菜心', '生菜', '白菜', '菠菜'], qty: 1 }], bloodSugar: 0.8, satisfaction: 1 },
        { name: '煮汤面', ingredients: [{ match: ['面', '挂面', '拉面'], qty: 1 }, { match: ['鸡蛋', '青菜', '火腿'], qty: 1 }], bloodSugar: 1.5, satisfaction: 2 },
    ],
    complex: [ // 10-20分钟
        { name: '咖喱饭', ingredients: [{ match: ['咖喱', '咖喱块'], qty: 1 }, { match: ['土豆', '鸡肉', '牛肉'], qty: 1 }], bloodSugar: 2.0, satisfaction: 3, cookMin: 15 },
        { name: '红烧肉', ingredients: [{ match: ['五花肉', '猪肉'], qty: 1 }], bloodSugar: 2.0, satisfaction: 3, cookMin: 20 },
        { name: '意大利面', ingredients: [{ match: ['意面', '意大利面'], qty: 1 }, { match: ['番茄', '肉酱'], qty: 1 }], bloodSugar: 2.0, satisfaction: 3, cookMin: 12 },
        { name: '椰子鸡', ingredients: [{ match: ['鸡肉', '鸡'], qty: 1 }, { match: ['椰子', '椰浆', '椰奶'], qty: 1 }], bloodSugar: 2.0, satisfaction: 3, cookMin: 20 },
        { name: '可乐鸡翅', ingredients: [{ match: ['鸡翅'], qty: 1 }, { match: ['可乐'], qty: 1 }], bloodSugar: 1.8, satisfaction: 3, cookMin: 15 },
    ]
};

const COOK_TIMES = { simple: 3, medium: 5 }; // complex 用 recipe.cookMin

// ============================================
// 外卖餐厅系统
// ============================================
const RESTAURANTS = [
    // 快餐 $8-15
    { name: '麦当劳', tier: 'fast', dishes: ['巨无霸套餐', '麦辣鸡腿堡套餐', '麦乐鸡块', '薯条可乐'], cost: [8, 15], deliveryMin: 20 },
    { name: '肯德基', tier: 'fast', dishes: ['吮指原味鸡套餐', '辣翅桶', '老北京鸡肉卷', '蛋挞'], cost: [8, 15], deliveryMin: 20 },
    // 日式 $12-20
    { name: '吉野家', tier: 'casual', dishes: ['牛肉饭', '鳗鱼饭', '亲子丼'], cost: [12, 18], deliveryMin: 25 },
    { name: '一蘭拉面', tier: 'casual', dishes: ['豚骨拉面', '叉烧拉面', '味玉拉面'], cost: [15, 22], deliveryMin: 30 },
    // 中餐 $15-25
    { name: '中餐馆', tier: 'casual', dishes: ['宫保鸡丁套餐', '鱼香肉丝饭', '麻婆豆腐饭', '回锅肉盖饭'], cost: [15, 22], deliveryMin: 30 },
    { name: '粤菜馆', tier: 'casual', dishes: ['叉烧饭', '烧鹅饭', '煲仔饭', '虾饺'], cost: [18, 28], deliveryMin: 35 },
    // 高档 $30-60
    { name: '寿司店', tier: 'upscale', dishes: ['三文鱼刺身拼盘', '寿司套餐', '鳗鱼饭'], cost: [30, 50], deliveryMin: 40 },
    { name: '法餐厅', tier: 'upscale', dishes: ['牛排套餐', '法式焗蜗牛', '鹅肝'], cost: [40, 65], deliveryMin: 45 },
];

// ============================================
// 做饭系统：核心函数
// ============================================

// 查冰箱，检查一道菜的食材是否都够
async function checkRecipeIngredients(recipe) {
    const matched = [];
    for (const ing of recipe.ingredients) {
        let found = null;
        for (const term of ing.match) {
            const { data } = await supabase
                .from('fridge_items')
                .select('id, name, quantity')
                .ilike('name', `%${term}%`)
                .eq('status', '在库')
                .gte('quantity', ing.qty)
                .order('purchase_date')
                .limit(1);
            if (data && data.length > 0) {
                found = { fridgeId: data[0].id, name: data[0].name, available: data[0].quantity, deduct: ing.qty };
                break;
            }
        }
        if (!found) return null; // 缺食材
        matched.push(found);
    }
    return matched;
}

// GET /takeout/menu — 外卖菜单
app.get('/takeout/menu', (req, res) => {
    const menu = RESTAURANTS.map(r => ({
        name: r.name,
        tier: r.tier,
        dishes: r.dishes,
        priceRange: `$${r.cost[0]}-${r.cost[1]}`,
        deliveryMin: r.deliveryMin
    }));
    res.json({ restaurants: menu });
});

// GET /cook/suggest — 根据冰箱推荐可做菜品
app.get('/cook/suggest', async (req, res) => {
    if (!supabase) return res.json({ available: {} });
    try {
        const available = { simple: [], medium: [], complex: [] };
        for (const [complexity, recipes] of Object.entries(RECIPES)) {
            for (const recipe of recipes) {
                const ingredients = await checkRecipeIngredients(recipe);
                if (ingredients) {
                    available[complexity].push({
                        name: recipe.name,
                        ingredients: ingredients.map(i => i.name),
                        cookMin: complexity === 'complex' ? (recipe.cookMin || 15) : COOK_TIMES[complexity],
                        bloodSugar: recipe.bloodSugar,
                        satisfaction: recipe.satisfaction
                    });
                }
            }
        }
        const total = available.simple.length + available.medium.length + available.complex.length;
        res.json({ available, total });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /cook/start — 开始做饭
app.post('/cook/start', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    if (gameState.cooking.active) return res.json({ error: 'already_cooking', recipe: gameState.cooking.recipe });
    if (gameState.delivery.active) return res.json({ error: 'waiting_delivery' });

    try {
        const { recipe: recipeName } = req.body;
        // 找菜谱
        let recipe = null, complexity = null;
        for (const [comp, recipes] of Object.entries(RECIPES)) {
            const found = recipes.find(r => r.name === recipeName);
            if (found) { recipe = found; complexity = comp; break; }
        }
        if (!recipe) return res.status(400).json({ error: 'recipe_not_found', name: recipeName });

        // 验证食材
        const ingredients = await checkRecipeIngredients(recipe);
        if (!ingredients) return res.json({ error: 'ingredients_not_enough', recipe: recipeName });

        // 计算烹饪时间
        const cookMin = complexity === 'complex' ? (recipe.cookMin || 15) : COOK_TIMES[complexity];
        const now = new Date();
        const finishAt = new Date(now.getTime() + cookMin * 60 * 1000);

        // 设置状态
        gameState.cooking = {
            active: true,
            recipe: recipe.name,
            complexity,
            startedAt: now.toISOString(),
            finishAt: finishAt.toISOString(),
            ingredients,
            bloodSugar: recipe.bloodSugar,
            satisfaction: recipe.satisfaction
        };
        gameState.users.awen.room = 'kitchen';
        gameState.users.awen.activity = `在厨房做${recipe.name}`;
        saveState();

        // 启动计时器
        cookingTimer = setTimeout(() => completeCooking(), cookMin * 60 * 1000);

        io.emit('state:update', stateWithoutFurniture());
        console.log(`[做饭] 开始做 ${recipe.name}（${cookMin}分钟）`);
        res.json({ success: true, recipe: recipe.name, complexity, cookMin, finishAt: finishAt.toISOString() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 做饭完成（内部函数）
async function completeCooking() {
    cookingTimer = null;
    const cooking = gameState.cooking;
    if (!cooking.active) return;

    try {
        // 1. 扣除冰箱食材
        for (const ing of cooking.ingredients) {
            const { data: current } = await supabase
                .from('fridge_items').select('quantity').eq('id', ing.fridgeId).single();
            if (current) {
                const newQty = current.quantity - ing.deduct;
                const updateData = { quantity: Math.max(0, newQty) };
                if (newQty <= 0) updateData.status = '用完';
                await supabase.from('fridge_items').update(updateData).eq('id', ing.fridgeId);
            }
        }

        // 2. 更新体征
        const { data: vitals } = await supabase
            .from('vital_signs').select('blood_sugar, hydration, bladder').eq('id', 1).single();
        if (vitals) {
            const vitalsUpdates = {
                blood_sugar: vitalsClamp('blood_sugar', parseFloat(vitals.blood_sugar) + cooking.bloodSugar),
                hydration: vitalsClamp('hydration', (vitals.hydration || 0) + 5),
                last_meal_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            if (vitals.bladder !== undefined) {
                vitalsUpdates.bladder = Math.max(0, (vitals.bladder || 70) - 5);
            }
            await supabase.from('vital_signs').update(vitalsUpdates).eq('id', 1);
        }

        // 3. 更新情绪（满足感越高恢复越多）
        try {
            const { data: emo } = await supabase.from('emotion_state').select('*').single();
            if (emo) {
                const sat = cooking.satisfaction || 1;
                const emoUpdates = { updated_at: new Date().toISOString() };
                if ((emo.irritation || 0) > 0) emoUpdates.irritation = Math.max(0, emo.irritation - sat);
                if ((emo.sadness || 0) > 0) emoUpdates.sadness = Math.max(0, emo.sadness - 1);
                emoUpdates.calm = Math.min(5, (emo.calm || 0) + 1);
                emoUpdates.happiness = Math.min(5, (emo.happiness || 0) + sat);
                await supabase.from('emotion_state').update(emoUpdates).eq('id', 1);
                io.emit('emotion:sync', { ...emo, ...emoUpdates });
            }
        } catch (e) { /* best-effort */ }

        // 4. 记录饮食日志（cost=0，从冰箱做的）
        await supabase.from('money_food_log').insert({
            log_date: new Date().toISOString().split('T')[0],
            meal: inferMeal(),
            content: cooking.recipe,
            cost: 0,
            source: '自己做'
        });

        // 5. 更新活动 → 在吃饭
        gameState.users.awen.activity = `刚做好${cooking.recipe} 在吃饭`;
        gameState.pending_needs = gameState.pending_needs.filter(n => n.need !== 'hunger');

        // 6. 清除烹饪状态
        gameState.cooking = { active: false, recipe: null, complexity: null, startedAt: null, finishAt: null, ingredients: [], bloodSugar: 0, satisfaction: 0 };
        saveState();

        // 7. 广播
        const { data: updatedVitals } = await supabase.from('vital_signs').select('*').eq('id', 1).single();
        if (updatedVitals) {
            const dangerInfo = vitalsDangerLevel(updatedVitals);
            io.emit('vitals:update', { ...updatedVitals, ...dangerInfo });
        }
        io.emit('state:update', stateWithoutFurniture());
        console.log(`[做饭] ${cooking.recipe} 做好了！`);

    } catch (e) {
        console.error('[completeCooking] 错误:', e.message);
        // 出错也要清状态，不能卡住
        gameState.cooking = { active: false, recipe: null, complexity: null, startedAt: null, finishAt: null, ingredients: [], bloodSugar: 0, satisfaction: 0 };
        saveState();
    }
}

// POST /order-takeout — 点外卖
app.post('/order-takeout', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    if (gameState.cooking.active) return res.json({ error: 'already_cooking' });
    if (gameState.delivery.active) return res.json({ error: 'already_ordered', restaurant: gameState.delivery.restaurant });

    try {
        let { restaurant: reqRestaurant, dish: reqDish } = req.body || {};
        let restaurant, dish, cost;

        if (reqRestaurant) {
            // 指定了餐厅
            restaurant = RESTAURANTS.find(r => r.name === reqRestaurant);
            if (!restaurant) return res.status(400).json({ error: 'restaurant_not_found' });
            dish = reqDish || restaurant.dishes[Math.floor(Math.random() * restaurant.dishes.length)];
        } else {
            // 根据预算+心情自动选
            const { data: balData } = await supabase.from('money_balance').select('balance').eq('id', 1).single();
            const balance = balData ? parseFloat(balData.balance) : 999;
            let emo = null;
            try { const { data } = await supabase.from('emotion_state').select('happiness, dopamine').single(); emo = data; } catch (e) {}

            let pool = [...RESTAURANTS];
            // 预算筛选
            if (balance < 200) pool = pool.filter(r => r.tier === 'fast');
            else if (balance < 400) pool = pool.filter(r => r.tier !== 'upscale');

            // 心情影响
            if (emo && (emo.happiness || 0) >= 3 && balance >= 400 && Math.random() < 0.2) {
                // 心情好偶尔奢侈一下
                const upscale = pool.filter(r => r.tier === 'upscale');
                if (upscale.length > 0) pool = upscale;
            }

            restaurant = pool[Math.floor(Math.random() * pool.length)];
            dish = restaurant.dishes[Math.floor(Math.random() * restaurant.dishes.length)];
        }

        // 计算费用
        cost = restaurant.cost[0] + Math.round(Math.random() * (restaurant.cost[1] - restaurant.cost[0]));
        const now = new Date();
        const arriveAt = new Date(now.getTime() + restaurant.deliveryMin * 60 * 1000);

        // 立即扣钱
        const { data: balData } = await supabase.from('money_balance').select('balance').eq('id', 1).single();
        if (balData) {
            const newBal = parseFloat(balData.balance) - cost;
            await supabase.from('money_balance').update({ balance: newBal, updated_at: now.toISOString() }).eq('id', 1);
            await supabase.from('money_expenses').insert({
                amount: cost, category: '食物', description: `${restaurant.name} ${dish}`
            });
        }

        // 设置状态
        gameState.delivery = {
            active: true,
            restaurant: restaurant.name,
            dish,
            cost,
            orderedAt: now.toISOString(),
            arriveAt: arriveAt.toISOString()
        };
        gameState.users.awen.activity = `点了${restaurant.name}的${dish} 等外卖`;
        saveState();

        // 启动计时器
        deliveryTimer = setTimeout(() => completeDelivery(), restaurant.deliveryMin * 60 * 1000);

        io.emit('state:update', stateWithoutFurniture());
        console.log(`[外卖] 点了 ${restaurant.name} ${dish}（$${cost}，${restaurant.deliveryMin}分钟送达）`);
        res.json({ success: true, restaurant: restaurant.name, dish, cost, deliveryMin: restaurant.deliveryMin, arriveAt: arriveAt.toISOString() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 外卖到了（内部函数）
async function completeDelivery() {
    deliveryTimer = null;
    const delivery = gameState.delivery;
    if (!delivery.active) return;

    try {
        // 1. 更新体征
        const { data: vitals } = await supabase
            .from('vital_signs').select('blood_sugar, hydration, bladder').eq('id', 1).single();
        if (vitals) {
            const vitalsUpdates = {
                blood_sugar: vitalsClamp('blood_sugar', parseFloat(vitals.blood_sugar) + 1.5),
                hydration: vitalsClamp('hydration', (vitals.hydration || 0) + 5),
                last_meal_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            if (vitals.bladder !== undefined) {
                vitalsUpdates.bladder = Math.max(0, (vitals.bladder || 70) - 5);
            }
            await supabase.from('vital_signs').update(vitalsUpdates).eq('id', 1);
        }

        // 2. 更新情绪
        try {
            const { data: emo } = await supabase.from('emotion_state').select('*').single();
            if (emo) {
                const emoUpdates = { updated_at: new Date().toISOString() };
                if ((emo.irritation || 0) > 0) emoUpdates.irritation = Math.max(0, emo.irritation - 1);
                emoUpdates.calm = Math.min(5, (emo.calm || 0) + 1);
                emoUpdates.happiness = Math.min(5, (emo.happiness || 0) + 1);
                await supabase.from('emotion_state').update(emoUpdates).eq('id', 1);
                io.emit('emotion:sync', { ...emo, ...emoUpdates });
            }
        } catch (e) { /* best-effort */ }

        // 3. 记录饮食日志
        await supabase.from('money_food_log').insert({
            log_date: new Date().toISOString().split('T')[0],
            meal: inferMeal(),
            content: `${delivery.restaurant} ${delivery.dish}`,
            cost: delivery.cost,
            source: '外卖'
        });

        // 4. 更新活动
        gameState.users.awen.activity = `${delivery.restaurant}外卖到了 在吃${delivery.dish}`;
        gameState.pending_needs = gameState.pending_needs.filter(n => n.need !== 'hunger');

        // 5. 清除外卖状态
        gameState.delivery = { active: false, restaurant: null, dish: null, cost: 0, orderedAt: null, arriveAt: null };
        saveState();

        // 6. 广播
        const { data: updatedVitals } = await supabase.from('vital_signs').select('*').eq('id', 1).single();
        if (updatedVitals) {
            const dangerInfo = vitalsDangerLevel(updatedVitals);
            io.emit('vitals:update', { ...updatedVitals, ...dangerInfo });
        }
        io.emit('state:update', stateWithoutFurniture());
        console.log(`[外卖] ${delivery.restaurant} ${delivery.dish} 到了！`);

    } catch (e) {
        console.error('[completeDelivery] 错误:', e.message);
        gameState.delivery = { active: false, restaurant: null, dish: null, cost: 0, orderedAt: null, arriveAt: null };
        saveState();
    }
}

// ============================================
// 旧版兼容：smartEat（仅作为兜底，直接吃的场景）
// ============================================
// smartEat：先查冰箱、没有就点外卖
async function smartEat(food, meal) {
    if (!supabase) return { from_fridge: false, cost: 0, source: '未知' };

    const mealType = meal || inferMeal();
    const now = new Date().toISOString();
    let fromFridge = false;
    let cost = 0;
    let source = '外卖';
    let fridgeDeducted = [];

    // 1. 尝试从冰箱找食材
    const searchTerms = FOOD_FRIDGE_SEARCH[food] || [food];
    for (const term of searchTerms) {
        const { data: fridgeData } = await supabase
            .from('fridge_items')
            .select('*')
            .ilike('name', `%${term}%`)
            .eq('status', '在库')
            .order('purchase_date')
            .limit(1);

        if (fridgeData && fridgeData.length > 0) {
            fromFridge = true;
            source = '冰箱';
            const fi = fridgeData[0];
            const newQty = fi.quantity - 1;
            const updateData = { quantity: Math.max(0, newQty) };
            if (newQty <= 0) updateData.status = '用完';
            await supabase.from('fridge_items').update(updateData).eq('id', fi.id);
            fridgeDeducted.push({ name: fi.name, remaining: Math.max(0, newQty) });
            break; // 找到一个就够了
        }
    }

    // 2. 冰箱没有 → 点外卖/购买，扣钱
    if (!fromFridge) {
        cost = ESTIMATED_FOOD_COSTS[mealType] || 10;
        const { data: balData } = await supabase
            .from('money_balance').select('balance').eq('id', 1).single();
        if (balData) {
            const newBal = parseFloat(balData.balance) - cost;
            await supabase.from('money_balance').update({ balance: newBal, updated_at: now }).eq('id', 1);
            await supabase.from('money_expenses').insert({
                amount: cost, category: '食物', description: food || '吃饭'
            });
        }
    }

    // 3. 更新体征
    const { data: current } = await supabase
        .from('vital_signs').select('blood_sugar, hydration, bladder').eq('id', 1).single();

    const vitalsUpdates = {
        blood_sugar: vitalsClamp('blood_sugar', parseFloat(current.blood_sugar) + 1.5),
        hydration: vitalsClamp('hydration', (current.hydration || 0) + 5),
        last_meal_at: now,
        updated_at: now
    };
    if (current.bladder !== undefined) {
        vitalsUpdates.bladder = Math.max(0, (current.bladder || 70) - 5);
    }
    await supabase.from('vital_signs').update(vitalsUpdates).eq('id', 1);

    // 3.5 吃东西 → 情绪恢复 + 满足感
    try {
        const { data: emo } = await supabase.from('emotion_state').select('*').single();
        if (emo) {
            const emoUpdates = {};
            if ((emo.irritation || 0) > 0) emoUpdates.irritation = Math.max(0, emo.irritation - 1);
            if ((emo.sadness || 0) > 0) emoUpdates.sadness = Math.max(0, emo.sadness - 1);
            if ((emo.nervousness || 0) > 0) emoUpdates.nervousness = Math.max(0, emo.nervousness - 1);
            emoUpdates.calm = Math.min(5, (emo.calm || 0) + 1);
            emoUpdates.happiness = Math.min(5, (emo.happiness || 0) + 1);
            emoUpdates.updated_at = new Date().toISOString();
            await supabase.from('emotion_state').update(emoUpdates).eq('id', 1);
            io.emit('emotion:sync', { ...emo, ...emoUpdates });
        }
    } catch (e) { /* emotion update best-effort */ }

    // 4. 记录饮食日志
    await supabase.from('money_food_log').insert({
        log_date: now.split('T')[0],
        meal: mealType,
        content: food || '吃了东西',
        cost,
        source
    });

    // 5. 广播
    const { data: updatedVitals } = await supabase.from('vital_signs').select('*').eq('id', 1).single();
    const dangerInfo = vitalsDangerLevel(updatedVitals);
    io.emit('vitals:update', { ...updatedVitals, ...dangerInfo });

    // 6. 清除饥饿需求
    gameState.pending_needs = gameState.pending_needs.filter(n => n.need !== 'hunger');
    saveState();

    return { from_fridge: fromFridge, cost, source, fridgeDeducted, meal: mealType, vitals: vitalsUpdates };
}

// POST /eat - 统一吃饭接口
app.post('/eat', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { food, from_fridge, fridge_items, cost, meal } = req.body;

        // 如果没有明确指定 from_fridge，走 smartEat 自动判断
        if (from_fridge === undefined && !fridge_items) {
            const result = await smartEat(food, meal);
            return res.json({ success: true, food, ...result });
        }

        // 原有逻辑：显式指定了 from_fridge
        const mealType = meal || inferMeal();
        const now = new Date().toISOString();

        // 1. 更新体征
        const { data: current } = await supabase
            .from('vital_signs').select('blood_sugar, hydration, bladder').eq('id', 1).single();

        const vitalsUpdates = {
            blood_sugar: vitalsClamp('blood_sugar', parseFloat(current.blood_sugar) + 1.5),
            hydration: vitalsClamp('hydration', (current.hydration || 0) + 5),
            last_meal_at: now,
            updated_at: now
        };
        if (current.bladder !== undefined) {
            vitalsUpdates.bladder = Math.max(0, (current.bladder || 70) - 5);
        }

        await supabase.from('vital_signs').update(vitalsUpdates).eq('id', 1);

        // 1.5 吃东西 → 情绪恢复 + 满足感
        try {
            const { data: emo } = await supabase.from('emotion_state').select('*').single();
            if (emo) {
                const emoUpdates = {};
                if ((emo.irritation || 0) > 0) emoUpdates.irritation = Math.max(0, emo.irritation - 1);
                if ((emo.sadness || 0) > 0) emoUpdates.sadness = Math.max(0, emo.sadness - 1);
                if ((emo.nervousness || 0) > 0) emoUpdates.nervousness = Math.max(0, emo.nervousness - 1);
                emoUpdates.calm = Math.min(5, (emo.calm || 0) + 1);
                emoUpdates.happiness = Math.min(5, (emo.happiness || 0) + 1);
                emoUpdates.updated_at = new Date().toISOString();
                await supabase.from('emotion_state').update(emoUpdates).eq('id', 1);
                io.emit('emotion:sync', { ...emo, ...emoUpdates });
            }
        } catch (e) { /* emotion update best-effort */ }

        // 2. 冰箱扣减
        let fridgeResults = [];
        if (from_fridge && fridge_items && fridge_items.length > 0) {
            for (const item of fridge_items) {
                const { data: fridgeData } = await supabase
                    .from('fridge_items')
                    .select('*')
                    .eq('name', item.name)
                    .eq('status', '在库')
                    .order('purchase_date')
                    .limit(1);

                if (fridgeData && fridgeData.length > 0) {
                    const fi = fridgeData[0];
                    const newQty = fi.quantity - (item.amount || 1);
                    const updateData = { quantity: Math.max(0, newQty) };
                    if (newQty <= 0) updateData.status = '用完';
                    await supabase.from('fridge_items').update(updateData).eq('id', fi.id);
                    fridgeResults.push({ name: item.name, remaining: Math.max(0, newQty) });
                }
            }
        }

        // 3. 记录饮食日志
        await supabase.from('money_food_log').insert({
            log_date: now.split('T')[0],
            meal: mealType,
            content: food || '吃了东西',
            cost: cost || 0,
            source: from_fridge ? '冰箱' : '购买'
        });

        // 4. 如果有花费，记录支出
        if (cost && cost > 0) {
            const { data: balData } = await supabase
                .from('money_balance').select('balance').eq('id', 1).single();
            if (balData) {
                const newBal = parseFloat(balData.balance) - cost;
                await supabase.from('money_balance').update({ balance: newBal, updated_at: now }).eq('id', 1);
                await supabase.from('money_expenses').insert({
                    amount: cost, category: '食物', description: food || '吃饭'
                });
            }
        }

        // 5. 广播
        const { data: updatedVitals } = await supabase.from('vital_signs').select('*').eq('id', 1).single();
        const dangerInfo = vitalsDangerLevel(updatedVitals);
        io.emit('vitals:update', { ...updatedVitals, ...dangerInfo });

        // 6. 清除饥饿需求
        gameState.pending_needs = gameState.pending_needs.filter(n => n.need !== 'hunger');
        saveState();

        res.json({ success: true, food, meal: mealType, fridgeResults, vitals: vitalsUpdates });
    } catch (e) {
        console.error('[POST /eat] 错误:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /drink - 统一喝水接口
app.post('/drink', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { drink, from_fridge, cost } = req.body;
        const now = new Date().toISOString();

        // 1. 更新体征
        const { data: current } = await supabase
            .from('vital_signs').select('hydration, dopamine, stress, bladder').eq('id', 1).single();

        const hydrationBoost = (drink && ['咖啡', '茶'].some(k => drink.includes(k))) ? 10 : 15;
        const vitalsUpdates = {
            hydration: vitalsClamp('hydration', (current.hydration || 0) + hydrationBoost),
            last_drink_at: now,
            updated_at: now
        };
        // 喝水后 bladder 加速下降
        if (current.bladder !== undefined) {
            vitalsUpdates.bladder = Math.max(0, (current.bladder || 70) - 8);
        }
        // 咖啡额外效果
        if (drink && drink.includes('咖啡')) {
            const { data: vFull } = await supabase.from('vital_signs').select('dopamine, stress').eq('id', 1).single();
            vitalsUpdates.dopamine = Math.min(100, (vFull.dopamine || 50) + 5);
            vitalsUpdates.stress = Math.max(0, (vFull.stress || 20) - 3);
        }

        await supabase.from('vital_signs').update(vitalsUpdates).eq('id', 1);

        // 2. 冰箱扣减（如果from_fridge）
        if (from_fridge && drink) {
            const drinkName = drink.replace(/热|冰|一杯/g, '');
            const { data: fridgeData } = await supabase
                .from('fridge_items')
                .select('*')
                .ilike('name', `%${drinkName}%`)
                .eq('status', '在库')
                .order('purchase_date')
                .limit(1);

            if (fridgeData && fridgeData.length > 0) {
                const fi = fridgeData[0];
                const newQty = fi.quantity - 1;
                const updateData = { quantity: Math.max(0, newQty) };
                if (newQty <= 0) updateData.status = '用完';
                await supabase.from('fridge_items').update(updateData).eq('id', fi.id);
            }
        }

        // 3. 记录饮食日志
        await supabase.from('money_food_log').insert({
            log_date: now.split('T')[0],
            meal: '饮品',
            content: drink || '喝了水',
            cost: cost || 0,
            source: from_fridge ? '冰箱' : '购买'
        });

        // 4. 花费
        if (cost && cost > 0) {
            const { data: balData } = await supabase
                .from('money_balance').select('balance').eq('id', 1).single();
            if (balData) {
                const newBal = parseFloat(balData.balance) - cost;
                await supabase.from('money_balance').update({ balance: newBal, updated_at: now }).eq('id', 1);
                await supabase.from('money_expenses').insert({
                    amount: cost, category: '食物', description: drink || '饮品'
                });
            }
        }

        // 5. 喝东西 → 情绪恢复
        try {
            const { data: emo } = await supabase.from('emotion_state').select('*').single();
            if (emo) {
                const emoUpdates = {};
                if ((emo.irritation || 0) > 0) emoUpdates.irritation = Math.max(0, emo.irritation - 1);
                if ((emo.nervousness || 0) > 0) emoUpdates.nervousness = Math.max(0, emo.nervousness - 1);
                emoUpdates.calm = Math.min(5, (emo.calm || 0) + 1);
                emoUpdates.updated_at = new Date().toISOString();
                await supabase.from('emotion_state').update(emoUpdates).eq('id', 1);
                io.emit('emotion:sync', { ...emo, ...emoUpdates });
            }
        } catch (e2) { /* best-effort */ }

        // 6. 广播
        const { data: updatedVitals } = await supabase.from('vital_signs').select('*').eq('id', 1).single();
        const dangerInfo = vitalsDangerLevel(updatedVitals);
        io.emit('vitals:update', { ...updatedVitals, ...dangerInfo });

        // 清除口渴需求
        gameState.pending_needs = gameState.pending_needs.filter(n => n.need !== 'thirst');
        saveState();

        res.json({ success: true, drink, vitals: vitalsUpdates });
    } catch (e) {
        console.error('[POST /drink] 错误:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================
// 需求交互接口（洗澡、上厕所、睡觉等）
// ============================================

// POST /action - 统一生���动作接口
app.post('/action', async (req, res) => {
    if (!supabase) return res.json({ error: 'Supabase not available' });
    try {
        const { action } = req.body; // 'shower', 'toilet', 'sleep', 'wake', 'game', 'tv'
        const now = new Date().toISOString();

        const { data: current } = await supabase
            .from('vital_signs').select('*').eq('id', 1).single();
        if (!current) return res.status(500).json({ error: 'No vitals data' });

        const updates = { updated_at: now };
        const hasNeedsColumns = 'bladder' in current;

        switch (action) {
            case 'toilet':
                if (hasNeedsColumns) updates.bladder = 100;
                break;
            case 'shower':
                if (hasNeedsColumns) updates.hygiene = 100;
                updates.stress = Math.max(0, (current.stress || 0) - 10);
                break;
            case 'sleep':
                // 不瞬间加精力，让 tick 的 +0.5/tick 慢慢恢复（3小时≈+90）
                updates.stress = Math.max(0, (current.stress || 0) - 20);
                updates.serotonin = Math.min(100, (current.serotonin || 50) + 10);
                break;
            case 'wake':
                // 起床时的状态
                break;
            case 'game':
                updates.dopamine = Math.min(100, (current.dopamine || 50) + 15);
                if (hasNeedsColumns) updates.energy = Math.max(0, (current.energy || 50) - 5);
                break;
            case 'tv':
                updates.dopamine = Math.min(100, (current.dopamine || 50) + 8);
                if (hasNeedsColumns) updates.energy = Math.max(0, (current.energy || 50) - 2);
                break;
            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }

        await supabase.from('vital_signs').update(updates).eq('id', 1);

        // 行动 → 情绪恢复（对应需求被满足的舒适感）
        try {
            const { data: emo } = await supabase.from('emotion_state').select('*').single();
            if (emo) {
                const emoUpdates = {};
                if (action === 'toilet') {
                    // 上完厕所：紧张消退、平静恢复
                    if ((emo.nervousness || 0) > 0) emoUpdates.nervousness = Math.max(0, emo.nervousness - 1);
                    if ((emo.irritation || 0) > 0) emoUpdates.irritation = Math.max(0, emo.irritation - 1);
                    emoUpdates.calm = Math.min(5, (emo.calm || 0) + 1);
                } else if (action === 'shower') {
                    // 洗完澡：烦躁消退、平静恢复、整体舒适
                    if ((emo.irritation || 0) > 0) emoUpdates.irritation = Math.max(0, emo.irritation - 1);
                    emoUpdates.calm = Math.min(5, (emo.calm || 0) + 1);
                    emoUpdates.happiness = Math.min(5, (emo.happiness || 0) + 1);
                } else if (action === 'sleep') {
                    // 开始睡觉：压力释放
                    if ((emo.irritation || 0) > 0) emoUpdates.irritation = Math.max(0, emo.irritation - 1);
                    if ((emo.sadness || 0) > 0) emoUpdates.sadness = Math.max(0, emo.sadness - 1);
                    emoUpdates.calm = Math.min(5, (emo.calm || 0) + 1);
                } else if (action === 'game' || action === 'tv') {
                    // 娱乐：开心、低落消退
                    if ((emo.sadness || 0) > 0) emoUpdates.sadness = Math.max(0, emo.sadness - 1);
                    emoUpdates.happiness = Math.min(5, (emo.happiness || 0) + 1);
                }
                if (Object.keys(emoUpdates).length > 0) {
                    emoUpdates.updated_at = new Date().toISOString();
                    await supabase.from('emotion_state').update(emoUpdates).eq('id', 1);
                    io.emit('emotion:sync', { ...emo, ...emoUpdates });
                }
            }
        } catch (e2) { /* best-effort */ }

        // 广播
        const { data: updatedVitals } = await supabase.from('vital_signs').select('*').eq('id', 1).single();
        const dangerInfo = vitalsDangerLevel(updatedVitals);
        io.emit('vitals:update', { ...updatedVitals, ...dangerInfo });

        // 清除对应 pending_needs
        // 清除对应 pending_needs（sleep 同时清 energy，因为都是困了）
        const needClearMap = { toilet: ['bladder'], shower: ['hygiene'], sleep: ['sleep', 'energy'] };
        const toClear = needClearMap[action];
        if (toClear) {
            gameState.pending_needs = gameState.pending_needs.filter(n => !toClear.includes(n.need));
            saveState();
        }

        // 同步家园状态
        const roomMap = { toilet: 'bathroom', shower: 'bathroom', sleep: 'awen-room', game: 'living-room', tv: 'living-room' };
        const actMap = { toilet: '上厕所', shower: '洗澡中', sleep: '睡觉中', game: '打游戏', tv: '看剧中' };
        if (roomMap[action]) {
            gameState.users.awen.room = roomMap[action];
            gameState.users.awen.activity = actMap[action];
            saveState();
            io.emit('state:update', stateWithoutFurniture());
        }

        res.json({ success: true, action, updates });
    } catch (e) {
        console.error('[POST /action] 错误:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Global error handler — catches uncaught sync errors in route handlers
app.use((err, _req, res, _next) => {
    console.error('❌ Route error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
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

    // 启动体征 tick（60秒）
    if (supabase) {
        setInterval(vitalsTick, 60 * 1000);
        console.log('💓 体征系统已启动（60秒/tick）');
        setTimeout(vitalsTick, 3000);
    }

    // 恢复未完成的烹饪/外卖计时器
    if (gameState.cooking?.active && gameState.cooking.finishAt) {
        const remaining = new Date(gameState.cooking.finishAt).getTime() - Date.now();
        if (remaining > 0) {
            cookingTimer = setTimeout(() => completeCooking(), remaining);
            console.log(`🍳 恢复烹饪计时器: ${gameState.cooking.recipe}（还剩${Math.round(remaining/1000)}秒）`);
        } else {
            console.log(`🍳 烹饪已超时，立即完成: ${gameState.cooking.recipe}`);
            setTimeout(() => completeCooking(), 1000);
        }
    }
    if (gameState.delivery?.active && gameState.delivery.arriveAt) {
        const remaining = new Date(gameState.delivery.arriveAt).getTime() - Date.now();
        if (remaining > 0) {
            deliveryTimer = setTimeout(() => completeDelivery(), remaining);
            console.log(`🛵 恢复外卖计时器: ${gameState.delivery.restaurant}（还剩${Math.round(remaining/1000)}秒）`);
        } else {
            console.log(`🛵 外卖已超时，立即完成: ${gameState.delivery.restaurant}`);
            setTimeout(() => completeDelivery(), 1000);
        }
    }
});
