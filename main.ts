import {
  Application,
  Router,
  createBot,
  Intents,
  startBot,
  InteractionTypes,
} from "./deps.ts";
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
import {
  getCheckRoleCommand,
  handleCheckRoleInteraction,
} from "./feature/checkRole.ts";
import {
  getTakiCommand,
  handleTakiInteraction,
  startTakiReminderLoop,
} from "./feature/taki.ts";
import {
  getEfficiencyCommand,
  handleEfficiencyInteraction,
} from "./feature/efficiency.ts";

const startSelfPingLoop = () => {
  const DEPLOY_URL = Secret.DEPLOY_URL;

  console.log(`Starting self-ping loop for ${DEPLOY_URL}`);

  // 5分ごとにセルフPing
  setInterval(async () => {
    try {
      const response = await fetch(`${DEPLOY_URL}/health`);
      const data = await response.json();
      console.log(`Self-ping successful at ${data.timestamp}`);
    } catch (error) {
      console.error("Self-ping failed:", error);
    }
  }, 4 * 60 * 1000); // 4分ごと
};

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
const efficiencyCommand = getEfficiencyCommand();

bot.events.ready = async (b) => {
  console.log(
    "Bot is ready. Registering slash commands for existing guilds..."
  );

  startTakiReminderLoop(bot);
  startSelfPingLoop();

  for (const guildId of b.activeGuildIds) {
    await b.helpers.upsertGuildApplicationCommands(guildId, [
      calcCommand,
      purgeCommand,
      roomIdCommand,
      checkRoleCommand,
      takiCommand,
      efficiencyCommand,
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
    efficiencyCommand,
  ]);
  console.log(
    `[guildCreate] Registered /calc, /purge, /roomid, /checkrole, /taki, /efficiency in guild: ${guildId}`
  );
};

bot.events.interactionCreate = async (b, interaction) => {
  // Autocompleteリクエストの処理
  if (interaction.type === InteractionTypes.ApplicationCommandAutocomplete) {
    if (interaction.data?.name === "efficiency") {
      await handleEfficiencyInteraction(b, interaction);
    }
    return;
  }

  // 通常のコマンド実行とコンポーネント操作
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
      case "efficiency":
        await handleEfficiencyInteraction(b, interaction);
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

const router = new Router();
router.get("/", (ctx) => {
  ctx.response.body = "Bot is running!";
});

router.get("/health", (ctx) => {
  ctx.response.body = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: performance.now(),
  };
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

// HTTP サーバーを AbortController で制御
const PORT = Secret.PORT || 8000;
const controller = new AbortController();

app
  .listen({ port: PORT, signal: controller.signal })
  .catch((e) => console.error("HTTP server closed:", e));

console.log(`HTTP server running on port ${PORT}`);

await startBot(bot);

Deno.addSignalListener("SIGINT", () => {
  controller.abort();
  Deno.exit(0);
});
