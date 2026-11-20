// 운영자 샵 상세의 '취소 기록' 칸. 샵별 원장님 사정 취소 횟수·시작 몇 시간 전·패널티와 합의 후 취소 횟수·사유를 본다
// (핵심 규칙 X-207·X-208: 샵별로 기록한다). 반복되는 샵을 찾고, 원장님과 이야기할 때 근거로 쓴다

import Link from 'next/link';

import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import {
  AGREED_CANCEL_REASON_LABELS,
  AGREED_CANCEL_REASONS,
} from '@/server/refunds/agreed-cancel-types';

import { labelHoursBefore } from '../reservations/format';
import type { ShopCancelStats } from './cancel-stats-queries';
import { AGREED_REQUEST_STATUS_LABELS, agreedCancelReasonText } from './format';

export function ShopCancelStatsView({ stats }: { stats: ShopCancelStats }) {
  const { ownerFault, agreed } = stats;
  const requests = Object.values(agreed.byStatus).reduce((total, n) => total + n, 0);
  return (
    <div className="flex flex-col gap-5 text-sm">
      <section className="flex flex-col gap-2">
        <h3 className="font-medium">원장님 사정 취소 {ownerFault.count}건</h3>
        {ownerFault.recent.length === 0 ? (
          <p className="text-muted-foreground">없어요</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {ownerFault.recent.map((row) => (
              <li key={row.reservationId} className="flex flex-wrap gap-x-3 py-2">
                <Link href={`/admin/reservations/${row.reservationId}`} className="hover:underline">
                  {row.reservationCode}
                </Link>
                <span>
                  {row.menuName} · {formatKst(row.startAt)}
                </span>
                {row.hoursBeforeStart !== null ? (
                  <span className="text-muted-foreground">
                    시작 {labelHoursBefore(row.hoursBeforeStart)} 취소
                  </span>
                ) : null}
                {row.penalty ? (
                  <span className="text-muted-foreground">
                    패널티 {formatWon(row.penalty.amount)}
                    {row.penalty.remaining > 0
                      ? ` · 남은 ${formatWon(row.penalty.remaining)}`
                      : ' · 다 뗌'}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {ownerFault.count > ownerFault.recent.length ? (
          <p className="text-xs text-muted-foreground">
            최근 {ownerFault.recent.length}건만 보여요
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">
          합의 후 취소 {agreed.byStatus.agreed}건{' '}
          <span className="font-normal text-muted-foreground">(요청 {requests}건)</span>
        </h3>
        {requests === 0 ? (
          <p className="text-muted-foreground">없어요</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              {(['declined', 'expired', 'closed', 'requested'] as const)
                .filter((status) => agreed.byStatus[status] > 0)
                .map(
                  (status) =>
                    `${AGREED_REQUEST_STATUS_LABELS[status]} ${agreed.byStatus[status]}건`,
                )
                .join(' · ') || '모두 손님이 동의했어요'}
            </p>
            {agreed.byStatus.agreed > 0 ? (
              <p className="text-muted-foreground">
                취소된 사유:{' '}
                {AGREED_CANCEL_REASONS.filter((reason) => agreed.agreedByReason[reason] > 0)
                  .map(
                    (reason) =>
                      `${AGREED_CANCEL_REASON_LABELS[reason]} ${agreed.agreedByReason[reason]}건`,
                  )
                  .join(' · ')}
              </p>
            ) : null}
            <ul className="flex flex-col divide-y">
              {agreed.recent.map((row) => (
                <li key={row.requestId} className="flex flex-wrap gap-x-3 py-2">
                  <Link
                    href={`/admin/reservations/${row.reservationId}`}
                    className="hover:underline"
                  >
                    {row.reservationCode}
                  </Link>
                  <span>{formatKst(row.requestedAt)} 요청</span>
                  <span className="break-all">
                    {agreedCancelReasonText(row.reason, row.reasonText)}
                  </span>
                  <span className="text-muted-foreground">
                    {AGREED_REQUEST_STATUS_LABELS[row.status]}
                  </span>
                </li>
              ))}
            </ul>
            {requests > agreed.recent.length ? (
              <p className="text-xs text-muted-foreground">
                최근 {agreed.recent.length}건만 보여요
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
