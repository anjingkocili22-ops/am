// language: JavaScript, file: api/verify.js, runtime: Vercel Node 18+
// Custom Order ID: ArtexAM-byTsuneyuki
import axios from 'axios';
import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const kv = Redis.fromEnv();

const cfg = {
  key: 'AIzaSyDtG1AU22ErnQD60AzBAcaknySiz9_CEq0',
  idt: 'https://www.googleapis.com/identitytoolkit/v3/relyingparty',
  vfy: 'https://us-central1-alight-creative.cloudfunctions.net/verifyPurchase'
};

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

const h2 = {
  'content-type': 'application/json; charset=utf-8',
  'user-agent': 'okhttp/3.12.1',
  'accept-encoding': 'gzip'
};

function extractCode(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/&amp;/g, '&');
  try {
    s = decodeURIComponent(s);
  } catch {}
  try {
    const u = new URL(s);
    let c = u.searchParams.get('oobCode');
    if (!c) {
      const n =
        u.searchParams.get('link') ||
        u.searchParams.get('q') ||
        u.searchParams.get('url');
      if (n) {
        try {
          c = new URL(n).searchParams.get('oobCode');
        } catch {}
      }
    }
    if (c) return c.replace(/[^a-zA-Z0-9_-]/g, '');
  } catch {}
  const m = s.match(/oobCode=([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  const t = raw.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t) && !t.includes('://')) return t;
  return null;
}

async function verifyAndActivate(email, magicLink) {
  const oobCode = extractCode(magicLink);
  if (!oobCode) return { success: false, message: 'oobCode not found in link' };

  try {
    const authRes = await axios.post(
      `${cfg.idt}/emailLinkSignin?key=${cfg.key}`,
      {
        email,
        oobCode,
        clientType: 'CLIENT_TYPE_ANDROID'
      },
      { headers: sp(h1) }
    );

    const idToken = authRes.data.idToken;
    const orderId =
      'ArtexAM-byTsuneyuki-' + crypto.randomBytes(6).toString('hex');

    const verifyRes = await axios.post(
      cfg.vfy,
      {
        data: {
          productId: 'am.full.sub.annual.19q4',
          token:
            'mmgaobamlahbbeccfplmbkbb.AO-J1OzqG0or_GJJIx-ms8GrTm-jaglCRfhQSRPUZKpl2YspYS-oN7_94uv8RC5vQbvd_Ios2pPDStZ2n7F0hLE3FiOU7HS3R6Fquulv5xLXFECSv4ctElw',
          skuType: 'subs',
          orderId
        }
      },
      {
        headers: {
          ...h2,
          authorization: 'Bearer ' + idToken,
          'firebase-instance-id-token':
            'cSDnCyp3T-uwp07z3tL86T:APA91bFkmvvsHw5nnqa1SBFci-99DRsKClLiETdRrVcJjS5yBx1v_FbCb1d8WhBuea_zmwnYBktyTIzcRhN4b6uNOUur9wPc0gKXmJDoZic0LhNq5V2s0xI'
        }
      }
    );

    return { success: true, data: verifyRes.data, orderId, email };
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

  const { sessionId, link } = req.body || {};
  if (!sessionId || !link) {
    return res
      .status(400)
      .json({ ok: false, message: 'sessionId and link required' });
  }

  let state;
  try {
    state = await kv.get(`sess:${sessionId}`);
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, message: 'KV unavailable: ' + e.message });
  }

  if (!state) {
    return res
      .status(400)
      .json({ ok: false, message: 'Session not found or expired' });
  }

  const r = await verifyAndActivate(state.email, link);
  if (!r.success) {
    return res.status(500).json({ ok: false, message: r.message });
  }

  try {
    await kv.del(`sess:${sessionId}`);
  } catch {}

  return res.json({
    ok: true,
    email: r.email,
    orderId: r.orderId,
    status: 'active',
    validUntil: r.data?.validUntil || null
  });
}
