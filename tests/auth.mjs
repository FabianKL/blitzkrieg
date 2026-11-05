import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { createAuth } from '../auth.js';
import { AUTH } from '../shared/config.js';
import { startServer, connectBot, closeAllBots } from './helpers.mjs';

const origin = 'https://spel.example';
const credentials = () => ({
  NODE_ENV: 'production', TUNNELER_AUTH: 'required', APP_ORIGIN: origin,
  INVITE_PASSPHRASE: randomBytes(24).toString('hex'),
  SESSION_SECRET: randomBytes(32).toString('hex'),
});

async function fixture(t) {
  const env = credentials();
  let time = Date.now();
  const auth = createAuth(env, () => time);
  const server = http.createServer((req, res) => {
    if (!auth.handleHttp(req, res)) { res.writeHead(200); res.end('spel'); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, options = {}) => {
    const response = await fetch(base + path, { redirect: 'manual', ...options });
    const text = await response.text();
    return { response, text };
  };
  const login = (value = env.INVITE_PASSPHRASE, headers = {}) => request('/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ passphrase: value }),
  });
  const cookie = async () => {
    const { response } = await login();
    assert.equal(response.status, 303);
    return response.headers.get('set-cookie').split(';')[0];
  };
  return { env, auth, request, login, cookie, advance: (ms) => { time += ms; } };
}

test('toegang: productie faalt gesloten bij ontbrekende of ongeldige instellingen', () => {
  const env = credentials();
  assert.throws(() => createAuth({ NODE_ENV: 'production' }), /ontbreken/);
  assert.throws(() => createAuth({ ...env, TUNNELER_AUTH: 'local' }), /productie/);
  assert.throws(() => createAuth({ TUNNELER_AUTH: 'uit' }), /local of required/);
  assert.throws(() => createAuth({ ...env, INVITE_PASSPHRASE: 'kort' }), /te kort/);
  assert.throws(() => createAuth({ ...env, SESSION_SECRET: 'kort' }), /te kort/);
  assert.throws(() => createAuth({ ...env, APP_ORIGIN: 'http://spel.example' }), /HTTPS-origin/);
  assert.throws(() => createAuth({ ...env, APP_ORIGIN: `${origin}/pad` }), /HTTPS-origin/);
  assert.throws(() => createAuth({ ...env, NODE_ENV: 'development', TUNNELER_AUTH: 'local' }), /toegangsgegevens/);
  const local = createAuth({ TUNNELER_AUTH: 'local' });
  assert.equal(local.handleHttp(), false);
  assert.equal(local.authorizeUpgrade(), true);
});

test('toegang: alleen formulier en gezondheidscontrole zijn openbaar', async (t) => {
  const f = await fixture(t);
  const home = await f.request('/');
  assert.equal(home.response.status, 303);
  assert.equal(home.response.headers.get('location'), '/login');
  const page = await f.request('/login');
  assert.equal(page.response.status, 200);
  assert.match(page.text, /type="password"/);
  assert.match(page.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await f.request('/healthz')).text, 'ok');
  for (const path of ['/shared/config.js', '/vendor/pixi.mjs', '/assets/manifest.json', '/shell.js']) {
    const asset = await f.request(path);
    assert.equal(asset.response.status, 401, path);
    assert.equal(asset.response.headers.get('cache-control'), 'no-store');
  }
});

test('toegang: aanmelding geeft een veilige cookie, nooit een geheim in de URL', async (t) => {
  const f = await fixture(t);
  const { response } = await f.login();
  const cookie = response.headers.get('set-cookie');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  for (const attribute of ['__Host-blitz-session=', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) {
    assert.ok(cookie.includes(attribute), attribute);
  }
  assert.ok(!cookie.includes(f.env.INVITE_PASSPHRASE));
  const game = await f.request('/', { headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(game.response.status, 200);
  assert.equal(game.text, 'spel');
});

test('toegang: foute zin, andere herkomst en te groot formulier worden geweigerd', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.login('onjuist')).response.status, 401);
  assert.equal((await f.login(undefined, { Origin: 'https://anders.example' })).response.status, 403);
  assert.equal((await f.login(undefined, { 'Content-Type': 'text/plain' })).response.status, 415);
  assert.equal((await f.login('a'.repeat(AUTH.maxBodyBytes))).response.status, 413);
});

