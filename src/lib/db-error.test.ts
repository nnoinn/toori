import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { violatedConstraint } from './db-error';

describe('violatedConstraint', () => {
  const pgError = Object.assign(new Error('duplicate key'), {
    constraint_name: 'slots_no_overlap',
  });

  it('Drizzle가 감싼 오류와 감싸지 않은 오류 모두에서 제약 이름을 읽는다', () => {
    expect(violatedConstraint(new DrizzleQueryError('insert', [], pgError))).toBe(
      'slots_no_overlap',
    );
    expect(violatedConstraint(pgError)).toBe('slots_no_overlap');
  });

  it('제약 오류가 아니면 undefined', () => {
    expect(violatedConstraint(new Error('timeout'))).toBeUndefined();
    expect(violatedConstraint(undefined)).toBeUndefined();
  });
});
