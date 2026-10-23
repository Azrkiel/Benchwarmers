# Browser selector adapter

Default CSS/Playwright selectors live in `scripts/basketball/browser.mjs`. Pass a JSON object through `npm run qa:browser -- --selectors path/to/selectors.json`. Omitted keys retain defaults. This is a UI-only adapter: it cannot alter the game, API, receipt, final, or privacy assertions.

```json
{
  "hostOpen": "button:text-is(\"Host a party\")",
  "gameChoice": "input[name=\"rm-game\"][value=\"{game}\"]",
  "roomName": "#rm-room-name",
  "create": "button:text-is(\"Create party\")",
  "name": "#rm-name",
  "join": "button:text-is(\"Join room\")",
  "autoLineup": "button:text-is(\"Auto-pick lineup\")",
  "hostPanel": ".rm-phone-host > summary",
  "start": "button:text-is(\"Start game\")",
  "option": ".rm-options button:not([disabled])",
  "command": "#rm-command",
  "send": ".rm-assistant button:text-is(\"Send\")",
  "displayPath": "/room/{code}/display",
  "receipt": ".rm-receipt",
  "final": "[aria-label=\"Final standings\"]",
  "homeScore": ".rd-team.is-home .rd-team-score",
  "awayScore": ".rd-team.is-away .rd-team-score"
}
```

The runner opens `hostOpen` when the name field is hidden, then checks `gameChoice` after replacing `{game}` with the selected game. Use `hostOpen: ""` for a page where the form is already visible, `gameChoice: ""` for a legacy form without a game selector, and `hostPanel: ""` when host controls are already visible. The real service response must still identify the requested sport. `displayPath` must contain `{code}`, start with `/`, and have no query parameters. Selectors should identify unique controls; the runner uses the first match. The defaults now match the combined A/B/C interface, so no selector file is required.

Full browser run: host creates, joins with name C Maya, auto-picks; a separate C Leo phone joins and auto-picks; third display opens. Host starts; Maya answers a genuine open question. Leo reloads and must restore the saved seat. A typed score question must produce the real rendered assistant response. Leo's browser loses network and must show a stale/reconnect notice, then restore the same seat. The display is checked at 960x480, 1280x800 and 1920x1080. A later accepted pick response is dropped after upstream acceptance; the UI must reconcile it using the original request ID, with a durable receipt lookup. Final/season state is checked across an owned server restart. Page exceptions fail the run.

`--smoke` omits response-loss and final/restart only. Typed input proves command routing, not speech recognition. The service smoke independently performs MCP tools/list and room_status; the browser typed turn is not presented as an MCP room-voice turn. Any future simulator-specific `room_ask` UI acceptance needs its own observed run.

## Integrated capture requirements

`displayFinal` defaults to `.rd-final-score`; it must identify the shared screen's final result, independently of the phone. C now waits for it before the final screenshot and again after restart, and compares both displayed scores with the final API state. For a legacy TV adapter provide its actual final selector.

The simulated-display pages retain the phone's legitimately saved credentials but use a separate 1280x900 page viewport so the 960x480 simulated device and its MCP trace are readable. This does not change the phone page's viewport or inject browser storage. Guest and seat room_ask calls are verified independently.
