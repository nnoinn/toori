-- 오래된 주문 정리 예약 작업 (C-406, W12 ②). 10분마다 /api/cron/payments-sweep을 부른다.
-- 마이그레이션이 아니다: 테스트 DB에는 pg_cron이 없고, 부를 주소가 환경마다 다르다.
-- 강규민이 PR 머지 뒤 Supabase DB에 한 번 실행한다. 다시 실행하면 같은 이름의 작업을 덮어쓴다.
-- 운영용 Supabase로 옮길 때 그쪽에서 다시 실행한다(주소를 그 환경에 맞게 바꾼다).
--
-- 비밀 값은 이 파일에 쓰지 않는다(레포가 공개다). 먼저 Vault에 그 환경의 CRON_SECRET과 같은 값을 넣어 둔다.
--   select vault.create_secret('<CRON_SECRET 값>', 'cron_secret');
--
-- 확인: select jobname, schedule, active from cron.job;
--       select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--       select status_code, created from net._http_response order by created desc limit 5;
-- 멈추기: select cron.unschedule('payments-sweep');

select cron.schedule(
  'payments-sweep',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://toori.kr/api/cron/payments-sweep',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
