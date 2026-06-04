import dotenv from 'dotenv'
dotenv.config()

import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().default('file:./data/app.db'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  WORKSPACES_ROOT: z.string().default('./data/workspaces'),

  OPENCODE_BASE_URL: z.string().url().default('http://127.0.0.1:4096'),
  OPENCODE_SERVER_USERNAME: z.string().default('opencode'),
  OPENCODE_SERVER_PASSWORD: z.string().min(1, 'OPENCODE_SERVER_PASSWORD is required'),

  ALLOW_LOCAL_OPENCODE_FALLBACK: z
    .enum(['true', 'false'])
    .transform(v => v === 'true')
    .default('false'),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_PROXY: z.string().optional(),
  STT_API_URL: z.string().optional(),
  STT_API_KEY: z.string().optional(),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DEFAULT_TIMEZONE: z.string().default('Europe/Vilnius'),
  DAILY_QUOTA_LIMIT: z.coerce.number().default(20),
  WELCOME_QUOTA: z.coerce.number().default(30),

  MAX_FILE_SIZE_BYTES: z.coerce.number().default(52428800),
  MAX_USER_STORAGE_BYTES: z.coerce.number().default(524288000),
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
