// 운영자 문제 대처(#373) 정책 값. 화면과 서버가 같이 쓴다.

/** 운영자 처리 사유(필수, #373 공통 규칙)의 안전 상한. 화면은 그 전에 입력을 멈춘다 */
export const ADMIN_REASON_LIMIT = 1000;

/**
 * 결제 정리 작업이 고치지 못한 주문으로 보는 나이(#373 ①). 주문이 정리 대상(STALE_ORDER_MINUTES 30분)이 된 뒤
 * 정리 작업(10분마다)이 세 번쯤 돌고도 남은 주문이다
 */
export const STUCK_ORDER_MINUTES = 60;

/**
 * 끝나지 않은 환불로 보는 나이(#373 ①). 진행 중 취소가 정리 대상(STALE_CANCEL_MINUTES 5분)이 된 뒤
 * 정리 작업이 두세 번 돌고도 남은 것이다
 */
export const STUCK_CANCEL_MINUTES = 30;
