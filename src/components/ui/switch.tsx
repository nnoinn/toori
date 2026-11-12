import * as React from 'react';
import { cn } from 'cn';

type SwitchProps = Omit<React.ComponentProps<'button'>, 'onChange' | 'role' | 'type'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

// 켜기·끄기 스위치. 이름표는 aria-labelledby(또는 aria-label)로 이어 준다. 예: 내 정보 > 알림
// 폰(md 미만)에서는 보이는 모양(48×28px)은 그대로 두고, 둘레에 보이지 않는 칸(after)을 더해 손가락으로 누르는 범위를 64×44px로 넓힌다
export function Switch({ checked, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60',
        "max-md:after:absolute max-md:after:-inset-2 max-md:after:content-['']",
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span
        className={cn(
          'absolute top-1 left-1 size-5 rounded-full bg-background shadow-sm transition-transform',
          checked && 'translate-x-5',
        )}
        aria-hidden
      />
    </button>
  );
}
