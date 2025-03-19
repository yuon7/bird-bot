import {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
  InteractionResponseTypes,
  ButtonStyles,
  MessageComponentTypes,
  ActionRow,
  ButtonComponent,
} from "../deps.ts";

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
        description: "目標のイベントポイント数 (例: 30000)",
        type: 4, // INTEGER
        required: true,
      },
    ],
  };

  // 1つの interactionCreate で Slash コマンド & ボタンを振り分けする例
  bot.events.interactionCreate = async (b, interaction) => {
    // --------------------------------------------------
    // A) /calc コマンドが呼ばれたとき
    // --------------------------------------------------
    if (interaction.data?.name === "calc") {
      const requiredPointsOpt = interaction.data.options?.find(
        (o) => o.name === "required_points"
      );
      if (!requiredPointsOpt) {
        return reply(b, interaction, "必要ポイントが指定されていません。");
      }

      const requiredPoints = Number(requiredPointsOpt.value) || 0;

      // 計算を実行
      const results = calculateScoreRanges(requiredPoints);

      // 1ページ8行ずつに分割
      const pages = chunkLines(results, 8).map((lines, idx) => {
        return [
          `**必要PT**: ${requiredPoints} | Page ${idx + 1}/${Math.ceil(
            results.length / 8
          )}`,
          "```",
          "イベントボーナス% | 炊き数 | スコア下限 | スコア上限",
          ...lines,
          "```",
        ].join("\n");
      });

      if (pages.length === 0) {
        return reply(b, interaction, "条件に合う結果がありませんでした。");
      }

      // 最初のページを返信 (全員に見える)
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

      // ここで「このメッセージID と pages[] を紐づけ」たいが
      // Discordeno では sendInteractionResponse の戻り値がないので
      // messageCreate イベントで message.interaction.id === interaction.id を頼りに
      // 取得するか、followUpでメッセージを作るなど工夫が必要。
      return;
    }

    // --------------------------------------------------
    // B) ページング用の「前/次ボタン」が押されたとき
    // (サンプル: 省略 or 別途実装)
    // --------------------------------------------------
    if (interaction.data?.componentType === MessageComponentTypes.Button) {
      // customId で判定 → "calc:prev", "calc:next" など
      // ページ切り替えロジックを行い、editMessage して response type=7(UpdateMessage)
      return;
    }
  };

  return command;
}

/**
 * 必要ポイントに基づいてスコア範囲を列挙する
 * - イベントボーナス 0%~435% (合計436通り)
 * - ライブボーナス (炊き数0~3)
 * - 各組み合わせで「(100 + x) * eventBonusRate * liveBonus = requiredPoints」を満たす x を計算し、
 *   floor(score/20000) = x のスコア範囲 [20000x, 20000x+19999] を求める
 * - 0<=minScore<=maxScore<=3000000 の範囲のみ採用
 * - 同じ [minScore..maxScore] がすでに出ている場合は重複スキップ
 */
/**
 * 必要ポイントから「イベントボーナス%, 炊き数, スコア範囲(下限～上限)」を導く
 * 方針: scoreBonus=x(0～150), liveBonusTable(炊き数)を走査し、
 *       eventBonus%を逆算して 0～435の整数なら出力行に加える
 */
function calculateScoreRanges(requiredPoints: number): string[] {
  // 炊き数→ライブボーナス
  const liveBonusTable = [
    { consume: 0, multiplier: 1 },
    { consume: 1, multiplier: 5 },
    { consume: 2, multiplier: 10 },
    { consume: 3, multiplier: 15 },
    // 必要なら4～10炊き などを追加
  ];

  const SCORE_MIN = 0;
  const SCORE_MAX = 3_000_000;

  const lines: string[] = [];
  const seen = new Set<string>(); // 重複排除用

  // scoreBonus = x
  for (let x = 0; x <= 150; x++) {
    // スコア区間
    const minScore = 20000 * x;
    const maxScore = minScore + 19999;
    if (maxScore < SCORE_MIN || minScore > SCORE_MAX) {
      continue;
    }

    for (const { consume, multiplier } of liveBonusTable) {
      if (multiplier === 0) continue; // 安全チェック

      // requiredPoints = (100 + x)* eventBonusRate * multiplier
      // => eventBonusRate = requiredPoints / ((100 + x)* multiplier)
      const denom = (100 + x) * multiplier;
      if (denom === 0) continue; // x=-100相当とかはあり得ないが一応

      const eventBonusRate = requiredPoints / denom;
      // eventBonus% = (eventBonusRate -1)*100
      const bonusPctFloat = (eventBonusRate - 1) * 100;

      // 四捨五入でイベントボーナス%を整数化(例: 99.6→100)
      // あるいは切り捨て/切り上げなど好みに合わせて
      const bonusPct = Math.round(bonusPctFloat);

      // 0%～435% の範囲内か？
      if (bonusPct < 0 || bonusPct > 435) continue;

      // 逆に「再計算」して、誤差があまり大きくないか確認する (任意)
      //   let checkRate = 1 + bonusPct/100;
      //   let checkPoints = (100 + x)* checkRate* multiplier;
      //   if (Math.abs(checkPoints - requiredPoints)> ??? ) continue;

      // 出力用文字列
      const row = `${bonusPct}% | ${consume} | ${minScore.toLocaleString()} | ${maxScore.toLocaleString()}`;
      if (seen.has(row)) {
        // 重複行は表示しない
        continue;
      }
      seen.add(row);

      lines.push(row);
    }
  }

  // 見やすいよう sort (例: 炊き数, イベントボーナス% で降順 or 昇順)
  lines.sort((a, b) => {
    // "0% | 0 | 0 | 19999" などの文字列を分割して比較するなど
    const [pctA, conA] = parseRow(a);
    const [pctB, conB] = parseRow(b);
    // 1. 炊き数で昇順
    if (conA !== conB) return conA - conB;
    // 2. イベントボーナス% で昇順
    return pctA - pctB;
  });

  return lines;
}

// ヘルパー: "0% | 1 | 400,000 | 419,999" から bonusPct, consume を抽出
function parseRow(row: string): [number, number] {
  // "0% | 1 | 400,000 | 419,999"
  const [pctPart, consumePart] = row.split("|").map((s) => s.trim());
  // pctPart="0%", consumePart="1"
  const pct = Number(pctPart.replace("%", ""));
  const con = Number(consumePart);
  return [pct, con];
}

/**
 * 8行ずつ分割
 */
function chunkLines(lines: string[], chunkSize: number): string[][] {
  const result: string[][] = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    result.push(lines.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * 前/次ボタン生成 (例: ページング用。省略可)
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
 * シンプルにメッセージを返信する (全員に見える)
 */
async function reply(bot: Bot, interaction: Interaction, content: string) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: {
      content,
    },
  });
}
