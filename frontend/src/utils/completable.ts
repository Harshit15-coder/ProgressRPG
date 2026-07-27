export interface Completable {
  is_complete?: boolean;
  completed_at?: string | null;
}

export function isCompletable(item: Completable): boolean {
  return Boolean(item?.completed_at ?? item?.is_complete);
}
