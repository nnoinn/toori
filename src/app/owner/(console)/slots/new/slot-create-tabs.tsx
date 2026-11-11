'use client';

// 매물 등록 방식 고르기 (#308, S-201). "한 시술 매물"(서비스 하나를 정한 시각에, 지금 방식)과
// "시간대 매물"(빈 시간대를 통째로, 고객이 서비스와 시작 시각을 고름) 중 하나를 탭으로 고른다.
// 처음에는 지금 방식 탭이 열려 있다(11/11 정민석). 탭을 오가도 고르던 값이 남도록 두 화면을 다 두고 하나만 보여준다.

import { useId, useState } from 'react';
import { cn } from 'cn';

const METHODS = [
  { key: 'single', title: '한 시술 매물', description: '서비스 하나를 정한 시각에 올려요' },
  {
    key: 'window',
    title: '시간대 매물',
    description: '빈 시간대를 통째로 올리면 고객이 그 안에서 서비스와 시작 시각을 골라요',
  },
] as const;

type Method = (typeof METHODS)[number]['key'];

export function SlotCreateTabs({
  single,
  windowForm,
}: {
  /** 한 시술 매물 등록(SlotForm) */
  single: React.ReactNode;
  /** 시간대 매물 등록(WindowForm) */
  windowForm: React.ReactNode;
}) {
  const [method, setMethod] = useState<Method>('single');
  const id = useId();
  const panels: Record<Method, React.ReactNode> = { single, window: windowForm };

  /** 탭 목록 안에서 왼쪽·오른쪽 화살표로 오간다 */
  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = method === 'single' ? 'window' : 'single';
    setMethod(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="등록 방식" className="grid grid-cols-2 gap-2">
        {METHODS.map((item) => {
          const current = method === item.key;
          return (
            <button
              key={item.key}
              id={`${id}-tab-${item.key}`}
              type="button"
              role="tab"
              aria-selected={current}
              aria-controls={`${id}-panel-${item.key}`}
              tabIndex={current ? 0 : -1}
              onClick={() => setMethod(item.key)}
              onKeyDown={onKeyDown}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-xl border bg-card p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                current ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted',
              )}
            >
              <span className={cn('font-semibold', current && 'text-primary')}>{item.title}</span>
              <span className="text-sm text-muted-foreground">{item.description}</span>
            </button>
          );
        })}
      </div>
      {METHODS.map((item) => (
        <div
          key={item.key}
          id={`${id}-panel-${item.key}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${item.key}`}
          hidden={method !== item.key}
        >
          {panels[item.key]}
        </div>
      ))}
    </div>
  );
}
