import type {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
  Message,
} from "../deps.ts";
import { InteractionResponseTypes } from "../deps.ts";

// ボイスチャンネルID・通知先チャンネルIDを保持するためのインターフェイス
interface MonitorSettings {
  voiceChannelId: bigint;
  notifyChannelId: bigint;
}

/** チャンネルID -> MonitorSettings のマップ */
const monitors = new Map<bigint, MonitorSettings>();

// 5桁数字にマッチする正規表現
const fiveDigitsOnlyRegex = /^[0-9]{5}$/;

// チャンネルID文字列をパース (例: <#123456789> → "123456789")

function parseChannelId(input: string): string {
  let s = input.trim();
  if (s.startsWith("<#") && s.endsWith(">")) {
    s = s.slice(2, -1);
  }
  if (s.startsWith("#")) {
    s = s.slice(1);
  }
  return s;
}

// roomid コマンド定義を返す
export function getRoomIdCommand(): CreateSlashApplicationCommand {
  return {
    name: "roomid",
    description: "5桁番号が投稿されたらボイスチャンネル名を更新します",
    options: [
      {
        name: "start",
        description: "このテキストチャンネルで監視を開始",
        type: 1,
        options: [
          {
            name: "voice_channel_id",
            description: "番号を設定したいボイスチャンネルID",
            type: 3,
            required: true,
          },
          {
            name: "notify_channel_id",
            description: "番号変更を通知するテキストチャンネルID",
            type: 3,
            required: true,
          },
        ],
      },
      {
        name: "end",
        description: "このテキストチャンネルでの監視を終了",
        type: 1,
      },
    ],
  };
}

//  /roomid コマンドの実行時ロジック
export async function handleRoomIdInteraction(
  bot: Bot,
  interaction: Interaction
) {
  if (!interaction.data || interaction.data.name !== "roomid") return;

  const subCommand = interaction.data.options?.[0];
  if (!subCommand) return;

  const textChannelId = interaction.channelId;
  if (!textChannelId) {
    return await sendMessageInteraction(
      bot,
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
          bot,
          interaction,
          "引数が不足しています。"
        );
      }

      const rawVoiceId =
        typeof voiceChannelArg.value === "string" ? voiceChannelArg.value : "";
      const rawNotifyId =
        typeof notifyChannelArg.value === "string"
          ? notifyChannelArg.value
          : "";

      const voiceChannelIdStr = parseChannelId(rawVoiceId);
      const notifyChannelIdStr = parseChannelId(rawNotifyId);

      if (!voiceChannelIdStr || !notifyChannelIdStr) {
        return await sendMessageInteraction(
          bot,
          interaction,
          "正しいチャンネルIDを指定してください。"
        );
      }

      let voiceChannelId: bigint;
      let notifyChannelId: bigint;
      try {
        voiceChannelId = BigInt(voiceChannelIdStr);
        notifyChannelId = BigInt(notifyChannelIdStr);
      } catch {
        return await sendMessageInteraction(
          bot,
          interaction,
          "チャンネルIDは数値を指定してください。"
        );
      }

      // このテキストチャンネルをキーにして監視対象を保存
      monitors.set(textChannelId, {
        voiceChannelId,
        notifyChannelId,
      });

      await sendMessageInteraction(
        bot,
        interaction,
        `監視を開始しました。\n対象チャンネル <#${voiceChannelIdStr}> <#${notifyChannelIdStr}>`
      );
      break;
    }
    case "end": {
      monitors.delete(textChannelId);
      await sendMessageInteraction(bot, interaction, "監視を終了しました。");
      break;
    }
    default:
      break;
  }
}

// テキストメッセージ受信時の処理→ Botの唯一の messageCreate で呼び分ける中で handleRoomIdMessage(...) を呼ぶ

export async function handleRoomIdMessage(bot: Bot, message: Message) {
  const monitor = monitors.get(message.channelId);
  
  if (!monitor) return;
  if (!fiveDigitsOnlyRegex.test(message.content)) return;

  const newRoomNumber = message.content;
  const newChannelName = `部屋番号【${newRoomNumber}】`;
  try {
    // ボイスチャンネル名変更
    await bot.helpers.editChannel(monitor.voiceChannelId, {
      name: newChannelName,
    });

    // 通知チャンネル名変更
    const newTextChannelName = `🔒│【${newRoomNumber}】`;
    await bot.helpers.editChannel(monitor.notifyChannelId, {
      name: newTextChannelName,
    });

    // 通知先チャンネルにメッセージ送信
    await bot.helpers.sendMessage(monitor.notifyChannelId, {
      content: `ボイスチャンネルを${newChannelName}に変更しました。`,
    });
  } catch (err) {
    console.error("Failed to rename voice channel:", err);
  }
}

/**
 * Interaction に簡易返信
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
