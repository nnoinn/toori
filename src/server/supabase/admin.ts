// 관리자 권한 Supabase 연결 (Storage 업로드 주소·비공개 파일 열람 주소 만들기, #47 6장). 서버에서만 쓴다.
// SUPABASE_SECRET_KEY는 모든 권한이 있으므로, 이 연결을 쓰는 함수는 먼저 require…()로 권한을 확인하고 경로를 서버가 정한다.
// 데이터(테이블)는 이 연결로 읽지 않고 Drizzle(getDb)로만 읽는다(기술 가이드 2장).

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabaseConfig } from './server';

let client: SupabaseClient | undefined;

export function createSupabaseAdminClient(): SupabaseClient {
  if (!client) {
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('SUPABASE_SECRET_KEY가 없어요. .env.local을 확인해 주세요.');
    }
    // 로그인 세션을 쓰지 않는다(요청마다 사용자 쿠키와 섞이지 않게)
    client = createClient(supabaseConfig().url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
