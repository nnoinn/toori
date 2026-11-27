// 최근 본 매물(C-212) 한 줄. 서버(actions.ts)가 지금 값으로 다시 읽어서 준다. 글자는 화면이 recent-rules.ts로 만든다

export type RecentItem = {
  kind: 'slot' | 'window';
  id: string;
  shopName: string;
  /** 시술 이름. 시간대면 고를 수 있는 첫 서비스 이름 */
  menuName: string;
  /** 시간대의 고를 수 있는 서비스 수. 한 시술 매물은 1 */
  menuCount: number;
  /** 시작 시각(ISO). 시간대면 시간대 시작 */
  startAt: string;
  /** 시간대 끝(ISO). 한 시술 매물은 null */
  endAt: string | null;
  /** 할인율. 시간대면 서비스 중 가장 큰 할인율 */
  discountRate: number;
  /** 판매가. 시간대면 서비스 중 가장 낮은 판매가 */
  salePrice: number;
  /** 예약할 수 없는 매물(예약됨·마감·취소·완료, 다른 고객이 결제 중은 아님). 흐리게 보여 준다 */
  closed: boolean;
};
