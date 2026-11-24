// 개발 DB에 시드 데이터를 넣는다 (연결 #3, docs/tech-guide.md 3-4 "시드 데이터"). 내용은 scripts/seed-data.mjs.
// 모두가 같이 보는 데이터라 nnoinn·강규민만 실행한다: npm run db:seed -- --yes
// 시드 계정(@seed.test)의 데이터만 지우고 다시 넣는다. 팀원이 만든 데이터와 DB 구조는 건드리지 않는다.
// 시드 계정은 비밀번호가 없어서 아무도 로그인할 수 없다(10/13 결정, 내 계정 상황은 시나리오 명령으로 만든다).

import { pathToFileURL } from 'node:url';

import {
  bookingRows,
  DAY,
  HOLD_MINUTES,
  HOUR,
  insertBookings,
  openDevDb,
  PUBLISH_BEFORE_HOURS,
  salePrice,
  SLOT_TIME_STEP_MINUTES,
} from './dev-db.mjs';
import {
  ROLLING_SLOTS,
  SEED_ACCOUNTS,
  SEED_CUSTOMERS,
  SEED_EMAIL_DOMAIN,
  SEED_SHOPS,
  SETTLEMENT_SAMPLE_FEE_RATE,
  SETTLEMENT_SAMPLES,
  WINDOW_SAMPLES,
} from './seed-data.mjs';

export { salePrice };

const pad = (n, width) => String(n).padStart(width, '0');
const KST_OFFSET = 9 * HOUR;

/**
 * 국세청 검증번호 가중치. src/lib/business-number.ts와 같은 계산이다
 * (스크립트에서 TS 파일을 부르면 Node 경고가 떠서 여기 다시 둔다. 같은지는 tests/db/seed.test.ts가 본다)
 */
const CHECK_WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

/** 시드 샵 n번의 가짜 사업자등록번호(숫자 10자리). 검증번호가 맞아서 원장님 화면에서 그대로 다시 저장할 수 있다(#242) */
export function seedBusinessNumber(n) {
  const first9 = `00000${pad(n, 4)}`;
  const sum =
    CHECK_WEIGHTS.reduce((acc, weight, i) => acc + Number(first9[i]) * weight, 0) +
    Math.floor((Number(first9[8]) * 5) / 10);
  return `${first9}${(10 - (sum % 10)) % 10}`;
}

/** 계속 쓰는 시험 매물의 시작 시각(ROLLING_SLOTS). 넣는 날의 한국 날짜 기준이고, 그 샵이 쉬는 요일은 뺀다 */
export function rollingStarts(base, hours) {
  const kstMidnight = Math.floor((base + KST_OFFSET) / DAY) * DAY - KST_OFFSET;
  const closed = new Set(hours.filter((h) => h.closed).map((h) => h.weekday));
  const starts = [];
  for (let day = ROLLING_SLOTS.fromDay; day <= ROLLING_SLOTS.toDay; day += 1) {
    const midnight = kstMidnight + day * DAY;
    if (closed.has(new Date(midnight + KST_OFFSET).getUTCDay())) continue;
    for (const hour of ROLLING_SLOTS.times) starts.push(new Date(midnight + hour * HOUR));
  }
  return starts;
}

/** 시각(ms)이 든 한국 날짜의 0시(ms) */
function kstMidnightOf(ms) {
  return Math.floor((ms + KST_OFFSET) / DAY) * DAY - KST_OFFSET;
}

/** 시각(ms)이 든 한국 날짜 'YYYY-MM-DD' */
function kstDateKey(ms) {
  return new Date(ms + KST_OFFSET).toISOString().slice(0, 10);
}

const THURSDAY = 4;

/**
 * 샘플 정산 지급일(SETTLEMENT_SAMPLES의 payout)의 한국 날짜 0시(ms). 넣는 날 바로 전 목요일이 1, 그 전 목요일이 2다.
 * 넣는 날이 목요일이면 바로 전 목요일은 7일 전이다
 */
export function samplePayoutMidnight(base, payout) {
  const today = kstMidnightOf(base);
  const weekday = new Date(today + KST_OFFSET).getUTCDay();
  const back = (weekday - THURSDAY + 7) % 7 || 7;
  return today - (back + (payout - 1) * 7) * DAY;
}

