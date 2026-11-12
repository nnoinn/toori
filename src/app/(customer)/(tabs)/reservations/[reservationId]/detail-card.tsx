import { cn } from 'cn';

import { Card } from '@/components/ui/card';

/**
 * 예약 상세의 칸 하나(#359 2번). 회색 배경 위 흰 둥근 카드(공통 UI Card)로, 폰에서는 양옆 16px을 띄우고 PC에서는 가운데 줄을 꽉 채운다.
 * 이름(aria-label·aria-labelledby)을 주면 화면 읽기 프로그램이 칸 하나로 읽는다(section과 같다)
 */
export function DetailCard({ className, ...props }: React.ComponentProps<'div'>) {
  const named = props['aria-label'] !== undefined || props['aria-labelledby'] !== undefined;
  return (
    <Card
      role={named ? 'region' : undefined}
      className={cn('mx-4 gap-2 px-4 text-base md:mx-0', className)}
      {...props}
    />
  );
}
