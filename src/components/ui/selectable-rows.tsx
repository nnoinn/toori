'use client';

// 고를 수 있는 표 줄(#360 1번, 11/12 점검 8-1·11/13 nnoinn). 운영자 목록(예약·입점 심사·회원)이 같이 쓴다.
// - 줄을 한 번 누르면 그 줄이 연한 투리 색으로 채워져 선택된 것처럼 보인다(한 표에 한 줄)
// - 두 번 누르거나, 줄에서 Enter를 누르면 상세(href)로 간다. 열 화면이 없는 줄(href 없음, 예: 운영자 기록의 목록 검색)은 고르기만 된다
// - 줄 안의 링크·버튼·입력 칸을 빠르게 두 번 눌러도 상세로 가지 않는다(그 버튼이 할 일만 한다)
// - 운영자 목록은 화면 읽기 프로그램과 마우스 없이 쓰는 사람을 위해 열 화면이 있는 줄 끝 칸에 [상세] 링크(DetailLink)를 꼭 둔다
// - 표가 아닌 목록(`<ul>`/`<li>`)도 쓸 수 있다(as="ul"·as="li"). 원장님 대시보드는 [상세] 버튼 없이
//   두 번 누르기·Enter로 예약 상세를 연다(11/16 정민석). 그때는 title로 마우스 안내를 붙인다
// 쓰는 법:
//   <table>…<SelectableRows>
//     {rows.map((row) => (
//       <SelectableRow key={row.id} id={row.id} href={`/admin/x/${row.id}`}>
//         <td>…</td><td><DetailLink href={`/admin/x/${row.id}`} label={`${row.name} 상세`} /></td>
//       </SelectableRow>
//     ))}
//   </SelectableRows></table>
//   목록: <SelectableRows as="ul">…<SelectableRow as="li" id href title="두 번 누르면 상세">…</SelectableRow>…</SelectableRows>

import { createContext, useContext, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';

import { buttonVariants } from './button';

type Selection = { selectedId: string | null; select: (id: string) => void };

const SelectionContext = createContext<Selection | null>(null);

/** 줄 안에서 스스로 할 일이 있는 것. 여기서 생긴 두 번 누르기·Enter는 줄이 받지 않는다 */
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"]';

/** 이벤트가 줄 자신이나 줄 안의 글자에서 생겼는지(줄 안의 링크·버튼, 줄 밖에 뜬 창에서 생긴 것은 아니다) */
function fromRowItself(target: EventTarget, row: Element): boolean {
  if (!(target instanceof Element) || !row.contains(target)) return false;
  const interactive = target.closest(INTERACTIVE);
  return !interactive || !row.contains(interactive);
}

/** 표의 `<tbody>`(기본) 또는 목록의 `<ul>`. 지금 선택한 줄 하나를 기억한다 */
export function SelectableRows({
  as = 'tbody',
  children,
  className,
}: {
  as?: 'tbody' | 'ul';
  children: React.ReactNode;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const Group = as;
  return (
    <SelectionContext value={{ selectedId, select: setSelectedId }}>
      <Group className={className}>{children}</Group>
    </SelectionContext>
  );
}

/** 표의 한 줄(`<tr>`, 기본) 또는 목록의 한 줄(`<li>`). 한 번 누르면 선택, 두 번 누르거나 Enter면 href로 간다(href가 없으면 고르기만) */
export function SelectableRow({
  as = 'tr',
  id,
  href,
  title,
  children,
  className,
}: {
  as?: 'tr' | 'li';
  id: string;
  /** 두 번 누르거나 Enter를 누르면 여는 화면. 없으면 고르기만 된다 */
  href?: string | null;
  /** 마우스를 올리면 보이는 안내. 예: "두 번 누르면 예약 상세" */
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const selection = useContext(SelectionContext);
  const router = useRouter();
  const selected = selection?.selectedId === id;
  const Row = as;

  return (
    <Row
      tabIndex={0}
      title={title}
      data-selected={selected || undefined}
      className={cn(
        'cursor-pointer outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset data-selected:bg-primary/10 data-selected:hover:bg-primary/15',
        // 표 줄은 아래 선을 직접 긋고, 목록 줄은 목록(divide-y 등)이 긋는다
        as === 'tr' && 'border-b last:border-0',
        className,
      )}
      onClick={() => selection?.select(id)}
      onFocus={() => selection?.select(id)}
      // 두 번 누를 때 글자가 잡히지 않게 한다(한 번 눌러 끌어서 글자를 고르는 것은 그대로)
      onMouseDown={(event) => {
        if (event.detail > 1) event.preventDefault();
      }}
      onDoubleClick={(event) => {
        if (href && fromRowItself(event.target, event.currentTarget)) router.push(href);
      }}
      onKeyDown={(event) => {
        // 줄 안의 링크·버튼에서 누른 Enter는 그 링크·버튼이 처리한다
        if (!href || event.key !== 'Enter' || event.target !== event.currentTarget) return;
        event.preventDefault();
        router.push(href);
      }}
    >
      {children}
    </Row>
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
