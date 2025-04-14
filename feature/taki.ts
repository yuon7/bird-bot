import type {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
} from "../deps.ts";
import { InteractionResponseTypes } from "../deps.ts";
import { dayjs } from "../deps.ts";

const activeTakiChannels = new Set<bigint>();

let isTakiReminderLoopStarted = false;

export function getTakiCommand(): CreateSlashApplicationCommand {
  return {
    name: "taki",
    description: "毎時30分に『炊きましょう🔥』リマインドを開始/終了します",
    options: [
      {
        name: "s",
        description: "リマインド開始",
        type: 1,
      },
      {
        name: "e",
        description: "リマインド終了",
        type: 1,
      },
    ],
  };
}
export async function handleTakiInteraction(bot: Bot, interaction: Interaction) {
  if (!interaction.data || interaction.data.name !== "taki") return;

  const subCommand = interaction.data.options?.[0]?.name;
  if (!subCommand) {
    return respond(bot, interaction, "サブコマンドが指定されていません。");
  }

  const channelId = interaction.channelId;
  if (!channelId) {
    return respond(bot, interaction, "テキストチャンネルでのみ使用できます。");
  }

  switch (subCommand) {
    case "s": {
      activeTakiChannels.add(channelId);
      await respond(bot, interaction, "リマインドを開始しました。");
      break;
    }
    case "e": {
      activeTakiChannels.delete(channelId);
      await respond(bot, interaction, "リマインドを終了しました。");
      break;
    }
    default:
      await respond(bot, interaction, `不明なサブコマンド: ${subCommand}`);
  }
}
export function startTakiReminderLoop(bot: Bot) {
  if (isTakiReminderLoopStarted) return;
  isTakiReminderLoopStarted = true;

  setInterval(async () => {
    const now = dayjs().tz("Asia/Tokyo");
    const mm = now.minute();
    const ss = now.second();

    // 30分00秒 か
    if (mm === 30 && ss === 0) {
      for (const chId of activeTakiChannels) {
        try {
          await bot.helpers.sendMessage(chId, { content: "炊きましょう🔥" });
        } catch (err) {
          console.error(`Failed to send message to channel ${chId}`, err);
        }
      }
    }
  }, 60 * 1000);
}

async function respond(bot: Bot, interaction: Interaction, content: string) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: { content },
  });
}
