export type Snapshot<T> = {
  data: T;
  loadedAt: string;
};

export function snapshot<T>(data: T): Snapshot<T> {
  return { data, loadedAt: new Date().toISOString() };
}
