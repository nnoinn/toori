// DB 스키마. 설계는 현동훈(docs/schema-v1.md), 구현은 강규민(로드맵 W1).
// 테이블·컬럼 이름은 코드에서 camelCase로 쓰면 DB에는 snake_case로 만들어진다(casing 설정).
// 실제 정의는 schema/ 폴더에 나눠 두고 여기서 다시 내보낸다(drizzle.config.ts가 이 파일을 본다).
// W1a: 계정·샵·매물·위치 기록. W1b: 결제·예약, 환불·쿠폰·패널티, 정산, 알림·관심, 운영자.
export * from './schema/accounts';
export * from './schema/admin';
export * from './schema/logs';
export * from './schema/notifications';
export * from './schema/payments';
export * from './schema/refunds';
export * from './schema/settlements';
export * from './schema/shops';
export * from './schema/slots';
