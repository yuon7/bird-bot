import {
  Bot,
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Interaction,
  InteractionResponseTypes,
} from "../deps.ts";

export function getCheckRoleCommand() {
  return {
    name: "checkrole",
    description: "指定したロールを持つメンバーの名前一覧を表示します",
    type: ApplicationCommandTypes.ChatInput,
    options: [
      {
        name: "role",
        description: "対象のロール",
        type: ApplicationCommandOptionTypes.Role,
        required: true,
      },
    ],
  };
}

export async function handleCheckRoleInteraction(
  bot: Bot,
  interaction: Interaction
) {
  if (!interaction.data || interaction.data.name !== "checkrole") return;

  const guildId = interaction.guildId;
  if (!guildId) {
    return respond(
      bot,
      interaction,
      "このコマンドはギルド内でのみ使用できます。"
    );
  }

  const roleOption = interaction.data.options?.find((o) => o.name === "role");
  if (!roleOption?.value) {
    return respond(bot, interaction, "ロールが指定されていません。");
  }

  const roleId = BigInt(roleOption.value as string);

  try {
    const members = await bot.helpers.getMembers(guildId, { limit: 1000 });

    const matchedMembers = members.filter((member) =>
      member.roles.includes(roleId)
    );

    const nameList = matchedMembers.map((m) => {
      const name =
        m.nick ?? m.user?.username ?? "Unknown";
      return `- ${name}`;
    });

    if (nameList.length === 0) {
      return respond(bot, interaction, "このロールを持つメンバーはいません。");
    }

    const content = [
      `**ロールID**: ${roleId.toString()}`,
      `**メンバー数**: ${nameList.length}`,
      "```",
      ...nameList,
      "```",
    ].join("\n");

    await bot.helpers.sendInteractionResponse(
      interaction.id,
      interaction.token,
      {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content,
        },
      }
    );
  } catch (err) {
    console.error("Failed to fetch role members:", err);
    return respond(
      bot,
      interaction,
      "メンバー取得に失敗しました。権限や環境を確認してください。"
    );
  }
}

async function respond(bot: Bot, interaction: Interaction, content: string) {
  await bot.helpers.sendInteractionResponse(interaction.id, interaction.token, {
    type: InteractionResponseTypes.ChannelMessageWithSource,
    data: { content },
  });
}
