export interface MusicInfo {
  id: number;
  title: string;
  pronunciation: string;
  assetbundleName: string;
}
export interface MusicTag {
  musicId: number;
  musicTag: string;
}
export interface EfficiencyRow {
  title: string;
  compromise: string;
  priority: string;
  encore: string;
}
export interface MusicDifficulty {
  id: number;
  title: string;
  pronunciation: string;
  assetbundleName: string;
  musicTag: string[];
  compromise: string[];
  priority: string[];
  encore: string[];
}
interface GoogleSheetCell{
  v?: string;
}
export interface GoogleSheetRow {
  c: (GoogleSheetCell | null)[];
}
