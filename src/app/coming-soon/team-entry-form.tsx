'use client';

import { useId, useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { enterWithTeamCode } from './actions';

const ENTER_FAILED_MESSAGE = '들어가지 못했어요. 잠시 후 다시 해 주세요';

type TeamEntryFormProps = {
  /** 코드를 넣은 뒤 돌아갈 곳(서버가 안전한 주소로 정리한 값) */
  next: string;
};

/**
 * 잠금 화면 아래의 작은 팀원 입장 칸(#303). 팀 접속 코드는 팀원 단톡방으로만 전한다.
 * 한글 단어를 넣을 수 있게 비밀번호 칸이 아닌 일반 칸으로 둔다(폰의 비밀번호 칸은 한글 입력이 막히기도 한다)
 */
export function TeamEntryForm({ next }: TeamEntryFormProps) {
  const inputId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const canSubmit = code.trim() !== '' && !pending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        // 맞으면 서버가 가려던 화면으로 보내서 돌아오지 않는다
        const result = await enterWithTeamCode({ code, next });
        if (!result.ok) setError(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setError(ENTER_FAILED_MESSAGE);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t pt-6">
      <Label htmlFor={inputId} className="text-muted-foreground">
        팀원 입장
      </Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          placeholder="팀 접속 코드"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          enterKeyHint="go"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        <Button type="submit" variant="outline" className="h-9 px-4" disabled={!canSubmit}>
          {pending ? '확인 중' : '들어가기'}
        </Button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