/** 시간대 매물 샘플(WINDOW_SAMPLES) 하나의 시간 범위들. rollingDays는 넣은 날로부터 그 날째의 from~to이고 쉬는 요일은 뺀다 */
export function windowRanges(base, hours, sample) {
  if (sample.rollingDays === undefined) {
    const start = base + sample.at * HOUR;
    return [{ start: new Date(start), end: new Date(start + sample.hours * HOUR) }];
  }
  const clock = (hhmm) => {
    const [hour, minute] = hhmm.split(':').map(Number);
    return hour * HOUR + minute * 60 * 1000;
  };
  const closed = new Set(hours.filter((h) => h.closed).map((h) => h.weekday));
  return sample.rollingDays
    .map((day) => kstMidnightOf(base) + day * DAY)
    .filter((midnight) => !closed.has(new Date(midnight + KST_OFFSET).getUTCDay()))
    .map((midnight) => ({
      start: new Date(midnight + clock(sample.from)),
      end: new Date(midnight + clock(sample.to)),
    }));
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
  // 11/22: 그 뒤에 생긴 표도 시드 예약·샵을 가리킬 수 있다(팀원이 시드 샵으로 시험한 합의 후 취소 요청·정산 보류·계좌 변경 기록)
  await sql`delete from agreed_cancel_requests where reservation_id in (${seedReservations()})`;
  await sql`delete from settlement_holds where reservation_id in (${seedReservations()}) or shop_id in (${seedShops()})`;
  await sql`delete from penalty_collections where penalty_id in (${seedPenalties()}) or settlement_id in (select id from settlements where shop_id in (${seedShops()}))`;
  await sql`delete from owner_penalties where id in (${seedPenalties()})`;
  await sql`delete from settlement_items where shop_id in (${seedShops()}) or order_id in (${seedOrders()})`;
  await sql`delete from settlements where shop_id in (${seedShops()})`;
  // 지울 쿠폰을 쓴 주문은 시드가 아니어도 쿠폰 연결을 먼저 끊는다(시드 예약에서 받은 보상 쿠폰을 팀원 고객이 다른 샵에서 쓴 경우)
  const seedCoupons = () =>
    sql`select id from coupons where customer_id in (${seedCustomers()}) or source_reservation_id in (${seedReservations()}) or used_order_id in (${seedOrders()})`;
  await sql`update orders set coupon_id = null where id in (${seedOrders()}) or coupon_id in (${seedCoupons()})`;
  await sql`delete from coupons where id in (${seedCoupons()})`;
  await sql`delete from reservations where id in (${seedReservations()})`;
  await sql`delete from orders where id in (${seedOrders()})`;
  await sql`delete from favorites where customer_id in (${seedCustomers()}) or shop_id in (${seedShops()})`;
  await sql`delete from interest_areas where customer_id in (${seedCustomers()})`;
  await sql`delete from notifications where user_id in ${sql(userIds)}`;
  await sql`delete from push_subscriptions where user_id in ${sql(userIds)}`;
  await sql`update slots set hold_customer_id = null, hold_expires_at = null where hold_customer_id in (${seedCustomers()})`;
  await sql`delete from slots where shop_id in (${seedShops()}) or created_by in ${sql(userIds)}`;
  // 시간대 매물(#308)은 그 안에서 만든 매물(slots.window_id)을 지운 뒤에 지운다
  await sql`delete from slot_window_menus where window_id in (select id from slot_windows where shop_id in (${seedShops()}))`;
  await sql`delete from slot_windows where shop_id in (${seedShops()})`;
  await sql`delete from shop_images where shop_id in (${seedShops()})`;
  await sql`delete from payout_account_changes where shop_id in (${seedShops()})`;
  await sql`delete from payout_accounts where shop_id in (${seedShops()})`;
  await sql`delete from menus where shop_id in (${seedShops()})`;
  // 탈퇴 기록(#154)은 샵·계정을 가리키므로 먼저 지운다
  await sql`delete from account_withdrawals where user_id in ${sql(userIds)}`;
  await sql`delete from shops where owner_id in (${seedOwners()})`;
  await sql`delete from owners where user_id in ${sql(userIds)}`;
  await sql`delete from customers where user_id in ${sql(userIds)}`;
  await sql`delete from terms_agreements where user_id in ${sql(userIds)}`;
  await sql`delete from location_use_logs where user_id in ${sql(userIds)}`;
}

