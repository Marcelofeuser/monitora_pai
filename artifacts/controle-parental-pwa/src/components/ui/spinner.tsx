import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';

function Spinner({ className }: Pick<SVGProps<SVGSVGElement>, 'className'>) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
    />
  );
}

export { Spinner };
