import { createBot, Intents, startBot } from "./deps.ts";
import { Secret } from "./secret.ts";
import { setupReadChannelCommand } from "./feature/readChannels.ts";

const bot = createBot({
  token: Secret.DISCORD_TOKEN,
  intents: Intents.Guilds | Intents.GuildMessages | Intents.MessageContent,
  events: {
    ready: (_bot, payload) => {
      console.log(`${payload.user.username} is ready!`);
    },
  },
});

// featureの機能をまとめてセットアップ
await setupReadChannelCommand(bot);

// Bot起動
await startBot(bot);
