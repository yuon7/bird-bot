import {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
  InteractionResponseTypes,
  MessageComponentTypes,
  ButtonStyles,
  Message,
  ActionRow,
  ButtonComponent,
} from "../deps.ts";

const SCORE_MAX = 3_000_000;

/** 炊き数→ライブボーナスのテーブル */
const liveBonusTable = [
  { consume: 0, multiplier: 1 },
  { consume: 1, multiplier: 5 },
  { consume: 2, multiplier: 10 },
  { consume: 3, multiplier: 15 },
];

/** ページデータを保持する型 */
interface CalcPaginationData {
  pages: string[];
  currentPage: number;
}

/** メッセージIDをキーにしたページングデータのマップ */
export const calcPaginationMap = new Map<bigint, CalcPaginationData>();
/** interaction.id をキーにした一時保存マップ */
export const calcTemporaryMap = new Map<bigint, { pages: string[] }>();

//calc コマンド定義オブジェクトを返す

export function getCalcCommand(): CreateSlashApplicationCommand {
  return {
    name: "calc",
    description:
      "指定したイベントポイントを稼ぐためのスコア範囲を計算(ページング付き)",
    options: [
      {
        name: "required_points",
        description: "目標のイベントポイント数 (例: 30000)",
        type: 4,
        required: true,
      },
    ],
  };
}

/**
 * /calc の実処理（interactionCreate から呼び出す）
 */
export async function handleCalcInteraction(
  bot: Bot,
  interaction: Interaction
) {
  if (interaction.data?.name !== "calc") return; // このコマンドでなければ無視

  // required_pointsオプション取得
  const requiredPointsOpt = interaction.data.options?.find(
    (o) => o.name === "required_points"
  );
  if (!requiredPointsOpt) {
    return respond(bot, interaction, "必要ポイントが指定されていません。");
  }
  const requiredPoints = Number(requiredPointsOpt.value) || 0;

  // ページ文字列一覧を生成
  const pages = calculateScoreRanges(requiredPoints);
  if (pages.length === 0) {
    return respond(bot, interaction, "条件に合う結果がありませんでした。");
  }

  // 一時マップに保存し、最初のページを返信
  calcTemporaryMap.set(interaction.id, { pages });

  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: {
      content: pages[0],
      components: makePaginationComponents(0, pages.length),
    },
  });
}

//*ボタン操作 (calc:prev / calc:next) のハンドリング
export async function handleCalcButton(bot: Bot, interaction: Interaction) {
  // カスタムID判定
  const btnId = interaction.data?.customId;
  if (btnId !== "calc:prev" && btnId !== "calc:next") return;

  // メッセージID からページデータを取得
  const messageId = interaction.message?.id;
  if (!messageId) return;

  const pageData = calcPaginationMap.get(messageId);
  if (!pageData) return;

  let { currentPage, pages } = pageData;
  if (btnId === "calc:prev") {
    currentPage = Math.max(0, currentPage - 1);
  } else {
    currentPage = Math.min(pages.length - 1, currentPage + 1);
  }

  // 更新してメッセージを編集
  calcPaginationMap.set(messageId, { pages, currentPage });
  await bot.helpers.editMessage(interaction.channelId!, messageId, {
    content: pages[currentPage],
    components: makePaginationComponents(currentPage, pages.length),
  });

  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.UpdateMessage,
  });
}

/**
 * messageCreate でメッセージが投稿された際、どのコマンド由来か確認し、calcPaginationMap に登録する
 */
export function handleCalcMessage(_bot: Bot, msg: Message) {
  const interId = msg.interaction?.id;
  if (!interId) return;

  // 一時マップから取り出し
  const pending = calcTemporaryMap.get(interId);
  if (!pending) return;

  // メッセージIDをキーにページング情報保存
  calcPaginationMap.set(msg.id, {
    pages: pending.pages,
    currentPage: 0,
  });

  // 一時データ削除
  calcTemporaryMap.delete(interId);
}

// 内部ロジック
function calculateScoreRanges(requiredPoints: number): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();

  for (let x = 0; x <= 150; x++) {
    const minScore = 20000 * x;
    const maxScore = minScore + 19999;
    if (maxScore < 0 || minScore > SCORE_MAX) continue;

    for (const { consume, multiplier } of liveBonusTable) {
      const denom = (100 + x) * multiplier;
      if (denom === 0) continue;

      const eventBonusRate = requiredPoints / denom;
      const bonusPctFloat = (eventBonusRate - 1) * 100;
      const bonusPct = Math.round(bonusPctFloat);
      if (bonusPct < 0 || bonusPct > 435) continue;

      const row = `${bonusPct}% | ${consume} | ${minScore.toLocaleString()} | ${maxScore.toLocaleString()}`;
      if (!seen.has(row)) {
        seen.add(row);
        lines.push(row);
      }
    }
  }
  // ソート
  lines.sort((a, b) => {
    const [pctA, conA] = parseRow(a);
    const [pctB, conB] = parseRow(b);
    return conA !== conB ? conA - conB : pctA - pctB;
  });

  // 8行ずつ分割し、ページ文字列を組み立て
  const chunked = chunkLines(lines, 8);
  const pages = chunked.map((chunk, index) => {
    return `**必要PT**: ${requiredPoints} | Page ${index + 1}/${
      chunked.length
    }\n\n\`\`\`
ボーナス% | 炊き数 | スコア下限 | スコア上限
${chunk.join("\n")}
\`\`\``;
  });
  return pages;
}

function parseRow(row: string): [number, number] {
  const [pctStr, consumeStr] = row.split("|").map((s) => s.trim());
  return [Number(pctStr.replace("%", "")), Number(consumeStr)];
}

function chunkLines(lines: string[], chunkSize: number): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    pages.push(lines.slice(i, i + chunkSize));
  }
  return pages;
}

function makePaginationComponents(
  currentPage: number,
  totalPages: number
): ActionRow[] {
  return [
    {
      type: MessageComponentTypes.ActionRow,
      components: [
        {
          type: MessageComponentTypes.Button,
          style: ButtonStyles.Primary,
          label: "◀ 前へ",
          customId: "calc:prev",
          disabled: currentPage <= 0,
        } as ButtonComponent,
        {
          type: MessageComponentTypes.Button,
          style: ButtonStyles.Primary,
          label: "次へ ▶",
          customId: "calc:next",
          disabled: currentPage >= totalPages - 1,
        } as ButtonComponent,
      ],
    },
  ];
}

async function respond(bot: Bot, interaction: Interaction, content: string) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: { content },
  });
}
