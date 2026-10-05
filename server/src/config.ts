import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./data/local.db',
  tursoAuthToken: process.env.TURSO_AUTH_TOKEN,
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  endpointTtlDays: parseInt(process.env.ENDPOINT_TTL_DAYS ?? '7', 10),
} as const;
