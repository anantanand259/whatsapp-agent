import path from 'node:path';

export function config(env = process.env) {
  const numbers = key => (env[key] || '').split(',').map(s => s.trim()).filter(Boolean);
  const c = {
    mode: env.MODE || 'local', host: env.HOST || '127.0.0.1', port: Number(env.PORT || 8787),
    chromePath: env.CHROME_PATH || '', prefix: env.COMMAND_PREFIX || '!agent',
    dataDir: path.resolve(env.DATA_DIR || './data'), owners: numbers('OWNER_NUMBERS'),
    recipients: numbers('ALLOWED_RECIPIENTS'), autoReply: numbers('AUTO_REPLY_NUMBERS'),
    autoInstructions: env.AUTO_REPLY_INSTRUCTIONS || 'Acknowledge receipt as an automated assistant. The owner will review the message.',
    apiKey: env.OPENAI_API_KEY || '', model: env.OPENAI_MODEL || '',
    maxSteps: Number(env.MAX_AGENT_STEPS || 16), graph: env.META_GRAPH_VERSION || '',
    metaToken: env.META_ACCESS_TOKEN || '', phoneId: env.META_PHONE_NUMBER_ID || '',
    appSecret: env.META_APP_SECRET || '', verifyToken: env.META_VERIFY_TOKEN || '',
    githubToken: env.GITHUB_TOKEN || '', repo: env.GITHUB_REPOSITORY || '',
    branch: env.GITHUB_BRANCH || 'agent-work'
  };
  if (!['local', 'personal', 'whatsapp'].includes(c.mode)) throw new Error('MODE must be local, personal or whatsapp');
  if (![...c.owners, ...c.recipients, ...c.autoReply].every(n => /^[1-9][0-9]{6,14}$/.test(n))) throw new Error('Phone numbers must be international digits without + or spaces');
  if (!Number.isInteger(c.maxSteps) || c.maxSteps < 1 || c.maxSteps > 40) throw new Error('MAX_AGENT_STEPS must be 1-40');
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) throw new Error('Invalid PORT');
  return c;
}

export function missing(c, live = c.mode === 'whatsapp') {
  const required = { OPENAI_API_KEY: c.apiKey, OPENAI_MODEL: c.model };
  if (c.mode === 'personal') required.OWNER_NUMBERS = c.owners.length;
  if (live) Object.assign(required, {
    OWNER_NUMBERS: c.owners.length, META_GRAPH_VERSION: c.graph,
    META_ACCESS_TOKEN: c.metaToken, META_PHONE_NUMBER_ID: c.phoneId,
    META_APP_SECRET: c.appSecret, META_VERIFY_TOKEN: c.verifyToken
  });
  return Object.keys(required).filter(k => !required[k]);
}
