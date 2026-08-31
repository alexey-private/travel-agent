import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SCAFFOLDING_BASENAMES,
  buildInputsOf,
  checkCoverage,
  checkUnwatched,
  covers,
  formatViolations,
  loadConfig,
  loadDockerfiles,
} from './coverage.mjs';

const config = loadConfig();
const dockerfiles = loadDockerfiles(config);

/** A deep copy, so a test that doctors the config cannot leak into the next. */
const clone = (value) => structuredClone(value);

test('the repository as committed is fully covered', () => {
  const violations = checkCoverage(config, dockerfiles);
  assert.deepEqual(formatViolations(violations, checkUnwatched(config)), []);
});

test('dropping /shared/** from a service turns the check red', () => {
  for (const name of Object.keys(config.services)) {
    const doctored = clone(config);
    doctored.services[name].watchPatterns = doctored.services[name].watchPatterns.filter(
      (p) => p !== '/shared/**',
    );

    const violations = checkCoverage(doctored, dockerfiles);
    assert.ok(
      violations.some((v) => v.name === name && v.source === 'shared'),
      `removing /shared/** from ${name} went unnoticed`,
    );
  }
});

test('a new whole-directory build input with no pattern turns the check red', () => {
  const [name, service] = Object.entries(config.services)[0];
  const doctored = { ...dockerfiles };
  doctored[service.dockerfile] = `${dockerfiles[service.dockerfile]}\nCOPY newdir ./newdir\n`;

  const violations = checkCoverage(config, doctored);
  assert.ok(
    violations.some((v) => v.name === name && v.source === 'newdir'),
    'a COPY of an unwatched directory was waved through',
  );
});

test('a cross-workspace manifest copy demands no pattern of its own', () => {
  // Every image copies every workspace's package.json, because `npm ci` needs
  // the whole workspace graph to resolve. Taking the first path segment of each
  // COPY would demand that the frontend watch /backend-langgraph/** — exactly
  // the cross-service rebuilds watch paths exist to prevent.
  const inputs = buildInputsOf(dockerfiles['Dockerfile.frontend']);

  assert.ok(!inputs.includes('backend-langgraph/package.json'));
  assert.ok(!inputs.includes('backend-telegram/package.json'));
  assert.ok(!inputs.includes('frontend/package.json'));
  assert.ok(inputs.includes('frontend'));
  assert.ok(inputs.includes('shared'));
});

test('COPY --from lines are intra-image and are not build inputs', () => {
  for (const text of Object.values(dockerfiles)) {
    for (const input of buildInputsOf(text)) {
      assert.ok(!input.startsWith('/app'), `${input} came from a --from stage`);
    }
  }
});

test('tsconfig.base.json is a build input of every service, and covered', () => {
  // It shares a COPY line with the two manifests, so any "single file means
  // scaffolding" rule would drop it — and three of the four workspaces extend
  // it, so `target` or `strict` changing there changes what every image emits.
  for (const [name, service] of Object.entries(config.services)) {
    const inputs = buildInputsOf(dockerfiles[service.dockerfile]);
    assert.ok(inputs.includes('tsconfig.base.json'), `${name} does not copy tsconfig.base.json`);
    assert.ok(covers(service.watchPatterns, 'tsconfig.base.json'), `${name} does not watch it`);
  }
});

test('each service watches its own Dockerfile and no other', () => {
  for (const [name, service] of Object.entries(config.services)) {
    assert.ok(covers(service.watchPatterns, service.dockerfile), `${name} misses its Dockerfile`);

    for (const other of Object.values(config.services)) {
      if (other.dockerfile === service.dockerfile) continue;
      assert.ok(
        !covers(service.watchPatterns, other.dockerfile),
        `${name} rebuilds when ${other.dockerfile} changes`,
      );
    }
  }
});

test('the root manifests stay unwatched, deliberately', () => {
  // A dependency bump alone rebuilds nothing. That is a decision DEPLOYMENT.md
  // documents, so it is asserted here rather than left to be incidental.
  assert.deepEqual(SCAFFOLDING_BASENAMES, ['package.json', 'package-lock.json']);
  assert.deepEqual(config.unwatchedByDesign, ['/package.json', '/package-lock.json']);
  assert.deepEqual(checkUnwatched(config), []);

  const watched = clone(config);
  watched.services.frontend.watchPatterns.push('/package.json');
  assert.equal(checkUnwatched(watched).length, 1);
});

test('a glob covers a directory only when it reaches the files inside it', () => {
  assert.ok(covers(['/shared/**'], 'shared'));
  assert.ok(covers(['/shared/**'], 'shared/i18n/src'));
  // `/shared/*` catches shared/index.ts and misses shared/i18n/src/locale.ts,
  // which is where this repo's code actually lives.
  assert.ok(!covers(['/shared/*'], 'shared'));
  assert.ok(!covers(['/frontend/**'], 'shared'));

  assert.ok(covers(['/tsconfig.base.json'], 'tsconfig.base.json'));
  assert.ok(!covers(['/tsconfig.base.json'], 'tsconfig.json'));
  // A leading slash is how Railway stores them; a pattern written without one
  // must mean the same thing rather than silently matching nothing.
  assert.ok(covers(['tsconfig.base.json'], 'tsconfig.base.json'));
});

test('shapes the parser must refuse rather than guess at', () => {
  assert.throws(() => buildInputsOf('COPY ["a", "b"]'), /JSON-array form/);
  assert.throws(() => covers(['!/shared/**'], 'shared'), /negated/);

  // Escaping these into literals would report coverage that does not exist,
  // which is the failure this whole check is about.
  assert.throws(() => covers(['/shared/?'], 'shared'), /not supported/);
  assert.throws(() => covers(['/shared/[ab]/**'], 'shared'), /not supported/);
  assert.throws(() => covers(['/{shared,frontend}/**'], 'shared'), /not supported/);
});

test('a run of three or more stars still spans path separators', () => {
  // `.replace(/\*\*/g, …)` folded exact pairs only, leaving `***` as one
  // globstar plus a stray `*` that cannot cross a slash.
  assert.ok(covers(['/shared/***'], 'shared/i18n/src'));
});

test('a violation names the file, the service and what to do', () => {
  const doctored = clone(config);
  doctored.services.frontend.watchPatterns = ['/frontend/**'];

  const report = formatViolations(checkCoverage(doctored, dockerfiles), []).join('\n');
  assert.match(report, /^frontend: Dockerfile\.frontend copies "shared"/m);
  assert.match(report, /would rebuild nothing/);
  assert.match(report, /railway-services\.json/);
});
