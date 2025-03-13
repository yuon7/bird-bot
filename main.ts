import { createBot, Intents, startBot } from "./deps.ts";
import { setupRoomIdMonitor } from "./feature/roomIdMonitoring.ts";
import { Secret } from "./secret.ts"; // 必要に応じて;

// まとめたワークフローを読み込む

const bot = createBot({
  token: Secret.DISCORD_TOKEN,
  intents: Intents.Guilds | Intents.GuildMessages | Intents.MessageContent,
  events: {
    ready: (_bot, payload) => {
      console.log(`${payload.user.username} is ready!`);
    },
  },
});

// 機能のセットアップ
await setupRoomIdMonitor(bot);

// Bot 起動
await startBot(bot);
