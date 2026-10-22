export const overlayStyles = `
.bw-layer { position:absolute; inset:0; pointer-events:none; color:#f3ecdf; font:22px/1.35 'Segoe UI',Arial,sans-serif; font-variant-numeric:tabular-nums; color-scheme:dark; }
.bw-layer * { box-sizing:border-box; }
.bw-layer button { pointer-events:auto; font:600 18px/1.2 'Segoe UI',Arial,sans-serif; color:#f3ecdf; background:#303344; border:1px solid #6d6c7d; border-radius:5px; padding:10px 14px; cursor:pointer; }
.bw-layer button:hover { border-color:#f3ecdf; }
.bw-layer button:focus-visible { outline:3px solid #fff; outline-offset:3px; box-shadow:0 0 0 5px #191a26; }
.bw-launcher { position:absolute; background:#191a26f5!important; box-shadow:0 2px 12px #0008; }
.bw-launcher span { display:inline-block; width:7px; height:7px; margin-right:9px; border-radius:50%; background:#eda77b; }
.bw-launcher.is-offline span { background:#e8a0a0; }
.bw-panel { position:absolute; pointer-events:auto; background:#191a26f7; border:1px solid #6d6c7d; border-radius:8px; box-shadow:0 8px 24px #0008; display:flex; flex-direction:column; padding:16px; overflow:hidden; }
.bw-head { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.bw-head h2 { font-size:25px; line-height:1.15; margin:0; }
.bw-head button { padding:7px 10px; }
.bw-nav { display:flex; gap:6px; margin:14px 0; }
.bw-nav button { flex:1; padding:8px 4px; font-size:16px; }
.bw-nav [aria-pressed=true] { background:#eda77b; color:#191a26; }
.bw-content { overflow:auto; padding:4px 5px; min-height:0; scrollbar-width:thin; }
.bw-status { margin:8px 0 0; font-size:13px; color:#b7b6c5; }
.bw-error { color:#e8a0a0; font-size:16px; margin:8px 0; }
.bw-standing { display:flex; align-items:center; gap:14px; padding:9px 0; border-top:1px solid #444553; }
.bw-rank { color:#b7b6c5; min-width:16px; font-size:16px; }
.bw-name { flex:1; overflow-wrap:anywhere; }
.bw-total { color:#eda77b; font-size:26px; font-weight:600; }
.bw-question { font-size:23px; margin:0 0 14px; }
.bw-option { display:flex; justify-content:space-between; gap:10px; border-top:1px solid #444553; padding:10px 0; font-size:18px; }
.bw-small { color:#b7b6c5; font-size:16px; margin:8px 0; }
.bw-roster-select { display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px; }
.bw-roster-select button { font-size:14px; padding:7px 9px; }
.bw-roster-select [aria-pressed=true] { border-color:#eda77b; color:#eda77b; }
.bw-roster-row { padding:10px 0; border-top:1px solid #444553; font-size:19px; }
.bw-roster-row strong { float:right; }
.bw-foot { display:flex; justify-content:space-between; gap:12px; margin-top:12px; }
.bw-foot button { font-size:13px; padding:6px 9px; }
`;
