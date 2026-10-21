// Reset the DEMO party (and season stats) to seed. Honors PORT (default 3001).
const base = `http://localhost:${process.env.PORT || 3001}`;
const res = await fetch(`${base}/api/parties/DEMO/reset`, { method: 'POST' });
console.log(`POST ${base}/api/parties/DEMO/reset -> ${res.status}`);
process.exit(res.ok ? 0 : 1);
