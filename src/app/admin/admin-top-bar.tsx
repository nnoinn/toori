import { getDb } from '@/db';
import { getCurrentAccount } from '@/server/auth';
import { readAdminName } from '@/server/admin/admin-profile';

import { AdminSignOutButton } from './admin-sign-out-button';

/**
 * 운영자 화면 위 오른쪽의 운영자 이름과 [로그아웃] (#372 3·4장). 운영자 모드로 들어온 운영자일 때만 보이고,
 * 운영자 입구(/admin/login)처럼 아직 운영자로 들어오지 않았으면 아무것도 그리지 않는다. <Suspense> 안에서 부른다
 */
export async function AdminTopBar() {
  const account = await getCurrentAccount();
  if (account?.mode !== 'admin' || !account.isAdmin) return null;
  const name = await readAdminName(getDb(), account.userId);
  return (
    <div className="flex items-center justify-end gap-3 border-b px-6 py-3 text-sm">
      <span>
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground"> 운영자</span>
      </span>
      <AdminSignOutButton />
    </div>
  );
}

/** 운영자 모드로 들어온 운영자인지(메뉴를 보일지). 운영자 입구에서는 메뉴를 숨긴다 */
export async function isAdminSession(): Promise<boolean> {
  const account = await getCurrentAccount();
  return account?.mode === 'admin' && account.isAdmin;
}
