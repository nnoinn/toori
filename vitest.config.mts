import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// 계산 함수 테스트는 코드 옆에 *.test.ts로 둔다. 예: src/lib/time.test.ts
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
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
