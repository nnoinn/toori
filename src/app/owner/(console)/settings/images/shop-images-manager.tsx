'use client';

// 대표 사진·스타일 사진 올리기·바꾸기·순서 바꾸기·지우기·메뉴 연결 (O6, S-104, #23 D6·D16).
// 올리기: 브라우저에서 줄이기 → 업로드 주소 받기(createShopImageUploadUrl) → Storage에 직접 올리기 → 정보 저장(saveShopImage)

import { useRef, useState, useTransition } from 'react';
import { cn } from 'cn';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, ImageOff, ImagePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ShopImageKind } from '@/db/schema/shops';
import { UPLOAD_ALLOWED_TYPES, UPLOAD_MAX_BYTES } from '@/server/policy';
import { uploadToSignedUrl } from '@/server/storage/browser';
import { createShopImageUploadUrl } from '@/server/storage/upload';

import { deleteShopImage, moveShopImage, saveShopImage, setShopImageMenu } from './actions';
import { isAllowedImageType, resizeImage } from './resize-image';
import { SHOP_IMAGE_KIND_LABELS, SHOP_IMAGE_LIMITS } from './shop-images';

type ImageItem = { id: string; kind: ShopImageKind; url: string; menuId: string | null };
type MenuOption = { id: string; name: string; hidden: boolean };

const ACCEPT = UPLOAD_ALLOWED_TYPES.join(',');
const NO_MENU = '';

