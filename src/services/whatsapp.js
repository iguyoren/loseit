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
    const errCode = errData?.code;
    const msg = errData ? `(#${errCode}) ${errData.message}` : err.message;
    console.error(`[WhatsApp] Send failed to ${to}: ${msg}`);

    // קוד 131047 = חלון 24 שעות נסגר — נסה לשלוח כ-template
    // קוד 130472 = מחוץ לחלון השיחה
    if (errCode === 131047 || errCode === 130472 || errCode === 131026) {
      console.log(`[WhatsApp] Trying template fallback for ${to}`);
      await sendTemplate(to, text);
      return;
    }

    throw new Error(msg);
  }
}

// שליחת הודעה כ-template (hello_world) כ-fallback כאשר חלון 24 שעות נסגר
// אם יש template מותאם אישית — להגדיר WHATSAPP_TEMPLATE_NAME ב-env
async function sendTemplate(to, bodyText) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'hello_world';
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';

  try {
    await axios.post(
      `${BASE_URL}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[WhatsApp] Template sent to ${to}`);
  } catch (err2) {
    const e2 = err2.response?.data?.error;
    const m2 = e2 ? `(#${e2.code}) ${e2.message}` : err2.message;
    console.error(`[WhatsApp] Template also failed to ${to}: ${m2}`);
    throw new Error(m2);
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
