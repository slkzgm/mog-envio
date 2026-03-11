#!/usr/bin/env node

/**
 * Grant public SELECT permissions on all tracked Hasura tables.
 *
 * Usage:
 *   HASURA_ADMIN_SECRET=... pnpm setup-public
 *
 * Optional env vars:
 *   HASURA_ENDPOINT=https://your-domain/v1/metadata
 *   HASURA_ROLE=public
 *   HASURA_SOURCE=default
 */

const role = process.env.HASURA_ROLE || "public";

const endpointCandidates = [
  process.env.HASURA_ENDPOINT,
  process.env.HASURA_METADATA_ENDPOINT,
  process.env.HASURA_GRAPHQL_URL
    ? process.env.HASURA_GRAPHQL_URL.replace(/\/v1\/graphql\/?$/, "/v1/metadata")
    : undefined,
  "http://127.0.0.1:8080/v1/metadata",
].filter(Boolean);

const endpoint = endpointCandidates[0];

const adminSecret =
  process.env.HASURA_ADMIN_SECRET || process.env.HASURA_GRAPHQL_ADMIN_SECRET;

if (!endpoint) {
  console.error("Missing HASURA endpoint. Set HASURA_ENDPOINT.");
  process.exit(1);
}

if (!adminSecret) {
  console.error(
    "Missing HASURA admin secret. Set HASURA_ADMIN_SECRET (or HASURA_GRAPHQL_ADMIN_SECRET)."
  );
  process.exit(1);
}

const fetchJson = async (body) => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hasura-admin-secret": adminSecret,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Invalid JSON from Hasura (${response.status}): ${text}`);
  }

  if (!response.ok || json.error) {
    const msg = json.error || text || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return json;
};

const isSameTable = (left, right) =>
  left?.schema === right?.schema && left?.name === right?.name;

const toTableString = (table) => `${table.schema}.${table.name}`;

const isAlreadyExistsError = (message) => {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("already exists") || normalized.includes("already-defined");
};

async function main() {
  console.log(`Using metadata endpoint: ${endpoint}`);
  console.log(`Target role: ${role}`);

  const metadata = await fetchJson({ type: "export_metadata", args: {} });

  const sources = metadata.sources || [];
  if (sources.length === 0) {
    throw new Error("No Hasura source found in metadata.");
  }

  const sourceName = process.env.HASURA_SOURCE;
  const source = sourceName ? sources.find((entry) => entry.name === sourceName) : sources[0];

  if (!source) {
    throw new Error(
      `Source '${sourceName}' not found. Available: ${sources
        .map((entry) => entry.name)
        .join(", ")}`
    );
  }

  const trackedTables = source.tables || [];
  if (trackedTables.length === 0) {
    console.log("No tracked tables found. Nothing to do.");
    return;
  }

  const existingPermissions = trackedTables.flatMap(({ table, select_permissions = [] }) =>
    select_permissions.map((permission) => ({ table, role: permission.role }))
  );

  const missingTables = trackedTables
    .map(({ table }) => table)
    .filter(
      (table) =>
        !existingPermissions.some(
          (permission) => permission.role === role && isSameTable(permission.table, table)
        )
    );

  if (missingTables.length === 0) {
    console.log(`All tracked tables already have SELECT permission for role '${role}'.`);
    return;
  }

  console.log(`Granting SELECT on ${missingTables.length} table(s)...`);

  const failures = [];
  let created = 0;

  for (const table of missingTables) {
    const payload = {
      type: "pg_create_select_permission",
      args: {
        source: source.name,
        table,
        role,
        permission: {
          columns: "*",
          filter: {},
          allow_aggregations: true,
        },
      },
    };

    try {
      await fetchJson(payload);
      created += 1;
      console.log(`  + ${toTableString(table)}`);
    } catch (error) {
      if (isAlreadyExistsError(error.message)) {
        console.log(`  = ${toTableString(table)} (already exists)`);
        continue;
      }

      failures.push({ table: toTableString(table), error: error.message });
      console.error(`  ! ${toTableString(table)} -> ${error.message}`);
    }
  }

  console.log(`Done. Created ${created} permission(s).`);

  if (failures.length > 0) {
    console.error(`Failed on ${failures.length} table(s).`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal: ${error.message}`);
  process.exit(1);
});
