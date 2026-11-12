// 돌연변이 테스트(Stryker) 결과 요약: reports/mutation/mutation.json을 읽어 파일별 점수와
// 살아남은 돌연변이(테스트가 못 잡은 변경) 목록을 마크다운으로 쓴다.
// 주간 GitHub Actions(.github/workflows/mutation.yml)가 실행 요약에 붙이고, 내 컴퓨터에서는 npm run mutation 뒤에
//   node scripts/mutation-summary.mjs
// 로 본다. 살아남은 돌연변이마다 "이 변경을 잡는 테스트가 필요한가"를 보고, 필요하면 테스트를 더한다.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DETECTED = ['Killed', 'Timeout'];
const MISSED = ['Survived', 'NoCoverage'];
const MISSED_LABEL = { Survived: '살아남음', NoCoverage: '테스트가 안 거침' };

/** 잡은 수 / (잡은 수 + 놓친 수). 무시한 돌연변이는 세지 않는다 */
function score(mutants) {
  const detected = mutants.filter((m) => DETECTED.includes(m.status)).length;
  const missed = mutants.filter((m) => MISSED.includes(m.status)).length;
  return { detected, missed, percent: detected + missed === 0 ? 100 : (detected / (detected + missed)) * 100 };
}

const relative = (path) => path.replace(/\\/g, '/').replace(/^.*?(src\/)/, '$1');
const cell = (text) => text.replace(/\|/g, '\\|').replace(/`/g, "'");

/**
 * Stryker JSON 보고서 → 마크다운. limit: 목록에 쓸 놓친 돌연변이 수(나머지는 개수만)
 * @param {{ files: Record<string, { source: string, mutants: { mutatorName: string, replacement?: string, status: string, location: { start: { line: number } } }[] }> }} report
 */
export function summarize(report, limit = 60) {
  const files = Object.entries(report.files)
    .map(([path, file]) => ({ path: relative(path), file, ...score(file.mutants) }))
    .sort((a, b) => a.percent - b.percent || a.path.localeCompare(b.path));
  const total = score(files.flatMap(({ file }) => file.mutants));

  const lines = [
    '## 돌연변이 테스트 결과',
    '',
    `점수 **${total.percent.toFixed(1)}%** (잡음 ${total.detected}, 놓침 ${total.missed})`,
    '',
    '| 파일 | 점수 | 잡음 | 놓침 |',
    '| --- | ---: | ---: | ---: |',
    ...files.map((f) => `| ${f.path} | ${f.percent.toFixed(1)}% | ${f.detected} | ${f.missed} |`),
  ];

  const missed = files.flatMap(({ path, file }) => {
    const source = file.source.split('\n');
    return file.mutants
      .filter((m) => MISSED.includes(m.status))
      .map((m) => {
        const line = m.location.start.line;
        return `| ${path}:${line} | ${MISSED_LABEL[m.status]} | ${m.mutatorName} | \`${cell((source[line - 1] ?? '').trim()).slice(0, 80)}\` → \`${cell(m.replacement ?? '').slice(0, 40)}\` |`;
      });
  });
  if (missed.length > 0) {
    lines.push(
      '',
      '### 테스트가 못 잡은 변경',
      '',
      '| 위치 | 상태 | 바꾼 방식 | 원래 줄 → 바꾼 값 |',
      '| --- | --- | --- | --- |',
      ...missed.slice(0, limit),
    );
    if (missed.length > limit) lines.push('', `그 밖에 ${missed.length - limit}개는 보고서 파일(mutation.html)에서 본다.`);
  }
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const report = JSON.parse(readFileSync(process.argv[2] ?? 'reports/mutation/mutation.json', 'utf8'));
  console.log(summarize(report));
}
