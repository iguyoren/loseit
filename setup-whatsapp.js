/**
 * Run once to register the webhook with Meta.
 * Usage: node setup-whatsapp.js <your-public-url>
 * Example: node setup-whatsapp.js https://abc123.ngrok.io
 */
require('dotenv').config();
const axios = require('axios');

const [,, publicUrl] = process.argv;
if (!publicUrl) {
  console.error('Usage: node setup-whatsapp.js <your-public-url>');
  process.exit(1);
}

const webhookUrl = `${publicUrl}/webhook`;
const appId      = process.env.WHATSAPP_APP_ID;
const appSecret  = process.env.WHATSAPP_APP_SECRET;
const token      = process.env.WHATSAPP_TOKEN;
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

console.log('\n📋 Webhook setup summary:');
console.log(`   URL:          ${webhookUrl}`);
console.log(`   Verify token: ${verifyToken}`);
console.log('\n➡️  Go to developers.facebook.com and register this webhook manually:');
console.log('   1. App Dashboard → WhatsApp → Configuration → Webhook');
console.log(`   2. Callback URL: ${webhookUrl}`);
console.log(`   3. Verify token: ${verifyToken}`);
console.log('   4. Subscribe to: messages\n');
