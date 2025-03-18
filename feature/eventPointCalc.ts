import {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
  InteractionResponseTypes,
  MessageComponentTypes,
  ButtonStyles,
  ActionRow,
  ButtonComponent,
} from "../deps.ts";

/** ライブボーナス倍率テーブル（0～3炊きのみ）*/
const liveBonusTable = [
  { consume: 0, multiplier: 1 },
  { consume: 1, multiplier: 5 },
  { consume: 2, multiplier: 10 },
  { consume: 3, multiplier: 15 },
];

/** スコアの最大値を 3,000,000 とする */
const SCORE_MAX = 3_000_000;

export function setupCalcCommand(bot: Bot): CreateSlashApplicationCommand {
  const command: CreateSlashApplicationCommand = {
    name: "calc",
    description: "指定したイベントポイントをピッタリ稼ぐスコア帯を列挙します",
    options: [
      {
        name: "required_points",
        description: "イベントポイント (例: 30000)",
        type: 4,
        required: true,
      },
    ],
  };

  // InteractionCreate イベント(単一)で Slashコマンドとボタンを両方処理してもOKだが
  // ここではSlashコマンドの処理だけ書きます
  bot.events.interactionCreate = async (b, interaction: Interaction) => {
    if (interaction.data?.name === "calc") {
      const requiredPointsOpt = interaction.data.options?.find(
        (o) => o.name === "required_points"
      );
      if (!requiredPointsOpt) {
        return sendReply(b, interaction, "必要ポイントを指定してください。");
      }

      const requiredPoints = Number(requiredPointsOpt.value);
      if (isNaN(requiredPoints) || requiredPoints < 0) {
        return sendReply(b, interaction, "正の整数を指定してください。");
      }

      const lines = calculateScoreRanges(requiredPoints);

      if (!lines.length) {
        return sendReply(b, interaction, "条件に合う結果がありませんでした。");
      }

      const pages = chunk(lines, 8).map((chunked, index) => {
        const pageNumber = index + 1;
        const totalPages = Math.ceil(lines.length / 8);
        return [
          `**必要PT**: ${requiredPoints} | Page ${pageNumber}/${totalPages}`,
          "```",
          "イベントボーナス% | 炊き数 | スコア下限  | スコア上限",
          ...chunked,
          "```",
        ].join("\n");
      });

      await b.helpers.sendInteractionResponse(
        interaction.id,
        interaction.token,
        {
          type: InteractionResponseTypes.ChannelMessageWithSource,
          data: {
            content: pages[0],
            components: makePaginationComponents(0, pages.length),
          },
        }
      );

      // ★ 注意 ★
      // ここでは「ボタンの押下でページ切り替え」まで含めていません。
      // ボタンを動かすには messageId を取得して paginationMap に保存 → button で更新
      // のフローが必要です。
      // とりあえず「同じ下限/上限が大量に出る問題のない正しい計算ロジック」を示します。
    }
  };

  return command;
}

/**
 * 指定したイベントポイントを「ピッタリ」達成する(イベントボーナス, 炊き数, スコア下限/上限) を列挙
 */
function calculateScoreRanges(requiredPoints: number): string[] {
  // 格納用(重複排除のためSetを使う)
  const results = new Set<string>();

  for (let evPercent = 0; evPercent <= 435; evPercent++) {
    const evRate = floorToTwoDecimals(1 + evPercent / 100);

    for (const { consume, multiplier } of liveBonusTable) {
      for (let sb = 0; sb <= 150; sb++) {
        const ep = Math.floor((100 + sb) * evRate * multiplier);

        if (ep === requiredPoints) {
          const minScore = sb * 20000;
          const maxScore = sb * 20000 + 19999;
          if (maxScore > SCORE_MAX) continue;

          const line = `${evPercent}% | ${consume} | ${minScore.toLocaleString()} | ${maxScore.toLocaleString()}`;
          results.add(line);
        }
      }
    }
  }

  // 結果を炊き数・イベントボーナス% 順にソートしたい
  // 上でSetにしてしまったため、一旦配列化 → ソート
  const sorted = Array.from(results);
  sorted.sort((a, b) => {
    const [evA, cA] = extractEVandConsume(a);
    const [evB, cB] = extractEVandConsume(b);
    if (cA !== cB) return cA - cB;
    return evA - evB;
  });

  return sorted;
}

/**
 * "123% | 2 | ..." という文字列から イベントボーナス% と 炊き数 を取り出して数値にする
 */
function extractEVandConsume(line: string): [number, number] {
  // line 例: "120% | 2 | 400000 | 419999"
  const parts = line.split("|").map((p) => p.trim());
  const evPercentStr = parts[0].replace("%", "");
  const consumeStr = parts[1];
  const evNum = Number(evPercentStr);
  const csNum = Number(consumeStr);
  return [evNum, csNum];
}

function floorToTwoDecimals(value: number): number {
  return Math.floor(value * 100) / 100;
}

/**
 * 指定した配列を chunkSize ごとに分割
 */
function chunk<T>(arr: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * ページ切り替え用のボタンを作成（必要であれば）
 * ここでは簡易例。ページ切り替え本体は省略
 */
function makePaginationComponents(
  currentPage: number,
  totalPages: number
): ActionRow[] {
  const isFirstPage = currentPage <= 0;
  const isLastPage = currentPage >= totalPages - 1;

  const row: ActionRow = {
    type: MessageComponentTypes.ActionRow,
    components: [
      {
        type: MessageComponentTypes.Button,
        style: ButtonStyles.Primary,
        label: "◀ 前へ",
        customId: "calc:prev",
        disabled: isFirstPage,
      } as ButtonComponent,
      {
        type: MessageComponentTypes.Button,
        style: ButtonStyles.Primary,
        label: "次へ ▶",
        customId: "calc:next",
        disabled: isLastPage,
      } as ButtonComponent,
    ],
  };
  return [row];
}

/**
 * 単純にメッセージを返信する (全員に見える)
 */
async function sendReply(bot: Bot, interaction: Interaction, content: string) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: { content },
  });
}
