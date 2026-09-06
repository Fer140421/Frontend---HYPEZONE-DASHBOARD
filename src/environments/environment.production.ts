import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  environmentName: 'PROD',
  showEnvironmentBanner: false,
  firebase: {
    apiKey: 'AIzaSyCCJF6KPmI4nB6TdKaKwsRe-LRuNDmLuEY',
    authDomain: 'hypezone-dashboard-prod.firebaseapp.com',
    projectId: 'hypezone-dashboard-prod',
    storageBucket: 'hypezone-dashboard-prod.firebasestorage.app',
    messagingSenderId: '304252666657',
    appId: '1:304252666657:web:67e0aaffb983758555f460',
  },
  cloudinary: {
    cloudName: 'dawdr6c4j',
    uploadPreset: 'hypezone_upload',
  },
};
