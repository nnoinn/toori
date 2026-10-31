'use client';

import { useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { updateMyProfile } from './actions';
import { NICKNAME_MAX_LENGTH, profileSchema } from './profile-rules';

// 공통 Input은 h-9·text-sm이다. 이 화면은 손가락으로도 누르기 쉽게 조금 크게 쓴다
const FIELD_SIZE = 'h-11 text-base';

type Field = 'nickname' | 'phone';

/** 닉네임·연락처 고치기 (C-103). 저장 전에 화면에서도 같은 규칙으로 먼저 확인한다 */
export function ProfileForm({ nickname, phone }: { nickname: string; phone: string }) {
  const id = useId();
  const [values, setValues] = useState({ nickname, phone });
  const [message, setMessage] = useState<{ kind: 'error' | 'done'; text: string } | null>(null);
  // 화면 확인에서 틀린 칸. 그 칸에 빨간 테두리를 준다
  const [invalidField, setInvalidField] = useState<Field | null>(null);
  const [pending, startTransition] = useTransition();
  // 화면을 떠났다 와도 Next.js는 이 화면의 입력값을 그대로 남겨 둔다(Activity).
  // 다른 화면(예약 확인)에서 연락처를 바꿔 서버 값이 달라졌으면 입력칸도 맞춘다. 안 맞추면 옛 번호로 덮어쓴다
  const [server, setServer] = useState({ nickname, phone });
  if (server.nickname !== nickname || server.phone !== phone) {
    setServer({ nickname, phone });
    setValues({ nickname, phone });
  }
  const changed = values.nickname !== nickname || values.phone !== phone;

  function change(field: Field, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (invalidField === field) setInvalidField(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];
      setInvalidField(field === 'nickname' || field === 'phone' ? field : null);
      setMessage({ kind: 'error', text: issue?.message ?? '입력한 내용을 확인해 주세요' });
      return;
    }
    setInvalidField(null);
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
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-nickname`}>닉네임</Label>
        <Input
          id={`${id}-nickname`}
          className={FIELD_SIZE}
          value={values.nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          autoComplete="nickname"
          aria-invalid={invalidField === 'nickname' || undefined}
          onChange={(e) => change('nickname', e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-phone`}>연락처</Label>
        <Input
          id={`${id}-phone`}
          className={FIELD_SIZE}
          value={values.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="010-1234-5678"
          aria-describedby={`${id}-phone-help`}
          aria-invalid={invalidField === 'phone' || undefined}
          onChange={(e) => change('phone', e.target.value)}
        />
        <p id={`${id}-phone-help`} className="text-xs text-muted-foreground">
          예약 확인과 노쇼 연락에만 써요. 예약하기 전에 꼭 입력해 주세요.
        </p>
      </div>
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
