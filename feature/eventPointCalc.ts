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

/** イベントボーナス倍率リスト */
const eventBonusMultipliers = [
  1.73, 1.68, 1.67, 1.61, 1.6, 1.59, 1.5, 1.49, 0.11, 0.09, 0.08, 0.07, 0.06,
  0.05, 0.04, 0.03,
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

  for (const eventBonus of eventBonusMultipliers) {
    for (const { consume, multiplier } of liveBonusTable) {
      // 逆算してスコア範囲を求める
      const baseScore = (requiredPoints / (eventBonus * multiplier)) * 20000;

      // スコアボーナス = floor(スコア / 20000)
      const minScore = Math.ceil(baseScore);
      const maxScore = Math.floor(baseScore) + 19999;

      // スコアが制限範囲内であることを確認
      if (minScore < SCORE_MIN || maxScore > SCORE_MAX) {
        console.log(
          `条件外: 炊き数=${consume}, イベントボーナス=${eventBonus}, min=${minScore}, max=${maxScore}`
        );
        continue;
      }

      results.push({ consume, eventBonus, minScore, maxScore });
    }
  }

  // **イベントボーナス降順** → **炊き数昇順** にソート
  results.sort((a, b) => {
    if (b.eventBonus !== a.eventBonus) return b.eventBonus - a.eventBonus; // イベントボーナス降順
    return a.consume - b.consume; // 炊き数昇順
  });

  // デバッグ: 条件に合う結果があるか確認
  if (results.length === 0) {
    console.log("条件に合う組み合わせが見つかりませんでした。");
  }

  // 文字列としてフォーマット
  return results.map(
    ({ consume, eventBonus, minScore, maxScore }) =>
      `${(eventBonus * 100 - 100).toFixed(
        0
      )}%  | ${consume} | ${minScore.toLocaleString()} | ${maxScore.toLocaleString()}`
  );
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
 * ページング用に "◀ 前へ" "次へ ▶" ボタンを作成する
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

/**
 * インタラクションに対してレスポンスを送信
 */
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
