import { jsonRequest } from './http.js';
import { safeName } from './artifacts.js';
import { githubCredential } from './credentials.js';

export class GitHub {
  constructor(c, request = jsonRequest, credential = githubCredential) { this.c = c; this.request = request; this.credential = credential; }
  async api(route, method = 'GET', data) {
    const c = this.c;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(c.repo)) throw new Error('Configure GITHUB_REPOSITORY first');
    const token = c.githubToken || (c.githubAuth === 'credential-manager' ? await this.credential() : '');
    if (!token) throw new Error('Configure GITHUB_TOKEN or GITHUB_AUTH=credential-manager first');
    return this.request(`https://api.github.com/repos/${c.repo}${route}`, {
      method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      ...(data ? { body: JSON.stringify(data) } : {})
    });
  }
  async push(artifacts, files, message) {
    if (!files.length || new Set(files).size !== files.length) throw new Error('Provide unique artifact paths');
    files.forEach(safeName);
    const ref = await this.api(`/git/ref/heads/${encodeURIComponent(this.c.branch)}`);
    const parent = await this.api(`/git/commits/${ref.object.sha}`);
    const tree = [];
    for (const file of files) {
      const blob = await this.api('/git/blobs', 'POST', { content: (await artifacts.read(file)).toString('base64'), encoding: 'base64' });
      tree.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await this.api('/git/trees', 'POST', { base_tree: parent.tree.sha, tree });
    const commit = await this.api('/git/commits', 'POST', { message, tree: newTree.sha, parents: [ref.object.sha] });
    await this.api(`/git/refs/heads/${encodeURIComponent(this.c.branch)}`, 'PATCH', { sha: commit.sha, force: false });
    return { commit: commit.sha, url: `https://github.com/${this.c.repo}/commit/${commit.sha}`, branch: this.c.branch };
  }
}
