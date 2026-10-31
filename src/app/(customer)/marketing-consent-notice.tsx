'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { marketingResultMessage } from '@/app/(customer)/(tabs)/me/profile-rules';
import { takeMarketingConsentNotice } from '@/server/auth/customer-account';

/**
 * 가입 때 고른 광고성 정보 수신 동의의 처리 결과를 가입 직후 처음 보이는 화면에 한 번 보여준다
 * (동의 문구 6-1장, 10/27 결정, #115). pending은 안내 쿠키가 있는지(ConsentNoticeGate).
 * 꺼내면서 서버가 지우므로 다시 보이지 않는다. 닫기 전까지 화면 아래에 남는다
 */
export function MarketingConsentNotice({ pending }: { pending: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  // 꺼내는 중에 다시 부르지 않는다(개발 모드에서 효과가 두 번 돌 때 등). 쿠키가 사라지면 다음 가입을 위해 푼다
  const taking = useRef(false);

  useEffect(() => {
    if (!pending) {
      taking.current = false;
      return;
    }
    if (taking.current) return;
    taking.current = true;
    takeMarketingConsentNotice()
      .then((result) => {
        if (result.ok && result.data) {
          setMessage(marketingResultMessage(true, new Date(result.data.agreedAt)));
        }
      })
      .catch(() => {
        // 못 꺼내도 화면은 그대로 쓴다. 쿠키가 남아 있으면 다음 화면에서 다시 시도한다
        taking.current = false;
      });
  }, [pending]);

  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto flex w-[calc(100%-2rem)] max-w-md items-start gap-3 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg md:bottom-6"
    >
      <p className="flex-1">{message}</p>
      <button
        type="button"
        className="shrink-0 opacity-80 hover:opacity-100"
        aria-label="안내 닫기"
        onClick={() => setMessage(null)}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
