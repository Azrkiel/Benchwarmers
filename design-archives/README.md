# Saved scorebook version

`scorebook-2026-10-21-161155/` contains the UI source, public assets and fonts, web configuration, workspace manifests, design notes, and screenshots as they stood before the Lounge version was started. The matching ZIP (757,512 bytes) stays in Codex's local clone and is not committed.

After the 2026-10-22 merge the original TV is `/tv/:code`, this scorebook version is `/tv2/:code` (source `web/src/tv-broadcast/`); the new interface uses `/lounge/:code`. Original TV source files and the welcome component were verified against this snapshot after Lounge was implemented: 34 TV files and the welcome markup matched.

To restore the saved UI, copy its `web/src`, `web/public`, and web configuration into a Benchwarmers checkout. Retain that checkout’s existing server and shared contract. No environment files, credentials, dependencies, or build output were archived.
