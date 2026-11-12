// 돌연변이 테스트 결과 요약(scripts/mutation-summary.mjs)이 점수와 놓친 돌연변이를 맞게 쓰는지 본다.

import { describe, expect, it } from 'vitest';

import { summarize } from '../../scripts/mutation-summary.mjs';

const mutant = (status: string, line: number, mutatorName = 'EqualityOperator') => ({
  status,
  mutatorName,
  replacement: 'a >= b',
  location: { start: { line } },
});

const report = {
  files: {
    'C:/work/toori/src/server/refunds/calc-refund.ts': {
      source: 'const a = 1;\nif (a > b) return;\nreturn a | b;',
      mutants: [
        mutant('Killed', 1),
        mutant('Killed', 1),
        mutant('Timeout', 2),
        mutant('Survived', 2),
        mutant('Ignored', 1),
      ],
    },
    'src/server/policy/pricing.ts': {
      source: 'export const x = 1;',
      mutants: [mutant('Killed', 1), mutant('NoCoverage', 1, 'BlockStatement')],
    },
  },
};

describe('돌연변이 테스트 결과 요약', () => {
  it('점수는 잡음(Killed·Timeout) / (잡음 + 놓침)이고, 무시한 돌연변이는 세지 않는다', () => {
    const text = summarize(report);
    // 잡음 4(Killed 3 + Timeout 1), 놓침 2(Survived 1 + NoCoverage 1) → 66.7%
    expect(text).toContain('점수 **66.7%** (잡음 4, 놓침 2)');
    expect(text).toContain('| src/server/refunds/calc-refund.ts | 75.0% | 3 | 1 |');
    expect(text).toContain('| src/server/policy/pricing.ts | 50.0% | 1 | 1 |');
  });

  it('점수가 낮은 파일부터 쓰고, 놓친 돌연변이는 위치·원래 줄과 함께 쓴다', () => {
    const text = summarize(report);
    expect(text.indexOf('policy/pricing.ts |')).toBeLessThan(text.indexOf('refunds/calc-refund.ts |'));
    expect(text).toContain(
      '| src/server/refunds/calc-refund.ts:2 | 살아남음 | EqualityOperator | `if (a > b) return;` → `a >= b` |',
    );
    expect(text).toContain('| src/server/policy/pricing.ts:1 | 테스트가 안 거침 | BlockStatement |');
  });

  it('놓친 돌연변이가 많으면 정한 수까지만 쓰고 나머지는 개수만 알린다', () => {
    const text = summarize(report, 1);
    expect(text.match(/살아남음|테스트가 안 거침/g)).toHaveLength(1);
    expect(text).toContain('그 밖에 1개는 보고서 파일(mutation.html)에서 본다.');
  });

  it('표 칸을 깨는 글자(|)는 바꿔 쓴다', () => {
    const text = summarize({
      files: {
        'src/a.ts': { source: 'return a | b;', mutants: [mutant('Survived', 1)] },
      },
    });
    expect(text).toContain('`return a \\| b;`');
  });
});
