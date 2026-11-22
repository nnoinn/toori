-- 국세청 사업자등록 진위확인 결과(#208). 입점 신청과 사업자 정보 수정(번호·개업일자·대표자 이름이 바뀔 때) 때 확인한 결과와 시각.
-- verified(맞음) / unavailable(국세청이 응답하지 않아 확인 못 함). 비어 있으면 확인 안 함(키가 없는 개발 환경, 이 기능 전에 만든 샵)
ALTER TABLE "shops" ADD COLUMN "nts_check" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "nts_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_nts_check_check" CHECK ("shops"."nts_check" is null or "shops"."nts_check" in ('verified', 'unavailable'));--> statement-breakpoint
