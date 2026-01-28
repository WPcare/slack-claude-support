import Bolt from '@slack/bolt';
import { spawn } from 'child_process';
import 'dotenv/config';

const { App } = Bolt;

// Configuration
const CLAUDE_PATH = process.env.CLAUDE_PATH || '/Users/andrewharkness/.local/bin/claude';
const CLAUDE_TIMEOUT = parseInt(process.env.CLAUDE_TIMEOUT) || 120000; // 2 minutes default

// Initialize Slack app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Call Claude Code CLI (uses your Max/Pro subscription)
async function askClaude(message) {
  return new Promise((resolve, reject) => {
    const cmd = `${CLAUDE_PATH} -p "${message.replace(/"/g, '\\"')}" --max-turns 1 2>&1`;

    const proc = spawn('/bin/bash', ['-c', cmd], {
      cwd: '/tmp',
      env: {
        ...process.env,
        HOME: process.env.HOME || '/Users/andrewharkness',
        TERM: 'dumb',
        NO_COLOR: '1'
      }
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Claude timed out'));
    }, CLAUDE_TIMEOUT);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (output.trim()) {
        resolve(output.trim());
      } else {
        reject(new Error(`No response from Claude. Exit: ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Handle @mentions
app.event('app_mention', async ({ event, say }) => {
  try {
    const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    if (!userMessage) {
      await say({
        text: "Hi! How can I help you today?",
        thread_ts: event.thread_ts || event.ts,
      });
      return;
    }

    // Show thinking indicator
    await app.client.reactions.add({
      token: process.env.SLACK_BOT_TOKEN,
      channel: event.channel,
      name: 'thinking_face',
      timestamp: event.ts,
    }).catch(() => {});

    const replyText = await askClaude(userMessage);

    // Remove thinking indicator
    await app.client.reactions.remove({
      token: process.env.SLACK_BOT_TOKEN,
      channel: event.channel,
      name: 'thinking_face',
      timestamp: event.ts,
    }).catch(() => {});

    await say({
      text: replyText,
      thread_ts: event.thread_ts || event.ts,
    });

  } catch (error) {
    console.error('Error:', error.message);

    await app.client.reactions.remove({
      token: process.env.SLACK_BOT_TOKEN,
      channel: event.channel,
      name: 'thinking_face',
      timestamp: event.ts,
    }).catch(() => {});

    await say({
      text: `Sorry, I encountered an error: ${error.message}`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
});

// Handle direct messages
app.event('message', async ({ event, say }) => {
  if (event.channel_type !== 'im' || event.bot_id) return;

  try {
    const replyText = await askClaude(event.text);
    await say(replyText);
  } catch (error) {
    console.error('Error:', error.message);
    await say(`Sorry, I encountered an error: ${error.message}`);
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Slack Claude Support bot is running!');
})();
