import type { Config } from '../../config/env';
import { PublicadorMock, type PublicadorEventos } from './eventos';
import { PublicadorRabbitMQ } from './rabbitmq.publicador';

export * from './eventos';

export function crearPublicador(config: Config): PublicadorEventos {
  if (config.brokerModo === 'rabbitmq') {
    return new PublicadorRabbitMQ({
      url: config.brokerUrl,
      exchange: config.brokerExchange,
      tipoExchange: config.brokerTipoExchange,
      timeoutMs: config.brokerTimeoutMs,
    });
  }
  return new PublicadorMock();
}
