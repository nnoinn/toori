'use client';

// 예약 상세의 [예약 취소] 카드 (S-410, 연결 #19, #301). 예정 예약(방문·노쇼 처리 전, 시작 뒤 포함)에 [예약 취소]를 두고,
// 합의 후 취소를 요청한 적이 있으면 가장 최근 요청의 상태(답 기다림·동의·거절·만료·끝남)를 같이 보여준다.
// [예약 취소]는 고르기 창(cancel-dialog.tsx)을 연다. 요청하면 화면이 새로 고쳐져 상태가 바뀌는데,
// 창은 닫힐 때까지 남도록 이 부품은 예약 상세에서 늘 같은 자리에 둔다(카드가 사라져도 창은 남는다).

import { useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Countdown } from '@/components/ui/countdown';
import type { AgreedCancelStatusView } from '@/server/refunds/agreed-cancel-types';

import {
  AGREED_CANCEL_CAN_RETRY,
  AGREED_CANCEL_HISTORY_TITLE,
  AGREED_CANCEL_LOAD_FAILED,
  agreedCancelDeadlineText,
  agreedCancelRequestedLine,
  agreedCancelStatusText,
  CANCEL_CARD_DESCRIPTION,
  CANCEL_CARD_TITLE,
} from '../cancel-request';
import { CancelDialog } from './cancel-dialog';

export function ReservationCancelCard({
  reservationId,
  summary,
  canCancel,
  agreedCancel,
}: {
  reservationId: string;
  /** 창에 보여줄 예약(visitSummary). 예: "11/1(토) 14:00 커트 · 예약번호 1234-5678-9012" */
  summary: string;
  /** [예약 취소]를 보여줄지: 예정이고 방문·노쇼 처리 전(시작 뒤 포함) */
  canCancel: boolean;
  /** getAgreedCancelStatus 결과. 읽지 못했으면 null */
  agreedCancel: AgreedCancelStatusView | null;
}) {
  const [open, setOpen] = useState(false);
  // 창을 열 때마다 고른 값을 비운다
  const [openCount, setOpenCount] = useState(0);

  // 떠났다 돌아오면 Next.js가 이 화면을 상태 그대로 다시 보여준다(Activity). 열려 있던 창은 닫아 둔다
  useLayoutEffect(() => () => setOpen(false), []);

  const hasRequest = agreedCancel !== null && agreedCancel.status !== 'none';
  const showCard = canCancel || hasRequest;

  return (
    <>
      {showCard ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle>{canCancel ? CANCEL_CARD_TITLE : AGREED_CANCEL_HISTORY_TITLE}</CardTitle>
              {canCancel ? (
                <p className="text-sm text-muted-foreground">{CANCEL_CARD_DESCRIPTION}</p>
              ) : null}
            </div>
            {canCancel ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setOpenCount((count) => count + 1);
                  setOpen(true);
                }}
              >
                예약 취소
              </Button>
            ) : null}
          </CardHeader>
          {hasRequest ? (
            <CardContent>
              <AgreedCancelStatusBox view={agreedCancel} />
            </CardContent>
          ) : null}
          {canCancel && agreedCancel === null ? (
            <CardContent>
              <p role="alert" className="text-sm text-destructive">
                {AGREED_CANCEL_LOAD_FAILED}
              </p>
            </CardContent>
          ) : null}
        </Card>
      ) : null}
      <CancelDialog
        key={openCount}
        open={open}
        reservationId={reservationId}
        summary={summary}
        agreedCancel={agreedCancel}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** 가장 최근 요청의 상태. 답을 기다리는 동안은 기한과 남은 시간(서버 시각 기준)을 보여준다 */
function AgreedCancelStatusBox({ view }: { view: AgreedCancelStatusView }) {
  const router = useRouter();
  const { status, request } = view;
  if (status === 'none' || !request) return null;
  const text = agreedCancelStatusText(status, view.baseAmount);
  const retry = (status === 'declined' || status === 'expired') && view.canRequest;

  return (
    <div
      className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm"
      role="status"
      aria-label="합의 후 취소 요청 상태"
    >
      <p className="font-semibold">{text.title}</p>
      {status === 'requested' ? (
        <p>
          {agreedCancelDeadlineText(request.expiresAt)} ·{' '}
          {/* 기한이 지나면 화면을 다시 받아 만료 상태와 [손님과 합의 후 취소]를 연다 */}
          <Countdown
            targetAt={request.expiresAt}
            serverNow={view.serverNow}
            className="font-medium"
            onExpire={() => router.refresh()}
          />
        </p>
      ) : null}
      <p className="text-muted-foreground">
        {agreedCancelRequestedLine(request.requestedAt, request.reason, request.reasonText)}
      </p>
      <p className="text-muted-foreground">
        {text.body}
        {retry ? ` ${AGREED_CANCEL_CAN_RETRY}` : null}
      </p>
    </div>
  );
}
