import Bolt from '@slack/bolt';
import { spawn } from 'child_process';
import { appendFile, readFile } from 'fs/promises';
import 'dotenv/config';

const { App } = Bolt;

// Configuration
const CLAUDE_PATH = process.env.CLAUDE_PATH || '/Users/andrewharkness/.local/bin/claude';
const CLAUDE_TIMEOUT = parseInt(process.env.CLAUDE_TIMEOUT) || 120000; // 2 minutes default
const INBOX_PATH = '/Volumes/ZikeDrive/projects/Business/00-Inbox/action-inbox.md';

// Task channel routing
const TASK_CHANNELS = {
  'C0ACBKGBX6C': { name: 'andrew-tasks', destination: 'inbox' },
  'C0ABAUC54F5': { name: 'jessica-tasks', destination: 'slack' },
};

// Channel IDs for posting
const ANDREW_TASKS_CHANNEL = 'C0ACBKGBX6C';

// Initialize Slack app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Task creation patterns (explicit task content)
const TASK_PATTERNS = [
  /^task[:\s]+(.+)/i,
  /^add task[:\s]+(.+)/i,
  /^create task[:\s]+(.+)/i,
  /^todo[:\s]+(.+)/i,
  /^add todo[:\s]+(.+)/i,
];

// Patterns that ask Claude to extract tasks from context
const EXTRACT_TASK_PATTERNS = [
  /make (this|these|that) (a |into )?(tasks?|todos?)/i,
  /create (a )?tasks? (from|for) (this|these|that)/i,
  /add (this|these|that) to (my )?(tasks?|todos?|inbox)/i,
  /turn (this|these|that) into (a )?(tasks?|todos?)/i,
  /extract tasks? from (this|these|that)/i,
  /can you (make|create|add|turn|extract).*tasks?/i,
];

