# WhatsApp Work Agent

A local Node.js agent controlled from your personal WhatsApp **Message yourself** chat. It can create files, website source, Word documents and PowerPoint presentations; send files back to you; inspect recent individual chats; send messages to configured contacts; and commit generated files to `anantanand259/whatsapp-agent`.

**Status:** implementation with offline and mocked integration tests. Live WhatsApp, AI and GitHub operations require your credentials and pairing. It is not an unrestricted computer agent. Generated websites are source files; automatic hosting and arbitrary code execution are not included.

## Personal WhatsApp connection

Personal mode uses the unofficial [whatsapp-web.js](https://wwebjs.dev/) client. The project explicitly warns that accounts may be blocked; WhatsApp Web changes can also break the integration. There is no guaranteed safe unofficial connection. An optional Cloud API adapter is included for eligible business use, but it is not a personal inbox integration.

Your phone links the agent as a device by QR code. No public server or webhook is needed in personal mode. Keep this computer awake and the process running. The account session is stored in `data/session`; treat that directory as a credential.

## Quick Start on Windows

Requires Node.js 24+ and Chrome. In this folder:

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD='true'
npm.cmd ci
Copy-Item .env.example .env
```

Edit `.env` locally, never in WhatsApp or a GitHub issue:

```dotenv
MODE=personal
OWNER_NUMBERS=YOUR_INTERNATIONAL_NUMBER_WITHOUT_PLUS
OPENAI_API_KEY=YOUR_KEY
OPENAI_MODEL=YOUR_AVAILABLE_RESPONSES_MODEL
CHROME_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe
GITHUB_REPOSITORY=anantanand259/whatsapp-agent
GITHUB_BRANCH=agent-work
GITHUB_TOKEN=YOUR_FINE_GRAINED_TOKEN
```

Use a Responses API model supporting function calling. AI API usage is billed separately from a chat subscription. The code uses [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling) and sends task prompts and requested chat content to the configured model with `store: false`; this is not a promise of zero provider retention.

`GITHUB_TOKEN` is optional until you request a push. Grant a fine-grained token access only to this repository with Contents read/write. On this Windows computer, `GITHUB_AUTH=credential-manager` is already configured to reuse the existing Git for Windows sign-in without storing a token in `.env`. That sign-in may have broader access; this app still restricts requests to the configured repository. The repository and `agent-work` branch have been created. The branch is explicit: the agent will not fall back to modifying your default branch. It uses GitHub's Git data API to make one commit containing all selected files and advances the branch without force.

```powershell
npm.cmd run doctor
npm.cmd start
```

On your phone: WhatsApp > Settings > Linked devices > Link a device. Scan the QR shown in the terminal. The linked account must match `OWNER_NUMBERS`.

In **Message yourself**, send:

```text
!agent Create a Word document explaining the basics of solar energy and send it here.
!agent Create a 6-slide PowerPoint about my startup idea: an appointment booking service for local salons. Send the deck here.
!agent Build a responsive portfolio website for a photographer. Write the files under portfolio/ and push them to GitHub.
!agent List my recent chats.
!agent Read chat 919876543210@c.us and summarize the latest messages.
!agent Send 919876543210 this message: I will arrive at 6 pm.
!agent /status
```

Only prefixed messages you send to yourself become commands. Replies start with `[Agent]` to avoid triggering new commands. Commands sent to other people are ignored. Group commands are not implemented. Number-to-LID mapping is handled for the self-chat.

## Sending and Automatic Replies

Put contacts you authorize in `ALLOWED_RECIPIENTS` as comma-separated international digits. The agent can then send to these numbers when you directly instruct it. Your own configured number is already permitted. There is no bulk messaging feature.

`AUTO_REPLY_NUMBERS` separately opts contacts into automatic replies. Replies use `AUTO_REPLY_INSTRUCTIONS`, with no task tools, no private owner history, and no access to other chats. Automatic replies are disabled by default. Restart after changing settings.

Incoming individual messages are stored locally for context and deduplication. Only opted-in automatic replies and requested chat reads are sent to the AI service. Chat text and contact names are treated as untrusted content. Review permissions carefully when granting autonomous sends; model-level prompt injection defenses cannot provide absolute guarantees.

## Run Without Connecting WhatsApp

```powershell
npm.cmd test
npm.cmd run demo
```

The demo creates real `.docx` and `.pptx` examples under `demo-output/artifacts/` without contacting any external service. It is a deterministic sample, not an AI demonstration.

For interactive AI tasks with simulated WhatsApp delivery:

```powershell
npm.cmd run chat
```

This still needs the AI key and model. Deliveries are recorded in `data/local-chat/outbox`; generated files are in `data/local-chat/artifacts`. **GitHub pushes remain real when a token is configured and you request a push.** The CLI uses a separate database from the live WhatsApp process.

## How It Works

```text
Self-chat command -> persistent SQLite job -> AI tool loop
                                          -> file / DOCX / PPTX creation
                                          -> allowed WhatsApp send
                                          -> GitHub commit
                 <- result and generated files
```

Tasks run serially. Message IDs prevent duplicate webhook/event jobs. Side effects are recorded before calling external services. An uncertain delivery is not automatically retried, because the provider may have accepted it before a timeout. Check the sent chat or GitHub branch before sending a new command. Interrupted jobs are marked `interrupted` after restart and are not blindly replayed.

Job files are isolated under `data/artifacts/<task hash>/`. The model can only access that task's artifacts through file tools; no shell, arbitrary filesystem read, external URL fetch or package installation tool is exposed. Follow-up edits currently recreate artifacts using conversational context rather than editing earlier task directories.

The SQLite database stores messages, task status, and an action audit. The HTTP service exposes only `/health` in personal mode, bound to `127.0.0.1` by default. One process must own each data directory. Do not run multiple live instances with the same session/database.

## Optional Business Cloud API

Set `MODE=whatsapp` and all `META_*` values from `.env.example`. Expose `/webhook` via an HTTPS reverse proxy, configure the verification token in Meta, and subscribe to message webhooks. Requests are checked against the Meta app secret and configured phone number ID. Text instructions are supported; inbound audio/media interpretation is not.

This adapter only sends inside the recipient's 24-hour reply window. Approved-template initiation is not implemented. Non-Office source files are delivered as `.txt` attachments because Cloud media types are restricted. Review [Meta's current terms](https://www.whatsapp.com/legal/business-solution-terms) before deploying a general-purpose AI workflow; current rules include restrictions and regional exceptions for AI providers.

## Limits and Next Work

- No live credentials or account session ship with this repository.
- No live AI/WhatsApp/GitHub end-to-end test has been completed in the included offline checks.
- No voice-note transcription, image understanding, calls, groups, contact edits, message deletion, scheduling or public website deployment yet.
- Website code is generated and committed, not executed or browser-tested by this runtime.
- Presentations are editable, consistently styled text decks; custom images, charts and researched citations require further tools.
- Recent personal chat reads depend on the history available to the linked web client; this is not a full account-history backup.
- Automated retries are deliberately limited; ambiguous external outcomes need review.
- Set AI account budget limits. Tasks are capped at 16 model rounds by default.
- Local messages, generated files and session data are not encrypted by this app. Use OS disk encryption and protect local access.

## Verification in the Build Environment

All 19 automated tests passed outside the Windows sandbox, including symbolic-link and HTTP checks. The offline demo produced valid Office archives. The dependency audit reported zero known vulnerabilities after overriding Puppeteer to 25.12.0, image-size to 2.0.4 and basic-ftp to 6.2.2. These overrides require rechecking when upgrading whatsapp-web.js or pptxgenjs.

The WhatsApp client and Puppeteer modules loaded successfully. Chrome startup succeeded outside the sandbox. The source upload succeeded, and the runtime GitHub adapter verified write permission and the configured branch. QR login and live AI/WhatsApp operation remain unverified because the local owner number and AI key have not yet been configured.

## Source Layout

- `src/personal.js`: QR linking, self-chat commands, chat reads and personal-account sends.
- `src/agent.js`: AI function-calling loop and tool validation.
- `src/artifacts.js`: confined file creation and Office document generation.
- `src/github.js`: atomic multi-file Git commits to a configured branch.
- `src/store.js`, `src/worker.js`: persistent jobs, deduplication and action audit.
- `src/whatsapp.js`, `src/server.js`: optional Cloud API adapter and health endpoint.
- `test/agent.test.js`: offline unit and integration tests with simulated providers.
