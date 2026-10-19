const { spawn } = require('node:child_process');
const path = require('node:path');
const simulator = spawn(process.execPath, [path.join(__dirname, '../../node_modules/tsx/dist/cli.mjs'), 'tools/simulator/index.ts'], { stdio: 'inherit', env: process.env });
const protocol = process.env.EXPO_PUBLIC_API_PROTOCOL || 'legacy';
const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_API_URL || `http://localhost:${process.env.SALES_SIM_PORT || 4010}${protocol === 'legacy' ? '/webol' : ''}`;
const expo = spawn(process.execPath, [path.join(__dirname, '../../node_modules/expo/bin/cli'), 'start', '--web'], { stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_API_MODE: 'http', EXPO_PUBLIC_API_PROTOCOL: protocol, EXPO_PUBLIC_API_BASE_URL: baseUrl } });
const stop = () => { simulator.kill(); expo.kill(); };
simulator.on('exit', stop); expo.on('exit', stop);
process.on('SIGINT', stop); process.on('SIGTERM', stop);
