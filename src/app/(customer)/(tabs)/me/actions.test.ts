import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refresh } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { customers } from '@/db/schema';
import { fail, ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { updateMyPhone, updateMyProfile } from './actions';
import { PHONE_FORMAT_MESSAGE } from '@/lib/phone';

// 로그인 확인·DB·화면 새로 그리기는 흉내 낸다. 여기서는 "본인 고객 계정만 고치고(X-102),
// 저장하는 모양(010-1234-5678)과 실패 안내, 로그에 연락처를 남기지 않는지"를 본다
vi.mock('next/cache', () => ({ refresh: vi.fn() }));
vi.mock('@/db', () => ({ getDb: vi.fn() }));
vi.mock('@/server/auth', () => ({ requireCustomer: vi.fn() }));
// 어느 계정을 고치는지 비교하려고 조건을 읽을 수 있는 값으로 바꾼다
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

const authMock = vi.mocked(requireCustomer);
const update = { table: vi.fn(), set: vi.fn(), where: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(ok({ userId: 'user-1', customerId: 'customer-1' }));
  update.where.mockResolvedValue(undefined);
  update.set.mockReturnValue({ where: update.where });
  update.table.mockReturnValue({ set: update.set });
  vi.mocked(getDb).mockReturnValue({ update: update.table } as unknown as ReturnType<typeof getDb>);
});

describe('updateMyProfile', () => {
  it('내 고객 계정의 이름·닉네임·연락처를 저장하고, 이름·닉네임은 앞뒤 공백을 빼고 연락처는 하이픈 모양으로 맞춘다', async () => {
    const result = await updateMyProfile({
      name: ' 김투리 ',
      nickname: '  줍줍  ',
      phone: '01012345678',
    });
    expect(result).toEqual(ok(null));
    expect(update.table).toHaveBeenCalledWith(customers);
    expect(update.set).toHaveBeenCalledWith({
      name: '김투리',
      nickname: '줍줍',
      phone: '010-1234-5678',
    });
    expect(update.where).toHaveBeenCalledWith(eq(customers.id, 'customer-1'));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('연락처를 비우면 지운다(null)', async () => {
    await updateMyProfile({ name: '김투리', nickname: '줍줍', phone: '' });
    expect(update.set).toHaveBeenCalledWith({ name: '김투리', nickname: '줍줍', phone: null });
  });

  it('형식이 틀리면 저장하지 않고 첫 번째 이유를 보여 준다', async () => {
    const empty = await updateMyProfile({ name: '김투리', nickname: '   ', phone: '' });
    expect(!empty.ok && empty.error).toEqual({
      code: 'INVALID_INPUT',
      message: '닉네임을 입력해 주세요',
    });
    const badPhone = await updateMyProfile({
      name: '김투리',
      nickname: '줍줍',
      phone: '031-123-4567',
    });
    expect(!badPhone.ok && badPhone.error.message).toBe(PHONE_FORMAT_MESSAGE);
    expect(update.table).not.toHaveBeenCalled();
  });

  it('이름을 비우면 저장하지 않는다(예약자 이름은 꼭 있어야 한다, #375)', async () => {
    const result = await updateMyProfile({ name: '  ', nickname: '줍줍', phone: '' });
    expect(!result.ok && result.error).toEqual({
      code: 'INVALID_INPUT',
      message: '이름을 입력해 주세요',
    });
    expect(update.table).not.toHaveBeenCalled();
  });

  it('고객으로 로그인하지 않았으면 저장하지 않는다', async () => {
    authMock.mockResolvedValueOnce(fail('WRONG_MODE', '고객으로 로그인해 주세요'));
    const result = await updateMyProfile({ name: '김투리', nickname: '줍줍', phone: '' });
    expect(!result.ok && result.error.code).toBe('WRONG_MODE');
    expect(update.table).not.toHaveBeenCalled();
  });

  it('저장이 실패하면 다시 시도하라고 알리고, 로그에는 연락처 없이 오류 이름만 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    update.where.mockRejectedValueOnce(new Error('value 010-1234-5678 violates constraint'));
    const result = await updateMyProfile({
      name: '김투리',
      nickname: '줍줍',
      phone: '01012345678',
    });
    expect(!result.ok && result.error.code).toBe('SAVE_FAILED');
    expect(log).toHaveBeenCalledWith('[updateMyProfile] 저장 실패:', 'Error');
    expect(JSON.stringify(log.mock.calls)).not.toContain('1234');
    expect(refresh).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('updateMyPhone (예약 확인 화면)', () => {
  it('내 고객 계정의 연락처만 저장하고 저장한 모양을 돌려준다', async () => {
    expect(await updateMyPhone('010 1234 5678')).toEqual(ok({ phone: '010-1234-5678' }));
    expect(update.set).toHaveBeenCalledWith({ phone: '010-1234-5678' });
    expect(update.where).toHaveBeenCalledWith(eq(customers.id, 'customer-1'));
  });

  it('예약하려면 연락처가 꼭 있어야 해서 비우는 건 받지 않는다', async () => {
    const result = await updateMyPhone('  ');
    expect(!result.ok && result.error.code).toBe('PHONE_REQUIRED');
    expect(update.table).not.toHaveBeenCalled();
  });

  it('휴대폰 모양이 아니면 저장하지 않는다', async () => {
    for (const input of ['031-123-4567', '010-12-34', 'abc', 1012345678, null]) {
      const result = await updateMyPhone(input);
      expect(!result.ok && result.error).toEqual({
        code: 'INVALID_INPUT',
        message: PHONE_FORMAT_MESSAGE,
      });
    }
    expect(update.table).not.toHaveBeenCalled();
  });

  it('고객으로 로그인하지 않았으면 저장하지 않는다', async () => {
    authMock.mockResolvedValueOnce(fail('UNAUTHENTICATED', '로그인해 주세요'));
    const result = await updateMyPhone('01012345678');
    expect(!result.ok && result.error.code).toBe('UNAUTHENTICATED');
    expect(update.table).not.toHaveBeenCalled();
  });

  it('저장이 실패하면 다시 시도하라고 알리고, 로그에는 오류 이름만 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    update.where.mockRejectedValueOnce(new RangeError('010-1234-5678'));
    const result = await updateMyPhone('01012345678');
    expect(!result.ok && result.error.code).toBe('SAVE_FAILED');
    expect(log).toHaveBeenCalledWith('[updateMyPhone] 저장 실패:', 'RangeError');
    log.mockRestore();
  });
});
