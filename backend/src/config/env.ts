import dotenv from "dotenv";

dotenv.config();

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const ENV = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "4000", 10),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // ⬇️ NEW: to call the email edge function and build URLs
  appEmailFunctionSecret: required("APP_EMAIL_FUNCTION_SECRET"),
  appBaseUrl: required("APP_BASE_URL")
  
};
