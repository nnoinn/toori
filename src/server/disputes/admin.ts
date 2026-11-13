'use server';

// 운영자 이의제기 처리 (A-104, 연결 #20, #350, W19 ②). 운영자 이의제기 화면(/admin/disputes, 강규민)에서 부른다.
// 화면에서는 '@/server/disputes/admin'에서 가져온다. 모두 운영자만(requireAdmin).
//
// - registerKakaoDispute: 카카오톡 채널로 받은 이의제기를 등록한다. 받은 시각으로 접수 기한을 본다(앱 접수와 같은 규칙).
//   기한이 지난 문의는 등록하지 않고 카카오톡 채널에서 일반 문의로 응대한다(11/12 결정). 한 예약에 이의제기 하나
// - resolveDispute: 결론을 기록한다. 결론이 나면 정산 보류가 저절로 풀린다. 돈이 오가는 결론 셋은 처리 기능이 생길 때까지
//   고를 수 없다(READY_DISPUTE_OUTCOMES, #350 리뷰). 노쇼 취소면 예약을 방문으로 바꾼다
// - 접수·결론 알림은 보내지 않는다(11/12 결정). 고객은 카카오톡 채널 대화로, 원장님은 필요하면 운영자가 따로 연락한다

import { z } from 'zod';

import { getDb } from '@/db';
import { DISPUTE_OUTCOMES, DISPUTE_TYPES } from '@/db/schema/admin';
import { violatedConstraint } from '@/lib/db-error';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireAdmin } from '@/server/auth';

import { insertKakaoDispute, readDisputeToResolve, resolveDisputeInTx } from './admin-store';
import { readDisputeTarget } from './dispute-store';
import { disputeFail, type DisputeResult } from './errors';
import {
  disputeBlockReason,
  disputeContentProblem,
  disputeDeadline,
  disputeTypes,
  outcomeBlockReason,
} from './rules';
import type {
  RegisteredDispute,
  RegisterKakaoDisputeInput,
  ResolvedDispute,
  ResolveDisputeInput,
} from './types';

const idSchema = z.uuid();
const typeSchema = z.enum(DISPUTE_TYPES);
const outcomeSchema = z.enum(DISPUTE_OUTCOMES);
const receivedAtSchema = z.iso.datetime({ offset: true });

/**
 * 카카오톡 채널로 받은 이의제기 등록. 받은 시각(receivedAt)이 그 예약의 접수 기간 안이어야 한다.
 * 이미 이의제기가 있는 예약이면 DISPUTE_EXISTS(disputeId로 그 기록에서 처리), 기한 뒤에 받았으면 RECEIVED_AFTER_DEADLINE
 */
export async function registerKakaoDispute(
  input: RegisterKakaoDisputeInput,
): Promise<DisputeResult<RegisteredDispute>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.reservationId).success) {
    return disputeFail('RESERVATION_NOT_FOUND');
  }
  const type = typeSchema.safeParse(input?.type);
  if (!type.success) return disputeFail('INVALID_INPUT');
  const rawContent = typeof input?.content === 'string' ? input.content : '';
  const contentProblem = disputeContentProblem(rawContent);
  if (contentProblem) return disputeFail(contentProblem);
  if (!receivedAtSchema.safeParse(input?.receivedAt).success) {
    return disputeFail('RECEIVED_AT_INVALID');
  }
  const receivedAt = new Date(input.receivedAt);
  const now = await getRequestNow();
  if (receivedAt.getTime() > now.getTime()) return disputeFail('RECEIVED_AT_INVALID');

  try {
    return await getDb().transaction(async (tx): Promise<DisputeResult<RegisteredDispute>> => {
      const target = await readDisputeTarget(tx, {
        reservationId: input.reservationId,
        customerId: null,
        lock: true,
      });
      if (!target) return disputeFail('RESERVATION_NOT_FOUND');
      if (target.dispute) return disputeFail('DISPUTE_EXISTS', { disputeId: target.dispute.id });
      const reason = disputeBlockReason(target, false, receivedAt);
      if (reason === 'DEADLINE_PASSED') {
        return disputeFail('RECEIVED_AFTER_DEADLINE', {
          deadline: disputeDeadline(target)?.toISOString(),
        });
      }
      if (reason) return disputeFail(reason);
      if (!disputeTypes(target).includes(type.data)) return disputeFail('INVALID_INPUT');

      const saved = await insertKakaoDispute(tx, {
        reservationId: input.reservationId,
        type: type.data,
        content: rawContent.trim(),
        receivedAt,
        adminId: auth.data.userId,
      });
      return ok({ disputeId: saved.id, createdAt: saved.createdAt.toISOString() });
    });
  } catch (error) {
    // 확인 뒤 같은 예약에 다른 접수가 먼저 저장됐다(한 예약에 이의제기 하나, DB가 막는다)
    if (violatedConstraint(error) === 'disputes_reservation_id_unique') {
      return disputeFail('DISPUTE_EXISTS');
    }
    throw error;
  }
}

/**
 * 결론 기록. 메모(사유)는 필수이고 운영자 작업 기록에 같이 남는다. 지금 고를 수 없는 결론이면 OUTCOME_NOT_READY,
 * 노쇼가 아닌 예약에 노쇼 결론이면 OUTCOME_NOT_ALLOWED, 이미 결론이 났으면 ALREADY_RESOLVED
 */
export async function resolveDispute(
  input: ResolveDisputeInput,
): Promise<DisputeResult<ResolvedDispute>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.disputeId).success) return disputeFail('DISPUTE_NOT_FOUND');
  const outcome = outcomeSchema.safeParse(input?.outcome);
  if (!outcome.success) return disputeFail('INVALID_INPUT');
  const rawMemo = typeof input?.memo === 'string' ? input.memo : '';
  const memoProblem = disputeContentProblem(rawMemo);
  if (memoProblem) {
    return disputeFail(memoProblem === 'DISPUTE_CONTENT_REQUIRED' ? 'MEMO_REQUIRED' : memoProblem);
  }
  const now = await getRequestNow();

  return getDb().transaction(async (tx): Promise<DisputeResult<ResolvedDispute>> => {
    const dispute = await readDisputeToResolve(tx, input.disputeId);
    if (!dispute) return disputeFail('DISPUTE_NOT_FOUND');
    if (dispute.status !== 'open') return disputeFail('ALREADY_RESOLVED');
    const blocked = outcomeBlockReason(outcome.data, dispute);
    if (blocked) return disputeFail(blocked);

    await resolveDisputeInTx(tx, {
      dispute,
      outcome: outcome.data,
      memo: rawMemo.trim(),
      adminId: auth.data.userId,
      now,
    });
    return ok({
      disputeId: dispute.disputeId,
      outcome: outcome.data,
      handledAt: now.toISOString(),
    });
  });
}
