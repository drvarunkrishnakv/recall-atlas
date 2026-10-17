// Tests that need the Firebase emulators: Firestore rules, the app's cloud API and the CLI's
// Firestore backend. Run with `npm run test:cloud`, which starts the emulators around them.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.emulator.test.ts", "server/**/*.emulator.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