export function ShopImagesManager({
  shopId,
  images,
  menus,
}: {
  shopId: string;
  images: ImageItem[];
  menus: MenuOption[];
}) {
  const main = images.find((image) => image.kind === 'main') ?? null;
  const styles = images.filter((image) => image.kind === 'style');
  const styleLeft = SHOP_IMAGE_LIMITS.style - styles.length;

  const mainInput = useRef<HTMLInputElement>(null);
  const styleInput = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<ImageItem | null>(null);
  const [pending, startTransition] = useTransition();
  const busy = pending || progress !== null;

  /** 사진 한 장을 올리고 저장한다. 실패하면 보여줄 문구 */
  async function uploadOne(file: File, kind: ShopImageKind): Promise<string | null> {
    if (!isAllowedImageType(file.type)) return `${file.name}: JPG·PNG·WEBP 사진만 올릴 수 있어요`;
    const blob = await resizeImage(file);
    if (!blob) return `${file.name}: 사진을 열 수 없어요. 다른 사진을 골라 주세요`;
    if (blob.size > UPLOAD_MAX_BYTES) {
      return `${file.name}: ${UPLOAD_MAX_BYTES / 1_000_000}MB 이하 사진만 올릴 수 있어요`;
    }
    const signed = await createShopImageUploadUrl({
      shopId,
      contentType: blob.type,
      size: blob.size,
    });
    if (!signed.ok) return `${file.name}: ${signed.error.message}`;
    const uploaded = await uploadToSignedUrl({
      bucket: 'shop-images',
      path: signed.data.path,
      token: signed.data.token,
      file: blob,
    });
    if (!uploaded.ok) return `${file.name}: ${uploaded.error.message}`;
    const saved = await saveShopImage(shopId, { kind, path: signed.data.path });
    return saved.ok ? null : `${file.name}: ${saved.error.message}`;
  }

  async function upload(files: File[], kind: ShopImageKind) {
    setMessages([]);
    const errors: string[] = [];
    // 스타일 사진은 남은 장수만큼만 올린다
    const limit = kind === 'main' ? 1 : styleLeft;
    if (files.length > limit) {
      errors.push(`스타일 사진은 ${SHOP_IMAGE_LIMITS.style}장까지라 앞의 ${limit}장만 올렸어요`);
    }
    const targets = files.slice(0, limit);
    for (const [index, file] of targets.entries()) {
      setProgress(
        targets.length > 1 ? `사진 올리는 중 (${index + 1}/${targets.length})` : '사진 올리는 중',
      );
      const error = await uploadOne(file, kind);
      if (error) errors.push(error);
    }
    setProgress(null);
    setMessages(errors);
  }

  function choose(kind: ShopImageKind, list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    void upload(files, kind);
  }

  /** 순서 바꾸기·메뉴 연결·지우기. 실패하면 문구를 보여준다 */
  function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setMessages([]);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setMessages([result.error?.message ?? '잠시 후 다시 시도해 주세요']);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 파일 고르기 칸은 숨기고 버튼으로 연다. 같은 파일을 다시 골라도 열리게 고른 뒤 값을 비운다 */}
      <input
        ref={mainInput}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          choose('main', event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={styleInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          choose('style', event.target.files);
          event.target.value = '';
        }}
      />

      {progress || messages.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm" aria-live="polite">
          {progress ? <p className="text-muted-foreground">{progress}…</p> : null}
          {messages.map((message) => (
            <p key={message} role="alert" className="text-destructive">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{SHOP_IMAGE_KIND_LABELS.main}</CardTitle>
          <p className="text-sm text-muted-foreground">
            매물 목록 카드와 상세 화면 첫 장에 나와요. 1장만 올릴 수 있어요.
          </p>
        </CardHeader>
        <CardContent className="flex items-end gap-4">
          {main ? (
            <Photo url={main.url} alt={SHOP_IMAGE_KIND_LABELS.main} className="w-72" />
          ) : (
            <EmptyPhoto className="w-72" />
          )}
          <div className="flex gap-2">
            <Button size="lg" disabled={busy} onClick={() => mainInput.current?.click()}>
              <ImagePlus aria-hidden />
              {main ? '바꾸기' : '올리기'}
            </Button>
            {main ? (
              <Button variant="ghost" size="lg" disabled={busy} onClick={() => setDeleting(main)}>
                지우기
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>
              {SHOP_IMAGE_KIND_LABELS.style} {styles.length}/{SHOP_IMAGE_LIMITS.style}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              시술 결과 사진이에요. 상세 화면에서 대표 사진 다음에 이 순서대로 나와요. 메뉴를 골라
              두면 어떤 메뉴의 사진인지 함께 보여줄 수 있어요(고르지 않아도 돼요).
            </p>
          </div>
          <Button
            size="lg"
            disabled={busy || styleLeft <= 0}
            onClick={() => styleInput.current?.click()}
          >
            <ImagePlus aria-hidden />
            사진 추가
          </Button>
        </CardHeader>
        <CardContent>
          {styles.length === 0 ? (
            <p className="rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">
              아직 스타일 사진이 없어요. 여러 장을 한 번에 골라 올릴 수 있어요.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-4">
              {styles.map((image, index) => (
                <li key={image.id} className="flex flex-col gap-2">
                  <Photo url={image.url} alt={`${SHOP_IMAGE_KIND_LABELS.style} ${index + 1}`} />
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${index + 1}번째 사진 앞으로`}
                      disabled={busy || index === 0}
                      onClick={() => run(() => moveShopImage(shopId, image.id, 'up'))}
                    >
                      <ArrowLeft />
                    </Button>
                    <span className="text-xs text-muted-foreground">{index + 1}번째</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${index + 1}번째 사진 뒤로`}
                      disabled={busy || index === styles.length - 1}
                      onClick={() => run(() => moveShopImage(shopId, image.id, 'down'))}
                    >
                      <ArrowRight />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      disabled={busy}
                      onClick={() => setDeleting(image)}
                    >
                      지우기
                    </Button>
                  </div>
                  <select
                    aria-label={`${index + 1}번째 사진 메뉴`}
                    value={image.menuId ?? NO_MENU}
                    disabled={busy}
                    onChange={(event) =>
                      run(() => setShopImageMenu(shopId, image.id, event.target.value || null))
                    }
                    className="h-8 rounded-lg border bg-card px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    <option value={NO_MENU}>메뉴 고르지 않음</option>
                    {menus
                      .filter((menu) => !menu.hidden || menu.id === image.menuId)
                      .map((menu) => (
                        <option key={menu.id} value={menu.id} disabled={menu.hidden}>
                          {menu.name}
                          {menu.hidden ? ' (숨긴 메뉴)' : ''}
                        </option>
                      ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        JPG·PNG·WEBP 사진을 올릴 수 있어요. 올릴 때 긴 쪽을 {SHOP_IMAGE_LIMITS.longSide}px로 줄이고,
        사진 속 위치 정보는 지워요.
      </p>

      <Dialog open={deleting !== null} onOpenChange={(open) => (open ? null : setDeleting(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>사진을 지울까요?</DialogTitle>
            <DialogDescription>
              지운 사진은 되돌릴 수 없어요. 고객 화면에서도 바로 빠져요.
            </DialogDescription>
          </DialogHeader>
          {deleting ? (
            <Photo url={deleting.url} alt="지울 사진" className="w-48 self-center" />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const target = deleting;
                if (!target) return;
                setDeleting(null);
                run(() => deleteShopImage(shopId, target.id));
              }}
            >
              지우기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Photo({ url, alt, className }: { url: string; alt: string; className?: string }) {
  return (
    <div
      className={cn('relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted', className)}
    >
      <Image src={url} alt={alt} fill sizes="300px" className="object-cover" />
    </div>
  );
}

function EmptyPhoto({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex aspect-[4/3] items-center justify-center rounded-lg bg-muted text-muted-foreground',
        className,
      )}
    >
      <ImageOff className="size-8" aria-hidden />
      <span className="sr-only">아직 사진이 없어요</span>
    </div>
  );
}
