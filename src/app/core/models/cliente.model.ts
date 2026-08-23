import { AuditableEntity } from './base.model';

export interface Cliente extends AuditableEntity {
  schemaVersion?: number;
  nombreCompleto: string;
  celular: string;
  ci?: string;
  puntosDisponibles?: number;
  puntosAcumulados?: number;
  recompensasDisponibles?: number;
}

export function normalizeCliente(cliente: Cliente): Cliente {
  return {
    ...cliente,
    ci: cliente.ci?.trim() || undefined,
    puntosDisponibles: Number(cliente.puntosDisponibles ?? 0),
    puntosAcumulados: Number(cliente.puntosAcumulados ?? 0),
    recompensasDisponibles: Number(cliente.recompensasDisponibles ?? 0),
    activo: cliente.activo ?? true,
  };
}
