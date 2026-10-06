export class Worker {
  constructor(store, agent, channel) { Object.assign(this, { store, agent, channel }); this.busy = false; }
  async drain() {
    if (this.busy) return;
    this.busy = true;
    try {
      let job;
      while ((job = this.store.next())) {
        try { await this.agent.run(job); this.store.finish(job.id, 'done'); }
        catch (e) {
          this.store.finish(job.id, 'failed', e.message);
          console.error(`Task failed: ${e.message}`);
          const isOwner = this.agent.c.owners.includes(job.sender) || job.sender === 'local-owner';
          if (isOwner) try { await this.channel.text(`${job.id}:error`, job.sender, `Task failed: ${e.message}`); } catch { console.error('Could not deliver task failure notice'); }
        }
      }
    } finally { this.busy = false; }
  }
}
