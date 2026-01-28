# Slack Claude Support Bot

## Project Overview
A Slack bot that responds to @mentions and DMs using Claude Code CLI. Uses Socket Mode for easy deployment (no public URL needed). Includes task management with channel-based routing.

## Quick Commands
```bash
npm start          # Run the bot
npm run dev        # Run with auto-reload
pkill -f "node src/index"  # Stop the bot
cat /tmp/bot.log   # View logs (when running in background)
```

## Architecture
- **Framework**: Slack Bolt (Socket Mode)
- **AI**: Claude Code CLI (piped via stdin)
- **Events**: `app_mention`, `message.im`, button actions

## Key Files
- `src/index.js` - Main bot logic
- `.env` - Slack tokens and config (not committed)
- `.mcp.json` - MCP server configuration

## Features

### 1. Claude Q&A
Mention the bot in any channel to ask questions:
```
@Claude Support MCP What is the best way to...
```

### 2. Task Extraction
In a thread, ask Claude to extract tasks from the conversation:
```
@Claude Support MCP can you make these into tasks please
```
Supported phrases: "make this into tasks", "create tasks from this", "add to my tasks", etc.

### 3. Explicit Task Creation
Use prefixes in any channel:
```
@Claude Support MCP task: Fix the login bug
@Claude Support MCP todo: Review pull request
```

### 4. Dedicated Task Channels
- `#andrew-tasks` (C0ACBKGBX6C) - Tasks post with "Save to Inbox" button
- `#jessica-tasks` (C0ABAUC54F5) - Tasks confirmed in Slack only

In task channels, every @mention is treated as a task (no prefix needed).

### 5. Inbox Integration
Tasks for Andrew post to `#andrew-tasks` with interactive buttons:
- **Save to Inbox** - Saves to `/Volumes/ZikeDrive/projects/Business/00-Inbox/action-inbox.md`
- **Dismiss** - Removes the buttons

## Configuration (.env)
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
CLAUDE_TIMEOUT=300000  # 5 minutes
```

## Slack App Requirements
Bot needs these scopes:
- `app_mentions:read` - Receive @mentions
- `chat:write` - Send messages
- `im:history` - Read DM history
- `reactions:write` - Add emoji reactions

Enable **Interactivity** in your Slack app for button actions.

## Troubleshooting

### No events received
1. Check Event Subscriptions are enabled
2. Verify `app_mention` and `message.im` are subscribed
3. Click "Save Changes" on Event Subscriptions page
4. Reinstall app if scopes changed

### Multiple connections
Kill all node processes: `pkill -f node`

### Claude CLI hanging
The CLI uses stdin to pass prompts. Timeout is configurable via `CLAUDE_TIMEOUT`.

### Button actions not working
Ensure Interactivity is enabled in your Slack app settings.

## Testing
```bash
# Test Claude CLI directly
echo "What is 2+2?" | claude --print --max-turns 1

# Run bot with visible logs
node src/index.js

# Run in background with log file
node src/index.js > /tmp/bot.log 2>&1 &
```