// Detect if message is a task creation request
function parseTaskRequest(message) {
  for (const pattern of TASK_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

// Detect if message is asking to extract tasks from context
function isExtractTaskRequest(message) {
  return EXTRACT_TASK_PATTERNS.some(pattern => pattern.test(message));
}

// Extract tasks from conversation context using Claude
async function extractTasksFromContext(context) {
  console.log('Extracting tasks from context, timeout:', CLAUDE_TIMEOUT);
  const prompt = `Analyze this conversation and extract actionable tasks. Return ONLY valid JSON array (no markdown, no explanation).

Conversation:
${context}

Return a JSON array of tasks. Each task should have:
- title: short task title (under 60 chars)
- description: fuller description
- category: one of "AISites", "WP-Care", "Operations", "General"

Example output:
[{"title": "Fix box removal in Services section", "description": "Can't remove individual boxes, only Delete Section available", "category": "AISites"}]

If no actionable tasks found, return: []`;

  const result = await askClaude(prompt);
  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch (e) {
    console.error('Failed to parse tasks:', e.message);
    return [];
  }
}

// Parse task details using Claude
async function parseTaskWithClaude(rawTask, contextMessage = null) {
  const prompt = `Parse this task request and return ONLY valid JSON (no markdown, no explanation):

Task request: "${rawTask}"
${contextMessage ? `Context from previous message: "${contextMessage}"` : ''}

Return JSON with:
- title: short task title (under 60 chars)
- description: fuller description if available, otherwise empty string
- category: one of "AISites", "WP-Care", "Operations", "General" (infer from content)

Example output:
{"title": "Fix boxes in Services section", "description": "Can't remove individual boxes, only Delete Section available", "category": "AISites"}`;

  const result = await askClaude(prompt);
  try {
    // Extract JSON from response (in case Claude adds extra text)
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No JSON found');
  } catch (e) {
    // Fallback: use raw task as title
    return {
      title: rawTask.substring(0, 60),
      description: rawTask.length > 60 ? rawTask : '',
      category: 'General'
    };
  }
}

// Post task to Andrew's Slack channel with confirmation button
async function postTaskToSlack(task) {
  try {
    // Encode task data for the button (Slack limits value to 2000 chars)
    const taskData = JSON.stringify(task);

    await app.client.chat.postMessage({
      token: process.env.SLACK_BOT_TOKEN,
      channel: ANDREW_TASKS_CHANNEL,
      text: `📌 *${task.title}*${task.description ? `\n${task.description}` : ''}\n_Category: ${task.category}_`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📌 *${task.title}*${task.description ? `\n${task.description}` : ''}\n_Category: ${task.category}_`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📥 Save to Inbox',
                emoji: true
              },
              style: 'primary',
              action_id: 'save_to_inbox',
              value: taskData
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Dismiss',
                emoji: true
              },
              action_id: 'dismiss_task'
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('Failed to post task to Slack:', error.message);
  }
}

// Add task to inbox file
async function addTaskToInbox(task) {
  const date = new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'short' });

  // Read current file to find the ## New section
  const content = await readFile(INBOX_PATH, 'utf-8');

  // Build the task entry
  const taskEntry = task.description
    ? `- [ ] **${task.title}** - ${task.description}`
    : `- [ ] **${task.title}**`;

  // Find the ## New section and the HTML comment after it
  const newSectionMarker = '<!-- Add new tasks here';
  const insertIndex = content.indexOf(newSectionMarker);

  if (insertIndex === -1) {
    // Fallback: append to end of file
    const entry = `\n### ${task.category} (via Slack - ${date})\n\n${taskEntry}\n`;
    await appendFile(INBOX_PATH, entry);
  } else {
    // Find end of the comment line
    const afterComment = content.indexOf('\n', insertIndex) + 1;

    // Check if there's already a section for this category from today
    const categoryHeader = `### ${task.category} (via Slack`;
    const existingCategoryIndex = content.indexOf(categoryHeader, afterComment);

    let newContent;
    if (existingCategoryIndex !== -1 && existingCategoryIndex < content.indexOf('\n## ', afterComment)) {
      // Add to existing category section
      const endOfHeader = content.indexOf('\n', existingCategoryIndex) + 1;
      newContent = content.slice(0, endOfHeader) + '\n' + taskEntry + content.slice(endOfHeader);
    } else {
      // Create new category section
      const entry = `\n### ${task.category} (via Slack - ${date})\n\n${taskEntry}\n`;
      newContent = content.slice(0, afterComment) + entry + content.slice(afterComment);
    }

    const { writeFile } = await import('fs/promises');
    await writeFile(INBOX_PATH, newContent);
  }

  return task;
}

// Fetch thread history for context
async function getThreadContext(channel, threadTs) {
  try {
    const result = await app.client.conversations.replies({
      token: process.env.SLACK_BOT_TOKEN,
      channel: channel,
      ts: threadTs,
      limit: 20, // Last 20 messages in thread
    });

    if (!result.messages || result.messages.length <= 1) {
      return null;
    }

    // Format conversation history (exclude the latest message)
    const history = result.messages.slice(0, -1).map(msg => {
      const isBot = msg.bot_id ? 'Assistant' : 'User';
      const text = msg.text.replace(/<@[A-Z0-9]+>/g, '').trim();
      return `${isBot}: ${text}`;
    }).join('\n');

    return history;
  } catch (error) {
    console.error('Error fetching thread:', error.message);
    return null;
  }
}

// Call Claude Code CLI (uses your Max/Pro subscription)
async function askClaude(message, conversationContext = null) {
  return new Promise((resolve, reject) => {
    let prompt = message;

    // Add conversation context if available
    if (conversationContext) {
      prompt = `Previous conversation:\n${conversationContext}\n\nUser: ${message}\n\nContinue the conversation naturally, remembering what was discussed above.`;
    }

    console.log('Calling Claude with timeout:', CLAUDE_TIMEOUT, 'ms');
    console.log('Prompt length:', prompt.length);

    // Use --print flag and pipe prompt via stdin to avoid shell escaping issues
    const proc = spawn(CLAUDE_PATH, ['--print', '--max-turns', '1'], {
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

    // Write prompt to stdin
    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (output.trim()) {
        resolve(output.trim());
      } else {
        console.log('Claude stderr:', errorOutput);
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

    // Check if asking to extract tasks from conversation
    if (isExtractTaskRequest(userMessage)) {
      console.log('Extract task request detected:', userMessage);

      // Show working indicator
      await app.client.reactions.add({
        token: process.env.SLACK_BOT_TOKEN,
        channel: event.channel,
        name: 'memo',
        timestamp: event.ts,
      }).catch(() => {});

      // Get thread context (required for extraction)
      let context = null;
      if (event.thread_ts) {
        console.log('Getting thread context for:', event.thread_ts);
        context = await getThreadContext(event.channel, event.thread_ts);
        console.log('Thread context length:', context?.length || 0);
      }

      if (!context) {
        await app.client.reactions.remove({
          token: process.env.SLACK_BOT_TOKEN,
          channel: event.channel,
          name: 'memo',
          timestamp: event.ts,
        }).catch(() => {});

        await say({
          text: "I need some context to extract tasks from. Reply in a thread to the message you want me to turn into tasks.",
          thread_ts: event.thread_ts || event.ts,
        });
        return;
      }

      // Extract tasks from context
      const tasks = await extractTasksFromContext(context);

      if (tasks.length === 0) {
        await app.client.reactions.remove({
          token: process.env.SLACK_BOT_TOKEN,
          channel: event.channel,
          name: 'memo',
          timestamp: event.ts,
        }).catch(() => {});

        await say({
          text: "I couldn't find any actionable tasks in that conversation.",
          thread_ts: event.thread_ts || event.ts,
        });
        return;
      }

      // Determine destination based on channel
      const taskChannel = TASK_CHANNELS[event.channel];
      const destination = taskChannel?.destination || 'inbox';

      // Post each task to Slack (with save button for Andrew)
      const addedTasks = [];
      for (const task of tasks) {
        if (destination === 'inbox') {
          // Post to #andrew-tasks with "Save to Inbox" button
          await postTaskToSlack(task);
        }
        addedTasks.push(task);
      }

      await app.client.reactions.remove({
        token: process.env.SLACK_BOT_TOKEN,
        channel: event.channel,
        name: 'memo',
        timestamp: event.ts,
      }).catch(() => {});

      await app.client.reactions.add({
        token: process.env.SLACK_BOT_TOKEN,
        channel: event.channel,
        name: 'white_check_mark',
        timestamp: event.ts,
      }).catch(() => {});

      const taskList = addedTasks.map(t => `> *${t.title}*${t.description ? ` - ${t.description}` : ''}`).join('\n');
      await say({
        text: `✓ Posted ${addedTasks.length} task${addedTasks.length > 1 ? 's' : ''} to #andrew-tasks:\n${taskList}\n\n_Click "Save to Inbox" in #andrew-tasks to add to your inbox file._`,
        thread_ts: event.thread_ts || event.ts,
      });
      return;
    }

    // Check if this is a task creation request
    const taskContent = parseTaskRequest(userMessage);
    const taskChannel = TASK_CHANNELS[event.channel];

    if (taskContent || taskChannel) {
      // If in a task channel, treat the whole message as a task (no prefix needed)
      const taskText = taskContent || userMessage;

      // Show working indicator
      await app.client.reactions.add({
        token: process.env.SLACK_BOT_TOKEN,
        channel: event.channel,
        name: 'memo',
        timestamp: event.ts,
      }).catch(() => {});

      // Get thread context for additional info
      let contextMessage = null;
      if (event.thread_ts) {
        const context = await getThreadContext(event.channel, event.thread_ts);
        if (context) {
          contextMessage = context;
        }
      }

      // Parse the task
      const task = await parseTaskWithClaude(taskText, contextMessage);

      // Route based on channel
      const destination = taskChannel?.destination || 'inbox';

      if (destination === 'inbox') {
        // Andrew's tasks → post to Slack with "Save to Inbox" button
        await postTaskToSlack(task);

        await app.client.reactions.remove({
          token: process.env.SLACK_BOT_TOKEN,
          channel: event.channel,
          name: 'memo',
          timestamp: event.ts,
        }).catch(() => {});

        await app.client.reactions.add({
          token: process.env.SLACK_BOT_TOKEN,
          channel: event.channel,
          name: 'white_check_mark',
          timestamp: event.ts,
        }).catch(() => {});

        await say({
          text: `✓ Posted to #andrew-tasks:\n> *${task.title}*${task.description ? `\n> ${task.description}` : ''}\n\n_Click "Save to Inbox" in #andrew-tasks to add to your inbox file._`,
          thread_ts: event.thread_ts || event.ts,
        });
      } else {
        // Jessica's tasks → just confirm in Slack
        await app.client.reactions.remove({
          token: process.env.SLACK_BOT_TOKEN,
          channel: event.channel,
          name: 'memo',
          timestamp: event.ts,
        }).catch(() => {});

        await app.client.reactions.add({
          token: process.env.SLACK_BOT_TOKEN,
          channel: event.channel,
          name: 'white_check_mark',
          timestamp: event.ts,
        }).catch(() => {});

        await say({
          text: `✓ Task logged:\n> *${task.title}*${task.description ? `\n> ${task.description}` : ''}\n\n_Category: ${task.category}_`,
          thread_ts: event.thread_ts || event.ts,
        });
      }
      return;
    }

    // Regular Claude query
    // Show thinking indicator
    await app.client.reactions.add({
      token: process.env.SLACK_BOT_TOKEN,
      channel: event.channel,
      name: 'thinking_face',
      timestamp: event.ts,
    }).catch(() => {});

    // Get thread context if this is a reply in a thread
    const threadTs = event.thread_ts || event.ts;
    let context = null;
    if (event.thread_ts) {
      context = await getThreadContext(event.channel, event.thread_ts);
    }

    const replyText = await askClaude(userMessage, context);

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

    await app.client.reactions.remove({
      token: process.env.SLACK_BOT_TOKEN,
      channel: event.channel,
      name: 'memo',
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
  console.log('Message event:', event.channel_type, event.text?.substring(0, 50));
  if (event.channel_type !== 'im' || event.bot_id) return;
  console.log('Processing DM:', event.text);

  try {
    const replyText = await askClaude(event.text);
    await say(replyText);
  } catch (error) {
    console.error('Error:', error.message);
    await say(`Sorry, I encountered an error: ${error.message}`);
  }
});

// Handle "Save to Inbox" button click
app.action('save_to_inbox', async ({ ack, body, client }) => {
  await ack();

  try {
    const task = JSON.parse(body.actions[0].value);
    await addTaskToInbox(task);

    // Update the message to show it was saved
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: `✅ *${task.title}* — saved to inbox`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `✅ *${task.title}*${task.description ? `\n${task.description}` : ''}\n_Category: ${task.category}_ — *Saved to inbox*`
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error saving task:', error.message);
  }
});

// Handle "Dismiss" button click
app.action('dismiss_task', async ({ ack, body, client }) => {
  await ack();

  try {
    // Update the message to remove buttons
    const originalText = body.message.blocks[0].text.text;
    await client.chat.update({
      channel: body.channel.id,
      ts: body.message.ts,
      text: originalText,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: originalText + '\n_Dismissed_'
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error dismissing task:', error.message);
  }
});

// Start the app
(async () => {
  await app.start();
  console.log('⚡️ Slack Claude Support bot is running!');
})();
