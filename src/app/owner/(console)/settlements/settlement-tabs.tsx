// 원장님 정산 내역의 탭 (O15). [정산서](S-501, 처음 열면 이 탭) / [거래 내역](S-502). 서버에서 그리는 부품이라 상태가 없다.
// 두 목록은 기간을 찾는 날짜가 달라서(정산서는 지급일, 거래 내역은 처리·취소일) 한 화면에 섞지 않고 탭으로 나눈다(11/14 정민석).
// 탭을 바꿔도 보던 기간은 그대로 둔다. 주소: 정산서 /owner/settlements, 거래 내역 /owner/settlements?view=items

import Link from 'next/link';

import { Button } from '@/components/ui/button';

import {
  periodHrefValue,
  SETTLEMENT_VIEW_LABELS,
  type SettlementPeriod,
  type SettlementView,
  settlementsHref,
} from './settlement-format';

const VIEWS: readonly SettlementView[] = ['statements', 'items'];

export function SettlementTabs({
  view,
  period,
}: {
  view: SettlementView;
  period: SettlementPeriod;
}) {
  return (
    <nav aria-label="정산 내역 보기" className="flex gap-2">
      {VIEWS.map((key) => {
        const current = view === key;
        return (
          <Button key={key} asChild variant={current ? 'default' : 'outline'}>
            <Link
              href={settlementsHref(periodHrefValue(period), { view: key })}
              aria-current={current ? 'page' : undefined}
            >
              {SETTLEMENT_VIEW_LABELS[key]}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
