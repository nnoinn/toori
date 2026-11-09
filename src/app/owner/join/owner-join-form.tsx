'use client';

// 원장님 가입·입점 신청 입력 (O7 ①, S-101 화면·S-107·S-108, #23 D3·D17). 가입 때는 필수만 받는다(D17).
// [입점 신청하기]를 누르면 화면에서 한 번 검사하고, 강규민님 createOwnerAccount가 다시 검사한 뒤 샵을 '승인 대기'로 만든다.
// 검사를 통과하면 정산 계좌 확인 창(#163)에서 계좌번호 전체를 한 번 더 확인받고 신청한다.
// 성공하면 /owner로 가고 거기서 "입점 신청을 마쳤어요" 안내 상자가 잠깐 뜬다(joined-notice.tsx).
// 휴대폰·사업자등록번호·샵 전화번호·계좌번호 칸은 숫자만 쳐도 양식대로 맞춘다(#205).
// 이 파일은 입력값·오류 상태와 검사·저장을 맡고, 칸 묶음 5개는 owner-join-sections.tsx가 그린다.

import { useRef, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import type { GeocodeCandidate } from '@/features/map/geocode';
import { SITE_NAME } from '@/lib/site';
import { createOwnerAccount, type CreateOwnerAccountInput } from '@/server/auth/owner-account';

import { PayoutConfirmDialog, payoutKey } from '../payout-confirm-dialog';
import { uploadBusinessDoc } from './business-doc';
import { clearJoinPending, markJoinPending } from './joined-notice';
import {
  EMPTY_OWNER_JOIN_FORM,
  OWNER_JOIN_FIELD_ORDER,
  type OwnerJoinFieldErrors,
  type OwnerJoinForm as OwnerJoinFormValues,
  validateOwnerJoin,
} from './owner-join';
import {
  AgreementsSection,
  type BusinessDocUpload,
  BusinessSection,
  type JoinFormBinding,
  OwnerInfoSection,
  PayoutSection,
  ShopSection,
} from './owner-join-sections';

const JOIN_FAILED_MESSAGE = '입점 신청을 하지 못했어요. 잠시 후 다시 시도해 주세요.';

export function OwnerJoinForm({ today }: { today: string }) {
  const router = useRouter();
  const [form, setForm] = useState<OwnerJoinFormValues>(EMPTY_OWNER_JOIN_FORM);
  const [errors, setErrors] = useState<OwnerJoinFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 서버가 주소를 하나로 정하지 못했을 때 고를 후보
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [doc, setDoc] = useState<BusinessDocUpload | null>(null);
  const [pending, startTransition] = useTransition();
  // 정산 계좌 확인 창에 띄운 신청 값(#163)
  const [confirming, setConfirming] = useState<CreateOwnerAccountInput | null>(null);
  // 확인받은 계좌. 서버 오류(주소 다시 고르기 등) 뒤 다시 신청할 때 계좌가 그대로면 다시 묻지 않는다
  const confirmedPayout = useRef<string | null>(null);

  /** 칸 하나를 바꾼다. 고치기 시작하면 그 칸의 오류 문구는 바로 지운다 */
  function update<K extends keyof OwnerJoinFormValues>(key: K, value: OwnerJoinFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  /** 처음 오류가 난 칸으로 옮긴다. 칸이 많아 오류가 화면 밖에 있으면 모르고 지나치기 쉽다 */
  function focusFirstError(fieldErrors: OwnerJoinFieldErrors) {
    const first = OWNER_JOIN_FIELD_ORDER.find((field) => fieldErrors[field]);
    if (!first) return;
    const element = document.getElementById(first);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element?.focus({ preventScroll: true });
  }

  /**
   * [입점 신청하기]: 화면에서 검사하고, 통과하면 계좌 확인 창을 띄운다.
   * values를 따로 받는 까닭: 주소 후보를 고른 직후에는 setForm이 아직 반영되지 않아서 새 값을 직접 넘긴다
   */
  function submit(values: OwnerJoinFormValues) {
    setFormError(null);
    setNotice(null);
    const checked = validateOwnerJoin(values, today);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      focusFirstError(checked.fieldErrors);
      return;
    }
    setErrors({});
    if (confirmedPayout.current === payoutKey(checked.data.payout)) {
      save(checked.data);
      return;
    }
    setConfirming(checked.data);
  }

  /** 확인 창 [맞아요, 신청하기] */
  function confirmPayout() {
    if (!confirming) return;
    confirmedPayout.current = payoutKey(confirming.payout);
    save(confirming);
  }

  /** createOwnerAccount를 부르고, 서버 오류는 해당 칸 아래(주소·등록증·약관)나 버튼 위에 보여준다 */
  function save(input: CreateOwnerAccountInput) {
    // 성공하면 저장이 바꾼 쿠키 때문에 이 화면이 다시 그려지면서 바로 /owner로 넘어가서, 여기로 돌아오지 않을 수 있다.
    // 그래서 부르기 전에 표시를 남기고, /owner가 그 표시로 안내 상자를 띄운다
    markJoinPending();
    startTransition(async () => {
      try {
        const result = await createOwnerAccount(input);
        setConfirming(null);
        if (result.ok) {
          router.replace('/owner');
          return;
        }
        clearJoinPending();
        const { code, message } = result.error;
        // 다른 창에서 먼저 가입을 마친 경우
        if (code === 'ALREADY_EXISTS') {
          router.replace('/owner');
          return;
        }
        let fieldErrors: OwnerJoinFieldErrors = {};
        if (code.startsWith('ADDRESS_')) {
          fieldErrors = { roadAddress: message };
          setCandidates(result.error.candidates ?? []);
        } else if (code === 'INVALID_PATH') {
          fieldErrors = { businessDocPath: message };
        } else if (code === 'REQUIRED_TERMS_MISSING') {
          fieldErrors = { agreements: message };
        } else {
          setFormError(message);
        }
        setErrors(fieldErrors);
        focusFirstError(fieldErrors);
      } catch (caught) {
        // 화면 이동(redirect 등) 신호는 Next.js가 처리하도록 다시 던진다
        unstable_rethrow(caught);
        setConfirming(null);
        clearJoinPending();
        setFormError(JOIN_FAILED_MESSAGE);
      }
    });
  }

  /** [주소 찾기]로 고른 주소. 예전 후보 목록은 더 맞지 않으니 닫는다 */
  function selectAddress(roadAddress: string) {
    update('roadAddress', roadAddress);
    setCandidates([]);
  }

  /**
   * 서버가 보여준 주소 후보를 골랐을 때. 후보는 신청이 주소 때문에 막혔을 때만 뜨므로,
   * 고르는 것이 곧 신청을 이어 가는 것이라 [입점 신청하기]를 다시 누르지 않게 바로 다시 신청한다
   */
  function chooseCandidate(roadAddress: string) {
    const next = { ...form, roadAddress };
    setForm(next);
    setCandidates([]);
    submit(next);
  }

  /**
   * 등록증 파일을 고르면 바로 올린다. 실패하면 경로를 비워서 예전 파일 경로로 신청되지 않게 한다
   */
  async function chooseDoc(file: File | undefined) {
    if (!file) return;
    setDoc({ name: file.name, uploading: true });
    setErrors((prev) => ({ ...prev, businessDocPath: undefined }));
    const result = await uploadBusinessDoc(file);
    if (result.ok) {
      setForm((prev) => ({ ...prev, businessDocPath: result.path }));
      setDoc({ name: file.name, uploading: false });
    } else {
      setForm((prev) => ({ ...prev, businessDocPath: '' }));
      setDoc(null);
      setErrors((prev) => ({ ...prev, businessDocPath: result.message }));
    }
  }

  const binding: JoinFormBinding = { form, errors, update };
  // 등록증을 올리는 중에 신청하면 경로가 빠진 채로 검사되므로 같이 막는다
  const busy = pending || doc?.uploading === true;

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit(form);
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">원장님 가입·입점 신청</h1>
        <p className="text-sm text-muted-foreground">
          입점 심사와 정산에 꼭 필요한 정보만 받아요. 영업시간·사진·메뉴는 승인을 기다리는 동안 매장
          설정에서 입력하면 돼요.
        </p>
      </div>

      <OwnerInfoSection binding={binding} />
      <BusinessSection
        binding={binding}
        today={today}
        doc={doc}
        busy={busy}
        onChooseDoc={(file) => void chooseDoc(file)}
      />
      <ShopSection
        binding={binding}
        candidates={candidates}
        pending={pending}
        onAddressSelect={selectAddress}
        onAddressError={(message) => setErrors((prev) => ({ ...prev, roadAddress: message }))}
        onChooseCandidate={chooseCandidate}
      />
      <PayoutSection binding={binding} />
      <AgreementsSection
        binding={binding}
        onShowTerms={() => setNotice('약관 내용은 준비 중이에요.')}
      />

      <div className="flex flex-col gap-2">
        {formError ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {formError}
          </p>
        ) : notice ? (
          <p role="status" className="text-center text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="h-12 text-base" disabled={busy}>
          {pending ? '신청하는 중…' : '입점 신청하기'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {SITE_NAME} 운영팀이 확인한 뒤 승인되면 매물을 올릴 수 있어요.
        </p>
      </div>

      <PayoutConfirmDialog
        account={confirming?.payout ?? null}
        description="입점 신청을 하면 이 계좌로 정산금을 받아요."
        confirmLabel="맞아요, 신청하기"
        pendingLabel="신청하는 중…"
        pending={pending}
        onConfirm={confirmPayout}
        onCancel={() => setConfirming(null)}
      />
    </form>
  );
}
