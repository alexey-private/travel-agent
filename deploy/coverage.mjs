// Does every build input of a service's image sit behind one of that service's
// Railway watch patterns?
//
// The 2026-08-31 incident was not somebody editing the dashboard. It was a new
// build input appearing in the repo (`COPY shared ./shared`) with nothing
// connecting it to the deploy config, so a commit touching only `shared/`
// redeployed nothing. Both halves of that connection are already in the
// repository — the Dockerfiles say what each image copies, and
// railway-services.json says what each service watches — which is why this
// check needs no token and no network.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CONFIG_PATH = join(REPO_ROOT, 'deploy', 'railway-services.json');

/**
 * Copied sources that are scaffolding for the package manager rather than build
 * inputs, listed by name rather than derived from a shape.
 *
 * "A whole directory is an input, a single file is scaffolding" was the tempting
 * rule and it is wrong: `tsconfig.base.json` arrives on the same `COPY` line as
 * these two and *is* an input — three of the four workspaces `extends` it, so
 * changing `target` or `strict` changes what every image emits. A named list
 * means a fourth root-level file added to that line is covered by default and
 * somebody has to argue it out, rather than being waved through.
 *
 * These two are excluded because a dependency bump alone deliberately triggers
 * no rebuild; `unwatchedByDesign` in the config asserts the other half of that.
 */
export const SCAFFOLDING_BASENAMES = ['package.json', 'package-lock.json'];

