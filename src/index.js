import Bolt from '@slack/bolt';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

const { App } = Bolt;

// Initialize Slack app with Socket Mode (no public URL needed - great for Raspberry Pi)
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// System prompt for Claude
const SYSTEM_PROMPT = `You are a helpful AI assistant in a Slack workspace.
Keep responses concise and well-formatted for Slack (use *bold*, _italic_, and bullet points).
Be friendly but professional. If you don't know something, say so.
For code, use \`inline code\` or \`\`\`code blocks\`\`\`.`;

// Handle @mentions
app.event('app_mention', async ({ event, say }) => {
  try {
    // Remove the bot mention from the message
    const userMessage = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

    if (!userMessage) {
      await say({
        text: "Hi! How can I help you today?",
        thread_ts: event.thread_ts || event.ts,
      });
      return;
    }

    // Show typing indicator by reacting
    await app.client.reactions.add({
      token: process.env.SLACK_BOT_TOKEN,
      channel: event.channel,
      name: 'thinking_face',
      timestamp: event.ts,
    }).catch(() => {}); // Ignore if already reacted

    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage }
      ],
    });

    // Extract the response text
    const replyText = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Sorry, I could not generate a response.';

    // Remove thinking reaction
    await app.client.reactions.remove({
      token: process.env.SLACK_BOT_TOKEN,
      channel: event.channel,
      name: 'thinking_face',
      timestamp: event.ts,
    }).catch(() => {});

    // Reply in thread
    await say({
      text: replyText,
      thread_ts: event.thread_ts || event.ts,
    });

  } catch (error) {
    console.error('Error handling mention:', error);
    await say({
      text: `Sorry, I encountered an error: ${error.message}`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
});

// Handle direct messages
app.event('message', async ({ event, say }) => {
  // Only respond to DMs (channel type 'im'), ignore bot messages
  if (event.channel_type !== 'im' || event.bot_id) return;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: event.text }
      ],
    });

    const replyText = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Sorry, I could not generate a response.';

    await say(replyText);

  } catch (error) {
    console.error('Error handling DM:', error);
    await say(`Sorry, I encountered an error: ${error.message}`);
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Slack Claude Support bot is running!');
  console.log('   Listening for @mentions and DMs...');
})();
