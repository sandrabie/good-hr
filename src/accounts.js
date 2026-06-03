const ACCOUNTS_KEY = "goodhr.accounts.v1";
const CURRENT_ACCOUNT_KEY = "goodhr.currentAccountId.v1";

export const DEFAULT_ACCOUNT_ID = "account-local-default";

export function getAccountStorageKey(accountId) {
  return `goodhr.workbench.v1.account.${accountId || DEFAULT_ACCOUNT_ID}`;
}

export function getAccounts() {
  return loadAccountRegistry().accounts;
}

export function getCurrentAccount() {
  const registry = loadAccountRegistry();
  const currentId = localStorage.getItem(CURRENT_ACCOUNT_KEY);
  return registry.accounts.find((account) => account.id === currentId) || null;
}

export function createLocalAccount(input = {}) {
  const registry = loadAccountRegistry();
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("Podaj adres e-mail konta.");
  if (registry.accounts.some((account) => normalizeEmail(account.email) === email)) {
    throw new Error("Konto z takim adresem e-mail już istnieje.");
  }

  const now = new Date().toISOString();
  const account = {
    id: createAccountId(),
    provider: "local-demo",
    name: String(input.name || email.split("@")[0] || "Użytkownik").trim(),
    email,
    role: String(input.role || "Konsultant").trim(),
    pinHash: encodePin(input.pin || ""),
    createdAt: now,
    lastLoginAt: now
  };

  registry.accounts.push(account);
  saveAccountRegistry(registry);
  localStorage.setItem(CURRENT_ACCOUNT_KEY, account.id);
  return sanitizeAccount(account);
}

export function loginLocalAccount(email, pin = "") {
  const registry = loadAccountRegistry();
  const normalizedEmail = normalizeEmail(email);
  const account = registry.accounts.find((item) => normalizeEmail(item.email) === normalizedEmail);
  if (!account) throw new Error("Nie znaleziono konta lokalnego.");
  if (account.pinHash && account.pinHash !== encodePin(pin)) {
    throw new Error("Niepoprawny PIN demonstracyjny.");
  }

  account.lastLoginAt = new Date().toISOString();
  saveAccountRegistry(registry);
  localStorage.setItem(CURRENT_ACCOUNT_KEY, account.id);
  return sanitizeAccount(account);
}

export function switchAccount(accountId) {
  const registry = loadAccountRegistry();
  const account = registry.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error("Nie znaleziono konta.");
  account.lastLoginAt = new Date().toISOString();
  saveAccountRegistry(registry);
  localStorage.setItem(CURRENT_ACCOUNT_KEY, account.id);
  return sanitizeAccount(account);
}

export function logoutAccount() {
  localStorage.removeItem(CURRENT_ACCOUNT_KEY);
}

function loadAccountRegistry() {
  const parsed = readAccountRegistry();
  if (parsed.accounts.length) return parsed;

  const now = new Date().toISOString();
  const registry = {
    version: 1,
    accounts: [
      {
        id: DEFAULT_ACCOUNT_ID,
        provider: "local-demo",
        name: "Konto lokalne",
        email: "lokalne@goodhr",
        role: "Konsultant",
        pinHash: "",
        createdAt: now,
        lastLoginAt: now,
        legacyDefault: true
      }
    ]
  };
  saveAccountRegistry(registry);
  localStorage.setItem(CURRENT_ACCOUNT_KEY, DEFAULT_ACCOUNT_ID);
  return registry;
}

function readAccountRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}");
    return {
      version: 1,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts.map(normalizeAccount).filter(Boolean) : []
    };
  } catch {
    return { version: 1, accounts: [] };
  }
}

function saveAccountRegistry(registry) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify({
    version: 1,
    accounts: registry.accounts.map(normalizeAccount).filter(Boolean)
  }));
}

function normalizeAccount(account) {
  if (!account || typeof account !== "object") return null;
  return {
    id: String(account.id || createAccountId()),
    provider: account.provider || "local-demo",
    name: String(account.name || "Użytkownik").trim() || "Użytkownik",
    email: normalizeEmail(account.email) || "lokalne@goodhr",
    role: String(account.role || "Konsultant").trim() || "Konsultant",
    pinHash: String(account.pinHash || ""),
    createdAt: account.createdAt || new Date().toISOString(),
    lastLoginAt: account.lastLoginAt || "",
    legacyDefault: Boolean(account.legacyDefault)
  };
}

function sanitizeAccount(account) {
  const normalized = normalizeAccount(account);
  const { pinHash, ...safeAccount } = normalized;
  return safeAccount;
}

function createAccountId() {
  const random = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `account-${random}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function encodePin(value) {
  const pin = String(value || "");
  if (!pin) return "";
  try {
    return btoa(unescape(encodeURIComponent(pin)));
  } catch {
    return pin;
  }
}
