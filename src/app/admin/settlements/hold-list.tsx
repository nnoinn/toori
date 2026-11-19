// 운영자 정산 보류 기록 목록(#373 ②). 예약 상세·샵 정산 화면이 같이 쓴다.
// 지금 걸린 보류는 [보류 풀기]를 붙이고, 지난 보류는 언제 누가 왜 풀었는지 남겨 보여 준다

import Link from 'next/link';

import { formatKstDateTime } from '@/lib/time';

import { HoldAction } from './hold-actions';
import type { SettlementHoldRow } from './hold-queries';

const who = (name: string | null) => name ?? '이름 없는 운영자';

export function HoldList({
  holds,
  showTarget = false,
}: {
  holds: readonly SettlementHoldRow[];
  /** 보류 대상(예약번호)을 링크로 보여 준다(샵 정산 화면의 거래 보류) */
  showTarget?: boolean;
}) {
  return (
    <ul className="flex flex-col divide-y text-sm">
      {holds.map((hold) => (
        <li key={hold.holdId} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className={hold.releasedAt ? 'text-muted-foreground' : 'font-medium'}>
              {showTarget && hold.reservationId ? (
                <>
                  <Link
                    href={`/admin/reservations/${hold.reservationId}`}
                    className="hover:underline"
                  >
                    {hold.reservationCode}
                  </Link>{' '}
                  ·{' '}
                </>
              ) : null}
              {hold.releasedAt ? '풀림' : '보류 중'} · {formatKstDateTime(hold.heldAt)}{' '}
              {who(hold.heldByName)}
            </p>
            <p className="break-all">사유: {hold.reason}</p>
            {hold.releasedAt ? (
              <p className="break-all text-muted-foreground">
                푼 때 {formatKstDateTime(hold.releasedAt)} · {who(hold.releasedByName)} · 메모:{' '}
                {hold.releaseMemo}
              </p>
            ) : null}
          </div>
          {hold.releasedAt ? null : (
            <HoldAction target={{ kind: 'release', holdId: hold.holdId }} />
          )}
        </li>
      ))}
    </ul>
  );
}
