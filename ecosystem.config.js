// PM2 process definition. Mirrors the convention used by the other apps on
// this VPS (playground 3002, wallai 3003, alumai 3004, prysma 3005,
// dashboard 3006, udm 3007). REST Finance takes 3008.
const path = require('path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'rest-finance',
      cwd: root,
      script: path.join(root, 'node_modules/next/dist/bin/next'),
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // Conservative: the box is shared and has hit its disk/memory ceiling
      // before. Next's server footprint is small once built.
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3008',
      },
    },
  ],
};
