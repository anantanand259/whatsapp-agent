import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(dir) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(path.join(dir, 'agent.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, sender TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued', created INTEGER NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, peer TEXT NOT NULL, direction TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS windows (peer TEXT PRIMARY KEY, received INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS effects (key TEXT PRIMARY KEY, state TEXT NOT NULL, result TEXT);
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, job TEXT, action TEXT, state TEXT, created INTEGER);
      UPDATE jobs SET state='interrupted', error='Process stopped during task. Review artifacts and audit before sending a new request.' WHERE state='running';`);
  }
  enqueue(id, sender, body, timestamp = Date.now()) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = this.db.prepare('INSERT OR IGNORE INTO jobs(id,sender,body,created) VALUES(?,?,?,?)').run(id, sender, body, Date.now()).changes;
      if (inserted) {
        this.message(sender, 'in', body, timestamp);
        this.db.prepare('INSERT INTO windows VALUES(?,?) ON CONFLICT(peer) DO UPDATE SET received=MAX(received,excluded.received)').run(sender, timestamp);
      }
      this.db.exec('COMMIT');
      return Boolean(inserted);
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  next() {
    return this.db.prepare("UPDATE jobs SET state='running' WHERE id=(SELECT id FROM jobs WHERE state='queued' ORDER BY created,rowid LIMIT 1) RETURNING *").get();
  }
  finish(id, state, error = null) { this.db.prepare('UPDATE jobs SET state=?,error=? WHERE id=?').run(state, error, id); }
  message(peer, direction, body, timestamp = Date.now()) { this.db.prepare('INSERT INTO messages(peer,direction,body,created) VALUES(?,?,?,?)').run(peer, direction, body, timestamp); }
  history(peer, limit = 20) { return this.db.prepare('SELECT direction,body,created FROM (SELECT * FROM messages WHERE peer=? ORDER BY id DESC LIMIT ?) ORDER BY id').all(peer, limit); }
  inbox() { return this.db.prepare("SELECT peer,body,created FROM messages WHERE direction='in' ORDER BY id DESC LIMIT 30").all(); }
  recentJobs() { return this.db.prepare('SELECT id,state,error,created FROM jobs ORDER BY created DESC LIMIT 10').all(); }
  inWindow(peer) { const row = this.db.prepare('SELECT received FROM windows WHERE peer=?').get(peer); return Boolean(row && Date.now() - row.received < 86400000); }
  audit(job, action, state) { this.db.prepare('INSERT INTO audit(job,action,state,created) VALUES(?,?,?,?)').run(job, action, state, Date.now()); }
  async effect(key, fn) {
    const previous = this.db.prepare('SELECT * FROM effects WHERE key=?').get(key);
    if (previous?.state === 'done') return JSON.parse(previous.result);
    if (previous) throw new Error('Previous delivery has an uncertain outcome; inspect provider records before retrying.');
    this.db.prepare("INSERT INTO effects(key,state) VALUES(?,'started')").run(key);
    const result = await fn();
    this.db.prepare("UPDATE effects SET state='done',result=? WHERE key=?").run(JSON.stringify(result), key);
    return result;
  }
  close() { this.db.close(); }
}
