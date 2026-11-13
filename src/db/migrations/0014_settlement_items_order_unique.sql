-- 정산 줄: 거래 하나에 한 줄(unique order_id), 실제 PG 수수료는 PG 정산 자료가 오면 채운다(null 허용) (#353, 11/12 승인)
ALTER TABLE "settlement_items" ALTER COLUMN "pg_fee_actual" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_items" ADD CONSTRAINT "settlement_items_order_id_unique" UNIQUE("order_id");