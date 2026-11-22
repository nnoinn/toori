'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useState,
  useTransition,
} from 'react';

import { Button } from '@/components/ui/button';
import type { Result } from '@/lib/result';

import type { RevealedContact } from './contact-actions';

// 운영자 [번호 보기](#360 4번). 가린 연락처 칸(RevealedValue)과 버튼(RevealButton)을 ContactReveal로 감싼다.
// 누르면 서버 함수(contact-actions.ts)로 전체 연락처를 받아, 가려 있던 칸 자리에 진하게(브랜드 색) 보여 준다.
// 받아 오는 일은 운영자 열람 기록에 남는다.
// 화면을 떠나면 다시 가린다(11/22 nnoinn): Cache Components는 떠난 화면을 상태 그대로 잠시 남겨 두었다가(최근 3화면)
// 더 지나면 지우기 때문에, 그대로 두면 돌아왔을 때 보였다가 안 보였다가 했다. 숨겨질 때(useLayoutEffect 정리) 되돌린다

type RevealState = {
  contact: RevealedContact | null;
  pending: boolean;
  error: string | null;
  show: () => void;
};

const RevealContext = createContext<RevealState | null>(null);

export function ContactReveal({
  reveal,
  children,
}: {
  reveal: () => Promise<Result<RevealedContact>>;
  children: ReactNode;
}) {
  const [contact, setContact] = useState<RevealedContact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 화면을 떠나면(숨겨지거나 사라지면) 다시 가린 상태로 돌린다
  useLayoutEffect(
    () => () => {
      setContact(null);
      setError(null);
    },
    [],
  );

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

  return (
    <RevealContext.Provider value={{ contact, pending, error, show }}>
      {children}
    </RevealContext.Provider>
  );
}

/** 가린 연락처 한 칸. [번호 보기]를 누르면 같은 자리에 전체 값을 진하게(브랜드 색) 보여 준다 */
export function RevealedValue({ field, masked }: { field: keyof RevealedContact; masked: string }) {
  const state = useContext(RevealContext);
  if (!state?.contact) return <span>{masked}</span>;
  return <span className="font-semibold text-primary">{state.contact[field] ?? '-'}</span>;
}

/** [번호 보기] 버튼. 보인 뒤에는 사라지고, 화면을 떠났다 오면 다시 나온다 */
export function RevealButton() {
  const state = useContext(RevealContext);
  if (!state || state.contact) return null;
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={state.show} disabled={state.pending}>
        번호 보기
      </Button>
      <p className="text-xs text-muted-foreground">
        누르면 가린 연락처가 보이고 운영자 열람 기록에 남아요. 화면을 떠나면 다시 가려져요.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
