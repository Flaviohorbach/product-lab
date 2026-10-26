/** Loads .env into process.env when it exists (Node 21+ has this built in, no dotenv needed). */
export function loadEnv() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file: rely on variables already set in the shell.
  }
}
