# Browser selector adapter

Default CSS/Playwright selectors live in `scripts/basketball/browser.mjs`. Pass a JSON object through `npm run qa:browser -- --selectors path/to/selectors.json`. Omitted keys retain defaults. This is a UI-only adapter: it cannot alter the game, API, receipt, final, or privacy assertions.

```json
{
  "roomName": "#rm-room-name",
  "create": "button:text-is(\"Create room\")",
  "name": "#rm-name",
  "join": "button:text-is(\"Join room\")",
  "autoLineup": "button:text-is(\"Auto-pick lineup\")",
  "hostPanel": ".rm-phone-host > summary",
  "start": "button:text-is(\"Start game\")",
  "option": ".rm-options button:not([disabled])",
  "command": "#rm-command",
  "send": ".rm-assistant button:text-is(\"Send\")",
  "displayPath": "/room/{code}/display",
  "receipt": "[role=\"status\"]",
  "final": "[aria-label=\"Final standings\"]",
  "homeScore": ".rm-bug-team.is-home > b",
  "awayScore": ".rm-bug-team.is-away > b"
}
```

Use `hostPanel: ""` when host controls are already visible. `displayPath` must contain `{code}`, start with `/`, and have no query parameters. Selectors should identify unique controls; the runner uses the first match. The basketball host form must select basketball by default or supply an explicit basketball action as the create control; service identity is checked after creation. If the flow requires another setup event, change C's browser adapter and record it rather than bypassing host UI with API calls.

Full browser run: host creates, joins with name C Maya, auto-picks; a separate C Leo phone joins and auto-picks; third display opens. Host starts; Maya answers a genuine open question. Leo reloads and must restore the saved seat. A typed score question must produce the real rendered assistant response. Leo's browser loses network and must show a stale/reconnect notice, then restore the same seat. The display is checked at 960x480, 1280x800 and 1920x1080. A later accepted pick response is dropped after upstream acceptance; the UI must reconcile it using the original request ID, with a durable receipt lookup. Final/season state is checked across an owned server restart. Page exceptions fail the run.

`--smoke` omits response-loss and final/restart only. Typed input proves command routing, not speech recognition. The service smoke independently performs MCP tools/list and room_status; the browser typed turn is not presented as an MCP room-voice turn. Any future simulator-specific `room_ask` UI acceptance needs its own observed run.