/**
 * 시드 계정의 profiles. 운영자 시드(admin: true)만 운영자 권한을 켜고, 다른 시드 계정은 끈 채로 둔다.
 * @param {import('postgres').Sql | import('postgres').TransactionSql} sql
 * @param {readonly { key: string, email: string, admin?: boolean }[]} accounts
 * @param {Record<string, string>} userIds
 */
export async function upsertSeedProfiles(sql, accounts, userIds) {
  const profiles = accounts.map((account) => ({
    id: userIds[account.key],
    email: account.email,
    is_admin: account.admin === true,
  }));
  await sql`insert into profiles ${sql(profiles)} on conflict (id) do update set is_admin = excluded.is_admin`;
  // 운영자 시드는 운영자 프로필(#372 4장)도 둔다. 프로필은 지울 수 없어서(트리거) 이름만 맞춘다
  const adminProfiles = accounts
    .filter((account) => account.admin === true)
    .map((account) => ({
      user_id: userIds[account.key],
      // 예: admin-a → 샘플 운영자 A
      name: `샘플 운영자 ${account.key.replace('admin-', '').toUpperCase()}`,
    }));
  if (adminProfiles.length > 0) {
    await sql`insert into admin_profiles ${sql(adminProfiles)} on conflict (user_id) do update set name = excluded.name`;
  }
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

  // 시드를 넣는 시각을 30분 단위로 내려서 매물 시작 시각이 정책 단위(#108)에 맞게 한다(14:37 → 14:30)
  const step = SLOT_TIME_STEP_MINUTES * 60 * 1000;
  const base = Math.floor(now.getTime() / step) * step;
  const at = (hours) => new Date(base + hours * HOUR);
  const ago = (ms) => new Date(now.getTime() - ms);

  await upsertSeedProfiles(sql, SEED_ACCOUNTS, userIds);

  const customers = SEED_CUSTOMERS.map((c, i) => ({
    id: crypto.randomUUID(),
    user_id: userIds[`customer-${c.key}`],
    // 예약자 이름(#375). 원장님 화면에 닉네임 대신 이 이름이 보여야 한다
    name: c.name,
    nickname: c.nickname,
    // 가입 때 휴대폰 번호를 받는다(11/2, #183). 원장님 예약 상세에 연락처가 보이게
    phone: `010-0001-${pad(i + 1, 4)}`,
  }));
  await sql`insert into customers ${sql(customers)}`;
  const holdCustomerId = customers[0].id;
  const customerIdByKey = Object.fromEntries(SEED_CUSTOMERS.map((c, i) => [c.key, customers[i].id]));
  const bookings = [];

  const owners = [];
  const shops = [];
  const menus = [];
  const slots = [];
  const windows = [];
  const windowMenus = [];
  const sampleBookings = [];
  const shopIdByKey = {};
  SEED_SHOPS.forEach((shop, i) => {
    const n = i + 1;
    const ownerUserId = userIds[`owner-${shop.key}`];
    const ownerName = `샘플 원장 ${shop.key.toUpperCase()}`;
    const ownerId = crypto.randomUUID();
    owners.push({ id: ownerId, user_id: ownerUserId, name: ownerName, phone: `010-0000-${pad(n, 4)}` });

    const shopId = crypto.randomUUID();
    shopIdByKey[shop.key] = shopId;
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
      business_registration_number: seedBusinessNumber(n),
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

    /** 매물 한 줄. 정가·소요 시간은 메뉴에서, 할인가는 정가 × (1 − 할인율) */
    const slotRow = (menu, startAt, rate, newOnly, status) => ({
      id: crypto.randomUUID(),
      shop_id: shopId,
      menu_id: menu.id,
      service_type: menu.service_type,
      menu_name: menu.name,
      list_price: menu.list_price,
      duration_minutes: menu.duration_minutes,
      discount_rate: rate,
      sale_price: salePrice(menu.list_price, rate),
      new_customer_only: newOnly,
      start_at: startAt,
      end_at: new Date(startAt.getTime() + menu.duration_minutes * 60 * 1000),
      publish_at: new Date(startAt.getTime() - PUBLISH_BEFORE_HOURS * HOUR),
      status,
      // 여러 줄을 한 번에 넣을 때 모든 줄의 칸이 같아야 해서 빈 값도 적는다
      hold_customer_id: null,
      hold_expires_at: null,
      closed_at: null,
      close_reason: null,
      relisted_from_slot_id: null,
      created_by: ownerUserId,
    });

    const slotIdByKey = {};
    for (const slot of shop.slots) {
      const row = slotRow(
        menuByKey[slot.menu],
        at(slot.at),
        slot.rate,
        slot.newOnly ?? false,
        slot.status ?? 'published',
      );
      if (slot.id) slotIdByKey[slot.id] = row.id;
      slots.push({
        ...row,
        hold_customer_id: slot.hold ? holdCustomerId : null,
        hold_expires_at: slot.hold ? new Date(now.getTime() + HOLD_MINUTES * 60 * 1000) : null,
        closed_at: slot.closeReason ? ago(HOUR) : null,
        close_reason: slot.closeReason ?? null,
        relisted_from_slot_id: slot.relistOf ? slotIdByKey[slot.relistOf] : null,
      });
      if (slot.book) bookings.push({ row: slots.at(-1), slot, ownerUserId });
    }

    // 계속 쓰는 시험 매물(ROLLING_SLOTS). 매물이 있는 승인된 샵만(승인 대기·반려·시흥시 샵은 그대로 비워 둔다)
    if (shop.status === 'approved' && shop.slots.length > 0) {
      const visible = shop.menus.filter((menu) => !menu.hidden).map((menu) => menuByKey[menu.key]);
      rollingStarts(base, shop.hours).forEach((startAt, k) => {
        const { rates, newOnlyEvery } = ROLLING_SLOTS;
        const newOnly = (k + 1) % newOnlyEvery === 0;
        slots.push(slotRow(visible[k % visible.length], startAt, rates[k % rates.length], newOnly, 'scheduled'));
      });
    }

    // 시간대 매물 샘플(WINDOW_SAMPLES, #308)
    for (const sample of WINDOW_SAMPLES.filter((w) => w.shop === shop.key)) {
      for (const { start, end } of windowRanges(base, shop.hours, sample)) {
        const windowId = crypto.randomUUID();
        const publishAt = new Date(start.getTime() - PUBLISH_BEFORE_HOURS * HOUR);
        windows.push({
          id: windowId,
          shop_id: shopId,
          start_at: start,
          end_at: end,
          publish_at: publishAt,
          status: publishAt <= now ? 'published' : 'scheduled',
          new_customer_only: false,
          created_by: ownerUserId,
        });
        for (const { menu: key, rate } of sample.menus) {
          const menu = menuByKey[key];
          windowMenus.push({
            window_id: windowId,
            menu_id: menu.id,
            service_type: menu.service_type,
            menu_name: menu.name,
            list_price: menu.list_price,
            duration_minutes: menu.duration_minutes,
            discount_rate: rate,
            sale_price: salePrice(menu.list_price, rate),
          });
        }
      }
    }

    // 샘플 정산 거래(SETTLEMENT_SAMPLES). 지난 매물이라 위 매물·시험 매물과 시간이 겹치지 않는다
    SETTLEMENT_SAMPLES.forEach((sample, sampleIndex) => {
      if (sample.shop !== shop.key) return;
      const payoutMidnight = samplePayoutMidnight(base, sample.payout);
      for (const item of sample.items) {
        const startAt = new Date(payoutMidnight - item.day * DAY + item.hour * HOUR);
        const status = item.result === 'cancelled' ? 'cancelled' : 'completed';
        const row = slotRow(menuByKey[item.menu], startAt, item.rate, false, status);
        slots.push(row);
        sampleBookings.push({ row, item, sampleIndex, ownerUserId });
      }
    });
  });

  await sql`insert into owners ${sql(owners)}`;
  await sql`insert into shops ${sql(shops)}`;
  await sql`insert into menus ${sql(menus)}`;
  await sql`insert into slots ${sql(slots)}`;
  await sql`insert into slot_windows ${sql(windows)}`;
  await sql`insert into slot_window_menus ${sql(windowMenus)}`;

  // 예약된·완료된·취소된 매물마다 주문(결제)과 예약을 하나씩. 취소된 매물은 고객 취소와 환불 기록까지
  const booked = bookings.map(({ row, slot, ownerUserId }) =>
    bookingRows({
      slot: row,
      customerId: customerIdByKey[slot.book],
      recordedBy: ownerUserId,
      now,
      visit: slot.visit,
      paymentPrefix: 'seed_',
      policyVersion: 'seed',
    }),
  );
  // 샘플 정산 거래는 모두 고객 B의 예약이다. 위약금 거래는 시작 cancelHours시간 전에 취소했다
  const sampleEntries = sampleBookings.map(({ row, item, sampleIndex, ownerUserId }) => ({
    item,
    sampleIndex,
    booking: bookingRows({
      slot: row,
      customerId: customerIdByKey.b,
      recordedBy: ownerUserId,
      now,
      visit: item.result === 'no_show' ? 'no_show' : 'visited',
      cancelledAt:
        item.result === 'cancelled'
          ? new Date(row.start_at.getTime() - item.cancelHours * HOUR)
          : undefined,
      paymentPrefix: 'seed_',
      policyVersion: 'seed',
    }),
  }));
  await insertBookings(sql, [...booked, ...sampleEntries.map((entry) => entry.booking)]);

  const sample = sampleSettlementRows(base, sampleEntries, shopIdByKey);
  await sql`insert into settlements ${sql(sample.settlements)}`;
  await sql`insert into settlement_items ${sql(sample.items)}`;

  return {
    accounts: SEED_ACCOUNTS.length,
    shops: shops.length,
    menus: menus.length,
    slots: slots.length,
    windows: windows.length,
    reservations: booked.length + sampleEntries.length,
    settlements: sample.settlements.length,
  };
}

