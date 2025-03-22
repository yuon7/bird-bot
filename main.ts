import { createBot, Intents, startBot } from "./deps.ts";
import { Secret } from "./secret.ts";
import {
  getCalcCommand,
  handleCalcInteraction,
  handleCalcButton,
  handleCalcMessage,
} from "./feature/eventPointCalc.ts";
import { getPurgeCommand, handlePurgeInteraction } from "./feature/purge.ts";
import {
  getRoomIdCommand,
  handleRoomIdInteraction,
  handleRoomIdMessage,
} from "./feature/roomIdMonitoring.ts";

const bot = createBot({
  token: Secret.DISCORD_TOKEN,
  intents: Intents.Guilds | Intents.GuildMessages | Intents.MessageContent,
  events: {
    ready: (_b, payload) => {
      console.log(`${payload.user.username} is ready!`);
    },
  },
});

//コマンド取得
const calcCommand = getCalcCommand();
const purgeCommand = getPurgeCommand();
const roomIdCommand = getRoomIdCommand();

//既存ギルドに対してコマンド登録
bot.events.ready = async (b) => {
  console.log(
    "Bot is ready. Registering slash commands for existing guilds..."
  );

  for (const guildId of b.activeGuildIds) {
    await b.helpers.upsertGuildApplicationCommands(guildId, [
      calcCommand,
      purgeCommand,
      roomIdCommand,
    ]);
    console.log(`Registered commands in guild: ${guildId}`);
  }
};

// --- 3. 新規参加したギルドでも同様に登録 (guildCreateイベント) ---
bot.events.guildCreate = async (b, guild) => {
  const guildId = BigInt(guild.id);
  console.log(`[guildCreate] Joined new guild: ${guildId}`);

  await b.helpers.upsertGuildApplicationCommands(guildId, [
    calcCommand,
    purgeCommand,
    roomIdCommand,
  ]);
  console.log(
    `[guildCreate] Registered /calc, /purge, /roomid in guild: ${guildId}`
  );
};

// 各コマンドの処理を登録
bot.events.interactionCreate = async (b, interaction) => {
  if (interaction.data?.name) {
    switch (interaction.data.name) {
      case "calc":
        await handleCalcInteraction(b, interaction);
        return;
      case "purge":
        await handlePurgeInteraction(b, interaction);
        return;
      case "roomid":
        await handleRoomIdInteraction(b, interaction);
        return;
    }
  }
  if (interaction.data?.componentType === 2) {
    if (interaction.data.customId?.startsWith("calc:")) {
      await handleCalcButton(b, interaction);
      return;
    }
  }
};

bot.events.messageCreate = async (b, msg) => {
  await handleCalcMessage(b, msg);
  await handleRoomIdMessage(b, msg);

};

await startBot(bot);
