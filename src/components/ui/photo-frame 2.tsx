import Image from 'next/image';
import { cn } from 'cn';
import { ImageIcon } from 'lucide-react';

type PhotoFrameProps = {
  /** 사진 주소(Supabase Storage 공개 주소). 없으면 빈 칸 */
  src?: string | null;
  alt: string;
  /** next/image sizes. 예: "(min-width: 768px) 25vw, 50vw" */
  sizes: string;
  /** 크기·비율·모서리. 예: "aspect-square w-full rounded-t-xl" */
  className?: string;
  /** 화면 맨 위 큰 사진처럼 먼저 보여야 하면 */
  priority?: boolean;
};

/**
 * 사진 한 장 자리. 사진이 없으면 같은 크기의 빈 칸(연회색 + 사진 아이콘)을 둔다.
 * 사진이 아직 없는 샵도 사진이 들어갈 공간이 보이게 미리 만들어 둔다(11/15 회의). 크기·비율은 감싸는 쪽이 정한다
 */
export function PhotoFrame({ src, alt, sizes, className, priority }: PhotoFrameProps) {
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground/50">
          <ImageIcon className="size-6" aria-hidden />
        </div>
      )}
    </div>
  );
}
