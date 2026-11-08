import { useRef, useState } from 'react';

import { updateMyPhone } from '@/app/(customer)/(tabs)/me/actions';
import { isPhoneInputFull, PHONE_FORMAT_MESSAGE } from '@/lib/phone';

import { isPhoneReady, phoneSubmit } from './phone-save-rules';

const SAVE_FAILED = '저장하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 예약 확인 화면 연락처 자동 저장 (J10, C-401, #183). 저장된 번호를 칸에 미리 채우고,
 * 번호를 끝까지 치면(11자리) 바로, 011·016~019의 10자리 번호는 칸을 벗어날 때 저장한다.
 * 저장 실패 뒤에는 다시 고치거나 칸을 벗어나면 다시 저장한다.
 * ready가 false면 결제 버튼을 잠근다(저장 중, 저장 실패, 고치는 중. 규칙은 phone-save-rules.ts)
 */
export function usePhoneAutoSave(serverPhone: string | null) {
  const [server, setServer] = useState(serverPhone);
  const [value, setValue] = useState(serverPhone ?? '');
  /** 서버에 저장된 번호(주문이 읽는 값). 저장에 실패하면 확실하지 않아서 null로 두고 다시 저장받는다 */
  const [saved, setSaved] = useState(serverPhone);
  /** 지금 저장 중인 번호(마지막으로 보낸 것) */
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // 저장을 연달아 부르면 마지막으로 보낸 저장의 결과만 화면에 반영한다
  const latest = useRef(0);

  // 다른 화면(내 정보)에서 번호를 바꾸고 돌아오면 서버 값으로 맞춘다.
  // 이 화면의 저장은 서버 값을 다시 읽지 않아서 여기 걸리지 않는다(입력 중인 칸이 초기화되지 않게)
  if (server !== serverPhone) {
    setServer(serverPhone);
    setValue(serverPhone ?? '');
    setSaved(serverPhone);
    setError(null);
    setInvalid(false);
    setJustSaved(false);
  }

  function save(phone: string) {
    latest.current += 1;
    const request = latest.current;
    setSaving(phone);
    // 지난 저장 실패 문구는 다시 저장을 시작하면 지운다(칸을 벗어나 다시 저장할 때는 change를 거치지 않는다)
    setError(null);
    // 끝나면 실패 문구만 띄운다. 저장하는 사이에 생긴 틀린 번호 표시는 그대로 둔다
    const finish = (result: { phone: string } | { failed: string }) => {
      if (request !== latest.current) return;
      setSaving(null);
      if ('phone' in result) {
        setSaved(result.phone);
        setJustSaved(true);
      } else {
        setSaved(null);
        setError(result.failed);
      }
    };
    updateMyPhone(phone).then(
      (result) => finish(result.ok ? result.data : { failed: result.error.message }),
      () => finish({ failed: SAVE_FAILED }),
    );
  }

  function submit(next: string) {
    const decision = phoneSubmit(next, saved, saving);
    if (decision.kind === 'invalid') {
      setError(PHONE_FORMAT_MESSAGE);
      setInvalid(true);
    } else if (decision.kind === 'save') {
      save(decision.phone);
    }
  }

  function change(next: string) {
    setValue(next);
    // 틀린 번호·저장 실패 표시는 다시 고치기 시작하면 지운다
    setError(null);
    setInvalid(false);
    setJustSaved(false);
    if (isPhoneInputFull(next)) submit(next);
  }

  /** 서버에 번호가 없다고 했을 때(결제 시작의 PHONE_REQUIRED). 칸을 비우고 다시 받는다 */
  function markMissing() {
    setValue('');
    setSaved(null);
    setJustSaved(false);
  }

  const ready = isPhoneReady(value, saved, saving);
  return {
    value,
    saving: saving !== null,
    error,
    invalid,
    /** 이 화면에서 방금 저장했고 그 번호 그대로다("저장했어요") */
    justSaved: justSaved && ready,
    ready,
    change,
    blur: () => submit(value),
    markMissing,
  };
}

export type PhoneAutoSave = ReturnType<typeof usePhoneAutoSave>;
