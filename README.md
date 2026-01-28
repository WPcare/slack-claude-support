# Slack Claude Support Bot

A Slack bot that responds to @mentions using Claude AI. Uses Socket Mode so it can run behind NAT (perfect for Raspberry Pi deployment).

## Features

- Responds to @mentions in any channel
- Handles direct messages
- Shows thinking indicator while processing
- Replies in threads to keep channels tidy

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" → "From scratch"
3. Name it (e.g., "Claude Support") and select your workspace

### 2. Configure Bot Permissions

Go to **OAuth & Permissions** and add these Bot Token Scopes:
- `app_mentions:read` - Read @mentions
- `chat:write` - Send messages
- `im:history` - Read DM history
- `im:read` - View DM info
- `im:write` - Send DMs
- `reactions:read` - Read reactions
- `reactions:write` - Add reactions

### 3. Enable Socket Mode

1. Go to **Socket Mode** in the sidebar
2. Enable Socket Mode
3. Create an App-Level Token with `connections:write` scope
4. Save the token (starts with `xapp-`)

### 4. Enable Events

Go to **Event Subscriptions**:
1. Enable Events
2. Subscribe to bot events:
   - `app_mention`
   - `message.im`

### 5. Install to Workspace

1. Go to **Install App**
2. Click "Install to Workspace"
3. Copy the Bot User OAuth Token (starts with `xoxb-`)

### 6. Get Signing Secret

Go to **Basic Information** → App Credentials → Copy Signing Secret

### 7. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your tokens:
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 8. Install & Run

```bash
npm install
npm start
```

## Raspberry Pi Deployment

### Install Node.js on Pi

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Clone and Setup

```bash
git clone https://github.com/YOUR_USERNAME/slack-claude-support.git
cd slack-claude-support
npm install
cp .env.example .env
nano .env  # Add your tokens
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
pm2 logs slack-claude
pm2 status
```

## Usage

- **@mention in channel**: `@Claude Support What is the weather in Manila?`
- **Direct message**: Just send a DM to the bot

## License

MIT
