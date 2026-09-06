import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  environmentName: 'DEV',
  showEnvironmentBanner: true,
  firebase: {
    projectId: 'hypezone-dashboard-dev',
    appId: '1:787315432623:web:82547b98579eee0278885a',
    storageBucket: 'hypezone-dashboard-dev.firebasestorage.app',
    apiKey: 'AIzaSyBg6yB0IvpWMku5TgQOWgpEtCVjaKxBNKg',
    authDomain: 'hypezone-dashboard-dev.firebaseapp.com',
    messagingSenderId: '787315432623',
  },
  cloudinary: {
    cloudName: 'dawdr6c4j',
    uploadPreset: 'hypezone_upload',
  },
};
