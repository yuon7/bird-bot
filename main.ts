import { createBot, Intents, startBot } from "./deps.ts";
import { Secret } from "./secret.ts";
import {
  getCalcCommand,
  handleCalcInteraction,
  handleCalcButton,
  handleCalcMessage,
} from "./feature/eventPointCalc.ts";
import {
  getPurgeCommand,
  handlePurgeInteraction,
} from "./feature/purge.ts";
import {
  getRoomIdCommand,
  handleRoomIdInteraction,
  handleRoomIdMessage,
} from "./feature/roomIdMonitoring.ts";
import {
  getCheckRoleCommand,
  handleCheckRoleInteraction,
} from "./feature/checkRole.ts";
import {
  getTakiCommand,
  handleTakiInteraction,
  startTakiReminderLoop,
} from "./feature/taki.ts";

const bot = createBot({
  token: Secret.DISCORD_TOKEN,
  intents: Intents.Guilds | Intents.GuildMessages | Intents.MessageContent,
  events: {
    ready: (_b, payload) => {
      console.log(`${payload.user.username} is ready!`);
    },
  },
});

const calcCommand = getCalcCommand();
const purgeCommand = getPurgeCommand();
const roomIdCommand = getRoomIdCommand();
const checkRoleCommand = getCheckRoleCommand();
const takiCommand = getTakiCommand();

bot.events.ready = async (b) => {
  console.log("Bot is ready. Registering slash commands for existing guilds...");

  startTakiReminderLoop(bot);

  for (const guildId of b.activeGuildIds) {
    await b.helpers.upsertGuildApplicationCommands(guildId, [
      calcCommand,
      purgeCommand,
      roomIdCommand,
      checkRoleCommand,
      takiCommand,
    ]);
    console.log(`Registered commands in guild: ${guildId}`);
  }
};

bot.events.guildCreate = async (b, guild) => {
  const guildId = BigInt(guild.id);
  console.log(`[guildCreate] Joined new guild: ${guildId}`);

  await b.helpers.upsertGuildApplicationCommands(guildId, [
    calcCommand,
    purgeCommand,
    roomIdCommand,
    checkRoleCommand,
    takiCommand,
  ]);
  console.log(`[guildCreate] Registered /calc, /purge, /roomid, /checkrole, /taki in guild: ${guildId}`);
};

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
      case "checkrole":
        await handleCheckRoleInteraction(b, interaction);
        return;
      case "taki":
        await handleTakiInteraction(b, interaction);
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
