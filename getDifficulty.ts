import { Secret } from "./secret.ts";
import {
  MusicInfo,
  MusicTag,
  EfficiencyRow,
  MusicDifficulty,
  GoogleSheetRow,
} from "./type.ts";

const MUSIC_INFO_URL = Secret.MUSIC_INFO_URL;
const MUSIC_TAGS_URL = Secret.MUSIC_TAG_URL;
const SPREADSHEET_ID = Secret.SPREADSHEET_ID;
const SHEET_NAME = "効率表";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.json();
}
async function fetchEfficiency(): Promise<EfficiencyRow[]> {
  const sheetParam = encodeURIComponent(SHEET_NAME);
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${sheetParam}&range=B1:F`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const text = await res.text();
  const m = text.match(/setResponse\(([\s\S]+?)\);/);
  if (!m) throw new Error("Unexpected sheet format");
  const data = JSON.parse(m[1]);
  const rows: GoogleSheetRow[] = data.table.rows.slice(1);
  return rows.map((r) => {
    const c = r.c;
    return {
      title: c[0]?.v ?? "",
      compromise: c[1]?.v ?? "",
      priority: c[2]?.v ?? "",
      encore: c[4]?.v ?? "",
    };
  });
}

function normalize(s: string): string {
  return s.normalize("NFKC").trim().toLowerCase();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

async function main() {
  const [musics, tags, sheetRows] = await Promise.all([
    fetchJson<MusicInfo[]>(MUSIC_INFO_URL),
    fetchJson<MusicTag[]>(MUSIC_TAGS_URL),
    fetchEfficiency(),
  ]);

  const tagMap = new Map<number, string[]>();
  tags.forEach((t) => {
    const arr = tagMap.get(t.musicId) ?? [];
    arr.push(t.musicTag);
    tagMap.set(t.musicId, arr);
  });

  const sheetMap = new Map<string, EfficiencyRow>();
  sheetRows.forEach((r) => sheetMap.set(r.title, r));
  const sheetKeys = Array.from(sheetMap.keys());

  let existing: MusicDifficulty[] = [];
  try {
    const txt = await Deno.readTextFile("./musicDifficulty.json");
    existing = JSON.parse(txt);
  } catch {
    existing = [];
  }

  const existingMap = new Map<string, MusicDifficulty>();
  existing.forEach((e) => existingMap.set(e.title, e));

  let missingBefore = 0;
  let missingAfter = 0;

  const merged = musics.map((m) => {
    const base: MusicDifficulty = {
      id: m.id,
      title: m.title,
      pronunciation: m.pronunciation,
      assetbundleName: m.assetbundleName,
      musicTag: tagMap.get(m.id) ?? [],
      compromise: [],
      priority: [],
      encore: [],
    };

    const prev = existingMap.get(m.title);
    if (prev) {
      base.compromise = prev.compromise;
      base.priority = prev.priority;
      base.encore = prev.encore;
      if (prev.compromise.length === 0) missingBefore++;
    }

    if (base.compromise.length === 0) {
      let eff: EfficiencyRow | undefined = sheetMap.get(m.title);
      if (!eff) {
        const n = normalize(m.title);
        const key2 = sheetKeys.find((k) => normalize(k) === n);
        if (key2) eff = sheetMap.get(key2);
      }
      if (!eff) {
        let bestKey = "",
          bestSim = 0;
        sheetKeys.forEach((k) => {
          const a = normalize(m.title),
            b = normalize(k);
          const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
          if (sim > bestSim) {
            bestSim = sim;
            bestKey = k;
          }
        });
        if (bestSim >= 0.8) eff = sheetMap.get(bestKey);
      }

      if (eff) {
        base.compromise = [eff.compromise];
        base.priority = [eff.priority];
        base.encore = [eff.encore];
      } else {
        missingAfter++;
        console.log(`未登録のまま: ${m.title}`);
      }
    }

    return base;
  });

  await Deno.writeTextFile(
    "./musicDifficulty.json",
    JSON.stringify(merged, null, 2)
  );

  console.log(`\n✔ 更新完了
  - 更新対象となった空コンプライス数: ${missingBefore}
  - 更新後も未登録残存数: ${missingAfter}`);
}

main().catch((err) => {
  console.error(err);
});
