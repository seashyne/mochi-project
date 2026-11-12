// Environment bindings interface for Mochi Cloud API Worker runtime

export interface MochiEnv {
  // Cloudflare D1 Relational SQLite Database Binding
  DB: D1Database;

  // Cloudflare R2 Object Storage Bucket Binding (Game packages and thumbnails)
  ASSETS: R2Bucket;

  // Cloudflare Durable Object Namespace for Realtime Multiplayer Game Rooms
  GAME_ROOM: DurableObjectNamespace;

  // One live Team Create session per studio draft (optional so local test
  // environments can omit the binding and get a clean 503 response).
  STUDIO_DRAFT?: DurableObjectNamespace;

  // Execution environment tag (development, staging, production)
  ENVIRONMENT?: string;

  // Parameterized CORS allowed origins (e.g. "https://game.lenout.com,http://localhost:5173")
  ALLOWED_ORIGINS?: string;

  // Parameterized API hostname (e.g. "api-game.lenout.com")
  API_HOSTNAME?: string;

  // Parameterized public asset CDN distribution URL (e.g. "https://assets-game.lenout.com")
  PUBLIC_ASSETS_URL?: string;

  // Dedicated origin for creator-uploaded access assets. Rebinding this single
  // value migrates every stored asset to a new domain (e.g. access-game.lenout.com)
  ACCESS_ASSETS_URL?: string;

  // Secret key used for signing and verifying HMAC-SHA256 authentication tokens
  JWT_SECRET?: string;

  // Optional DKIM domain for MailChannels authenticated dispatch
  DKIM_DOMAIN?: string;

  // Optional DKIM selector key identifier
  DKIM_SELECTOR?: string;

  // Optional DKIM private key in PEM format
  DKIM_PRIVATE_KEY?: string;

  // Sender email address for transactional notifications
  EMAIL_FROM?: string;

  // Sender display name for transactional emails
  EMAIL_FROM_NAME?: string;

  // Cloudflare native Email Routing outbound binding
  EMAIL?: { send(message: unknown): Promise<void> };

  // Optional Resend HTTP transactional email API key fallback
  RESEND_API_KEY?: string;

  // Optional MailChannels transactional email API key header
  MAILCHANNELS_API_KEY?: string;
}

// Variables available in Hono context
export interface AppVariables {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}
