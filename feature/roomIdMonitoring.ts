import type {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
  Message,
} from "../deps.ts";
import { InteractionResponseTypes } from "../deps.ts";
import { Secret } from "../secret.ts";

interface MonitorSettings {
  voiceChannelId: bigint;
  notifyChannelId: bigint;
}

const monitors = new Map<bigint, MonitorSettings>();

const fiveDigitsOnlyRegex = /^[0-9]{5}$/;

function parseChannelId(input: string): string {
  // Discordのチャンネルメンションの場合: <#1234567890>
  // あるいは先頭に #1234567890 の形など
  let s = input.trim();
  // <#1234567890> のような形なら <# と > を除去
  if (s.startsWith("<#") && s.endsWith(">")) {
    s = s.slice(2, -1);
  }
  // 先頭が # なら1文字削る
  if (s.startsWith("#")) {
    s = s.slice(1);
  }
  return s;
}

export async function setupRoomIdMonitor(bot: Bot) {
  const command: CreateSlashApplicationCommand = {
    name: "roomid",
    description: "5桁番号が投稿されたらボイスチャンネル名を更新します",
    options: [
      {
        name: "start",
        description: "このテキストチャンネルで監視を開始",
        type: 1, // SUB_COMMAND
        options: [
          {
            name: "voice_channel_id",
            description: "番号を設定したいボイスチャンネルID",
            type: 3, // STRINGとしてIDを受け取る
            required: true,
          },
          {
            name: "notify_channel_id",
            description: "番号変更を通知するテキストチャンネルID",
            type: 3, // STRING としてIDを受け取る
            required: true,
          },
        ],
      },
      {
        name: "end",
        description: "このテキストチャンネルでの監視を終了",
        type: 1, // SUB_COMMAND
      },
    ],
  };

  const GUILD_ID = Secret.GUILD_ID;
  await bot.helpers.upsertGuildApplicationCommands(GUILD_ID, [command]);

  bot.events.interactionCreate = async (b, interaction: Interaction) => {
    if (!interaction.data) return;
    if (interaction.data.name !== "roomid") return;

    const subCommand = interaction.data.options?.[0];
    if (!subCommand) return;

    const textChannelId = interaction.channelId;
    if (!textChannelId) {
      return await sendMessageInteraction(
        b,
        interaction,
        "テキストチャンネルでのみ実行できます。"
      );
    }

    switch (subCommand.name) {
      case "start": {
        const voiceChannelArg = subCommand.options?.find(
          (op) => op.name === "voice_channel_id"
        );
        const notifyChannelArg = subCommand.options?.find(
          (op) => op.name === "notify_channel_id"
        );

        if (!voiceChannelArg || !notifyChannelArg) {
          return await sendMessageInteraction(
            b,
            interaction,
            "引数が不足しています。"
          );
        }

        const rawVoiceId =
          typeof voiceChannelArg.value === "string"
            ? voiceChannelArg.value
            : "";
        const rawNotifyId =
          typeof notifyChannelArg.value === "string"
            ? notifyChannelArg.value
            : "";
        const voiceChannelIdStr = parseChannelId(rawVoiceId);
        const notifyChannelIdStr = parseChannelId(rawNotifyId);

        if (!voiceChannelIdStr || !notifyChannelIdStr) {
          return await sendMessageInteraction(
            b,
            interaction,
            "正しいチャンネルIDを指定してください。"
          );
        }

        let voiceChannelId: bigint;
        let notifyChannelId: bigint;
        try {
          voiceChannelId = BigInt(voiceChannelIdStr);
          notifyChannelId = BigInt(notifyChannelIdStr);
        } catch (_) {
          return await sendMessageInteraction(
            b,
            interaction,
            "チャンネルIDは数値を指定してください。"
          );
        }

        monitors.set(textChannelId, {
          voiceChannelId,
          notifyChannelId,
        });

        await sendMessageInteraction(
          b,
          interaction,
          `監視を開始しました。\n対象チャンネル <#${voiceChannelIdStr}> <#${notifyChannelIdStr}>`
        );
        break;
      }
      case "end": {
        monitors.delete(textChannelId);
        await sendMessageInteraction(b, interaction, `監視を終了しました。`);
        break;
      }
      default:
        break;
    }
  };

  bot.events.messageCreate = async (b, message: Message) => {
    const monitor = monitors.get(message.channelId);
    if (!monitor) return;

    if (!fiveDigitsOnlyRegex.test(message.content)) return;

    const newRoomNumber = message.content;
    const newChannelName = `部屋番号【${newRoomNumber}】`;

    try {
      await b.helpers.editChannel(monitor.voiceChannelId, {
        name: newChannelName,
      });

      const newTextChannelName = `🔒│【${newRoomNumber}】`;
      await b.helpers.editChannel(monitor.notifyChannelId, {
        name: newTextChannelName,
      });

      // 成功したら、通知先チャンネルへメッセージを送る
      await b.helpers.sendMessage(monitor.notifyChannelId, {
        content: `ボイスチャンネルを${newChannelName}に変更しました。`,
      });
    } catch (err) {
      console.error("Failed to rename voice channel:", err);
    }
  };
}

/**
 * Interaction に簡易的にメッセージ返信するヘルパー
 */
async function sendMessageInteraction(
  bot: Bot,
  interaction: Interaction,
  text: string
) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: { content: text },
  });
}
