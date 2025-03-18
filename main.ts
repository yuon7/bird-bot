import { createBot, Intents, startBot } from "./deps.ts";
import { setupRoomIdMonitor } from "./feature/roomIdMonitoring.ts";
import { setupPurgeCommand } from "./feature/purge.ts";
import { setupCalcCommand } from "./feature/eventPointCalc.ts";
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

const roomIdCommand = setupRoomIdMonitor(bot);
const purgeCommand = setupPurgeCommand(bot);
const calcCommand = setupCalcCommand(bot);

/**
 * 新規サーバー（ギルド）に参加したタイミングで Slash コマンドを登録する
 */
bot.events.guildCreate = async (b, guild) => {
  const guildId = BigInt(guild.id);
  console.log(`[guildCreate] Joined new guild: ${guildId}`);

  // 新規参加したギルドに対してコマンド登録
  await b.helpers.upsertGuildApplicationCommands(guildId, [roomIdCommand]);
  await b.helpers.upsertGuildApplicationCommands(guildId, [purgeCommand]);
  await b.helpers.upsertGuildApplicationCommands(guildId, [calcCommand]);
  console.log(`[guildCreate] Registered commands in guild: ${guildId}`);
};

await startBot(bot);
