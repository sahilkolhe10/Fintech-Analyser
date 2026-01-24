// Environment Types for FinManage
// This ensures type safety when accessing environment variables

declare namespace NodeJS {
  interface ProcessEnv {
    // Firebase Configuration
    NEXT_PUBLIC_FIREBASE_API_KEY: string;
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
    NEXT_PUBLIC_FIREBASE_APP_ID: string;

    // AI Configuration
    GEMINI_API_KEY: string;

    // Market Data APIs
    ALPHA_VANTAGE_API_KEY: string;

    // App Configuration
    NEXT_PUBLIC_APP_NAME: string;
    NEXT_PUBLIC_DEFAULT_CURRENCY: string;
    NEXT_PUBLIC_APP_URL: string;
  }
}
