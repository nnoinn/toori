'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { SITE_NAME } from '@/lib/site';

import {
  AGREEMENT_ITEMS,
  allChecked,
  allRequiredChecked,
  EMPTY_AGREEMENTS,
  toAgreementsInput,
  toggleAll,
  type AgreementState,
} from './agreements';

type JoinFormProps = {
  /** 가입을 마치면 돌아갈 곳(로그인 콜백이 넘겨준 안전한 주소) */
  next: string;
};

/** 첫 로그인 고객의 약관 동의 화면 (C-104, J8). 주소: /join?next=... (D16) */
export function JoinForm({ next }: JoinFormProps) {
  const [state, setState] = useState<AgreementState>(EMPTY_AGREEMENTS);
  const [notice, setNotice] = useState<string | null>(null);
  const canSubmit = allRequiredChecked(state);

  function handleSubmit() {
    const agreements = toAgreementsInput(state);
    if (!agreements) return;
    // TODO(#47 1장): 강규민님 createCustomerAccount({ agreements, next })가 들어오면 연결한다
    void next;
    setNotice('가입 연결은 준비 중이에요.');
  }

  return (
    <section className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-8">
      <BackButton className="-ml-2 self-start" />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{SITE_NAME} 이용을 위해 동의해 주세요</h1>
        <p className="text-sm text-muted-foreground">
          필수 항목에 모두 동의하면 시작할 수 있어요. 선택 항목은 동의하지 않아도 돼요.
        </p>
      </div>

      <label className="flex items-center gap-3 rounded-xl border p-4 font-semibold">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={allChecked(state)}
          onChange={() => setState(toggleAll)}
        />
        전체 동의 (선택 항목 포함)
      </label>

      <ul className="flex flex-col gap-4 px-1">
        {AGREEMENT_ITEMS.map((item) => (
          <li key={item.key} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <label className="flex flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={state[item.key]}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setState((prev) => ({ ...prev, [item.key]: checked }));
                  }}
                />
                <span className="text-sm">
                  <span className={item.required ? 'text-primary' : 'text-muted-foreground'}>
                    [{item.required ? '필수' : '선택'}]
                  </span>{' '}
                  {item.label}
                </span>
              </label>
              {/* 약관 본문(docs/legal/, 법률 검토 전)은 검토가 끝나면 화면으로 연결한다 */}
              {item.hasDocument ? (
                <button
                  type="button"
                  className="flex items-center text-xs text-muted-foreground"
                  aria-label={`${item.label} 내용 보기`}
                  onClick={() => setNotice('약관 내용은 준비 중이에요.')}
                >
                  보기
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            {item.description ? (
              <ul className="flex flex-col gap-0.5 pl-8 text-xs text-muted-foreground">
                {item.description.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        {notice ? (
          <p role="status" className="text-center text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="h-12 text-base"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          시작하기
        </Button>
      </div>
    </section>
  );
}
