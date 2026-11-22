'use client';

// 매물 등록 맨 위 "지난 매물로 빠르게 올리기"(S-207 매물 복제). 누르면 slot-form.tsx가 ①③ 값을 채우고 ② 시간부터 연다.
// 지금 고른 값과 같은 구성은 눌린 버튼으로 보여 준다. 계산·글자는 slot-presets.ts

import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import type { DiscountRate } from '@/server/policy';

import type { SlotMenuOption } from './slot-form';
import { isSameSlotPreset, type SlotPreset, slotPresetLabel } from './slot-presets';

export function SlotPresetPicker({
  presets,
  menus,
  chosen,
  disabled,
  onChoose,
}: {
  presets: readonly SlotPreset[];
  menus: readonly SlotMenuOption[];
  chosen: { menuId: string | null; discountRate: DiscountRate | null; newCustomerOnly: boolean };
  disabled: boolean;
  onChoose: (preset: SlotPreset) => void;
}) {
  return (
    <section aria-labelledby="slot-presets-title" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 id="slot-presets-title" className="text-sm font-semibold">
          지난 매물로 빠르게 올리기
        </h2>
        <p className="text-xs text-muted-foreground">
          서비스·할인율·신규 고객 전용을 채워요. 날짜와 시간만 고르면 돼요. 가격은 지금 메뉴
          값이에요.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const menu = menus.find((item) => item.id === preset.menuId);
          if (!menu) return null;
          const pressed = isSameSlotPreset(preset, chosen);
          return (
            <Button
              key={`${preset.menuId}-${preset.discountRate}-${preset.newCustomerOnly}`}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={pressed}
              disabled={disabled}
              className={cn(pressed && 'border-primary bg-primary/10 text-primary')}
              onClick={() => onChoose(preset)}
            >
              {slotPresetLabel(preset, menu.name)}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
