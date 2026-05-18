export type DependencyRequest = {
  name: string;
  source: string;
  requestedBy: string;
};

export type OverriddenSpec = {
  spec: string;
  requestedBy: string;
};

export type Singleton = {
  name: string;
  source: string;
  requestedBy: string[];
  overriddenSpecs: OverriddenSpec[];
};

export function reconcileSingletons(requests: DependencyRequest[]): Map<string, Singleton> {
  const map = new Map<string, Singleton>();

  for (const request of requests) {
    const existing = map.get(request.name);
    if (!existing) {
      map.set(request.name, {
        name: request.name,
        source: request.source,
        requestedBy: [request.requestedBy],
        overriddenSpecs: []
      });
      continue;
    }

    if (existing.source === request.source) {
      addRequester(existing, request.requestedBy);
      continue;
    }

    const existingFromRoot = existing.requestedBy.includes("root");
    const incomingFromRoot = request.requestedBy === "root";

    if (existingFromRoot && !incomingFromRoot) {
      existing.overriddenSpecs.push({ spec: request.source, requestedBy: request.requestedBy });
      addRequester(existing, request.requestedBy);
      continue;
    }

    if (incomingFromRoot && !existingFromRoot) {
      existing.overriddenSpecs.push(
        ...existing.requestedBy.map((requestedBy) => ({ spec: existing.source, requestedBy }))
      );
      existing.source = request.source;
      existing.requestedBy = ["root", ...existing.requestedBy.filter((requestedBy) => requestedBy !== "root")];
      continue;
    }

    throw new Error(
      `singleton conflict for ${request.name}: "${existing.source}" (from ${existing.requestedBy.join(
        ", "
      )}) vs "${request.source}" (from ${request.requestedBy}). Declare ${request.name} in your root knowledge.json to override.`
    );
  }

  return map;
}

function addRequester(singleton: Singleton, requestedBy: string): void {
  if (!singleton.requestedBy.includes(requestedBy)) {
    singleton.requestedBy.push(requestedBy);
  }
}