/**
 * 샘플 정산 묶음(SETTLEMENT_SAMPLES)의 정산·정산 줄. 계산은 목요일 정산 묶기(src/server/settlements/batch-rules.ts의
 * buildShopSettlement)와 같고 오픈 기간(플랫폼 수수료 0%)이다. 같은지는 tests/db/seed.test.ts가 본다
 * (스크립트에서 TS 파일을 부르지 않으려고 여기 다시 둔다). entries: { item, sampleIndex, booking(bookingRows) }
 */
function sampleSettlementRows(base, entries, shopIdByKey) {
  const settlements = [];
  const items = [];
  SETTLEMENT_SAMPLES.forEach((sample, sampleIndex) => {
    const shopId = shopIdByKey[sample.shop];
    const settlementId = crypto.randomUUID();
    const payoutMidnight = samplePayoutMidnight(base, sample.payout);
    // 같은 샵의 더 이른 샘플 지급일이 직전 지급일이다(payout 숫자가 클수록 이르다)
    const earlier = SETTLEMENT_SAMPLES.filter(
      (other) => other.shop === sample.shop && other.payout > sample.payout,
    ).map((other) => samplePayoutMidnight(base, other.payout));
    const mine = entries.filter((entry) => entry.sampleIndex === sampleIndex);
    const rows = mine.map(({ item, booking }) => {
      const kind =
        item.result === 'visited' ? 'sale' : item.result === 'no_show' ? 'no_show' : 'penalty';
      const sale = booking.order.sale_price;
      // 기준 금액: 이용 완료·노쇼는 판매가, 고객 취소는 판매가 × 위약금 비율(원 미만 버림)
      const baseAmount =
        kind === 'penalty' ? Math.floor((sale * booking.refund.penalty_rate) / 100) : sale;
      const paymentFee = Math.floor((baseAmount * SETTLEMENT_SAMPLE_FEE_RATE) / 100);
      const paymentFeeVat = Math.floor(paymentFee / 10);
      return {
        shop_id: shopId,
        order_id: booking.order.id,
        kind,
        base_amount: baseAmount,
        fee_rate: 0,
        fee_amount: 0,
        fee_vat: 0,
        payment_fee_rate: SETTLEMENT_SAMPLE_FEE_RATE,
        payment_fee: paymentFee,
        payment_fee_vat: paymentFeeVat,
        payout_amount: baseAmount - paymentFee - paymentFeeVat,
        coupon_amount: 0,
        settlement_id: settlementId,
      };
    });
    // 첫 정산은 처음 묶이는 거래가 끝난 날(방문·노쇼 처리나 취소 시각)부터
    const occurred = mine.map(({ booking }) =>
      (booking.reservation.cancelled_at ?? booking.reservation.visit_recorded_at).getTime(),
    );
    const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
    settlements.push({
      id: settlementId,
      shop_id: shopId,
      period_start:
        earlier.length > 0
          ? kstDateKey(Math.max(...earlier) + DAY)
          : kstDateKey(Math.min(...occurred)),
      period_end: kstDateKey(payoutMidnight),
      item_count: rows.length,
      total_base_amount: sum('base_amount'),
      total_fee_amount: sum('payment_fee') + sum('payment_fee_vat'),
      penalty_deducted: 0,
      payout_amount: sum('payout_amount'),
      status: sample.status,
      paid_at: sample.status === 'paid' ? new Date(payoutMidnight + 10 * HOUR) : null,
      payout_ref: sample.status === 'pending' ? null : `seed_payout_${sampleIndex + 1}`,
      memo: null,
    });
    items.push(...rows);
  });
  return { settlements, items };
}

