// 원장님 튜토리얼 체크 목록(S-412, 3단계 3-A). 대시보드 맨 위 "투리 시작하기"의 단계와, 단계마다 끝났는지·다음에 누를 곳.
// 끝났는지는 이미 있는 기록으로 본다(새 DB 없음): 입점 신청은 원장님 화면에 들어왔으면 끝, 승인은 입점 상태,
// 메뉴는 숨기지 않은 메뉴가 있는지, 첫 매물은 한 시술 매물이나 시간대 매물을 한 번이라도 올렸는지(상태는 보지 않는다).
// 명세의 마지막 단계 "첫 매물 공유"는 원장님 화면에 공유 버튼이 생기면(C-310, 3-B) 더한다(#618 정민석 제안).
// 화면('use client')에서도 가져다 쓴다.

import { SITE_NAME } from '@/lib/site';
import type { ShopStatus } from '@/server/shops/status';

export const CHECKLIST_TITLE = `${SITE_NAME} 시작하기`;

/** 체크 목록을 그리는 데 필요한 기록 */
export type TutorialProgress = {
  /** 입점 상태. 상태 기록이 없는 샵은 승인으로 본다(대시보드와 같다) */
  reviewStatus: ShopStatus;
  /** 숨기지 않은 메뉴가 하나라도 있는지 */
  hasMenu: boolean;
  /** 매물(한 시술·시간대)을 한 번이라도 올렸는지 */
  hasListed: boolean;
};

export type ChecklistStepKey = 'apply' | 'approval' | 'menu' | 'first_slot';

export type ChecklistStep = {
  key: ChecklistStepKey;
  title: string;
  /** 지금 상태 한 줄 */
  description: string;
  done: boolean;
  /** 이 단계를 하러 갈 곳. 끝났거나 아직 할 수 없으면 null */
  action: { href: string; label: string } | null;
};

/** 단계 순서대로. 앞 단계가 안 끝났어도 할 수 있는 단계(승인 전 메뉴 등록)는 버튼을 둔다 */
export function checklistSteps(progress: TutorialProgress): ChecklistStep[] {
  const approved = progress.reviewStatus === 'approved';
  return [
    {
      key: 'apply',
      title: '입점 신청',
      description: '신청을 마쳤어요',
      done: true,
      action: null,
    },
    approvalStep(progress.reviewStatus),
    progress.hasMenu
      ? {
          key: 'menu',
          title: '메뉴 등록',
          description: '메뉴를 등록했어요',
          done: true,
          action: null,
        }
      : {
          key: 'menu',
          title: '메뉴 등록',
          description: '손님에게 보일 서비스와 가격을 적어요',
          done: false,
          action: { href: '/owner/settings/menu', label: '메뉴 등록' },
        },
    firstSlotStep({ approved, hasMenu: progress.hasMenu, hasListed: progress.hasListed }),
  ];
}

function approvalStep(status: ShopStatus): ChecklistStep {
  const base = { key: 'approval', title: '입점 승인' } as const;
  if (status === 'approved') {
    return { ...base, description: '승인됐어요', done: true, action: null };
  }
  if (status === 'rejected') {
    return {
      ...base,
      description: '반려됐어요. 사유를 보고 다시 신청해 주세요',
      done: false,
      action: { href: '/owner/settings/business', label: '다시 신청하기' },
    };
  }
  return {
    ...base,
    description: '운영팀이 사업자 정보를 확인하고 있어요',
    done: false,
    action: null,
  };
}

function firstSlotStep({
  approved,
  hasMenu,
  hasListed,
}: {
  approved: boolean;
  hasMenu: boolean;
  hasListed: boolean;
}): ChecklistStep {
  const base = { key: 'first_slot', title: '첫 매물 올리기' } as const;
  if (hasListed) return { ...base, description: '첫 매물을 올렸어요', done: true, action: null };
  // 매물은 승인 뒤에만 올릴 수 있고(S-102), 메뉴를 골라서 올린다(S-201)
  if (!approved) {
    return { ...base, description: '승인되면 올릴 수 있어요', done: false, action: null };
  }
  if (!hasMenu) {
    return { ...base, description: '메뉴를 먼저 등록해 주세요', done: false, action: null };
  }
  return {
    ...base,
    description: '비어 있는 시간을 할인해서 올려요',
    done: false,
    action: { href: '/owner/slots/new', label: '매물 등록' },
  };
}

/** 입점 상태(샵 기록이 없으면 null)와 메뉴·매물 기록으로 단계를 만든다. null은 승인으로 본다(대시보드와 같다) */
export function checklistFor(
  review: { status: ShopStatus } | null,
  progress: Pick<TutorialProgress, 'hasMenu' | 'hasListed'>,
): ChecklistStep[] {
  return checklistSteps({ reviewStatus: review?.status ?? 'approved', ...progress });
}

/** 모든 단계가 끝났는지. 끝나면 체크 목록을 보여주지 않는다 */
export function isChecklistDone(steps: ChecklistStep[]): boolean {
  return steps.every((step) => step.done);
}

/** 끝난 단계 수 */
export function doneCount(steps: ChecklistStep[]): number {
  return steps.filter((step) => step.done).length;
}
