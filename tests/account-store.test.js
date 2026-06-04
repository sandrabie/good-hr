import test from "node:test";
import assert from "node:assert/strict";

import { createLocalAccount, getAccountStorageKey, getCurrentAccount, switchAccount } from "../src/accounts.js";
import { getCurrentProject, loadState, removeProject, upsertProject } from "../src/store.js";

class MemoryStorage {
  constructor() {
    this.items = new Map();
  }

  getItem(key) {
    return this.items.has(key) ? this.items.get(key) : null;
  }

  setItem(key, value) {
    this.items.set(key, String(value));
  }

  removeItem(key) {
    this.items.delete(key);
  }
}

class LimitedMemoryStorage extends MemoryStorage {
  constructor(limit) {
    super();
    this.limit = limit;
  }

  setItem(key, value) {
    if (String(value).length > this.limit) {
      throw new Error("QuotaExceeded");
    }
    super.setItem(key, value);
  }
}

test("local accounts keep separate project histories", () => {
  globalThis.localStorage = new MemoryStorage();

  const first = createLocalAccount({ name: "Pierwsze konto", email: "first@example.com" });
  const second = createLocalAccount({ name: "Drugie konto", email: "second@example.com" });

  switchAccount(first.id);
  const firstState = loadState(first.id);
  upsertProject(firstState, {
    id: "project-only-first-account",
    client: "Klient A",
    name: "Badanie A",
    wave: "Q1",
    status: "roboczy",
    thresholds: { numeric: 5, comments: 10 },
    schema: { columns: [{ name: "Odpowiedź", type: "comment" }] },
    responses: [{ "Odpowiedź": "Komentarz widoczny tylko na pierwszym koncie" }]
  });

  switchAccount(second.id);
  const secondState = loadState(second.id);

  assert.equal(getCurrentAccount().id, second.id);
  assert.ok(firstState.projects.some((project) => project.id === "project-only-first-account"));
  assert.ok(!secondState.projects.some((project) => project.id === "project-only-first-account"));
});

test("deleting the last survey keeps the project list empty", () => {
  globalThis.localStorage = new MemoryStorage();

  const account = createLocalAccount({ name: "Konto testowe", email: "delete@example.com" });
  const state = loadState(account.id);
  const projectId = state.currentProjectId;

  removeProject(state, projectId);
  const reloaded = loadState(account.id);
  const currentProject = getCurrentProject(reloaded);

  assert.equal(reloaded.projects.length, 0);
  assert.equal(reloaded.currentProjectId, "");
  assert.equal(currentProject.status, "brak danych");
});

test("large surveys are compacted and survive reload", () => {
  globalThis.localStorage = new LimitedMemoryStorage(70000);

  const account = createLocalAccount({ name: "Konto duĹĽe", email: "large@example.com" });
  const state = loadState(account.id);
  const columns = Array.from({ length: 30 }, (_, index) => ({
    name: `DĹ‚ugie pytanie ankiety numer ${index} z powtarzanym opisem kolumny`,
    type: index < 3 ? "segment" : "scale"
  }));
  const responses = Array.from({ length: 200 }, (_, rowIndex) => Object.fromEntries(
    columns.map((column, columnIndex) => [column.name, String(((rowIndex + columnIndex) % 5) + 1)])
  ));

  upsertProject(state, {
    id: "large-project",
    client: "Klient duĹĽy",
    name: "DuĹĽa ankieta",
    wave: "Q1",
    status: "oddzielna ankieta",
    thresholds: { numeric: 5, comments: 10 },
    schema: { columns },
    responses
  });

  const stored = localStorage.getItem(getAccountStorageKey(account.id));
  const reloaded = loadState(account.id);
  const project = reloaded.projects.find((item) => item.id === "large-project");

  assert.ok(stored.includes("compactResponses"));
  assert.ok(!stored.includes("\"responses\":[{"));
  assert.equal(project.responses.length, 200);
  assert.equal(project.responses[0][columns[0].name], "1");
  assert.equal(project.schema.columns.length, 30);
});
