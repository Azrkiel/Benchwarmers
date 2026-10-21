// One-command demo: build the MCP widget, then run server (SPEED=4) + web together.
// Env: PORT (3001), WEB_PORT (5173), SPEED (4), MCP_TOKEN; AI_MODE / ASSISTANT_MODE default to offline-safe values.
// Root .env is loaded by the server itself; variables already in the shell win.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
const port = env.PORT || '3001';
const webPort = env.WEB_PORT || '5173';
env.PORT = port;
env.SPEED = env.SPEED || '4';
env.BW_API_URL = `http://localhost:${port}`;
const token = env.MCP_TOKEN || 'dev-token-change-me';

console.log('[demo] building MCP widget (npm run build:widget -w server) ...');
const build = spawnSync('npm run build:widget -w server', { cwd: root, env, stdio: 'inherit', shell: true });
if (build.status !== 0) {
  console.error('[demo] widget build failed');
  process.exit(build.status ?? 1);
}

const web = `http://localhost:${webPort}`;
const api = `http://localhost:${port}`;
console.log(`
==================== Benchwarmers demo ====================
 TV (big screen)   ${web}/tv/DEMO
 Device: Garcias   ${web}/device/garcias
 Device: Sam's     ${web}/device/sams-place
 Voice lab         ${web}/voice-lab
 MCP endpoint      ${api}/mcp   (Authorization: Bearer ${token})
 Health            ${api}/healthz
 Reset DEMO party  npm run demo:reset   (POST ${api}/api/parties/DEMO/reset)
 Public tunnel     cloudflared tunnel --url ${api}
 Game speed        SPEED=${env.SPEED}   AI_MODE=${env.AI_MODE || '(.env or fallback)'}   ASSISTANT_MODE=${env.ASSISTANT_MODE || '(.env or offline)'}
 Ctrl+C stops both processes.
===========================================================
`);

const bin = path.join(root, 'node_modules', 'concurrently', 'dist', 'bin', 'concurrently.js');
const child = spawn(
  process.execPath,
  [
    bin, '--kill-others', '-n', 'server,web', '-c', 'blue,magenta',
    'npm run start -w server',
    `npm run dev -w web -- --port ${webPort} --strictPort`,
  ],
  { cwd: root, env, stdio: 'inherit' },
);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
