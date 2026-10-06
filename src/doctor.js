import { existsSync } from 'node:fs';
import { config, missing } from './config.js';
const c = config();
console.log(`Mode: ${c.mode}`);
console.log(`AI configuration: ${missing(c, false).length ? 'incomplete' : 'present (not validated remotely)'}`);
console.log(`Startup settings missing: ${missing(c).join(', ') || 'none'}`);
console.log(`Chrome: ${c.chromePath ? (existsSync(c.chromePath) ? 'found' : 'path does not exist') : 'using Puppeteer browser cache'}`);
console.log(`GitHub: ${c.repo || 'not set'} / ${c.branch}; ${c.githubToken ? 'token present' : c.githubAuth === 'credential-manager' ? 'using existing Git Credential Manager sign-in' : 'token missing'}`);
console.log('No credentials are printed or tested by this command.');
