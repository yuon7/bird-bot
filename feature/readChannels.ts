import type {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
  Message,
} from "../deps.ts";
import { Secret } from "../secret.ts";
import { InteractionResponseTypes } from "../deps.ts";

/**
 * 特定チャンネルから最新メッセージを取得するSlash Commandをセットアップする。
 * @param bot
 */
export async function setupReadChannelCommand(bot: Bot) {
  // Slash Command定義
  const readChannelCommand: CreateSlashApplicationCommand = {
    name: "readchannel",
    description: "特定チャンネルの最新メッセージを取得します",
    options: [
      {
        name: "limit",
        description: "何件取得しますか？ (1～100)",
        type: 4, // 4 = ApplicationCommandOptionType.Integer
        required: false,
      },
    ],
  };

  // ギルド単位でSlash Commandを登録
  await bot.helpers.upsertGuildApplicationCommands(Secret.GUILD_ID, [
    readChannelCommand,
  ]);

  // Slash Command が実行されたときの処理
  bot.events.interactionCreate = async (b, interaction: Interaction) => {
    if (!interaction.data) return;

    // コマンド名が "readchannel" なら処理を実行
    if (interaction.data.name === "readchannel") {
      // limitオプションを取得 (指定がなければ10)
      const limitOption = interaction.data.options?.find(
        (op) => op.name === "limit"
      );
      const limitValue =
        limitOption && "value" in limitOption ? Number(limitOption.value) : 10;

      // 取得件数を1～100に制限
      const fetchLimit = Math.max(1, Math.min(limitValue, 100));

      try {
        // 対象チャンネルID (Secret.CHANNEL_IDはstringなので BigInt化)
        const channelId = BigInt(Secret.CHANNEL_ID);

        // 最新から順にメッセージを取得
        // Discordenoのバージョンによっては Collection<bigint, Message> が返る
        // → for (const [_, msg] of messages) のように書く
        const messages = await b.helpers.getMessages(channelId, {
          limit: fetchLimit,
        });

        // 取り出し先の配列
        const textList: string[] = [];

        // Collection<bigint, Message>の場合: for (const [_, msg] of messages) { ... }
        // 配列の場合: for (const msg of messages) { ... }
        // 以下はCollection前提で書いています
        for (const [_, msg] of messages) {
          // ギルドメンバー情報を取得してユーザー名(またはニックネーム)を取り出す
          const displayName = await fetchDisplayNameFromMessage(b, msg);

          // メッセージ内容
          const content = msg.content;

          // 整形
          textList.push(`[${displayName}] ${content}`);
        }

        let responseText = textList.join("\n");
        if (!responseText) {
          responseText = "メッセージがありませんでした。";
        }

        // コマンド実行者へ返信
        await b.helpers.sendInteractionResponse(
          interaction.id,
          interaction.token,
          {
            type: InteractionResponseTypes.ChannelMessageWithSource,
            data: {
              content: `以下が最新${fetchLimit}件のメッセージです:\n${responseText}`,
            },
          }
        );
      } catch (err) {
        console.error("Error fetching messages:", err);
        await b.helpers.sendInteractionResponse(
          interaction.id,
          interaction.token,
          {
            type: InteractionResponseTypes.ChannelMessageWithSource,
            data: {
              content: "メッセージ取得でエラーが発生しました。",
            },
          }
        );
      }
    }
  };
}

/**
 * メッセージ作者のギルド表示名 (ニックネーム or ユーザー名) を取得するヘルパー関数
 */
async function fetchDisplayNameFromMessage(bot: Bot, msg: Message) {
  const guildId = Secret.GUILD_ID;
  const memberId = msg.authorId; // bigint

  try {
    // ギルドメンバー情報を取得
    const member = await bot.helpers.getMember(guildId, memberId);

    // ニックネーム or ユーザー名を返す
    return member.nick ?? member.user?.username ?? "unknown";
  } catch (error) {
    // ユーザーが既にサーバーを抜けている / 取得失敗 等
    console.log("Cannot fetch member info:", memberId, error);
    // 失敗時はIDを文字列化して返すなどお好みで
    return String(memberId);
  }
}
