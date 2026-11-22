'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { Result } from '@/lib/result';

import type { RevealedContact } from './contact-actions';

// 운영자 [번호 보기](#360 4번). 누르면 서버 함수(contact-actions.ts)로 전체 연락처를 받아 버튼 자리에 보여 준다.
// 받아 오는 일은 운영자 열람 기록에 남는다
export function ContactReveal({ reveal }: { reveal: () => Promise<Result<RevealedContact>> }) {
  const [contact, setContact] = useState<RevealedContact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function show() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await reveal();
        if (result.ok) setContact(result.data);
        else setError(result.error.message);
      } catch {
        setError('연락처를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    });
  }

  if (contact) {
    return (
      <p className="text-sm">
        휴대폰 {contact.phone ?? '-'}
        {contact.email ? ` · 이메일 ${contact.email}` : null}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={show} disabled={pending}>
        번호 보기
      </Button>
      <p className="text-xs text-muted-foreground">
        누르면 전체 연락처가 보이고, 운영자 열람 기록에 남아요.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
