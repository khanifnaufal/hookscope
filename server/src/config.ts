import 'dotenv/config';

export const config = {
  get port() {
    return parseInt(process.env.PORT ?? '3000', 10);
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? 'file:./data/local.db';
  },
  get tursoAuthToken() {
    return process.env.TURSO_AUTH_TOKEN;
  },
  get publicBaseUrl() {
    return process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  },
  get endpointTtlDays() {
    return parseInt(process.env.ENDPOINT_TTL_DAYS ?? '7', 10);
  },
} as const;
