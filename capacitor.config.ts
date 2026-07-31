import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.bench.peptide",
  appName: "Bench",
  // The static export from `npm run build:static`.
  webDir: "out",
  android: {
    // Health data should not leak into a debug log on a shared device.
    loggingBehavior: "none",
  },
};

export default config;
