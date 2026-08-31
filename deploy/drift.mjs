// Comparing the committed expectation against what Railway actually holds.
//
// The comparison is a pure function so it can be tested without a token; only
// `fetchLiveWatchPatterns` touches the network, and nothing here writes. That
// is deliberate and not an accident of scope: a script that silently repaired
// the dashboard would turn a wrong expectation file into a wrong deployment,
// and the failure this whole check exists to catch is exactly one nobody saw.

const API = 'https://backboard.railway.com/graphql/v2';

// Omit this and the API answers 403, not 401 — which reads as "wrong project"
// rather than "wrong headers" and costs an hour.
const USER_AGENT = 'railway-cli/5.23.3';

const QUERY = `query($id: String!) {
  project(id: $id) {
    services { edges { node {
      name
      serviceInstances { edges { node { environmentId watchPatterns } } }
    } } }
  }
}`;

/**
 * The header a Railway credential authenticates with.
 *
 * The two kinds are not interchangeable and the difference is invisible in the
 * token itself: a **project** token — scoped to one environment of one project,
 * which is what CI should hold — travels in `Project-Access-Token`, while an
 * **account** or workspace token travels in `Authorization: Bearer`. Sending a
 * project token as a Bearer gets a 403, which reads as "wrong project" rather
 * than "wrong header" and costs an hour.
 */
export function authHeaderFor({ token, kind }) {
  return kind === 'project'
    ? { 'Project-Access-Token': token }
    : { Authorization: `Bearer ${token}` };
}

/**
 * Live watch patterns per service name, for one environment.
 *
 * A service has one instance per environment, so the environment id filters
 * them; without it a project with a staging environment would report whichever
 * instance came back first.
 */
export async function fetchLiveWatchPatterns({ credential, projectId, environmentId, fetchImpl = fetch }) {
  const response = await fetchImpl(API, {
    method: 'POST',
    headers: {
      ...authHeaderFor(credential),
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ query: QUERY, variables: { id: projectId } }),
  });

  if (!response.ok) {
    throw new Error(`Railway API answered ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload.errors) {
    throw new Error(`Railway API returned errors: ${JSON.stringify(payload.errors)}`);
  }

  const live = {};
  for (const edge of payload.data.project.services.edges) {
    for (const instanceEdge of edge.node.serviceInstances.edges) {
      if (instanceEdge.node.environmentId !== environmentId) continue;
      live[edge.node.name] = instanceEdge.node.watchPatterns ?? [];
    }
  }

  return live;
}

/**
 * Differences between the committed config and the live dashboard.
 *
 * Order is not a difference — Railway preserves whatever order the patterns were
 * written in, and a reordering changes nothing about which pushes rebuild what.
 *
 * A live service the config does not mention is reported only when it watches
 * something. `pgvector` is deployed from an image, has no watch patterns and is
 * listed in `unmanagedServices`; one that grew patterns without an entry here
 * would be a service nobody is checking, which is the state this file exists to
 * end.
 */
export function diffWatchPatterns(config, live) {
  const differences = [];

  for (const [name, service] of Object.entries(config.services)) {
    const actual = live[name];

    if (actual === undefined) {
      differences.push({
        service: name,
        kind: 'missing',
        detail: 'the config expects this service, and Railway has no such service in this environment',
      });
      continue;
    }

    const expected = service.watchPatterns;
    const added = actual.filter((p) => !expected.includes(p));
    const removed = expected.filter((p) => !actual.includes(p));

    if (added.length || removed.length) {
      differences.push({ service: name, kind: 'patterns', expected, actual, added, removed });
    }
  }

  const unmanaged = config.unmanagedServices ?? [];
  for (const [name, patterns] of Object.entries(live)) {
    if (name in config.services) continue;
    if (patterns.length === 0) continue;
    differences.push({
      service: name,
      kind: 'unlisted',
      detail: unmanaged.includes(name)
        ? 'listed as unmanaged, but it now has watch patterns — give it an entry'
        : 'Railway has a service with watch patterns that deploy/railway-services.json does not mention',
      actual: patterns,
    });
  }

  return differences;
}

/** Renders differences as the lines the CLI prints. */
export function formatDifferences(differences) {
  return differences.flatMap((d) => {
    if (d.kind === 'patterns') {
      const lines = [`${d.service}: watch patterns differ`];
      for (const p of d.removed) lines.push(`  - ${p}   (in the repo, not in Railway)`);
      for (const p of d.added) lines.push(`  + ${p}   (in Railway, not in the repo)`);
      return lines;
    }
    if (d.kind === 'unlisted') {
      return [`${d.service}: ${d.detail}`, `  Railway has: ${d.actual.join(', ')}`];
    }
    return [`${d.service}: ${d.detail}`];
  });
}
