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
};
