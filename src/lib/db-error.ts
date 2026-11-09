// DB 오류 읽기. 서버에서만 쓴다.

import 'server-only';

import { DrizzleQueryError } from 'drizzle-orm';

/** 쿼리가 어긴 DB 제약 이름(겹침·unique 등). 제약 오류가 아니면 undefined */
export function violatedConstraint(error: unknown): string | undefined {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  return (cause as { constraint_name?: string } | undefined)?.constraint_name;
}
