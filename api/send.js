// language: JavaScript, file: api/send.js, runtime: Vercel Node 18+
// Custom Order ID: ArtexAM-byTsuneyuki
import axios from 'axios';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const kv = Redis.fromEnv();

const cfg = {
  key: 'AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0',
  idt: 'https://www.googleapis.com/identitytoolkit/v3/relyingparty'
};

const PENDING_TTL = 600;

const dip = () => [1, 2, 3, 4].map(() => crypto.randomInt(1, 255)).join('.');
const sp = (h) => ({
  ...h,
  'x-forwarded-for': dip(),
  'x-real-ip': dip(),
  'client-ip': dip()
});

const h1 = {
  'content-type': 'application/json',
  'x-android-package': 'com.alightcreative.motion',
  'x-android-cert': 'ECA6BF91B8715A6F810ED0BBFC65B6CD578F52A8',
  'user-agent':
    'dalvik/2.1.0 (linux; u; android 15; 23127pn0cc build/bp1a.250505.005)'
};

async function sendMagicLink(email) {
  const c1 = { identifier: email, continueUri: 'http://localhost' };
  const c2 = {
    requestType: 6,
    email,
    androidInstallApp: true,
    canHandleCodeInApp: true,
    continueUrl: 'https://alightcreative.com?ui_sid=0366624874&ui_sd=0',
    iosBundleId: 'com.alightcreative.motion',
    androidPackageName: 'com.alightcreative.motion',
    androidMinimumVersion: '585',
    clientType: 'CLIENT_TYPE_ANDROID'
  };
  try {
    await axios.post(`${cfg.idt}/createAuthUri?key=${cfg.key}`, c1, {
      headers: sp(h1)
    });
    const r = await axios.post(
      `${cfg.idt}/getOobConfirmationCode?key=${cfg.key}`,
      c2,
      { headers: sp(h1) }
    );
    return { success: true, data: r.data };
  } catch (e) {
    const d = e.response?.data;
    return {
      success: false,
      message: d ? JSON.stringify(d) : e.message
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'POST only' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: 'Invalid email' });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const rlKey = `rl:send:${ip}`;

  try {
    const count = (await kv.get(rlKey)) || 0;
    if (count >= 5) {
      return res
        .status(429)
        .json({ ok: false, message: 'Rate limit: 5 emails per hour' });
    }
  } catch {}

  const r = await sendMagicLink(email);
  if (!r.success) {
    return res.status(500).json({ ok: false, message: r.message });
  }

  try {
    await kv.incr(rlKey);
    await kv.expire(rlKey, 3600);
  } catch {}

  const sessionId = crypto.randomBytes(16).toString('hex');

  try {
    await kv.set(
      `sess:${sessionId}`,
      { email, createdAt: Date.now() },
      { ex: PENDING_TTL }
    );
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, message: 'KV unavailable: ' + e.message });
  }

  return res.json({
    ok: true,
    sessionId,
    message: `Magic link sent to ${email}`
  });
}
