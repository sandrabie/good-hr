import test from "node:test";
import assert from "node:assert/strict";

import { createLocalAccount, getAccountStorageKey, getCurrentAccount, switchAccount } from "../src/accounts.js";
import { clearRemoteStatePersistence, configureRemoteStatePersistence, getCurrentProject, hydrateStoredState, loadState, removeProject, saveState, upsertProject, waitForRemoteStateSave } from "../src/store.js";

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

test("privacy review checklist is saved with the survey project", () => {
  globalThis.localStorage = new MemoryStorage();

  const account = createLocalAccount({ name: "Konto kontroli", email: "privacy@example.com" });
  const state = loadState(account.id);

  upsertProject(state, {
    id: "privacy-project",
    client: "Klient",
    name: "Ankieta kontroli",
    wave: "Q1",
    status: "oddzielna ankieta",
    thresholds: { numeric: 5, comments: 10 },
    privacyReview: {
      checkedItems: {
        "pii:email:comment-1": { checkedAt: "2026-06-06T12:00:00.000Z" }
      },
      sensitiveItems: {
        "pii:email:comment-1": { flaggedAt: "2026-06-06T12:01:00.000Z" }
      }
    },
    schema: { columns: [{ name: "Komentarz", type: "comment" }] },
    responses: [{ Komentarz: "Komentarz po anonimizacji" }]
  });

  const reloaded = loadState(account.id);
  const project = reloaded.projects.find((item) => item.id === "privacy-project");

  assert.equal(project.privacyReview.checkedItems["pii:email:comment-1"].checkedAt, "2026-06-06T12:00:00.000Z");
  assert.equal(project.privacyReview.sensitiveItems["pii:email:comment-1"].flaggedAt, "2026-06-06T12:01:00.000Z");
});

test("large surveys are dictionary-packed and survive reload", () => {
  globalThis.localStorage = new LimitedMemoryStorage(45000);

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
  assert.ok(stored.includes("\"values\""));
  assert.ok(!stored.includes("\"responses\":[{"));
  assert.ok(stored.length < 45000);
  assert.equal(project.responses.length, 200);
  assert.equal(project.responses[0][columns[0].name], "1");
  assert.equal(project.schema.columns.length, 30);
});

test("remote persistence receives packed workspace when local cache is full", async () => {
  globalThis.localStorage = new LimitedMemoryStorage(20);
  const saves = [];
  configureRemoteStatePersistence(async (snapshot, accountId) => {
    saves.push({ snapshot, accountId });
  });

  const state = {
    accountId: "supabase-user-1",
    currentProjectId: "remote-project",
    importTemplates: [],
    projects: [{
      id: "remote-project",
      client: "Klient",
      name: "Ankieta",
      wave: "Q1",
      status: "oddzielna ankieta",
      thresholds: { numeric: 5, comments: 10 },
      schema: { columns: [{ name: "Odpowiedź", type: "comment" }] },
      responses: [{ "Odpowiedź": "Długi komentarz ankietowy zapisany zdalnie" }]
    }]
  };

  saveState(state, state.accountId);
  await waitForRemoteStateSave();
  clearRemoteStatePersistence();

  assert.equal(saves.length, 1);
  assert.equal(saves[0].accountId, "supabase-user-1");
  assert.ok(saves[0].snapshot.projects[0].compactResponses);
  assert.equal(saves[0].snapshot.projects[0].responses, undefined);
});

test("hydrated Supabase workspace is assigned to the active user", () => {
  globalThis.localStorage = new MemoryStorage();

  const state = hydrateStoredState("supabase-user-2", {
    accountId: "supabase-user-1",
    currentProjectId: "remote-project",
    importTemplates: [],
    projects: [{
      id: "remote-project",
      ownerAccountId: "supabase-user-1",
      client: "Klient",
      name: "Ankieta",
      wave: "Q1",
      status: "oddzielna ankieta",
      thresholds: { numeric: 5, comments: 10 },
      schema: { columns: [{ name: "Odpowiedź", type: "comment" }] },
      responses: [{ "Odpowiedź": "Komentarz przypisany do aktywnego użytkownika" }]
    }]
  });

  const cached = JSON.parse(localStorage.getItem(getAccountStorageKey("supabase-user-2")));

  assert.equal(state.accountId, "supabase-user-2");
  assert.equal(state.projects[0].ownerAccountId, "supabase-user-2");
  assert.equal(cached.accountId, "supabase-user-2");
  assert.equal(cached.projects[0].ownerAccountId, "supabase-user-2");
});
