import { dotenv } from "./deps.ts";

try {
  dotenv.configSync({
    export: true,
    path: "./.env.local",
  });
} catch {
  console.log("No .env.local file found");
}

export const Secret = {
  DISCORD_TOKEN: Deno.env.get("DISCORD_TOKEN")!,
  GITHUB_ACCESS_TOKEN: Deno.env.get("GITHUB_ACCESS_TOKEN")!,
  GUILD_ID: Deno.env.get("GUILD_ID")!,
  CHANNEL_ID: Deno.env.get("CHANNEL_ID")!,
  ROLE_ID: Deno.env.get("ROLE_ID")!,
  USER_ID: Deno.env.get("USER_ID")!,
};
