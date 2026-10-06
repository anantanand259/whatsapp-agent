# Connect Your Agent

The implementation and dependencies are on this computer. The source is uploaded to https://github.com/anantanand259/whatsapp-agent, and both `main` and `agent-work` branches exist. Chrome startup and the agent's GitHub API access are verified. Live WhatsApp pairing and AI access are still pending.

1. Open `.env` in this folder and fill `OWNER_NUMBERS` with your own WhatsApp number, including country code without `+` or spaces. Enter `OPENAI_API_KEY` locally. The default model is `gpt-5.4`; you can change it to an available Responses API model with function calling. Do not share API keys in chat.
2. Open a PowerShell terminal in this folder and run `npm.cmd run doctor`, then `npm.cmd start`.
3. Scan the terminal QR from WhatsApp > Settings > Linked devices > Link a device.
4. Open Message yourself and send `!agent Create a short Word document about solar energy and send it here.`
5. To enable messages to other people, enter their numbers in `ALLOWED_RECIPIENTS` and restart. To opt a contact into automatic replies, use `AUTO_REPLY_NUMBERS`.

## GitHub Connection

The initial code upload is complete. This computer uses `GITHUB_AUTH=credential-manager` to reuse your existing Git for Windows sign-in. The credential is read into memory when needed; it is not saved in `.env` or printed. No separate GitHub token is required here. The configured generated-work branch is `agent-work`.

For later code updates from this checkout:

```powershell
git push -u origin main
```

Complete GitHub sign-in if prompted. Do not force-push over remote commits; fetch and reconcile them first.

On another computer without this GitHub sign-in, use `GITHUB_AUTH=token` and a fine-grained `GITHUB_TOKEN` restricted to `anantanand259/whatsapp-agent` with Contents read/write. The repository restriction is enforced by this app; an existing Git sign-in may have broader account permissions.

## Current Verification

- All 19 automated tests passed, including filesystem and local HTTP checks.
- Chrome starts successfully outside the sandbox; live WhatsApp pairing is not yet verified.
- Source upload succeeded and the runtime GitHub client confirmed repository write access.
- No live AI request or WhatsApp message was sent.
- Personal WhatsApp automation uses an unofficial client and carries account restriction risk.

See README.md for architecture, limits, privacy details, and the optional Business API adapter.
