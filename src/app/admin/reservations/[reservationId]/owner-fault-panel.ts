// 운영자 예약 정보의 원장님 사정 취소 칸(#373 ③-2): 지금 대신 취소할 수 있는지와 확인 창에 보여 줄 금액. 계산만 한다.
// 원장님 취소·운영자 대신 취소와 같은 판단(owner-fault-rules.ts)을 쓴다. 버튼을 보여 줄지 정하는 데만 쓰고, 막는 것은 서버가 다시 한다

import 'server-only';

import type { RefundErrorCode } from '@/server/refunds/errors';
import { ownerFaultPreview, ownerFaultRequest } from '@/server/refunds/owner-fault-rules';
import type { RefundTarget } from '@/server/refunds/refund-store';
import type { OwnerFaultCancelPreview } from '@/server/refunds/types';

export type OwnerFaultPanel =
  /** 예정 예약이 아니다(취소·방문·노쇼 처리됨). 칸을 보여 주지 않는다 */
  | { kind: 'none' }
  /** 대신 취소할 수 있다. resuming: 진행 중인 원장님 사정 취소를 이어서 한다 */
  | { kind: 'can_cancel'; preview: OwnerFaultCancelPreview; resuming: boolean }
  /** 지금은 할 수 없다(시작 뒤, 다른 취소가 진행 중) */
  | { kind: 'blocked'; code: RefundErrorCode };

export function ownerFaultPanel(target: RefundTarget, now: Date): OwnerFaultPanel {
  if (target.status !== 'confirmed') return { kind: 'none' };
  const request = ownerFaultRequest(target, now);
  if (!request.ok) return { kind: 'blocked', code: request.code };
  return {
    kind: 'can_cancel',
    preview: ownerFaultPreview(target, now),
    resuming: target.requested?.reason === 'owner_fault',
  };
}
