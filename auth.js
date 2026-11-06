import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AUTH } from './shared/config.js';

const COOKIE = '__Host-blitz-session';
const digest = (value) => createHash('sha256').update(value).digest();

export function createAuth(env = process.env, now = Date.now) {
  const mode = env.TUNNELER_AUTH ?? (env.NODE_ENV === 'production' ? 'required' : 'local');
  if (!['local', 'required'].includes(mode)) throw new Error('TUNNELER_AUTH moet local of required zijn.');
  if (mode === 'local') {
    if (env.NODE_ENV === 'production' || env.INVITE_PASSPHRASE || env.SESSION_SECRET || env.APP_ORIGIN) {
      throw new Error('Gebruik TUNNELER_AUTH=required voor productie of ingestelde toegangsgegevens.');
    }
    return {
      handleHttp: () => false,
      authorizeUpgrade: () => true,
      expiresAt: () => null,
    };
  }
  const passphrase = env.INVITE_PASSPHRASE;
  const secret = env.SESSION_SECRET;
  if (!passphrase || passphrase.length < AUTH.minPassphraseLength ||
      !secret || secret.length < AUTH.minSecretLength) {
    throw new Error('INVITE_PASSPHRASE en SESSION_SECRET ontbreken of zijn te kort.');
  }
  const origin = new URL(env.APP_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.APP_ORIGIN) {
    throw new Error('APP_ORIGIN moet een exacte HTTPS-origin zonder pad zijn.');
  }
  const expectedPassphrase = digest(passphrase);
  const signingKey = createHmac('sha256', secret).update(expectedPassphrase).digest();
  const sign = (payload) => createHmac('sha256', signingKey).update(payload).digest('base64url');
  let failures = 0, resetAt = now() + AUTH.failureWindowMs;

  function expiresAt(req) {
    const cookies = String(req.headers.cookie || '').split(';').map((part) => part.trim());
    const value = cookies.find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!value || value.length > AUTH.maxCookieLength) return null;
    const [expires, nonce, signature, extra] = value.split('.');
    if (extra !== undefined || !/^\d+$/.test(expires) || !/^[\w-]+$/.test(nonce || '') || !signature) return null;
    const deadline = Number(expires);
    if (!Number.isSafeInteger(deadline) || deadline <= now() || deadline > now() + AUTH.sessionMs) return null;
    const expected = Buffer.from(sign(`${expires}.${nonce}`));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? deadline : null;
  }

  function reply(res, status, message, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(message);
  }

  function handleHttp(req, res) {
    let pathname;
    try { pathname = new URL(req.url, origin).pathname; }
    catch { reply(res, 400, 'Ongeldige URL.'); return true; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (pathname === '/healthz' && ['GET', 'HEAD'].includes(req.method)) {
      reply(res, 200, 'ok');
      return true;
    }
    if (pathname === '/login' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      });
      res.end(`<!doctype html>
<html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BLITZKRIEG - Meedoen</title>
<style>body{color:#e4e0ce;background:#20251e;font:18px system-ui;margin:10vh auto;padding:24px;max-width:420px}
input,button{box-sizing:border-box;font:inherit;width:100%;padding:12px;margin:12px 0}label{display:block}</style>
<h1>BLITZKRIEG</h1><p>Vul de uitnodigingszin van de host in om mee te doen.</p>
<form action="/login" method="post"><label for="passphrase">Uitnodigingszin</label>
<input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required maxlength="${AUTH.maxBodyBytes}">
<button>Meedoen</button></form></html>`);
      return true;
    }
    if (pathname === '/login' && req.method === 'POST') {
      if (req.headers.origin !== origin.origin) { reply(res, 403, 'Ongeldige herkomst.'); return true; }
      if (req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
        reply(res, 415, 'Gebruik het aanmeldformulier.'); return true;
      }
      if (now() >= resetAt) { failures = 0; resetAt = now() + AUTH.failureWindowMs; }
      if (failures >= AUTH.maxFailures) {
        reply(res, 429, 'Te veel mislukte pogingen. Probeer het later opnieuw.', {
          'Retry-After': String(Math.ceil((resetAt - now()) / 1000)),
        });
        return true;
      }
      const chunks = [];
      let bytes = 0, rejected = false;
      req.on('data', (chunk) => {
        bytes += chunk.length;
        if (rejected) return;
        if (bytes > AUTH.maxBodyBytes) {
          rejected = true;
          reply(res, 413, 'Aanmeldformulier is te groot.');
        } else chunks.push(chunk);
      });
      req.on('error', (err) => {
        console.error(`Aanmeldverzoek afgebroken: ${err.message}`);
        if (!res.headersSent) reply(res, 400, 'Aanmeldverzoek afgebroken.');
      });
      req.on('end', () => {
        if (rejected) return;
        // Ook lopende verzoeken tellen mee zodra hun formulier binnen is.
        if (failures >= AUTH.maxFailures) { reply(res, 429, 'Te veel mislukte pogingen. Probeer het later opnieuw.'); return; }
        const supplied = new URLSearchParams(Buffer.concat(chunks).toString('utf8')).get('passphrase') || '';
        if (!timingSafeEqual(expectedPassphrase, digest(supplied))) {
          failures++;
          console.warn('Aanmelden geweigerd: onjuiste uitnodigingszin.');
          reply(res, 401, 'Onjuiste uitnodigingszin. Ga terug en probeer opnieuw.');
          return;
        }
        const expires = now() + AUTH.sessionMs;
        const payload = `${expires}.${randomBytes(AUTH.nonceBytes).toString('base64url')}`;
        reply(res, 303, 'Aangemeld.', {
          Location: '/',
          'Set-Cookie': `${COOKIE}=${payload}.${sign(payload)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${AUTH.sessionMs / 1000}`,
        });
      });
      return true;
    }
    if (!expiresAt(req)) {
      if (req.method === 'GET' && ['/', '/retro'].includes(pathname)) {
        reply(res, 303, 'Meld je eerst aan.', { Location: '/login' });
      } else reply(res, 401, 'Meld je eerst aan.');
      return true;
    }
    return false;
  }

  function authorizeUpgrade(req, socket) {
    const deadline = expiresAt(req);
    if (req.headers.origin === origin.origin && deadline) return true;
    console.warn('Spelverbinding geweigerd: ongeldige sessie of herkomst.');
    socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return false;
  }

  return { handleHttp, authorizeUpgrade, expiresAt };
}
