import { AppEnvironment } from '../../../environments/environment.model';

const PROD_PROJECT_ID = 'hypezone-dashboard-prod';
const DEV_PROJECT_PLACEHOLDER = 'HYPEZONE_DEV_PROJECT_ID';

export function validateEnvironment(environment: AppEnvironment): void {
  const projectId = environment.firebase.projectId.trim();

  if (!environment.production && projectId === PROD_PROJECT_ID) {
    throw new Error(
      'Configuracion invalida: un entorno no productivo no puede apuntar al proyecto Firebase de produccion.',
    );
  }

  if (environment.environmentName === 'DEV' && (!projectId || projectId === DEV_PROJECT_PLACEHOLDER)) {
    throw new Error(
      'Configuracion DEV incompleta: falta configurar el projectId real de Firebase desarrollo.',
    );
  }
}
