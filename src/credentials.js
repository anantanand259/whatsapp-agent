import { spawn } from 'node:child_process';

export function githubCredential() {
  if (process.platform !== 'win32') throw new Error('Credential Manager mode currently supports Windows; configure GITHUB_TOKEN on other hosts.');
  return new Promise((resolve, reject) => {
    const child = spawn('C:/Program Files/Git/mingw64/bin/git-credential-manager.exe', ['get'], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, GCM_INTERACTIVE: 'Never', GIT_TERMINAL_PROMPT: '0' }
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('GitHub credential lookup timed out')); }, 15000);
    child.stdout.on('data', data => { output += data; if (output.length > 65536) child.kill(); });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error('Git Credential Manager is unavailable. Sign in to GitHub through Git or configure GITHUB_TOKEN.')); });
    child.on('close', code => {
      clearTimeout(timer);
      const password = output.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
      if (code !== 0 || !password) return reject(new Error('GitHub sign-in is unavailable. Sign in through Git or configure GITHUB_TOKEN.'));
      resolve(password);
    });
    child.stdin.end('protocol=https\nhost=github.com\n\n');
  });
}
