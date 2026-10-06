import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { jsonRequest } from './http.js';

export function validSignature(raw, signature, secret) {
  if (!secret || !/^sha256=[0-9a-f]{64}$/.test(signature || '')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function incoming(payload, phoneId) {
  const result = [];
  if (payload.object !== 'whatsapp_business_account') return result;
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    if (value.metadata?.phone_number_id !== phoneId) continue;
    for (const m of value.messages || []) {
      if (typeof m.id !== 'string' || !/^[1-9][0-9]{6,14}$/.test(m.from || '')) continue;
      const timestamp = Number(m.timestamp) * 1000;
      if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60000 || timestamp < 0) continue;
      result.push({ id: m.id, sender: m.from, body: m.type === 'text' && typeof m.text?.body === 'string' ? m.text.body.slice(0,12000) : `[Unsupported inbound message: ${String(m.type).slice(0,40)}. Please send a text instruction.]`, timestamp });
    }
  }
  return result;
}

const mimeTypes = { '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.txt': 'text/plain' };

export class WhatsApp {
  constructor(c, store, request = jsonRequest) { this.c = c; this.store = store; this.request = request; }
  allowed(to) {
    if (![...this.c.owners, ...this.c.recipients, ...this.c.autoReply, ...(this.c.mode === 'local' ? ['local-owner'] : [])].includes(to)) throw new Error('Recipient is not configured in the allowed recipients');
    if (this.c.mode === 'whatsapp' && !this.store.inWindow(to)) throw new Error('No open 24-hour WhatsApp reply window. Ask this recipient to message the business number first. Template initiation is not implemented.');
  }
  async post(endpoint, body, multipart = false) {
    return this.request(`https://graph.facebook.com/${this.c.graph}/${this.c.phoneId}/${endpoint}`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.c.metaToken}`, ...(multipart ? {} : { 'Content-Type': 'application/json' }) },
      body: multipart ? body : JSON.stringify(body)
    });
  }
  async deliver(key, to, payload, fileBytes) {
    this.allowed(to);
    return this.store.effect(key, async () => {
      let result;
      if (this.c.mode === 'local') {
        const dir = path.join(this.c.dataDir, 'outbox'); await fs.mkdir(dir, { recursive: true });
        const id = createHash('sha256').update(key).digest('hex');
        await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify({ to, ...payload }, null, 2));
        result = { simulated: true, outbox: `${id}.json` };
      } else {
        if (fileBytes) {
          const form = new FormData(); form.append('messaging_product', 'whatsapp');
          const mime = mimeTypes[path.extname(payload.document.filename)] || 'text/plain';
          form.append('type', mime); form.append('file', new Blob([fileBytes], { type: mime }), payload.document.filename);
          const media = await this.post('media', form, true);
          payload.document.id = media.id;
        }
        result = await this.post('messages', { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload });
      }
      this.store.message(to, 'out', payload.text?.body || `[Document: ${payload.document.filename}]`);
      return result;
    });
  }
  async text(key, to, body) {
    const results = [];
    for (let i = 0; i < body.length; i += 3500) results.push(await this.deliver(`${key}:${i}`, to, { type: 'text', text: { body: body.slice(i, i + 3500) } }));
    return results;
  }
  async file(key, to, name, bytes) {
    const supported = Boolean(mimeTypes[path.extname(name)]);
    const filename = supported ? path.basename(name) : `${path.basename(name)}.txt`;
    return this.deliver(key, to, { type: 'document', document: { filename } }, bytes);
  }
}
