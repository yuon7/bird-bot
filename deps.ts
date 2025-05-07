// discordeno
export * from "https://deno.land/x/discordeno@18.0.1/mod.ts";

// dotenv
export * as dotenv from "https://deno.land/std@0.167.0/dotenv/mod.ts";
// dayjs
import dayjs from "https://cdn.skypack.dev/dayjs";
import utc from "https://cdn.skypack.dev/dayjs/plugin/utc";
import timezone from "https://cdn.skypack.dev/dayjs/plugin/timezone";

// decode for UTF8
export { decode as decodeUtf8 } from "https://deno.land/std@0.42.0/encoding/utf8.ts";

export { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

dayjs.extend(utc);
dayjs.extend(timezone);

export { dayjs };
