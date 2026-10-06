import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { config, missing } from './config.js';
import { Store } from './store.js';
import { WhatsApp, incoming, validSignature } from './whatsapp.js';
import { PersonalWhatsApp } from './personal.js';
import { Agent } from './agent.js';
import { Worker } from './worker.js';

export function createServer(c, store, worker, connected = () => true) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, value) => { res.writeHead(code, { 'Content-Type': 'text/plain' }); res.end(value); };
    if (req.method === 'GET' && url.pathname === '/health') return send(connected() ? 200 : 503, connected() ? 'ready' : 'disconnected');
    if (c.mode !== 'whatsapp' || url.pathname !== '/webhook') return send(404, 'Not found');
    if (req.method === 'GET') {
      if (c.verifyToken && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === c.verifyToken) return send(200, url.searchParams.get('hub.challenge') || '');
      return send(403, 'Forbidden');
    }
    if (req.method !== 'POST') return send(405, 'Method not allowed');
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) return send(413, 'Too large'); chunks.push(chunk); }
      const raw = Buffer.concat(chunks);
      if (!validSignature(raw, req.headers['x-hub-signature-256'], c.appSecret)) return send(401, 'Invalid signature');
      const messages = incoming(JSON.parse(raw.toString()), c.phoneId);
      for (const m of messages) store.enqueue(m.id, m.sender, m.body, m.timestamp);
      send(200, 'OK');
      void worker.drain().catch(() => console.error('Worker failed'));
    } catch { send(400, 'Invalid webhook'); }
  });
}

export async function start() {
  const c = config(); const absent = missing(c);
  if (absent.length) throw new Error(`Configure .env first: ${absent.join(', ')}. Run npm run demo without credentials.`);
  const store = new Store(c.dataDir);
  const channel = c.mode === 'personal' ? new PersonalWhatsApp(c, store) : new WhatsApp(c, store);
  const worker = new Worker(store, new Agent(c, store, channel), channel);
  const server = createServer(c, store, worker, () => c.mode !== 'personal' || channel.ready);
  server.requestTimeout = 15000;
  server.listen(c.port, c.host, () => console.log(`Agent health: http://${c.host}:${c.port}/health (${c.mode})`));
  if (c.mode === 'personal') await channel.connect(m => { store.enqueue(m.id, m.sender, m.body, m.timestamp); void worker.drain().catch(() => console.error('Worker failed')); });
  const timer = setInterval(() => { if (c.mode !== 'personal' || channel.ready) void worker.drain().catch(() => console.error('Worker failed')); }, 1000);
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    clearInterval(timer); server.close();
    if (channel.client) await channel.client.destroy().catch(() => {});
    // Running jobs remain marked and become interrupted on restart; never blindly resend.
    process.exit(0);
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) start().catch(e => { console.error(e.message); process.exit(1); });
