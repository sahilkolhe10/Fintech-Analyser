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
    // Provider order: AI_PROVIDER=zenmux (default) → groq → gemini.
    // Gemini is always preferred for document/vision analysis.
    GEMINI_API_KEY: string;
    GEMINI_MODEL?: string;
    GROQ_API_KEY?: string;
    AI_PROVIDER?: 'zenmux' | 'groq' | 'gemini';
    GROQ_MODEL?: string;
    ZENMUX_API_KEY?: string;
    ZENMUX_MODEL?: string;

    // ML signals service (ml/ — separate Cloud Run service)
    ML_SERVICE_URL?: string;

    // Firebase Admin (server-side agents — documents, Telegram)
    FIREBASE_SERVICE_ACCOUNT?: string;
    FIREBASE_ADMIN_PROJECT_ID?: string;
    FIREBASE_STORAGE_BUCKET?: string;
    GOOGLE_APPLICATION_CREDENTIALS?: string;

    // Telegram Bot
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;

    // Market Data APIs
    ALPHA_VANTAGE_API_KEY: string;

    // App Configuration
    NEXT_PUBLIC_APP_NAME: string;
    NEXT_PUBLIC_DEFAULT_CURRENCY: string;
    NEXT_PUBLIC_APP_URL: string;
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?: string;
  }
}
