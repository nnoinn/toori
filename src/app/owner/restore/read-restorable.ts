// 원장님 가입·되살리기 화면이 되살릴 계정을 읽는다(#154 3장). 서버 화면에서만 부른다

import 'server-only';

import { getRestorableAccount } from '@/server/accounts/withdrawal';
import type { RestorableAccount } from '@/server/accounts/withdrawal-types';

import type { EntryAccount } from './restore-rules';

/** 원장님 모드로 로그인했고 원장님 계정이 없을 때만 읽는다. 30일 안에 탈퇴한 원장님 계정이 없거나 못 읽으면 null */
export async function readOwnerRestorable(
  account: EntryAccount,
): Promise<RestorableAccount | null> {
  if (!account || account.mode !== 'owner' || account.ownerId) return null;
  const result = await getRestorableAccount('owner');
  return result.ok ? result.data : null;
}
