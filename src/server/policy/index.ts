// 정책 숫자(시간, 비율, 금액)는 이 폴더에만 둔다. 화면·서버 코드는 @/server/policy에서 가져다 쓴다(연결 #5, Issue #48).
// 확정된 값은 CLAUDE.md "핵심 비즈니스 규칙"과 docs/tech-guide.md "7. 결정 필요 목록"을 따르고,
// 아직 정해지지 않은 값(결제 수수료율 등)은 임의로 넣지 않고 null로 비워 둔다.
// 화면('use client')에서도 가져다 쓰므로 이 폴더에는 server-only 표시를 하지 않는다. 숫자와 순수 계산 함수만 둔다.
export * from './catalog';
export * from './fees';
export * from './filters';
export * from './notifications';
export * from './owner-fault';
export * from './pricing';
export * from './refund';
export * from './slot-time';
export * from './terms';
export * from './upload';
