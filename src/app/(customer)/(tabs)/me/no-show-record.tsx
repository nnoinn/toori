import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { formatKst } from '@/lib/time';

import { NO_SHOW_DISPUTE_NOTE, noShowRefundNote } from '../reservations/no-show-texts';
import { tabHref } from '../reservations/reservation-tabs';
import type { NoShowHistory } from './no-show-history';

/**
 * 내 정보 > 노쇼 기록 (C-105). 원장님이 노쇼로 처리한 내 예약 수와 가장 최근 노쇼.
 * 이용 제한 안내는 기준(X-402, 출시 전 결정)이 정해지면 더한다(11/4)
 */
export function NoShowRecord({ history }: { history: NoShowHistory }) {
  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-label="노쇼 기록">
      <h2 className="font-semibold">노쇼 기록</h2>
      {history.count === 0 ? (
        <p className="text-sm text-muted-foreground">노쇼 기록이 없어요.</p>
      ) : (
        <>
          <p className="text-sm">
            노쇼 <strong>{history.count}회</strong>
          </p>
          {history.latest ? (
            <Link
              href={`/reservations/${history.latest.reservationId}`}
              className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm hover:bg-accent"
            >
              <span>
                <span className="text-muted-foreground">최근 노쇼</span> {history.latest.shopName} ·{' '}
                {formatKst(new Date(history.latest.startAt))}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          ) : null}
          <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
            <li>{noShowRefundNote()}.</li>
            <li>{NO_SHOW_DISPUTE_NOTE}.</li>
          </ul>
          <Link
            href={tabHref('completed')}
            className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline max-md:inline-flex max-md:min-h-10 max-md:items-center"
          >
            이용 완료 예약 모두 보기
          </Link>
        </>
      )}
    </section>
  );
}
