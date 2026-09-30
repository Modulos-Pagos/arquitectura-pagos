import { loadStripe } from '@stripe/stripe-js';

/** Llave PUBLICABLE de Stripe (pk_test_...). Es pública: puede estar en el navegador. */
export const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;
