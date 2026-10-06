# Connect Your Agent

The implementation and dependencies are on this computer. Live account connection is still pending.

1. Open `.env` in this folder and fill `OWNER_NUMBERS` with your own WhatsApp number, including country code without `+` or spaces. Enter `OPENAI_API_KEY` locally. The default model is `gpt-5.4`; you can change it to an available Responses API model with function calling. Do not share API keys in chat.
2. Open a PowerShell terminal in this folder and run `npm.cmd run doctor`, then `npm.cmd start`.
3. Scan the terminal QR from WhatsApp > Settings > Linked devices > Link a device.
4. Open Message yourself and send `!agent Create a short Word document about solar energy and send it here.`
5. To enable messages to other people, enter their numbers in `ALLOWED_RECIPIENTS` and restart. To opt a contact into automatic replies, use `AUTO_REPLY_NUMBERS`.

## Upload the Agent Code

The initial push could not authenticate inside the build sandbox. From your own PowerShell terminal in this folder, run:

```powershell
git push -u origin main
git push origin HEAD:refs/heads/agent-work
```

Complete GitHub sign-in if prompted. No code was uploaded by the build session. Do not force-push if someone has added remote commits since the repository was inspected; fetch and reconcile them first.

For the running agent to make future commits, put a fine-grained GitHub token in `.env` as `GITHUB_TOKEN`, restricted to `anantanand259/whatsapp-agent` with Contents read/write. The configured generated-work branch is `agent-work`.

## Current Verification

- Offline file generation and mocked tool integrations were tested.
- Browser startup failed in the build sandbox, so live pairing is not verified.
- No live AI request or WhatsApp message was sent.
- Personal WhatsApp automation uses an unofficial client and carries account restriction risk.

See README.md for architecture, limits, privacy details, and the optional Business API adapter.
