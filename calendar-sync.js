#!/usr/bin/env node
// calendar-sync.js — 从 Google Calendar 同步事件到虚拟家园服务器
// 用法: node calendar-sync.js
// 前置: gog auth add your@gmail.com

const { execSync } = require('child_process');
const SERVER = 'http://45.32.213.180:3000';

function getEvents() {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    // 取接下来7天
    const to = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

    try {
        const raw = execSync(`gog calendar events --all --from ${from} --to ${to} --json --no-input 2>/dev/null`, {
            encoding: 'utf8',
            timeout: 15000
        });
        const data = JSON.parse(raw);
        const events = (data.items || data || []).map(ev => {
            const start = ev.start?.dateTime || ev.start?.date || '';
            const end = ev.end?.dateTime || ev.end?.date || '';
            const date = start.slice(0, 10);
            const time = start.includes('T') ? start.slice(11, 16) + '-' + (end.includes('T') ? end.slice(11, 16) : '') : '全天';
            return {
                title: ev.summary || '(无标题)',
                date,
                time,
                location: ev.location || '',
                calendar: ev.organizer?.displayName || ''
            };
        });
        // 按日期+时间排序
        events.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
        return events;
    } catch (e) {
        console.error('获取日历失败:', e.message);
        return null;
    }
}

async function sync() {
    const events = getEvents();
    if (!events) {
        console.log('跳过同步');
        return;
    }

    try {
        const res = await fetch(`${SERVER}/calendar/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events })
        });
        const data = await res.json();
        console.log(`✅ 同步 ${data.count} 个事件到服务器`);
    } catch (e) {
        console.error('推送失败:', e.message);
    }
}

sync();
