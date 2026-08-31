import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { REPO_ROOT, loadConfig } from './coverage.mjs';
import {
  authHeaderFor,
  diffWatchPatterns,
  fetchLiveWatchPatterns,
  formatDifferences,
} from './drift.mjs';

const config = loadConfig();

/** Drops `//` and block comments, so prose cannot answer for the code. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** What Railway would return if it agreed with the committed file. */
function liveMatching() {
  const live = { pgvector: [] };
  for (const [name, service] of Object.entries(config.services)) {
    live[name] = [...service.watchPatterns];
  }
  return live;
}

test('a dashboard that matches the file reports nothing', () => {
  assert.deepEqual(diffWatchPatterns(config, liveMatching()), []);
});

test('a pattern removed by hand in the dashboard is reported', () => {
  const live = liveMatching();
  live['travel-agent'] = live['travel-agent'].filter((p) => p !== '/shared/**');

  const differences = diffWatchPatterns(config, live);
  assert.equal(differences.length, 1);
  assert.deepEqual(differences[0].removed, ['/shared/**']);
  assert.match(formatDifferences(differences).join('\n'), /in the repo, not in Railway/);
});

test('a pattern added by hand in the dashboard is reported', () => {
  const live = liveMatching();
  live.frontend = [...live.frontend, '/docs/**'];

  const differences = diffWatchPatterns(config, live);
  assert.deepEqual(differences[0].added, ['/docs/**']);
  assert.match(formatDifferences(differences).join('\n'), /in Railway, not in the repo/);
});

test('order is not drift', () => {
  const live = liveMatching();
  live.frontend = [...live.frontend].reverse();
  assert.deepEqual(diffWatchPatterns(config, live), []);
});

test('a service the config expects and Railway does not have is reported', () => {
  const live = liveMatching();
  delete live.frontend;

  const [difference] = diffWatchPatterns(config, live);
  assert.equal(difference.kind, 'missing');
  assert.equal(difference.service, 'frontend');
});

test('an image-sourced service without watch patterns is not drift', () => {
  // pgvector is deployed from pgvector/pgvector:pg16 and watches nothing, which
  // is why it has no entry in the file.
  assert.ok(config.unmanagedServices.includes('pgvector'));
  assert.deepEqual(diffWatchPatterns(config, liveMatching()), []);
});

test('an unlisted service that grows watch patterns is reported', () => {
  const live = liveMatching();
  live.pgvector = ['/db/**'];

  const [difference] = diffWatchPatterns(config, live);
  assert.equal(difference.kind, 'unlisted');
  assert.match(difference.detail, /unmanaged/);
});

test('only the instance in the configured environment is read', async () => {
  // A service has one instance per environment. Without the filter, a project
  // that later gains a staging environment would be compared against whichever
  // instance the API happened to return first.
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      data: {
        project: {
          services: {
            edges: [
              {
                node: {
                  name: 'frontend',
                  serviceInstances: {
                    edges: [
                      { node: { environmentId: 'staging', watchPatterns: ['/nope/**'] } },
                      { node: { environmentId: config.environmentId, watchPatterns: ['/yes/**'] } },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    }),
  });

  const live = await fetchLiveWatchPatterns({
    credential: { token: 'test', kind: 'account' },
    projectId: config.projectId,
    environmentId: config.environmentId,
    fetchImpl,
  });

  assert.deepEqual(live, { frontend: ['/yes/**'] });
});

test('an API error is raised rather than read as an empty dashboard', async () => {
  // A failed read that returned {} would diff as "every service is missing",
  // and a 403 for a stale token would look like a catastrophic drift.
  const failing = async () => ({ ok: false, status: 403, statusText: 'Forbidden' });
  await assert.rejects(
    () =>
      fetchLiveWatchPatterns({
        credential: { token: 'x', kind: 'account' },
        projectId: 'p',
        environmentId: 'e',
        fetchImpl: failing,
      }),
    /403/,
  );
});

test('each credential kind travels in the header Railway expects for it', async () => {
  // A project token sent as a Bearer is answered 403, which reads as a wrong
  // project rather than a wrong header. The two are told apart by which
  // variable they arrived in, because the tokens themselves look alike.
  assert.deepEqual(authHeaderFor({ token: 'p', kind: 'project' }), {
    'Project-Access-Token': 'p',
  });
  assert.deepEqual(authHeaderFor({ token: 'a', kind: 'account' }), {
    Authorization: 'Bearer a',
  });

  const seen = [];
  const record = async (_url, init) => {
    seen.push(init.headers);
    return { ok: true, json: async () => ({ data: { project: { services: { edges: [] } } } }) };
  };

  for (const kind of ['project', 'account']) {
    await fetchLiveWatchPatterns({
      credential: { token: 't', kind },
      projectId: 'p',
      environmentId: 'e',
      fetchImpl: record,
    });
  }

  assert.equal(seen[0]['Project-Access-Token'], 't');
  assert.equal(seen[0].Authorization, undefined);
  assert.equal(seen[1].Authorization, 'Bearer t');
  assert.equal(seen[1]['Project-Access-Token'], undefined);
});

test('the drift check never writes', () => {
  // Structural, not behavioural: the guarantee is that no mutation exists in
  // the source at all, which no amount of exercising the happy path can show.
  for (const file of ['drift.mjs', 'check-drift.mjs']) {
    // Comments are stripped first: both files say in prose that they never
    // write, and the check is about the code, not about what it claims.
    const source = stripComments(readFileSync(join(REPO_ROOT, 'deploy', file), 'utf8'));
    assert.ok(!/\bmutation\b/i.test(source), `${file} sends a mutation`);
    assert.ok(!source.includes('serviceInstanceUpdate'), `${file} names the write API`);
  }
});
