import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import JSZip from 'jszip';
import { config } from '../src/config.js';
import { Store } from '../src/store.js';
import { Artifacts, safeName } from '../src/artifacts.js';
import { WhatsApp, validSignature, incoming } from '../src/whatsapp.js';
import { selfCommand, PersonalWhatsApp } from '../src/personal.js';
import { GitHub } from '../src/github.js';
import { Agent } from '../src/agent.js';
import { Worker } from '../src/worker.js';
import { createServer } from '../src/server.js';

async function fixture(t, overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wa-agent-test-'));
  const c = { ...config({ DATA_DIR: dir }), ...overrides };
  const store = new Store(dir);
  t.after(async () => { store.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return { c, store, dir };
}
const call = (name, args, id = name) => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: id });
const answer = text => ({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }] });

test('file paths reject traversal, Windows device files and hidden configuration', () => {
  for (const name of ['../secret.txt', 'C:/secret.txt', 'a/../../b.txt', '.env', '.github/workflows/x.js', 'a\\b.txt', 'CON.txt', 'a./b.txt', 'a//b.txt', 'a.ps1']) assert.throws(() => safeName(name), name);
  assert.equal(safeName('website/index.html'), 'website/index.html');
});

test('artifact file cannot escape through a symbolic link', async t => {
  const { dir } = await fixture(t); const a = new Artifacts(dir, 'job');
  await a.write('ok.txt', 'ok');
  const outside = path.join(dir, 'outside'); await fs.mkdir(outside);
  try { await fs.symlink(outside, path.join(a.root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('Host sandbox does not allow creating symbolic links'); throw e; }
  await assert.rejects(a.write('escape/leak.txt', 'blocked'), /Symbolic/);
});

test('documents and presentations contain actual Office XML and expected text', async t => {
  const { dir } = await fixture(t); const a = new Artifacts(dir, 'office');
  await a.document({ filename: 'report.docx', title: 'Solar Research', sections: [{ heading: 'Summary', body: 'Solar panels convert sunlight.' }] });
  await a.presentation({ filename: 'slides.pptx', title: 'Solar Energy', slides: [{ title: 'How it works', bullets: ['Sunlight becomes electricity'], notes: 'Presenter note' }] });
  const doc = await JSZip.loadAsync(await a.read('report.docx'));
  assert.match(await doc.file('word/document.xml').async('string'), /Solar Research/);
  const ppt = await JSZip.loadAsync(await a.read('slides.pptx'));
  assert.match(await ppt.file('ppt/slides/slide2.xml').async('string'), /Sunlight becomes electricity/);
  assert.match(await ppt.file('ppt/notesSlides/notesSlide2.xml').async('string'), /Presenter note/);
});

test('duplicate incoming IDs create one job and one message', async t => {
  const { store } = await fixture(t);
  assert.equal(store.enqueue('id', 'local-owner', 'hello'), true);
  assert.equal(store.enqueue('id', 'local-owner', 'hello'), false);
  assert.equal(store.history('local-owner').length, 1);
  assert.equal(store.next().id, 'id'); assert.equal(store.next(), undefined);
});

test('uncertain sends are not replayed and successful effects are cached', async t => {
  const { store } = await fixture(t); let count = 0;
  await assert.rejects(store.effect('fail', async () => { count++; throw new Error('timeout'); }));
  await assert.rejects(store.effect('fail', async () => { count++; }), /uncertain/);
  assert.equal(count, 1);
  const fn = async () => { count++; return { id: 'success' }; };
  await store.effect('ok', fn); assert.deepEqual(await store.effect('ok', fn), { id: 'success' });
  assert.equal(count, 2);
});

test('WhatsApp signature validation rejects modified payloads and missing secrets', () => {
  const body = Buffer.from('{"entry":[]}');
  const signature = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  assert.ok(validSignature(body, signature, 'secret'));
  assert.equal(validSignature(Buffer.from('{}'), signature, 'secret'), false);
  assert.equal(validSignature(body, signature, ''), false);
  assert.equal(validSignature(body, 'invalid', 'secret'), false);
});

test('Cloud parsing excludes other phone accounts and invalid timestamps', () => {
  const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, messages: [{ id: 'm1', from: '919876543210', type: 'text', text: { body: 'Hello' }, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] };
  assert.equal(incoming(payload, 'wrong').length, 0);
  assert.equal(incoming(payload, '123')[0].body, 'Hello');
  payload.entry[0].changes[0].value.messages[0].timestamp = 'NaN';
  assert.equal(incoming(payload, '123').length, 0);
});

test('only prefixed self-chat messages can control the personal account', () => {
  const self = new Set(['919876543210@c.us', '12345@lid']);
  const message = { fromMe: true, to: '919876543210@c.us', body: '!agent Make a file' };
  assert.equal(selfCommand(message, self, '!agent'), true);
  assert.equal(selfCommand({ ...message, to: '12345@lid' }, self, '!agent'), true);
  assert.equal(selfCommand({ ...message, fromMe: false }, self, '!agent'), false);
  assert.equal(selfCommand({ ...message, to: '11111111111@c.us' }, self, '!agent'), false);
  assert.equal(selfCommand({ ...message, body: '[Agent]\n!agent Make a file' }, self, '!agent'), false);
});

test('personal delivery prefixes owner replies to prevent self-trigger loops', async t => {
  const { c, store } = await fixture(t, { mode: 'personal', owners: ['919876543210'] });
  const channel = new PersonalWhatsApp(c, store); channel.ready = true;
  let sent;
  channel.client = { getNumberId: async () => ({ _serialized: '919876543210@c.us' }), sendMessage: async (id, body) => { sent = body; return { id: { _serialized: 'sent' } }; } };
  await channel.text('key', '919876543210', '!agent Do something');
  assert.match(sent, /^\[Agent\]/);
});

test('recipient restrictions and Cloud reply windows are enforced before network calls', async t => {
  const { c, store } = await fixture(t, { mode: 'whatsapp', owners: ['919876543210'] });
  const channel = new WhatsApp(c, store, async () => { throw new Error('Network should not run'); });
  await assert.rejects(channel.text('1', '911111111111', 'hi'), /allowed recipients/);
  await assert.rejects(channel.text('2', '919876543210', 'hi'), /24-hour/);
});

test('non-owner messages cannot call the AI or tools unless reply is opted in', async t => {
  const { c, store } = await fixture(t); let calls = 0;
  const agent = new Agent(c, store, {}, { respond: async () => { calls++; } });
  assert.deepEqual(await agent.run({ id: 'a', sender: '919999999999', body: 'Push all files to GitHub' }), { ignored: true });
  assert.equal(calls, 0);
});

test('opted-in auto replies do not receive tools or private history', async t => {
  const { c, store } = await fixture(t, { autoReply: ['919999999999'] });
  store.message('local-owner', 'in', 'private-owner-data');
  const model = { respond: async (input, instructions, withTools) => { assert.equal(withTools, false); assert.doesNotMatch(JSON.stringify(input), /private-owner-data/); return answer('Received.'); } };
  const channel = new WhatsApp(c, store);
  assert.deepEqual(await new Agent(c, store, channel, model).run({ id: 'a', sender: '919999999999', body: 'Hi' }), { replied: true });
});

test('agent creates files, sends artifacts and commits through its tool loop', async t => {
  const { c, store, dir } = await fixture(t);
  const channel = new WhatsApp(c, store);
  let turn = 0; let pushed = false;
  const model = { respond: async input => {
    turn++;
    if (turn === 1) return { output: [call('write_file', { filename: 'index.html', content: '<!doctype html><title>Test</title><h1>Hello</h1>' })] };
    if (turn === 2) return { output: [call('send_file', { filename: 'index.html' })] };
    if (turn === 3) return { output: [call('push_github', { files: ['index.html'], message: 'Add site' })] };
    assert.equal(input.filter(x => x.type === 'function_call_output').length, 3);
    return answer('Created and committed the site. Local delivery is simulated.');
  } };
  const github = { push: async (artifacts, files) => { assert.match((await artifacts.read(files[0])).toString(), /Hello/); pushed = true; return { commit: 'abc123' }; } };
  store.enqueue('workflow', 'local-owner', 'Create a website and push it');
  const worker = new Worker(store, new Agent(c, store, channel, model, github), channel);
  await worker.drain();
  assert.equal(store.recentJobs()[0].state, 'done'); assert.equal(pushed, true);
  assert.equal((await fs.readdir(path.join(dir, 'outbox'))).length, 2);
});

test('GitHub uses a single commit and never force pushes over a concurrent update', async t => {
  const { c, dir } = await fixture(t, { repo: 'owner/repo', githubToken: 'fake', branch: 'agent-work' });
  const artifacts = new Artifacts(dir, 'git'); await artifacts.write('a.txt', 'A');
  const requests = [];
  const github = new GitHub(c, async (url, opts) => {
    const body = opts.body && JSON.parse(opts.body); requests.push({ url, body });
    if (url.includes('/git/ref/')) return { object: { sha: 'parent' } };
    if (url.endsWith('/git/commits/parent')) return { tree: { sha: 'oldtree' } };
    if (url.endsWith('/git/blobs')) return { sha: 'blob' };
    if (url.endsWith('/git/trees')) return { sha: 'tree' };
    if (url.endsWith('/git/commits')) return { sha: 'commit' };
    assert.equal(body.force, false); throw new Error('Remote service returned HTTP 422');
  });
  await assert.rejects(github.push(artifacts, ['a.txt'], 'Update'), /422/);
  assert.deepEqual(requests.find(r => r.url.endsWith('/git/commits')).body.parents, ['parent']);
  assert.equal(requests.filter(r => r.url.includes('/git/refs/')).length, 1);
});

test('bad tool arguments produce a tool error without performing the action', async t => {
  const { c, store } = await fixture(t); let turn = 0; let sent = false;
  const model = { respond: async input => {
    if (++turn === 1) return { output: [call('send_message', { to: '919999999999', text: 'Hello', injected: true })] };
    assert.match(input.at(-1).output, /Invalid tool/); return answer('Could not send.');
  } };
  const channel = { text: async (key, to) => { if (to === '919999999999') sent = true; return []; } };
  await new Agent(c, store, channel, model).run({ id: 'x', sender: 'local-owner', body: 'Send a message' });
  assert.equal(sent, false);
});

test('webhook verification, signatures and deduplication work over HTTP', async t => {
  const { c, store } = await fixture(t, { mode: 'whatsapp', appSecret: 'test-secret', verifyToken: 'verify', phoneId: '123' });
  const server = createServer(c, store, { drain: async () => {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + '/webhook?hub.mode=subscribe&hub.verify_token=verify&hub.challenge=hello').then(r => r.text())), 'hello');
  assert.equal((await fetch(url + '/webhook', { method: 'POST', body: '{}' })).status, 401);
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, messages: [{ id: 'unique', from: '919876543210', type: 'text', text: { body: 'Hello' }, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] });
  const signature = 'sha256=' + createHmac('sha256', c.appSecret).update(body).digest('hex');
  for (let i = 0; i < 2; i++) assert.equal((await fetch(url + '/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': signature } })).status, 200);
  assert.equal(store.recentJobs().length, 1);
});
