import { defineConfig } from 'drizzle-kit';

// drizzle-kit 명령(npm run db:generate, db:migrate)은 .env.local의 DATABASE_URL을 쓴다.
// 마이그레이션 적용(db:migrate)은 nnoinn이 PR을 머지한 뒤 강규민만 한다.
try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local이 없으면(CI 등) 이미 설정된 환경변수를 그대로 쓴다
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
