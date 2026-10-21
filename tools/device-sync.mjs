// usage: node tools/device-sync.mjs <webBase e.g. http://localhost:5177> <outdir> sync|season  (Checkpoint-4 driver: headless Chrome over CDP, two device pages)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [base = 'http://localhost:5177', outdir = '.', mode = 'sync'] = process.argv.slice(2);
const port = 9300 + Math.floor(Math.random() * 500);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bwcp4-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
  '--window-size=1280,800', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
console.log('chrome pid', chrome.pid);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let version;
for (let i = 0; i < 50 && !version; i++) { await sleep(200); try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch {} }

async function openPage(url, label) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const logs = []; const contexts = []; const sessions = [];
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Target.attachedToTarget') sessions.push(d.params);
    if (d.method === 'Runtime.consoleAPICalled') logs.push(`[${label}] ${d.params.type}: ` + d.params.args.map((a) => a.value ?? a.description).join(' '));
    if (d.method === 'Runtime.exceptionThrown') logs.push(`[${label}] EXC: ` + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
    if (d.method === 'Runtime.executionContextCreated') contexts.push(d.params.context);
    if (d.method === 'Log.entryAdded') logs.push(`[${label}] LOG ${d.params.entry.level}: ${d.params.entry.text} ${d.params.entry.url ?? ''}`);
  });
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  const evalJs = async (expression, contextId) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...(contextId ? { contextId } : {}) });
    return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;
  };
  // Text of the widget iframe (opaque-origin srcdoc child frame), via a CDP isolated world.
  const frameText = async () => {
    // The opaque-origin widget frame runs out of process (OOPIF): evaluate via its auto-attached session.
    for (const ss of [...sessions].reverse()) {
      if (ss.targetInfo.type !== 'iframe') continue;
      const r = await send('Runtime.evaluate', { expression: 'document.body ? document.body.innerText : ""', returnByValue: true }, ss.sessionId);
      const v = r.result?.result?.value;
      if (typeof v === 'string') return v;
    }
    const tree = await send('Page.getFrameTree');
    const kids = tree.result?.frameTree?.childFrames ?? [];
    if (!kids.length) return null;
    const w = await send('Page.createIsolatedWorld', { frameId: kids[0].frame.id, worldName: 'cp4' });
    const ctx = w.result?.executionContextId;
    return ctx ? evalJs('document.body ? document.body.innerText : ""', ctx) : null;
  };
  const frameEval = async (expression) => {
    for (const ss of [...sessions].reverse()) {
      if (ss.targetInfo.type !== 'iframe') continue;
      const r = await send('Runtime.evaluate', { expression, returnByValue: true }, ss.sessionId);
      if (r.result?.result) return r.result.result.value;
    }
    return null;
  };
  const type = async (text) => {
    await evalJs(`(() => { const el = document.querySelector('[aria-label="Type a message"]'); el.focus(); return !!el; })()`);
    await send('Input.insertText', { text });
    await sleep(100);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  };
  const shot = async (file) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
    console.log('saved', file);
  };
  return { send, evalJs, frameText, frameEval, type, shot, logs, ws, label };
}

const pageInfo = (p) => p.evalJs(`JSON.stringify({
  coi: self.crossOriginIsolated,
  frame: (() => { const f = document.querySelector('iframe'); return f ? { title: f.title, sandbox: f.getAttribute('sandbox'), hidden: f.hidden, h: f.getBoundingClientRect().height } : null; })(),
  fallback: (() => { const c = document.querySelector('[aria-label="Party board"]:not(iframe)'); return c ? c.getAttribute('data-view') : null; })(),
  transcript: document.body.innerText.slice(0, 1500)
})`);

async function waitFor(fn, ms, step = 200) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = await fn(); if (v) return { v, ms: Date.now() - t0 }; await sleep(step); }
  return { v: null, ms: Date.now() - t0 };
}

try {
  if (mode === 'sync') {
    const A = await openPage(`${base}/device/garcias`, 'A');
    const B = await openPage(`${base}/device/sams-place`, 'B');
    await sleep(5000);
    await B.type("Who's available at center?");
    const bw = await waitFor(async () => { const t = await B.frameText(); return t && t.length > 20 ? t : null; }, 12000);
    console.log('B widget text after center question (ms', bw.ms, '):', (bw.v ?? '<none>').slice(0, 300).replace(/\n/g, ' | '));
    await B.shot(path.join(outdir, 'cp4-sams-before.png'));
    await A.type("I'm Maya, draft Big Mo");
    const t0 = Date.now();
    const takenBy = (ft) => { const i = ft.search(/Moses Adeyemi/); const near = i >= 0 ? ft.slice(Math.max(0, i - 120), i + 160) : ''; return /Maya · The Garcias/.test(near) ? near.replace(/\n/g, ' | ') : null; };
    const [aw, sync] = await Promise.all([
      waitFor(async () => takenBy((await A.frameText()) ?? ''), 12000, 100),
      waitFor(async () => {
        const hit = takenBy((await B.frameText()) ?? '');
        if (hit) return { where: 'iframe', near: hit };
        const main = (await B.evalJs('document.body.innerText')) ?? '';
        return /Maya[\s\S]{0,80}Moses Adeyemi/.test(main) ? { where: 'fallback-card' } : null;
      }, 12000, 100),
    ]);
    console.log('A widget shows pick', aw.v ? 'yes' : 'NO', 'after', aw.ms, 'ms:', aw.v);
    console.log('B shows Big Mo drafted by Maya after', sync.ms, 'ms from typing in A:', JSON.stringify(sync.v));
    await sleep(500);
    // Bring the taken Big Mo card into view in both widgets; open the agent trace on garcias.
    const scrollJs = "(() => { const el = [...document.querySelectorAll('article.taken')].find((a) => a.textContent.includes('Adeyemi')); if (!el) return false; el.scrollIntoView({ block: 'center' }); return true; })()";
    console.log('scroll A', await A.frameEval(scrollJs), 'scroll B', await B.frameEval(scrollJs));
    await A.evalJs(`(() => { const t = document.querySelector('[aria-label="Show agent trace"]'); t && t.click(); return !!t; })()`);
    await sleep(600);
    await A.shot(path.join(outdir, 'cp4-garcias.png'));
    await B.shot(path.join(outdir, 'cp4-sams-place.png'));
    console.log('A info', await pageInfo(A));
    console.log('B info', await pageInfo(B));
    console.log('A iframe text:', ((await A.frameText()) ?? '').slice(0, 600).replace(/\n/g, ' | '));
    console.log('B iframe text:', ((await B.frameText()) ?? '').slice(0, 600).replace(/\n/g, ' | '));
    console.log([...A.logs, ...B.logs].slice(-30).join('\n'));
  } else {
    const A = await openPage(`${base}/device/garcias`, 'A');
    await sleep(5000);
    await A.evalJs(`(() => { const b = document.querySelector('[data-testid="member-maya"]'); b && b.click(); return !!b; })()`);
    await sleep(300);
    await A.type('how am I doing this season?');
    await sleep(6000);
    await A.shot(path.join(outdir, 'cp4-season.png'));
    console.log('A info', await pageInfo(A));
    console.log('A iframe text:', ((await A.frameText()) ?? '').slice(0, 600).replace(/\n/g, ' | '));
    console.log(A.logs.slice(-20).join('\n'));
  }
} finally {
  chrome.kill(); await sleep(400); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
process.exit(0);
