import type {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
} from "../deps.ts";
import { InteractionResponseTypes } from "../deps.ts";

/**
 * /purge コマンドを登録し、指定した件数のメッセージを一括削除します。
 * 削除が完了したらエフェメラルメッセージ（実行者のみが見える）で報告します。
 */
export function setupPurgeCommand(bot: Bot) {
  // 1) Slashコマンドの定義
  const purgeCommand: CreateSlashApplicationCommand = {
    name: "purge",
    description: "指定した件数のメッセージを一括削除します (1~100)",
    options: [
      {
        name: "count",
        description: "削除したいメッセージ数",
        type: 4, // 整数(Integer)のオプション
        required: true,
        // min_value, max_valueがサポートされていれば設定すると安全
        // min_value: 1,
        // max_value: 100,
      },
    ],
  };

  // 2) Bot起動時に登録（Guildコマンド想定: guildCreate等でも追加できる）
  // 例：すでに他のイベントで upsertGuildApplicationCommands() しているなら適宜そちらへ組み込む
  bot.events.ready = async (b) => {
    console.log("Bot ready - Registering /purge command...");

    // Botが参加しているギルド全てにアップサートしたい例
    for (const guildId of b.activeGuildIds) {
      await b.helpers.upsertGuildApplicationCommands(guildId, [purgeCommand]);
      console.log(`/purge command registered for guild ${guildId}`);
    }
  };

  // 3) interactionCreate でコマンドの実行処理
  bot.events.interactionCreate = async (b, interaction: Interaction) => {
    // データがない or コマンド名が"purge"でなければ無視
    if (!interaction.data || interaction.data.name !== "purge") return;

    // Slashコマンドは基本的にギルド内テキストチャンネルで使用する想定
    const channelId = interaction.channelId;
    if (!channelId) {
      return await sendEphemeralReply(
        b,
        interaction,
        "テキストチャンネルでのみ使用できます。"
      );
    }

    // オプション(count)を取得
    const countOption = interaction.data.options?.find(
      (o) => o.name === "count"
    );
    if (!countOption) {
      return await sendEphemeralReply(
        b,
        interaction,
        "削除件数が指定されていません。"
      );
    }

    // countOption.value は string | number | boolean | ...の場合があるが、
    // INTEGERオプションなのでnumberにキャストする
    const requestedCount = Number(countOption.value) || 1;

    // 1~100 にクランプ(範囲外なら丸める)
    const deleteCount = Math.max(1, Math.min(requestedCount, 100));

    try {
      // メッセージ一覧を新しい順に deleteCount 件取得
      // ※ Bulk Deleteの仕様により14日以上前のメッセージは削除不可
      const messages = await b.helpers.getMessages(channelId, {
        limit: deleteCount,
      });

      // IDだけ抜き出し
      const messageIds = messages.map((m) => m.id);

      // Bulk Delete (同時に100件まで)
      // 14日以上前のメッセージはエラーになる可能性
      await b.helpers.deleteMessages(channelId, messageIds);

      // 削除完了をエフェメラルで報告
      await sendEphemeralReply(
        b,
        interaction,
        `${messageIds.length}件のメッセージを削除しました。`
      );
    } catch (err) {
      console.error("Failed to purge messages:", err);
      await sendEphemeralReply(
        b,
        interaction,
        "メッセージ削除に失敗しました。権限や日数制限を確認してください。"
      );
    }
  };
  return purgeCommand;
}

/**
 * エフェメラル（実行者本人にのみ見える）なメッセージを送信するヘルパー
 */
async function sendEphemeralReply(
  bot: Bot,
  interaction: Interaction,
  content: string
) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: {
      content,
      // flags: 64 (EPHEMERAL)
      // → エフェメラルメッセージは、このフラグを付けることで他の人には見えなくなる
      flags: 64,
    },
  });
}
