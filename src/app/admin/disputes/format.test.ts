// 운영자 이의제기 화면의 이름표·목록 주소·받은 시각 칸 변환 (A-104, W19 ②).

import { describe, expect, it } from 'vitest';

import { DISPUTE_OUTCOMES } from '@/db/schema';

import {
  DISPUTE_CHANNEL_DETAIL_LABELS,
  DISPUTE_OUTCOME_LABELS,
  disputesHref,
  fromKstInputValue,
  labelDisputeStatus,
  toDisputeFilter,
  toKstInputValue,
} from './format';

describe('목록 탭과 주소', () => {
  it('모르는 값이면 확인 중(기본), 기본값은 주소에 넣지 않는다', () => {
    expect(toDisputeFilter(undefined)).toBe('open');
    expect(toDisputeFilter('nope')).toBe('open');
    expect(toDisputeFilter('resolved')).toBe('resolved');
    expect(toDisputeFilter('all')).toBe('all');
    expect(disputesHref()).toBe('/admin/disputes');
    expect(disputesHref({ filter: 'open', query: '' })).toBe('/admin/disputes');
    expect(disputesHref({ filter: 'resolved', query: 'T1234' })).toBe(
      '/admin/disputes?status=resolved&q=T1234',
    );
  });
});

describe('상태 이름', () => {
  it('확인 중이면 "확인 중", 결론이 났으면 결론 종류', () => {
    expect(labelDisputeStatus('open', null)).toBe('확인 중');
    expect(labelDisputeStatus('resolved', 'no_show_reversed')).toBe('노쇼 취소(방문으로 바꿈)');
  });

  it('결론 종류 6개 모두 이름이 있다', () => {
    for (const outcome of DISPUTE_OUTCOMES) {
      expect(DISPUTE_OUTCOME_LABELS[outcome], outcome).toBeTruthy();
    }
  });

  it('상세의 경로는 누가 어떻게 남겼는지 풀어서 쓴다(이의제기는 손님만 신청, 11/13 nnoinn)', () => {
    expect(DISPUTE_CHANNEL_DETAIL_LABELS).toEqual({
      app: '앱에서 손님이 직접 접수',
      kakao: '카카오톡 채널로 받아 운영자가 등록',
    });
  });
});

describe('받은 시각 칸(한국 시간)', () => {
  it('지금 시각을 한국 시간 "YYYY-MM-DDTHH:mm"으로 채우고, 서버에는 +09:00을 붙여 넘긴다', () => {
    const at = new Date('2026-11-13T05:07:30.000Z'); // 한국 시간 14:07
    expect(toKstInputValue(at)).toBe('2026-11-13T14:07');
    expect(fromKstInputValue('2026-11-13T14:07')).toBe('2026-11-13T14:07:00+09:00');
    expect(new Date(fromKstInputValue(toKstInputValue(at))!).getTime()).toBe(
      new Date('2026-11-13T05:07:00.000Z').getTime(),
    );
  });

  it('모양이 틀리면 null', () => {
    for (const value of ['', '2026-11-13', '2026-11-13 14:07', '2026-11-13T14:07:00']) {
      expect(fromKstInputValue(value), value).toBeNull();
    }
  });
});
