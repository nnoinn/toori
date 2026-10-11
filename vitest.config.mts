import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// 계산 함수 테스트는 코드 옆에 *.test.ts로 둔다. 예: src/lib/time.test.ts
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
