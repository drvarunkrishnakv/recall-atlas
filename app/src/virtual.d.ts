declare module "virtual:atlas-content" {
  export const notes: Array<Record<string, unknown> & { id: string; body: string }>;
  export const cards: Array<Record<string, unknown> & { id: string; body: string }>;
}
