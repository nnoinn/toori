// 개발 DB 마이그레이션 상태 보기(읽기 전용). 적용하기 전과 뒤에 쓴다: npm run db:status
// main의 마이그레이션 목록(src/db/migrations/meta/_journal.json)과 개발 DB에 적용된 기록(drizzle.__drizzle_migrations)을 비교한다.
// drizzle은 마지막으로 적용한 마이그레이션의 시각(when)보다 뒤의 것을 적용하므로 같은 기준으로 센다.
// 적용 절차는 docs/tech-guide.md "마이그레이션 적용 절차"(11/16). 적용은 강규민 또는 nnoinn만 한다.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { openDevDb } from './dev-db.mjs';

/** @typedef {{ tag: string; when: number }} MigrationEntry */

/**
 * 마이그레이션 목록(entries: { tag, when })과 마지막으로 적용한 시각으로 상태를 정한다.
 * lastTag: 개발 DB에 마지막으로 적용된 것(목록에 없으면 null), pending: 적용 안 된 것,
 * unknownLast: 개발 DB에 main 목록에 없는 마이그레이션이 적용돼 있음(브랜치에서 적용했을 수 있다)
 * @param {MigrationEntry[]} entries
 * @param {number | null} lastAppliedWhen
 * @returns {{ lastTag: string | null; pending: MigrationEntry[]; unknownLast: boolean }}
 */
export function migrationStatus(entries, lastAppliedWhen) {
  const last =
    lastAppliedWhen === null ? null : entries.find((entry) => entry.when === lastAppliedWhen);
  return {
    lastTag: last ? last.tag : null,
    pending: entries.filter((entry) => lastAppliedWhen === null || entry.when > lastAppliedWhen),
    unknownLast: lastAppliedWhen !== null && !last,
  };
}

/** 화면에 보여 줄 줄들 */
export function statusLines({ branch, status }) {
  const lines = [
    `지금 브랜치: ${branch}${branch === 'main' ? '' : ' (적용은 최신 main에서만 해요)'}`,
    `개발 DB 마지막 적용: ${status.lastTag ?? '(main 목록에 없음)'}`,
  ];
  if (status.unknownLast) {
    lines.push(
      '주의: 개발 DB에 main에 없는 마이그레이션이 적용돼 있어요. 적용하지 말고 PR에 남겨 주세요.',
    );
  }
  lines.push(
    status.pending.length === 0
      ? '모두 적용됨'
      : `적용 안 된 마이그레이션 ${status.pending.length}개: ${status.pending.map((entry) => entry.tag).join(', ')}`,
  );
  return lines;
}

async function main() {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  const journal = JSON.parse(readFileSync('src/db/migrations/meta/_journal.json', 'utf8'));
  const { sql } = await openDevDb('npm run db:status');
  try {
    const [row] = await sql`select max(created_at)::text as last from drizzle.__drizzle_migrations`;
    const last = row?.last ? Number(row.last) : null;
    const status = migrationStatus(journal.entries, last);
    process.stdout.write(`${statusLines({ branch, status }).join('\n')}\n`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
}
