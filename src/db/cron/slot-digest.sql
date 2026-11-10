-- 관심 동네·찜한 샵 새 매물 알림 예약 작업 (C-601·C-209, W17 ②). 매일 오후 1시(한국 시간)에 /api/cron/slot-digest를 부른다.
-- pg_cron은 UTC로 돌아서 '0 4 * * *'(UTC 04:00 = 한국 13:00)로 둔다. 정책값 INTEREST_DIGEST_HOUR(13)를 바꾸면 여기도 바꾼다.
-- 마이그레이션이 아니다: 테스트 DB에는 pg_cron이 없고, 부를 주소가 환경마다 다르다.
-- 강규민이 PR 머지 뒤 Supabase DB에 한 번 실행한다. 다시 실행하면 같은 이름의 작업을 덮어쓴다.
-- 운영용 Supabase로 옮길 때 그쪽에서 다시 실행한다(주소를 그 환경에 맞게 바꾼다).
--
-- 비밀 값은 이 파일에 쓰지 않는다(레포가 공개다). Vault의 cron_secret을 쓴다(payments-sweep.sql과 같은 값).
--
-- 확인: select jobname, schedule, active from cron.job;
--       select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--       select status_code, created from net._http_response order by created desc limit 5;
-- 멈추기: select cron.unschedule('slot-digest');

select cron.schedule(
  'slot-digest',
  '0 4 * * *',
  $$
  select net.http_post(
    url := 'https://toori.kr/api/cron/slot-digest',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
