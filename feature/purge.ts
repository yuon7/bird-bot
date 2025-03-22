import type {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
} from "../deps.ts";
import { InteractionResponseTypes } from "../deps.ts";

//purge コマンドの定義オブジェクトを返す
export function getPurgeCommand(): CreateSlashApplicationCommand {
  return {
    name: "purge",
    description: "指定した件数のメッセージを一括削除します (1~100)",
    options: [
      {
        name: "count",
        description: "削除したいメッセージ数",
        type: 4,
        required: true,
      },
    ],
  };
}

// purgeコマンドの処理
export async function handlePurgeInteraction(
  bot: Bot,
  interaction: Interaction
) {
  // データが無い or コマンド名が"purge"でなければ無視
  if (!interaction.data || interaction.data.name !== "purge") return;

  // ギルド内テキストチャンネル以外での使用は不可
  const channelId = interaction.channelId;
  if (!channelId) {
    return await sendEphemeralReply(
      bot,
      interaction,
      "テキストチャンネルでのみ使用できます。"
    );
  }

  // 引数(count)を取得
  const countOption = interaction.data.options?.find((o) => o.name === "count");
  if (!countOption) {
    return await sendEphemeralReply(
      bot,
      interaction,
      "削除件数が指定されていません。"
    );
  }

  // countを1~100にクランプ
  const requestedCount = Number(countOption.value) || 1;
  const deleteCount = Math.max(1, Math.min(requestedCount, 100));

  try {
    // 最新のメッセージから deleteCount 件取得
    const messages = await bot.helpers.getMessages(channelId, {
      limit: deleteCount,
    });

    // 14日より古いメッセージは除外
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    // DiscordのSnowflakeから作成日時を算出: createdAtMs = (id >> 22) + 1420070400000
    const recentMessages = messages.filter((msg) => {
      const createdAt = Number(BigInt(msg.id) >> 22n) + 1420070400000;
      return createdAt >= twoWeeksAgo;
    });

    if (recentMessages.size === 0) {
      return await sendEphemeralReply(
        bot,
        interaction,
        "14日以上前のメッセージは一括削除できません。"
      );
    }

    // 一括削除 (14日以内のみ)
    await bot.helpers.deleteMessages(
      channelId,
      recentMessages.map((m) => m.id)
    );

    await sendEphemeralReply(
      bot,
      interaction,
      `${recentMessages.size}件のメッセージを削除しました。`
    );
  } catch (err) {
    console.error("Failed to purge messages:", err);
    await sendEphemeralReply(
      bot,
      interaction,
      "メッセージ削除に失敗しました。権限や日数制限を確認してください。"
    );
  }
}

//エフェメラル（実行者本人にのみ見える）なメッセージを送信するヘルパー
async function sendEphemeralReply(
  bot: Bot,
  interaction: Interaction,
  content: string
) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: {
      content,
      flags: 64,
    },
  });
}
