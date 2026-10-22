-- 직접 쓴 마이그레이션 (W1a). 테이블보다 먼저 확장을 켠다.
-- postgis: 샵 위치(geography) 저장과 거리 검색. btree_gist: 매물 시간 겹침 EXCLUDE 제약(S-209).
-- Supabase 관례대로 extensions 스키마에 설치한다(접속 search_path에 extensions가 들어 있다).
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
