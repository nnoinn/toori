// 개발 DB 명령(시드 scripts/seed.mjs, 시나리오 scripts/scenario.mjs)이 같이 쓰는 것.
// 접속 안전장치, 시드 전용 정책값, 주문·예약·환불 한 벌을 만드는 도우미.

import postgres from 'postgres';

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
// 시드 전용 값. 정책값(src/server/policy, #48)과 같게 둔다: 매물은 시작 48시간 전에 게시(S-204), 홀딩 10분(C-404)
export const PUBLISH_BEFORE_HOURS = 48;
export const HOLD_MINUTES = 10;
// 고객 취소 위약금 구간(X-202). 남은 시간이 기준 이상이면 그 비율. 정책값의 REFUND_BANDS(#48)와 같게 둔다
export const REFUND_BANDS = [
  { band: 'over_24h', minHoursLeft: 24, penaltyRate: 30 },
  { band: '6h_to_24h', minHoursLeft: 6, penaltyRate: 50 },
  { band: 'under_6h', minHoursLeft: 0, penaltyRate: 100 },
];
// 예약번호: 영문 대문자+숫자 8자리, 헷갈리는 0/O·1/I 제외(docs/schema-v1.md reservations.code)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 할인가 = 정가 × (1 − 할인율), 원 미만 버림 (S-203) */
export function salePrice(listPrice, discountRate) {
  return Math.floor((listPrice * (100 - discountRate)) / 100);
}

export function reservationCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/**
 * 매물 한 줄(slots 행)에 맞는 주문·예약(·환불) 한 벌. 매물 상태로 예약 상태를 정한다
 * reserved → 예정, completed → 이용 완료(visit: visited·no_show), cancelled → 고객 취소 + 환불
 * paymentPrefix로 누가 만든 데이터인지 표시한다(seed_, scenario_)
 */
export function bookingRows({ slot, customerId, recordedBy, now, visit = 'visited', paymentPrefix, policyVersion }) {
  const startMs = slot.start_at.getTime();
  // 예약(결제)한 시각: 시작 20시간 전. 그게 아직 오지 않았으면 지금보다 1시간 전
  const bookedAt = new Date(Math.min(startMs - 20 * HOUR, now.getTime() - HOUR));
  const orderId = crypto.randomUUID();
  const order = {
    id: orderId,
    payment_id: `${paymentPrefix}${orderId}`,
    slot_id: slot.id,
    customer_id: customerId,
    sale_price: slot.sale_price,
    coupon_amount: 0,
    amount: slot.sale_price,
    refund_policy_version: policyVersion,
    refund_policy_agreed_at: bookedAt,
    status: 'confirmed',
    pg_status: 'PAID',
    pay_method: 'card',
    paid_at: bookedAt,
  };
  const cancelled = slot.status === 'cancelled';
  const completed = slot.status === 'completed';
  const cancelledAt = cancelled ? new Date(now.getTime() - HOUR / 2) : null;
  const hoursLeft = cancelled ? (startMs - cancelledAt.getTime()) / HOUR : null;
  const reservation = {
    id: crypto.randomUUID(),
    code: reservationCode(),
    slot_id: slot.id,
    order_id: orderId,
    customer_id: customerId,
    status: cancelled ? 'cancelled' : completed ? 'completed' : 'confirmed',
    visit_result: completed ? visit : null,
    visit_recorded_at: completed ? new Date(slot.end_at.getTime() + HOUR) : null,
    visit_recorded_by: completed ? recordedBy : null,
    cancelled_at: cancelledAt,
    cancel_actor: cancelled ? 'customer' : null,
    cancel_reason: cancelled ? '일정이 생겼어요' : null,
    hours_before_start_at_cancel: cancelled ? Math.round(hoursLeft * 10) / 10 : null,
    created_at: bookedAt,
  };
  let refund = null;
  if (cancelled) {
    const { band, penaltyRate } = REFUND_BANDS.find((b) => hoursLeft >= b.minHoursLeft);
    // 환불은 실제 결제액 × 환불율, 원 미만 버림. 남은 돈이 위약금(docs/settlement-examples.md)
    const refundAmount = Math.floor((slot.sale_price * (100 - penaltyRate)) / 100);
    refund = {
      order_id: orderId,
      reservation_id: reservation.id,
      reason: 'customer_cancel',
      band,
      penalty_rate: penaltyRate,
      refund_amount: refundAmount,
      penalty_amount: slot.sale_price - refundAmount,
      processed_at: cancelledAt,
    };
  }
  return { order, reservation, refund };
}

/** bookingRows 여러 벌을 넣는다(주문 → 예약 → 환불 순서) */
export async function insertBookings(sql, bookings) {
  if (bookings.length === 0) return;
  await sql`insert into orders ${sql(bookings.map((b) => b.order))}`;
  await sql`insert into reservations ${sql(bookings.map((b) => b.reservation))}`;
  const refunds = bookings.map((b) => b.refund).filter(Boolean);
  if (refunds.length > 0) await sql`insert into refunds ${sql(refunds)}`;
}

/**
 * .env.local의 개발 DB에 접속한다. 안전장치: CI·배포 환경에서는 멈추고,
 * DB 주소와 Supabase 주소가 같은 프로젝트인지 확인하고, 결제·예약 테이블(W1b)이 있는지 확인한다
 */
export async function openDevDb(commandName) {
  if (process.env.CI || process.env.VERCEL) {
    throw new Error(`${commandName}은 내 컴퓨터에서만 실행해요(CI·배포 환경에서는 멈춰요).`);
  }
  process.loadEnvFile('.env.local');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const databaseUrl = process.env.DATABASE_URL;
  if (!supabaseUrl || !secretKey || !databaseUrl) {
    throw new Error('.env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL이 있어야 해요.');
  }
  // DB 주소와 Supabase 주소가 같은 프로젝트인지 확인한다(다른 DB 주소가 섞여 들어온 경우 멈춘다)
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  if (!databaseUrl.includes(projectRef)) {
    throw new Error('DATABASE_URL이 NEXT_PUBLIC_SUPABASE_URL과 다른 프로젝트예요. .env.local을 확인해 주세요.');
  }
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
  const [{ ready }] = await sql`select to_regclass('public.reservations') is not null as ready`;
  if (!ready) {
    await sql.end();
    throw new Error('개발 DB에 결제·예약 테이블(W1b)이 아직 없어요. 강규민이 npm run db:migrate로 적용한 뒤에 다시 실행해 주세요.');
  }
  return { sql, supabaseUrl, secretKey };
}
