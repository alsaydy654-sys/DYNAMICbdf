import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dynamicbdf.app",
  appName: "معالج كتب PDF",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
};

export default config;
