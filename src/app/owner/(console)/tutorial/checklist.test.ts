import { describe, expect, it } from 'vitest';

import {
  checklistFor,
  checklistSteps,
  doneCount,
  isChecklistDone,
  type TutorialProgress,
} from './checklist';

// 원장님 튜토리얼 체크 목록(S-412): 입점 신청 → 승인 → 메뉴 등록 → 첫 매물(docs/stage3-spec.md S-412, 공유는 C-310 뒤)

const progress = (extra: Partial<TutorialProgress> = {}): TutorialProgress => ({
  reviewStatus: 'pending',
  hasMenu: false,
  hasListed: false,
  ...extra,
});

/** 단계 key별 [끝났는지, 버튼 주소] */
const summary = (p: TutorialProgress) =>
  Object.fromEntries(checklistSteps(p).map((s) => [s.key, [s.done, s.action?.href ?? null]]));

describe('원장님 튜토리얼 체크 목록 (S-412)', () => {
  it('단계는 입점 신청 → 승인 → 메뉴 등록 → 첫 매물 순서다', () => {
    expect(checklistSteps(progress()).map((s) => s.title)).toEqual([
      '입점 신청',
      '입점 승인',
      '메뉴 등록',
      '첫 매물 올리기',
    ]);
  });

  it('승인 대기: 입점 신청만 끝났고, 메뉴는 미리 등록할 수 있고, 매물은 승인 뒤에', () => {
    const steps = checklistSteps(progress());
    expect(summary(progress())).toEqual({
      apply: [true, null],
      approval: [false, null],
      menu: [false, '/owner/settings/menu'],
      first_slot: [false, null],
    });
    expect(steps[3].description).toBe('승인되면 올릴 수 있어요');
    expect(doneCount(steps)).toBe(1);
  });

  it('반려: 승인 단계에서 사업자 정보를 고쳐 다시 신청하러 간다', () => {
    const approval = checklistSteps(progress({ reviewStatus: 'rejected' }))[1];
    expect(approval).toMatchObject({
      done: false,
      action: { href: '/owner/settings/business', label: '다시 신청하기' },
    });
  });

  it('승인됐는데 메뉴가 없으면 메뉴부터, 첫 매물은 메뉴를 먼저 등록하라고 한다', () => {
    const p = progress({ reviewStatus: 'approved' });
    expect(summary(p)).toEqual({
      apply: [true, null],
      approval: [true, null],
      menu: [false, '/owner/settings/menu'],
      first_slot: [false, null],
    });
    expect(checklistSteps(p)[3].description).toBe('메뉴를 먼저 등록해 주세요');
  });

  it('승인되고 메뉴가 있으면 첫 매물은 매물 등록으로 간다', () => {
    expect(summary(progress({ reviewStatus: 'approved', hasMenu: true })).first_slot).toEqual([
      false,
      '/owner/slots/new',
    ]);
  });

  it('승인 전에 메뉴를 등록했으면 메뉴 단계는 끝났다(승인과 따로 본다)', () => {
    expect(summary(progress({ hasMenu: true })).menu).toEqual([true, null]);
  });

  it('모두 끝나야 체크 목록이 끝난다', () => {
    const almost = progress({ reviewStatus: 'approved', hasMenu: true });
    expect(isChecklistDone(checklistSteps(almost))).toBe(false);
    const done = checklistSteps({ ...almost, hasListed: true });
    expect(isChecklistDone(done)).toBe(true);
    expect(doneCount(done)).toBe(4);
  });

  it('입점 상태 기록이 없는 샵은 승인으로 본다(대시보드와 같다)', () => {
    const steps = checklistFor(null, { hasMenu: true, hasListed: false });
    expect(steps[1].done).toBe(true);
    expect(steps[3].action?.href).toBe('/owner/slots/new');
    expect(checklistFor({ status: 'pending' }, { hasMenu: true, hasListed: false })[1].done).toBe(
      false,
    );
  });

  it('끝난 단계와 아직 할 수 없는 단계에는 버튼이 없다', () => {
    for (const step of checklistSteps(
      progress({ reviewStatus: 'approved', hasMenu: true, hasListed: true }),
    )) {
      expect(step.action, step.key).toBeNull();
    }
  });
});
