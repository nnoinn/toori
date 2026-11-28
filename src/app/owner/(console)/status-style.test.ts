// 원장님 화면 상태 배지 색(#23 디자인 A6)의 "같은 뜻이면 같은 색" 규칙.
// 대시보드(매물 상태)·예약 상세(예약 상태)·정산 내역(거래 종류)이 한 화면의 색만 바꿔 서로 달라지지 않게 지킨다
import { describe, expect, it } from 'vitest';

import {
  RESERVATION_VIEW_STYLE,
  SETTLEMENT_KIND_STYLE,
  SETTLEMENT_STATUS_TEXT_STYLE,
  SLOT_STATUS_STYLE,
} from './status-style';

describe('원장님 상태 배지 색 (#23 A6)', () => {
  it('같은 뜻이면 화면이 달라도 같은 색이다: 예약됨 = 예정, 완료 = 방문 완료 = 이용 완료, 취소 = 취소, 노쇼 = 노쇼', () => {
    expect(SLOT_STATUS_STYLE.reserved).toBe(RESERVATION_VIEW_STYLE.upcoming);
    expect(SLOT_STATUS_STYLE.completed).toBe(RESERVATION_VIEW_STYLE.visited);
    expect(SETTLEMENT_KIND_STYLE.sale).toBe(RESERVATION_VIEW_STYLE.visited);
    expect(SLOT_STATUS_STYLE.cancelled).toBe(RESERVATION_VIEW_STYLE.cancelled);
    expect(SETTLEMENT_KIND_STYLE.no_show).toBe(RESERVATION_VIEW_STYLE.noShow);
  });

  it('팔리지 않은 것(마감·취소)과 정산할 금액이 없는 거래는 같은 흐린 색이다', () => {
    const off = SLOT_STATUS_STYLE.closed;
    expect(SLOT_STATUS_STYLE.cancelled).toBe(off);
    expect(SETTLEMENT_KIND_STYLE.penalty).toBe(off);
    expect(SETTLEMENT_KIND_STYLE.agreed_cancel).toBe(off);
    expect(SETTLEMENT_KIND_STYLE.void).toBe(off);
  });

  it('게시예정·게시중·예약됨·방문 처리 필요·노쇼·끝남·팔리지 않음은 서로 다른 색이다', () => {
    const tones = [
      SLOT_STATUS_STYLE.scheduled,
      SLOT_STATUS_STYLE.published,
      SLOT_STATUS_STYLE.reserved,
      RESERVATION_VIEW_STYLE.needsVisit,
      RESERVATION_VIEW_STYLE.noShow,
      SLOT_STATUS_STYLE.completed,
      SLOT_STATUS_STYLE.closed,
    ];
    expect(new Set(tones).size).toBe(tones.length);
  });

  it('원장님 사정 취소는 패널티가 붙어서 방문 처리 필요처럼 눈에 띄는 색이다', () => {
    expect(SETTLEMENT_KIND_STYLE.owner_cancel).toBe(RESERVATION_VIEW_STYLE.needsVisit);
  });

  it('지급 상태 글자 색: 보류는 노란색, 실패는 빨간색, 지급 끝·정산 없음은 흐리게', () => {
    expect(SETTLEMENT_STATUS_TEXT_STYLE.held).toContain('warning');
    expect(SETTLEMENT_STATUS_TEXT_STYLE.failed).toContain('destructive');
    expect(SETTLEMENT_STATUS_TEXT_STYLE.paid).toBe('text-muted-foreground');
    expect(SETTLEMENT_STATUS_TEXT_STYLE.no_payout).toBe('text-muted-foreground');
  });
});
