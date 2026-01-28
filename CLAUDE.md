# Slack Claude Support Bot

## Project Overview
A Slack bot that responds to @mentions and DMs using Claude Code CLI. Uses Socket Mode for easy deployment (no public URL needed).

## Quick Commands
```bash
npm start          # Run the bot
npm run dev        # Run with auto-reload
pkill -f "node src/index"  # Stop the bot
cat /tmp/bot.log   # View logs (when running in background)
```

## Architecture
- **Framework**: Slack Bolt (Socket Mode)
- **AI**: Claude Code CLI (`claude -p`)
- **Events**: `app_mention`, `message.im`

## Key Files
- `src/index.js` - Main bot logic
- `.env` - Slack tokens (not committed)
- `.mcp.json` - MCP server configuration

## Slack App Requirements
Bot needs these scopes:
- `app_mentions:read` - Receive @mentions
- `chat:write` - Send messages
- `im:history` - Read DM history
- `reactions:write` - Add emoji reactions (optional)

## Troubleshooting

### No events received
1. Check Event Subscriptions are enabled
2. Verify `app_mention` and `message.im` are subscribed
3. Click "Save Changes" on Event Subscriptions page
4. Reinstall app if scopes changed

### Multiple connections
Kill all node processes: `pkill -f node`

### Claude CLI hanging
The CLI must run non-interactively with `--print` flag.

## Testing
```bash
# Test Claude CLI directly
claude -p "What is 2+2?" --max-turns 1

# Run bot with visible logs
node src/index.js

# Run in background with log file
node src/index.js > /tmp/bot.log 2>&1 &
```
