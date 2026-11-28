'use client';

// [예약 취소] 창. 고르기 → 고른 방법의 창 → 끝난 뒤 안내를 한 창에서 바꿔 보여준다.
// - 원장님 사정으로 취소(S-409, 연결 #18, #419): 확인 창에서 강규민 previewOwnerFaultCancel의 금액(전액 환불·쓴 쿠폰·보상 쿠폰·패널티)을
//   보여주고, 확인 체크를 해야 cancelByOwnerFault를 부른다(11/17 정민석). 끝나면 창에 결과를 보여주고 예약 상세를 다시 읽는다.
//   서비스가 시작된 예약(방문 처리 필요)은 고르기에서 잠그고, 서버도 다시 막는다(ALREADY_STARTED)
// - 손님과 합의 후 취소(S-410, 연결 #19, #301): 안내(동의 문구 8-1장) → 보낸 뒤 안내. 열 수 있는지는 서버가 준 canRequest를 그대로 따른다
//   (답을 기다리는 요청이 있으면 잠김)
// 처리하는 동안(pending)에는 바깥을 눌러도 닫히지 않는다.

import { useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { cn } from 'cn';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { AGREED_CANCEL_ERRORS } from '@/server/refunds/agreed-cancel-errors';
import {
  AGREED_CANCEL_REASON_TEXT_MAX,
  type AgreedCancelReason,
  type AgreedCancelStatusView,
  type RequestedAgreedCancel,
} from '@/server/refunds/agreed-cancel-types';
import { cancelByOwnerFault, previewOwnerFaultCancel } from '@/server/refunds/owner-fault-cancel';
import type { CancelledReservation, OwnerFaultCancelPreview } from '@/server/refunds/types';

import { ChoiceChips } from '../../choice-chips';
import { requestReservationAgreedCancel } from '../actions';
import {
  AGREED_CANCEL_ALTERNATIVES,
  AGREED_CANCEL_ASK_CUSTOMER,
  AGREED_CANCEL_CONFIRM_LABEL,
  AGREED_CANCEL_LOAD_FAILED,
  AGREED_CANCEL_NOT_FOR,
  AGREED_CANCEL_REASON_CHIPS,
  AGREED_CANCEL_REASON_VISIBLE,
  AGREED_CANCEL_REQUEST_FAILED,
  AGREED_CANCEL_SENT_TITLE,
  AGREED_CANCEL_SUBMIT,
  AGREED_CANCEL_USE_WHEN,
  agreedCancelFailIsFinal,
  agreedCancelOutcomes,
  agreedCancelSentText,
  CANCEL_CHOOSER_TITLE,
  CANCEL_METHODS,
  canSubmitAgreedCancel,
  OWNER_FAULT_CANCEL_FAILED,
  OWNER_FAULT_DONE_TITLE,
  OWNER_FAULT_LOAD_FAILED,
  OWNER_FAULT_SUBMIT,
  ownerFaultConfirmLabel,
  ownerFaultDoneText,
  ownerFaultFailIsFinal,
  ownerFaultOutcomes,
} from '../cancel-request';

type Step = 'choose' | 'agreed' | 'sent' | 'ownerFault' | 'ownerFaultDone';

export function CancelDialog({
  open,
  reservationId,
  summary,
  ownerFaultAllowed,
  agreedCancel,
  onClose,
}: {
  open: boolean;
  reservationId: string;
  summary: string;
  /** 원장님 사정으로 취소를 고를 수 있는지: 예정이고 서비스 시작 전 */
  ownerFaultAllowed: boolean;
  agreedCancel: AgreedCancelStatusView | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [sent, setSent] = useState<RequestedAgreedCancel | null>(null);
  // 원장님 사정 취소: 확인 창을 열 때 받은 금액, 끝난 결과, 고르기 창에 보여줄 실패 문구
  const [preview, setPreview] = useState<OwnerFaultCancelPreview | null>(null);
  const [done, setDone] = useState<CancelledReservation | null>(null);
  const [chooseMessage, setChooseMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** [원장님 사정으로 취소]: 금액을 받아 확인 창으로 간다. 그 사이 시작됐으면 고르기 창에 이유를 보여준다 */
  function openOwnerFault() {
    setChooseMessage(null);
    startTransition(async () => {
      try {
        const result = await previewOwnerFaultCancel(reservationId);
        if (!result.ok) {
          setChooseMessage(result.error.message);
          return;
        }
        if (!result.data.cancellable) {
          setChooseMessage(CANCEL_METHODS.ownerFault.startedNote);
          return;
        }
        setPreview(result.data);
        setStep('ownerFault');
      } catch (caught) {
        unstable_rethrow(caught);
        setChooseMessage(OWNER_FAULT_LOAD_FAILED);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      {step === 'choose' ? (
        <ChooseStep
          summary={summary}
          ownerFaultAllowed={ownerFaultAllowed}
          agreedCancel={agreedCancel}
          pending={pending}
          message={chooseMessage}
          onOwnerFault={openOwnerFault}
          onAgreed={() => setStep('agreed')}
          onClose={onClose}
        />
      ) : step === 'ownerFault' && preview ? (
        <OwnerFaultStep
          reservationId={reservationId}
          summary={summary}
          preview={preview}
          pending={pending}
          startTransition={startTransition}
          onBack={() => setStep('choose')}
          onDone={(data) => {
            setDone(data);
            setStep('ownerFaultDone');
            // 예약 상세를 취소 상태로 다시 읽는다. 창은 [확인]을 누를 때까지 남는다
            router.refresh();
          }}
        />
      ) : step === 'ownerFaultDone' && done && preview ? (
        <OwnerFaultDoneStep summary={summary} done={done} preview={preview} onClose={onClose} />
      ) : step === 'agreed' && agreedCancel ? (
        <AgreedStep
          reservationId={reservationId}
          summary={summary}
          baseAmount={agreedCancel.baseAmount}
          pending={pending}
          startTransition={startTransition}
          onBack={() => setStep('choose')}
          onSent={(data) => {
            setSent(data);
            setStep('sent');
          }}
        />
      ) : sent ? (
        <SentStep summary={summary} sent={sent} onClose={onClose} />
      ) : null}
    </Dialog>
  );
}

/** 1단계: 원장님 사정으로 취소 / 손님과 합의 후 취소 */
function ChooseStep({
  summary,
  ownerFaultAllowed,
  agreedCancel,
  pending,
  message,
  onOwnerFault,
  onAgreed,
  onClose,
}: {
  summary: string;
  ownerFaultAllowed: boolean;
  agreedCancel: AgreedCancelStatusView | null;
  pending: boolean;
  /** 원장님 사정 취소 금액을 받지 못했거나 그 사이 막혔을 때 */
  message: string | null;
  onOwnerFault: () => void;
  onAgreed: () => void;
  onClose: () => void;
}) {
  const canRequest = agreedCancel?.canRequest ?? false;
  // 잠긴 이유. 답을 기다리는 요청이 있거나(한 번에 하나), 그 사이 예약이 바뀌었거나, 상태를 읽지 못함
  const lockedReason =
    agreedCancel === null
      ? AGREED_CANCEL_LOAD_FAILED
      : agreedCancel.status === 'requested'
        ? AGREED_CANCEL_ERRORS.ALREADY_REQUESTED
        : AGREED_CANCEL_ERRORS.NOT_REQUESTABLE;

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{CANCEL_CHOOSER_TITLE}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <MethodButton
          title={CANCEL_METHODS.ownerFault.title}
          description={CANCEL_METHODS.ownerFault.description}
          badge={pending ? '금액 확인 중…' : undefined}
          note={ownerFaultAllowed ? undefined : CANCEL_METHODS.ownerFault.startedNote}
          disabled={!ownerFaultAllowed || pending}
          onClick={onOwnerFault}
        />
        <MethodButton
          title={CANCEL_METHODS.agreed.title}
          description={CANCEL_METHODS.agreed.description}
          note={canRequest ? undefined : lockedReason}
          disabled={!canRequest || pending}
          onClick={onAgreed}
        />
      </div>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onClose}>
          닫기
        </Button>
      </div>
    </DialogContent>
  );
}

/** 취소 방법 하나. 누르면 다음 단계로 간다. 잠겼으면 이유(note)나 "준비 중"(badge)을 보여준다 */
function MethodButton({
  title,
  description,
  badge,
  note,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  badge?: string;
  note?: string;
  disabled: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors outline-none',
        'hover:border-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent',
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn('font-semibold', disabled && 'text-muted-foreground')}>{title}</span>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </span>
      <span className="text-muted-foreground">{description}</span>
      {note ? <span className="text-destructive">{note}</span> : null}
    </button>
  );
}

/**
 * 원장님 사정으로 취소 확인 창(S-409): "이렇게 처리돼요"(금액은 preview 값), 확인 체크, [원장님 사정으로 취소하기].
 * 다시 눌러도 같은 실패(이미 시작·이미 취소)면 버튼을 잠그고, 환불 실패·처리 중이면 다시 누를 수 있다
 */
function OwnerFaultStep({
  reservationId,
  summary,
  preview,
  pending,
  startTransition,
  onBack,
  onDone,
}: {
  reservationId: string;
  summary: string;
  preview: OwnerFaultCancelPreview;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onBack: () => void;
  onDone: (done: CancelledReservation) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  function submit() {
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await cancelByOwnerFault({ reservationId });
        if (result.ok) {
          onDone(result.data);
          return;
        }
        if (ownerFaultFailIsFinal(result.error.code)) setBlocked(true);
        setMessage(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setMessage(OWNER_FAULT_CANCEL_FAILED);
      }
    });
  }

  return (
    <DialogContent className="overflow-y-auto" showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>{CANCEL_METHODS.ownerFault.title}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <p>{CANCEL_METHODS.ownerFault.description}</p>
      <GuideSection title="이렇게 처리돼요" highlight>
        {ownerFaultOutcomes(preview).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </GuideSection>
      <label className="flex items-start gap-2 font-medium">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        {ownerFaultConfirmLabel(preview.penaltyAmount)}
      </label>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onBack}>
          뒤로
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          disabled={!confirmed || pending || blocked}
          onClick={submit}
        >
          {pending ? '취소하는 중…' : OWNER_FAULT_SUBMIT}
        </Button>
      </div>
    </DialogContent>
  );
}

/** 원장님 사정으로 취소한 뒤 결과. [확인]을 누르면 닫힌다(예약 상세는 이미 취소 상태로 다시 읽었다) */
function OwnerFaultDoneStep({
  summary,
  done,
  preview,
  onClose,
}: {
  summary: string;
  done: CancelledReservation;
  preview: OwnerFaultCancelPreview;
  onClose: () => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{OWNER_FAULT_DONE_TITLE}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <p role="status">{ownerFaultDoneText(done, preview)}</p>
      <div className="flex justify-end">
        <Button type="button" size="lg" onClick={onClose}>
          확인
        </Button>
      </div>
    </DialogContent>
  );
}

/** 2단계: 손님과 합의 후 취소 안내(동의 문구 8-1장), 사유, 손님께 설명했다는 확인, [합의 후 취소 요청하기] */
function AgreedStep({
  reservationId,
  summary,
  baseAmount,
  pending,
  startTransition,
  onBack,
  onSent,
}: {
  reservationId: string;
  summary: string;
  baseAmount: number;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onBack: () => void;
  onSent: (sent: RequestedAgreedCancel) => void;
}) {
  const [reason, setReason] = useState<AgreedCancelReason | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const ready = canSubmitAgreedCancel({ reason, reasonText, confirmed });

  function submit() {
    if (!reason || !ready) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await requestReservationAgreedCancel({
          reservationId,
          reason,
          reasonText: reason === 'other' ? reasonText.trim() : null,
        });
        if (result.ok) {
          onSent(result.data);
          return;
        }
        if (agreedCancelFailIsFinal(result.error.code)) setBlocked(true);
        setMessage(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setMessage(AGREED_CANCEL_REQUEST_FAILED);
      }
    });
  }

  return (
    <DialogContent className="overflow-y-auto" showCloseButton={!pending}>
      <DialogHeader>
        <DialogTitle>{CANCEL_METHODS.agreed.title}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <p>{CANCEL_METHODS.agreed.description}</p>

      <GuideSection title="이럴 때 써요">
        <li>
          {AGREED_CANCEL_USE_WHEN[0]}
          <p className="mt-1 text-muted-foreground">{AGREED_CANCEL_ALTERNATIVES}</p>
        </li>
        <li>{AGREED_CANCEL_USE_WHEN[1]}</li>
      </GuideSection>
      <GuideSection title="이럴 때는 쓰지 않아요">
        {AGREED_CANCEL_NOT_FOR.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </GuideSection>
      <GuideSection title="이렇게 처리돼요" highlight>
        {agreedCancelOutcomes(baseAmount * 2).map( // TEMP 일부러 틀림(E2E 확인용)
        (line) => (
          <li key={line}>{line}</li>
        ))}
      </GuideSection>

      <div className="flex flex-col gap-2">
        <ChoiceChips
          legend="사유"
          name="agreedCancelReason"
          options={AGREED_CANCEL_REASON_CHIPS}
          value={reason}
          onChange={(key) => {
            setReason(key);
            setMessage(null);
          }}
        />
        {reason === 'other' ? (
          <div className="flex flex-col gap-1">
            <Textarea
              aria-label="기타 사유"
              value={reasonText}
              maxLength={AGREED_CANCEL_REASON_TEXT_MAX}
              rows={2}
              placeholder="어떤 사정인지 짧게 적어 주세요"
              className="min-h-16"
              onChange={(event) => {
                setReasonText(event.target.value);
                setMessage(null);
              }}
            />
            <p className="self-end text-xs text-muted-foreground tabular-nums">
              {reasonText.length}/{AGREED_CANCEL_REASON_TEXT_MAX}
            </p>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{AGREED_CANCEL_REASON_VISIBLE}</p>
      </div>

      <label className="flex items-start gap-2 font-medium">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        {AGREED_CANCEL_CONFIRM_LABEL}
      </label>

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onBack}>
          뒤로
        </Button>
        <Button type="button" size="lg" disabled={!ready || pending || blocked} onClick={submit}>
          {pending ? '요청하는 중…' : AGREED_CANCEL_SUBMIT}
        </Button>
      </div>
    </DialogContent>
  );
}

/** 안내 창의 한 묶음(제목 + 점 목록). highlight는 금액이 있는 "이렇게 처리돼요" */
function GuideSection({
  title,
  highlight = false,
  children,
}: {
  title: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('flex flex-col gap-1', highlight && 'rounded-lg bg-muted p-3')}>
      <h3 className="font-semibold">{title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>
    </section>
  );
}

/** 3단계: 보낸 뒤 안내. 손님이 언제까지 동의해야 하는지와 손님께 할 말 */
function SentStep({
  summary,
  sent,
  onClose,
}: {
  summary: string;
  sent: RequestedAgreedCancel;
  onClose: () => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{AGREED_CANCEL_SENT_TITLE}</DialogTitle>
        <DialogDescription>{summary}</DialogDescription>
      </DialogHeader>
      <p role="status">
        {agreedCancelSentText(sent.expiresAt)} {AGREED_CANCEL_ASK_CUSTOMER}
      </p>
      <div className="flex justify-end">
        <Button type="button" size="lg" onClick={onClose}>
          확인
        </Button>
      </div>
    </DialogContent>
  );
}
