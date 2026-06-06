import { sampleProject } from "./data.js";
import { inferColumns } from "./csv.js";
import { DEFAULT_ACCOUNT_ID, getAccountStorageKey } from "./accounts.js";

const STORAGE_KEY = "goodhr.workbench.v1";
const COMPACT_RESPONSES_VERSION = 1;

let remoteSaveHandler = null;
let lastRemoteSavePromise = Promise.resolve();
let lastRemoteSaveError = null;

export function createId(prefix = "project") {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

export function loadState(accountId = DEFAULT_ACCOUNT_ID) {
  const storageKey = getAccountStorageKey(accountId);
  const raw = localStorage.getItem(storageKey) || getLegacyStateForDefaultAccount(accountId);
  if (!raw) {
    const state = createDefaultState(accountId);
    saveState(state);
    return state;
  }

  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeLoadedState(parsed, accountId);
    try {
      saveState(normalized);
    } catch {
      // Keep the loaded data in memory even if the browser storage is already full.
    }
    return normalized;
  } catch {
    const state = createDefaultState(accountId);
    saveState(state);
    return state;
  }
}

export function saveState(state, accountId = state?.accountId || DEFAULT_ACCOUNT_ID) {
  state.accountId = accountId;
  const serializedState = serializeStateForStorage(state);
  let localError = null;

  try {
    removeDuplicatedLegacyState(accountId);
    localStorage.setItem(getAccountStorageKey(accountId), JSON.stringify(serializedState));
  } catch (error) {
    localError = error;
  }

  if (remoteSaveHandler) {
    queueRemoteSave(serializedState, accountId);
  }

  if (localError && !remoteSaveHandler) {
    throw new Error(`Nie udało się zapisać ankiet w przeglądarce. Dane są zbyt duże albo pamięć lokalna jest pełna. ${localError.message || ""}`.trim());
  }

  return serializedState;
}

export function configureRemoteStatePersistence(handler) {
  remoteSaveHandler = typeof handler === "function" ? handler : null;
  lastRemoteSavePromise = Promise.resolve();
  lastRemoteSaveError = null;
}

export function clearRemoteStatePersistence() {
  remoteSaveHandler = null;
  lastRemoteSavePromise = Promise.resolve();
  lastRemoteSaveError = null;
}

export async function waitForRemoteStateSave() {
  await lastRemoteSavePromise;
  if (!lastRemoteSaveError) return;
  const error = lastRemoteSaveError;
  lastRemoteSaveError = null;
  throw error;
}

export function serializeStateSnapshot(state) {
  return serializeStateForStorage(state);
}

export function hydrateStoredState(accountId, storedState) {
  const normalized = normalizeLoadedState(storedState || {}, accountId);
  try {
    removeDuplicatedLegacyState(accountId);
    localStorage.setItem(getAccountStorageKey(accountId), JSON.stringify(serializeStateForStorage(normalized)));
  } catch {
    // Supabase is the source of truth in this path; local cache is optional.
  }
  return normalized;
}

export function getCurrentProject(state) {
  return state.projects.find((project) => project.id === state.currentProjectId) || state.projects[0] || createEmptyProject(state?.accountId);
}

export function upsertProject(state, project) {
  project.ownerAccountId = state.accountId || DEFAULT_ACCOUNT_ID;
  project.updatedAt = new Date().toISOString();
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) {
    state.projects[index] = project;
  } else {
    state.projects.unshift(project);
  }
  state.currentProjectId = project.id;
  saveState(state);
}

export function removeProject(state, projectId) {
  state.projects = state.projects.filter((project) => project.id !== projectId);
  if (!state.projects.some((project) => project.id === state.currentProjectId)) {
    state.currentProjectId = state.projects[0]?.id || "";
  }
  saveState(state);
}

export function exportProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${project.client}-${project.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".goodhr.json";
  link.click();
  URL.revokeObjectURL(url);
}

export async function importProjectFile(file) {
  const text = await file.text();
  const project = normalizeProject(JSON.parse(text));
  if (!project.name || !project.client || !Array.isArray(project.responses)) {
    throw new Error("To nie wygląda jak projekt GoodHR.");
  }
  project.id = project.id || createId("project");
  project.createdAt = project.createdAt || new Date().toISOString();
  project.thresholds = project.thresholds || { numeric: 5, comments: 10 };
  return project;
}

function createDefaultState(accountId) {
  const project = cloneSampleProject(accountId);
  return {
    accountId,
    currentProjectId: project.id,
    projects: [project],
    importTemplates: []
  };
}

function cloneSampleProject(accountId) {
  return normalizeProject(JSON.parse(JSON.stringify(sampleProject)), accountId);
}

function serializeStateForStorage(state) {
  return {
    ...state,
    projects: (state.projects || []).map(serializeProjectForStorage)
  };
}

function serializeProjectForStorage(project) {
  const responses = Array.isArray(project.responses) ? project.responses : [];
  const columnNames = getStorageColumnNames(project, responses);
  const packed = packResponseRows(responses, columnNames);
  const serialized = {
    ...project,
    compactResponses: {
      version: COMPACT_RESPONSES_VERSION,
      columns: columnNames,
      values: packed.values,
      rows: packed.rows
    }
  };
  delete serialized.responses;
  return serialized;
}

