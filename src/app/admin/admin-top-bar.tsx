import { getDb } from '@/db';
import { getCurrentAccount } from '@/server/auth';
import { readAdminProfileName } from '@/server/admin/admin-profile';

import { AdminProfileMenu } from './admin-profile-menu';

/**
 * 운영자 화면 위 오른쪽의 프로필 메뉴 "OOO 운영자"(누르면 이름 바꾸기·로그아웃) (#372 3·4장, 11/16). 운영자 모드로 들어온 운영자일 때만 보이고,
 * 운영자 입구(/admin/login)처럼 아직 운영자로 들어오지 않았으면 아무것도 그리지 않는다. <Suspense> 안에서 부른다
 */
export async function AdminTopBar() {
  const account = await getCurrentAccount();
  if (account?.mode !== 'admin' || !account.isAdmin) return null;
  const name = await readAdminProfileName(getDb(), account.userId);
  return (
    <div className="flex items-center justify-end border-b px-6 py-3 text-sm">
      <AdminProfileMenu name={name} />
    </div>
  );
}
