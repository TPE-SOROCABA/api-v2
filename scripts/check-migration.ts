import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const scripts = [
  'check-designation-create',
  'check-auth-parity',
  'check-incident-routes',
  'check-designation-view-parity',
  'check-designation-routes',
  'check-designation-write-parity',
  'check-designation-send-parity',
  'check-random-assignment-parity',
  'check-bff-contract',
];
for (const script of scripts) {
  const result = spawnSync(process.execPath, [require.resolve('ts-node/dist/bin'), '-T', '-r', 'tsconfig-paths/register', resolve(`scripts/${script}.ts`)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
