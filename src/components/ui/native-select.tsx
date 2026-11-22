// 고르기 칸(`<select>`) 모양. 공통 UI에 따로 고르기 부품(펼침 목록)을 두지 않고, 브라우저 기본 `<select>`에 이 값을 붙여
// Input과 같은 높이·테두리로 보이게 한다. 오류면(aria-invalid) 테두리가 빨갛다.
// 원장님 입력 칸(form-field.tsx)·운영자 이의제기 등록·목록 정렬 고르기(SortSelect)가 같이 쓴다(#212 3번)

import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

export const NATIVE_SELECT_CLASS =
  'h-9 rounded-lg border bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive';

/**
 * NATIVE_SELECT_CLASS를 붙인 `<select>`에 꺽쇠를 그려 준다(11/19 운영자 화면 피드백).
 * 브라우저 기본 꺽쇠는 칸 오른쪽 테두리에 붙고 오른쪽 여백을 늘려도 움직이지 않아서(크롬), 기본 꺽쇠를 숨기고 테두리에서 띄워 그린다.
 * `<select>`에 주던 값(name·defaultValue·onChange·폭 className 등)을 그대로 준다. 서버 화면에서도 쓴다.
 * 예: <NativeSelect name="kind" defaultValue="" className="w-40">…<option>…</NativeSelect>
 */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <span className="relative inline-flex">
      <select
        {...props}
        className={cn(NATIVE_SELECT_CLASS, 'w-full appearance-none pr-9', className)}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