/** Reads the committed expectation file. */
export function loadConfig(path = CONFIG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Reads every Dockerfile the config names, keyed by its path. */
export function loadDockerfiles(config, repoRoot = REPO_ROOT) {
  const texts = {};
  for (const service of Object.values(config.services)) {
    texts[service.dockerfile] = readFileSync(join(repoRoot, service.dockerfile), 'utf8');
  }
  return texts;
}

/**
 * The repo paths a Dockerfile copies into its image, minus scaffolding.
 *
 * `COPY --from=<stage>` is intra-image — it moves build output between stages
 * and touches nothing in the repo — so those lines are dropped outright.
 */
export function buildInputsOf(dockerfileText) {
  const inputs = [];

  for (const line of joinContinuations(dockerfileText)) {
    const match = /^\s*COPY\s+(.+)$/i.exec(line);
    if (!match) continue;

    const rest = match[1].trim();
    if (rest.startsWith('[')) {
      // JSON-array form. Nothing here uses it, and parsing it wrongly would
      // silently drop a build input, so refuse rather than guess.
      throw new Error(`COPY in JSON-array form is not supported: ${line}`);
    }

    const tokens = rest.split(/\s+/);
    const flags = tokens.filter((t) => t.startsWith('--'));
    if (flags.some((f) => f.startsWith('--from='))) continue;

    const operands = tokens.filter((t) => !t.startsWith('--'));
    // The last operand is the destination inside the image.
    const sources = operands.slice(0, -1);

    for (const source of sources) {
      const normalized = source.replace(/^\.\//, '').replace(/\/+$/, '');
      if (SCAFFOLDING_BASENAMES.includes(basename(normalized))) continue;
      if (!inputs.includes(normalized)) inputs.push(normalized);
    }
  }

  return inputs;
}

/**
 * Does any one of these watch patterns fire when `source` changes?
 *
 * Railway matches a pattern against the path of each changed file, so the
 * question differs by what `source` is. A file is covered when a pattern
 * matches it exactly. A directory is covered when one pattern matches files
 * *inside* it — checked with both a shallow and a deep probe, because
 * `/shared/*` would catch `shared/index.ts` and miss `shared/i18n/src/x.ts`,
 * which is where this repo's code actually lives.
 */
export function covers(patterns, source) {
  const path = withLeadingSlash(source);
  const shallowProbe = `${path}/probe.ts`;
  const deepProbe = `${path}/a/b/probe.ts`;

  return patterns.some((pattern) => {
    const re = patternToRegExp(pattern);
    return re.test(path) || (re.test(shallowProbe) && re.test(deepProbe));
  });
}

/**
 * Every build input that no watch pattern of its own service covers.
 *
 * Each service's Dockerfile is itself an input: editing it changes the image and
 * must redeploy that service and no other.
 */
export function checkCoverage(config, dockerfiles) {
  const violations = [];

  for (const [name, service] of Object.entries(config.services)) {
    const text = dockerfiles[service.dockerfile];
    if (text === undefined) {
      throw new Error(`no Dockerfile text supplied for service ${name} (${service.dockerfile})`);
    }

    const inputs = [...buildInputsOf(text), service.dockerfile];
    for (const input of inputs) {
      if (!covers(service.watchPatterns, input)) {
        violations.push({ name, source: input, dockerfile: service.dockerfile });
      }
    }
  }

  return violations;
}

/**
 * Paths the config says must stay unwatched, but that some service watches.
 *
 * The exclusion of the root manifests is a decision, not an accident: a
 * dependency bump alone rebuilds nothing, and DEPLOYMENT.md documents that.
 * Asserting it keeps a later "let's just watch everything" from passing quietly.
 */
export function checkUnwatched(config) {
  const violations = [];

  for (const path of config.unwatchedByDesign ?? []) {
    for (const [name, service] of Object.entries(config.services)) {
      if (covers(service.watchPatterns, path)) {
        violations.push({ name, source: path });
      }
    }
  }

  return violations;
}

/** Renders violations as the lines a failing test or CI run should print. */
export function formatViolations(coverage, unwatched) {
  const lines = [];

  for (const v of coverage) {
    lines.push(
      `${v.name}: ${v.dockerfile} copies "${v.source}", but no watch pattern of ` +
        `that service matches it — a change to ${v.source} would rebuild nothing. ` +
        `Add a pattern to deploy/railway-services.json and to the Railway dashboard.`,
    );
  }

  for (const v of unwatched) {
    lines.push(
      `${v.name}: "${v.source}" is listed as unwatched by design, but a watch ` +
        `pattern of that service matches it.`,
    );
  }

  return lines;
}

// --- helpers ---------------------------------------------------------------

function basename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function withLeadingSlash(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

/** Folds backslash-continued Dockerfile lines into one logical line each. */
function joinContinuations(text) {
  const lines = [];
  let pending = '';

  for (const raw of text.split('\n')) {
    const line = pending + raw.replace(/\\\s*$/, '');
    if (/\\\s*$/.test(raw)) {
      pending = `${line} `;
      continue;
    }
    pending = '';
    lines.push(line);
  }

  if (pending) lines.push(pending);
  return lines;
}

/**
 * Railway glob → RegExp. `**` spans path separators, `*` does not.
 *
 * Everything this translation does not implement is refused rather than
 * escaped into a literal, and for one reason: a pattern that quietly means
 * something narrower than it reads would report coverage that does not exist,
 * which is the exact failure the whole file is here to catch. A leading `!`
 * inverts a pattern; `?`, `[a-z]` and `{a,b}` are the other glob
 * metacharacters that would otherwise become literal characters.
 */
function patternToRegExp(pattern) {
  if (pattern.startsWith('!')) {
    throw new Error(`negated watch patterns are not supported: ${pattern}`);
  }

  const unsupported = /[?[\]{}]/.exec(pattern);
  if (unsupported) {
    throw new Error(
      `watch patterns using "${unsupported[0]}" are not supported: ${pattern}`,
    );
  }

  // Written as an escape, not a literal: the placeholder must be a character
  // no path can contain, so `**` survives the `*` pass intact, and a raw
  // control character in the source would be invisible in a diff.
  const GLOBSTAR = '\u0000';
  const escaped = withLeadingSlash(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*{2,}/g, GLOBSTAR)
    .replace(/\*/g, '[^/]*')
    .replaceAll(GLOBSTAR, '.*');

  return new RegExp(`^${escaped}$`);
}
