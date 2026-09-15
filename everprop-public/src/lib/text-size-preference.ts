export type PanelTextSize = "actual" | "grande";
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export const TEXT_SIZE_EVENT = "bellomo:text-size-change";
export const textSizeKey = (userId: string) => `bellomo:panel:text-size:v1:${encodeURIComponent(userId)}`;
export const parseTextSize = (value: string | null): PanelTextSize => value === "grande" ? "grande" : "actual";

// Keep the control usable for the current session when browser storage is blocked.
export function createTextSizePreferences(storage: () => StorageAccess) {
  const temporary = new Map<string, PanelTextSize>();
  return {
    read(userId: string): PanelTextSize {
      const key = textSizeKey(userId);
      if (temporary.has(key)) return temporary.get(key)!;
      try { return parseTextSize(storage().getItem(key)); }
      catch { return "actual"; }
    },
    write(userId: string, size: PanelTextSize): boolean {
      const key = textSizeKey(userId);
      try {
        storage().setItem(key, size);
        temporary.delete(key);
        return true;
      } catch {
        temporary.set(key, size);
        return false;
      }
    },
    clearTemporary(userId: string) { temporary.delete(textSizeKey(userId)); },
  };
}
