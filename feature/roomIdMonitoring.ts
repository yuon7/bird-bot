import type {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
  Message,
} from "../deps.ts";
import { InteractionResponseTypes } from "../deps.ts";

/** ボイスチャンネルID・通知先チャンネルIDを保持するためのインターフェイス */
interface MonitorSettings {
  voiceChannelId: bigint;
  notifyChannelId: bigint;
}

/** 複数のテキストチャンネルごとに監視設定を保存するための Map */
const monitors = new Map<bigint, MonitorSettings>();

/** 5桁だけにマッチする正規表現 */
const fiveDigitsOnlyRegex = /^[0-9]{5}$/;

/**
 * チャンネルIDの文字列をパースして返す
 * 例: <#1234567890> → "1234567890", "#1234567890" → "1234567890"
 */
function parseChannelId(input: string): string {
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

/**
 * Slash Command「/roomid」を登録し、5桁の番号が投稿されたらボイスチャンネルの名前を変える機能を提供する
 */
export function setupRoomIdMonitor(bot: Bot) {
  // 登録する Slash Command の定義
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

  /**
   * bot が起動して「準備完了」となったときに、すでに参加している全てのサーバーに対してコマンドを登録
   *
   * ※新しくサーバーに参加したタイミングで登録したいなら、
   *   bot.events.guildCreate = async (...) => { ... } を使う方法もあります。
   */
  bot.events.ready = async (b) => {
    console.log("Bot is ready!");

    // いまBotがアクティブに接続しているギルドIDを一括取得
    for (const guildId of b.activeGuildIds) {
      await b.helpers.upsertGuildApplicationCommands(guildId, [command]);
      console.log(`Registered /roomid for guild: ${guildId}`);
    }
  };

  /**
   * /roomid コマンドが呼ばれたときの挙動
   */
  bot.events.interactionCreate = async (b, interaction: Interaction) => {
    // データが無い場合は無視
    if (!interaction.data) return;
    // コマンド名が "roomid" ではないなら無視
    if (interaction.data.name !== "roomid") return;

    // コマンドの subcommand (start or end)
    const subCommand = interaction.data.options?.[0];
    if (!subCommand) return;

    // 実行されたテキストチャンネルID
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

        // テキストチャンネルIDをキーにして、監視対象のボイス／通知チャンネルを記憶する
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
        await sendMessageInteraction(b, interaction, "監視を終了しました。");
        break;
      }
      default:
        break;
    }
  };

  /**
   * 監視対象のテキストチャンネルに 5桁の数字が投稿されたときの挙動
   */
  bot.events.messageCreate = async (b, message: Message) => {
    // このチャンネルが監視対象かどうか
    const monitor = monitors.get(message.channelId);
    if (!monitor) return;

    // 投稿内容が 5桁の数字でなければ無視
    if (!fiveDigitsOnlyRegex.test(message.content)) return;

    const newRoomNumber = message.content;
    const newChannelName = `部屋番号【${newRoomNumber}】`;

    try {
      // 監視対象のボイスチャンネル名を変更
      await b.helpers.editChannel(monitor.voiceChannelId, {
        name: newChannelName,
      });

      // 監視対象の通知チャンネル名を変更
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
  return command;
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
