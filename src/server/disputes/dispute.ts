'use server';

// 이의제기 접수 (C-507, 연결 #20, #299, W19 ①). 내 예약 상세의 이의제기 칸(정찬형)에서 부른다.
// 화면에서는 '@/server/disputes/dispute'에서 가져온다. 화면은 시각을 비교하지 않고 getDisputeStatus의 state를 그대로 쓴다.
//
// - 둘 다 진짜다(가짜 결과 버전 없음). 지금 disputes 테이블(종류·내용·상태)로 저장하고 DB 구조는 바꾸지 않았다
// - 접수 경로(앱·카카오톡 채널)·받은 시각·등록한 운영자 칸, 운영자 등록(A-104), 정산 보류는 W19 ②에서 더한다.
//   W20 정산은 '확인 중'(open) 이의제기가 있는 예약을 묶지 않는다
// - 실패 화면은 로컬에서 DEV_FAKE_DISPUTE_FAILURE로 흉내 낸다(dev-fake-failure.ts)

import { z } from 'zod';

import { getDb } from '@/db';
import { DISPUTE_TYPES } from '@/db/schema/admin';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { devFakeDisputeFailure } from './dev-fake-failure';
import { readDisputeTarget, insertDispute, type DisputeRecord } from './dispute-store';
import { disputeFail, type DisputeResult } from './errors';
import {
  disputeBlockReason,
  disputeContentProblem,
  disputeDeadline,
  disputeOpensAt,
  disputeState,
  type DisputeTarget,
  disputeTypes,
} from './rules';
import type { DisputeView, SubmittedDispute } from './types';

const reservationIdSchema = z.uuid();

function toView(
  reservationId: string,
  target: DisputeTarget & { dispute: DisputeRecord | null },
  now: Date,
): DisputeView {
  const deadline = disputeDeadline(target);
  return {
    reservationId,
    state: disputeState(target, target.dispute !== null, now),
    types: disputeTypes(target),
    opensAt: disputeOpensAt(target).toISOString(),
    deadline: deadline ? deadline.toISOString() : null,
    dispute: target.dispute
      ? {
          type: target.dispute.type,
          status: target.dispute.status,
          createdAt: target.dispute.createdAt.toISOString(),
        }
      : null,
    serverNow: now.toISOString(),
  };
}

/** 내 예약 상세의 이의제기 칸을 그릴 때. 내 예약만 */
export async function getDisputeStatus(reservationId: string): Promise<DisputeResult<DisputeView>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const id = reservationIdSchema.safeParse(reservationId);
  if (!id.success) return disputeFail('RESERVATION_NOT_FOUND');

  const target = await readDisputeTarget(getDb(), {
    reservationId: id.data,
    customerId: auth.data.customerId,
  });
  if (!target) return disputeFail('RESERVATION_NOT_FOUND');
  return ok(toView(id.data, target, await getRequestNow()));
}

const typeSchema = z.enum(DISPUTE_TYPES);

/**
 * [이의제기] 접수. 종류는 getDisputeStatus의 types 중 하나(아니면 INVALID_INPUT). 내용은 앞뒤 공백을 빼고 저장하고,
 * 빈칸이면 DISPUTE_CONTENT_REQUIRED, 안전 상한(5,000자)을 넘으면 DISPUTE_CONTENT_TOO_LONG(11/13 nnoinn).
 * 한 예약에 한 번만 받는다. 동시에 두 번 눌러도 예약 줄을 잠가서 하나만 저장된다
 */
export async function submitDispute(input: {
  reservationId: string;
  type: string;
  content: string;
}): Promise<DisputeResult<SubmittedDispute>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const now = await getRequestNow();
  const switched = devFakeDisputeFailure('submitDispute', now);
  if (switched) return switched;

  if (!reservationIdSchema.safeParse(input?.reservationId).success) {
    return disputeFail('RESERVATION_NOT_FOUND');
  }
  const reservationId: string = input.reservationId;
  const parsedType = typeSchema.safeParse(input?.type);
  if (!parsedType.success) return disputeFail('INVALID_INPUT');
  const type = parsedType.data;
  const rawContent = typeof input?.content === 'string' ? input.content : '';
  const contentProblem = disputeContentProblem(rawContent);
  if (contentProblem) return disputeFail(contentProblem);
  const content = rawContent.trim();

  return getDb().transaction(async (tx): Promise<DisputeResult<SubmittedDispute>> => {
    const target = await readDisputeTarget(tx, {
      reservationId,
      customerId: auth.data.customerId,
      lock: true,
    });
    if (!target) return disputeFail('RESERVATION_NOT_FOUND');
    const reason = disputeBlockReason(target, target.dispute !== null, now);
    if (reason === 'DEADLINE_PASSED') {
      return disputeFail(reason, { deadline: disputeDeadline(target)?.toISOString() });
    }
    if (reason) return disputeFail(reason);
    if (!disputeTypes(target).includes(type)) return disputeFail('INVALID_INPUT');

    const saved = await insertDispute(tx, { reservationId, type, content, receivedAt: now });
    return ok({ disputeId: saved.id, createdAt: saved.createdAt.toISOString() });
  });
}
