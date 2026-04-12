const express = require('express');
const router  = express.Router();
const { getStatus } = require('../services/whatsappClient');

router.get('/', (req, res) => {
  const { isReady, currentQR } = getStatus();
  if (isReady) {
    return res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>LoseIt</title>
    <style>body{background:#f0f4f8;color:#10b981;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;}</style></head>
    <body><h2 style="font-size:2rem">✅ ווטצאפ מחובר!</h2>
    <a href="/" style="color:#4f46e5;font-size:1.1rem">← עבור לדשבורד</a></body></html>`);
  }
  if (!currentQR) {
    return res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3">
    <title>LoseIt</title><style>body{background:#f0f4f8;font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;}</style></head>
    <body><p>⏳ מתחבר לווטצאפ...</p></body></html>`);
  }
  res.send(`<!DOCTYPE html><html dir="rtl" lang="he">
  <head><meta charset="UTF-8"><title>LoseIt — סרוק QR</title><meta http-equiv="refresh" content="30">
  <style>body{background:#f0f4f8;font-family:Arial;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:20px;padding:20px;text-align:center;}
  h1{color:#4f46e5;font-size:1.5rem;} img{border:6px solid white;border-radius:12px;width:260px;box-shadow:0 4px 20px rgba(0,0,0,.15);}
  .steps{background:white;border-radius:12px;padding:20px;text-align:right;max-width:340px;line-height:2;box-shadow:0 2px 8px rgba(0,0,0,.08);}</style></head>
  <body>
    <h1>⚖️ LoseIt — חיבור ווטצאפ</h1>
    <img src="${currentQR}" />
    <div class="steps"><strong>איך לסרוק:</strong><br>
      1. פתח ווטצאפ בטלפון<br>
      2. ⋮ ← מכשירים מקושרים<br>
      3. קשר מכשיר<br>
      4. סרוק את הקוד 📷</div>
    <small style="color:#64748b">מתרענן אוטומטית כל 30 שניות</small>
  </body></html>`);
});

module.exports = router;
