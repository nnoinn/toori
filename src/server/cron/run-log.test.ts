// 예약 작업 실패 이유 글자 (#373 ⑥). 오류 이름과 메시지 첫 줄만 남기고, DB 오류에 끼어 있는 값(params)은 남기지 않는다.

import { describe, expect, it } from 'vitest';

import { describeCronError } from './run-log';

describe('실패 이유', () => {
  it('오류 이름과 메시지 첫 줄', () => {
    expect(describeCronError(new TypeError('fetch failed'))).toBe('TypeError: fetch failed');
    expect(describeCronError(new Error('첫 줄\n둘째 줄'))).toBe('Error: 첫 줄');
    expect(describeCronError(new Error(''))).toBe('Error');
  });

  it('Drizzle이 감싼 DB 오류는 원래 오류를 쓰고 SQL·값(params)은 남기지 않는다', () => {
    const cause = Object.assign(
      new Error('duplicate key value violates unique constraint "orders_payment_id_unique"'),
      { name: 'PostgresError' },
    );
    const wrapped = Object.assign(
      new Error('Failed query: insert into "customers" values ($1)\nparams: 010-1234-5678', {
        cause,
      }),
      { name: 'DrizzleQueryError' },
    );
    expect(describeCronError(wrapped)).toBe(
      'PostgresError: duplicate key value violates unique constraint "orders_payment_id_unique"',
    );

    const noCause = Object.assign(new Error('Failed query: select 1\nparams: 김투리'), {
      name: 'DrizzleQueryError',
    });
    expect(describeCronError(noCause)).toBe('DrizzleQueryError');
  });

  it('글자가 아닌 오류는 unknown, 긴 메시지는 300자까지', () => {
    expect(describeCronError('boom')).toBe('unknown');
    expect(describeCronError(new Error('가'.repeat(500)))).toHaveLength(300);
  });
});
