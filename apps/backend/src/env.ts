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

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  STT_BASE_URL: z.string().optional(),
  STT_API_KEY: z.string().optional(),

  DEFAULT_TIMEZONE: z.string().default('Europe/Vilnius'),
  DAILY_QUOTA_LIMIT: z.coerce.number().default(20),
  WELCOME_QUOTA: z.coerce.number().default(30),
})

export const env = envSchema.parse(process.env)
export type Env = z.infer<typeof envSchema>