function queueRemoteSave(serializedState, accountId) {
  lastRemoteSaveError = null;
  lastRemoteSavePromise = Promise.resolve()
    .then(() => remoteSaveHandler(serializedState, accountId))
    .catch((error) => {
      lastRemoteSaveError = error;
    });
}

function normalizeLoadedState(parsed, accountId) {
  if (!parsed || !Array.isArray(parsed.projects)) {
    throw new Error("Invalid store");
  }
  parsed.accountId = accountId;
  parsed.importTemplates = Array.isArray(parsed.importTemplates) ? parsed.importTemplates : [];
  parsed.projects = parsed.projects.map((project) => normalizeProject(project, accountId));
  if (parsed.projects.length && !parsed.projects.some((project) => project.id === parsed.currentProjectId)) {
    parsed.currentProjectId = parsed.projects[0].id;
  }
  if (!parsed.projects.length) parsed.currentProjectId = "";
  return parsed;
}

function packResponseRows(responses, columnNames) {
  const values = [];
  const valueIndex = new Map();
  const rows = responses.map((row) => columnNames.map((name) => {
    const value = row[name] ?? "";
    const key = `${typeof value}\u0000${String(value)}`;
    if (!valueIndex.has(key)) {
      valueIndex.set(key, values.length);
      values.push(value);
    }
    return valueIndex.get(key);
  }));
  return { values, rows };
}

function getStorageColumnNames(project, responses) {
  const names = [];
  const seen = new Set();
  (project.schema?.columns || []).forEach((column) => {
    const name = column?.name;
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });
  responses.forEach((row) => {
    Object.keys(row || {}).forEach((name) => {
      if (seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
  });
  return names;
}

function createEmptyProject(accountId = DEFAULT_ACCOUNT_ID) {
  return normalizeProject({
    id: "empty-project",
    client: "Brak ankiet",
    name: "Zaimportuj dane",
    wave: "",
    sourceFile: "brak danych",
    sourceKind: "Auto",
    status: "brak danych",
    createdAt: new Date().toISOString(),
    thresholds: { numeric: 5, comments: 10 },
    projectGroup: "Brak ankiet",
    reportVersions: [],
    schema: { columns: [] },
    responses: []
  }, accountId);
}

function getLegacyStateForDefaultAccount(accountId) {
  if (accountId !== DEFAULT_ACCOUNT_ID) return "";
  return localStorage.getItem(STORAGE_KEY) || "";
}

function removeDuplicatedLegacyState(accountId) {
  if (accountId !== DEFAULT_ACCOUNT_ID) return;
  localStorage.removeItem(STORAGE_KEY);
}

function normalizeProject(project, accountId = DEFAULT_ACCOUNT_ID) {
  const responses = inflateProjectResponses(project);
  const schema = normalizeSchema(project.schema, responses);
  const { compactResponses, ...projectWithoutCompactResponses } = project;
  return {
    ...projectWithoutCompactResponses,
    ownerAccountId: accountId,
    sourceFile: project.sourceFile || project.importSource || project.wave || "ręcznie utworzona ankieta",
    status: project.status || "oddzielna ankieta",
    thresholds: project.thresholds || { numeric: 5, comments: 10 },
    taxonomy: project.taxonomy || { themeNames: {}, questionThemeNames: {}, customCategories: [] },
    projectGroup: project.projectGroup || project.name || "Ankieta",
    reportVersions: Array.isArray(project.reportVersions) ? project.reportVersions : [],
    aiSummaries: project.aiSummaries && typeof project.aiSummaries === "object" ? project.aiSummaries : {},
    privacyReview: normalizePrivacyReview(project.privacyReview),
    schema,
    responses
  };
}

function normalizePrivacyReview(review) {
  return {
    checkedItems: review?.checkedItems && typeof review.checkedItems === "object" ? review.checkedItems : {},
    sensitiveItems: review?.sensitiveItems && typeof review.sensitiveItems === "object" ? review.sensitiveItems : {}
  };
}

function inflateProjectResponses(project) {
  if (Array.isArray(project.responses)) return project.responses;
  const compact = project.compactResponses;
  if (!compact || !Array.isArray(compact.columns) || !Array.isArray(compact.rows)) return [];
  const dictionary = Array.isArray(compact.values) ? compact.values : null;

  return compact.rows.map((values) => {
    const row = {};
    compact.columns.forEach((name, index) => {
      const compactValue = Array.isArray(values) ? values[index] : "";
      row[name] = dictionary ? dictionary[compactValue] ?? "" : compactValue ?? "";
    });
    return row;
  });
}

function normalizeSchema(schema, responses) {
  const columns = Array.isArray(schema?.columns) ? schema.columns : [];
  if (!responses.length) return { columns };
  const inferred = new Map(inferColumns(responses).map((column) => [column.name, column.type]));
  return {
    columns: columns.map((column) => {
      const inferredType = inferred.get(column.name);
      if (["ignore", "answer_value", "question_type", "response_id", "question_id"].includes(inferredType)) {
        return { ...column, type: inferredType };
      }
      if (["scale", "enps", "comment"].includes(inferredType) && column.type === "segment") {
        return { ...column, type: inferredType };
      }
      if (inferredType === "question_text" && ["comment", "answer_text", "segment"].includes(column.type)) {
        return { ...column, type: "question_text" };
      }
      if (inferredType === "question_category" && column.type === "segment") {
        return { ...column, type: "question_category" };
      }
      return column;
    })
  };
}
