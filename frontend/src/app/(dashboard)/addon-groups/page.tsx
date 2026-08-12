'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/flo';

/** Legacy route — add-on groups live on the Products inventory tab. */
export default function AddonGroupsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/products?tab=addons');
  }, [router]);

  return <LoadingState className="min-h-[16rem]" />;
}
