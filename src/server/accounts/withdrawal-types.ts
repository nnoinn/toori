// 회원 탈퇴·되살리기 함수가 주고받는 값 (#154, 연결 강규민 → 정찬형·정민석). 시각은 ISO 문자열, 날짜는 한국 날짜 'YYYY-MM-DD'.
// 화면과 서버 어디서나 가져올 수 있다. 막힌 이유 문구는 withdrawalBlockerText(./withdrawal-texts)로 만든다

/**
 * 탈퇴를 막는 이유. 하나라도 있으면 탈퇴할 수 없고, 화면은 모두 보여 준다(#154 본문 1장).
 * - UPCOMING_RESERVATION: 이용 예정 예약(고객) / 예약된 매물(원장님). 시작 전
 * - HELD_BY_CUSTOMER: 원장님만. 손님이 결제 중(10분 홀딩)인 게시중 매물(예약됨과 같게 본다)
 * - VISIT_PENDING: 시작이 지났는데 방문·노쇼 처리 전인 예약
 * - UNPAID_SETTLEMENT: 원장님만. 아직 지급하지 않은 정산금. nextPayoutDate는 돌아오는 지급일(보류 중이라 정해지지 않았으면 null)
 * - UNPAID_PENALTY: 원장님만. 아직 정산에서 떼지 못한 원장님 사정 취소 패널티(원)
 * - OPEN_DISPUTE: 확인 중인 이의제기
 */
export type WithdrawalBlocker =
  | { code: 'UPCOMING_RESERVATION'; count: number }
  | { code: 'HELD_BY_CUSTOMER'; count: number }
  | { code: 'VISIT_PENDING'; count: number }
  | { code: 'UNPAID_SETTLEMENT'; nextPayoutDate: string | null }
  | { code: 'UNPAID_PENALTY'; amount: number }
  | { code: 'OPEN_DISPUTE'; count: number };

export type WithdrawalBlockerCode = WithdrawalBlocker['code'];

/** 고객 [회원 탈퇴] 확인(getCustomerWithdrawalCheck) */
export type CustomerWithdrawalCheck = {
  /** 막는 이유(정해 둔 순서). 비어 있으면 탈퇴할 수 있다 */
  blockers: WithdrawalBlocker[];
  /** 탈퇴하면 없어지는 안 쓴 쿠폰 수(기한이 남은 것). 확인 창에 "쿠폰 N장이 없어져요" */
  unusedCouponCount: number;
  /** 지금 결제 중(10분 홀딩)인 매물이 있으면 true. 탈퇴할 때 홀딩을 풀고 진행한다 */
  holding: boolean;
  /** 되살릴 수 있는 기간(일) */
  restoreDays: number;
};

/** 원장님 [원장님 탈퇴] 확인(getOwnerWithdrawalCheck) */
export type OwnerWithdrawalCheck = {
  blockers: WithdrawalBlocker[];
  /** 탈퇴할 때 일괄 마감하는 판매 전 매물·시간대 수(두 번째 확인 창) */
  openSlotCount: number;
  restoreDays: number;
};

/** 탈퇴 처리 결과 */
export type WithdrawnAccount = {
  withdrawnAt: string;
  /** 이 시각 전까지 되살릴 수 있다 */
  restorableUntil: string;
};

export type WithdrawnOwnerAccount = WithdrawnAccount & {
  /** 일괄 마감한 판매 전 매물·시간대 수 */
  closedSlotCount: number;
};

/** 되살릴 수 있는 탈퇴 계정(getRestorableAccount) */
export type RestorableAccount = WithdrawnAccount;

export type RestoredAccount = { restoredAt: string };
