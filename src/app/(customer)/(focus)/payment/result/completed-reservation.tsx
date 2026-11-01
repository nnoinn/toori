'use client';

import { useEffect, useState } from 'react';
import { Clock, ExternalLink, MapPin } from 'lucide-react';

import {
  formatDuration,
  kakaoMapLink,
  refundPolicyLines,
  refundPolicyNotes,
} from '@/app/(customer)/(tabs)/slots/[slotId]/detail-format';
import { Skeleton } from '@/components/ui/skeleton';
import { ShopLocationMap } from '@/features/map/shop-location-map';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { NO_SHOW_PENALTY_RATE, OWNER_FAULT_COUPON_AMOUNT, REFUND_BANDS } from '@/server/policy';

import { type CompletedReservation, loadCompletedReservation } from './actions';

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; reservation: CompletedReservation } | { kind: 'error' };

const LOAD_FAILED = '예약 내용을 불러오지 못했어요. 예약 상세에서 확인해 주세요';

/**
 * 예약 완료 화면의 예약 내용 (J11, C-405): 예약 시간, 샵 위치(작은 지도), 환불 규정 요약.
 * 예약이 확정된 뒤 불러온다. 못 불러와도 위의 예약번호와 '예약 상세 보기'는 그대로 남는다.
 */
export function CompletedReservationDetails({ reservationId }: { reservationId: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    // 불러오는 중에 화면을 떠나면(Activity가 효과를 정리한다) 늦게 온 결과는 버리고, 돌아오면 다시 불러온다
    let active = true;
    loadCompletedReservation(reservationId)
      .then((result) => {
        if (!active) return;
        setState(result.ok ? { kind: 'ready', reservation: result.data } : { kind: 'error' });
      })
      .catch(() => {
        if (active) setState({ kind: 'error' });
      });
    return () => {
      active = false;
    };
  }, [reservationId]);

  if (state.kind === 'loading') {
    return (
      <div className="flex w-full flex-col gap-3" aria-busy>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (state.kind === 'error') {
    return <p className="text-center text-sm text-muted-foreground">{LOAD_FAILED}</p>;
  }

  const { menuName, startAt, durationMinutes, amount, shop } = state.reservation;
  // 결제 동의(C-402)·매물 상세(C-305)와 같은 문구. 원장님 귀책 쿠폰 줄은 요약에서 뺀다
  const refundNotes = refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT);

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4" aria-label="예약 내용">
        <h2 className="font-semibold">{menuName}</h2>
        <p className="flex items-center gap-2 text-sm">
          <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {formatKst(new Date(startAt))} · {formatDuration(durationMinutes)}
        </p>
        <dl className="flex justify-between gap-3 text-sm">
          <dt className="text-muted-foreground">결제 금액</dt>
          <dd className="font-semibold">{formatWon(amount)}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4" aria-label="샵 위치">
        <h2 className="font-semibold">{shop.name}</h2>
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            {shop.roadAddress}
            {shop.addressDetail ? ` ${shop.addressDetail}` : ''}
          </span>
        </p>
        <ShopLocationMap shopId={shop.shopId} name={shop.name} lat={shop.lat} lng={shop.lng} />
        <a
          href={kakaoMapLink(shop.name, shop.lat, shop.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 self-start text-sm text-muted-foreground"
        >
          카카오맵에서 크게 보기
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </section>

      <section
        className="flex flex-col gap-1 rounded-xl border bg-card p-4 text-sm"
        aria-label="환불 규정"
      >
        <h2 className="pb-1 text-base font-semibold">환불 규정</h2>
        <div className="flex flex-col gap-1 text-muted-foreground">
          {refundNotes.before.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <ul className="flex flex-col gap-0.5">
            {refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE).map((line) => (
              <li key={line}>- {line}</li>
            ))}
          </ul>
        </div>
        <p className="pt-1">취소는 예약 상세에서 할 수 있어요.</p>
      </section>
    </div>
  );
}
