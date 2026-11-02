import { describe, expect, it } from 'vitest';

import {
  editPhoneInput,
  formatAnyPhoneInput,
  formatPhoneInput,
  isPhoneInputFull,
  normalizePhone,
} from './phone';

describe('normalizePhone', () => {
  it('휴대폰 번호를 하이픈 넣은 모양으로 맞춘다', () => {
    expect(normalizePhone('01012345678', 'mobile')).toBe('010-1234-5678');
    expect(normalizePhone('010-1234-5678', 'mobile')).toBe('010-1234-5678');
    expect(normalizePhone(' 010 1234 5678 ', 'mobile')).toBe('010-1234-5678');
    expect(normalizePhone('0111234567', 'mobile')).toBe('011-123-4567');
    expect(normalizePhone('01912345678', 'mobile')).toBe('019-1234-5678');
  });

  it('지역번호·070·안심번호·대표번호는 any에서만 받는다', () => {
    expect(normalizePhone('0212345678')).toBe('02-1234-5678');
    expect(normalizePhone('021234567')).toBe('02-123-4567');
    expect(normalizePhone('0311234567')).toBe('031-123-4567');
    expect(normalizePhone('031-1234-5678')).toBe('031-1234-5678');
    expect(normalizePhone('07012345678')).toBe('070-1234-5678');
    expect(normalizePhone('050712345678')).toBe('0507-1234-5678');
    expect(normalizePhone('05051234567')).toBe('0505-123-4567');
    expect(normalizePhone('15881234')).toBe('1588-1234');
    expect(normalizePhone('01012345678')).toBe('010-1234-5678');

    expect(normalizePhone('0311234567', 'mobile')).toBeNull();
    expect(normalizePhone('050712345678', 'mobile')).toBeNull();
    expect(normalizePhone('15881234', 'mobile')).toBeNull();
  });

  it('번호 모양이 아니면 null', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('0101234567')).toBeNull(); // 010은 가운데가 4자리
    expect(normalizePhone('010123456789')).toBeNull();
    expect(normalizePhone('0301234567')).toBeNull(); // 없는 지역번호
    expect(normalizePhone('000-0000-0000')).toBeNull();
    expect(normalizePhone('+82 10-1234-5678')).toBeNull();
    expect(normalizePhone('010.1234.5678')).toBeNull();
    expect(normalizePhone('010-1234-567a')).toBeNull();
  });
});

describe('formatPhoneInput (입력 중 모양, #183)', () => {
  it('치는 대로 3-4-4로 하이픈을 넣는다', () => {
    expect(formatPhoneInput('')).toBe('');
    expect(formatPhoneInput('0')).toBe('0');
    expect(formatPhoneInput('010')).toBe('010');
    expect(formatPhoneInput('0101')).toBe('010-1');
    expect(formatPhoneInput('0101234')).toBe('010-1234');
    expect(formatPhoneInput('01012345')).toBe('010-1234-5');
    expect(formatPhoneInput('0101234567')).toBe('010-1234-567');
    expect(formatPhoneInput('01012345678')).toBe('010-1234-5678');
  });

  it('011·016~019의 10자리 번호는 3-3-4', () => {
    expect(formatPhoneInput('0111234567')).toBe('011-123-4567');
    expect(formatPhoneInput('0191234567')).toBe('019-123-4567');
    expect(formatPhoneInput('01112345678')).toBe('011-1234-5678');
  });

  it('하이픈이 든 번호를 붙여 넣어도 같은 모양이고, 저장 모양과 같다', () => {
    expect(formatPhoneInput('010-1234-5678')).toBe('010-1234-5678');
    expect(formatPhoneInput('010 1234 5678')).toBe('010-1234-5678');
    expect(formatPhoneInput('01012345678')).toBe(normalizePhone('01012345678', 'mobile'));
    expect(formatPhoneInput('0111234567')).toBe(normalizePhone('0111234567', 'mobile'));
  });

  it('숫자가 아닌 글자는 빼고 11자리까지만', () => {
    expect(formatPhoneInput('01O-12a34')).toBe('011-234');
    expect(formatPhoneInput('+82 10')).toBe('821-0');
    expect(formatPhoneInput('010123456789999')).toBe('010-1234-5678');
  });
});

describe('isPhoneInputFull', () => {
  it('11자리를 다 쳤을 때만 끝까지 친 것으로 본다', () => {
    expect(isPhoneInputFull('010-1234-5678')).toBe(true);
    expect(isPhoneInputFull('010-1234-567')).toBe(false);
    // 011의 10자리는 맞는 번호지만 11자리까지 칠 수 있어서 칸을 벗어날 때 저장한다
    expect(isPhoneInputFull('011-123-4567')).toBe(false);
    expect(isPhoneInputFull('')).toBe(false);
  });
});

