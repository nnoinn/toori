// 개발 DB에 시드 데이터를 넣는다 (연결 #3, docs/tech-guide.md 3-4 "시드 데이터"). 내용은 scripts/seed-data.mjs.
// 모두가 같이 보는 데이터라 nnoinn·강규민만 실행한다: npm run db:seed -- --yes
// 시드 계정(@seed.test)의 데이터만 지우고 다시 넣는다. 팀원이 만든 데이터와 DB 구조는 건드리지 않는다.
// 시드 계정은 비밀번호가 없어서 아무도 로그인할 수 없다(10/13 결정, 내 계정 상황은 시나리오 명령으로 만든다).

import { pathToFileURL } from 'node:url';

import postgres from 'postgres';

import { SEED_ACCOUNTS, SEED_CUSTOMERS, SEED_EMAIL_DOMAIN, SEED_SHOPS } from './seed-data.mjs';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 시드 전용 값. 정책값(src/server/policy, W4)과 같게 둔다: 매물은 시작 48시간 전에 게시(S-204), 홀딩 10분(C-404)
const PUBLISH_BEFORE_HOURS = 48;
const HOLD_MINUTES = 10;
// 고객 취소 위약금 구간(X-202). 남은 시간이 기준 이상이면 그 비율. 정책값의 REFUND_BANDS(#48)와 같게 둔다
const REFUND_BANDS = [
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

const pad = (n, width) => String(n).padStart(width, '0');

function reservationCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** 시드 계정(userIds)의 데이터를 지운다. 로그인 정보(auth.users)와 profiles는 다음 시드에서 다시 쓰려고 남긴다 */
async function clearSeedData(sql, userIds) {
  // 조각(fragment)은 쿼리마다 새로 만든다
  const seedOwners = () => sql`select id from owners where user_id in ${sql(userIds)}`;
  const seedShops = () => sql`select id from shops where owner_id in (${seedOwners()})`;
  const seedCustomers = () => sql`select id from customers where user_id in ${sql(userIds)}`;
  const seedSlots = () =>
    sql`select id from slots where shop_id in (${seedShops()}) or created_by in ${sql(userIds)}`;
  const seedOrders = () =>
    sql`select id from orders where slot_id in (${seedSlots()}) or customer_id in (${seedCustomers()})`;
  const seedReservations = () =>
    sql`select id from reservations where slot_id in (${seedSlots()}) or customer_id in (${seedCustomers()})`;
  const seedPenalties = () =>
    sql`select id from owner_penalties where shop_id in (${seedShops()}) or reservation_id in (${seedReservations()})`;
  // 결제·예약·정산·알림(W1b): 시드 매물·고객·샵을 가리키는 행부터 지운다
  await sql`delete from refunds where order_id in (${seedOrders()}) or reservation_id in (${seedReservations()})`;
  await sql`delete from disputes where reservation_id in (${seedReservations()})`;
  await sql`delete from penalty_collections where penalty_id in (${seedPenalties()}) or settlement_id in (select id from settlements where shop_id in (${seedShops()}))`;
  await sql`delete from owner_penalties where id in (${seedPenalties()})`;
  await sql`delete from settlement_items where shop_id in (${seedShops()}) or order_id in (${seedOrders()})`;
  await sql`delete from settlements where shop_id in (${seedShops()})`;
  await sql`update orders set coupon_id = null where id in (${seedOrders()})`;
  await sql`delete from coupons where customer_id in (${seedCustomers()}) or source_reservation_id in (${seedReservations()}) or used_order_id in (${seedOrders()})`;
  await sql`delete from reservations where id in (${seedReservations()})`;
  await sql`delete from orders where id in (${seedOrders()})`;
  await sql`delete from favorites where customer_id in (${seedCustomers()}) or shop_id in (${seedShops()})`;
  await sql`delete from interest_areas where customer_id in (${seedCustomers()})`;
  await sql`delete from notifications where user_id in ${sql(userIds)}`;
  await sql`delete from push_subscriptions where user_id in ${sql(userIds)}`;
  await sql`update slots set hold_customer_id = null, hold_expires_at = null where hold_customer_id in (${seedCustomers()})`;
  await sql`delete from slots where shop_id in (${seedShops()}) or created_by in ${sql(userIds)}`;
  await sql`delete from shop_images where shop_id in (${seedShops()})`;
  await sql`delete from payout_accounts where shop_id in (${seedShops()})`;
  await sql`delete from menus where shop_id in (${seedShops()})`;
  await sql`delete from shops where owner_id in (${seedOwners()})`;
  await sql`delete from owners where user_id in ${sql(userIds)}`;
  await sql`delete from customers where user_id in ${sql(userIds)}`;
  await sql`delete from terms_agreements where user_id in ${sql(userIds)}`;
  await sql`delete from location_use_logs where user_id in ${sql(userIds)}`;
}

/**
 * 시드 데이터를 지우고 다시 넣는다. 트랜잭션 안에서 부른다(중간에 실패하면 모두 되돌린다).
 * @param {import('postgres').TransactionSql} sql
 * @param {{ now: Date, userIds: Record<string, string> }} options userIds: SEED_ACCOUNTS의 key → auth.users id
 */
export async function seedDevData(sql, { now, userIds }) {
  const ids = SEED_ACCOUNTS.map((account) => {
    const id = userIds[account.key];
    if (!id) throw new Error(`시드 계정 ${account.key}의 로그인 정보 id가 없어요.`);
    return id;
  });
  await clearSeedData(sql, ids);

  // 시드를 넣는 시각을 10분 단위로 내려서 매물 시작 시각이 14:37 같은 어중간한 값이 되지 않게 한다
  const base = Math.floor(now.getTime() / (10 * 60 * 1000)) * 10 * 60 * 1000;
  const at = (hours) => new Date(base + hours * HOUR);
  const ago = (ms) => new Date(now.getTime() - ms);

  const profiles = SEED_ACCOUNTS.map((account) => ({ id: userIds[account.key], email: account.email }));
  await sql`insert into profiles ${sql(profiles)} on conflict (id) do nothing`;

  const customers = SEED_CUSTOMERS.map((c) => ({
    id: crypto.randomUUID(),
    user_id: userIds[`customer-${c.key}`],
    nickname: c.nickname,
  }));
  await sql`insert into customers ${sql(customers)}`;
  const holdCustomerId = customers[0].id;
  const customerIdByKey = Object.fromEntries(SEED_CUSTOMERS.map((c, i) => [c.key, customers[i].id]));
  const bookings = [];

  const owners = [];
  const shops = [];
  const menus = [];
  const slots = [];
  SEED_SHOPS.forEach((shop, i) => {
    const n = i + 1;
    const ownerUserId = userIds[`owner-${shop.key}`];
    const ownerName = `샘플 원장 ${shop.key.toUpperCase()}`;
    const ownerId = crypto.randomUUID();
    owners.push({ id: ownerId, user_id: ownerUserId, name: ownerName, phone: `010-0000-${pad(n, 4)}` });

    const shopId = crypto.randomUUID();
    const reviewed = shop.status !== 'pending';
    shops.push({
      id: shopId,
      owner_id: ownerId,
      name: shop.name,
      category: shop.category,
      phone: `031-000-${pad(n, 4)}`,
      road_address: `경기 ${shop.area.sigungu} 샘플로 ${n}`,
      jibun_address: n % 2 ? `경기 ${shop.area.sigungu} ${shop.dong} ${100 + n}` : null,
      address_detail: n % 3 ? `${n}층` : null,
      sido: shop.area.sido,
      sigungu: shop.area.sigungu,
      sigungu_code: shop.area.sigunguCode,
      location: `SRID=4326;POINT(${shop.lng} ${shop.lat})`,
      business_hours: sql.json(shop.hours),
      description: shop.description ?? null,
      instagram_url: shop.links.instagram ?? null,
      naver_place_url: shop.links.naver ?? null,
      business_name: shop.name,
      representative_name: ownerName,
      business_registration_number: `000-00-${pad(n, 5)}`,
      opened_on: '2021-03-02',
      business_doc_path: `seed/${shop.key}/business-doc.jpg`,
      status: shop.status,
      rejection_reason: shop.rejectionReason ?? null,
      applied_at: ago(reviewed ? 7 * DAY : DAY),
      reviewed_at: reviewed ? ago(6 * DAY) : null,
    });

    const menuByKey = {};
    shop.menus.forEach((menu, sortOrder) => {
      const row = {
        id: crypto.randomUUID(),
        shop_id: shopId,
        service_type: menu.serviceType,
        name: menu.name,
        list_price: menu.price,
        duration_minutes: menu.minutes,
        sort_order: sortOrder,
        hidden_at: menu.hidden ? ago(3 * DAY) : null,
      };
      menuByKey[menu.key] = row;
      menus.push(row);
    });

    const slotIdByKey = {};
    for (const slot of shop.slots) {
      const menu = menuByKey[slot.menu];
      const startAt = at(slot.at);
      const id = crypto.randomUUID();
      if (slot.id) slotIdByKey[slot.id] = id;
      slots.push({
        id,
        shop_id: shopId,
        menu_id: menu.id,
        service_type: menu.service_type,
        menu_name: menu.name,
        list_price: menu.list_price,
        duration_minutes: menu.duration_minutes,
        discount_rate: slot.rate,
        sale_price: salePrice(menu.list_price, slot.rate),
        new_customer_only: slot.newOnly ?? false,
        start_at: startAt,
        end_at: new Date(startAt.getTime() + menu.duration_minutes * 60 * 1000),
        publish_at: new Date(startAt.getTime() - PUBLISH_BEFORE_HOURS * HOUR),
        status: slot.status ?? 'published',
        hold_customer_id: slot.hold ? holdCustomerId : null,
        hold_expires_at: slot.hold ? new Date(now.getTime() + HOLD_MINUTES * 60 * 1000) : null,
        closed_at: slot.closeReason ? ago(HOUR) : null,
        close_reason: slot.closeReason ?? null,
        relisted_from_slot_id: slot.relistOf ? slotIdByKey[slot.relistOf] : null,
        created_by: ownerUserId,
      });
      if (slot.book) bookings.push({ row: slots.at(-1), slot, ownerUserId });
    }
  });

  await sql`insert into owners ${sql(owners)}`;
  await sql`insert into shops ${sql(shops)}`;
  await sql`insert into menus ${sql(menus)}`;
  await sql`insert into slots ${sql(slots)}`;

  // 예약된·완료된·취소된 매물마다 주문(결제)과 예약을 하나씩. 취소된 매물은 고객 취소와 환불 기록까지
  const orders = [];
  const reservations = [];
  const refunds = [];
  for (const { row, slot, ownerUserId } of bookings) {
    const startMs = row.start_at.getTime();
    const customerId = customerIdByKey[slot.book];
    // 예약(결제)한 시각: 시작 20시간 전. 그게 아직 오지 않았으면 지금보다 1시간 전
    const bookedAt = new Date(Math.min(startMs - 20 * HOUR, now.getTime() - HOUR));
    const orderId = crypto.randomUUID();
    orders.push({
      id: orderId,
      payment_id: `seed_${orderId}`,
      slot_id: row.id,
      customer_id: customerId,
      sale_price: row.sale_price,
      coupon_amount: 0,
      amount: row.sale_price,
      refund_policy_version: 'seed',
      refund_policy_agreed_at: bookedAt,
      status: 'confirmed',
      pg_status: 'PAID',
      pay_method: 'card',
      paid_at: bookedAt,
    });
    const cancelled = row.status === 'cancelled';
    const completed = row.status === 'completed';
    const cancelledAt = cancelled ? ago(HOUR / 2) : null;
    const hoursLeft = cancelled ? (startMs - cancelledAt.getTime()) / HOUR : null;
    const reservationId = crypto.randomUUID();
    reservations.push({
      id: reservationId,
      code: reservationCode(),
      slot_id: row.id,
      order_id: orderId,
      customer_id: customerId,
      status: cancelled ? 'cancelled' : completed ? 'completed' : 'confirmed',
      visit_result: completed ? slot.visit : null,
      visit_recorded_at: completed ? new Date(row.end_at.getTime() + HOUR) : null,
      visit_recorded_by: completed ? ownerUserId : null,
      cancelled_at: cancelledAt,
      cancel_actor: cancelled ? 'customer' : null,
      cancel_reason: cancelled ? '일정이 생겼어요' : null,
      hours_before_start_at_cancel: cancelled ? Math.round(hoursLeft * 10) / 10 : null,
      created_at: bookedAt,
    });
    if (cancelled) {
      const { band, penaltyRate } = REFUND_BANDS.find((b) => hoursLeft >= b.minHoursLeft);
      // 환불은 실제 결제액 × 환불율, 원 미만 버림. 남은 돈이 위약금(docs/settlement-examples.md)
      const refundAmount = Math.floor((row.sale_price * (100 - penaltyRate)) / 100);
      refunds.push({
        order_id: orderId,
        reservation_id: reservationId,
        reason: 'customer_cancel',
        band,
        penalty_rate: penaltyRate,
        refund_amount: refundAmount,
        penalty_amount: row.sale_price - refundAmount,
        processed_at: cancelledAt,
      });
    }
  }
  if (orders.length > 0) {
    await sql`insert into orders ${sql(orders)}`;
    await sql`insert into reservations ${sql(reservations)}`;
  }
  if (refunds.length > 0) await sql`insert into refunds ${sql(refunds)}`;

  return {
    accounts: profiles.length,
    shops: shops.length,
    menus: menus.length,
    slots: slots.length,
    reservations: reservations.length,
  };
}

/** 시드 계정의 로그인 정보(auth.users)를 찾고, 없으면 Supabase 관리 기능으로 비밀번호 없이 만든다 */
async function ensureSeedUsers(sql, supabaseUrl, secretKey) {
  const emails = SEED_ACCOUNTS.map((account) => account.email);
  const rows = await sql`select id, email from auth.users where email in ${sql(emails)}`;
  const idByEmail = new Map(rows.map((row) => [row.email, row.id]));

  const missing = SEED_ACCOUNTS.filter((account) => !idByEmail.has(account.email));
  if (missing.length > 0) {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const account of missing) {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        email_confirm: true,
        user_metadata: { seed: true },
      });
      if (error) throw new Error(`시드 계정 ${account.email}을 만들지 못했어요: ${error.message}`);
      idByEmail.set(account.email, data.user.id);
    }
  }
  return Object.fromEntries(SEED_ACCOUNTS.map((account) => [account.key, idByEmail.get(account.email)]));
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log(
      `개발 DB의 시드 데이터(@${SEED_EMAIL_DOMAIN} 계정의 샵·메뉴·매물·예약)를 지우고 다시 넣어요. 팀원 모두가 보는 데이터예요.\n` +
        '실행하려면: npm run db:seed -- --yes',
    );
    process.exitCode = 1;
    return;
  }
  if (process.env.CI || process.env.VERCEL) {
    throw new Error('시드는 내 컴퓨터에서만 실행해요(CI·배포 환경에서는 멈춰요).');
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
  try {
    const [{ ready }] = await sql`select to_regclass('public.reservations') is not null as ready`;
    if (!ready) {
      throw new Error('개발 DB에 결제·예약 테이블(W1b)이 아직 없어요. 강규민이 npm run db:migrate로 적용한 뒤에 다시 실행해 주세요.');
    }
    const userIds = await ensureSeedUsers(sql, supabaseUrl, secretKey);
    const result = await sql.begin((tx) => seedDevData(tx, { now: new Date(), userIds }));
    console.log(
      `시드를 넣었어요: 계정 ${result.accounts}, 샵 ${result.shops}, 메뉴 ${result.menus}, 매물 ${result.slots}, 예약 ${result.reservations}`,
    );
  } finally {
    await sql.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
