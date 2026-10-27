import * as React from 'react';
import { cn } from 'cn';

// 한 줄 입력칸. 틀린 값이면 aria-invalid를 주면 빨간 테두리가 된다
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground read-only:bg-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
