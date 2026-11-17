// Vercel 빌드 건너뛰기(scripts/vercel-ignore-build.mjs). 문서만 바뀐 배포만 건너뛰고, 모르면 늘 빌드하는지 본다(11/17 nnoinn).
import { describe, expect, it } from 'vitest';

import {
  decideBuild,
  isDocsOnlyPath,
  shouldSkipBuild,
} from '../../scripts/vercel-ignore-build.mjs';

describe('문서 파일 고르기', () => {
  it('docs/ 아래와 마크다운만 문서로 본다', () => {
    expect(isDocsOnlyPath('docs/roadmap.md')).toBe(true);
    expect(isDocsOnlyPath('docs/legal/consent-texts.md')).toBe(true);
    expect(isDocsOnlyPath('CLAUDE.md')).toBe(true);
    expect(isDocsOnlyPath('README.MD')).toBe(true);
    expect(isDocsOnlyPath('src/app/page.tsx')).toBe(false);
    expect(isDocsOnlyPath('package.json')).toBe(false);
    expect(isDocsOnlyPath('vercel.json')).toBe(false);
    // 이름에 docs가 들어가도 docs/ 폴더가 아니면 앱 파일이다
    expect(isDocsOnlyPath('src/docs-helper.ts')).toBe(false);
  });
});

describe('빌드 건너뛰기', () => {
  it('바뀐 파일이 모두 문서일 때만 건너뛴다', () => {
    expect(shouldSkipBuild(['docs/roadmap.md', 'docs/announcements.md', 'CLAUDE.md'])).toBe(true);
    expect(shouldSkipBuild(['docs/roadmap.md', 'src/server/policy/refund.ts'])).toBe(false);
  });

  it('바뀐 파일이 없으면 건너뛰지 않는다(같은 커밋을 다시 배포할 때)', () => {
    expect(shouldSkipBuild([])).toBe(false);
  });

  it('마지막 배포 뒤 바뀐 파일로 정한다(여러 커밋을 한 번에 푸시해도 모두 본다)', () => {
    const reads: string[] = [];
    const read = (sha: string) => {
      reads.push(sha);
      return ['docs/roadmap.md'];
    };
    expect(decideBuild('abc123', read)).toEqual({
      build: false,
      reason: '문서만 바뀌어서 빌드하지 않아요(1개 파일)',
    });
    expect(reads).toEqual(['abc123']);
    expect(decideBuild('abc123', () => ['docs/roadmap.md', 'src/app/page.tsx'])).toEqual({
      build: true,
      reason: '앱 파일이 바뀌어서 빌드해요',
    });
  });

  it('브랜치의 첫 배포(이전 커밋 없음)이거나 이전 커밋을 찾지 못하면 빌드한다', () => {
    let read = false;
    expect(
      decideBuild(undefined, () => {
        read = true;
        return [];
      }),
    ).toEqual({ build: true, reason: '이 브랜치의 첫 배포라서 빌드해요' });
    expect(read).toBe(false);
    expect(
      decideBuild('gone', () => {
        throw new Error('bad revision');
      }),
    ).toEqual({ build: true, reason: '마지막 배포의 커밋을 찾지 못해서 빌드해요' });
  });
});
