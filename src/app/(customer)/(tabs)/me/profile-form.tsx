'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';

import { updateMyProfile } from './actions';
import { NICKNAME_MAX_LENGTH, profileSchema } from './profile-rules';

const INPUT_CLASS =
  'h-11 w-full rounded-lg border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** 닉네임·연락처 고치기 (C-103). 저장 전에 화면에서도 같은 규칙으로 먼저 확인한다 */
export function ProfileForm({ nickname, phone }: { nickname: string; phone: string }) {
  const [values, setValues] = useState({ nickname, phone });
  const [message, setMessage] = useState<{ kind: 'error' | 'done'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = values.nickname !== nickname || values.phone !== phone;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      setMessage({
        kind: 'error',
        text: parsed.error.issues[0]?.message ?? '입력한 내용을 확인해 주세요',
      });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await updateMyProfile(values);
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.error.message });
        return;
      }
      // 저장된 모양(예: 010-1234-5678)으로 맞춘다
      setValues({ nickname: parsed.data.nickname, phone: parsed.data.phone ?? '' });
      setMessage({ kind: 'done', text: '저장했어요' });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label="내 정보 고치기">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">닉네임</span>
        <input
          className={INPUT_CLASS}
          value={values.nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          onChange={(e) => setValues((prev) => ({ ...prev, nickname: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">연락처</span>
        <input
          className={INPUT_CLASS}
          value={values.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="010-1234-5678"
          onChange={(e) => setValues((prev) => ({ ...prev, phone: e.target.value }))}
        />
        <span className="text-xs text-muted-foreground">
          예약 확인과 노쇼 연락에만 써요. 예약하기 전에 꼭 입력해 주세요.
        </span>
      </label>
      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'}
        >
          {message.text}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="h-11 self-start" disabled={!changed || pending}>
        {pending ? '저장하는 중…' : '저장'}
      </Button>
    </form>
  );
}
