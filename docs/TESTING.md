# Testing Benchwarmers

**No account, password, API key, paid subscription, or Echo device is required for the standard demo.** Use a recent desktop Chrome browser. This is a simulated Alexa+ experience backed by real MCP calls and fictional scripted games.

## Try the app

The documented hosted demo is https://benchwarmers.fly.dev. If it is unavailable, use the local instructions below.

1. Choose **Host a party**, select basketball or football, and create a room. Note the room code.
2. Join as a player in that browser and save one captain plus four flex athletes within the salary cap. To test another player, use a separate browser profile, private window, or device and enter the room code.
3. **Open the simulated smart display as part of the main test.** On the room's player page, expand **Host controls** and select **Open simulated smart display**. Open it in another tab in the same browser profile where you joined, so it retains access to your seat. You can also open `https://benchwarmers.fly.dev/display/room/YOUR_ROOM_CODE`, replacing `YOUR_ROOM_CODE` with the code from step 1. For local testing, use `http://localhost:3001/display/room/YOUR_ROOM_CODE`.
4. In the simulator, type **“what's the score?”** in **Ask the display** and select **Send**. Select **MCP calls** to inspect the actual `room_ask` call and response. Keep this display open throughout the game. Speech is optional: grant microphone permission if using it, or continue with typed input.
5. Return to the host's player tab, expand **Host controls**, and select **Start game**. Use up to 4× replay speed for a shorter test. You can also select **Open shared screen** for the larger game view.
6. Submit a prediction while its question window is open. To make a prediction through the simulator, select your own seat in its actor selector; guest mode supports public score and standings questions. Check that accepted picks, scores, and standings update across the room and display, then view the final and season results.

Room and participant credentials are created automatically and stored by the browser. Keep the host session open to retain its controls; no shared judge login is needed. Create a fresh room for each independent test.

## Run locally

Requires Node.js 22+ and npm. Clone the public repository and run from its root:

```sh
git clone https://github.com/Azrkiel/Benchwarmers.git
cd Benchwarmers
npm ci
npm run demo
```

Open `http://localhost:3001` in your browser and follow the same steps. Defaults use `AI_MODE=fallback` and `ASSISTANT_MODE=offline`; no `.env` file or Gemini key is needed. If your shell already sets these variables, select those defaults before starting. On CPU-only Linux, use `ONNXRUNTIME_NODE_INSTALL=skip npm ci` to omit optional GPU downloads if needed.

For optional direct **local** MCP Inspector testing, connect to `http://localhost:3001/mcp` using Streamable HTTP and `Authorization: Bearer dev-token-change-me` with the unmodified local defaults. A custom local `MCP_TOKEN` replaces that default. This is not a credential for the hosted service; the in-app simulator needs no manual bearer setup.

Optional automated checks: `npm test`, `npm run typecheck`, and `npm run qa:smoke`. The smoke command starts its own isolated server. Physical Alexa/Echo execution and real-person voice-ID accuracy are outside the verified test scope.
