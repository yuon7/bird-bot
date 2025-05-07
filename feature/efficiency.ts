import {
  Bot,
  CreateSlashApplicationCommand,
  Interaction,
  InteractionResponseTypes,
  ApplicationCommandOptionChoice,
  InteractionTypes,
  decodeUtf8,
} from "../deps.ts";

// ─────────────────────────────────────────
// ① JSON を 1 度だけ読み込んでメモリに保持
// ─────────────────────────────────────────
const MUSIC_DB: {
  id: number;
  title: string;
  pronunciation: string;
  assetbundleName: string;
  priority: string[];
}[] = JSON.parse(decodeUtf8(await Deno.readFile("./musicDifficulty.json")));

// タイトル・読みを lowerCase で索引化（高速化用）
const TITLE_MAP = new Map<string, (typeof MUSIC_DB)[number]>(
  MUSIC_DB.map((e) => [e.title.toLowerCase(), e])
);
const PRON_MAP = new Map<string, (typeof MUSIC_DB)[number]>(
  MUSIC_DB.map((e) => [e.pronunciation.toLowerCase(), e])
);

// ─────────────────────────────────────────
// ② Slash コマンド定義
// ─────────────────────────────────────────
export function getEfficiencyCommand(): CreateSlashApplicationCommand {
  return {
    name: "efficiency",
    description: "楽曲名から効率難易度＆ジャケット画像を表示します",
    options: [
      {
        name: "title",
        description: "楽曲名（日本語 / ローマ字 どちらでも可）",
        type: 3, // STRING
        required: true,
        autocomplete: true, // オートコンプリート機能を有効化
      },
    ],
  };
}

// ─────────────────────────────────────────
// ③ コマンド実行時処理
// ─────────────────────────────────────────
export async function handleEfficiencyInteraction(
  bot: Bot,
  interaction: Interaction
) {
  // Autocompleteインタラクションの場合
  if (interaction.type === InteractionTypes.ApplicationCommandAutocomplete) {
    return handleEfficiencyAutocomplete(bot, interaction);
  }

  // 通常のコマンド実行の場合
  if (!interaction.data || interaction.data.name !== "efficiency") return;

  const titleOpt = interaction.data.options?.find((o) => o.name === "title");
  const rawTitle = (titleOpt?.value as string | undefined)?.trim() ?? "";
  if (!rawTitle) {
    return respond(bot, interaction, "楽曲名が指定されていません。", true);
  }

  const key = rawTitle.toLowerCase();

  // タイトル or 読み で検索
  let song = TITLE_MAP.get(key);
  if (!song) song = PRON_MAP.get(key);

  if (!song) {
    return respond(
      bot,
      interaction,
      `**${rawTitle}** が見つかりませんでした。`,
      true
    );
  }

  const imgUrl = `https://storage.sekai.best/sekai-jp-assets/music/jacket/${song.assetbundleName}/${song.assetbundleName}.webp`;

  const difficulty = song.priority?.[0] ?? "情報なし";

  // embed 付きで返信
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: {
      embeds: [
        {
          title: song.title,
          description: `**効率難易度** : ${difficulty}`,
          image: { url: imgUrl },
        },
      ],
    },
  });
}

// ─────────────────────────────────────────
// ④ オートコンプリートの処理
// ─────────────────────────────────────────
async function handleEfficiencyAutocomplete(
  bot: Bot,
  interaction: Interaction
) {
  if (!interaction.data || interaction.data.name !== "efficiency") return;

  // 入力中のテキストを取得
  const focusedOption = interaction.data.options?.find(
    (option) => option.focused
  );

  if (!focusedOption || focusedOption.name !== "title") return;

  const inputValue = (focusedOption.value as string || "").toLowerCase();

  if (!inputValue) {
    // 入力がない場合は人気曲など上位5曲を表示
    const topChoices = MUSIC_DB.slice(0, 5).map(song => ({
      name: song.title,
      value: song.title
    }));

    return bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
      type: InteractionResponseTypes.ApplicationCommandAutocompleteResult,
      data: {
        choices: topChoices,
      },
    });
  }

  // 曲名と読みのどちらかで部分一致検索
  const matchingSongs = MUSIC_DB.filter(
    song =>
      song.title.toLowerCase().includes(inputValue) ||
      song.pronunciation.toLowerCase().includes(inputValue)
  );

  // 最大25個まで選択肢を返す (Discord API制限)
  const choices: ApplicationCommandOptionChoice[] = matchingSongs
    .slice(0, 25)
    .map(song => ({
      name: song.title,
      value: song.title,
    }));

  // 選択肢が見つからない場合
  if (choices.length === 0) {
    return bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
      type: InteractionResponseTypes.ApplicationCommandAutocompleteResult,
      data: {
        choices: [{ name: "一致する曲が見つかりません", value: inputValue }],
      },
    });
  }

  // オートコンプリートの結果を返信
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ApplicationCommandAutocompleteResult,
    data: {
      choices,
    },
  });
}

// ─────────────────────────────────────────
// ⑤ 汎用レスポンス（エフェメラル可）
// ─────────────────────────────────────────
async function respond(
  bot: Bot,
  interaction: Interaction,
  content: string,
  ephemeral = false
) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: {
      content,
      ...(ephemeral ? { flags: 64 } : {}),
    },
  });
}
