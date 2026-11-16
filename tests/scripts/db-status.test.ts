// 개발 DB 마이그레이션 상태 보기(scripts/db-status.mjs)가 적용 안 된 것과 이상한 상태를 맞게 고르는지 확인한다.
import { describe, expect, it } from 'vitest';

import { migrationStatus, statusLines } from '../../scripts/db-status.mjs';

const ENTRIES = [
  { tag: '0015_customer_name', when: 100 },
  { tag: '0016_admin_profiles', when: 200 },
  { tag: '0017_notification_inbox', when: 300 },
];

describe('마이그레이션 상태', () => {
  it('마지막으로 적용한 것보다 뒤의 마이그레이션이 적용 안 된 것이다', () => {
    const status = migrationStatus(ENTRIES, 200);
    expect(status.lastTag).toBe('0016_admin_profiles');
    expect(status.pending.map((entry) => entry.tag)).toEqual(['0017_notification_inbox']);
    expect(status.unknownLast).toBe(false);
    expect(statusLines({ branch: 'main', status })).toEqual([
      '지금 브랜치: main',
      '개발 DB 마지막 적용: 0016_admin_profiles',
      '적용 안 된 마이그레이션 1개: 0017_notification_inbox',
    ]);
  });

  it('다 적용했으면 모두 적용됨이고, main이 아니면 main에서만 적용한다고 알려 준다', () => {
    const status = migrationStatus(ENTRIES, 300);
    expect(status.pending).toEqual([]);
    expect(statusLines({ branch: 'feat/x', status })).toEqual([
      '지금 브랜치: feat/x (적용은 최신 main에서만 해요)',
      '개발 DB 마지막 적용: 0017_notification_inbox',
      '모두 적용됨',
    ]);
  });

  it('개발 DB에 main 목록에 없는 마이그레이션이 적용돼 있으면 멈추라고 알려 준다', () => {
    const status = migrationStatus(ENTRIES, 250);
    expect(status.unknownLast).toBe(true);
    expect(status.lastTag).toBeNull();
    expect(statusLines({ branch: 'main', status })).toContain(
      '주의: 개발 DB에 main에 없는 마이그레이션이 적용돼 있어요. 적용하지 말고 PR에 남겨 주세요.',
    );
  });

  it('아무것도 적용하지 않은 DB는 목록 전부가 적용 안 된 것이다', () => {
    const status = migrationStatus(ENTRIES, null);
    expect(status.pending).toHaveLength(3);
    expect(status.unknownLast).toBe(false);
  });
});
