-- 목요일 정산 묶기 예약 작업 (X-206, #353, W20 ③). 매일 0시 30분(한국 시간, UTC 15:30)에 /api/cron/settlement-batch를 부른다.
-- 오늘이 지급일(매주 목요일, 공휴일이면 다음 영업일)일 때만 묶는다. 공휴일로 지급일이 금·월요일로 밀릴 수 있어서 매일 부른다.
-- 마이그레이션이 아니다: 테스트 DB에는 pg_cron이 없고, 부를 주소가 환경마다 다르다.
-- 강규민이 PR 머지 뒤 Supabase DB에 한 번 실행한다. 다시 실행하면 같은 이름의 작업을 덮어쓴다.
-- 운영용 Supabase로 옮길 때 그쪽에서 다시 실행한다(주소를 그 환경에 맞게 바꾼다).
--
-- 비밀 값은 이 파일에 쓰지 않는다(레포가 공개다). Vault의 cron_secret을 쓴다(payments-sweep.sql과 같다).
--
-- 확인: select jobname, schedule, active from cron.job;
--       select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- 멈추기: select cron.unschedule('settlement-batch');

select cron.schedule(
  'settlement-batch',
  '30 15 * * *',
  $$
  select net.http_post(
    url := 'https://toori.kr/api/cron/settlement-batch',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
