import test from "node:test";
import assert from "node:assert/strict";

import { createLocalAccount, getCurrentAccount, switchAccount } from "../src/accounts.js";
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
