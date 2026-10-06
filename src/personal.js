import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { WhatsApp } from './whatsapp.js';

const require = createRequire(import.meta.url);
const QRCode = require('qrcode-terminal/vendor/QRCode');
const qrLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

export function qrSvg(value) {
  const code = new QRCode(-1, qrLevel.M); code.addData(value); code.make();
  const size = code.getModuleCount();
  const cells = [];
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    if (code.isDark(row, col)) cells.push(`<rect x="${col + 4}" y="${row + 4}" width="1" height="1"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 ${size + 8} ${size + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><g fill="black">${cells.join('')}</g></svg>`;
}

export function selfCommand(message, selfIds, prefix) {
  return Boolean(message.fromMe && selfIds.has(message.to) && typeof message.body === 'string' && message.body.startsWith(`${prefix} `));
}

export class PersonalWhatsApp extends WhatsApp {
  async connect(onMessage) {
    const { default: wweb } = await import('whatsapp-web.js');
    const { default: qr } = await import('qrcode-terminal');
    this.MessageMedia = wweb.MessageMedia;
    this.client = new wweb.Client({
      authStrategy: new wweb.LocalAuth({ dataPath: path.join(this.c.dataDir, 'session') }),
      puppeteer: { headless: true, ...(this.c.chromePath ? { executablePath: this.c.chromePath } : {}) },
      qrMaxRetries: 5
    });
    this.ready = false;
    this.client.on('qr', async value => {
      console.log('WhatsApp > Settings > Linked devices > Link a device. Scan this QR:');
      qr.generate(value, { small: true });
      let page;
      try {
        page = await this.client.pupBrowser.newPage();
        await page.setViewport({ width: 600, height: 600, deviceScaleFactor: 1 });
        await page.setContent(`<body style="margin:0">${qrSvg(value)}</body>`);
        await page.screenshot({ path: path.join(this.c.dataDir, 'whatsapp-qr.png') });
        console.log(`QR_IMAGE_UPDATED ${new Date().toISOString()}`);
      } catch { console.error('Could not render the QR image; use the terminal QR.'); }
      finally { if (page) await page.close().catch(() => {}); }
    });
    this.client.on('ready', async () => {
      try {
        const number = this.client.info.wid.user;
        if (!this.c.owners.includes(number)) throw new Error('Linked account does not match OWNER_NUMBERS');
        this.owner = number;
        this.selfIds = new Set([this.client.info.wid._serialized, `${number}@c.us`]);
        const mappings = await this.client.getContactLidAndPhone([`${number}@c.us`]);
        for (const m of mappings) { if (m.lid) this.selfIds.add(m.lid); }
        this.ready = true;
        await fs.unlink(path.join(this.c.dataDir, 'whatsapp-qr.png')).catch(() => {});
        console.log(`WhatsApp connected. In Message yourself, send: ${this.c.prefix} Create a document about solar energy`);
      } catch (e) { console.error(e.message); await this.client.destroy(); }
    });
    this.client.on('auth_failure', () => { this.ready = false; console.error('WhatsApp authentication failed. Relink the account.'); });
    this.client.on('disconnected', () => { this.ready = false; console.error('WhatsApp disconnected. Restart to reconnect.'); });
    this.client.on('message_create', async m => {
      if (!this.ready) return;
      try {
        if (selfCommand(m, this.selfIds, this.c.prefix)) {
          onMessage({ id: m.id._serialized, sender: this.owner, body: m.body.slice(this.c.prefix.length + 1, 12000), timestamp: m.timestamp * 1000 });
        } else if (!m.fromMe && !m.from.endsWith('@g.us') && !m.from.endsWith('@broadcast')) {
          const contact = await m.getContact();
          const number = contact.number;
          if (!/^[1-9][0-9]{6,14}$/.test(number || '')) return;
          // Only self-chat commands acquire owner privileges, even if another owner number writes in.
          if (this.c.owners.includes(number)) return;
          onMessage({ id: m.id._serialized, sender: number, body: (m.body || '[Non-text message]').slice(0, 12000), timestamp: m.timestamp * 1000 });
        }
      } catch { console.error('Could not process a WhatsApp event'); }
    });
    await this.client.initialize();
  }
  async deliver(key, to, payload, fileBytes) {
    this.allowed(to);
    if (!this.ready) throw new Error('WhatsApp is not connected');
    return this.store.effect(key, async () => {
      const id = await this.client.getNumberId(to);
      if (!id) throw new Error('Recipient is not registered on WhatsApp');
      let content = payload.text?.body;
      if (content && this.c.owners.includes(to)) content = `[Agent]\n${content}`;
      if (fileBytes) content = new this.MessageMedia(payload.mime, fileBytes.toString('base64'), payload.document.filename);
      const sent = await this.client.sendMessage(id._serialized, content, { sendMediaAsDocument: Boolean(fileBytes), sendSeen: false });
      this.store.message(to, 'out', payload.text?.body || `[Document: ${payload.document.filename}]`);
      return { messageId: sent.id._serialized };
    });
  }
  async file(key, to, name, bytes) {
    const types = { '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.html': 'text/html', '.json': 'application/json' };
    return this.deliver(key, to, { type: 'document', mime: types[path.extname(name)] || 'text/plain', document: { filename: path.basename(name) } }, bytes);
  }
  async chats() {
    if (!this.ready) throw new Error('WhatsApp is not connected');
    const chats = await this.client.getChats();
    return chats.filter(c => !c.isGroup).slice(0, 50).map(c => ({ id: c.id._serialized, name: c.name, unread: c.unreadCount, lastActivity: c.timestamp }));
  }
  async readChat(chatId) {
    if (!this.ready) throw new Error('WhatsApp is not connected');
    if (!/^[0-9]+@(c\.us|lid)$/.test(chatId)) throw new Error('Only individual chat IDs are supported');
    const chat = await this.client.getChatById(chatId);
    return (await chat.fetchMessages({ limit: 30 })).map(m => ({ fromMe: m.fromMe, body: m.body.slice(0,4000), timestamp: m.timestamp }));
  }
}
