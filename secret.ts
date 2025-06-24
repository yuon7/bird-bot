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
  PORT: parseInt(Deno.env.get("PORT") || "8000"),
  DEPLOY_URL: Deno.env.get("DEPLOY_URL"),
  SPREADSHEET_ID: Deno.env.get("SPREADSHEET_ID")!,
  MUSIC_INFO_URL: Deno.env.get("MUSIC_INFO_URL") !,
  MUSIC_TAG_URL: Deno.env.get("MUSIC_TAG_URL") !,
};