test('toegang: gewijzigde, verlopen en na rotatie oude cookies werken niet', async (t) => {
  const f = await fixture(t);
  const cookie = await f.cookie();
  assert.equal((await f.request('/', { headers: { Cookie: cookie + 'x' } })).response.status, 303);
  const req = { headers: { cookie } };
  assert.ok(f.auth.expiresAt(req));
  assert.equal(createAuth({ ...f.env, INVITE_PASSPHRASE: randomBytes(24).toString('hex') }).expiresAt(req), null);
  assert.equal(createAuth({ ...f.env, SESSION_SECRET: randomBytes(32).toString('hex') }).expiresAt(req), null);
  f.advance(AUTH.sessionMs);
  assert.equal(f.auth.expiresAt(req), null);
  assert.equal((await f.request('/shared/config.js', { headers: { Cookie: cookie } })).response.status, 401);
});

test('toegang: globale limiet op mislukte pogingen verloopt na het venster', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < AUTH.maxFailures; i++) {
    assert.equal((await f.login('onjuist')).response.status, 401);
  }
  const blocked = await f.login();
  assert.equal(blocked.response.status, 429);
  assert.ok(Number(blocked.response.headers.get('retry-after')) > 0);
  f.advance(AUTH.failureWindowMs);
  assert.equal((await f.login()).response.status, 303);
});

test('toegang: WebSocket-controle vereist sessie en exacte herkomst', async (t) => {
  const f = await fixture(t);
  const cookie = await f.cookie();
  const response = [];
  const socket = { end: (message) => response.push(message) };
  for (const headers of [{}, { origin, cookie: cookie + 'x' }, { origin: 'https://anders.example', cookie }]) {
    assert.equal(f.auth.authorizeUpgrade({ headers }, socket), false);
  }
  assert.ok(response.every((message) => message.startsWith('HTTP/1.1 401')));
  assert.equal(f.auth.authorizeUpgrade({ headers: { origin, cookie } }, socket), true);
  f.advance(AUTH.sessionMs);
  assert.equal(f.auth.authorizeUpgrade({ headers: { origin, cookie } }, socket), false);
});

test('toegang: echte productieserver beschermt bestanden en laat vier aangemelde spelers toe', async (t) => {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const env = credentials();
  const child = await startServer(port, env);
  t.after(async () => {
    await closeAllBots();
    const stopped = once(child, 'exit');
    child.kill();
    await stopped;
  });
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(base + '/healthz');
  assert.equal(await health.text(), 'ok');
  const blocked = await fetch(base + '/shared/config.js');
  assert.equal(blocked.status, 401);
  await blocked.text();
  const login = await fetch(base + '/login', {
    method: 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ passphrase: env.INVITE_PASSPHRASE }),
  });
  await login.text();
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const game = await fetch(base + '/', { headers: { Cookie: cookie } });
  assert.equal(game.status, 200);
  assert.match(await game.text(), /BLITZKRIEG/);

  const rejectUpgrade = (headers) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?room=blitzkrieg`, { headers });
    ws.on('error', () => {});
    ws.once('open', () => { ws.close(); reject(new Error('Onbevoegde verbinding geaccepteerd.')); });
    ws.once('unexpected-response', (req, res) => {
      res.resume();
      ws.close();
      resolve(res.statusCode);
    });
  });
  assert.equal(await rejectUpgrade({ Origin: origin }), 401);
  assert.equal(await rejectUpgrade({ Origin: 'https://anders.example', Cookie: cookie }), 401);
  const bots = [];
  for (let i = 0; i < 4; i++) bots.push(await connectBot(port, 'blitzkrieg', { headers: { Origin: origin, Cookie: cookie } }));
  assert.equal(new Set(bots.map((bot) => bot.state.me)).size, 4);
});
