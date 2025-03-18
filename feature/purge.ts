// file: feature/purge.ts
import type {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
} from "../deps.ts";
import { InteractionResponseTypes } from "../deps.ts";

/**
 * /purge コマンドを登録し、指定した件数のメッセージを一括削除します。
 * ただし 14日以上前のメッセージは除外されます（Bulk Delete API制限）。
 */
export function setupPurgeCommand(bot: Bot): CreateSlashApplicationCommand {
  // /purge コマンド定義
  const command: CreateSlashApplicationCommand = {
    name: "purge",
    description: "指定した件数のメッセージを一括削除します (1~100)",
    options: [
      {
        name: "count",
        description: "削除したいメッセージ数",
        type: 4, // INTEGER
        required: true,
      },
    ],
  };

  // Slashコマンドの挙動
  bot.events.interactionCreate = async (b, interaction: Interaction) => {
    // データが無い or コマンド名が"purge"でなければ無視
    if (!interaction.data || interaction.data.name !== "purge") return;

    // ギルド内テキストチャンネル以外での使用は不可と想定
    const channelId = interaction.channelId;
    if (!channelId) {
      return await sendEphemeralReply(
        b,
        interaction,
        "テキストチャンネルでのみ使用できます。"
      );
    }

    // 引数(count)を取得
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

    // countオプションはINTEGERなのでnumberにキャスト
    const requestedCount = Number(countOption.value) || 1;
    // ディスコードのBulk Delete上限に合わせ、1~100にクランプ
    const deleteCount = Math.max(1, Math.min(requestedCount, 100));

    try {
      // 最新のメッセージから deleteCount 件取得
      const messages = await b.helpers.getMessages(channelId, {
        limit: deleteCount,
      });

      // 14日より古いメッセージは Bulk Delete 不可なので除外
      const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const recentMessages = messages.filter((msg) => {
        const createdAt = Number(BigInt(msg.id) >> 22n) + 1420070400000;
        return createdAt >= twoWeeksAgo;
      });

      if (recentMessages.size === 0) {
        return await sendEphemeralReply(
          b,
          interaction,
          "14日以上前のメッセージは一括削除できません。"
        );
      }

      // 一括削除 (14日以内のものだけ)
      await b.helpers.deleteMessages(
        channelId,
        recentMessages.map((m) => m.id)
      );

      await sendEphemeralReply(
        b,
        interaction,
        `${recentMessages.size}件のメッセージを削除しました。`
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

  // コマンド定義を返す
  return command;
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
      // flags: 64 を付けると実行者のみに見えるエフェメラルメッセージになる
      flags: 64,
    },
  });
}
