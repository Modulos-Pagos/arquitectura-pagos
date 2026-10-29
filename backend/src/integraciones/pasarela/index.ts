import type { Config } from '../../config/env';
import { MockPasarela } from './mock.pasarela';
import type { PasarelaPago } from './pasarela';
import { StripePasarela } from './stripe.pasarela';

export function crearPasarela(config: Config): PasarelaPago {
  if (config.pasarela === 'stripe') {
    return new StripePasarela({
      secretKey: config.stripeSecretKey,
      webhookSecret: config.stripeWebhookSecret,
      timeoutMs: config.stripeTimeoutMs,
      // Stripe Checkout vuelve a la misma página de pago (?id_pago=...), que muestra el resultado.
      urlExito: `${config.frontendUrl}/`,
      urlCancelacion: `${config.frontendUrl}/`,
      emailPorDefecto: config.checkoutEmailDefecto,
    });
  }
  return new MockPasarela();
}
