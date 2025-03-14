import { createBot, Intents, startBot } from "./deps.ts";
import { setupRoomIdMonitor } from "./feature/roomIdMonitoring.ts";
import { Secret } from "./secret.ts"; // 必要に応じて

const bot = createBot({
  token: Secret.DISCORD_TOKEN,
  intents: Intents.Guilds | Intents.GuildMessages | Intents.MessageContent,
  events: {
    ready: (_bot, payload) => {
      console.log(`${payload.user.username} is ready!`);
    },
  },
});

// 機能のセットアップ → コマンド定義を受け取る
const roomIdCommand = setupRoomIdMonitor(bot);

/**
 * 新規サーバー（ギルド）に参加したタイミングで Slash コマンドを登録する
 */
bot.events.guildCreate = async (b, guild) => {
  const guildId = BigInt(guild.id);
  console.log(`[guildCreate] Joined new guild: ${guildId}`);

  // 新規参加したギルドに対してコマンド登録
  await b.helpers.upsertGuildApplicationCommands(guildId, [roomIdCommand]);
  console.log(`[guildCreate] Registered /roomid for guild: ${guildId}`);
};

// Bot 起動
await startBot(bot);
