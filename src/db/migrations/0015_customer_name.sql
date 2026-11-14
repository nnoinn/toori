-- 고객 이름 (#375, 11/13 nnoinn 결정). 예약자 이름으로 가입 때 받고, 예약한 샵에는 이름과 휴대폰 번호만 준다
-- 지금 있는 계정(모두 테스트 계정)은 닉네임으로 채운 뒤 NOT NULL을 건다. 길이(앞뒤 공백 빼고 1~30자)는 계정 확인 함수에서 검사한다
ALTER TABLE "customers" ADD COLUMN "name" text;--> statement-breakpoint
UPDATE "customers" SET "name" = "nickname";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "name" SET NOT NULL;
