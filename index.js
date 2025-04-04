const { Boom } = require('@hapi/boom');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const dotenv = require('dotenv');
const OpenAI = require('openai');

dotenv.config();

// ✅ Ensure OpenAI API Key is set
if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OpenAI API Key is missing! Check your .env file.");
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // ✅ Uses environment variable
});

async function startBot() {
    console.log("🚀 Starting WhatsApp bot...");

    // ✅ Auth state for Baileys
    const { state, saveCreds } = await useMultiFileAuthState('auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // ❌ Disable automatic QR print (we will handle it manually)
        syncFullHistory: true,
    });

    sock.ev.on('creds.update', saveCreds);

    // ✅ Connection update handling
    sock.ev.on('connection.update', (update) => {
        console.log("🔹 Connection Update:", update);
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("📌 QR Code received! Scan it with WhatsApp.");
            qrcode.generate(qr, { small: true }); // ✅ Force QR display
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Connection closed: ${lastDisconnect?.error}`);
            if (shouldReconnect) {
                console.log('♻️ Reconnecting in 5 seconds...');
                setTimeout(startBot, 5000);
            } else {
                console.log('❌ Logged out. Please delete the auth folder and restart.');
            }
        } else if (connection === 'open') {
            console.log('✅ Bot is connected to WhatsApp!');
        }
    });

    // ✅ Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages || m.messages.length === 0) return;

        const message = m.messages[0];
        const sender = message.key.remoteJid;

        if (message.key.fromMe) return; // Ignore bot's own messages

        let text = "";
        if (message.message.conversation) {
            text = message.message.conversation;
        } else if (message.message.extendedTextMessage) {
            text = message.message.extendedTextMessage.text;
        } else {
            console.log("🛑 No valid text message found.");
            return;
        }

        console.log(`📩 Message from ${sender}: ${text}`);

        try {
            const response = await getAIResponse(text);
            await sock.sendMessage(sender, { text: response });
            console.log(`📤 Sent response to ${sender}: ${response}`);
        } catch (error) {
            console.error("❌ Error sending message:", error);
        }
    });
}

// ✅ Function to get response from OpenAI
async function getAIResponse(prompt) {
    try {
        const res = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
        });
        return res.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";
    } catch (error) {
        console.error('❌ OpenAI Error:', error);
        return 'Sorry, I am unable to process your request.';
    }
}

// ✅ Start the bot
startBot();
