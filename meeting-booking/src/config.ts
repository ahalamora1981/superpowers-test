// Temporary stub for Task 1. Full zod-validated version comes in Task 2.
export interface Config {
  port: number;
}

export function loadConfig(): Config {
  return { port: Number(process.env.PORT ?? 3000) };
}
