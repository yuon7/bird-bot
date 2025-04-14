// discordeno
export * from "https://deno.land/x/discordeno@18.0.1/mod.ts";

// dotenv
export * as dotenv from "https://deno.land/std@0.167.0/dotenv/mod.ts";
// dayjs
import dayjs from "https://cdn.skypack.dev/dayjs";
import utc from "https://cdn.skypack.dev/dayjs/plugin/utc";
import timezone from "https://cdn.skypack.dev/dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };
