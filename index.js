const { Boom } = require('@hapi/boom');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OpenAI API Key is missing! Check your .env file.");
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('Reconnecting...');
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot is connected to WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages[0]?.message || m.type !== 'notify') return;

        const message = m.messages[0];
        const sender = message.key.remoteJid;
        const text = message.message.conversation || message.message.extendedTextMessage?.text;

        console.log(`📩 Message from ${sender}: ${text || "(no text)"}`);

        if (text) {
            const response = await getAIResponse(text);
            await sock.sendMessage(sender, { text: response });
        }
    });
}

async function getAIResponse(prompt) {
    try {
        const res = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
        });
        return res.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";
    } catch (error) {
        console.error('OpenAI Error:', error);
        return 'Sorry, I am unable to process your request.';
    }
}

startBot();
