const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

async function sendMessage(to, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    console.warn('[WhatsApp] Missing credentials, skipping send');
    return;
  }

  try {
    await axios.post(
      `${BASE_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[WhatsApp] Sent to ${to}: ${text}`);
  } catch (err) {
    const errData = err.response?.data?.error;
    const msg = errData ? `(#${errData.code}) ${errData.message}` : err.message;
    console.error(`[WhatsApp] Send failed to ${to}: ${msg}`);
    throw new Error(msg); // העבר את השגיאה הלאה
  }
}

function extractMessage(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return null;

    const contact = value?.contacts?.[0];
    const base = {
      messageId: message.id,
      from: message.from,
      senderName: contact?.profile?.name || null,
      timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
      type: message.type,
    };

    if (message.type === 'text') {
      return { ...base, text: message.text.body };
    }
    if (message.type === 'image') {
      return { ...base, text: null, mediaId: message.image.id, mimeType: message.image.mime_type || 'image/jpeg', caption: message.image.caption || null };
    }
    return null;
  } catch {
    return null;
  }
}

async function downloadMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;
  // 1. Get media URL
  const infoRes = await axios.get(
    `${BASE_URL}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const mediaUrl = infoRes.data.url;
  // 2. Download the actual bytes
  const imgRes = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: 'arraybuffer',
  });
  return Buffer.from(imgRes.data).toString('base64');
}

module.exports = { sendMessage, extractMessage, downloadMedia };
