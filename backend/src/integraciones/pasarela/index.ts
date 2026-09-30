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
      urlExito: `${config.frontendUrl}/pagos/exito`,
      urlCancelacion: `${config.frontendUrl}/pagos/cancelado`,
      emailPorDefecto: config.checkoutEmailDefecto,
    });
  }
  return new MockPasarela();
}
