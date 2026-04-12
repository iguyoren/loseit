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
    const msg = err.response?.data?.error?.message || err.message;
    console.error(`[WhatsApp] Send failed: ${msg}`);
  }
}

function extractMessage(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message || message.type !== 'text') return null;

    const contact = value?.contacts?.[0];

    return {
      messageId: message.id,
      from: message.from,                          // phone number
      senderName: contact?.profile?.name || null,  // WhatsApp display name
      text: message.text.body,
      timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

module.exports = { sendMessage, extractMessage };
