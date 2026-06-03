import { sampleProject } from "./data.js";
import { inferColumns } from "./csv.js";

const STORAGE_KEY = "goodhr.workbench.v1";

export function createId(prefix = "project") {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const state = {
      currentProjectId: sampleProject.id,
      projects: [sampleProject],
      importTemplates: []
    };
    saveState(state);
    return state;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.projects) || parsed.projects.length === 0) {
      throw new Error("Invalid store");
    }
    parsed.importTemplates = Array.isArray(parsed.importTemplates) ? parsed.importTemplates : [];
    parsed.projects = parsed.projects.map(normalizeProject);
    return parsed;
  } catch {
    const state = {
      currentProjectId: sampleProject.id,
      projects: [sampleProject],
      importTemplates: []
    };
    saveState(state);
    return state;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getCurrentProject(state) {
  return state.projects.find((project) => project.id === state.currentProjectId) || state.projects[0];
}

export function upsertProject(state, project) {
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
  if (state.projects.length === 0) {
    state.projects = [sampleProject];
  }
  if (!state.projects.some((project) => project.id === state.currentProjectId)) {
    state.currentProjectId = state.projects[0].id;
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

function normalizeProject(project) {
  const responses = Array.isArray(project.responses) ? project.responses : [];
  const schema = normalizeSchema(project.schema, responses);
  return {
    ...project,
    sourceFile: project.sourceFile || project.importSource || project.wave || "ręcznie utworzona ankieta",
    status: project.status || "oddzielna ankieta",
    thresholds: project.thresholds || { numeric: 5, comments: 10 },
    taxonomy: project.taxonomy || { themeNames: {}, questionThemeNames: {}, customCategories: [] },
    projectGroup: project.projectGroup || project.name || "Ankieta",
    reportVersions: Array.isArray(project.reportVersions) ? project.reportVersions : [],
    aiSummaries: project.aiSummaries && typeof project.aiSummaries === "object" ? project.aiSummaries : {},
    schema,
    responses
  };
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
