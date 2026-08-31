#!/usr/bin/env node
// Reports where the live Railway deploy config has drifted from
// deploy/railway-services.json. Read-only: it never calls a mutation.
//
//   node deploy/check-drift.mjs
//
// Token: $RAILWAY_TOKEN, else the `accessToken` the Railway CLI left in
// ~/.railway/config.json. Exits 0 when they agree, 1 when they do not, and 2
// when it could not find out — a check that cannot run is not a check that
// passed, which is the distinction the incident behind this script turned on.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from './coverage.mjs';
import { diffWatchPatterns, fetchLiveWatchPatterns, formatDifferences } from './drift.mjs';

const EXIT_OK = 0;
const EXIT_DRIFT = 1;
const EXIT_CANNOT_CHECK = 2;

function readToken() {
  if (process.env.RAILWAY_TOKEN) return process.env.RAILWAY_TOKEN;

  // Local convenience only. In CI the token comes from the environment.
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.railway', 'config.json'), 'utf8'));
    // `token` exists in that file and is usually null; `accessToken` is the one
    // the API accepts.
    return cfg.user?.token || cfg.user?.accessToken || null;
  } catch {
    return null;
  }
}

async function main() {
  const token = readToken();
  if (!token) {
    console.error(
      'No Railway token. Set RAILWAY_TOKEN (in CI: a project token in repository secrets), ' +
        'or run `railway login` locally.',
    );
    return EXIT_CANNOT_CHECK;
  }

  const config = loadConfig();

  let live;
  try {
    live = await fetchLiveWatchPatterns({
      token,
      projectId: config.projectId,
      environmentId: config.environmentId,
    });
  } catch (err) {
    console.error(`Could not read the live config: ${err.message}`);
    return EXIT_CANNOT_CHECK;
  }

  const differences = diffWatchPatterns(config, live);
  if (differences.length === 0) {
    console.log(
      `Railway matches deploy/railway-services.json (${Object.keys(config.services).length} services, ` +
        `environment ${config.environment}).`,
    );
    return EXIT_OK;
  }

  console.error('Railway has drifted from deploy/railway-services.json:\n');
  for (const line of formatDifferences(differences)) console.error(line);
  console.error(
    '\nFix whichever is wrong: edit the file if Railway is right, or the Railway ' +
      'dashboard if the file is. This script does not write.',
  );
  return EXIT_DRIFT;
}

process.exit(await main());
