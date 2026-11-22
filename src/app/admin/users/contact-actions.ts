'use server';

// 운영자 [번호 보기](#360 4번, 11/13 nnoinn). 회원 상세와 입점 심사 화면은 연락처를 가려서 보여 주고, 누를 때만 여기서 전체를 받아 온다.
// 상세 화면 코드(HTML)에 전체 번호·이메일이 실리지 않게 서버 함수로 둔다. 누른 것도 운영자 열람 기록(contact_reveal)에 남기고,
// 기록을 남기지 못하면 보여 주지 않는다(recordAdminAccess가 오류를 던진다).

import { getDb } from '@/db';
import { fail, ok, type Result } from '@/lib/result';
import { isUuid } from '@/lib/uuid';
import { recordAdminAccess } from '@/server/admin/access-log';
import { requireAdmin } from '@/server/auth';

import { selectCustomerContact, selectShopOwnerContact } from './contact-queries';

/** [번호 보기]로 받아 오는 연락처. 이메일은 고객만 */
export type RevealedContact = { phone: string | null; email: string | null };

const NOT_FOUND = '연락처를 찾을 수 없어요';

/** 고객 상세의 휴대폰 번호·이메일 */
export async function revealCustomerContact(customerId: string): Promise<Result<RevealedContact>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!isUuid(customerId)) return fail('NOT_FOUND', NOT_FOUND);
  const contact = await selectCustomerContact(getDb(), customerId);
  if (!contact) return fail('NOT_FOUND', NOT_FOUND);
  await recordAdminAccess(auth.data.userId, {
    action: 'contact_reveal',
    targetType: 'customer',
    targetId: customerId,
    path: `/admin/users/customers/${customerId}`,
  });
  return ok({ phone: contact.phone, email: contact.email });
}

/** 입점 심사(샵 상세)의 원장님 휴대폰 번호 */
export async function revealShopOwnerContact(shopId: string): Promise<Result<RevealedContact>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!isUuid(shopId)) return fail('NOT_FOUND', NOT_FOUND);
  const contact = await selectShopOwnerContact(getDb(), shopId);
  if (!contact) return fail('NOT_FOUND', NOT_FOUND);
  await recordAdminAccess(auth.data.userId, {
    action: 'contact_reveal',
    targetType: 'owner',
    targetId: contact.ownerId,
    path: `/admin/shops/${shopId}`,
  });
  return ok({ phone: contact.phone, email: null });
}
