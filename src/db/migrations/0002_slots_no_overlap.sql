-- 직접 쓴 마이그레이션 (W1a, S-209). Drizzle로 표현할 수 없는 EXCLUDE 제약이라 SQL로 쓴다.
-- 같은 샵에서 예약대기·게시중·예약됨(scheduled·published·reserved) 매물끼리 시간(start_at~end_at)이 겹치지 않게 막는다.
-- 마감·취소·완료 매물은 제약에서 빠지므로 같은 시간에 다시 올리거나 재등록할 수 있다.
-- shop_id(uuid)의 = 비교를 gist 인덱스에서 쓰려면 btree_gist 확장이 필요하다(0000에서 켬).
ALTER TABLE "slots" ADD CONSTRAINT "slots_no_overlap"
  EXCLUDE USING gist ("shop_id" WITH =, tstzrange("start_at", "end_at") WITH &&)
  WHERE ("status" IN ('scheduled', 'published', 'reserved'));
