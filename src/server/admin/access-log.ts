// 운영자 열람 기록 남기기 (#269, 11/8 결정). 서버에서만 부른다.
// 개인정보가 보이는 운영자 화면(page)이 ensureAdminPage()로 관리자를 확인하고 보여줄 대상을 찾은 바로 뒤에 부른다.
// 기록을 남기지 못하면 오류를 던져서 화면(error.tsx)이 개인정보 대신 오류를 보여준다(기록 없이 개인정보가 보이지 않게, 11/9).

import 'server-only';

import { headers } from 'next/headers';

import { getDb } from '@/db';
import { adminAccessLogs } from '@/db/schema';

type DbWriter = Pick<ReturnType<typeof getDb>, 'insert'>;

export type AdminAccess = {
  /** view: 상세 보기, search: 목록·검색 */
  action: 'view' | 'search';
  /** 목록·검색이면 list */
  targetType: 'customer' | 'owner' | 'shop' | 'reservation' | 'dispute' | 'settlement' | 'list';
  /** 상세면 대상 id */
  targetId?: string;
  /** 본 화면 주소. 검색어는 넣지 않고 query에 따로 둔다 */
  path: string;
  /** 목록·검색에서 쓴 검색어. 비어 있으면 남기지 않는다 */
  query?: string;
};

/** 접속 IP. 프록시를 거치면 x-forwarded-for의 첫 값(접속한 쪽), 없으면 x-real-ip, 둘 다 없으면 null */
export function clientIp(source: Pick<Headers, 'get'>): string | null {
  const forwarded = source.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return source.get('x-real-ip')?.trim() || null;
}

/** 열람 기록 한 줄을 넣는다 */
export async function insertAdminAccess(
  db: DbWriter,
  row: AdminAccess & { adminId: string; ip: string | null },
): Promise<void> {
  await db.insert(adminAccessLogs).values({
    adminId: row.adminId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId ?? null,
    path: row.path,
    query: row.query || null,
    ip: row.ip,
  });
}

/** 지금 요청의 IP와 함께 열람 기록을 남긴다. 실패하면 오류를 던진다 */
export async function recordAdminAccess(adminId: string, access: AdminAccess): Promise<void> {
  await insertAdminAccess(getDb(), { ...access, adminId, ip: clientIp(await headers()) });
}
