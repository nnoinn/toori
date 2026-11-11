'use client';

// 방문 완료·노쇼 확인 창 (O14, S-405·S-406, #130). 예약 상세의 버튼(visit-actions.tsx)과 대시보드 "처리 필요" 줄(#23 B1)이
// 같이 쓴다. 누르면 바로 처리하지 않고 이 창에서 한 번 더 눌러야 처리된다(처리하면 바꿀 수 없어서).
// 창에는 날짜·서비스·예약번호를 보여줘서 다른 예약을 잘못 처리하지 않게 한다.
// 처리하면 화면이 새로 고쳐진다. 그 사이 다른 곳에서 처리·취소됐으면 창에 그 문구를 보여주고, 확인 버튼을 잠근다.
// 그래서 창은 버튼이 있는 줄 안이 아니라 버튼이 사라져도 남는 자리(화면 전체)에 둔다.

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { VisitResult } from '@/server/visits/types';

import { recordReservationVisit } from './actions';
import { VISIT_ACTIONS } from './reservation-detail';

/** 처리하려는 예약과 고른 결과 */
export type VisitTarget = {
  reservationId: string;
  /** 창에 보여줄 예약(visitSummary). 예: "11/1(토) 14:00 커트 · 예약번호 1234-5678-9012" */
  summary: string;
  result: VisitResult;
};

/** 확인 창 틀. 처리 중(pending)은 창과 안쪽이 같이 써서, 처리하는 동안 바깥을 눌러도 닫히지 않는다 */
export function VisitConfirmDialog({
  target,
  canRecord,
  onDone,
}: {
  /** 처리하려는 예약. null이면 창을 닫는다 */
  target: VisitTarget | null;
  /** 아직 처리할 수 있는지(서버 시각 기준). 그 사이 처리·취소돼서 화면이 새로 고쳐지면 false가 된다 */
  canRecord: boolean;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onDone()}>
      {target ? (
        // 다른 예약이나 다른 결과를 열면 지난 문구를 비운다
        <VisitConfirmContent
          key={`${target.reservationId}:${target.result}`}
          target={target}
          canRecord={canRecord}
          pending={pending}
          startTransition={startTransition}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

/** 창 안쪽. [방문 완료로 처리]·[노쇼로 처리]를 누르면 성공하면 닫고, 실패하면 이유를 보여준다 */
function VisitConfirmContent({
  target,
  canRecord,
  pending,
  startTransition,
  onDone,
}: {
  target: VisitTarget;
  canRecord: boolean;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onDone: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const action = VISIT_ACTIONS[target.result];

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const recorded = await recordReservationVisit(target.reservationId, target.result);
      if (!recorded.ok) {
        setMessage(recorded.error.message);
        return;
      }
      onDone();
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{action.title}</DialogTitle>
        <DialogDescription>{target.summary}</DialogDescription>
      </DialogHeader>
      <p>
        {action.consequence ? `${action.consequence} ` : null}
        <span className="font-semibold">처리하면 바꿀 수 없어요.</span>
      </p>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onDone}>
          {canRecord ? '취소' : '닫기'}
        </Button>
        {/* 그 사이 처리·취소돼서 더는 처리할 수 없으면 확인 버튼을 잠근다 */}
        <Button
          type="button"
          size="lg"
          variant={target.result === 'no_show' ? 'destructive' : 'default'}
          disabled={pending || !canRecord}
          onClick={submit}
        >
          {pending ? '처리하는 중…' : action.confirm}
        </Button>
      </div>
    </DialogContent>
  );
}
