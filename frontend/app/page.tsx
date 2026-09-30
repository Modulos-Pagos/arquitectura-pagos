import { Suspense } from 'react';
import CheckoutPage from '@/components/checkout/CheckoutPage';

export default function Page() {
  // useSearchParams (lectura de ?id_pago=) requiere un límite de Suspense en Next.js
  return (
    <Suspense>
      <CheckoutPage />
    </Suspense>
  );
}
