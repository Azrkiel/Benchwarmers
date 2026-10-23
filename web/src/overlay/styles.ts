export const overlayStyles = `
.bw-layer { position:absolute; inset:0; pointer-events:none; color:#ffffff; font:18px/1.35 'Segoe UI',Arial,sans-serif; font-variant-numeric:tabular-nums; color-scheme:dark; }
.bw-layer * { box-sizing:border-box; }
.bw-layer button { pointer-events:auto; font:600 18px/1.2 'Segoe UI',Arial,sans-serif; color:#ffffff; background:#26272a; border:1px solid #73767d; border-radius:5px; padding:10px 14px; cursor:pointer; }
.bw-layer button:hover { border-color:#ffffff; }
.bw-layer button:focus-visible { outline:3px solid #fff; outline-offset:3px; box-shadow:0 0 0 5px #101113; }
.bw-launcher { position:absolute; background:#101113f5!important; box-shadow:0 2px 12px #0008; }
.bw-launcher span { display:inline-block; width:7px; height:7px; margin-right:9px; border-radius:50%; background:#f51825; }
.bw-launcher.is-offline span { background:#ff7b86; }
.bw-panel { position:absolute; pointer-events:auto; background:#101113f7; border:1px solid #4b4d52; border-radius:8px; box-shadow:0 8px 24px #0008; display:flex; flex-direction:column; padding:12px; overflow:hidden; }
.bw-head { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.bw-head h2 { font-size:20px; line-height:1.15; margin:0; }
.bw-head button { padding:7px 10px; }
.bw-nav { display:flex; gap:6px; margin:8px 0; }
.bw-nav button { flex:1; padding:8px 4px; font-size:16px; }
.bw-nav [aria-pressed=true] { background:#f51825; color:#fff; }
.bw-content { overflow:auto; padding:4px 5px; min-height:0; scrollbar-width:thin; }
.bw-status { margin:8px 0 0; font-size:13px; color:#bfc2c8; }
.bw-error { color:#ff7b86; font-size:16px; margin:8px 0; }
.bw-standing { display:flex; align-items:center; gap:14px; padding:7px 0; border-top:1px solid #4b4d52; }
.bw-rank { color:#bfc2c8; min-width:16px; font-size:16px; }
.bw-name { flex:1; overflow-wrap:anywhere; }
.bw-total { color:#fff; font-size:22px; font-weight:600; }
.bw-question { font-size:23px; margin:0 0 14px; }
.bw-option { display:flex; justify-content:space-between; gap:10px; border-top:1px solid #4b4d52; padding:10px 0; font-size:18px; }
.bw-small { color:#bfc2c8; font-size:16px; margin:8px 0; }
.bw-roster-select { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px; }
.bw-roster-select button { font-size:14px; padding:7px 9px; }
.bw-roster-select [aria-pressed=true] { border-color:#f51825; color:#ff7b86; }
.bw-roster-row { padding:10px 0; border-top:1px solid #4b4d52; font-size:19px; }
.bw-roster-row strong { float:right; }
.bw-foot { display:flex; justify-content:space-between; gap:12px; margin-top:12px; }
.bw-foot button { font-size:14px; padding:10px 9px; min-height:40px; }
.bw-brand { display:block; font-size:11px; color:#bfc2c8; text-transform:uppercase; letter-spacing:.1em; margin-bottom:3px; }
.bw-layer a { pointer-events:auto; color:#ff7b86; font:600 14px/1.3 'Segoe UI',Arial,sans-serif; }
.bw-control-link { min-height:40px; display:flex; align-items:center; text-decoration:underline; flex-shrink:0; }
.bw-layer :is(a,summary):focus-visible { outline:3px solid #fff; outline-offset:2px; }
.bw-head button { min-width:44px; min-height:44px; }
.bw-nav button { min-height:40px; }
.bw-columns { display:flex; justify-content:space-between; margin:0 0 5px; font-size:12px; }
.bw-status { flex-shrink:0; }
.bw-diagnostics { max-height:80px; overflow:auto; font-size:12px; color:#bfc2c8; }
.bw-diagnostics summary { cursor:pointer; }
.bw-launcher small { display:block; color:#ff7b86; font-size:11px; }
.bw-foot { margin-top:4px; flex-shrink:0; gap:8px; align-items:center; }
.bw-compact { padding:8px 12px; }
.bw-compact .bw-head h2 { font-size:16px; }
`;
