/**
 * Nero Slack Socket Mode listener.
 * Runs as a separate PM2 process. Requires SLACK_APP_TOKEN (xapp-), SLACK_BOT_TOKEN (xoxb-)
 */

const { SocketModeClient } = require("@slack/socket-mode");
const { WebClient } = require("@slack/web-api");
const fs = require("fs");
const path = require("path");

const NERO_URL = process.env.NERO_URL || "http://localhost:6376/api/nero";

function loadDotEnv() {
  const envPath = path.join(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadDotEnv();

const appToken = process.env.SLACK_APP_TOKEN;
const botToken = process.env.SLACK_BOT_TOKEN;

if (!appToken || !botToken) {
  console.error("[nero-slack] Missing SLACK_APP_TOKEN or SLACK_BOT_TOKEN -- exiting");
  process.exit(1);
}

const slack = new WebClient(botToken);
const socketClient = new SocketModeClient({ appToken, logLevel: "warn" });

const handled = new Set();

socketClient.on("message", async ({ event, ack }) => {
  await ack();

  if (event.channel_type !== "im") return;
  if (event.subtype || event.bot_id) return;

  if (handled.has(event.ts)) return;
  handled.add(event.ts);
  setTimeout(() => handled.delete(event.ts), 5 * 60 * 1000);

  const text = (event.text || "").trim();
  if (!text) return;

  console.log("[nero-slack] DM: " + text.slice(0, 80));

  try {
    await slack.reactions.add({ channel: event.channel, timestamp: event.ts, name: "thinking_face" });
  } catch (_) {}

  try {
    const res = await fetch(NERO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok) throw new Error("Nero API " + res.status);
    const data = await res.json();

    await slack.chat.postMessage({
      channel: event.channel,
      text: data.content,
      mrkdwn: true,
    });

    console.log("[nero-slack] Replied (" + data.content.length + " chars)");
  } catch (err) {
    console.error("[nero-slack] Error:", err.message);
    await slack.chat.postMessage({
      channel: event.channel,
      text: "Sorry, hit an error. Is the Nero server running at localhost:6376?",
    });
  } finally {
    try {
      await slack.reactions.remove({ channel: event.channel, timestamp: event.ts, name: "thinking_face" });
    } catch (_) {}
  }
});

socketClient.on("error", (err) => {
  console.error("[nero-slack] Socket error:", err.message);
});

(async () => {
  await socketClient.start();
  console.log("[nero-slack] Listening for DMs via Socket Mode");
})();
