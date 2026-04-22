import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.fiscalfriendwizard',
  appName: 'fiscal-friend-wizard',
  webDir: 'dist',
  server: {
    url: 'https://9158d499-54aa-482a-aaa1-059fbc937c96.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
};

export default config;
