import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import pptxgen from 'pptxgenjs';

export function safeName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,179}$/.test(name)) throw new Error('Invalid relative artifact path');
  const parts = name.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.') || p.endsWith('.') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(p))) throw new Error('Unsafe artifact path');
  if (!/\.(txt|md|html|css|js|json|csv|svg|docx|pptx)$/i.test(name)) throw new Error('Unsupported artifact extension');
  return name;
}

export class Artifacts {
  constructor(dir, jobId) { this.root = path.join(dir, 'artifacts', createHash('sha256').update(jobId).digest('hex').slice(0,24)); }
  async resolve(name) {
    safeName(name);
    await fs.mkdir(this.root, { recursive: true });
    const root = await fs.realpath(this.root);
    let current = root;
    for (const part of name.split('/')) {
      current = path.join(current, part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are not allowed'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    return current;
  }
  async write(name, content) {
    const target = await this.resolve(name);
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    if (bytes.length > 10 * 1024 * 1024) throw new Error('Artifact exceeds 10MB');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    return { file: name, bytes: bytes.length };
  }
  async read(name) { return fs.readFile(await this.resolve(name)); }
  async document({ filename, title, sections }) {
    if (!filename.endsWith('.docx')) throw new Error('Document filename must end in .docx');
    const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
    for (const section of sections) {
      children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
      for (const p of section.body.split('\n')) children.push(new Paragraph(p));
    }
    const doc = new Document({ creator: 'WhatsApp Work Agent', sections: [{ children }] });
    return this.write(filename, await Packer.toBuffer(doc));
  }
  async presentation({ filename, title, slides }) {
    if (!filename.endsWith('.pptx')) throw new Error('Presentation filename must end in .pptx');
    const deck = new pptxgen();
    deck.layout = 'LAYOUT_WIDE'; deck.author = 'WhatsApp Work Agent'; deck.title = title;
    deck.subject = title; deck.lang = 'en-US';
    deck.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
    const cover = deck.addSlide(); cover.background = { color: '173C36' };
    cover.addText(title, { x: 0.8, y: 1.5, w: 11.5, h: 3.8, fontSize: 38, bold: true, color: 'FFFFFF', breakLine: false, fit: 'shrink', margin: 0 });
    for (const [i, item] of slides.entries()) {
      const slide = deck.addSlide(); slide.background = { color: 'F7F9F8' };
      slide.addText(item.title, { x: 0.7, y: 0.5, w: 11.9, h: 1.2, fontSize: 28, bold: true, color: '173C36', fit: 'shrink', margin: 0 });
      slide.addShape(deck.ShapeType.line, { x: 0.7, y: 1.85, w: 11.9, h: 0, line: { color: '19A183', width: 2 } });
      const height = Math.min(1.1, 4.5 / Math.max(item.bullets.length, 1));
      item.bullets.forEach((text, n) => slide.addText(text, { x: 0.9, y: 2.2 + n * height, w: 11.4, h: height - 0.08, fontSize: 21, color: '263530', bullet: { indent: 16 }, fit: 'shrink', margin: 0.04 }));
      slide.addText(`${i + 1} / ${slides.length}`, { x: 11.5, y: 7, w: 1, h: 0.2, fontSize: 10, color: '62746C', align: 'right' });
      if (item.notes) slide.addNotes(item.notes);
    }
    return this.write(filename, await deck.write({ outputType: 'nodebuffer' }));
  }
}
