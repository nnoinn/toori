// Vercel "Ignored Build Step"(vercel.json의 ignoreCommand). 문서만 바뀐 배포는 빌드하지 않는다(11/17 nnoinn).
// 무료 플랜의 배포 저장 공간(10GB)이 남아 있는 배포 수만큼 차서, 앱과 상관없는 배포를 줄인다. 앱은 docs/와 마크다운을 읽지 않는다.
// 종료 코드(Vercel 규칙): 0 = 빌드하지 않음(배포는 CANCELED로 남고 운영 배포는 그대로), 1 = 빌드한다. 모르면 늘 빌드한다.
// 비교 기준은 VERCEL_GIT_PREVIOUS_SHA(그 브랜치에서 마지막으로 성공한 배포의 커밋, Ignored Build Step에만 있음)라서,
// 여러 커밋을 한 번에 푸시해도 마지막 배포 뒤 바뀐 것을 모두 본다. 브랜치의 첫 배포(비어 있음)나 Vercel이 받은 기록(깊이 10)에
// 그 커밋이 없어서 비교하지 못하면 빌드한다.

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** 앱 빌드와 상관없는 파일인지: docs/ 아래이거나 마크다운(.md) */
export function isDocsOnlyPath(path) {
  return path.startsWith('docs/') || path.toLowerCase().endsWith('.md');
}

/** 바뀐 파일이 모두 문서면 빌드를 건너뛴다. 바뀐 파일이 없으면(같은 커밋 다시 배포 등) 건너뛰지 않는다 */
export function shouldSkipBuild(changedFiles) {
  return changedFiles.length > 0 && changedFiles.every(isDocsOnlyPath);
}

/** 빌드할지 정하고 그 이유. previousSha가 없거나 바뀐 파일을 읽지 못하면 빌드한다 */
export function decideBuild(previousSha, readChangedFiles) {
  if (!previousSha) return { build: true, reason: '이 브랜치의 첫 배포라서 빌드해요' };
  let files;
  try {
    files = readChangedFiles(previousSha);
  } catch {
    return { build: true, reason: '마지막 배포의 커밋을 찾지 못해서 빌드해요' };
  }
  if (shouldSkipBuild(files)) {
    return { build: false, reason: `문서만 바뀌어서 빌드하지 않아요(${files.length}개 파일)` };
  }
  return { build: true, reason: '앱 파일이 바뀌어서 빌드해요' };
}

function changedFilesSince(previousSha) {
  const output = execFileSync('git', ['diff', '--name-only', previousSha, 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { build, reason } = decideBuild(process.env.VERCEL_GIT_PREVIOUS_SHA, changedFilesSince);
  console.log(reason);
  process.exit(build ? 1 : 0);
}
