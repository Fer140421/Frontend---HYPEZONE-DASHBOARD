export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  uploadPreset: string;
}

export interface AppEnvironment {
  production: boolean;
  environmentName: 'DEV' | 'PROD';
  showEnvironmentBanner: boolean;
  storeUrl: string;
  firebase: FirebaseWebConfig;
  cloudinary: CloudinaryConfig;
}
