import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// 계산 함수 테스트는 코드 옆에 *.test.ts로 둔다. 예: src/lib/time.test.ts
// 실제 DB가 필요한 테스트는 tests/db/의 describeDb로 쓴다(TEST_DATABASE_URL이 있을 때만 돈다. docs/tech-guide.md 3-4)
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Next.js가 자체로 들고 있는 server-only를 쓴다(설치 불필요). 테스트에서는 서버 표시만 하는 빈 모듈로 바꾼다
      'server-only': fileURLToPath(
        new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // 테스트 DB에 Supabase 흉내와 마이그레이션을 적용한다(TEST_DATABASE_URL이 없으면 아무것도 안 한다)
    globalSetup: ['tests/db/global-setup.ts'],
    env: {
      // 테스트 안의 서버 코드(getDb)는 개발 DB가 아니라 테스트 DB에만 접속한다. 테스트 DB가 없으면 비워 둔다
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
    },
  },
});
