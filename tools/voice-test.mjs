// usage: node tools/voice-test.mjs <clipsDir> <http://localhost:PORT/voice-lab> <wavlm|mfcc>  (needs vite dev running; clips from tools/tts-clips.ps1)
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [dir, url, which = 'wavlm'] = process.argv.slice(2);
const clips = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.wav'))) {
  const b = fs.readFileSync(path.join(dir, f)); const dataIdx = b.indexOf('data') + 8;
  const n = (b.length - dataIdx) >> 1; const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = +(b.readInt16LE(dataIdx + 2 * i) / 32768).toFixed(5);
  clips[f.replace('.wav', '')] = a;
}
const port = 9300 + Math.floor(Math.random() * 500);
const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'bwvt-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let t; for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === 'Runtime.consoleAPICalled') console.log('[page]', d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.navigate', { url }); await sleep(3000);
const expr = `(async () => {
  const clips = ${JSON.stringify(clips)};
  const m = await import('/src/voiceid/embedder.ts');
  const e = ${which === 'mfcc' ? 'm.createMfccEmbedder()' : 'm.createWorkerEmbedder()'};
  const t0 = performance.now(); const info = await e.load((p) => {}); const loadMs = performance.now() - t0;
  const emb = {}; const t1 = performance.now();
  for (const [k, v] of Object.entries(clips)) emb[k] = Array.from(await e.embed(Float32Array.from(v)));
  const perClip = (performance.now() - t1) / Object.keys(clips).length;
  return JSON.stringify({ info, loadMs, perClip, emb });
})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 });
if (r.result.exceptionDetails) { console.log('EXC', JSON.stringify(r.result.exceptionDetails).slice(0, 800)); }
else {
  const { info, loadMs, perClip, emb } = JSON.parse(r.result.result.value);
  console.log('backend', JSON.stringify(info), 'loadMs', Math.round(loadMs), 'perClipMs', Math.round(perClip));
  const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const cent = (keys) => norm(keys.map((k) => emb[k]).reduce((acc, v) => acc.map((x, i) => x + v[i])));
  const C = { david: cent(['david-0', 'david-1', 'david-2']), zira: cent(['zira-0', 'zira-1', 'zira-2']) };
  for (const k of ['david-3', 'david-4', 'zira-3', 'zira-4']) console.log(k, 'vs david', cos(norm(emb[k]), C.david).toFixed(3), 'vs zira', cos(norm(emb[k]), C.zira).toFixed(3));
}
ws.close(); chrome.kill(); await sleep(300); try { fs.rmSync(udd, { recursive: true, force: true }); } catch {}