/**
 * 시드 계정의 로그인 정보(auth.users)를 찾고, 없으면 Supabase 관리 기능으로 비밀번호 없이 만든다.
 * accounts를 주면 그 계정만 본다(운영자 시드만 만들 때)
 */
async function ensureSeedUsers(sql, supabaseUrl, secretKey, accounts = SEED_ACCOUNTS) {
  const emails = accounts.map((account) => account.email);
  const rows = await sql`select id, email from auth.users where email in ${sql(emails)}`;
  const idByEmail = new Map(rows.map((row) => [row.email, row.id]));

  const missing = accounts.filter((account) => !idByEmail.has(account.email));
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
  return Object.fromEntries(accounts.map((account) => [account.key, idByEmail.get(account.email)]));
}

/** 운영자 시드만 만든다(다른 시드 데이터는 건드리지 않는다). npm run db:seed -- --admin-only */
async function seedAdminsOnly() {
  const admins = SEED_ACCOUNTS.filter((account) => account.admin);
  const { sql, supabaseUrl, secretKey } = await openDevDb('운영자 시드');
  try {
    const userIds = await ensureSeedUsers(sql, supabaseUrl, secretKey, admins);
    await upsertSeedProfiles(sql, admins, userIds);
    console.log(`운영자 시드를 만들었어요: ${admins.map((account) => account.key).join(', ')}`);
  } finally {
    await sql.end();
  }
}

async function main() {
  if (process.argv.includes('--admin-only')) {
    await seedAdminsOnly();
    return;
  }
  if (!process.argv.includes('--yes')) {
    console.log(
      `개발 DB의 시드 데이터(@${SEED_EMAIL_DOMAIN} 계정의 샵·메뉴·매물·예약)를 지우고 다시 넣어요. 팀원 모두가 보는 데이터예요.\n` +
        '실행하려면: npm run db:seed -- --yes',
    );
    process.exitCode = 1;
    return;
  }
  const { sql, supabaseUrl, secretKey } = await openDevDb('시드');
  try {
    const userIds = await ensureSeedUsers(sql, supabaseUrl, secretKey);
    const result = await sql.begin((tx) => seedDevData(tx, { now: new Date(), userIds }));
    console.log(
      `시드를 넣었어요: 계정 ${result.accounts}, 샵 ${result.shops}, 메뉴 ${result.menus}, 매물 ${result.slots}, 시간대 매물 ${result.windows}, 예약 ${result.reservations}, 샘플 정산 ${result.settlements}`,
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
