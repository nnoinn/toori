import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // 돌연변이 테스트(Stryker)가 만드는 작업 폴더와 보고서
    '.stryker-tmp/**',
    'reports/**',
    // Claude Code가 레포 안에 만드는 작업 폴더(.claude/worktrees/)와 설정. 그 안의 다른 브랜치 코드까지 검사하지 않게(11/16 #457)
    '.claude/**',
  ]),
]);

export default eslintConfig;
