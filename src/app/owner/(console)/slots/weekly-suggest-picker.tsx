'use client';

// 매물 등록 맨 위 "이번 주 권하는 매물"(S-411 주간 매물 등록 권유). 월요일 권유 알림을 누르면(?from=weekly-suggest) 보인다.
// 처음에는 첫 권유를 채운 채로 ③ 할인율·확인을 열고, 다른 권유를 누르면 그 값으로 바꾼다(slot-form.tsx).
// 올린 권유는 "올렸어요"로 잠그고, 등록 완료 카드 위에도 남겨 남은 권유를 바로 누를 수 있게 한다.
// 권할 것이 없으면(그사이 올렸거나 시간이 지남) 한 줄로 알리고 평소처럼 고르게 한다. 계산·글자는 slot-suggestions.ts

import { cn } from 'cn';
import { CircleCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { WEEKLY_SUGGEST_LOOKBACK_WEEKS } from '@/server/policy';

import type { SlotMenuOption } from './slot-form';
import {
  type ChosenSlotValues,
  isSameSuggestion,
  type SuggestionChip,
  suggestionLabel,
} from './slot-suggestions';

export function WeeklySuggestPicker({
  chips,
  menus,
  chosen,
  posted,
  disabled,
  onChoose,
}: {
  chips: readonly SuggestionChip[];
  menus: readonly SlotMenuOption[];
  chosen: ChosenSlotValues;
  /** 이 화면에서 올린 권유의 시작 시각(startIso) */
  posted: ReadonlySet<string>;
  disabled: boolean;
  onChoose: (chip: SuggestionChip) => void;
}) {
  return (
    <section
      aria-labelledby="weekly-suggest-title"
      className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id="weekly-suggest-title" className="text-sm font-semibold">
          이번 주 권하는 매물
        </h2>
        <p className="text-xs text-muted-foreground">
          {chips.length > 0
            ? `지난 ${WEEKLY_SUGGEST_LOOKBACK_WEEKS}주에 잘 팔린 요일·시간이에요. 누르면 서비스·시간·할인율을 채워요. 가격은 지금 메뉴 값이에요.`
            : '지금은 이번 주에 권할 매물이 없어요. 그사이 매물을 올렸거나 권하던 시간이 지났어요. 아래에서 직접 골라 올려 주세요.'}
        </p>
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const menu = menus.find((item) => item.id === chip.menuId);
            if (!menu) return null;
            const label = suggestionLabel(chip, menu.name);
            if (posted.has(chip.startIso)) {
              return (
                <Button
                  key={chip.startIso}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled
                  aria-label={`${label}, 올렸어요`}
                >
                  <CircleCheck className="text-primary" aria-hidden />
                  {label} · 올렸어요
                </Button>
              );
            }
            const pressed = isSameSuggestion(chip, chosen);
            return (
              <Button
                key={chip.startIso}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={pressed}
                disabled={disabled}
                className={cn(pressed && 'border-primary bg-primary/10 text-primary')}
                onClick={() => onChoose(chip)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
