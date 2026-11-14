'use client';

// 고를 수 있는 표 줄(#360 1번, 11/12 점검 8-1·11/13 nnoinn). 운영자 목록(예약·입점 심사·회원)이 같이 쓴다.
// - 줄을 한 번 누르면 그 줄이 연한 투리 색으로 채워져 선택된 것처럼 보인다(한 표에 한 줄)
// - 두 번 누르거나, 줄에서 Enter를 누르면 상세(href)로 간다
// - 화면 읽기 프로그램과 마우스 없이 쓰는 사람을 위해 줄 끝 칸에 [상세] 링크(DetailLink)를 꼭 둔다
// 쓰는 법:
//   <table>…<SelectableRows>
//     {rows.map((row) => (
//       <SelectableRow key={row.id} id={row.id} href={`/admin/x/${row.id}`}>
//         <td>…</td><td><DetailLink href={`/admin/x/${row.id}`} label={`${row.name} 상세`} /></td>
//       </SelectableRow>
//     ))}
//   </SelectableRows></table>

import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';

import { buttonVariants } from './button';

type Selection = { selectedId: string | null; select: (id: string) => void };

const SelectionContext = createContext<Selection | null>(null);

/** 표의 `<tbody>`. 지금 선택한 줄 하나를 기억한다 */
export function SelectableRows({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <SelectionContext value={{ selectedId, select: setSelectedId }}>
      <tbody className={className}>{children}</tbody>
    </SelectionContext>
  );
}

/** 표의 한 줄. 한 번 누르면 선택, 두 번 누르거나 Enter면 href로 간다 */
export function SelectableRow({
  id,
  href,
  children,
  className,
}: {
  id: string;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const selection = useContext(SelectionContext);
  const router = useRouter();
  const selected = selection?.selectedId === id;

  return (
    <tr
      tabIndex={0}
      data-selected={selected || undefined}
      className={cn(
        'cursor-pointer border-b outline-none last:border-0 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset data-selected:bg-primary/10 data-selected:hover:bg-primary/15',
        className,
      )}
      onClick={() => selection?.select(id)}
      onFocus={() => selection?.select(id)}
      // 두 번 누를 때 글자가 잡히지 않게 한다(한 번 눌러 끌어서 글자를 고르는 것은 그대로)
      onMouseDown={(event) => {
        if (event.detail > 1) event.preventDefault();
      }}
      onDoubleClick={() => router.push(href)}
      onKeyDown={(event) => {
        // 줄 안의 링크·버튼에서 누른 Enter는 그 링크·버튼이 처리한다
        if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
        event.preventDefault();
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}

/** 줄 끝 칸의 [상세] 링크. label은 화면 읽기 프로그램이 읽는 이름(예: "예약 1234 상세") */
export function DetailLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
      // 줄을 선택하는 클릭과 겹치지 않게 한다
      onClick={(event) => event.stopPropagation()}
    >
      상세
    </Link>
  );
}