describe('editPhoneInput (입력칸 글자가 바뀔 때, #183)', () => {
  // 브라우저가 바꾼 값(raw)과 커서 위치를 '|'로 적는다
  const edit = (prev: string, rawWithCaret: string, deleteForward = false) => {
    const caret = rawWithCaret.indexOf('|');
    const raw = rawWithCaret.replace('|', '');
    const next = editPhoneInput(prev, raw, caret, deleteForward);
    return `${next.value.slice(0, next.caret)}|${next.value.slice(next.caret)}`;
  };

  it('끝에 치면 하이픈이 붙고 커서는 끝에 있다', () => {
    expect(edit('010', '0101|')).toBe('010-1|');
    expect(edit('010-1234', '010-12345|')).toBe('010-1234-5|');
    expect(edit('010-1234-567', '010-1234-5678|')).toBe('010-1234-5678|');
  });

  it('하이픈 바로 뒤에서 지우기를 누르면 앞 숫자가 지워진다', () => {
    // '010-|1234'에서 지우기 → 브라우저는 하이픈만 지운다
    expect(edit('010-1234', '010|1234')).toBe('01|1-234');
    expect(edit('010-1234-5678', '010-1234|5678')).toBe('010-123|5-678');
  });

  it('하이픈 바로 앞에서 Delete를 누르면 뒤 숫자가 지워진다', () => {
    expect(edit('010-1234', '010|1234', true)).toBe('010|-234');
  });

  it('번호 가운데를 고쳐도 커서가 그 숫자 뒤에 남는다', () => {
    // '010-1|234-5678'의 1 뒤에 9를 넣으면 11자리를 넘어서 받지 않는다
    expect(edit('010-1234-5678', '010-19|234-5678')).toBe('010-1|234-5678');
    // 가운데 숫자를 지우면 뒤 숫자가 당겨지고 커서는 그 자리에
    expect(edit('010-1234-5678', '010-1|34-5678')).toBe('010-1|345-678');
    // 지운 뒤 다시 넣으면 원래대로
    expect(edit('010-1345-678', '010-12|345-678')).toBe('010-12|34-5678');
  });

  it('붙여 넣으면 모양을 맞추고 11자리까지 자른다', () => {
    expect(edit('', '010-1234-5678|')).toBe('010-1234-5678|');
    expect(edit('', '010123456789999|')).toBe('010-1234-5678|');
    expect(edit('', '010 1234 5678|')).toBe('010-1234-5678|');
  });

  it('숫자가 아닌 글자는 받지 않는다', () => {
    expect(edit('010-12', '010-12a|')).toBe('010-12|');
    expect(edit('010-12', '010-1a|2')).toBe('010-1|2');
  });

  it('모두 지우면 빈 칸', () => {
    expect(edit('0', '|')).toBe('|');
    expect(edit('010-1234-5678', '|')).toBe('|');
  });
});

describe('formatAnyPhoneInput (샵 전화번호 입력 중 모양, #205)', () => {
  it('앞자리에 맞춰 하이픈을 넣고, 끝까지 친 모양은 저장 모양과 같다', () => {
    const numbers = [
      '02-123-4567',
      '02-1234-5678',
      '031-123-4567',
      '031-1234-5678',
      '070-1234-5678',
      '0505-123-4567',
      '0507-1234-5678',
      '1588-1234',
      '010-1234-5678',
      '011-123-4567',
    ];
    for (const number of numbers) {
      expect(formatAnyPhoneInput(number.replace(/-/g, ''))).toBe(number);
      expect(normalizePhone(number)).toBe(number);
    }
  });

  it('치는 동안: 가운데는 4자리로 넣다가 짧은 번호를 끝까지 치면 3자리', () => {
    expect(formatAnyPhoneInput('0')).toBe('0');
    expect(formatAnyPhoneInput('02')).toBe('02');
    expect(formatAnyPhoneInput('021')).toBe('02-1');
    expect(formatAnyPhoneInput('021234')).toBe('02-1234');
    expect(formatAnyPhoneInput('0212345')).toBe('02-1234-5');
    expect(formatAnyPhoneInput('03')).toBe('03');
    expect(formatAnyPhoneInput('0311234')).toBe('031-1234');
    expect(formatAnyPhoneInput('031123456')).toBe('031-1234-56');
    expect(formatAnyPhoneInput('050')).toBe('050');
    expect(formatAnyPhoneInput('05071')).toBe('0507-1');
    expect(formatAnyPhoneInput('158812')).toBe('1588-12');
    // 휴대폰은 formatPhoneInput과 같다
    expect(formatAnyPhoneInput('0101234567')).toBe(formatPhoneInput('0101234567'));
  });

  it('그 번호의 자릿수까지만 받는다', () => {
    expect(formatAnyPhoneInput('02123456789')).toBe('02-1234-5678');
    expect(formatAnyPhoneInput('031123456789')).toBe('031-1234-5678');
    expect(formatAnyPhoneInput('0507123456789')).toBe('0507-1234-5678');
    expect(formatAnyPhoneInput('158812345')).toBe('1588-1234');
  });

  it('없는 앞자리는 하이픈 없이 숫자만(저장할 때 normalizePhone이 막는다)', () => {
    expect(formatAnyPhoneInput('0301234567')).toBe('0301234567');
    expect(formatAnyPhoneInput('99999999999999')).toBe('999999999999');
  });
});

describe('editPhoneInput any (샵 전화번호 입력칸, #205)', () => {
  const edit = (prev: string, rawWithCaret: string) => {
    const caret = rawWithCaret.indexOf('|');
    const raw = rawWithCaret.replace('|', '');
    const next = editPhoneInput(prev, raw, caret, false, 'any');
    return `${next.value.slice(0, next.caret)}|${next.value.slice(next.caret)}`;
  };

  it('치는 대로 앞자리에 맞춰 하이픈을 넣는다', () => {
    expect(edit('02-1234', '02-12345|')).toBe('02-1234-5|');
    expect(edit('031-1234-567', '031-1234-5678|')).toBe('031-1234-5678|');
    expect(edit('031-1234-56', '031-1234-567|')).toBe('031-123-4567|');
  });

  it('그 번호의 자릿수를 다 친 뒤에는 더 받지 않는다', () => {
    expect(edit('02-1234-5678', '02-1234-56789|')).toBe('02-1234-5678|');
    expect(edit('1588-1234', '1588-12345|')).toBe('1588-1234|');
  });

  it('하이픈 든 번호를 붙여 넣어도 같은 모양', () => {
    expect(edit('', '0507-1234-5678|')).toBe('0507-1234-5678|');
    expect(edit('', '02 123 4567|')).toBe('02-123-4567|');
  });
});
