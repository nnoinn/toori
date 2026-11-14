'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NATIVE_SELECT_CLASS } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type { DisputeType } from '@/db/schema';
import { formatKstDateTime } from '@/lib/time';
import { DISPUTE_CONTENT_LIMIT } from '@/server/policy/dispute';

import { registerKakaoDisputeAction } from '../../disputes/actions';
import { fromKstInputValue } from '../../disputes/format';

// 운영자 예약 상세의 [이의제기 등록](A-104, W19 ②). 카카오톡 채널로 받은 이의제기를 받은 시각과 함께 남긴다.
// 고를 수 있는 종류는 서버가 이 예약 기준으로 계산해서 넘긴다. 접수 기한이 지난 뒤에 받은 문의는 서버가 막는다
// (카카오톡 채널에서 일반 문의로 응대, 11/12 결정). 등록하면 그 이의제기 상세로 간다
export function RegisterDispute({
  reservationId,
  types,
  defaultReceivedAt,
}: {
  reservationId: string;
  types: { value: DisputeType; label: string }[];
  /** 받은 시각 칸의 처음 값(한국 시간 "YYYY-MM-DDTHH:mm", 지금) */
  defaultReceivedAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DisputeType | ''>(types.length === 1 ? types[0].value : '');
  const [receivedAt, setReceivedAt] = useState(defaultReceivedAt);
  const [content, setContent] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const iso = fromKstInputValue(receivedAt);
    if (!type || !iso) return;
    setMessage(null);
    setExistingId(null);
    startTransition(async () => {
      const result = await registerKakaoDisputeAction({
        reservationId,
        type,
        content,
        receivedAt: iso,
      });
      if (result.ok) {
        router.push(`/admin/disputes/${result.data.disputeId}`);
        return;
      }
      const { error } = result;
      setExistingId(error.disputeId ?? null);
      setMessage(
        error.deadline
          ? `${error.message} (접수 기한 ${formatKstDateTime(error.deadline)})`
          : error.message,
      );
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        이의제기 등록
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? null : setOpen(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>카카오톡 채널로 받은 이의제기 등록</DialogTitle>
            <DialogDescription>
              채널에서 받은 시각으로 접수 기한을 봐요. 등록하면 결론을 기록할 때까지 이 거래의
              정산이 보류돼요.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dispute-type">종류</Label>
              <select
                id="dispute-type"
                className={NATIVE_SELECT_CLASS}
                value={type}
                onChange={(event) => setType(event.target.value as DisputeType)}
              >
                <option value="" disabled>
                  골라 주세요
                </option>
                {types.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dispute-received-at">채널에서 받은 시각(한국 시간)</Label>
              <Input
                id="dispute-received-at"
                type="datetime-local"
                value={receivedAt}
                max={defaultReceivedAt}
                onChange={(event) => setReceivedAt(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dispute-content">내용</Label>
              <Textarea
                id="dispute-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={DISPUTE_CONTENT_LIMIT}
                placeholder="고객이 채널에서 말한 내용을 적어 주세요. 전화번호 같은 개인정보는 적지 않아도 돼요"
                rows={5}
              />
            </div>
          </div>
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
              {existingId ? (
                <>
                  {' '}
                  <Link href={`/admin/disputes/${existingId}`} className="underline">
                    그 이의제기 보기
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button
              disabled={pending || !type || content.trim() === '' || !fromKstInputValue(receivedAt)}
              onClick={submit}
            >
              등록하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
