// One-command demo: build widget + web, then serve the entire app on one LAN-accessible port.
// Env: PORT (3001), ROOM_SPEED (1), ROOM_DATA_FILE; defaults need no cloud credentials.
// Root .env is loaded by the server itself; variables already in the shell win.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { networkInterfaces } from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
const port = env.PORT || '3001';
env.PORT = port;
env.SPEED = env.SPEED || '4';
env.ROOM_SPEED = env.ROOM_SPEED || '1';
env.AI_MODE = env.AI_MODE || 'fallback';
env.ASSISTANT_MODE = env.ASSISTANT_MODE || 'offline';
env.BW_API_URL = `http://localhost:${port}`;

console.log('[demo] building MCP widget (npm run build:widget -w server) ...');
const build = spawnSync('npm run build:widget -w server', { cwd: root, env, stdio: 'inherit', shell: true });
if (build.status !== 0) {
  console.error('[demo] widget build failed');
  process.exit(build.status ?? 1);
}

console.log('[demo] building phone and shared-TV interface ...');
const webBuild = spawnSync('npm run build -w web', {cwd:root,env,stdio:'inherit',shell:true});
if(webBuild.status!==0)process.exit(webBuild.status??1);

const api = `http://localhost:${port}`;
const lan = Object.values(networkInterfaces()).flat().filter(a=>a && a.family==='IPv4' && !a.internal).map(a=>`http://${a.address}:${port}`);
console.log(`
==================== Benchwarmers demo ====================
 Create / join     ${api}
 Phones on Wi-Fi   ${lan.join('  ') || '(use this computer’s LAN address with port '+port+')'}
 Shared TV         Create a room, then select Open shared screen
 MCP endpoint      ${api}/mcp   (bearer authentication required)
 Health            ${api}/healthz
 Public tunnel     cloudflared tunnel --url ${api}
 Replay            Morning Wood vs Swiss Cheese · fictional script
 Room speed        ROOM_SPEED=${env.ROOM_SPEED} (host can change1–4x)
 AI mode           ${env.AI_MODE} / ${env.ASSISTANT_MODE}
 Saved rooms       server/data/rooms.json (override ROOM_DATA_FILE)
 Legacy views      ${api}/tv/DEMO and ${api}/device/garcias
 Ctrl+C stops the server.
===========================================================
`);

const bin = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const child = spawn(
  process.execPath,
  [bin,path.join(root,'server','src','index.ts')],
  { cwd:path.join(root,'server'), env, stdio:'inherit' },
);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
