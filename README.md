# Slack Claude Support Bot

A Slack bot that responds to @mentions using Claude Code CLI. Uses Socket Mode so it can run behind NAT (perfect for Raspberry Pi deployment). Uses your existing Claude Max/Pro subscription instead of requiring a separate API key.

## Features

- Responds to @mentions in any channel
- Handles direct messages
- Shows thinking indicator while processing (requires `reactions:write` scope)
- Replies in threads to keep channels tidy
- Uses Claude Code CLI (no API key needed)

## Prerequisites

- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated
- Node.js 18+
- A Slack workspace where you can create apps

## Quick Start

```bash
git clone https://github.com/WPcare/slack-claude-support.git
cd slack-claude-support
npm install
cp .env.example .env
# Edit .env with your Slack tokens
npm start
```

## Slack App Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name it (e.g., "Claude Support") and select your workspace

### 2. Enable Socket Mode

1. Go to **Settings → Socket Mode**
2. Toggle Socket Mode **ON**
3. Create an App-Level Token:
   - Click "Generate Token and Scopes"
   - Name: `socket`
   - Add scope: `connections:write`
   - Click Generate
4. Copy the `xapp-...` token

### 3. Configure Bot Permissions

Go to **Features → OAuth & Permissions** and add these Bot Token Scopes:

| Scope | Purpose |
|-------|---------|
| `app_mentions:read` | Receive @mentions |
| `chat:write` | Send messages |
| `im:history` | Read DM history |
| `im:read` | View DM info |
| `im:write` | Send DMs |
| `reactions:write` | Add thinking emoji (optional) |

### 4. Enable Events

Go to **Features → Event Subscriptions**:
1. Toggle **Enable Events** ON
2. Under "Subscribe to bot events" click "Add Bot User Event"
3. Add these events:
   - `app_mention`
   - `message.im`
4. Click **Save Changes**

### 5. Install to Workspace

1. Go to **Settings → Install App**
2. Click "Install to Workspace"
3. Authorize the permissions
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

### 6. Get Signing Secret

Go to **Settings → Basic Information** → App Credentials → Copy **Signing Secret**

### 7. Configure Environment

Create a `.env` file:

```bash
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token
```

### 8. Run

```bash
npm start
```

## Usage

- **@mention in channel**: `@YourBot What is the capital of France?`
- **Direct message**: Just DM the bot directly

## How It Works

Instead of calling the Anthropic API directly, this bot shells out to the Claude Code CLI (`claude -p`). This means:

- No API key required
- Uses your existing Claude Max/Pro subscription
- Claude Code must be installed and authenticated on the machine running the bot

## Raspberry Pi Deployment

### Install Claude Code on Pi

```bash
npm install -g @anthropic-ai/claude-code
claude  # Follow prompts to authenticate
```

### Install Node.js on Pi

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Clone and Setup

```bash
git clone https://github.com/WPcare/slack-claude-support.git
cd slack-claude-support
npm install
cp .env.example .env
nano .env  # Add your Slack tokens
```

### Run with PM2 (keeps it running)

```bash
sudo npm install -g pm2
pm2 start src/index.js --name slack-claude
pm2 save
pm2 startup  # Follow instructions to auto-start on boot
```

### Monitor

```bash
pm2 logs slack-claude  # View logs
pm2 status             # Check status
pm2 restart slack-claude  # Restart
```

## Troubleshooting

### Bot not receiving events

1. Verify Event Subscriptions are enabled and saved
2. Check that `app_mention` is listed under bot events
3. Try reinstalling the app (OAuth & Permissions → Reinstall)
4. Invite the bot to the channel: `/invite @YourBot`

### "missing_scope" errors

Add the required scope in OAuth & Permissions, then reinstall the app.

### Claude CLI not responding

Test directly: `claude -p "hello" --max-turns 1`

If that works but the bot doesn't, check that Claude Code is authenticated for the user running the bot.

## Project Structure

```
slack-claude-support/
├── src/
│   └── index.js      # Main bot application
├── .env              # Environment variables (not committed)
├── .env.example      # Template for .env
├── .gitignore
├── CLAUDE.md         # Development notes
├── package.json
└── README.md
```

## License

MIT
