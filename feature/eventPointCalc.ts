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

const liveBonusTable = [
  { consume: 0, multiplier: 1 },
  { consume: 1, multiplier: 5 },
  { consume: 2, multiplier: 10 },
  { consume: 3, multiplier: 15 },
];

// Define the CalcPaginationData type
interface CalcPaginationData {
  pages: string[];
  currentPage: number;
}

const paginationMap = new Map<bigint, CalcPaginationData>();
const temporaryMap = new Map<bigint, { pages: string[] }>();

export function setupCalcCommand(bot: Bot): CreateSlashApplicationCommand {
  const command: CreateSlashApplicationCommand = {
    name: "calc",
    description:
      "指定したイベントポイントを稼ぐためのスコア範囲を計算(ページング付き)",
    options: [
      {
        name: "required_points",
        description: "目標のイベントポイント数 (例: 30000)",
        type: 4, // INTEGER
        required: true,
      },
    ],
  };

  bot.events.interactionCreate = async (b, interaction: Interaction) => {
    if (interaction.data?.name === "calc") {
      const requiredPointsOpt = interaction.data.options?.find(
        (o) => o.name === "required_points"
      );
      if (!requiredPointsOpt)
        return respond(b, interaction, "必要ポイントが指定されていません。");
      const requiredPoints = Number(requiredPointsOpt.value) || 0;
      const pages = calculateScoreRanges(requiredPoints);
      if (pages.length === 0)
        return respond(b, interaction, "条件に合う結果がありませんでした。");

      temporaryMap.set(interaction.id, { pages });
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
      return;
    }

    if (interaction.data?.componentType === MessageComponentTypes.Button) {
      const btnId = interaction.data.customId;
      if (btnId !== "calc:prev" && btnId !== "calc:next") return;
      const messageId = interaction.message?.id;
      if (!messageId) return;

      const pageData = paginationMap.get(messageId);
      if (!pageData) return;

      let { currentPage, pages } = pageData;
      currentPage =
        btnId === "calc:prev"
          ? Math.max(0, currentPage - 1)
          : Math.min(pages.length - 1, currentPage + 1);
      paginationMap.set(messageId, { pages, currentPage });

      await b.helpers.editMessage(interaction.channelId!, messageId, {
        content: pages[currentPage],
        components: makePaginationComponents(currentPage, pages.length),
      });

      await b.helpers.sendInteractionResponse(
        interaction.id,
        interaction.token,
        {
          type: InteractionResponseTypes.UpdateMessage,
        }
      );
      return;
    }
  };

  bot.events.messageCreate = (_b, msg: Message) => {
    const interId = msg.interaction?.id;
    if (!interId) return;

    const pending = temporaryMap.get(interId);
    if (!pending) return;

    paginationMap.set(msg.id, { pages: pending.pages, currentPage: 0 });
    temporaryMap.delete(interId);
  };

  return command;
}

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
  lines.sort((a, b) => {
    const [pctA, conA] = parseRow(a);
    const [pctB, conB] = parseRow(b);
    return conA !== conB ? conA - conB : pctA - pctB;
  });
  return chunkLines(lines, 8).map((chunk, index) => {
    return `**必要PT**: ${requiredPoints} | Page ${index + 1}/${Math.ceil(
      lines.length / 8
    )}\n\n\`\`\`
イベントボーナス% | 炊き数 | スコア下限 | スコア上限
${chunk.join("\n")}
\`\`\``;
  });
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

async function respond(b: Bot, interaction: Interaction, content: string) {
  await b.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: { content },
  });
}
