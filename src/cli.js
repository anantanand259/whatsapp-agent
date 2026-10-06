import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { config, missing } from './config.js';
import { Store } from './store.js';
import { WhatsApp } from './whatsapp.js';
import { Agent } from './agent.js';
import { Worker } from './worker.js';

const c = config(); c.mode = 'local'; c.dataDir += '/local-chat';
if (missing(c, false).length) { console.error('Set OPENAI_API_KEY and OPENAI_MODEL in .env. The offline demo needs neither.'); process.exit(1); }
const store = new Store(c.dataDir); const channel = new WhatsApp(c, store);
const original = channel.text.bind(channel);
channel.text = async (key, to, text) => { console.log(`Agent -> ${to}: ${text}`); return original(key, to, text); };
const worker = new Worker(store, new Agent(c, store, channel), channel);
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log('Local AI chat. WhatsApp sends are simulated. GitHub pushes are real when configured. Type /exit to quit.');
try {
  for (;;) {
    const body = await rl.question('You: '); if (body === '/exit') break;
    if (!body.trim()) continue;
    store.enqueue(randomUUID(), 'local-owner', body); await worker.drain();
  }
} finally { rl.close(); store.close(); }
