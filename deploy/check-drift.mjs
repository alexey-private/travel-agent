#!/usr/bin/env node
// Reports where the live Railway deploy config has drifted from
// deploy/railway-services.json. Read-only: it never calls a mutation.
//
//   node deploy/check-drift.mjs
//
// Credential, in order: $RAILWAY_TOKEN (a project token, scoped to one
// environment — what CI should hold), $RAILWAY_API_TOKEN (an account or
// workspace token), else the `accessToken` the Railway CLI left in
// ~/.railway/config.json. The two kinds authenticate through different headers,
// which is why the source has to be distinguished rather than guessed; the
// variable names follow the Railway CLI's own convention.
//
// Exits 0 when they agree, 1 when they do not, and 2 when it could not find out
// — a check that cannot run is not a check that passed, which is the
// distinction the incident behind this script turned on.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from './coverage.mjs';
import { diffWatchPatterns, fetchLiveWatchPatterns, formatDifferences } from './drift.mjs';

const EXIT_OK = 0;
const EXIT_DRIFT = 1;
const EXIT_CANNOT_CHECK = 2;

function readCredential() {
  if (process.env.RAILWAY_TOKEN) {
    return { token: process.env.RAILWAY_TOKEN, kind: 'project' };
  }
  if (process.env.RAILWAY_API_TOKEN) {
    return { token: process.env.RAILWAY_API_TOKEN, kind: 'account' };
  }

  // Local convenience only. In CI the credential comes from the environment.
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.railway', 'config.json'), 'utf8'));
    // `token` exists in that file and is usually null; `accessToken` is the one
    // the API accepts, and it is an account credential.
    const token = cfg.user?.token || cfg.user?.accessToken;
    return token ? { token, kind: 'account', fromCli: true } : null;
  } catch {
    return null;
  }
}

async function main() {
  const credential = readCredential();
  if (!credential) {
    console.error(
      'No Railway credential. In CI set RAILWAY_TOKEN to a project token ' +
        '(project Settings -> Tokens), or RAILWAY_API_TOKEN to an account or ' +
        'workspace token. Locally, `railway login` is enough.',
    );
    return EXIT_CANNOT_CHECK;
  }

  const config = loadConfig();

  let live;
  try {
    live = await fetchLiveWatchPatterns({
      credential,
      projectId: config.projectId,
      environmentId: config.environmentId,
    });
  } catch (err) {
    console.error(`Could not read the live config: ${err.message}`);
    if (credential.fromCli) {
      // These expire in hours, so "Not Authorized" from a credential that
      // worked this morning is far more often an expired login than a
      // revoked one.
      console.error('The Railway CLI credential expires quickly — `railway login` refreshes it.');
    }
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
