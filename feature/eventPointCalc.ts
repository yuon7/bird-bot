import {
  Bot,
  ButtonComponent,
  ButtonStyles,
  MessageComponentTypes,
  ActionRow,
  CreateSlashApplicationCommand,
  Interaction,
  InteractionResponseTypes,
} from "../deps.ts";

/**
 * ページネーション用のメッセージIDとデータのマップ
 */
interface CalcPaginationData {
  pages: string[];
  currentPage: number;
}

// const paginationMap = new Map<bigint, CalcPaginationData>();

/** 炊き数 → 倍率のテーブル (炊き数 0 ~ 3 のみ) */
const liveBonusTable = [
  { consume: 0, multiplier: 1 },
  { consume: 1, multiplier: 5 },
  { consume: 2, multiplier: 10 },
  { consume: 3, multiplier: 15 },
];
/** スコアの制限範囲 */
const SCORE_MIN = 0;
const SCORE_MAX = 3_000_000;

/**
 * /calc コマンドを設定
 */
export function setupCalcCommand(bot: Bot): CreateSlashApplicationCommand {
  const command: CreateSlashApplicationCommand = {
    name: "calc",
    description: "指定したイベントポイントを稼ぐためのスコア範囲を計算します",
    options: [
      {
        name: "required_points",
        description: "目標のイベントポイント数 (例: 600)",
        type: 4, // INTEGER
        required: true,
      },
    ],
  };

  bot.events.interactionCreate = async (b, interaction: Interaction) => {
    if (!interaction.data || interaction.data.name !== "calc") return;

    const requiredPointsOpt = interaction.data.options?.find(
      (o) => o.name === "required_points"
    );
    if (!requiredPointsOpt) {
      return sendInteractionResponse(b, interaction, {
        content: "必要ポイントが指定されていません。",
      });
    }
    const requiredPoints = Number(requiredPointsOpt.value) || 0;

    // 計算を実行
    const results: string[] = calculateScoreRanges(requiredPoints);

    // 1ページ8行ずつに分割
    const pages = chunkLines(results, 8).map((lines, idx) => {
      return [
        `**必要PT**: ${requiredPoints} | Page ${idx + 1}/${Math.ceil(
          results.length / 8
        )}`,
        "```",
        "イベントボーナス | 炊き数 | スコア下限 | スコア上限",
        ...lines,
        "```",
      ].join("\n");
    });

    if (pages.length === 0) {
      return sendInteractionResponse(b, interaction, {
        content: "条件に合う結果がありませんでした。",
      });
    }

    await b.helpers.sendInteractionResponse(interaction.id, interaction.token, {
      type: InteractionResponseTypes.ChannelMessageWithSource,
      data: {
        content: pages[0],
        components: makePaginationComponents(0, pages.length),
      },
    });
  };

  return command;
}

/**
 * 必要ポイントに基づいてスコア範囲を計算
 */
function calculateScoreRanges(requiredPoints: number): string[] {
  const results: {
    consume: number;
    eventBonus: number;
    minScore: number;
    maxScore: number;
  }[] = [];

  // イベントボーナス倍率リスト（整数のみ、0% ~ 435%）
  const eventBonusMultipliers = Array.from(
    { length: 436 },
    (_, i) => (100 + i) / 100
  );

  for (const { consume, multiplier } of liveBonusTable) {
    for (const eventBonus of eventBonusMultipliers) {
      // **正しくスコアボーナスを算出**
      const score = requiredPoints / (eventBonus * multiplier) - 100;
      const scoreBonus = Math.floor(score); // スコアボーナスを整数化

      // **スコア範囲の計算**
      const minScore = scoreBonus * 20000;
      const maxScore = minScore + 19999;

      // スコアが制限範囲内であることを確認
      if (minScore < SCORE_MIN || maxScore > SCORE_MAX) continue;

      results.push({ consume, eventBonus, minScore, maxScore });

      // **デバッグ出力**
      console.log(
        `イベP=${requiredPoints}, イベントボーナス=${(
          eventBonus * 100 -
          100
        ).toFixed(0)}%, ` +
          `炊き数=${consume}, スコアボーナス=${scoreBonus}, ` +
          `minScore=${minScore}, maxScore=${maxScore}`
      );
    }
  }

  // 🔹 **炊き数単位でグルーピング → イベントボーナス昇順**
  results.sort((a, b) => {
    if (a.consume !== b.consume) return a.consume - b.consume; // 炊き数昇順
    return a.eventBonus - b.eventBonus; // イベントボーナス昇順
  });

  // 文字列としてフォーマット（グルーピングのため改行を挟む）
  let output: string[] = [];
  let currentConsume = -1;

  for (const { consume, eventBonus, minScore, maxScore } of results) {
    if (consume !== currentConsume) {
      if (currentConsume !== -1) output.push("---"); // グルーピング用の区切り
      currentConsume = consume;
    }
    output.push(
      `${(eventBonus * 100 - 100).toFixed(
        0
      )}%  | ${consume} | ${minScore.toLocaleString()} | ${maxScore.toLocaleString()}`
    );
  }

  return output;
}

/**
 * 行配列を指定した数ずつに分割する
 */
function chunkLines(lines: string[], chunkSize: number): string[][] {
  const chunked: string[][] = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    chunked.push(lines.slice(i, i + chunkSize));
  }
  return chunked;
}

/**
 * ページング用に "◀ 前へ" "次へ ▶" ボタン
 */
function makePaginationComponents(
  currentPage: number,
  totalPages: number
): ActionRow[] {
  const isFirstPage = currentPage <= 0;
  const isLastPage = currentPage >= totalPages - 1;

  return [
    {
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
    } as ActionRow,
  ];
}

async function sendInteractionResponse(
  bot: Bot,
  interaction: Interaction,
  options: { content: string }
) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: { content: options.content },
  });
}
