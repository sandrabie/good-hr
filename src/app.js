import { getCurrentProject, loadState, saveState, upsertProject, removeProject, exportProject, importProjectFile, createId } from "./store.js";
import { createLocalAccount, getAccounts, getCurrentAccount, loginLocalAccount, logoutAccount, switchAccount } from "./accounts.js";
import { parseCSV, parseTabularFile, inferColumns } from "./csv.js";
import { buildReportDraft, calculateEnps, collectComments, detectPii, getAiAnswerInsights, getColumns, getHeatmap, getMetricSummary, getQuestionStats, getSegmentComparison, getTopics, redactText } from "./analytics.js";
import { sampleCsvFiles } from "./data.js";

const viewMeta = {
  dashboard: ["Dashboard ankiety", "Wyniki liczone tylko dla aktywnie wybranej ankiety."],
  projects: ["Ankiety", "Oddzielne ankiety, bez mieszania odpowiedzi w jednym dashboardzie."],
  import: ["Import CSV", "Utworzenie osobnej ankiety/datasetu z pojedynczego pliku CSV."],
  analysis: ["Wyniki i komentarze", "Podsumowanie AI oddzielone od odpowiedzi ankietowanych."],
  taxonomy: ["Taksonomia", "Robocze tagi AI i końcowe kategorie konsultanta."],
  privacy: ["Kontrola danych", "PII, małe grupy i progi publikacji przed raportem."],
  report: ["Studio raportu", "Szkic narracji, dowody i eksport roboczy."],
  account: ["Konto i projekty", "Lokalne konta, osobna historia projektów i przygotowanie pod Supabase."]
};

let currentAccount = getCurrentAccount();
let state = currentAccount ? loadState(currentAccount.id) : null;
let activeView = "dashboard";
let importDraft = null;
let analysisFilters = {
  category: "__all",
  question: "__all"
};
let analysisSubview = "answers";
const aiSummaryStatus = new Map();
const OLLAMA_SETTINGS_KEY = "goodhr.ollama.settings.v1";
let ollamaSettings = loadOllamaSettings();
let segmentCompareState = {
  segmentColumn: "",
  question: ""
};
const SCALE_ANSWER_RENDER_LIMIT = 80;
const COMMENT_RENDER_LIMIT = 50;
let activeReportSlideId = "";
let reportPresentationMode = false;
let presentationSlideIndex = 0;
let lastToastMessage = "";
let toastTimer = 0;
let importFeedback = null;

function loadOllamaSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(OLLAMA_SETTINGS_KEY) || "{}");
    return {
      endpoint: String(saved.endpoint || "http://localhost:11434").trim(),
      model: String(saved.model || "gemma3").trim()
    };
  } catch {
    return {
      endpoint: "http://localhost:11434",
      model: "gemma3"
    };
  }
}

const app = document.getElementById("app");
const reportSlideTemplates = [
  ["blank", "Pusty slajd"],
  ["cover", "Okładka"],
  ["method", "Cel i metoda"],
  ["metrics", "Skala badania"],
  ["comparison", "Top / bottom pytań"],
  ["segmentTable", "Wyniki po segmentach"],
  ["tableGeneric", "Tabela"],
  ["enps", "eNPS"],
  ["bars", "Wykres wyników"],
  ["topics", "Tematy komentarzy"],
  ["bullets", "Lista wniosków"],
  ["quotes", "Cytaty"],
  ["checklist", "Kontrola danych"]
];
const reportSlideLayouts = [
  ["standard", "Standard"],
  ["cover", "Okładka"],
  ["method", "Karty metody"],
  ["metrics", "Kafelki liczb"],
  ["comparison", "Dwie kolumny"],
  ["table", "Tabela"],
  ["chart", "Wykres"],
  ["quotes", "Cytaty"],
  ["checklist", "Lista kontrolna"],
  ["compact", "Kompakt"],
  ["split", "Tekst + wizualizacja"]
];
const reportSlideThemes = [
  ["navy", "Granat"],
  ["teal", "Zieleń"],
  ["blue", "Niebieski"],
  ["amber", "Bursztyn"],
  ["coral", "Koral"]
];
const reportSlideStatuses = [
  ["draft", "Roboczy"],
  ["review", "Do sprawdzenia"],
  ["ready", "Gotowy"]
];
const reportInsertOptions = [
  ["bullet", "Punkt tekstowy"],
  ["metric", "Metryka"],
  ["table", "Tabela"],
  ["quote", "Cytat"],
  ["check", "Punkt kontrolny"]
];
const importColumnTypes = ["segment", "scale", "enps", "comment", "question_text", "question_type", "answer_text", "answer_value", "question_category", "question_id", "response_id", "ignore"];

render();

function render() {
  currentAccount = getCurrentAccount();
  if (!currentAccount) {
    renderAuth();
    return;
  }
  if (!state || state.accountId !== currentAccount.id) {
    state = loadState(currentAccount.id);
  }
  const project = getCurrentProject(state);
  const [title, subtitle] = viewMeta[activeView];

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="mark">GH</div>
          <div>
            <strong>GoodHR Workbench</strong>
            <span>lokalna analiza ankiet</span>
          </div>
        </div>

        ${renderSidebarAccount(currentAccount)}

        <div class="active-project">
          <div class="eyebrow">Aktywna ankieta</div>
          <h2>${escapeHtml(project.client)} - ${escapeHtml(project.name)}</h2>
          <div class="status-line">
            <span><span class="dot"></span>${project.responses?.length || 0} odpowiedzi</span>
            <span>${escapeHtml(project.wave || "")}</span>
          </div>
        </div>

        <nav class="nav" aria-label="Nawigacja">
          ${navButton("dashboard", "Dashboard")}
          ${navButton("projects", "Ankiety")}
          ${navButton("import", "Import")}
          ${navButton("analysis", "Wyniki")}
          ${navButton("taxonomy", "Taksonomia")}
          ${navButton("privacy", "Kontrola danych")}
          ${navButton("report", "Raport")}
          ${navButton("account", "Konto")}
        </nav>

        <div class="sidebar-footer">
          Każdy import CSV tworzy osobną ankietę. Dashboard nie sumuje odpowiedzi z różnych plików.
        </div>
      </aside>

      <main class="workspace">
        <header class="topbar">
          <div class="title">
            <h1>${title}</h1>
            <p>${subtitle}</p>
          </div>
        </header>

        <div class="content">
          ${renderActiveView(project)}
        </div>
      </main>
    </div>
    <div id="toast" class="toast" role="status"></div>
  `;

  bindShellEvents();
  bindViewEvents(project);
  flushToast();
}

function renderAuth() {
  const accounts = getAccounts();
  const firstAccount = accounts[0];

  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card">
        <div class="brand auth-brand">
          <div class="mark">GH</div>
          <div>
            <strong>GoodHR Workbench</strong>
            <span>schemat kont lokalnych</span>
          </div>
        </div>
        <div class="auth-intro">
          <h1>Zaloguj się do przestrzeni projektu</h1>
          <p>Ten etap rozdziela historię ankiet, raporty i szablony importu między lokalnymi kontami. To makieta funkcjonalna pod późniejsze podłączenie Supabase.</p>
        </div>
        <div class="grid cols-2">
          <div class="panel">
            <div class="section-head">
              <div>
                <h2>Logowanie lokalne</h2>
                <p>Wybierz zapisane konto i podaj PIN, jeśli został ustawiony.</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="loginEmail">Konto</label>
                <select id="loginEmail">
                  ${accounts.map((account) => `<option value="${escapeAttribute(account.email)}" ${account.id === firstAccount?.id ? "selected" : ""}>${escapeHtml(account.name)} · ${escapeHtml(account.email)}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label for="loginPin">PIN demonstracyjny</label>
                <input id="loginPin" type="password" placeholder="Zostaw puste, jeśli konto nie ma PIN-u" />
              </div>
              <button class="primary" id="loginAccount">Zaloguj</button>
            </div>
          </div>
          <div class="panel">
            <div class="section-head">
              <div>
                <h2>Nowe konto</h2>
                <p>Utwórz osobną przestrzeń projektów dla konsultanta lub klienta testowego.</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label for="newAccountName">Nazwa użytkownika</label>
                <input id="newAccountName" placeholder="np. Sandra / Konsultant HR" />
              </div>
              <div class="field">
                <label for="newAccountEmail">E-mail</label>
                <input id="newAccountEmail" type="email" placeholder="np. sandra@example.com" />
              </div>
              <div class="field">
                <label for="newAccountPin">PIN demonstracyjny</label>
                <input id="newAccountPin" type="password" placeholder="Opcjonalnie" />
              </div>
              <button class="button" id="createAccount">Utwórz konto i zaloguj</button>
            </div>
          </div>
        </div>
        <div class="panel auth-note">
          <strong>Ważne:</strong>
          <span>To nie jest jeszcze produkcyjne logowanie. Dane są rozdzielane lokalnie w przeglądarce. Docelowo tę warstwę można przepiąć na Supabase Auth i tabelę projektów przypisaną do user_id.</span>
        </div>
      </section>
      <div id="toast" class="toast" role="status"></div>
    </main>
  `;

  bindAuthEvents();
  flushToast();
}

function renderSidebarAccount(account) {
  return `
    <div class="account-mini">
      <div>
        <div class="eyebrow">Konto</div>
        <strong>${escapeHtml(account.name)}</strong>
        <span>${escapeHtml(account.email)}</span>
      </div>
      <button class="ghost small" data-nav-target="account">Panel</button>
    </div>
  `;
}

function navButton(view, label) {
  return `<button data-nav="${view}" class="${activeView === view ? "active" : ""}">${label}</button>`;
}

function renderActiveView(project) {
  if (activeView === "dashboard") return renderDashboard(project);
  if (activeView === "projects") return renderProjects();
  if (activeView === "import") return renderImport(project);
  if (activeView === "analysis") return renderAnalysis(project);
  if (activeView === "taxonomy") return renderTaxonomy(project);
  if (activeView === "privacy") return renderPrivacy(project);
  if (activeView === "report") return renderReport(project);
  if (activeView === "account") return renderAccount(project);
  return "";
}

function renderDashboard(project) {
  const summary = getMetricSummary(project);
  const aiInsights = getAiAnswerInsights(project);

  return `
    <section class="view active">
      <div class="section-head">
        <div>
          <h2>Stan aktywnej ankiety</h2>
          <p>${escapeHtml(project.client)} · ${escapeHtml(project.wave || "fala robocza")} · źródło: ${escapeHtml(project.sourceFile || "CSV")}</p>
        </div>
      </div>

      ${renderSurveySwitcher(project.id)}

      <div class="grid cols-4">
        ${metric("Odpowiedzi", summary.respondents, `${summary.questions} kolumn w tej ankiecie`)}
        ${metric("Średnia skal", formatNumber(summary.scaleAverage), "pytania typu skala")}
        ${metric("eNPS", summary.enps === null ? "-" : signed(summary.enps), "promotorzy minus krytycy")}
        ${metric("Gotowość", `${summary.readiness}%`, `${summary.pii} potencjalnych PII`)}
      </div>

      <div class="panel" style="margin-top: 14px;">
        <div class="section-head">
          <div>
            <h2>Główne wnioski z ankiety</h2>
            <p>Asystent grupuje odpowiedzi w tematy, bez oceny pojedynczych osób i bez rozpoznawania emocji.</p>
          </div>
          <button class="primary" data-nav-target="analysis">Przejdź do wyników</button>
        </div>
        ${renderAiThemeCards(aiInsights.themes.slice(0, 4))}
      </div>
    </section>
  `;
}

function renderImportFeedback() {
  if (!importFeedback) return "";

  return `
    <div class="import-success" role="status">
      <div>
        <strong>${escapeHtml(importFeedback.title)}</strong>
        <p>${escapeHtml(importFeedback.text)}</p>
      </div>
      <div class="actions">
        <button class="primary" data-nav-target="analysis">Przejdź do wyników</button>
        <button class="ghost small" data-dismiss-import-feedback>Zamknij</button>
      </div>
    </div>
  `;
}

function renderSurveySwitcher(activeId) {
  return `
    <div class="panel" style="margin-bottom: 14px;">
      <div class="section-head">
        <div>
          <h2>Ankiety</h2>
          <p>Wybierz import, którego dane mają być pokazane. Poniższe karty nie agregują odpowiedzi.</p>
        </div>
      </div>
      <div class="grid cols-3">
        ${state.projects.map((survey) => `
          <button class="survey-card ${survey.id === activeId ? "active" : ""}" data-open-project="${survey.id}">
            <span class="eyebrow">${escapeHtml(survey.sourceFile || "CSV")}</span>
            <strong>${escapeHtml(survey.client)} / ${escapeHtml(survey.name)}</strong>
            <span>${survey.responses?.length || 0} odpowiedzi · ${escapeHtml(survey.wave || "bez fali")}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAiThemeCards(themes, selectable = false, emptyMessage = "Brak danych do klasyfikacji. Dodaj pytania skalowe lub komentarze.", options = {}) {
  if (!themes.length) {
    return `<div class="empty">${escapeHtml(emptyMessage)}</div>`;
  }

  const compact = options.compact === true;

  return `
    <div class="ai-theme-grid">
      ${themes.map((theme) => `
        <${selectable ? "button type=\"button\"" : "article"} class="ai-card ${selectable && analysisFilters.category === theme.id ? "active" : ""}" ${selectable ? `data-analysis-theme="${escapeAttribute(theme.id)}"` : ""}>
          <div class="topic-top">
            <h3>${escapeHtml(theme.name)}</h3>
            <span class="pill ${theme.color}">${theme.confidence}</span>
          </div>
          ${compact ? "" : `<p>${escapeHtml(theme.simplified)}</p>`}
          <div class="pill-row">
            <span class="pill">${theme.scaleQuestions.length} obszarów</span>
            <span class="pill">${theme.comments.length} komentarzy</span>
            <span class="pill ${theme.average !== null && theme.average < 3.2 ? "coral" : theme.average !== null && theme.average < 3.8 ? "amber" : "teal"}">średnia ${formatNumber(theme.average)}</span>
            ${compact ? "" : `<span class="pill blue">podsumowanie AI</span>`}
          </div>
        </${selectable ? "button" : "article"}>
      `).join("")}
    </div>
  `;
}

function renderProjects() {
  return `
    <section class="view active">
      <div class="section-head">
        <div>
          <h2>Ankiety</h2>
          <p>${state.projects.length} zapisanych importów na koncie ${escapeHtml(currentAccount.name)}. Każdy wiersz ma własny dashboard i własne odpowiedzi.</p>
        </div>
      </div>
      <div class="panel" style="margin-bottom: 14px;">
        <strong>Zasada działania:</strong>
        <span class="muted">import CSV zawsze tworzy osobną ankietę. Dane nie są dopisywane do aktywnego dashboardu ani nie są sumowane z innymi plikami.</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Klient</th>
              <th>Ankieta</th>
              <th>Fala</th>
              <th>Źródło CSV</th>
              <th>Status</th>
              <th>Odpowiedzi</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            ${state.projects.map((project) => `
              <tr>
                <td>${escapeHtml(project.client)}</td>
                <td>${escapeHtml(project.name)}</td>
                <td>${escapeHtml(project.wave || "-")}</td>
                <td>${escapeHtml(project.sourceFile || "-")}</td>
                <td><span class="pill ${project.id === state.currentProjectId ? "teal" : ""}">${escapeHtml(project.status || "roboczy")}</span></td>
                <td>${project.responses?.length || 0}</td>
                <td>
                  <button class="button" data-open-project="${escapeAttribute(project.id)}">Otwórz dashboard</button>
                  <button class="danger" data-delete-project="${escapeAttribute(project.id)}">Usuń</button>
                </td>
              </tr>
            `).join("") || `<tr><td colspan="7">Brak zapisanych ankiet. Przejdź do importu, żeby dodać pierwszy plik.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${renderProjectHistory()}
    </section>
  `;
}

function renderAccount() {
  const accounts = getAccounts();
  const accountRows = accounts.map((account) => ({
    account,
    state: loadState(account.id)
  }));
  const currentProjectCount = state.projects.length;
  const currentResponseCount = state.projects.reduce((sum, project) => sum + (project.responses?.length || 0), 0);

  return `
    <section class="view active">
      <div class="section-head">
        <div>
          <h2>Konto i przestrzeń projektów</h2>
          <p>Roboczy system logowania rozdziela ankiety, historię projektów, raporty i szablony importu per konto.</p>
        </div>
        <button class="danger" id="logoutAccount">Wyloguj</button>
      </div>

      <div class="grid cols-4">
        ${metric("Aktywne konto", currentAccount.name, currentAccount.email)}
        ${metric("Ankiety", currentProjectCount, "widoczne tylko dla tego konta")}
        ${metric("Odpowiedzi", currentResponseCount, "we wszystkich ankietach konta")}
        ${metric("Szablony importu", state.importTemplates?.length || 0, "zapisane lokalnie dla konta")}
      </div>

      <div class="grid wide-left account-grid">
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Lokalne konta</h2>
              <p>Przełączenie konta ładuje osobną historię projektów i osobny zapis raportów.</p>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Konto</th>
                  <th>Rola</th>
                  <th>Ankiety</th>
                  <th>Odpowiedzi</th>
                  <th>Ostatnie logowanie</th>
                  <th>Akcja</th>
                </tr>
              </thead>
              <tbody>
                ${accountRows.map(({ account, state: accountState }) => `
                  <tr>
                    <td><strong>${escapeHtml(account.name)}</strong><br><span class="muted">${escapeHtml(account.email)}</span></td>
                    <td>${escapeHtml(account.role || "Konsultant")}</td>
                    <td>${accountState.projects.length}</td>
                    <td>${accountState.projects.reduce((sum, project) => sum + (project.responses?.length || 0), 0)}</td>
                    <td>${escapeHtml(formatDateTime(account.lastLoginAt || account.createdAt))}</td>
                    <td>
                      ${account.id === currentAccount.id
                        ? `<span class="pill teal">aktywne</span>`
                        : `<button class="button" data-switch-account="${escapeAttribute(account.id)}">Przełącz</button>`}
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Dodaj konto</h2>
              <p>Nowe konto dostanie własną, pustą przestrzeń projektów z przykładową ankietą startową.</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="accountName">Nazwa użytkownika</label>
              <input id="accountName" placeholder="np. Konsultant HR" />
            </div>
            <div class="field">
              <label for="accountEmail">E-mail</label>
              <input id="accountEmail" type="email" placeholder="np. konsultant@example.com" />
            </div>
            <div class="field">
              <label for="accountPin">PIN demonstracyjny</label>
              <input id="accountPin" type="password" placeholder="Opcjonalnie" />
            </div>
            <button class="primary" id="createAccountFromPanel">Utwórz konto</button>
          </div>
        </div>
      </div>

      <div class="panel supabase-panel">
        <div class="section-head">
          <div>
            <h2>Przygotowanie pod Supabase</h2>
            <p>Obecny system jest lokalną makietą. Struktura jest gotowa do późniejszego przeniesienia na backend.</p>
          </div>
          <span class="pill amber">tryb lokalny</span>
        </div>
        <div class="grid cols-3">
          <div class="control-card ok">
            <strong>Auth</strong>
            <p>Obecnie: konto lokalne. Docelowo: Supabase Auth z logowaniem e-mail/magic link.</p>
          </div>
          <div class="control-card ok">
            <strong>Projekty</strong>
            <p>Obecnie: osobny localStorage per konto. Docelowo: tabela projects z kolumną user_id.</p>
          </div>
          <div class="control-card warn">
            <strong>Historia raportów</strong>
            <p>Obecnie: wersje w projekcie. Docelowo: tabela report_versions i uprawnienia zespołowe.</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderProjectHistory() {
  const groups = buildProjectHistoryGroups();
  const clientGroups = buildClientHistoryGroups(groups);
  const waveRows = groups.flatMap((group) => group.surveys.map((survey, index) => ({
    ...survey,
    client: group.client,
    projectName: group.projectName,
    waveIndex: index,
    previous: group.surveys[index - 1] || null
  })));
  const versionCount = state.projects.reduce((sum, project) => sum + getReportVersionCount(project), 0);

  return `
    <div class="history-section">
      <div class="section-head">
        <div>
          <h2>Historia klientów i projektów</h2>
          <p>Baza łączy ankiety tego samego klienta i projektu, pokazuje fale badania oraz wersje raportów.</p>
        </div>
      </div>

      <div class="grid cols-4">
        ${metric("Klienci", clientGroups.length, "unikalne organizacje")}
        ${metric("Projekty", groups.length, "grupy ankiet po nazwie projektu")}
        ${metric("Ankiety / fale", state.projects.length, "oddzielne importy danych")}
        ${metric("Wersje raportów", versionCount, "aktualne i archiwalne wersje")}
      </div>

      <div class="history-client-grid">
        ${clientGroups.map((client) => `
          <article class="history-card">
            <div class="topic-top">
              <h3>${escapeHtml(client.client)}</h3>
              <span class="pill teal">${client.surveyCount} ankiet</span>
            </div>
            <p>${client.projectCount} projektów · ${client.responseCount} odpowiedzi · ${client.versionCount} wersji raportu</p>
            <div class="pill-row">
              ${client.projectNames.slice(0, 4).map((name) => `<span class="pill">${escapeHtml(name)}</span>`).join("")}
            </div>
          </article>
        `).join("")}
      </div>

      <div class="panel history-panel">
        <div class="section-head">
          <div>
            <h2>Porównanie fal w czasie</h2>
            <p>Wiersze są liczone osobno dla każdej ankiety. Różnica pokazuje zmianę względem poprzedniej fali tego samego projektu.</p>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Klient / projekt</th>
                <th>Fala</th>
                <th>Odpowiedzi</th>
                <th>Średnia skal</th>
                <th>Zmiana</th>
                <th>eNPS</th>
                <th>Raporty</th>
                <th>Akcja</th>
              </tr>
            </thead>
            <tbody>
              ${waveRows.map((row) => {
                const scaleDelta = row.previous && row.summary.scaleAverage !== null && row.previous.summary.scaleAverage !== null
                  ? row.summary.scaleAverage - row.previous.summary.scaleAverage
                  : null;
                const enpsDelta = row.previous && row.summary.enps !== null && row.previous.summary.enps !== null
                  ? row.summary.enps - row.previous.summary.enps
                  : null;
                return `
                  <tr>
                    <td><strong>${escapeHtml(row.client)}</strong><br><span class="muted">${escapeHtml(row.projectName)}</span></td>
                    <td>${escapeHtml(row.project.wave || `Fala ${row.waveIndex + 1}`)}<br><span class="muted">${escapeHtml(formatDateTime(row.project.createdAt))}</span></td>
                    <td>${row.summary.respondents}</td>
                    <td>${formatNumber(row.summary.scaleAverage)}</td>
                    <td>${formatDelta(scaleDelta)}</td>
                    <td>${row.summary.enps === null ? "-" : `${signed(row.summary.enps)}${enpsDelta === null ? "" : ` (${formatDelta(enpsDelta, false)})`}`}</td>
                    <td>${renderReportVersionBadge(row.project)}</td>
                    <td><button class="button" data-open-project="${escapeAttribute(row.project.id)}">Otwórz</button></td>
                  </tr>
                `;
              }).join("") || `<tr><td colspan="8">Brak zapisanych ankiet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderImport(project) {
  const columns = importDraft?.columns || [];
  const rows = importDraft?.rows || [];
  const templates = state.importTemplates || [];
  const warnings = importDraft ? getImportWarnings(importDraft) : [];

  return `
    <section class="view active">
      <div class="section-head">
        <div>
          <h2>Kreator importu ankiety</h2>
          <p>Wczytaj eksport z Webankiety, CSV albo XLSX. Każdy import tworzy osobną ankietę.</p>
        </div>
      </div>

      ${renderImportFeedback()}

      <div class="grid wide-right">
        <div class="panel">
          <div class="form-grid">
            <div class="field">
              <label for="clientName">Klient</label>
              <input id="clientName" value="${escapeAttribute(importDraft?.client || "Nowy klient")}" />
            </div>
            <div class="field">
              <label for="projectName">Nazwa ankiety</label>
              <input id="projectName" value="${escapeAttribute(importDraft?.name || "Badanie zaangażowania")}" />
            </div>
            <div class="field">
              <label for="waveName">Fala</label>
              <input id="waveName" value="${escapeAttribute(importDraft?.wave || "Q1 2026")}" />
            </div>
            <div class="field">
              <label for="importSourceKind">Źródło danych</label>
              <select id="importSourceKind">
                ${["Auto", "Webankieta", "Excel", "CSV"].map((source) => `<option value="${escapeAttribute(source)}" ${source === (importDraft?.sourceKind || "Auto") ? "selected" : ""}>${escapeHtml(source)}</option>`).join("")}
              </select>
            </div>
            <div class="dropzone">
              <div>
                <strong>Plik z nagłówkami w pierwszym wierszu</strong>
                <span>Obsługiwane: CSV, TSV i XLSX z pierwszego arkusza.</span>
                <label class="input-file-label" for="csvInput" style="margin-top: 12px;">Wybierz plik</label>
                <input id="csvInput" type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
              </div>
            </div>
            <div class="template-controls">
              <div class="field">
                <label for="importTemplateSelect">Szablon mapowania</label>
                <select id="importTemplateSelect" ${templates.length ? "" : "disabled"}>
                  <option value="">${templates.length ? "Wybierz zapisany szablon" : "Brak zapisanych szablonów"}</option>
                  ${templates.map((template) => `<option value="${escapeAttribute(template.id)}" ${template.id === importDraft?.templateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`).join("")}
                </select>
              </div>
              <div class="actions">
                <button class="button" id="applyImportTemplate" ${templates.length && rows.length ? "" : "disabled"}>Zastosuj</button>
                <button class="button" id="saveImportTemplate" ${rows.length ? "" : "disabled"}>Zapisz szablon</button>
              </div>
            </div>
            ${rows.length ? `
              <div class="import-summary">
                <span class="eyebrow">Gotowe do importu</span>
                <strong>${escapeHtml(importDraft.sourceFile || "plik z danymi")}</strong>
                <span>${rows.length} wierszy · ${columns.length} kolumn · ${columns.filter((column) => ["comment", "answer_text", "answer_value"].includes(column.type)).length} kolumn odpowiedzi</span>
                <button class="primary import-cta" id="createProjectFromCsv">Importuj dane ankiety</button>
              </div>
            ` : ""}
          </div>
        </div>

        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Mapowanie kolumn</h2>
              <p>${rows.length ? `${rows.length} rekordów gotowych do sprawdzenia przed importem.` : "Wybierz plik, żeby zobaczyć mapowanie i podgląd."}</p>
            </div>
          </div>
          ${warnings.length ? renderImportWarnings(warnings) : ""}
          ${columns.length ? renderMappingTable(columns) : `<div class="empty">Brak danych importu.</div>`}
        </div>
      </div>

      ${rows.length ? `
        <div class="panel import-preview-panel">
          <div class="section-head">
            <div>
              <h2>Podgląd danych przed importem</h2>
              <p>Pierwsze wiersze pomagają sprawdzić, czy pytania, odpowiedzi i segmenty trafiły do właściwych kolumn.</p>
            </div>
          </div>
          ${renderImportPreview(rows, columns)}
        </div>
      ` : ""}

      <div class="panel" style="margin-top: 14px;">
        <div class="section-head">
          <div>
            <h2>Przykładowe CSV do testów</h2>
            <p>Każdy plik można wczytać jednym kliknięciem albo pobrać z folderu <code>data</code>.</p>
          </div>
        </div>
        <div class="grid cols-3">
          ${sampleCsvFiles.map((sample) => `
            <div class="quote">
              <div class="pill-row">
                <span class="pill teal">${escapeHtml(sample.client)}</span>
                <span class="pill">${escapeHtml(sample.wave)}</span>
              </div>
              <strong>${escapeHtml(sample.name)}</strong>
              <p>${escapeHtml(sample.description)}</p>
              <div class="actions" style="justify-content: flex-start;">
                <button class="button" data-load-sample-csv="${escapeAttribute(sample.file)}">Wczytaj</button>
                <a class="button" href="./data/${escapeAttribute(sample.file)}" download>Pobierz CSV</a>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderMappingTable(columns) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Kolumna</th>
            <th>Typ</th>
            <th>Przykłady</th>
          </tr>
        </thead>
        <tbody>
          ${columns.map((column, index) => `
            <tr>
              <td>${escapeHtml(column.name)}</td>
              <td>
                <select data-column-type="${index}">
                  ${importColumnTypes.map((type) => `<option value="${type}" ${column.type === type ? "selected" : ""}>${typeLabel(type)}</option>`).join("")}
                </select>
              </td>
              <td><small>${escapeHtml(getColumnSamples(importDraft?.rows || [], column.name).join(" · ") || "-")}</small></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderImportWarnings(warnings) {
  return `
    <div class="import-warnings">
      ${warnings.map((warning) => `
        <div class="import-warning ${warning.level}">
          <strong>${escapeHtml(warning.title)}</strong>
          <p>${escapeHtml(warning.text)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderImportPreview(rows, columns) {
  const visibleColumns = columns.filter((column) => column.type !== "ignore");
  const previewRows = rows.slice(0, 8);
  return `
    <div class="table-wrap import-preview">
      <table>
        <thead>
          <tr>
            ${visibleColumns.map((column) => `<th><span>${escapeHtml(column.name)}</span><small>${escapeHtml(typeLabel(column.type))}</small></th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${previewRows.map((row) => `
            <tr>
              ${visibleColumns.map((column) => `<td>${escapeHtml(shortPreview(row[column.name]))}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function getColumnSamples(rows, columnName) {
  const seen = new Set();
  const samples = [];
  rows.forEach((row) => {
    const value = String(row[columnName] || "").trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    samples.push(shortPreview(value, 36));
  });
  return samples.slice(0, 3);
}

function shortPreview(value, length = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function getImportWarnings(draft) {
  const rows = draft.rows || [];
  const columns = draft.columns || [];
  const warnings = [];
  const questionColumns = columns.filter((column) => column.type === "question_text");
  const answerColumns = columns.filter((column) => ["answer_text", "answer_value", "comment", "scale"].includes(column.type));
  const respondentColumns = columns.filter((column) => column.type === "response_id");
  const longFormatImport = looksLikeLongFormatImport(columns);

  if (longFormatImport && !questionColumns.length) {
    warnings.push({
      level: "warn",
      title: "Brakuje kolumny pytania",
      text: "Nie wskazano kolumny z treścią pytania. W długim formacie ankiety utrudni to przypisanie odpowiedzi do pytań."
    });
  }

  if (!answerColumns.length) {
    warnings.push({
      level: "warn",
      title: "Brakuje kolumny odpowiedzi",
      text: "Nie wskazano tekstu odpowiedzi, wartości odpowiedzi ani skali. Raport może nie mieć czego analizować."
    });
  }

  if (!respondentColumns.length) {
    warnings.push({
      level: "info",
      title: "Brak identyfikatora respondenta lub odpowiedzi",
      text: "Import nadal zadziała, ale trudniej będzie rozpoznać, czy kilka rekordów pochodzi od tej samej osoby lub formularza."
    });
  }

  answerColumns.forEach((column) => {
    const values = rows.map((row) => String(row[column.name] || "").trim()).filter(Boolean);
    const questionLike = values.filter(looksLikeQuestionText).length;
    const metadataLike = values.filter(looksLikeAnswerMetadataValue).length;
    if (values.length && questionLike / values.length >= 0.35) {
      warnings.push({
        level: "warn",
        title: `Kolumna "${column.name}" wygląda jak pytania`,
        text: "Ta kolumna jest oznaczona jako odpowiedź, ale wiele wartości wygląda jak treść pytania. Sprawdź mapowanie przed importem."
      });
    }
    if (values.length && metadataLike / values.length >= 0.35) {
      warnings.push({
        level: "warn",
        title: `Kolumna "${column.name}" wygląda jak metadane`,
        text: "W tej kolumnie pojawiają się wartości typu free_text, single_choice, positive albo suggestion. To zwykle nie są odpowiedzi respondentów."
      });
    }
  });

  return warnings;
}

function looksLikeLongFormatImport(columns) {
  const longFormatTypes = new Set(["answer_text", "answer_value", "question_id", "question_type", "question_category"]);
  return (columns || []).some((column) => longFormatTypes.has(column.type));
}

function looksLikeQuestionText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /\?$/.test(text) || /^(czy|jak|jaki|jaka|jakie|co|dlaczego|w jaki sposób|na ile)\b/i.test(text);
}

function looksLikeAnswerMetadataValue(value) {
  const normalized = normalizeForLabel(value);
  return [
    "single choice",
    "multiple choice",
    "closed single choice",
    "closed multiple choice",
    "open text",
    "free text",
    "positive",
    "negative",
    "neutral",
    "unknown",
    "suggestion",
    "idea",
    "closed",
    "open"
  ].includes(normalized);
}

function renderAnalysis(project) {
  const stats = sortQuestionStats(getQuestionStats(project));
  const rawHeatmap = getHeatmap(project);
  const baseAiInsights = getAiAnswerInsights(project);
  const aiInsights = applyProjectTaxonomy(project, baseAiInsights);
  validateAnalysisCategory(aiInsights.themes);
  const selectedTheme = getSelectedAnalysisTheme(aiInsights.themes);
  const questionOptions = getQuestionOptionsForTheme(selectedTheme);
  validateAnalysisQuestion(questionOptions);
  const selectedQuestion = getSelectedAnalysisQuestion(questionOptions);
  const heatmap = filterHeatmap(rawHeatmap, selectedTheme, selectedQuestion);
  const commentCount = collectComments(project).length;
  const visibleThemes = filterAndSortThemes(aiInsights.themes);
  const visibleScaleItems = filterAndSortScaleItems(aiInsights.scaleItems);
  const visibleQuestionNames = new Set(visibleScaleItems.map((item) => item.name));
  const questionFilterActive = analysisFilters.category !== "__all" || analysisFilters.question !== "__all";
  const visibleStats = stats.filter((item) => !questionFilterActive || visibleQuestionNames.has(item.name));
  const scaleThemeByName = new Map(aiInsights.scaleItems.map((item) => [item.name, item.themeName]));

  return `
    <section class="view active analysis-view">
      <div class="section-head analysis-intro">
        <div>
          <h2>Przegląd wyników</h2>
          <p>Najpierw wybierz kategorię, potem obszar pytania w tej kategorii. Widok pokaże odpowiedzi oraz podsumowanie.</p>
        </div>
        <div class="analysis-metrics">
          <span class="pill teal">${project.responses.length} odpowiedzi</span>
          <span class="pill blue">${commentCount} komentarzy</span>
          <span class="pill">${visibleThemes.length} kategorii</span>
        </div>
      </div>

      ${renderAnalysisSubviewTabs()}
      ${analysisSubview === "segments" ? renderSegments(project, true) : `
      ${renderAnalysisFilters(project, aiInsights, questionOptions, selectedQuestion)}

      <div class="analysis-board">
        <div class="panel analysis-column ai-summary-zone">
          <div class="section-head analysis-column-head">
            <div>
              <div class="source-label ai">Podsumowanie AI</div>
              <h2>Wniosek z wybranego obszaru</h2>
              <p>Wniosek jest liczony z odpowiedzi widocznych w panelu po prawej.</p>
            </div>
          </div>
          ${renderSelectedQuestionSummary(selectedTheme, selectedQuestion, project)}

          <div class="analysis-subsection">
            <div class="section-head compact-head">
              <div>
                <h3>Obszary skalowe</h3>
                <p>Lista obszarów liczbowych przypisanych do aktualnych filtrów.</p>
              </div>
            </div>
            <div class="ai-question-list">
              ${visibleScaleItems.length ? visibleScaleItems.map((item) => `
                <div class="ai-question">
                  <div class="topic-top">
                    <strong>${escapeHtml(createReadableQuestionName(item.name))}</strong>
                  </div>
                  <small>Kolumna źródłowa: ${escapeHtml(item.name)}</small>
                  <p>${escapeHtml(formatReadableQuestionSummary(item))}</p>
                  <div class="pill-row">
                    <span class="pill">${escapeHtml(item.themeName)}</span>
                    <span class="pill">średnia ${formatNumber(item.average)}</span>
                    <span class="pill">n=${item.count}</span>
                  </div>
                </div>
              `).join("") : `<div class="empty">Brak obszarów skalowych pasujących do filtrów.</div>`}
            </div>
          </div>
        </div>

        <div class="panel analysis-column respondent-zone">
          <div class="section-head analysis-column-head">
            <div>
              <div class="source-label respondent">Odpowiedzi respondentów</div>
              <h2>Lista odpowiedzi</h2>
              <p>Surowe odpowiedzi dla wybranego obszaru pytania.</p>
            </div>
          </div>
          ${renderSelectedQuestionAnswers(selectedTheme, selectedQuestion, project)}
        </div>
      </div>

      ${renderEvidenceAndRecommendations(selectedTheme, selectedQuestion, project)}

      <div class="grid wide-left analysis-data-grid">
        <div class="panel respondent-zone">
          <div class="section-head">
            <div>
              <div class="source-label data">Dane wynikowe</div>
              <h2>Heatmapa wyników</h2>
              <p>${escapeHtml(getHeatmapDescription(heatmap))}</p>
            </div>
          </div>
          ${renderHeatmap(heatmap, project)}
        </div>
        <div class="panel respondent-zone">
          <div class="source-label data">Dane wynikowe</div>
          <div class="eyebrow" style="margin-top: 10px;">Tabela obszarów i wyników</div>
          <div class="table-wrap" style="margin-top: 12px;">
            <table>
              <thead><tr><th>Obszar źródłowy</th><th>Kategoria</th><th>Typ</th><th>n</th><th>Średnia</th></tr></thead>
              <tbody>
                ${visibleStats.map((item) => `
                  <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${escapeHtml(scaleThemeByName.get(item.name) || "Inne obserwacje")}</td>
                    <td>${typeLabel(item.type)}</td>
                    <td>${item.count}</td>
                    <td>${formatNumber(item.average)}</td>
                  </tr>
                `).join("") || `<tr><td colspan="5">Brak obszarów pasujących do filtrów.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      `}
    </section>
  `;
}

function renderHeatmap(heatmap, project) {
  if (!heatmap.segment || heatmap.rows.length === 0 || heatmap.scales.length === 0) return `<div class="empty">Brak danych do heatmapy dla aktualnych filtrów.</div>`;
  const threshold = project.thresholds?.numeric || 5;
  const rows = aggregateSmallHeatmapRows(heatmap.rows, heatmap.mode, threshold);
  const showFullQuestions = heatmap.scales.length <= 3;
  return `
    <div class="heatmap ${showFullQuestions ? "full-question-headers" : ""}" style="--heat-cols: ${heatmap.scales.length}; --heat-question-min: ${showFullQuestions ? "220px" : "110px"};">
      <div class="head">Segment</div>
      ${heatmap.scales.map((scale) => `
        <div class="head question-head" title="${escapeAttribute(scale.name)}">
          ${formatHeatmapQuestionHeader(scale.name, showFullQuestions)}
        </div>
      `).join("")}
      ${rows.map((row) => `
        <div class="head">${escapeHtml(row.group)} (${row.count})</div>
        ${row.cells.map((cell) => {
          const blocked = row.count < threshold;
          if (heatmap.mode === "categorical") {
            const className = blocked ? "hm-low" : categoricalCellClass(cell);
            return `<div class="${className}" title="${escapeAttribute(formatHeatmapCellTitle(cell, blocked, heatmap.mode))}">${blocked ? "ukryte" : formatCategoricalCell(cell)}</div>`;
          }
          const className = blocked ? "hm-low" : cellClass(cell.value);
          return `<div class="${className}" title="${escapeAttribute(formatHeatmapCellTitle(cell, blocked, heatmap.mode))}">${blocked ? "ukryte" : formatNumber(cell.value)}</div>`;
        }).join("")}
      `).join("")}
    </div>
  `;
}

function renderAnalysisSubviewTabs() {
  return `
    <div class="tabs analysis-tabs" aria-label="Widok wyników">
      <button type="button" data-analysis-subview="answers" class="${analysisSubview === "answers" ? "active" : ""}">Wyniki i komentarze</button>
      <button type="button" data-analysis-subview="segments" class="${analysisSubview === "segments" ? "active" : ""}">Segmenty</button>
    </div>
  `;
}

function getHeatmapDescription(heatmap) {
  if (!heatmap.segment) return "Brak segmentu albo danych pasujących do heatmapy.";
  if (heatmap.mode === "categorical") {
    return `Segment: ${heatmap.segment}. Komórki pokazują najczęstszą odpowiedź oraz jej udział w danym segmencie.`;
  }
  return `Segment: ${heatmap.segment}. Komórki pokazują średni wynik w obszarach liczbowych.`;
}

function renderSegments(project, embedded = false) {
  const threshold = project.thresholds?.numeric || 5;
  const comparison = getSegmentComparison(project, {
    segmentColumn: segmentCompareState.segmentColumn,
    question: segmentCompareState.question,
    threshold
  });
  segmentCompareState.segmentColumn = comparison.segment || "";
  if (!comparison.questions.some((question) => question.value === segmentCompareState.question)) {
    segmentCompareState.question = comparison.question || "";
  }
  const wrapperOpen = embedded ? `<div class="segment-view embedded-segment-view">` : `<section class="view active segment-view">`;
  const wrapperClose = embedded ? `</div>` : `</section>`;

  if (!comparison.segment) {
    return `
      ${wrapperOpen}
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Porównania segmentów</h2>
              <p>Dodaj w imporcie kolumny typu segment, np. dział, rola, lokalizacja, staż albo zespół.</p>
            </div>
          </div>
          <div class="empty">W aktywnej ankiecie nie ma kolumn segmentujących.</div>
        </div>
      ${wrapperClose}
    `;
  }

  if (!comparison.questions.length) {
    return `
      ${wrapperOpen}
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Porównania segmentów</h2>
              <p>Ten widok działa tylko dla pytań zamkniętych: skal, ocen liczbowych albo odpowiedzi z ograniczoną listą opcji.</p>
            </div>
          </div>
          <div class="empty">Nie znaleziono pytań zamkniętych nadających się do porównania segmentów.</div>
        </div>
      ${wrapperClose}
    `;
  }

  return `
    ${wrapperOpen}
      <div class="section-head">
        <div>
          <h2>Porównania segmentów</h2>
          <p>Sprawdź różnice między grupami. Małe grupy są automatycznie ukrywane zgodnie z progiem kontroli danych.</p>
        </div>
        <span class="pill blue">Próg publikacji: ${threshold} osób</span>
      </div>

      <div class="panel segment-controls">
        <div class="filter-grid segment-filter-grid">
          <div class="field">
            <label for="segmentCompareColumn">Segment</label>
            <select id="segmentCompareColumn">
              ${comparison.segmentColumns.map((column) => `<option value="${escapeAttribute(column.name)}" ${column.name === comparison.segment ? "selected" : ""}>${escapeHtml(createReadableSegmentName(column.name))}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="segmentCompareQuestion">Pytanie / obszar</label>
            <select id="segmentCompareQuestion">
              ${comparison.questions.map((question) => `<option value="${escapeAttribute(question.value)}" ${question.value === comparison.question ? "selected" : ""}>${escapeHtml(createReadableQuestionName(question.label))} (${question.count})</option>`).join("")}
            </select>
          </div>
        </div>
      </div>

      <div class="grid cols-4">
        ${metric("Segment", createReadableSegmentName(comparison.segment), `${comparison.groups.length} grup w ankiecie`)}
        ${metric("Widoczne grupy", comparison.visibleGroups.length, `${comparison.hiddenGroups.length} ukryto przez małą liczebność`)}
        ${metric("Zakres analizy", "Pytanie zamknięte", shortLabelText(comparison.questionLabel, 44))}
        ${metric("Najmocniejszy problem", comparison.strongestProblem ? comparison.strongestProblem.label : "-", formatStrongestProblemHint(comparison))}
      </div>

      <div class="grid wide-left segment-results-grid">
        <div class="panel">
          <div class="section-head">
            <div>
              <div class="source-label data">Różnice między grupami</div>
              <h2>Wyniki segmentów</h2>
              <p>${escapeHtml(formatSegmentComparisonIntro(comparison))}</p>
            </div>
          </div>
          ${renderSegmentComparisonTable(comparison)}
        </div>
        <div class="panel segment-risk-panel">
          <div class="section-head">
            <div>
              <div class="source-label ai">Wniosek</div>
              <h2>Gdzie problem jest najmocniejszy</h2>
              <p>Wskazanie jest liczone tylko z grup spełniających próg publikacji.</p>
            </div>
          </div>
          ${renderStrongestSegmentProblem(comparison)}
        </div>
      </div>
    ${wrapperClose}
  `;
}

function filterHeatmap(heatmap, theme, area) {
  if (!heatmap.segment || !heatmap.scales.length) return heatmap;
  let allowedQuestions = null;
  if (area) {
    allowedQuestions = new Set(area.sourceQuestions || []);
  } else if (theme) {
    allowedQuestions = new Set([
      ...(theme.scaleQuestions || []).map((question) => question.name),
      ...(theme.comments || []).map((comment) => comment.question)
    ]);
  }
  if (!allowedQuestions) return heatmap;

  const indexes = heatmap.scales
    .map((scale, index) => {
      const isAllowed = allowedQuestions.has(scale.name) || (area && createReadableQuestionName(scale.name) === area.displayName);
      return isAllowed ? index : -1;
    })
    .filter((index) => index >= 0);

  return {
    ...heatmap,
    scales: indexes.map((index) => heatmap.scales[index]),
    rows: heatmap.rows.map((row) => {
      const cells = indexes.map((index) => row.cells[index]);
      return {
        ...row,
        count: Math.max(0, ...cells.map((cell) => cell?.count || 0)),
        cells
      };
    })
  };
}

function aggregateSmallHeatmapRows(rows, mode, threshold) {
  if (threshold <= 1) return rows;
  const visibleRows = rows.filter((row) => row.count >= threshold);
  const smallRows = rows.filter((row) => row.count < threshold);
  if (!smallRows.length) return rows;

  const cellCount = rows[0]?.cells?.length || 0;
  const aggregateRow = {
    group: `Małe segmenty (<${threshold})`,
    count: smallRows.reduce((sum, row) => sum + row.count, 0),
    cells: Array.from({ length: cellCount }, (_, index) => mergeHeatmapCells(smallRows.map((row) => row.cells[index]), mode))
  };
  return [...visibleRows, aggregateRow];
}

function mergeHeatmapCells(cells, mode) {
  if (mode === "categorical") {
    const counts = new Map();
    cells.forEach((cell) => {
      (cell?.distribution || []).forEach((item) => {
        const current = counts.get(item.answer) || 0;
        counts.set(item.answer, current + item.count);
      });
    });
    const distribution = [...counts.entries()]
      .map(([answer, count]) => ({ answer, count }))
      .sort((left, right) => right.count - left.count || left.answer.localeCompare(right.answer, "pl"));
    const total = distribution.reduce((sum, item) => sum + item.count, 0);
    const top = distribution[0];
    return {
      question: cells[0]?.question || "",
      value: null,
      count: total,
      label: top?.answer || "",
      percent: top && total ? Math.round((top.count / total) * 100) : null,
      distribution
    };
  }

  const numericCells = cells.filter((cell) => Number.isFinite(cell?.value) && cell.count > 0);
  const count = numericCells.reduce((sum, cell) => sum + cell.count, 0);
  return {
    question: cells[0]?.question || "",
    value: count ? numericCells.reduce((sum, cell) => sum + cell.value * cell.count, 0) / count : null,
    count
  };
}

function categoricalCellClass(cell) {
  if (!cell?.count) return "hm-low";
  if ((cell.percent || 0) >= 60) return "hm-good";
  if ((cell.percent || 0) >= 35) return "hm-mid";
  return "hm-low";
}

function formatCategoricalCell(cell) {
  if (!cell?.count) return "—";
  return `${shortLabel(cell.label || "Brak", 16)} ${cell.percent || 0}%`;
}

function formatHeatmapQuestionHeader(question, showFullQuestions) {
  return showFullQuestions ? escapeHtml(question) : shortLabel(question, 22);
}

function formatHeatmapCellTitle(cell, blocked, mode) {
  const question = cell?.question ? `Pytanie: ${cell.question}` : "Pytanie: brak";
  if (blocked) return `${question}\nUkryte, bo segment jest poniżej progu publikacji.`;
  if (mode === "categorical") {
    return `${question}\nRozkład: ${formatDistributionTitle(cell)}`;
  }
  return `${question}\nŚrednia: ${formatNumber(cell?.value)}; n=${cell?.count || 0}`;
}

function formatDistributionTitle(cell) {
  if (!cell?.distribution?.length) return "Brak odpowiedzi";
  return cell.distribution.map((item) => `${item.answer}: ${item.count}`).join(", ");
}

function renderSelectedQuestionSummary(theme, question, project) {
  if (!theme) {
    return `
      <div class="empty">
        Wybierz kategorię, żeby zobaczyć podsumowanie AI dla jej odpowiedzi.
      </div>
    `;
  }

  if (!question) {
    return `
      <div class="answer-ai-summary">
        <h3>${escapeHtml(theme.name)}</h3>
        <p class="summary-lead">${escapeHtml(theme.simplified)}</p>
        <div class="pill-row">
          <span class="pill">${theme.scaleQuestions.length} obszarów skalowych</span>
          <span class="pill">${theme.comments.length} komentarzy</span>
          <span class="pill">średnia ${formatNumber(theme.average)}</span>
        </div>
      </div>
    `;
  }

  const { scaleAnswers, comments, totalAnswers } = getAreaAnswerData(project, question);
  const summary = summarizeAreaAnswers(theme, question, scaleAnswers, comments);
  const modelSummaryKey = getModelSummaryKey(theme, question);
  const modelSummary = getStoredModelSummary(project, modelSummaryKey);
  const modelStatus = aiSummaryStatus.get(modelSummaryKey);

  return `
    <div class="answer-ai-summary">
      <h3>${escapeHtml(question.displayName)}</h3>
      <p class="summary-lead">${escapeHtml(summary.lead)}</p>
      ${summary.body ? `<p>${escapeHtml(summary.body)}</p>` : ""}
      ${(summary.sections || []).length ? `
        <div class="qualitative-summary">
          ${summary.sections.map((section) => `
            <section>
              <h4>${escapeHtml(section.title)}</h4>
              <p>${escapeHtml(section.text)}</p>
            </section>
          `).join("")}
        </div>
      ` : ""}
      ${summary.groups.length ? `
        <div class="summary-counts">
          ${summary.groups.map((group) => `
            <span class="summary-count ${group.tone || ""}">
              <strong>${escapeHtml(String(group.value))}</strong>
              <span>${escapeHtml(group.label)}</span>
            </span>
          `).join("")}
        </div>
      ` : ""}
      ${renderModelSummaryBlock(modelSummary, modelStatus, comments.length || totalAnswers)}
      <div class="pill-row">
        <span class="pill ${theme.color}">${escapeHtml(theme.name)}</span>
        <span class="pill">${totalAnswers} odpowiedzi</span>
        <span class="pill">${formatSourceQuestionCount(question.sourceQuestions.length)}</span>
      </div>
    </div>
  `;
}

function renderModelSummaryBlock(modelSummary, modelStatus, answerCount) {
  const loading = getModelStatusState(modelStatus) === "loading";
  const errorMessage = getModelStatusError(modelStatus);
  const hostedWarning = getHostedOllamaWarning(ollamaSettings.endpoint);
  const disabled = loading || !answerCount;
  return `
    <div class="model-summary">
      <div class="model-summary-head">
        <div>
          <strong>Pełniejsze podsumowanie modelu</strong>
          <span>${modelSummary ? `Wygenerowano: ${formatDateTime(modelSummary.generatedAt)}` : "Opcjonalne podsumowanie przez lokalny model Ollama."}</span>
        </div>
        <button class="button small" data-generate-ai-summary ${disabled ? "disabled" : ""}>
          ${modelStatus === "loading" ? "Generuję..." : modelSummary ? "Wygeneruj ponownie" : "Wygeneruj przez Ollama"}
        </button>
      </div>
      ${modelStatus === "error" ? `<p class="model-error">Nie udało się połączyć z lokalną Ollama.</p>` : ""}
      ${errorMessage ? `<p class="model-error">${escapeHtml(errorMessage)}</p>` : ""}
      <div class="ollama-settings">
        <label>
          <span>Adres Ollama</span>
          <input id="ollamaEndpoint" value="${escapeAttribute(ollamaSettings.endpoint)}" placeholder="http://localhost:11434">
        </label>
        <label>
          <span>Model lokalny</span>
          <input id="ollamaModel" value="${escapeAttribute(ollamaSettings.model)}" placeholder="gemma3">
        </label>
      </div>
      ${hostedWarning ? `<p class="ollama-hint">${escapeHtml(hostedWarning)}</p>` : ""}
      ${modelSummary ? `
        <div class="model-summary-content">
          <p class="summary-lead">${escapeHtml(modelSummary.summary.lead)}</p>
          <div class="qualitative-summary">
            ${(modelSummary.summary.sections || []).map((section) => `
              <section>
                <h4>${escapeHtml(section.title)}</h4>
                <p>${escapeHtml(section.text)}</p>
              </section>
            `).join("")}
          </div>
          ${(modelSummary.summary.recommendations || []).length ? `
            <div class="model-recommendations">
              <h4>Rekomendacje</h4>
              ${(modelSummary.summary.recommendations || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
            </div>
          ` : ""}
          <div class="pill-row">
            <span class="pill blue">model: ${escapeHtml(modelSummary.model || "Ollama")}</span>
            <span class="pill">pewność: ${escapeHtml(modelSummary.summary.confidence || "-")}</span>
          </div>
        </div>
      ` : `
        <p>Model przygotuje dłuższe podsumowanie odpowiedzi otwartych: główne wnioski, powtarzające się motywy, napięcia w odpowiedziach i rekomendacje do raportu.</p>
      `}
    </div>
  `;
}

function getModelStatusState(modelStatus) {
  if (!modelStatus) return "";
  if (typeof modelStatus === "string") return modelStatus;
  return modelStatus.state || "";
}

function getModelStatusError(modelStatus) {
  if (!modelStatus || typeof modelStatus === "string") return "";
  return modelStatus.error || "";
}

function formatModelApiError(status) {
  if (status === 404) return "Ollama nie znalazla wskazanego modelu. Pobierz go komenda: ollama pull gemma3 albo wpisz inna nazwe modelu.";
  if (status === 405) return "Ollama dziala, ale wybrany adres API nie przyjal zapytania. Sprawdz adres lokalny.";
  return "Nie udalo sie wygenerowac podsumowania przez lokalna Ollama.";
}

function getHostedOllamaWarning(endpoint) {
  if (!isHostedPageUsingLocalOllama(endpoint)) return "";
  return "Otwierasz aplikacje z Vercel. Zeby lokalna Ollama przyjela polaczenie z tej domeny, ustaw OLLAMA_ORIGINS dla goodhr-workbench.vercel.app albo otworz aplikacje lokalnie przez http://127.0.0.1:4173.";
}

function isHostedPageUsingLocalOllama(endpoint) {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;
  return isLocalOllamaEndpoint(endpoint);
}

function isLocalOllamaEndpoint(endpoint) {
  const normalized = String(endpoint || "").toLowerCase();
  return normalized.includes("localhost") || normalized.includes("127.0.0.1") || normalized.includes("[::1]");
}

function renderSelectedQuestionAnswers(theme, question, project) {
  if (!theme) {
    return `<div class="empty">Wybierz kategorię, żeby zobaczyć odpowiedzi respondentów.</div>`;
  }

  if (!question) {
    return `<div class="empty">Wybierz obszar pytania, żeby zobaczyć odpowiedzi respondentów.</div>`;
  }

  return renderAreaAnswerList(question, project);
}

function renderEvidenceAndRecommendations(theme, question, project) {
  if (!theme) {
    return `
      <div class="panel evidence-panel">
        <div class="section-head">
          <div>
            <div class="source-label data">Ślad dowodowy</div>
            <h2>Dowody i rekomendacje</h2>
            <p>Wybierz kategorię, żeby zobaczyć, z czego wynika wniosek i jakie działania można zaproponować klientowi.</p>
          </div>
        </div>
        <div class="empty">Brak wybranej kategorii.</div>
      </div>
    `;
  }

  const evidence = buildEvidencePack(theme, question, project);
  const actions = buildRecommendationActions(theme, question, evidence);

  return `
    <div class="panel evidence-panel">
      <div class="section-head">
        <div>
          <div class="source-label data">Ślad dowodowy</div>
          <h2>Dowody i rekomendacje</h2>
          <p>Każda teza ma liczebność, źródło, cytaty po redakcji oraz propozycję działania do zatwierdzenia przez konsultanta.</p>
        </div>
        <span class="pill ${evidence.readyForClient ? "teal" : "amber"}">${evidence.readyForClient ? "gotowe roboczo" : "do kontroli"}</span>
      </div>

      <div class="evidence-grid">
        <div class="evidence-card">
          <h3>Na czym opiera się wniosek</h3>
          <div class="evidence-stat-grid">
            <span><strong>${evidence.answerCount}</strong><small>odpowiedzi</small></span>
            <span><strong>${evidence.commentCount}</strong><small>komentarzy</small></span>
            <span><strong>${evidence.questionCount}</strong><small>pytań źródłowych</small></span>
            <span><strong>${evidence.segmentCount}</strong><small>segmentów</small></span>
          </div>
          <p>${escapeHtml(evidence.summary)}</p>
          <div class="pill-row">
            <span class="pill ${theme.color}">${escapeHtml(theme.name)}</span>
            <span class="pill">${escapeHtml(evidence.scopeLabel)}</span>
            <span class="pill ${evidence.piiCount ? "amber" : "teal"}">${evidence.piiCount ? `${evidence.piiCount} PII do kontroli` : "bez oczywistych PII"}</span>
          </div>
        </div>

        <div class="evidence-card">
          <h3>Przykładowe dowody</h3>
          <div class="evidence-quotes">
            ${evidence.quotes.length ? evidence.quotes.map((quote) => `
              <blockquote>
                <p>${escapeHtml(redactText(quote.text))}</p>
                <cite>${escapeHtml(quote.meta)}</cite>
              </blockquote>
            `).join("") : `<div class="empty compact-empty">Brak cytatów do pokazania dla tego zakresu.</div>`}
          </div>
        </div>
      </div>

      <div class="recommendation-grid">
        ${actions.map((action) => `
          <article class="recommendation-card ${action.tone}">
            <div class="topic-top">
              <span class="pill ${action.tone}">${escapeHtml(action.priority)}</span>
              <span class="pill">${escapeHtml(action.owner)}</span>
            </div>
            <h3>${escapeHtml(action.title)}</h3>
            <p>${escapeHtml(action.body)}</p>
            <small>${escapeHtml(action.evidence)}</small>
          </article>
        `).join("")}
      </div>
    </div>
  `;
}

function buildEvidencePack(theme, question, project) {
  const areaData = question ? getAreaAnswerData(project, question) : null;
  const comments = question ? areaData.comments : theme.comments || [];
  const scaleQuestions = question ? question.scaleQuestions || [] : theme.scaleQuestions || [];
  const scaleAnswerCount = question ? areaData.scaleAnswers.length : scaleQuestions.reduce((sum, item) => sum + (item.count || 0), 0);
  const answerCount = question ? areaData.totalAnswers : comments.length + scaleAnswerCount;
  const sourceQuestions = question ? question.sourceQuestions || [] : [
    ...new Set([
      ...scaleQuestions.map((item) => item.name),
      ...comments.map((item) => item.question)
    ])
  ];
  const segmentValues = new Set();
  comments.forEach((comment) => {
    Object.values(comment.segments || {}).forEach((value) => {
      if (value) segmentValues.add(String(value));
    });
  });

  const piiIds = new Set(detectPii(project).map((item) => item.comment.id));
  const piiCount = comments.filter((comment) => piiIds.has(comment.id)).length;
  const quoteLimit = question ? 4 : 5;
  const quotes = comments
    .filter((comment) => !piiIds.has(comment.id))
    .slice(0, quoteLimit)
    .map((comment) => ({
      text: comment.text,
      meta: [createReadableQuestionName(comment.question), formatSegments(comment.segments)].filter(Boolean).join(" · ")
    }));

  const averageValues = scaleQuestions
    .map((item) => item.average)
    .filter((value) => value !== null && value !== undefined);
  const average = averageValues.length
    ? averageValues.reduce((sum, value) => sum + value, 0) / averageValues.length
    : theme.average;
  const threshold = comments.length ? project.thresholds?.comments || 10 : project.thresholds?.numeric || 5;

  return {
    answerCount,
    commentCount: comments.length,
    questionCount: Math.max(1, sourceQuestions.length),
    segmentCount: segmentValues.size,
    piiCount,
    quotes,
    average,
    scopeLabel: question ? `Pytanie: ${question.displayName}` : "Cała kategoria",
    readyForClient: answerCount >= threshold && piiCount === 0,
    summary: summarizeEvidencePack(theme, question, answerCount, comments.length, average)
  };
}

function summarizeEvidencePack(theme, question, answerCount, commentCount, average) {
  const scope = question ? `wybranego pytania "${question.displayName}"` : `kategorii "${theme.name}"`;
  const averageText = average === null || average === undefined
    ? "brak wyniku liczbowego"
    : `średni wynik ${formatNumber(average)}`;
  const qualitativeText = commentCount
    ? `W części jakościowej jest ${commentCount} komentarzy, które można wykorzystać jako cytaty lub kontekst dla rekomendacji.`
    : "Dla tego zakresu nie ma komentarzy, więc rekomendacje opierają się głównie na rozkładzie odpowiedzi zamkniętych.";
  return `Wniosek dla ${scope} opiera się na ${answerCount} odpowiedziach. Sygnał ilościowy: ${averageText}. ${qualitativeText}`;
}

function buildRecommendationActions(theme, question, evidence) {
  const average = evidence.average;
  const tone = average !== null && average !== undefined && average < 3.2
    ? "coral"
    : average !== null && average !== undefined && average < 3.8
      ? "amber"
      : "teal";
  const scope = question ? question.displayName : theme.name;
  const owner = chooseRecommendationOwner(theme.name, scope);
  const actions = [
    {
      priority: tone === "coral" ? "wysoki priorytet" : tone === "amber" ? "średni priorytet" : "utrzymać",
      owner,
      tone,
      title: tone === "teal" ? "Utrzymać mocny obszar" : "Zrobić krótką diagnozę przyczyn",
      body: tone === "teal"
        ? `W obszarze "${scope}" warto utrzymać obecne praktyki i zebrać przykłady działań, które działają najlepiej.`
        : `Dla obszaru "${scope}" przygotuj krótką rozmowę z reprezentatywnymi grupami i sprawdź, które procesy lub decyzje najmocniej wpływają na wynik.`,
      evidence: `${evidence.answerCount} odpowiedzi, ${evidence.commentCount} komentarzy, ${evidence.questionCount} pytań źródłowych.`
    },
    {
      priority: "kontrola danych",
      owner: "Konsultant / HR",
      tone: evidence.readyForClient ? "teal" : "amber",
      title: "Zweryfikować cytaty przed raportem",
      body: evidence.readyForClient
        ? "Cytaty wyglądają roboczo bezpiecznie, ale przed pokazaniem klientowi warto sprawdzić kontekst małych grup."
        : "Przed raportem sprawdź PII, małe grupy i cytaty, bo automatyczna anonimizacja nie daje pełnej gwarancji bezpieczeństwa.",
      evidence: evidence.piiCount ? `${evidence.piiCount} cytatów wymaga kontroli PII.` : "Brak oczywistych PII w cytatach dla tego zakresu."
    }
  ];

  if (evidence.answerCount) {
    actions.push({
      priority: "następny krok",
      owner,
      tone: "blue",
      title: "Zamienić insight w działanie",
      body: `Dla "${scope}" przygotuj jedną konkretną decyzję, właściciela i termin sprawdzenia efektu w kolejnej fali badania.`,
      evidence: "Rekomendacja wynika z połączenia danych ilościowych i komentarzy widocznych w śladzie dowodowym."
    });
  }

  return actions;
}

function chooseRecommendationOwner(themeName, scope) {
  const normalized = normalizeForLabel(`${themeName} ${scope}`);
  if (normalized.includes("sprzet") || normalized.includes("narzedz") || normalized.includes("it") || normalized.includes("infrastruktur")) return "IT / Operations";
  if (normalized.includes("komunik") || normalized.includes("wspolprac")) return "Liderzy zespołów";
  if (normalized.includes("mened") || normalized.includes("przeloz")) return "HR BP / Managerowie";
  if (normalized.includes("rozwoj") || normalized.includes("sciezk")) return "HR / L&D";
  return "HR / właściciel obszaru";
}

function renderAreaAnswerList(area, project) {
  const { scaleAnswers, comments, totalAnswers, piiCommentIds } = getAreaAnswerData(project, area);
  const visibleScaleAnswers = scaleAnswers.slice(0, SCALE_ANSWER_RENDER_LIMIT);
  const visibleComments = comments.slice(0, COMMENT_RENDER_LIMIT);
  const hiddenAnswerCount = Math.max(0, totalAnswers - visibleScaleAnswers.length - visibleComments.length);

  return `
    <div class="answer-panel">
      <div class="response-list-head">
        <div class="source-label respondent">Surowe odpowiedzi</div>
        <span>${totalAnswers} odpowiedzi dla obszaru: ${escapeHtml(area.displayName)}</span>
      </div>
      <div class="answer-list">
        ${visibleScaleAnswers.map((answer) => `
          <article class="answer-row">
            <strong>${escapeHtml(String(answer.value))}</strong>
            <span>${escapeHtml(answer.question)}</span>
            <small>${escapeHtml(formatSegments(answer.segments))}</small>
          </article>
        `).join("")}
        ${visibleComments.map((comment) => {
          const hasPii = piiCommentIds.has(comment.id);
          return `
            <article class="comment-card">
              <p class="comment-answer">${escapeHtml(redactText(comment.text))}</p>
              <div class="comment-meta">
                <span class="${hasPii ? "warn" : "ok"}">${hasPii ? "do kontroli PII" : "po redakcji"}</span>
                ${formatSegments(comment.segments) ? `<span>${escapeHtml(formatSegments(comment.segments))}</span>` : ""}
              </div>
            </article>
          `;
        }).join("")}
        ${hiddenAnswerCount ? `<div class="empty compact-empty">Pokazano pierwsze ${visibleScaleAnswers.length + visibleComments.length} z ${totalAnswers} odpowiedzi. Wszystkie odpowiedzi nadal sa uwzgledniane w analizie i podsumowaniu.</div>` : ""}
        ${totalAnswers ? "" : `<div class="empty">Brak odpowiedzi w tym obszarze.</div>`}
      </div>
    </div>
  `;
}

function getModelSummaryKey(theme, question) {
  return [theme?.id || "theme", question?.value || question?.displayName || "question"]
    .join("::")
    .replace(/\s+/g, " ")
    .trim();
}

function getStoredModelSummary(project, key) {
  return project.aiSummaries?.[key] || null;
}

function buildModelSummaryPayload(project, theme, question) {
  const { scaleAnswers, comments, totalAnswers } = getAreaAnswerData(project, question);
  const commentAnswers = comments
    .map((comment) => redactText(comment.text))
    .filter(Boolean);
  const fallbackAnswers = scaleAnswers
    .map((answer) => String(answer.value || "").trim())
    .filter(Boolean);
  const answers = commentAnswers.length ? commentAnswers : fallbackAnswers;

  return {
    category: theme.name,
    question: question.displayName,
    sourceQuestions: question.sourceQuestions || [],
    answerCount: totalAnswers,
    answers
  };
}

async function generateOllamaSummary(payload) {
  readOllamaSettingsFromDom();
  const endpoint = normalizeOllamaEndpoint(ollamaSettings.endpoint);
  const model = ollamaSettings.model || "gemma3";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        system: [
          "Jestes analitykiem HR wspierajacym konsultanta w analizie ankiet pracowniczych.",
          "Analizujesz wylacznie zagregowane odpowiedzi, bez oceniania pojedynczych osob.",
          "Nie rozpoznajesz emocji respondentow i nie tworzysz profili psychologicznych.",
          "Pisz po polsku, konkretnie i raportowo."
        ].join(" "),
        prompt: buildOllamaSummaryPrompt(payload),
        options: {
          temperature: 0.2,
          num_predict: 1200
        }
      })
    });
  } catch (error) {
    const hostedHint = isHostedPageUsingLocalOllama(endpoint)
      ? " Jesli chcesz uzywac wersji Vercel, ustaw OLLAMA_ORIGINS dla domeny https://goodhr-workbench.vercel.app i zrestartuj Ollama."
      : "";
    const timeoutHint = error?.name === "AbortError"
      ? " Ollama nie odpowiedziala w 120 sekund. Sprobuj mniejszego modelu albo krotszego zestawu odpowiedzi."
      : "";
    throw new Error(`Nie udalo sie polaczyc z lokalna Ollama pod adresem ${endpoint}. Uruchom Ollama i pobierz model: ollama pull ${model}.${hostedHint}${timeoutHint}`);
  } finally {
    window.clearTimeout(timeoutId);
  }

  const raw = await response.text();
  const data = parseJsonSafe(raw) || {};
  if (!response.ok) {
    throw new Error(formatOllamaApiError(response.status, data.error || raw, endpoint, model));
  }

  const parsed = parseOllamaSummaryText(data.response || raw);
  return {
    model: data.model || model,
    generatedAt: data.created_at || new Date().toISOString(),
    summary: normalizeOllamaSummary(parsed, payload)
  };
}

function buildOllamaSummaryPrompt(payload) {
  const answers = (payload.answers || []).slice(0, 80);
  return [
    "Przygotuj podsumowanie odpowiedzi ankietowych dla konsultanta HR.",
    "Zwroc wylacznie poprawny JSON bez markdowna i bez komentarzy poza JSON.",
    "Schemat JSON:",
    '{"lead":"krotki wniosek","sections":[{"title":"Nazwa sekcji","text":"2-4 zdania"}],"recommendations":["rekomendacja"],"confidence":"niska|srednia|wysoka"}',
    "",
    `Kategoria: ${payload.category || "Brak kategorii"}`,
    `Pytanie: ${payload.question || "Brak pytania"}`,
    `Liczba odpowiedzi: ${payload.answerCount || answers.length}`,
    `Pytania zrodlowe: ${(payload.sourceQuestions || []).join(" | ") || "brak"}`,
    "",
    "Odpowiedzi respondentow:",
    ...answers.map((answer, index) => `${index + 1}. ${answer}`)
  ].join("\n");
}

function parseOllamaSummaryText(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const direct = parseJsonSafe(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return parseJsonSafe(cleaned.slice(start, end + 1));
  return null;
}

function normalizeOllamaSummary(summary, payload) {
  const source = summary && typeof summary === "object" ? summary : {};
  const sections = Array.isArray(source.sections) ? source.sections : [];
  return {
    lead: String(source.lead || `Lokalny model podsumowal ${payload.answerCount || payload.answers?.length || 0} odpowiedzi dla pytania "${payload.question || "brak pytania"}".`).trim(),
    sections: sections
      .filter((section) => section && (section.title || section.text))
      .slice(0, 5)
      .map((section, index) => ({
        title: String(section.title || `Wniosek ${index + 1}`).trim(),
        text: String(section.text || "").trim()
      })),
    recommendations: Array.isArray(source.recommendations)
      ? source.recommendations.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
      : [],
    confidence: ["niska", "srednia", "średnia", "wysoka"].includes(String(source.confidence || "").toLowerCase())
      ? String(source.confidence).replace("średnia", "srednia")
      : "srednia"
  };
}

function parseJsonSafe(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function formatOllamaApiError(status, message, endpoint, model) {
  const details = String(message || "").trim().slice(0, 220);
  if (status === 404) return `Ollama nie znalazla modelu "${model}". Pobierz go komenda: ollama pull ${model}.`;
  if (status === 405) return `Ollama dziala, ale endpoint nie przyjal zapytania. Sprawdz adres: ${endpoint}.`;
  return details ? `Ollama zwrocila blad ${status}: ${details}` : `Ollama zwrocila blad ${status}.`;
}

function normalizeOllamaEndpoint(value) {
  return String(value || "http://localhost:11434").trim().replace(/\/+$/, "");
}

function readOllamaSettingsFromDom() {
  const endpointInput = app.querySelector("#ollamaEndpoint");
  const modelInput = app.querySelector("#ollamaModel");
  const nextSettings = {
    endpoint: normalizeOllamaEndpoint(endpointInput?.value || ollamaSettings.endpoint || "http://localhost:11434"),
    model: String(modelInput?.value || ollamaSettings.model || "gemma3").trim() || "gemma3"
  };
  ollamaSettings = nextSettings;
  localStorage.setItem(OLLAMA_SETTINGS_KEY, JSON.stringify(nextSettings));
}

async function generateModelSummary(project) {
  const baseAiInsights = getAiAnswerInsights(project);
  const aiInsights = applyProjectTaxonomy(project, baseAiInsights);
  const theme = getSelectedAnalysisTheme(aiInsights.themes);
  const questionOptions = getQuestionOptionsForTheme(theme);
  const question = getSelectedAnalysisQuestion(questionOptions);
  if (!theme || !question) {
    toast("Najpierw wybierz kategorię i obszar pytania.");
    return;
  }

  const key = getModelSummaryKey(theme, question);
  aiSummaryStatus.set(key, "loading");
  render();

  try {
    const data = await generateOllamaSummary(buildModelSummaryPayload(project, theme, question));
    const response = { ok: true, status: 200 };
    if (!response.ok && !data.error) data.error = formatModelApiError(response.status);
    if (!response.ok) throw new Error(data.error || "Nie udało się wygenerować podsumowania AI.");

    project.aiSummaries = project.aiSummaries || {};
    project.aiSummaries[key] = {
      generatedAt: data.generatedAt || new Date().toISOString(),
      model: data.model || ollamaSettings.model || "Ollama",
      summary: data.summary
    };
    upsertProject(state, project);
    toast("Podsumowanie modelu zostało wygenerowane.");
  } catch (error) {
    aiSummaryStatus.set(key, {
      state: "error",
      error: error.message || "Nie udalo sie wygenerowac podsumowania AI."
    });
    toast(error.message || "Nie udało się wygenerować podsumowania AI.");
  } finally {
    if (getModelStatusState(aiSummaryStatus.get(key)) === "loading") aiSummaryStatus.delete(key);
    render();
  }
}

function getAreaAnswerData(project, area) {
  const scaleAnswers = collectScaleAnswerRows(project, area);
  const comments = area.comments || [];
  const totalAnswers = scaleAnswers.length + comments.length;
  const pii = detectPii(project);
  const piiCommentIds = new Set(pii.map((item) => item.comment.id));
  return { scaleAnswers, comments, totalAnswers, piiCommentIds };
}

function collectScaleAnswerRows(project, area) {
  const segmentColumns = getColumns(project, "segment");
  const questionColumn = getColumns(project, "question_text")[0];
  const textAnswerColumns = [...getColumns(project, "answer_text"), ...getColumns(project, "comment")];
  const valueAnswerColumns = [...getColumns(project, "answer_value"), ...getColumns(project, "scale")];

  if (questionColumn && valueAnswerColumns.length) {
    if (textAnswerColumns.length) return [];
    const sourceQuestions = new Set(area.sourceQuestions || []);
    return (project.responses || [])
      .filter((row) => sourceQuestions.has(String(row[questionColumn.name] || "").trim()))
      .flatMap((row) => valueAnswerColumns.map((column) => ({
        question: row[questionColumn.name],
        value: row[column.name],
        segments: Object.fromEntries(segmentColumns.map((segment) => [segment.name, row[segment.name] || ""]))
      })))
      .filter((answer) => String(answer.value || "").trim());
  }

  return (area.scaleQuestions || []).flatMap((question) => {
    return (project.responses || [])
      .map((row) => ({
        question: question.name,
        value: row[question.name],
        segments: Object.fromEntries(segmentColumns.map((segment) => [segment.name, row[segment.name] || ""]))
      }))
      .filter((answer) => String(answer.value || "").trim());
  });
}

function renderAnalysisFilters(project, aiInsights, questionOptions, selectedQuestion) {
  const themeOptions = aiInsights.themes.map((theme) => ({
    value: theme.id,
    label: theme.name
  }));
  const activeTheme = themeOptions.find((theme) => theme.value === analysisFilters.category);

  return `
    <div class="panel analysis-controls">
      <div class="section-head">
        <div>
          <h2>Filtry wyników</h2>
          <p>Najpierw wybierz kategorię, potem obszar pytania przypisany do tej kategorii. Wyniki po prawej pokażą odpowiedzi i podsumowanie.</p>
        </div>
        <div class="filter-actions">
          ${analysisFilters.category !== "__all" ? `<button class="button" id="clearThemeFilter">Pokaż wszystkie kategorie</button>` : ""}
          <button class="button" id="resetAnalysisFilters">Wyczyść filtry</button>
        </div>
      </div>
      <div class="filter-grid simple-filter-grid">
        <div class="field">
          <label for="analysisCategory">Kategoria</label>
          <select id="analysisCategory">
            <option value="__all">Wybierz kategorię</option>
            ${themeOptions.map((theme) => `<option value="${escapeAttribute(theme.value)}" ${analysisFilters.category === theme.value ? "selected" : ""}>${escapeHtml(theme.label)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="analysisQuestion">Obszar pytania</label>
          <select id="analysisQuestion" ${activeTheme ? "" : "disabled"}>
            <option value="__all">${activeTheme ? "Wybierz obszar pytania" : "Najpierw wybierz kategorię"}</option>
            ${questionOptions.map((question) => `<option value="${escapeAttribute(question.value)}" ${analysisFilters.question === question.value ? "selected" : ""}>${escapeHtml(question.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="filter-summary">
        <span class="pill teal">${project.responses.length} odpowiedzi w ankiecie</span>
        <span class="pill">${activeTheme ? `Kategoria: ${activeTheme.label}` : "Wybierz kategorię"}</span>
        <span class="pill">${selectedQuestion ? `Obszar pytania: ${selectedQuestion.displayName}` : "Wybierz obszar pytania"}</span>
      </div>
    </div>
  `;
}

function renderTaxonomyEditor(project, baseAiInsights, aiInsights) {
  const taxonomy = getProjectTaxonomy(project);
  const finalNames = getTaxonomyFinalNames(baseAiInsights, taxonomy);
  const baseThemeById = new Map(baseAiInsights.themes.map((theme) => [theme.id, theme]));

  return `
    <div class="panel taxonomy-editor">
      <div class="section-head">
        <div>
          <h2>Edytor taksonomii tematów</h2>
          <p>AI tworzy robocze tagi, a tutaj ustawiasz ostateczne kategorie konsultanta używane w wynikach i raporcie.</p>
        </div>
        <div class="filter-actions">
          <button class="button" id="addTaxonomyCategory">Dodaj kategorię</button>
          <button class="button" id="resetTaxonomy">Reset</button>
        </div>
      </div>

      <div class="taxonomy-grid">
        <div>
          <div class="eyebrow">Tagi AI i kategorie końcowe</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Tag AI</th><th>Kategoria końcowa</th><th>Zakres</th></tr></thead>
              <tbody>
                ${baseAiInsights.themes.map((theme) => {
                  const finalName = taxonomy.themeNames?.[theme.id] || theme.name;
                  return `
                    <tr>
                      <td>${escapeHtml(theme.name)}</td>
                      <td><input data-taxonomy-theme-name="${escapeAttribute(theme.id)}" data-default-name="${escapeAttribute(theme.name)}" value="${escapeAttribute(finalName)}" /></td>
                      <td><small>${theme.scaleQuestions.length} pytań · ${theme.comments.length} komentarzy</small></td>
                    </tr>
                  `;
                }).join("")}
                ${(taxonomy.customCategories || []).map((category) => `
                  <tr>
                    <td><span class="pill blue">konsultant</span></td>
                    <td><input data-taxonomy-custom-name="${escapeAttribute(category.id)}" value="${escapeAttribute(category.name)}" /></td>
                    <td><button class="button small" data-delete-taxonomy-custom="${escapeAttribute(category.id)}">Usuń</button></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <div class="eyebrow">Przypisanie pytań</div>
          <div class="table-wrap taxonomy-question-table">
            <table>
              <thead><tr><th>Pytanie</th><th>Tag AI</th><th>Kategoria końcowa</th></tr></thead>
              <tbody>
                ${baseAiInsights.scaleItems.map((item) => {
                  const baseTheme = baseThemeById.get(item.themeId);
                  const defaultName = baseTheme ? (taxonomy.themeNames?.[baseTheme.id] || baseTheme.name) : item.themeName;
                  const selected = taxonomy.questionThemeNames?.[item.name] || defaultName;
                  return `
                    <tr>
                      <td>${escapeHtml(createReadableQuestionName(item.name))}</td>
                      <td><small>${escapeHtml(baseTheme?.name || item.themeName)}</small></td>
                      <td>
                        <select data-taxonomy-question-theme="${escapeAttribute(item.name)}" data-default-theme="${escapeAttribute(defaultName)}">
                          ${finalNames.map((name) => `<option value="${escapeAttribute(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}
                        </select>
                      </td>
                    </tr>
                  `;
                }).join("") || `<tr><td colspan="3">Brak pytań skalowych do przypisania.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="filter-summary">
        <span class="pill teal">${aiInsights.themes.length} kategorii końcowych z danymi</span>
        <span class="pill">AI tagi pozostają widoczne tylko jako źródło klasyfikacji</span>
      </div>
    </div>
  `;
}

function renderTaxonomy(project) {
  const baseAiInsights = getAiAnswerInsights(project);
  const aiInsights = applyProjectTaxonomy(project, baseAiInsights);

  return `
    <section class="view active taxonomy-view">
      <div class="section-head">
        <div>
          <h2>Taksonomia tematów</h2>
          <p>To osobna przestrzeń do porządkowania kategorii. Wyniki korzystają z kategorii końcowych zapisanych tutaj.</p>
        </div>
      </div>
      ${renderTaxonomyEditor(project, baseAiInsights, aiInsights)}
    </section>
  `;
}

function applyProjectTaxonomy(project, aiInsights) {
  const taxonomy = getProjectTaxonomy(project);
  const themeById = new Map(aiInsights.themes.map((theme) => [theme.id, theme]));
  const finalThemes = new Map();

  function ensureFinalTheme(name, sourceTheme = {}) {
    const finalName = String(name || "Inne obserwacje").trim() || "Inne obserwacje";
    const id = taxonomyThemeId(finalName);
    if (!finalThemes.has(id)) {
      finalThemes.set(id, {
        id,
        name: finalName,
        color: sourceTheme.color || "muted",
        tone: sourceTheme.tone || "mieszane",
        scaleQuestions: [],
        comments: [],
        average: null,
        simplified: "",
        confidence: "niska",
        aiSourceNames: new Set()
      });
    }
    if (sourceTheme.name) finalThemes.get(id).aiSourceNames.add(sourceTheme.name);
    return finalThemes.get(id);
  }

  (taxonomy.customCategories || []).forEach((category) => ensureFinalTheme(category.name));

  const scaleItems = aiInsights.scaleItems.map((item) => {
    const sourceTheme = themeById.get(item.themeId);
    const finalName = taxonomy.questionThemeNames?.[item.name] || taxonomy.themeNames?.[item.themeId] || item.themeName;
    const finalTheme = ensureFinalTheme(finalName, sourceTheme);
    const enriched = {
      ...item,
      themeId: finalTheme.id,
      themeName: finalTheme.name,
      aiThemeName: sourceTheme?.name || item.themeName
    };
    finalTheme.scaleQuestions.push(enriched);
    return enriched;
  });

  aiInsights.themes.forEach((theme) => {
    const finalName = taxonomy.themeNames?.[theme.id] || theme.name;
    const finalTheme = ensureFinalTheme(finalName, theme);
    finalTheme.comments.push(...theme.comments);
  });

  const themes = [...finalThemes.values()]
    .map((theme) => {
      const values = theme.scaleQuestions
        .map((question) => question.average)
        .filter((value) => value !== null && value !== undefined);
      const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      return {
        ...theme,
        aiSourceNames: [...theme.aiSourceNames],
        average,
        confidence: getTaxonomyConfidence(theme.scaleQuestions.length, theme.comments.length),
        simplified: summarizeFinalTheme(theme, average)
      };
    })
    .filter((theme) => theme.scaleQuestions.length > 0 || theme.comments.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pl"));

  return { themes, scaleItems };
}

function getProjectTaxonomy(project) {
  return project.taxonomy || { themeNames: {}, questionThemeNames: {}, customCategories: [] };
}

function ensureMutableTaxonomy(project) {
  project.taxonomy = {
    themeNames: { ...(project.taxonomy?.themeNames || {}) },
    questionThemeNames: { ...(project.taxonomy?.questionThemeNames || {}) },
    customCategories: [...(project.taxonomy?.customCategories || [])]
  };
  return project.taxonomy;
}

function getTaxonomyFinalNames(aiInsights, taxonomy) {
  const names = new Set();
  aiInsights.themes.forEach((theme) => names.add(taxonomy.themeNames?.[theme.id] || theme.name));
  (taxonomy.customCategories || []).forEach((category) => {
    if (category.name) names.add(category.name);
  });
  return [...names].sort((a, b) => a.localeCompare(b, "pl"));
}

function taxonomyThemeId(name) {
  return `tax-${normalizeForLabel(name).replace(/[^a-z0-9]+/g, "-") || "inne"}`;
}

function getTaxonomyConfidence(questionCount, commentCount) {
  const score = questionCount * 2 + Math.min(6, commentCount);
  if (score >= 8) return "wysoka";
  if (score >= 4) return "średnia";
  return "niska";
}

function summarizeFinalTheme(theme, average) {
  const aiSources = theme.aiSourceNames?.length ? ` Źródła AI: ${theme.aiSourceNames.join(", ")}.` : "";
  const commentPart = theme.comments.length
    ? ` W komentarzach znaleziono ${theme.comments.length} powiązanych wypowiedzi.`
    : " Brakuje jeszcze komentarzy, które wyjaśniają ten wynik.";
  if (average === null || average === undefined) {
    return `Kategoria końcowa opiera się głównie na wypowiedziach otwartych.${commentPart}${aiSources}`;
  }
  if (average < 3.2) {
    return `Kategoria końcowa wymaga uwagi, bo wyniki skalowe są niskie.${commentPart}${aiSources}`;
  }
  if (average < 3.8) {
    return `Kategoria końcowa ma mieszany sygnał i wymaga sprawdzenia segmentów.${commentPart}${aiSources}`;
  }
  return `Kategoria końcowa wygląda względnie dobrze w liczbach.${commentPart}${aiSources}`;
}

function renderPrivacy(project) {
  const summary = getMetricSummary(project);
  const pii = detectPii(project);
  const numericThreshold = project.thresholds?.numeric || 5;
  const commentThreshold = project.thresholds?.comments || 10;
  const segments = getSmallSegments(project, numericThreshold);
  const needsReview = pii.length > 0 || segments.length > 0;
  const reviewRows = [
    ...pii.map((item) => `
      <tr>
        <td>PII w komentarzu</td>
        <td><mark>${escapeHtml(item.match)}</mark></td>
        <td>${escapeHtml(item.comment.question)}</td>
      </tr>
    `),
    ...segments.map(([name, count]) => `
      <tr>
        <td>Mała grupa</td>
        <td>${escapeHtml(name)} (${count}/${numericThreshold})</td>
        <td>Nie pokazuj wyniku segmentu, dopóki grupa jest poniżej progu.</td>
      </tr>
    `)
  ].join("");

  return `
    <section class="view active control-view">
      <div class="panel control-hero">
        <div class="section-head">
          <div>
            <h2>Kontrola danych przed raportem</h2>
            <p>Ten widok służy do sprawdzenia, czy dane można bezpiecznie pokazać w wynikach i raporcie: bez danych osobowych, bez zbyt małych grup i z jasnymi progami publikacji.</p>
          </div>
          <span class="pill ${needsReview ? "amber" : "teal"}">${needsReview ? "wymaga sprawdzenia" : "gotowe roboczo"}</span>
        </div>
        <div class="control-checks">
          <div class="control-card ${pii.length ? "warn" : "ok"}">
            <span class="pill ${pii.length ? "amber" : "teal"}">1. Dane osobowe</span>
            <strong>${pii.length ? `${pii.length} fragmentów do kontroli` : "Brak oczywistych wykryć"}</strong>
            <p>Sprawdź, czy komentarze nie zawierają imion, maili, telefonów albo innych danych pozwalających rozpoznać osobę.</p>
          </div>
          <div class="control-card ${segments.length ? "warn" : "ok"}">
            <span class="pill ${segments.length ? "amber" : "teal"}">2. Małe grupy</span>
            <strong>${segments.length ? `${segments.length} grup poniżej progu` : "Segmenty spełniają próg"}</strong>
            <p>Wyniki segmentów poniżej ${numericThreshold} osób powinny być ukryte albo połączone z większą grupą.</p>
          </div>
          <div class="control-card ok">
            <span class="pill blue">3. Progi raportu</span>
            <strong>${numericThreshold} osób / ${commentThreshold} komentarzy</strong>
            <p>Te wartości decydują, kiedy wolno pokazywać wyniki liczbowe i cytaty w raporcie.</p>
          </div>
        </div>
      </div>

      <div class="grid cols-3">
        ${metric("Status danych", needsReview ? "Do przeglądu" : "OK", `${summary.readiness}% gotowości roboczej`)}
        ${metric("PII", summary.pii, "fragmenty komentarzy do sprawdzenia")}
        ${metric("Małe grupy", segments.length, `poniżej progu ${numericThreshold} osób`)}
      </div>

      <div class="grid wide-right control-grid">
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Progi widoczności</h2>
              <p>Ustaw minimalne liczebności, poniżej których aplikacja powinna ukrywać wyniki albo cytaty.</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="numericThreshold">Próg wyników liczbowych</label>
              <input id="numericThreshold" type="number" min="2" max="30" value="${numericThreshold}" />
            </div>
            <div class="field">
              <label for="commentThreshold">Próg komentarzy</label>
              <input id="commentThreshold" type="number" min="2" max="30" value="${commentThreshold}" />
            </div>
            <button class="primary" id="saveThresholds">Zapisz progi</button>
          </div>
        </div>
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Elementy do sprawdzenia</h2>
              <p>Lista pokazuje tylko rzeczy, które mogą wymagać decyzji przed raportem.</p>
            </div>
          </div>
          <div class="table-wrap" style="margin-top: 12px;">
            <table>
              <thead><tr><th>Co sprawdzić</th><th>Fragment lub grupa</th><th>Co zrobić</th></tr></thead>
              <tbody>
                ${reviewRows || `<tr><td colspan="3">Brak elementów wymagających kontroli przy obecnych progach.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderReport(project) {
  const deck = project.reportDeck;
  const activeSlide = getActiveReportSlide(project);
  const visibleSlides = getVisibleReportSlides(project);

  return `
    <section class="view active report-workbench report-editor-view">
      ${reportPresentationMode && visibleSlides.length ? renderReportPresentation(project, visibleSlides) : ""}

      <div class="report-deck-layout">
        <aside class="report-outline">
          <div class="report-outline-head">
            <div class="eyebrow">Slajdy</div>
            <span>${deck?.slides?.length || 0}</span>
          </div>
          ${deck?.slides?.length ? deck.slides.map((slide, index) => `
            <a class="report-outline-item ${slide.id === activeSlide?.id ? "active" : ""} ${slide.hidden ? "hidden" : ""}" href="#slide-${escapeAttribute(slide.id)}" data-select-report-slide="${escapeAttribute(slide.id)}">
              <span>${index + 1}</span>
              <strong>
                ${escapeHtml(slide.title || "Slajd")}
                <small>${escapeHtml(getReportSlideStatusMeta(slide.status).label)}${slide.hidden ? " · ukryty" : ""}</small>
              </strong>
            </a>
          `).join("") : `<div class="empty compact-empty">Wygeneruj raport, żeby zobaczyć listę slajdów.</div>`}
        </aside>

        <div class="report-slide-stack">
          ${deck?.slides?.length ? deck.slides.map((slide, index) => renderReportSlide(slide, index, project)).join("") : `
            <div class="empty report-empty">
              Raport slajdowy nie został jeszcze wygenerowany dla tej ankiety.
            </div>
          `}
        </div>

        ${renderReportPropertiesPanel(project, activeSlide)}
      </div>
    </section>
  `;
}

function getActiveReportSlide(project) {
  const slides = project.reportDeck?.slides || [];
  if (!slides.length) {
    activeReportSlideId = "";
    return null;
  }
  const active = slides.find((slide) => slide.id === activeReportSlideId) || slides[0];
  activeReportSlideId = active.id;
  return active;
}

function selectReportSlide(project, slideId, shouldScroll = true) {
  const slide = project.reportDeck?.slides?.find((item) => item.id === slideId);
  if (!slide) return;
  activeReportSlideId = slide.id;
  render();
  if (!shouldScroll) return;
  window.setTimeout(() => {
    document.getElementById(`slide-${slide.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, 0);
}

function activateReportSlideInPlace(project, slideId) {
  const slides = project.reportDeck?.slides || [];
  const slide = slides.find((item) => item.id === slideId);
  if (!slide) return false;
  activeReportSlideId = slide.id;
  syncReportActiveSlideUi(project);
  return true;
}

function syncReportActiveSlideUi(project) {
  const slides = project.reportDeck?.slides || [];
  const activeSlide = slides.find((slide) => slide.id === activeReportSlideId) || slides[0];
  if (!activeSlide) return;
  const activeIndex = slides.findIndex((slide) => slide.id === activeSlide.id);
  const slideCount = slides.length;
  const activeLayout = normalizeReportSlideLayout(activeSlide.layout);
  const activeTheme = normalizeReportSlideTheme(activeSlide.theme || getReportDeckSettings(project).theme);
  const activeStatus = normalizeReportSlideStatus(activeSlide.status);

  app.querySelectorAll(".report-slide[data-slide-id]").forEach((slideElement) => {
    slideElement.classList.toggle("active", slideElement.dataset.slideId === activeSlide.id);
  });

  app.querySelectorAll("[data-select-report-slide]").forEach((link) => {
    link.classList.toggle("active", link.dataset.selectReportSlide === activeSlide.id);
  });

  const activeSelect = app.querySelector("#activeReportSlideSelect");
  if (activeSelect) activeSelect.value = activeSlide.id;

  const summary = app.querySelector("[data-report-active-summary]");
  if (summary) summary.textContent = `${slideCount} slajdów · aktywny automatycznie: ${activeIndex + 1}`;

  const ribbon = app.querySelector(".report-ribbon");
  updateRibbonSlideAction(ribbon, "move-up", "moveReportSlide", activeSlide.id, activeIndex > 0);
  updateRibbonSlideAction(ribbon, "move-down", "moveReportSlide", activeSlide.id, activeIndex >= 0 && activeIndex < slideCount - 1);
  updateRibbonSlideAction(ribbon, "duplicate", "duplicateReportSlide", activeSlide.id, true);
  updateRibbonSlideAction(ribbon, "hidden-toggle", "toggleReportSlideHidden", activeSlide.id, true);
  updateRibbonSlideAction(ribbon, "add-item", "addReportItem", activeSlide.id, canAddReportSlideItem(activeSlide));
  updateRibbonSlideAction(ribbon, "delete", "deleteReportSlide", activeSlide.id, true);

  const hiddenToggle = ribbon?.querySelector('[data-active-slide-action="hidden-toggle"]');
  if (hiddenToggle) hiddenToggle.textContent = activeSlide.hidden ? "Pokaż" : "Ukryj";

  syncActiveSlideSelectControl(ribbon, "layout", "reportSlideLayout", activeSlide.id, activeLayout);
  syncActiveSlideSelectControl(ribbon, "theme", "reportSlideTheme", activeSlide.id, activeTheme);
  syncActiveSlideSelectControl(ribbon, "status", "reportSlideStatus", activeSlide.id, activeStatus);

  const properties = app.querySelector(".report-properties");
  if (properties) {
    properties.outerHTML = renderReportPropertiesPanel(project, activeSlide);
    bindReportPropertiesPanelEvents(project);
  }
}

function updateRibbonSlideAction(ribbon, action, datasetKey, slideId, enabled) {
  const button = ribbon?.querySelector(`[data-active-slide-action="${action}"]`);
  if (!button) return;
  button.dataset[datasetKey] = slideId;
  button.disabled = !enabled;
}

function syncActiveSlideSelectControl(ribbon, control, datasetKey, slideId, value) {
  const select = ribbon?.querySelector(`[data-active-slide-control="${control}"]`);
  if (!select) return;
  select.dataset[datasetKey] = slideId;
  select.value = value;
  select.disabled = false;
}

function getReportSlideIdClosestToViewport() {
  const content = app.querySelector(".content");
  const slides = [...app.querySelectorAll(".report-slide[data-slide-id]")];
  if (!content || !slides.length) return "";

  const contentRect = content.getBoundingClientRect();
  const anchorY = Math.min(contentRect.bottom, contentRect.top + 120);
  let bestSlideId = "";
  let bestScore = Infinity;

  slides.forEach((slideElement) => {
    const rect = slideElement.getBoundingClientRect();
    const visibleHeight = Math.min(rect.bottom, contentRect.bottom) - Math.max(rect.top, contentRect.top);
    if (visibleHeight <= 0) return;
    const score = Math.abs(rect.top - anchorY) - Math.min(visibleHeight, 240) * 0.15;
    if (score < bestScore) {
      bestScore = score;
      bestSlideId = slideElement.dataset.slideId || "";
    }
  });

  return bestSlideId;
}

function getVisibleReportSlides(project) {
  return (project.reportDeck?.slides || []).filter((slide) => !slide.hidden);
}

function addReportSlideFromSelectedTemplate(project, root = app) {
  project.reportDeck = project.reportDeck || buildReportDeck(project);
  project.reportDeck.slides = Array.isArray(project.reportDeck.slides) ? project.reportDeck.slides : [];
  const template = root.querySelector("#reportSlideTemplate")?.value || "blank";
  const slide = createReportSlideFromTemplate(project, template, project.reportDeck.slides.length + 1);
  project.reportDeck.slides.push(slide);
  activeReportSlideId = slide.id;
  upsertProject(state, project);
  toast(`Dodano slajd: ${slide.title || "Nowy slajd"}.`);
  render();
  window.setTimeout(() => {
    document.getElementById(`slide-${slide.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, 0);
}

function deleteReportSlideById(project, slideId) {
  const slides = project.reportDeck?.slides || [];
  const slide = slides.find((item) => item.id === slideId);
  if (!slide) {
    toast("Nie znaleziono slajdu do usunięcia.");
    return;
  }

  const deletedIndex = slides.findIndex((item) => item.id === slideId);
  project.reportDeck.slides = slides.filter((item) => item.id !== slideId);
  const nextSlide = project.reportDeck.slides[Math.min(deletedIndex, project.reportDeck.slides.length - 1)] || null;
  activeReportSlideId = nextSlide?.id || "";
  if (!getVisibleReportSlides(project).length) reportPresentationMode = false;
  upsertProject(state, project);
  toast(`Usunięto slajd: ${slide.title || "Slajd"}.`);
  render();
}

function renderReportPropertiesPanel(project, activeSlide) {
  const deck = project.reportDeck;
  const hasDeck = Boolean(deck?.slides?.length);
  const deckSettings = getReportDeckSettings(project);
  const slideIndex = deck?.slides?.findIndex((slide) => slide.id === activeSlide?.id) ?? -1;
  const slideCount = deck?.slides?.length || 0;
  const visibleSlideCount = deck?.slides?.filter((slide) => !slide.hidden).length || 0;
  const layout = activeSlide ? normalizeReportSlideLayout(activeSlide.layout) : "standard";
  const theme = activeSlide ? normalizeReportSlideTheme(activeSlide.theme || deckSettings.theme) : deckSettings.theme;
  const status = activeSlide ? normalizeReportSlideStatus(activeSlide.status) : "draft";
  const typeLabel = activeSlide
    ? reportSlideTemplates.find(([value]) => value === activeSlide.type)?.[1] || activeSlide.type || "Slajd"
    : "Brak aktywnego slajdu";
  const itemCount = countReportSlideItems(activeSlide);

  return `
    <aside class="report-properties report-side-editor">
      <div class="report-properties-head">
        <div>
          <div class="eyebrow">Edytor raportu</div>
          <h3>${activeSlide ? `Slajd ${slideIndex + 1}` : "Raport"}</h3>
          <span data-report-active-summary>${hasDeck ? `${slideCount} slajdów · aktywny automatycznie: ${Math.max(slideIndex + 1, 1)}` : "Wygeneruj raport, żeby rozpocząć edycję."}</span>
        </div>
        ${activeSlide ? renderReportSlideBadges(activeSlide) : ""}
      </div>

      <div class="property-section">
        <div class="property-section-title">Plik</div>
        <label class="property-field">
          Ankieta
          <select id="projectSelect" aria-label="Aktywna ankieta">
            ${state.projects.map((item) => `<option value="${item.id}" ${item.id === project.id ? "selected" : ""}>${escapeHtml(surveyOptionLabel(item))}</option>`).join("")}
          </select>
        </label>
        <div class="property-button-row">
          <button class="button small" id="downloadMarkdownReport">Markdown</button>
          <button class="primary small" id="downloadHtmlReport">HTML</button>
        </div>
      </div>

      <div class="property-section">
        <div class="property-section-title">Slajdy</div>
        <button class="button small" id="generateReportDeck">${hasDeck ? "Wygeneruj od nowa" : "Wygeneruj raport"}</button>
        ${hasDeck ? `
          <label class="property-field">
            Szablon nowego slajdu
            <select id="reportSlideTemplate" aria-label="Szablon nowego slajdu">
              ${reportSlideTemplates.map(([value, label]) => `<option value="${escapeAttribute(value)}">${escapeHtml(label)}</option>`).join("")}
            </select>
          </label>
          <div class="property-button-row">
            <button class="button small" id="addReportSlide">Dodaj slajd</button>
            <button class="primary small" id="openPresentationMode" ${visibleSlideCount ? "" : "disabled"}>Prezentuj</button>
          </div>
          <span class="property-hint">${visibleSlideCount} slajdów widocznych w prezentacji i eksporcie HTML.</span>
        ` : ""}
      </div>

      ${activeSlide ? `
        <div class="property-section">
          <div class="property-section-title">Wstaw</div>
          <label class="property-field">
            Element
            <select id="reportInsertType" aria-label="Typ wstawianego elementu">
              ${renderReportInsertOptions("table")}
            </select>
          </label>
          <button class="button small" id="insertReportElement" data-insert-report-element="${escapeAttribute(activeSlide.id)}">Wstaw element</button>
        </div>

        <div class="property-section">
          <div class="property-section-title">Aktywny slajd</div>
          <select id="activeReportSlideSelect" aria-label="Szybka nawigacja po slajdach">
            ${deck.slides.map((slide, index) => `<option value="${escapeAttribute(slide.id)}" ${slide.id === activeSlide.id ? "selected" : ""}>${index + 1}. ${escapeHtml(shortLabelText(slide.title || "Slajd", 32))}${slide.hidden ? " (ukryty)" : ""}</option>`).join("")}
          </select>
          <div class="property-button-row">
            <button class="button small" data-active-slide-action="move-up" data-move-report-slide="${escapeAttribute(activeSlide.id)}" data-move-direction="up" ${slideIndex > 0 ? "" : "disabled"}>W górę</button>
            <button class="button small" data-active-slide-action="move-down" data-move-report-slide="${escapeAttribute(activeSlide.id)}" data-move-direction="down" ${slideIndex >= 0 && slideIndex < slideCount - 1 ? "" : "disabled"}>W dół</button>
            <button class="button small" data-active-slide-action="duplicate" data-duplicate-report-slide="${escapeAttribute(activeSlide.id)}">Duplikuj</button>
            <button class="button small" data-active-slide-action="hidden-toggle" data-toggle-report-slide-hidden="${escapeAttribute(activeSlide.id)}">${activeSlide.hidden ? "Pokaż" : "Ukryj"}</button>
            <button class="button small danger-inline" data-active-slide-action="delete" data-delete-report-slide="${escapeAttribute(activeSlide.id)}">Usuń</button>
          </div>
        </div>

        <div class="property-section">
          <div class="property-section-title">Format</div>
          <label class="property-field">
            Status
            <select data-active-slide-control="status" data-report-slide-status="${escapeAttribute(activeSlide.id)}">
              ${renderReportStatusOptions(status)}
            </select>
          </label>

          <label class="property-check">
            <input type="checkbox" data-report-slide-hidden="${escapeAttribute(activeSlide.id)}" ${activeSlide.hidden ? "checked" : ""} />
            <span>Ukryj w prezentacji i eksporcie HTML</span>
          </label>

          <label class="property-field">
            Układ
            <select data-active-slide-control="layout" data-report-slide-layout="${escapeAttribute(activeSlide.id)}">
              ${renderReportLayoutOptions(layout)}
            </select>
          </label>

          <label class="property-field">
            Motyw slajdu
            <select data-active-slide-control="theme" data-report-slide-theme="${escapeAttribute(activeSlide.id)}">
              ${renderReportThemeOptions(theme)}
            </select>
          </label>
        </div>
      ` : ""}

      <div class="property-section">
        <div class="property-section-title">Ustawienia raportu</div>
        <label class="property-field">
          Motyw raportu
          <select id="reportDeckTheme" aria-label="Motyw całego raportu" ${hasDeck ? "" : "disabled"}>
            ${renderReportThemeOptions(deckSettings.theme)}
          </select>
        </label>
        <button class="button small" id="toggleReportNotes" ${hasDeck ? "" : "disabled"}>${deckSettings.showNotes === false ? "Pokaż notatki" : "Ukryj notatki"}</button>
      </div>

      ${activeSlide ? `
        <div class="property-card">
          <span>Typ slajdu</span>
          <strong>${escapeHtml(typeLabel)}</strong>
        </div>
        <div class="property-card">
          <span>Zawartość edytowalna</span>
          <strong>${itemCount} elementów</strong>
        </div>
        <p class="property-help">Opcje slajdu są tutaj po prawej. Slajd aktywny zmienia się automatycznie podczas przewijania i edycji.</p>
      ` : `
        <p class="property-help">Po wygenerowaniu raportu panel pokaże format, wstawianie elementów i akcje aktywnego slajdu.</p>
      `}
    </aside>
  `;
}

function renderReportPresentation(project, visibleSlides) {
  if (!visibleSlides.length) return "";
  if (presentationSlideIndex < 0 || presentationSlideIndex >= visibleSlides.length) presentationSlideIndex = 0;
  const deckSettings = getReportDeckSettings(project);
  const slide = visibleSlides[presentationSlideIndex];
  const layout = normalizeReportSlideLayout(slide.layout);
  const theme = normalizeReportSlideTheme(slide.theme || deckSettings.theme);

  return `
    <div class="report-presentation-overlay" role="dialog" aria-modal="true" aria-label="Tryb prezentacji raportu">
      <div class="report-presentation-top">
        <div>
          <strong>${escapeHtml(project.client)} · ${escapeHtml(project.name)}</strong>
          <span>Slajd ${presentationSlideIndex + 1} z ${visibleSlides.length}</span>
        </div>
        <button class="button small" id="closePresentationMode">Zamknij</button>
      </div>

      <article class="report-presentation-slide layout-${layout} theme-${theme}">
        <div class="slide-kicker">${escapeHtml(slide.kicker || "")}</div>
        <h2>${escapeHtml(slide.title || "Slajd")}</h2>
        <p class="slide-body">${escapeHtml(slide.body || "")}</p>
        <div class="presentation-visual">
          ${renderSlideVisual(slide, project)}
        </div>
        ${deckSettings.showNotes !== false && slide.notes ? `<div class="slide-notes">${escapeHtml(slide.notes)}</div>` : ""}
      </article>

      <div class="report-presentation-controls">
        <button class="button" data-presentation-step="-1" ${presentationSlideIndex > 0 ? "" : "disabled"}>Poprzedni</button>
        <span>${presentationSlideIndex + 1} / ${visibleSlides.length}</span>
        <button class="primary" data-presentation-step="1" ${presentationSlideIndex < visibleSlides.length - 1 ? "" : "disabled"}>Następny</button>
      </div>
    </div>
  `;
}

function renderReportRibbon(project, deck, deckSettings, activeSlide, activeSlideIndex) {
  const hasDeck = Boolean(deck?.slides?.length);
  const activeLayout = activeSlide ? normalizeReportSlideLayout(activeSlide.layout) : "standard";
  const activeTheme = activeSlide ? normalizeReportSlideTheme(activeSlide.theme || deckSettings.theme) : deckSettings.theme;
  const slideCount = deck?.slides?.length || 0;
  const visibleSlideCount = deck?.slides?.filter((slide) => !slide.hidden).length || 0;
  const activeStatus = activeSlide ? normalizeReportSlideStatus(activeSlide.status) : "draft";

  return `
    <div class="report-ribbon" role="toolbar" aria-label="Narzędzia raportu">
      <div class="report-ribbon-header">
        <div>
          <strong>Edytor raportu</strong>
          <span data-report-active-summary>${hasDeck ? `${slideCount} slajdów · aktywny automatycznie: ${activeSlideIndex + 1}` : "Wygeneruj raport, żeby rozpocząć edycję slajdów."}</span>
        </div>
        <span class="report-ribbon-badge">${escapeHtml(project.client)} · ${escapeHtml(project.wave || "fala robocza")}</span>
      </div>
      <div class="report-ribbon-groups">
        <div class="report-ribbon-group wide">
          <div class="report-ribbon-label">Plik</div>
          <select id="projectSelect" aria-label="Aktywna ankieta">
            ${state.projects.map((item) => `<option value="${item.id}" ${item.id === project.id ? "selected" : ""}>${escapeHtml(surveyOptionLabel(item))}</option>`).join("")}
          </select>
          <div class="report-ribbon-buttons">
            <button class="button small" id="downloadMarkdownReport">Markdown</button>
            <button class="primary small" id="downloadHtmlReport">HTML</button>
          </div>
        </div>

        <div class="report-ribbon-group">
          <div class="report-ribbon-label">Slajdy</div>
          <button class="button small" id="generateReportDeck">${hasDeck ? "Wygeneruj od nowa" : "Wygeneruj raport"}</button>
          ${hasDeck ? `
            <select id="reportSlideTemplate" aria-label="Szablon nowego slajdu">
              ${reportSlideTemplates.map(([value, label]) => `<option value="${escapeAttribute(value)}">${escapeHtml(label)}</option>`).join("")}
            </select>
            <button class="button small" id="addReportSlide">Dodaj slajd</button>
            <button class="primary small" id="openPresentationMode" ${visibleSlideCount ? "" : "disabled"}>Prezentuj</button>
            <span class="report-ribbon-hint">${visibleSlideCount} w prezentacji</span>
          ` : ""}
        </div>

        ${hasDeck ? `
          <div class="report-ribbon-group">
            <div class="report-ribbon-label">Aktywny slajd</div>
            <select id="activeReportSlideSelect" aria-label="Szybka nawigacja po slajdach">
              ${deck.slides.map((slide, index) => `<option value="${escapeAttribute(slide.id)}" ${slide.id === activeSlide?.id ? "selected" : ""}>${index + 1}. ${escapeHtml(shortLabelText(slide.title || "Slajd", 32))}${slide.hidden ? " (ukryty)" : ""}</option>`).join("")}
            </select>
            <div class="report-ribbon-buttons">
              <button class="button small" data-active-slide-action="move-up" data-move-report-slide="${escapeAttribute(activeSlide?.id || "")}" data-move-direction="up" ${activeSlideIndex > 0 ? "" : "disabled"}>W górę</button>
              <button class="button small" data-active-slide-action="move-down" data-move-report-slide="${escapeAttribute(activeSlide?.id || "")}" data-move-direction="down" ${activeSlideIndex >= 0 && activeSlideIndex < slideCount - 1 ? "" : "disabled"}>W dół</button>
              <button class="button small" data-active-slide-action="duplicate" data-duplicate-report-slide="${escapeAttribute(activeSlide?.id || "")}" ${activeSlide ? "" : "disabled"}>Duplikuj</button>
              <button class="button small" data-active-slide-action="hidden-toggle" data-toggle-report-slide-hidden="${escapeAttribute(activeSlide?.id || "")}" ${activeSlide ? "" : "disabled"}>${activeSlide?.hidden ? "Pokaż" : "Ukryj"}</button>
              <button class="button small" data-active-slide-action="add-item" data-add-report-item="${escapeAttribute(activeSlide?.id || "")}" ${activeSlide && canAddReportSlideItem(activeSlide) ? "" : "disabled"}>Dodaj element</button>
              <button class="button small danger-inline" data-active-slide-action="delete" data-delete-report-slide="${escapeAttribute(activeSlide?.id || "")}" ${activeSlide ? "" : "disabled"}>Usuń</button>
            </div>
          </div>

          <div class="report-ribbon-group">
            <div class="report-ribbon-label">Format</div>
            <select data-active-slide-control="layout" data-report-slide-layout="${escapeAttribute(activeSlide?.id || "")}" aria-label="Układ aktywnego slajdu" ${activeSlide ? "" : "disabled"}>
              ${renderReportLayoutOptions(activeLayout)}
            </select>
            <select data-active-slide-control="theme" data-report-slide-theme="${escapeAttribute(activeSlide?.id || "")}" aria-label="Motyw aktywnego slajdu" ${activeSlide ? "" : "disabled"}>
              ${renderReportThemeOptions(activeTheme)}
            </select>
            <select data-active-slide-control="status" data-report-slide-status="${escapeAttribute(activeSlide?.id || "")}" aria-label="Status aktywnego slajdu" ${activeSlide ? "" : "disabled"}>
              ${renderReportStatusOptions(activeStatus)}
            </select>
            <select id="reportDeckTheme" aria-label="Motyw całego raportu">
              ${renderReportThemeOptions(deckSettings.theme)}
            </select>
            <button class="button small" id="toggleReportNotes">${deckSettings.showNotes === false ? "Pokaż notatki" : "Ukryj notatki"}</button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function renderReportSlide(slide, index, project) {
  const deckSettings = getReportDeckSettings(project);
  const layout = normalizeReportSlideLayout(slide.layout);
  const theme = normalizeReportSlideTheme(slide.theme || deckSettings.theme);
  const notesClass = deckSettings.showNotes === false ? "hide-notes" : "";
  const selectedClass = slide.id === activeReportSlideId ? "active" : "";
  const hiddenClass = slide.hidden ? "hidden-slide" : "";

  return `
    <article id="slide-${escapeAttribute(slide.id)}" class="report-slide ${layout} layout-${layout} theme-${theme} ${notesClass} ${selectedClass} ${hiddenClass}" data-slide-id="${escapeAttribute(slide.id)}" tabindex="0">
      <div class="slide-kicker editable" contenteditable="true" data-report-field="kicker">${escapeHtml(slide.kicker || "")}</div>
      <h2 class="editable" contenteditable="true" data-report-field="title">${escapeHtml(slide.title || "Nowy slajd")}</h2>
      <p class="slide-body editable" contenteditable="true" data-report-field="body">${escapeHtml(slide.body || "")}</p>
      ${renderSlideVisual(slide, project)}
      <div class="slide-notes editable" contenteditable="true" data-report-field="notes">${escapeHtml(slide.notes || "Notatka konsultanta...")}</div>
    </article>
  `;
}

function defaultReportDeckSettings() {
  return {
    showNotes: true,
    theme: "navy"
  };
}

function getReportDeckSettings(project) {
  const settings = {
    ...defaultReportDeckSettings(),
    ...(project.reportDeck?.settings || {})
  };
  settings.theme = normalizeReportSlideTheme(settings.theme);
  settings.showNotes = settings.showNotes !== false;
  if (project.reportDeck) project.reportDeck.settings = settings;
  return settings;
}

function normalizeReportSlideLayout(value) {
  return reportSlideLayouts.some(([key]) => key === value) ? value : "standard";
}

function normalizeReportSlideTheme(value) {
  return reportSlideThemes.some(([key]) => key === value) ? value : "navy";
}

function normalizeReportSlideStatus(value) {
  return reportSlideStatuses.some(([key]) => key === value) ? value : "draft";
}

function renderReportLayoutOptions(selected) {
  return reportSlideLayouts.map(([value, label]) => `
    <option value="${escapeAttribute(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function renderReportThemeOptions(selected) {
  return reportSlideThemes.map(([value, label]) => `
    <option value="${escapeAttribute(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function renderReportStatusOptions(selected) {
  return reportSlideStatuses.map(([value, label]) => `
    <option value="${escapeAttribute(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function renderReportInsertOptions(selected) {
  return reportInsertOptions.map(([value, label]) => `
    <option value="${escapeAttribute(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function getReportSlideStatusMeta(status) {
  const normalized = normalizeReportSlideStatus(status);
  const label = reportSlideStatuses.find(([value]) => value === normalized)?.[1] || "Roboczy";
  return { value: normalized, label };
}

function renderReportSlideBadges(slide) {
  const status = getReportSlideStatusMeta(slide?.status);
  return `
    <span class="report-status-set">
      <span class="report-status-badge ${escapeAttribute(status.value)}">${escapeHtml(status.label)}</span>
      ${slide?.hidden ? `<span class="report-status-badge muted">Ukryty</span>` : ""}
    </span>
  `;
}

function countReportSlideItems(slide) {
  if (!slide) return 0;
  if (Array.isArray(slide.items)) return slide.items.length;
  if (Array.isArray(slide.top) || Array.isArray(slide.bottom)) return (slide.top?.length || 0) + (slide.bottom?.length || 0);
  if (Array.isArray(slide.chart?.values)) return slide.chart.values.length;
  return 0;
}

function canAddReportSlideItem(slide) {
  return ["bullets", "checklist", "quotes", "topics", "metrics", "method", "bars", "enps", "tableGeneric"].includes(slide.type);
}

function renderSlideVisual(slide, project) {
  if (slide.type === "cover") return renderCoverVisual(project);
  if (slide.type === "method") return renderMethodSlide(slide.items || []);
  if (slide.type === "metrics") return renderMetricSlideVisual(slide.items || []);
  if (slide.type === "comparison") return renderTopBottomSlide(slide);
  if (slide.type === "segmentTable") return renderSegmentTableSlide(slide.items || []);
  if (slide.type === "tableGeneric") return renderGenericTableSlide(slide.items || []);
  if (slide.type === "enps") return renderEnpsSlide(slide);
  if (slide.type === "bars") return renderBarChart(slide.chart || {});
  if (slide.type === "topics") return renderTopicBars(slide.items || []);
  if (slide.type === "quotes") return renderQuoteSlide(slide.items || []);
  if (slide.type === "checklist") return renderChecklistSlide(slide.items || []);
  return renderEditableBulletList(slide.items || []);
}

function renderCoverVisual(project) {
  return `
    <div class="report-cover-visual">
      <div>
        <span class="eyebrow">${escapeHtml(project.wave || "Fala badania")}</span>
        <strong>${escapeHtml(project.client)}</strong>
        <p>${escapeHtml(project.sourceFile || "ankieta lokalna")}</p>
      </div>
      <div class="report-cover-mark">GH</div>
    </div>
  `;
}

function renderMetricSlideVisual(items) {
  return `
    <div class="report-metric-grid">
      ${items.map((item, index) => `
        <div class="report-metric-card" data-editable-list="items" data-item-index="${index}">
          <strong class="editable" contenteditable="true" data-item-field="value">${escapeHtml(String(item.value ?? "-"))}</strong>
          <span class="editable" contenteditable="true" data-item-field="label">${escapeHtml(item.label || "")}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMethodSlide(items) {
  return `
    <div class="report-method-grid">
      ${items.map((item, index) => `
        <div class="report-method-card" data-editable-list="items" data-item-index="${index}">
          <strong class="editable" contenteditable="true" data-item-field="label">${escapeHtml(item.label || "")}</strong>
          <p class="editable" contenteditable="true" data-item-field="text">${escapeHtml(item.text || "")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderTopBottomSlide(slide) {
  return `
    <div class="report-compare-grid">
      <div>
        <h3>Najwyżej oceniane</h3>
        ${renderCompareList(slide.top || [], "teal", "top")}
      </div>
      <div>
        <h3>Najniżej oceniane</h3>
        ${renderCompareList(slide.bottom || [], "coral", "bottom")}
      </div>
    </div>
  `;
}

function renderCompareList(items, tone, listName) {
  return `
    <div class="report-compare-list">
      ${items.map((item, index) => `
        <div class="report-compare-item" data-editable-list="${listName}" data-item-index="${index}">
          <span class="editable" contenteditable="true" data-item-field="label">${escapeHtml(item.label || "")}</span>
          <strong class="${tone} editable" contenteditable="true" data-item-field="value">${escapeHtml(String(item.value ?? "-"))}</strong>
        </div>
      `).join("") || `<div class="empty">Brak wyników liczbowych.</div>`}
    </div>
  `;
}

function renderSegmentTableSlide(items) {
  return `
    <div class="report-table-wrap">
      <table class="report-segment-table">
        <thead><tr><th>Jednostka / segment</th><th>n</th><th>średnia</th><th>sygnał</th></tr></thead>
        <tbody>
          ${items.map((item, index) => `
            <tr data-editable-list="items" data-item-index="${index}">
              <td class="editable" contenteditable="true" data-item-field="label">${escapeHtml(item.label || "")}</td>
              <td class="editable" contenteditable="true" data-item-field="count">${escapeHtml(String(item.count ?? "-"))}</td>
              <td class="editable" contenteditable="true" data-item-field="value">${escapeHtml(String(item.value ?? "-"))}</td>
              <td><span class="pill ${item.tone || ""} editable" contenteditable="true" data-item-field="signal">${escapeHtml(item.signal || "")}</span></td>
            </tr>
          `).join("") || `<tr><td colspan="4">Brak segmentów liczbowych.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderGenericTableSlide(items) {
  return `
    <div class="report-table-wrap">
      <table class="report-segment-table report-generic-table">
        <thead><tr><th>Obszar</th><th>Wartość</th><th>Opis</th><th>Status</th></tr></thead>
        <tbody>
          ${items.map((item, index) => `
            <tr data-editable-list="items" data-item-index="${index}">
              <td class="editable" contenteditable="true" data-item-field="label">${escapeHtml(item.label || "")}</td>
              <td class="editable" contenteditable="true" data-item-field="value">${escapeHtml(String(item.value ?? "-"))}</td>
              <td class="editable" contenteditable="true" data-item-field="text">${escapeHtml(item.text || "")}</td>
              <td class="editable" contenteditable="true" data-item-field="signal">${escapeHtml(item.signal || "")}</td>
            </tr>
          `).join("") || `<tr><td colspan="4">Wstaw wiersz tabeli z panelu po prawej.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderEnpsSlide(slide) {
  const value = Number(slide.score);
  const score = Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) : null;
  const left = score === null ? 50 : (score + 100) / 2;
  return `
    <div class="report-enps">
      <div class="enps-gauge">
        <div class="enps-scale"><span></span></div>
        <div class="enps-needle" style="left: ${left}%"></div>
        <div class="enps-labels"><span>-100</span><strong>${escapeHtml(String(slide.score ?? "-"))}</strong><span>+100</span></div>
      </div>
      ${renderBarChart(slide.chart || {})}
    </div>
  `;
}

function renderBarChart(chart) {
  const values = chart.values || [];
  const max = Math.max(1, ...values.map((item) => Math.abs(Number(item.value) || 0)));
  return `
    <div class="report-chart" aria-label="${escapeAttribute(chart.title || "Wykres")}">
      ${chart.title ? `<div class="report-chart-title">${escapeHtml(chart.title)}</div>` : ""}
      ${values.map((item, index) => {
        const width = Math.max(6, Math.round((Math.abs(Number(item.value) || 0) / max) * 100));
        return `
          <div class="report-bar-row" data-editable-list="chart.values" data-item-index="${index}">
            <span class="editable" contenteditable="true" data-item-field="label">${escapeHtml(item.label || "")}</span>
            <div class="report-bar-track"><div class="report-bar ${item.tone || ""}" style="width: ${width}%"></div></div>
            <strong class="editable" contenteditable="true" data-item-field="value">${escapeHtml(String(item.value ?? "-"))}</strong>
          </div>
        `;
      }).join("") || `<div class="empty">Brak danych do wykresu.</div>`}
    </div>
  `;
}

function renderTopicBars(items) {
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
  return `
    <div class="report-topic-grid">
      ${items.map((item, index) => {
        const height = Math.max(10, Math.round(((Number(item.value) || 0) / max) * 130));
        return `
          <div class="report-topic-bar" data-editable-list="items" data-item-index="${index}">
            <div class="topic-bar-fill ${item.tone || ""}" style="height: ${height}px"></div>
            <strong class="editable" contenteditable="true" data-item-field="value">${escapeHtml(String(item.value ?? 0))}</strong>
            <span class="editable" contenteditable="true" data-item-field="label">${escapeHtml(item.label || "")}</span>
          </div>
        `;
      }).join("") || `<div class="empty">Brak tematów do pokazania.</div>`}
    </div>
  `;
}

function renderQuoteSlide(items) {
  return `
    <div class="report-quote-grid">
      ${items.map((item, index) => `
        <blockquote data-editable-list="items" data-item-index="${index}">
          <p class="editable" contenteditable="true" data-item-field="text">${escapeHtml(item.text || "")}</p>
          <cite class="editable" contenteditable="true" data-item-field="label">${escapeHtml(item.label || "Cytat")}</cite>
        </blockquote>
      `).join("") || `<div class="empty">Brak cytatów po redakcji.</div>`}
    </div>
  `;
}

function renderChecklistSlide(items) {
  return `
    <div class="report-checklist">
      ${items.map((item, index) => `
        <div class="report-check" data-editable-list="items" data-item-index="${index}">
          <span>${index + 1}</span>
          <p class="editable" contenteditable="true" data-item-field="text">${escapeHtml(item.text || "")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderEditableBulletList(items) {
  return `
    <div class="report-bullets">
      ${items.map((item, index) => `
        <div class="report-bullet" data-editable-list="items" data-item-index="${index}">
          <span></span>
          <p class="editable" contenteditable="true" data-item-field="text">${escapeHtml(item.text || item || "")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function bindAuthEvents() {
  app.querySelector("#loginAccount")?.addEventListener("click", () => {
    try {
      const account = loginLocalAccount(app.querySelector("#loginEmail")?.value, app.querySelector("#loginPin")?.value || "");
      activateAccount(account, "dashboard");
      toast("Zalogowano do lokalnej przestrzeni projektów.");
    } catch (error) {
      toast(error.message || "Nie udało się zalogować.");
    }
  });

  app.querySelector("#createAccount")?.addEventListener("click", () => {
    try {
      const account = createLocalAccount({
        name: app.querySelector("#newAccountName")?.value,
        email: app.querySelector("#newAccountEmail")?.value,
        pin: app.querySelector("#newAccountPin")?.value
      });
      activateAccount(account, "dashboard");
      toast("Utworzono konto i osobną przestrzeń projektów.");
    } catch (error) {
      toast(error.message || "Nie udało się utworzyć konta.");
    }
  });
}

function bindAccountEvents() {
  app.querySelector("#logoutAccount")?.addEventListener("click", () => {
    logoutAccount();
    currentAccount = null;
    state = null;
    activeView = "dashboard";
    render();
  });

  app.querySelector("#createAccountFromPanel")?.addEventListener("click", () => {
    try {
      const account = createLocalAccount({
        name: app.querySelector("#accountName")?.value,
        email: app.querySelector("#accountEmail")?.value,
        pin: app.querySelector("#accountPin")?.value
      });
      activateAccount(account, "account");
      toast("Utworzono i przełączono konto.");
    } catch (error) {
      toast(error.message || "Nie udało się utworzyć konta.");
    }
  });

  app.querySelectorAll("[data-switch-account]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        const account = switchAccount(button.dataset.switchAccount);
        activateAccount(account, "dashboard");
        toast(`Przełączono na konto ${account.name}.`);
      } catch (error) {
        toast(error.message || "Nie udało się przełączyć konta.");
      }
    });
  });
}

function activateAccount(account, view = "dashboard") {
  currentAccount = account;
  state = loadState(account.id);
  activeView = view;
  analysisFilters = {
    category: "__all",
    question: "__all"
  };
  segmentCompareState = {
    segmentColumn: "",
    question: ""
  };
  activeReportSlideId = "";
  reportPresentationMode = false;
  render();
}

function bindShellEvents() {
  app.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.nav;
      render();
    });
  });

  app.querySelectorAll("[data-nav-target]").forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.navTarget;
      render();
    });
  });

  app.querySelector("[data-dismiss-import-feedback]")?.addEventListener("click", () => {
    importFeedback = null;
    render();
  });

  app.querySelector("#projectSelect")?.addEventListener("change", (event) => {
    state.currentProjectId = event.target.value;
    saveState(state);
    render();
  });

  app.querySelectorAll("[data-open-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentProjectId = button.dataset.openProject;
      saveState(state);
      activeView = "dashboard";
      render();
    });
  });

  app.querySelector("#exportJson")?.addEventListener("click", () => {
    exportProject(getCurrentProject(state));
  });

  app.querySelector("#jsonImport")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const project = await importProjectFile(file);
      upsertProject(state, project);
      toast("Projekt JSON został zaimportowany.");
      render();
    } catch (error) {
      toast(error.message || "Nie udało się zaimportować JSON.");
    }
  });

  document.onkeydown = (event) => {
    if (!reportPresentationMode || activeView !== "report") return;
    const project = getCurrentProject(state);
    const visibleSlides = getVisibleReportSlides(project);
    if (!visibleSlides.length) return;
    if (event.key === "Escape") {
      reportPresentationMode = false;
      render();
    }
    if (event.key === "ArrowLeft") {
      presentationSlideIndex = Math.max(presentationSlideIndex - 1, 0);
      render();
    }
    if (event.key === "ArrowRight") {
      presentationSlideIndex = Math.min(presentationSlideIndex + 1, visibleSlides.length - 1);
      render();
    }
  };
}

function bindViewEvents(project) {
  if (activeView === "projects") bindProjectsEvents();
  if (activeView === "import") bindImportEvents();
  if (activeView === "analysis") {
    bindAnalysisEvents(project);
    bindSegmentsEvents(project);
  }
  if (activeView === "taxonomy") bindTaxonomyEvents(project);
  if (activeView === "privacy") bindPrivacyEvents(project);
  if (activeView === "report") bindReportEvents(project);
  if (activeView === "account") bindAccountEvents();
}

function bindAnalysisEvents(project) {
  app.querySelectorAll("[data-analysis-subview]").forEach((button) => {
    button.addEventListener("click", () => {
      analysisSubview = button.dataset.analysisSubview;
      render();
    });
  });

  app.querySelectorAll("[data-analysis-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      analysisFilters.category = analysisFilters.category === button.dataset.analysisTheme ? "__all" : button.dataset.analysisTheme;
      analysisFilters.question = "__all";
      render();
    });
  });

  app.querySelector("#analysisCategory")?.addEventListener("change", (event) => {
    analysisFilters.category = event.target.value;
    analysisFilters.question = "__all";
    render();
  });

  app.querySelector("#analysisQuestion")?.addEventListener("change", (event) => {
    analysisFilters.question = event.target.value;
    render();
  });

  app.querySelector("#resetAnalysisFilters")?.addEventListener("click", () => {
    analysisFilters = {
      category: "__all",
      question: "__all"
    };
    render();
  });

  app.querySelector("#clearThemeFilter")?.addEventListener("click", () => {
    analysisFilters.category = "__all";
    analysisFilters.question = "__all";
    render();
  });

  app.querySelector("[data-generate-ai-summary]")?.addEventListener("click", () => {
    generateModelSummary(project);
  });

  ["#ollamaEndpoint", "#ollamaModel"].forEach((selector) => {
    app.querySelector(selector)?.addEventListener("change", () => {
      readOllamaSettingsFromDom();
      toast("Zapisano ustawienia Ollama.");
    });
  });
}

function bindTaxonomyEvents(project) {
  app.querySelector("#addTaxonomyCategory")?.addEventListener("click", () => {
    const taxonomy = ensureMutableTaxonomy(project);
    const index = (taxonomy.customCategories || []).length + 1;
    taxonomy.customCategories.push({ id: createId("tax"), name: `Nowa kategoria ${index}` });
    upsertProject(state, project);
    toast("Dodano kategorię konsultanta.");
    render();
  });

  app.querySelector("#resetTaxonomy")?.addEventListener("click", () => {
    if (!confirm("Wyczyścić nazwy i ręczne przypisania taksonomii?")) return;
    project.taxonomy = { themeNames: {}, questionThemeNames: {}, customCategories: [] };
    analysisFilters.category = "__all";
    analysisFilters.question = "__all";
    upsertProject(state, project);
    toast("Taksonomia została zresetowana.");
    render();
  });

  app.querySelectorAll("[data-taxonomy-theme-name]").forEach((input) => {
    input.addEventListener("blur", () => {
      const taxonomy = ensureMutableTaxonomy(project);
      const themeId = input.dataset.taxonomyThemeName;
      const value = input.value.trim();
      const defaultName = input.dataset.defaultName || "";
      if (!value || value === defaultName) {
        delete taxonomy.themeNames[themeId];
      } else {
        taxonomy.themeNames[themeId] = value;
      }
      upsertProject(state, project);
      render();
    });
  });

  app.querySelectorAll("[data-taxonomy-custom-name]").forEach((input) => {
    input.addEventListener("blur", () => {
      const taxonomy = ensureMutableTaxonomy(project);
      const category = taxonomy.customCategories.find((item) => item.id === input.dataset.taxonomyCustomName);
      if (!category) return;
      category.name = input.value.trim() || category.name;
      upsertProject(state, project);
      render();
    });
  });

  app.querySelectorAll("[data-delete-taxonomy-custom]").forEach((button) => {
    button.addEventListener("click", () => {
      const taxonomy = ensureMutableTaxonomy(project);
      const category = taxonomy.customCategories.find((item) => item.id === button.dataset.deleteTaxonomyCustom);
      taxonomy.customCategories = taxonomy.customCategories.filter((item) => item.id !== button.dataset.deleteTaxonomyCustom);
      Object.entries(taxonomy.questionThemeNames).forEach(([question, name]) => {
        if (name === category?.name) delete taxonomy.questionThemeNames[question];
      });
      upsertProject(state, project);
      toast("Kategoria usunięta.");
      render();
    });
  });

  app.querySelectorAll("[data-taxonomy-question-theme]").forEach((select) => {
    select.addEventListener("change", () => {
      const taxonomy = ensureMutableTaxonomy(project);
      const question = select.dataset.taxonomyQuestionTheme;
      const defaultName = select.dataset.defaultTheme || "";
      if (select.value === defaultName) {
        delete taxonomy.questionThemeNames[question];
      } else {
        taxonomy.questionThemeNames[question] = select.value;
      }
      analysisFilters.question = "__all";
      upsertProject(state, project);
      toast("Przypisanie pytania zapisane.");
      render();
    });
  });
}

function bindProjectsEvents() {
  app.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => {
      const projectToDelete = state.projects.find((item) => item.id === button.dataset.deleteProject);
      if (!projectToDelete) return;
      if (!confirm(`Usunąć ankietę "${projectToDelete.name}" z lokalnego zapisu?`)) return;
      removeProject(state, button.dataset.deleteProject);
      toast(`Usunięto ankietę: ${projectToDelete.name}.`);
      render();
    });
  });
}

function bindImportEvents() {
  ["clientName", "projectName", "waveName", "importSourceKind"].forEach((id) => {
    app.querySelector(`#${id}`)?.addEventListener("input", (event) => {
      if (!importDraft) return;
      if (id === "clientName") importDraft.client = event.target.value;
      if (id === "projectName") importDraft.name = event.target.value;
      if (id === "waveName") importDraft.wave = event.target.value;
      if (id === "importSourceKind") importDraft.sourceKind = event.target.value;
    });
  });

  app.querySelector("#csvInput")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    let rows = [];
    try {
      rows = await parseTabularFile(file);
    } catch (error) {
      toast(error.message || "Nie udało się odczytać pliku.");
      return;
    }
    if (!rows.length) {
      toast("Nie udało się odczytać pliku z nagłówkiem i rekordami.");
      return;
    }
    importDraft = {
      rows,
      columns: inferColumns(rows),
      client: app.querySelector("#clientName")?.value || "Nowy klient",
      name: app.querySelector("#projectName")?.value || "Badanie",
      wave: app.querySelector("#waveName")?.value || "Fala",
      sourceKind: app.querySelector("#importSourceKind")?.value || getSourceKindFromFile(file.name),
      sourceFile: file.name
    };
    importFeedback = null;
    toast(`Odczytano ${rows.length} rekordów.`);
    render();
  });

  app.querySelectorAll("[data-column-type]").forEach((select) => {
    select.addEventListener("change", () => {
      if (!importDraft) return;
      importDraft.columns[Number(select.dataset.columnType)].type = select.value;
      render();
    });
  });

  app.querySelector("#applyImportTemplate")?.addEventListener("click", () => {
    if (!importDraft) return;
    const template = (state.importTemplates || []).find((item) => item.id === app.querySelector("#importTemplateSelect")?.value);
    if (!template) {
      toast("Wybierz szablon mapowania.");
      return;
    }
    applyImportTemplate(importDraft, template);
    importDraft.templateId = template.id;
    toast(`Zastosowano szablon: ${template.name}.`);
    render();
  });

  app.querySelector("#saveImportTemplate")?.addEventListener("click", () => {
    if (!importDraft?.columns?.length) return;
    const fallback = importDraft.sourceKind && importDraft.sourceKind !== "Auto"
      ? `Szablon ${importDraft.sourceKind}`
      : `Szablon ${importDraft.sourceFile || "importu"}`;
    const name = prompt("Nazwa szablonu mapowania", fallback);
    if (!name) return;
    const template = createImportTemplate(name, importDraft);
    state.importTemplates = [...(state.importTemplates || []).filter((item) => item.name !== name), template];
    importDraft.templateId = template.id;
    saveState(state);
    toast("Szablon mapowania zapisany lokalnie.");
    render();
  });

  app.querySelectorAll("[data-load-sample-csv]").forEach((button) => {
    button.addEventListener("click", async () => {
      const file = button.dataset.loadSampleCsv;
      const sample = sampleCsvFiles.find((item) => item.file === file);
      try {
        const response = await fetch(`./data/${file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const rows = parseCSV(text);
        if (!rows.length) throw new Error("Brak rekordów w pliku.");
        importDraft = {
          rows,
          columns: inferColumns(rows),
          client: sample?.client || "Klient testowy",
          name: sample?.name || "Import testowy",
          wave: sample?.wave || "Fala testowa",
          sourceKind: "CSV",
          sourceFile: file
        };
        importFeedback = null;
        toast(`Wczytano przykład: ${sample?.name || file}.`);
        render();
      } catch (error) {
        toast(`Nie udało się wczytać przykładu: ${error.message}`);
      }
    });
  });

  app.querySelector("#createProjectFromCsv")?.addEventListener("click", () => {
    if (!importDraft?.rows?.length) return;
    const columns = importDraft.columns.filter((column) => column.type !== "ignore");
    const ignored = new Set(importDraft.columns.filter((column) => column.type === "ignore").map((column) => column.name));
    const responses = importDraft.rows.map((row) => {
      const cleaned = {};
      Object.entries(row).forEach(([key, value]) => {
        if (!ignored.has(key)) cleaned[key] = value;
      });
      return cleaned;
    });

    const project = {
      id: createId("project"),
      client: app.querySelector("#clientName")?.value || importDraft.client,
      name: app.querySelector("#projectName")?.value || importDraft.name,
      wave: app.querySelector("#waveName")?.value || importDraft.wave,
      sourceFile: importDraft.sourceFile || "CSV",
      sourceKind: importDraft.sourceKind || "Auto",
      status: "oddzielna ankieta",
      createdAt: new Date().toISOString(),
      thresholds: { numeric: 5, comments: 10 },
      projectGroup: app.querySelector("#projectName")?.value || importDraft.name,
      reportVersions: [],
      schema: { columns },
      responses
    };

    upsertProject(state, project);
    importFeedback = {
      projectId: project.id,
      title: "Dane ankiety zostały zaimportowane",
      text: `Utworzono ankietę "${project.name}" z ${responses.length} odpowiedziami. Możesz przejść do wyników albo wczytać kolejny plik.`
    };
    importDraft = null;
    activeView = "import";
    toast(`Zaimportowano dane ankiety: ${project.name} (${responses.length} odpowiedzi).`);
    render();
  });
}

function bindPrivacyEvents(project) {
  app.querySelector("#saveThresholds")?.addEventListener("click", () => {
    project.thresholds = {
      numeric: Number(app.querySelector("#numericThreshold")?.value || 5),
      comments: Number(app.querySelector("#commentThreshold")?.value || 10)
    };
    upsertProject(state, project);
    toast("Progi kontroli danych zapisane.");
    render();
  });
}

function createImportTemplate(name, draft) {
  return {
    id: createId("template"),
    name,
    sourceKind: draft.sourceKind || "Auto",
    createdAt: new Date().toISOString(),
    columns: (draft.columns || []).map((column) => ({
      name: column.name,
      normalizedName: normalizeForLabel(column.name),
      type: column.type
    }))
  };
}

function applyImportTemplate(draft, template) {
  const byName = new Map((template.columns || []).map((column) => [column.name, column.type]));
  const byNormalized = new Map((template.columns || []).map((column) => [column.normalizedName || normalizeForLabel(column.name), column.type]));
  draft.columns = (draft.columns || []).map((column) => ({
    ...column,
    type: byName.get(column.name) || byNormalized.get(normalizeForLabel(column.name)) || column.type
  }));
}

function getSourceKindFromFile(fileName) {
  const name = String(fileName || "").toLowerCase();
  if (name.endsWith(".xlsx")) return "Excel";
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt")) return "CSV";
  return "Auto";
}

function bindReportAutoActiveSlide(project) {
  const content = app.querySelector(".content");
  if (!content || !project.reportDeck?.slides?.length) return;

  let scrollTimer = 0;
  const updateFromViewport = () => {
    const slideId = getReportSlideIdClosestToViewport();
    if (!slideId || slideId === activeReportSlideId) return;
    activateReportSlideInPlace(project, slideId);
  };

  content.addEventListener("scroll", () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(updateFromViewport, 90);
  }, { passive: true });

  window.setTimeout(updateFromViewport, 0);
}

function bindReportPropertiesPanelEvents(project) {
  const panel = app.querySelector(".report-properties");
  if (!panel) return;

  panel.querySelector("#projectSelect")?.addEventListener("change", (event) => {
    state.currentProjectId = event.target.value;
    saveState(state);
    render();
  });

  panel.querySelector("#generateReportDeck")?.addEventListener("click", () => {
    const settings = project.reportDeck ? getReportDeckSettings(project) : defaultReportDeckSettings();
    archiveCurrentReportVersion(project);
    project.reportDeck = buildReportDeck(project);
    project.reportDeck.settings = settings;
    activeReportSlideId = project.reportDeck.slides[0]?.id || "";
    upsertProject(state, project);
    toast(`Wygenerowano ${project.reportDeck.slides.length} slajdów z dostępnych danych.`);
    render();
  });

  panel.querySelector("#activeReportSlideSelect")?.addEventListener("change", (event) => {
    selectReportSlide(project, event.target.value);
  });

  panel.querySelector("#reportDeckTheme")?.addEventListener("change", (event) => {
    if (!project.reportDeck) return;
    const settings = getReportDeckSettings(project);
    settings.theme = normalizeReportSlideTheme(event.target.value);
    upsertProject(state, project);
    toast("Zmieniono motyw raportu.");
    render();
  });

  panel.querySelector("#toggleReportNotes")?.addEventListener("click", () => {
    if (!project.reportDeck) return;
    const settings = getReportDeckSettings(project);
    settings.showNotes = settings.showNotes === false;
    upsertProject(state, project);
    toast(settings.showNotes ? "Notatki są widoczne." : "Notatki ukryte w edytorze.");
    render();
  });

  panel.querySelector("#addReportSlide")?.addEventListener("click", () => {
    addReportSlideFromSelectedTemplate(project, panel);
  });

  panel.querySelector("#openPresentationMode")?.addEventListener("click", () => {
    const visibleSlides = getVisibleReportSlides(project);
    if (!visibleSlides.length) {
      toast("Brak widocznych slajdów do prezentacji.");
      return;
    }
    const activeVisibleIndex = visibleSlides.findIndex((slide) => slide.id === activeReportSlideId);
    presentationSlideIndex = activeVisibleIndex >= 0 ? activeVisibleIndex : 0;
    reportPresentationMode = true;
    render();
  });

  panel.querySelector("#downloadMarkdownReport")?.addEventListener("click", () => {
    downloadText(`${project.client}-${project.name}.md`, buildMarkdownReport(project), "text/markdown;charset=utf-8");
  });

  panel.querySelector("#downloadHtmlReport")?.addEventListener("click", () => {
    downloadText(`${project.client}-${project.name}.html`, buildHtmlReport(project), "text/html;charset=utf-8");
  });

  panel.querySelectorAll("[data-duplicate-report-slide]").forEach((button) => {
    button.addEventListener("click", () => {
      const slides = project.reportDeck?.slides || [];
      const index = slides.findIndex((slide) => slide.id === button.dataset.duplicateReportSlide);
      if (index < 0) return;
      const copy = cloneReportSlide(slides[index]);
      copy.title = `${copy.title || "Slajd"} - kopia`;
      slides.splice(index + 1, 0, copy);
      activeReportSlideId = copy.id;
      upsertProject(state, project);
      toast("Slajd zduplikowany.");
      render();
    });
  });

  panel.querySelectorAll("[data-toggle-report-slide-hidden]").forEach((button) => {
    button.addEventListener("click", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === button.dataset.toggleReportSlideHidden);
      if (!slide) return;
      slide.hidden = !slide.hidden;
      if (reportPresentationMode && !getVisibleReportSlides(project).length) reportPresentationMode = false;
      upsertProject(state, project);
      toast(slide.hidden ? "Slajd ukryty w prezentacji i eksporcie HTML." : "Slajd ponownie widoczny.");
      render();
    });
  });

  panel.querySelectorAll("[data-move-report-slide]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!moveReportSlide(project, button.dataset.moveReportSlide, button.dataset.moveDirection)) return;
      upsertProject(state, project);
      toast("Zmieniono kolejność slajdów.");
      render();
    });
  });

  panel.querySelectorAll("[data-delete-report-slide]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteReportSlideById(project, button.dataset.deleteReportSlide);
    });
  });

  panel.querySelectorAll("[data-report-slide-layout]").forEach((select) => {
    select.addEventListener("change", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === select.dataset.reportSlideLayout);
      if (!slide) return;
      slide.layout = normalizeReportSlideLayout(select.value);
      upsertProject(state, project);
      toast("Zmieniono układ slajdu.");
      render();
    });
  });

  panel.querySelectorAll("[data-report-slide-theme]").forEach((select) => {
    select.addEventListener("change", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === select.dataset.reportSlideTheme);
      if (!slide) return;
      slide.theme = normalizeReportSlideTheme(select.value);
      upsertProject(state, project);
      toast("Zmieniono motyw slajdu.");
      render();
    });
  });

  panel.querySelectorAll("[data-report-slide-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === select.dataset.reportSlideStatus);
      if (!slide) return;
      slide.status = normalizeReportSlideStatus(select.value);
      upsertProject(state, project);
      toast("Zmieniono status slajdu.");
      render();
    });
  });

  panel.querySelectorAll("[data-report-slide-hidden]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === checkbox.dataset.reportSlideHidden);
      if (!slide) return;
      slide.hidden = checkbox.checked;
      if (reportPresentationMode && !getVisibleReportSlides(project).length) reportPresentationMode = false;
      upsertProject(state, project);
      toast(slide.hidden ? "Slajd ukryty w prezentacji i eksporcie HTML." : "Slajd ponownie widoczny.");
      render();
    });
  });

  panel.querySelector("#insertReportElement")?.addEventListener("click", () => {
    const slideId = panel.querySelector("#insertReportElement")?.dataset.insertReportElement;
    const insertType = panel.querySelector("#reportInsertType")?.value || "bullet";
    if (!insertReportElement(project, slideId, insertType)) return;
    upsertProject(state, project);
    toast(insertType === "table" ? "Wstawiono tabelę na slajdzie." : "Wstawiono element na slajdzie.");
    render();
  });
}

function bindReportEvents(project) {
  bindReportAutoActiveSlide(project);

  app.querySelector("#generateReportDeck")?.addEventListener("click", () => {
    const settings = project.reportDeck ? getReportDeckSettings(project) : defaultReportDeckSettings();
    archiveCurrentReportVersion(project);
    project.reportDeck = buildReportDeck(project);
    project.reportDeck.settings = settings;
    activeReportSlideId = project.reportDeck.slides[0]?.id || "";
    upsertProject(state, project);
    toast(`Wygenerowano ${project.reportDeck.slides.length} slajdów z dostępnych danych.`);
    render();
  });

  app.querySelector("#activeReportSlideSelect")?.addEventListener("change", (event) => {
    selectReportSlide(project, event.target.value);
  });

  app.querySelectorAll("[data-select-report-slide]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      selectReportSlide(project, link.dataset.selectReportSlide);
    });
  });

  app.querySelectorAll(".report-slide[data-slide-id]").forEach((slideElement) => {
    slideElement.addEventListener("click", (event) => {
      if (event.target.closest(".editable, button, select, input, label, a")) return;
      const slideId = slideElement.dataset.slideId;
      if (!slideId || slideId === activeReportSlideId) return;
      activateReportSlideInPlace(project, slideId);
    });
    slideElement.addEventListener("focus", () => {
      const slideId = slideElement.dataset.slideId;
      if (!slideId || slideId === activeReportSlideId) return;
      activateReportSlideInPlace(project, slideId);
    });
    slideElement.addEventListener("focusin", () => {
      const slideId = slideElement.dataset.slideId;
      if (!slideId || slideId === activeReportSlideId) return;
      activateReportSlideInPlace(project, slideId);
    });
  });

  app.querySelector("#reportDeckTheme")?.addEventListener("change", (event) => {
    if (!project.reportDeck) return;
    const settings = getReportDeckSettings(project);
    settings.theme = normalizeReportSlideTheme(event.target.value);
    upsertProject(state, project);
    toast("Zmieniono motyw raportu.");
    render();
  });

  app.querySelector("#toggleReportNotes")?.addEventListener("click", () => {
    if (!project.reportDeck) return;
    const settings = getReportDeckSettings(project);
    settings.showNotes = settings.showNotes === false;
    upsertProject(state, project);
    toast(settings.showNotes ? "Notatki są widoczne." : "Notatki ukryte w edytorze.");
    render();
  });

  app.querySelector("#addReportSlide")?.addEventListener("click", () => {
    addReportSlideFromSelectedTemplate(project, app);
  });

  app.querySelector("#openPresentationMode")?.addEventListener("click", () => {
    const visibleSlides = getVisibleReportSlides(project);
    if (!visibleSlides.length) {
      toast("Brak widocznych slajdów do prezentacji.");
      return;
    }
    const activeVisibleIndex = visibleSlides.findIndex((slide) => slide.id === activeReportSlideId);
    presentationSlideIndex = activeVisibleIndex >= 0 ? activeVisibleIndex : 0;
    reportPresentationMode = true;
    render();
  });

  app.querySelector("#closePresentationMode")?.addEventListener("click", () => {
    reportPresentationMode = false;
    render();
  });

  app.querySelectorAll("[data-presentation-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const visibleSlides = getVisibleReportSlides(project);
      const step = Number(button.dataset.presentationStep) || 0;
      presentationSlideIndex = Math.min(Math.max(presentationSlideIndex + step, 0), Math.max(visibleSlides.length - 1, 0));
      render();
    });
  });

  app.querySelectorAll("[data-duplicate-report-slide]").forEach((button) => {
    button.addEventListener("click", () => {
      const slides = project.reportDeck?.slides || [];
      const index = slides.findIndex((slide) => slide.id === button.dataset.duplicateReportSlide);
      if (index < 0) return;
      const copy = cloneReportSlide(slides[index]);
      copy.title = `${copy.title || "Slajd"} - kopia`;
      slides.splice(index + 1, 0, copy);
      activeReportSlideId = copy.id;
      upsertProject(state, project);
      toast("Slajd zduplikowany.");
      render();
    });
  });

  app.querySelectorAll("[data-toggle-report-slide-hidden]").forEach((button) => {
    button.addEventListener("click", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === button.dataset.toggleReportSlideHidden);
      if (!slide) return;
      slide.hidden = !slide.hidden;
      if (reportPresentationMode && !getVisibleReportSlides(project).length) reportPresentationMode = false;
      upsertProject(state, project);
      toast(slide.hidden ? "Slajd ukryty w prezentacji i eksporcie HTML." : "Slajd ponownie widoczny.");
      render();
    });
  });

  app.querySelectorAll("[data-move-report-slide]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!moveReportSlide(project, button.dataset.moveReportSlide, button.dataset.moveDirection)) return;
      upsertProject(state, project);
      toast("Zmieniono kolejność slajdów.");
      render();
    });
  });

  app.querySelectorAll("[data-add-report-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === button.dataset.addReportItem);
      const list = slide ? getPrimaryReportSlideList(slide) : null;
      if (!slide || !list) return;
      list.push(createReportSlideItem(slide));
      upsertProject(state, project);
      toast("Dodano element do slajdu.");
      render();
    });
  });

  app.querySelector("#insertReportElement")?.addEventListener("click", () => {
    const slideId = app.querySelector("#insertReportElement")?.dataset.insertReportElement;
    const insertType = app.querySelector("#reportInsertType")?.value || "bullet";
    if (!insertReportElement(project, slideId, insertType)) return;
    upsertProject(state, project);
    toast(insertType === "table" ? "Wstawiono tabelę na slajdzie." : "Wstawiono element na slajdzie.");
    render();
  });

  app.querySelectorAll("[data-report-slide-layout]").forEach((select) => {
    select.addEventListener("change", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === select.dataset.reportSlideLayout);
      if (!slide) return;
      slide.layout = normalizeReportSlideLayout(select.value);
      upsertProject(state, project);
      toast("Zmieniono układ slajdu.");
      render();
    });
  });

  app.querySelectorAll("[data-report-slide-theme]").forEach((select) => {
    select.addEventListener("change", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === select.dataset.reportSlideTheme);
      if (!slide) return;
      slide.theme = normalizeReportSlideTheme(select.value);
      upsertProject(state, project);
      toast("Zmieniono motyw slajdu.");
      render();
    });
  });

  app.querySelectorAll("[data-report-slide-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === select.dataset.reportSlideStatus);
      if (!slide) return;
      slide.status = normalizeReportSlideStatus(select.value);
      upsertProject(state, project);
      toast("Zmieniono status slajdu.");
      render();
    });
  });

  app.querySelectorAll("[data-report-slide-hidden]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const slide = project.reportDeck?.slides?.find((item) => item.id === checkbox.dataset.reportSlideHidden);
      if (!slide) return;
      slide.hidden = checkbox.checked;
      if (reportPresentationMode && !getVisibleReportSlides(project).length) reportPresentationMode = false;
      upsertProject(state, project);
      toast(slide.hidden ? "Slajd ukryty w prezentacji i eksporcie HTML." : "Slajd ponownie widoczny.");
      render();
    });
  });

  app.querySelectorAll("[data-delete-report-slide]").forEach((button) => {
    button.addEventListener("click", () => {
      deleteReportSlideById(project, button.dataset.deleteReportSlide);
    });
  });

  app.querySelectorAll("[data-report-field]").forEach((element) => {
    element.addEventListener("input", () => updateReportSlideField(project, element));
    element.addEventListener("blur", () => {
      updateReportSlideField(project, element);
      upsertProject(state, project);
    });
  });

  app.querySelectorAll("[data-item-field]").forEach((element) => {
    element.addEventListener("input", () => updateReportSlideItem(project, element));
    element.addEventListener("blur", () => {
      updateReportSlideItem(project, element);
      upsertProject(state, project);
    });
  });

  app.querySelector("#downloadMarkdownReport")?.addEventListener("click", () => {
    downloadText(`${project.client}-${project.name}.md`, buildMarkdownReport(project), "text/markdown;charset=utf-8");
  });

  app.querySelector("#downloadHtmlReport")?.addEventListener("click", () => {
    downloadText(`${project.client}-${project.name}.html`, buildHtmlReport(project), "text/html;charset=utf-8");
  });
}

function bindSegmentsEvents() {
  app.querySelector("#segmentCompareColumn")?.addEventListener("change", (event) => {
    segmentCompareState.segmentColumn = event.target.value;
    render();
  });

  app.querySelector("#segmentCompareQuestion")?.addEventListener("change", (event) => {
    segmentCompareState.question = event.target.value;
    render();
  });
}

function archiveCurrentReportVersion(project) {
  if (!project.reportDeck?.slides?.length) return;
  project.reportVersions = Array.isArray(project.reportVersions) ? project.reportVersions : [];
  project.reportVersions.push({
    id: createId("report-version"),
    createdAt: project.reportDeck.generatedAt || new Date().toISOString(),
    archivedAt: new Date().toISOString(),
    slideCount: project.reportDeck.slides.length,
    title: project.reportDeck.slides[0]?.title || "Raport"
  });
}

function buildProjectHistoryGroups() {
  const groups = new Map();
  state.projects.forEach((project) => {
    const client = project.client || "Bez klienta";
    const projectName = project.projectGroup || project.name || "Bez nazwy projektu";
    const key = `${normalizeForLabel(client)}::${normalizeForLabel(projectName)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        client,
        projectName,
        surveys: []
      });
    }
    groups.get(key).surveys.push({
      project,
      summary: getMetricSummary(project),
      versionCount: getReportVersionCount(project),
      lastReportAt: getLastReportDate(project)
    });
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      surveys: group.surveys.sort((left, right) => compareSurveyWave(left.project, right.project))
    }))
    .sort((left, right) => left.client.localeCompare(right.client, "pl") || left.projectName.localeCompare(right.projectName, "pl"));
}

function buildClientHistoryGroups(projectGroups) {
  const clients = new Map();
  projectGroups.forEach((group) => {
    if (!clients.has(group.client)) {
      clients.set(group.client, {
        client: group.client,
        projectCount: 0,
        surveyCount: 0,
        responseCount: 0,
        versionCount: 0,
        projectNames: []
      });
    }
    const client = clients.get(group.client);
    client.projectCount += 1;
    client.surveyCount += group.surveys.length;
    client.responseCount += group.surveys.reduce((sum, survey) => sum + survey.summary.respondents, 0);
    client.versionCount += group.surveys.reduce((sum, survey) => sum + survey.versionCount, 0);
    client.projectNames.push(group.projectName);
  });
  return [...clients.values()].sort((left, right) => right.surveyCount - left.surveyCount || left.client.localeCompare(right.client, "pl"));
}

function compareSurveyWave(left, right) {
  const leftTime = Date.parse(left.createdAt || "");
  const rightTime = Date.parse(right.createdAt || "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
  return String(left.wave || "").localeCompare(String(right.wave || ""), "pl");
}

function getReportVersionCount(project) {
  return (project.reportDeck?.slides?.length ? 1 : 0) + (Array.isArray(project.reportVersions) ? project.reportVersions.length : 0);
}

function getLastReportDate(project) {
  const dates = [
    project.reportDeck?.generatedAt,
    ...(Array.isArray(project.reportVersions) ? project.reportVersions.map((version) => version.archivedAt || version.createdAt) : [])
  ].filter(Boolean);
  return dates.sort().at(-1) || "";
}

function renderReportVersionBadge(project) {
  const count = getReportVersionCount(project);
  if (!count) return `<span class="pill">brak</span>`;
  const last = getLastReportDate(project);
  return `<span class="pill blue">${count} wersji</span>${last ? `<br><span class="muted">${escapeHtml(formatDateTime(last))}</span>` : ""}`;
}

function renderSegmentComparisonTable(comparison) {
  return `
    <div class="table-wrap segment-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Grupa</th>
            <th>n</th>
            <th>Wynik / odpowiedź</th>
            <th>Różnica względem całości</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${comparison.groups.map((row) => `
            <tr class="${row.hidden ? "muted-row" : ""}">
              <td><strong>${escapeHtml(row.label)}</strong></td>
              <td>${row.respondentCount}</td>
              <td>${row.hidden ? "ukryte" : escapeHtml(formatSegmentSummaryValue(row.summary))}</td>
              <td>${row.hidden ? "-" : formatSegmentDelta(row.delta, row.summary.mode)}</td>
              <td>${row.hidden ? `<span class="pill amber">mała grupa</span>` : `<span class="pill ${segmentSummaryTone(row.summary)}">${escapeHtml(segmentSummaryStatus(row.summary))}</span>`}</td>
            </tr>
          `).join("") || `<tr><td colspan="5">Brak danych do porównania.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderStrongestSegmentProblem(comparison) {
  const row = comparison.strongestProblem;
  if (!row) {
    return `<div class="empty">Brak grup spełniających próg publikacji dla wybranego segmentu.</div>`;
  }

  return `
    <div class="segment-problem-card ${segmentSummaryTone(row.summary)}">
      <span class="pill ${segmentSummaryTone(row.summary)}">${escapeHtml(createReadableSegmentName(comparison.segment))}</span>
      <h3>${escapeHtml(row.label)}</h3>
      <p>${escapeHtml(formatStrongestProblemText(comparison, row))}</p>
      <div class="pill-row">
        <span class="pill">${row.respondentCount} osób w grupie</span>
        <span class="pill">${row.answerCount} odpowiedzi w analizie</span>
        <span class="pill">${escapeHtml(formatSegmentSummaryValue(row.summary))}</span>
      </div>
    </div>
  `;
}

function formatSegmentComparisonIntro(comparison) {
  if (!comparison.overall?.count) return "Brak odpowiedzi pasujących do wybranego pytania albo obszaru.";
  if (comparison.mode === "numeric") {
    return `Całościowa średnia dla wybranego zakresu wynosi ${formatNumber(comparison.overall.average)}. Tabela pokazuje odchylenie każdej grupy.`;
  }
  return `Całościowo najczęstsza odpowiedź to "${comparison.overall.topLabel || "brak"}" (${comparison.overall.topPercent || 0}%). Tabela pokazuje rozkład po grupach.`;
}

function formatStrongestProblemHint(comparison) {
  const row = comparison.strongestProblem;
  if (!row) return "brak widocznych grup";
  if (comparison.mode === "numeric") return `średnia ${formatNumber(row.summary.average)}`;
  if (row.summary.problemPercent) return `${row.summary.problemPercent}% odpowiedzi problemowych`;
  return `${row.summary.topPercent}%: ${row.summary.topLabel || "-"}`;
}

function formatStrongestProblemText(comparison, row) {
  if (comparison.mode === "numeric") {
    const delta = row.delta === null || row.delta === undefined ? "" : ` To ${formatSegmentDelta(row.delta, "numeric")} względem całości.`;
    return `Ta grupa ma najniższy wynik w wybranym zakresie: ${formatNumber(row.summary.average)} przy ${row.answerCount} odpowiedziach.${delta}`;
  }
  if (row.summary.problemPercent) {
    return `W tej grupie udział odpowiedzi problemowych jest najwyższy: ${row.summary.problemPercent}% (${row.summary.problemCount} z ${row.summary.count}).`;
  }
  return `Ta grupa ma najmocniej skoncentrowaną odpowiedź "${row.summary.topLabel || "-"}" (${row.summary.topPercent || 0}%). To sygnał do porównania z innymi grupami, nie automatyczna ocena ryzyka.`;
}

function formatSegmentSummaryValue(summary) {
  if (!summary || !summary.count) return "brak danych";
  if (summary.mode === "numeric") return `średnia ${formatNumber(summary.average)} (n=${summary.count})`;
  if (summary.mode === "categorical") {
    const problem = summary.problemPercent ? `; problemowe ${summary.problemPercent}%` : "";
    return `${summary.topLabel || "-"} ${summary.topPercent || 0}% (n=${summary.count})${problem}`;
  }
  return "brak danych";
}

function formatSegmentDelta(delta, mode = "numeric") {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "-";
  const prefix = delta > 0 ? "+" : "";
  const suffix = mode === "numeric" ? " pkt" : " pp";
  return `${prefix}${formatNumber(delta)}${suffix}`;
}

function segmentSummaryTone(summary) {
  if (!summary || !summary.count) return "";
  if (summary.mode === "numeric") {
    if (summary.average < 3.2) return "coral";
    if (summary.average < 3.8) return "amber";
    return "teal";
  }
  if ((summary.problemPercent || 0) >= 40) return "coral";
  if ((summary.problemPercent || 0) >= 20) return "amber";
  return "teal";
}

function segmentSummaryStatus(summary) {
  if (!summary || !summary.count) return "brak danych";
  if (summary.mode === "numeric") {
    if (summary.average < 3.2) return "problem";
    if (summary.average < 3.8) return "mieszany";
    return "mocny";
  }
  if ((summary.problemPercent || 0) >= 40) return "wysoki sygnał problemu";
  if ((summary.problemPercent || 0) >= 20) return "sygnał do sprawdzenia";
  return "bez silnego sygnału problemu";
}

function createReadableSegmentName(name) {
  const text = String(name || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Segment";
  const normalized = normalizeSegmentLabel(text);
  if (containsWholeSegmentTerm(normalized, "region") || normalized.includes("regionie")) return "Region pracy";
  if (containsWholeSegmentTerm(normalized, "stanowisko") || containsWholeSegmentTerm(normalized, "position") || containsWholeSegmentTerm(normalized, "job title")) return "Stanowisko";
  if (containsWholeSegmentTerm(normalized, "rola") || containsWholeSegmentTerm(normalized, "role")) return "Rola";
  if (containsWholeSegmentTerm(normalized, "dzial") || containsWholeSegmentTerm(normalized, "department")) return "Dział";
  if (containsWholeSegmentTerm(normalized, "lokalizacja") || containsWholeSegmentTerm(normalized, "location")) return "Lokalizacja";
  if (containsWholeSegmentTerm(normalized, "staz") || containsWholeSegmentTerm(normalized, "tenure") || containsWholeSegmentTerm(normalized, "seniority")) return "Staż";
  if (containsWholeSegmentTerm(normalized, "tryb pracy") || containsWholeSegmentTerm(normalized, "work mode")) return "Tryb pracy";
  if (containsWholeSegmentTerm(normalized, "zespol") || containsWholeSegmentTerm(normalized, "team")) return "Zespół";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeSegmentLabel(value) {
  return String(value)
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[_-]+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function containsWholeSegmentTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}($|\\s|\\?)`).test(text);
}

function shortLabelText(value, length = 36) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function formatDelta(value, usePoints = true) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  const prefix = value > 0 ? "+" : "";
  return `<span class="delta ${value > 0 ? "positive" : value < 0 ? "negative" : ""}">${prefix}${formatNumber(value)}${usePoints ? " pkt" : ""}</span>`;
}

function metric(label, value, hint) {
  return `
    <div class="metric">
      <div class="eyebrow">${escapeHtml(label)}</div>
      <strong>${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(hint)}</span>
    </div>
  `;
}

function surveyOptionLabel(project) {
  const source = project.sourceFile ? ` · ${project.sourceFile}` : "";
  return `${project.client} / ${project.name} / ${project.wave || "bez fali"} (${project.responses?.length || 0})${source}`;
}

function buildReportDeck(project) {
  const report = buildReportDraft(project);
  const summary = getMetricSummary(project);
  const stats = getQuestionStats(project);
  const topics = getTopics(project);
  const comments = collectComments(project);
  const pii = detectPii(project);
  const numericStats = stats.filter((item) => item.average !== null && item.average !== undefined);
  const topStats = [...numericStats].sort((a, b) => b.average - a.average).slice(0, 5);
  const bottomStats = [...numericStats].sort((a, b) => a.average - b.average).slice(0, 5);
  const riskStats = [...numericStats].sort((a, b) => a.average - b.average).slice(0, 8);
  const topTopics = topics.slice(0, 6);
  const segmentRows = buildReportSegmentRows(project);
  const enpsRows = buildReportEnpsRows(project);
  const slides = [
    {
      id: createId("slide"),
      type: "cover",
      layout: "cover",
      kicker: project.wave || "Raport z badania",
      title: `Wyniki badania opinii`,
      body: `${project.client} / ${project.name}. Raport roboczy z wynikami ankiety pracowniczej, przygotowany w formie edytowalnej prezentacji.`,
      notes: "Uzupełnij logo, datę prezentacji i kontekst organizacji."
    },
    {
      id: createId("slide"),
      type: "method",
      layout: "method",
      kicker: "Założenia badania",
      title: "Cel, metoda i uczestnicy",
      body: "Slajd opisuje ramy badania w układzie podobnym do raportu referencyjnego.",
      items: [
        { label: "Cel", text: "Zebranie informacji o ocenie pracy, współpracy, komunikacji, narzędzi, procesów oraz potrzebach zmian." },
        { label: "Metoda", text: "Badanie ankietowe online. Dane są analizowane lokalnie, a klasyfikacje AI wymagają przeglądu konsultanta." },
        { label: "Uczestnicy", text: `${summary.respondents} rekordów w aktywnej ankiecie: ${project.client}.` },
        { label: "Termin", text: project.wave || "Uzupełnij termin lub falę badania." }
      ],
      notes: "Dopasuj opis metody do faktycznego sposobu realizacji badania."
    },
    {
      id: createId("slide"),
      type: "metrics",
      layout: "metrics",
      kicker: "Frekwencja i materiał badawczy",
      title: "Skala badania",
      body: "Slajd zastępuje stronę frekwencji, gdy w danych nie ma pełnej listy zaproszonych osób.",
      items: [
        { label: "odpowiedzi w bazie", value: summary.respondents },
        { label: "komentarze otwarte", value: summary.comments },
        { label: "obszary tematyczne", value: topics.length },
        { label: "gotowość raportu", value: `${summary.readiness}%` }
      ],
      notes: "Jeżeli znasz liczbę zaproszonych osób, dopisz właściwą frekwencję procentową."
    },
    {
      id: createId("slide"),
      type: "comparison",
      layout: "comparison",
      kicker: "Najwyżej i najniżej oceniane zagadnienia",
      title: "Porównanie wyników pytań",
      body: "Układ pokazuje mocne i słabe obszary podobnie jak slajd top/bottom w raporcie referencyjnym.",
      top: topStats.map((item) => ({
        label: createReadableQuestionName(item.name),
        value: formatNumber(item.average)
      })),
      bottom: bottomStats.map((item) => ({
        label: createReadableQuestionName(item.name),
        value: formatNumber(item.average)
      })),
      notes: "Przy danych tekstowych bez skali liczbowej ten slajd wymaga ręcznej redakcji."
    },
    {
      id: createId("slide"),
      type: "segmentTable",
      layout: "table",
      kicker: "Średnia ocena po jednostkach",
      title: "Wyniki po segmentach",
      body: "Tabela pokazuje średnią lub dominujący sygnał w segmentach. Małe grupy należy agregować przed publikacją.",
      items: segmentRows,
      notes: "Sprawdź progi minimalnej liczebności przed pokazaniem wyników po jednostkach."
    },
    {
      id: createId("slide"),
      type: "enps",
      layout: "chart",
      kicker: "eNPS",
      title: "Wskaźnik lojalności pracowników",
      body: "Slajd jest przygotowany pod pytanie eNPS. Jeśli ankieta nie zawiera eNPS, wpisz właściwy wskaźnik ręcznie albo usuń slajd.",
      score: summary.enps === null || summary.enps === undefined ? "-" : signed(summary.enps),
      chart: {
        title: "eNPS po segmentach",
        values: enpsRows
      },
      notes: "Wskaźnik eNPS interpretuj wyłącznie na poziomie grup, nie pojedynczych osób."
    },
    {
      id: createId("slide"),
      type: "bars",
      layout: "chart",
      kicker: "Wyniki pytań",
      title: "Obszary z najwyższym ryzykiem",
      body: "Wykres pokazuje pytania liczbowe posortowane od najsłabszych wyników.",
      chart: {
        title: "Średnia odpowiedzi",
        values: riskStats.map((item) => ({
          label: createReadableQuestionName(item.name),
          value: item.average === null || item.average === undefined ? "-" : Number(item.average.toFixed(1)),
          tone: item.average !== null && item.average < 3.2 ? "coral" : item.average !== null && item.average < 3.8 ? "amber" : "teal"
        }))
      },
      notes: "Warto zestawić wynik liczbowy z komentarzami z tej samej kategorii."
    },
    {
      id: createId("slide"),
      type: "topics",
      layout: "chart",
      kicker: "Komentarze otwarte",
      title: "Najczęstsze tematy wypowiedzi",
      body: "Wykres pokazuje liczbę wypowiedzi przypisanych do tematów roboczych.",
      items: topTopics.map((topic) => ({
        label: topic.name,
        value: topic.comments.length,
        tone: topic.color
      })),
      notes: "Tematy są roboczą klasyfikacją AI i wymagają przeglądu konsultanta."
    },
    {
      id: createId("slide"),
      type: "bullets",
      layout: "standard",
      kicker: "Wnioski z komentarzy otwartych",
      title: "Synteza jakościowa",
      body: "Ten slajd odpowiada stronom z wnioskami z komentarzy otwartych w raporcie referencyjnym.",
      hasData: comments.length > 0,
      items: report.executiveSummary.map((text) => ({ text })),
      notes: "Rozdziel wnioski na konkretne obszary, jeśli raport ma być dłuższy."
    },
    {
      id: createId("slide"),
      type: "quotes",
      layout: "quotes",
      kicker: "Głos respondentów",
      title: "Przykładowe cytaty po redakcji",
      body: "Cytaty są zanonimizowane automatycznie i powinny zostać sprawdzone przed publikacją.",
      items: comments.slice(0, 4).map((comment) => ({
        label: createReadableQuestionName(comment.question),
        text: redactText(comment.text)
      })),
      notes: "Usuń cytaty, które mogłyby pośrednio identyfikować osobę lub mały zespół."
    },
    {
      id: createId("slide"),
      type: "checklist",
      layout: "checklist",
      kicker: "Kontrola danych i AI Act",
      title: "Ograniczenia i zasady użycia",
      body: "Raport powinien wspierać diagnozę organizacyjną, a nie decyzje kadrowe wobec pojedynczych osób.",
      items: [
        { text: "Nie używać raportu do oceny pojedynczych pracowników." },
        { text: `Ukrywać lub agregować grupy poniżej progu ${project.thresholds?.numeric || 5} osób.` },
        { text: "Przed publikacją sprawdzić potencjalne dane osobowe i cytaty." },
        { text: "Traktować klasyfikacje AI jako szkic wymagający przeglądu człowieka." }
      ],
      notes: "Ten slajd warto zostawić w wersji klientowskiej jako transparentne ograniczenia analizy."
    }
  ];

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    settings: defaultReportDeckSettings(),
    slides: slides.filter(shouldGenerateReportSlide).map(normalizeReportSlideForEditor)
  };
}

function normalizeReportSlideForEditor(slide) {
  return {
    ...slide,
    status: normalizeReportSlideStatus(slide.status),
    hidden: Boolean(slide.hidden)
  };
}

function shouldGenerateReportSlide(slide) {
  if (!slide) return false;
  if (slide.hasData === false) return false;
  if (["cover", "method", "metrics", "checklist"].includes(slide.type)) return true;
  if (slide.type === "comparison") return Boolean(slide.top?.length || slide.bottom?.length);
  if (slide.type === "segmentTable") return Boolean(slide.items?.length);
  if (slide.type === "enps") return slide.score !== "-" || Boolean(slide.chart?.values?.length);
  if (slide.type === "bars") return Boolean(slide.chart?.values?.length);
  if (slide.type === "tableGeneric") return Boolean(slide.items?.length);
  if (slide.type === "topics" || slide.type === "quotes" || slide.type === "bullets") return Boolean(slide.items?.length);
  return true;
}

function buildReportSegmentRows(project) {
  const heatmap = getHeatmap(project);
  if (!heatmap.segment || !heatmap.rows?.length) return [];
  return heatmap.rows.slice(0, 8).map((row) => {
    const numericCells = (row.cells || []).filter((cell) => Number.isFinite(cell.value) && cell.count > 0);
    if (numericCells.length) {
      const count = numericCells.reduce((sum, cell) => sum + cell.count, 0);
      const average = count ? numericCells.reduce((sum, cell) => sum + cell.value * cell.count, 0) / count : null;
      return {
        label: row.group,
        count: row.count,
        value: formatNumber(average),
        signal: average === null ? "brak danych" : average < 3.2 ? "wymaga uwagi" : average < 3.8 ? "mieszany" : "mocny",
        tone: average === null ? "" : average < 3.2 ? "coral" : average < 3.8 ? "amber" : "teal"
      };
    }
    const categorical = (row.cells || []).find((cell) => cell.label);
    return {
      label: row.group,
      count: row.count,
      value: categorical ? `${categorical.label} ${categorical.percent || 0}%` : "-",
      signal: categorical?.label || "brak danych",
      tone: categoricalCellClass(categorical)
    };
  });
}

function buildReportEnpsRows(project) {
  const segment = getColumns(project, "segment")[0];
  const enpsColumn = getColumns(project, "enps")[0];
  if (!segment || !enpsColumn) return [];
  const groups = new Map();
  (project.responses || []).forEach((row) => {
    const group = row[segment.name] || "Brak segmentu";
    const value = parseLocalNumber(row[enpsColumn.name]);
    if (value === null || value < 0 || value > 10) return;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(value);
  });
  return [...groups.entries()].map(([label, values]) => {
    const score = calculateEnps(values);
    return {
      label,
      value: score,
      tone: score < 0 ? "coral" : score < 20 ? "amber" : "teal"
    };
  });
}

function parseLocalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function createReportSlideFromTemplate(project, template, number) {
  if (template === "blank") return createBlankReportSlide(number);
  const generated = buildReportDeck(project).slides.find((slide) => slide.type === template);
  if (generated) return cloneReportSlide(generated);
  return createReportTemplateSkeleton(template, number);
}

function cloneReportSlide(slide) {
  return {
    ...JSON.parse(JSON.stringify(slide)),
    id: createId("slide"),
    status: "draft",
    hidden: false
  };
}

function createReportTemplateSkeleton(template, number) {
  const base = {
    id: createId("slide"),
    type: template,
    layout: "standard",
    status: "draft",
    hidden: false,
    kicker: "Nowy slajd",
    title: `Slajd ${number}`,
    body: "Uzupełnij treść slajdu po sprawdzeniu danych.",
    notes: "Notatka konsultanta."
  };

  if (template === "cover") {
    return {
      ...base,
      layout: "cover",
      kicker: "Raport z badania",
      title: "Wyniki badania opinii",
      body: "Uzupełnij klienta, nazwę badania i kontekst prezentacji."
    };
  }

  if (template === "method") {
    return {
      ...base,
      layout: "method",
      kicker: "Założenia badania",
      title: "Cel, metoda i uczestnicy",
      items: [
        { label: "Cel", text: "Uzupełnij cel badania." },
        { label: "Metoda", text: "Uzupełnij sposób realizacji." },
        { label: "Uczestnicy", text: "Uzupełnij liczebność i zakres próby." },
        { label: "Termin", text: "Uzupełnij datę lub falę badania." }
      ]
    };
  }

  if (template === "metrics") {
    return {
      ...base,
      layout: "metrics",
      kicker: "Frekwencja i materiał badawczy",
      title: "Skala badania",
      items: [
        { label: "odpowiedzi w bazie", value: "-" },
        { label: "komentarze otwarte", value: "-" },
        { label: "obszary tematyczne", value: "-" },
        { label: "gotowość raportu", value: "-" }
      ]
    };
  }

  if (template === "comparison") {
    return {
      ...base,
      layout: "comparison",
      kicker: "Najwyżej i najniżej oceniane zagadnienia",
      title: "Porównanie wyników pytań",
      top: [{ label: "Uzupełnij mocny obszar", value: "-" }],
      bottom: [{ label: "Uzupełnij obszar do poprawy", value: "-" }]
    };
  }

  if (template === "segmentTable") {
    return {
      ...base,
      layout: "table",
      kicker: "Wyniki po segmentach",
      title: "Porównanie segmentów",
      items: [{ label: "Segment", count: "-", value: "-", signal: "uzupełnij" }]
    };
  }

  if (template === "tableGeneric") {
    return {
      ...base,
      type: "tableGeneric",
      layout: "table",
      kicker: "Tabela robocza",
      title: "Tabela do uzupełnienia",
      body: "Wpisz własne porównanie, plan działań albo zestawienie wyników.",
      items: createDefaultReportTableRows()
    };
  }

  if (template === "enps") {
    return {
      ...base,
      layout: "chart",
      kicker: "eNPS",
      title: "Wskaźnik lojalności pracowników",
      score: "-",
      chart: {
        title: "eNPS po segmentach",
        values: [{ label: "Segment", value: 0, tone: "amber" }]
      }
    };
  }

  if (template === "bars") {
    return {
      ...base,
      layout: "chart",
      kicker: "Wykres wyników",
      title: "Wyniki pytań",
      chart: {
        title: "Średnia odpowiedzi",
        values: [{ label: "Obszar", value: 0, tone: "amber" }]
      }
    };
  }

  if (template === "topics") {
    return {
      ...base,
      layout: "chart",
      kicker: "Komentarze otwarte",
      title: "Najczęstsze tematy wypowiedzi",
      items: [{ label: "Temat", value: 0, tone: "blue" }]
    };
  }

  if (template === "quotes") {
    return {
      ...base,
      layout: "quotes",
      kicker: "Głos respondentów",
      title: "Przykładowe cytaty po redakcji",
      items: [{ label: "Obszar pytania", text: "Wklej zanonimizowany cytat." }]
    };
  }

  if (template === "checklist") {
    return {
      ...base,
      layout: "checklist",
      kicker: "Kontrola danych",
      title: "Ograniczenia i zasady użycia",
      items: [
        { text: "Sprawdź małe grupy przed publikacją." },
        { text: "Sprawdź cytaty pod kątem danych osobowych." },
        { text: "Potwierdź, że AI pełni rolę pomocniczą." }
      ]
    };
  }

  return {
    ...base,
    type: "bullets",
    items: [
      { text: "Dodaj wniosek." },
      { text: "Dodaj rekomendację." }
    ]
  };
}

function createDefaultReportTableRows() {
  return [
    { label: "Obszar 1", value: "-", text: "Uzupełnij opis.", signal: "robocze" },
    { label: "Obszar 2", value: "-", text: "Uzupełnij opis.", signal: "robocze" },
    { label: "Obszar 3", value: "-", text: "Uzupełnij opis.", signal: "robocze" }
  ];
}

function createBlankReportSlide(number) {
  return {
    id: createId("slide"),
    type: "bullets",
    layout: "standard",
    status: "draft",
    hidden: false,
    kicker: "Nowy slajd",
    title: `Slajd ${number}`,
    body: "Wpisz treść slajdu.",
    items: [
      { text: "Nowy punkt do edycji." },
      { text: "Dodaj własny wniosek albo rekomendację." }
    ],
    notes: "Notatka konsultanta."
  };
}

function moveReportSlide(project, slideId, direction) {
  const slides = project.reportDeck?.slides || [];
  const index = slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) return false;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= slides.length) return false;
  const [slide] = slides.splice(index, 1);
  slides.splice(targetIndex, 0, slide);
  return true;
}

function getPrimaryReportSlideList(slide) {
  if (!slide) return null;
  if (Array.isArray(slide.items)) return slide.items;
  if (slide.type === "bars" || slide.type === "enps") {
    slide.chart = slide.chart || {};
    slide.chart.values = Array.isArray(slide.chart.values) ? slide.chart.values : [];
    return slide.chart.values;
  }
  return null;
}

function insertReportElement(project, slideId, insertType) {
  const slide = project.reportDeck?.slides?.find((item) => item.id === slideId);
  if (!slide) return false;

  const type = reportInsertOptions.some(([value]) => value === insertType) ? insertType : "bullet";

  if (type === "table") {
    slide.type = "tableGeneric";
    slide.layout = "table";
    slide.items = Array.isArray(slide.items) && slide.items.length ? slide.items : createDefaultReportTableRows();
    if (!slide.kicker || slide.kicker === "Nowy slajd") slide.kicker = "Tabela robocza";
    if (!slide.title || /^Slajd\s+\d+$/i.test(slide.title)) slide.title = "Tabela do uzupełnienia";
    return true;
  }

  if (type === "metric") {
    slide.type = "metrics";
    slide.layout = "metrics";
    slide.items = Array.isArray(slide.items) ? slide.items : [];
    slide.items.push({ label: "Nowa metryka", value: "-" });
    return true;
  }

  if (type === "quote") {
    slide.type = "quotes";
    slide.layout = "quotes";
    slide.items = Array.isArray(slide.items) ? slide.items : [];
    slide.items.push({ label: "Obszar pytania", text: "Wklej zanonimizowany cytat." });
    return true;
  }

  if (type === "check") {
    slide.type = "checklist";
    slide.layout = "checklist";
    slide.items = Array.isArray(slide.items) ? slide.items : [];
    slide.items.push({ text: "Dodaj punkt kontrolny." });
    return true;
  }

  slide.type = "bullets";
  slide.layout = slide.layout === "table" || slide.layout === "chart" || slide.layout === "quotes" ? "standard" : normalizeReportSlideLayout(slide.layout);
  slide.items = Array.isArray(slide.items) ? slide.items : [];
  slide.items.push({ text: "Dodaj wniosek albo rekomendację." });
  return true;
}

function createReportSlideItem(slide) {
  if (slide.type === "metrics") return { label: "Nowa metryka", value: "-" };
  if (slide.type === "method") return { label: "Nowy obszar", text: "Uzupełnij opis." };
  if (slide.type === "topics") return { label: "Nowy temat", value: 0, tone: "blue" };
  if (slide.type === "quotes") return { label: "Obszar pytania", text: "Wklej zanonimizowany cytat." };
  if (slide.type === "checklist") return { text: "Dodaj punkt kontroli." };
  if (slide.type === "tableGeneric") return { label: "Nowy obszar", value: "-", text: "Uzupełnij opis.", signal: "robocze" };
  if (slide.type === "bars" || slide.type === "enps") return { label: "Nowa seria", value: 0, tone: "amber" };
  return { text: "Dodaj wniosek albo rekomendację." };
}

function updateReportSlideField(project, element) {
  const slide = findSlideFromElement(project, element);
  const field = element.dataset.reportField;
  if (!slide || !field) return;
  slide[field] = element.innerText.trim();
}

function updateReportSlideItem(project, element) {
  const slide = findSlideFromElement(project, element);
  const container = element.closest("[data-editable-list]");
  const field = element.dataset.itemField;
  if (!slide || !container || !field) return;

  const listPath = container.dataset.editableList;
  const index = Number(container.dataset.itemIndex);
  const list = getSlideList(slide, listPath);
  if (!list || !list[index]) return;
  list[index][field] = element.innerText.trim();
}

function findSlideFromElement(project, element) {
  const slideId = element.closest("[data-slide-id]")?.dataset.slideId;
  return project.reportDeck?.slides?.find((slide) => slide.id === slideId);
}

function getSlideList(slide, path) {
  if (path === "items") return slide.items;
  if (path === "top") return slide.top;
  if (path === "bottom") return slide.bottom;
  if (path === "chart.values") {
    slide.chart = slide.chart || { values: [] };
    slide.chart.values = slide.chart.values || [];
    return slide.chart.values;
  }
  return null;
}

function getSmallSegments(project, threshold) {
  const segment = project.schema?.columns?.find((column) => column.type === "segment");
  if (!segment) return [];
  const counts = {};
  project.responses.forEach((row) => {
    const key = row[segment.name] || "Brak segmentu";
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).filter(([, count]) => count < threshold);
}

function getQuestionOptionsForTheme(theme) {
  if (!theme) return [];
  const areas = new Map();

  const ensureArea = (displayName) => {
    if (!areas.has(displayName)) {
      areas.set(displayName, {
        type: "area",
        value: createQuestionFilterValue("area", displayName),
        displayName,
        label: "",
        count: 0,
        sourceQuestions: [],
        scaleQuestions: [],
        comments: []
      });
    }
    return areas.get(displayName);
  };

  theme.scaleQuestions.forEach((question) => {
    const displayName = createReadableQuestionName(question.name);
    const area = ensureArea(displayName);
    area.scaleQuestions.push({
      ...question,
      displayName,
      summary: question.simplified
    });
    area.sourceQuestions.push(question.name);
    area.count += question.count || 0;
  });

  theme.comments.forEach((comment) => {
    const displayName = createReadableQuestionName(comment.question);
    const area = ensureArea(displayName);
    area.comments.push(comment);
    if (!area.sourceQuestions.includes(comment.question)) area.sourceQuestions.push(comment.question);
    area.count += 1;
  });

  return [...areas.values()]
    .map((area) => ({
      ...area,
      count: area.comments.length || area.count,
      sourceQuestions: [...new Set(area.sourceQuestions)],
      label: `${area.displayName} (${area.comments.length || area.count})`
    }))
    .sort((left, right) => {
      return right.count - left.count || left.displayName.localeCompare(right.displayName, "pl");
    });
}

function createReadableQuestionName(question) {
  const normalized = normalizeForLabel(question);
  const openQuestionMappings = [
    [["przeszkadza", "bariera", "problem", "utrudnia"], "Największe przeszkody"],
    [["poprawic", "usprawn", "zmienic", "warto poprawic"], "Propozycje usprawnień"],
    [["dziala dobrze", "najlepiej", "mocne strony", "pomaga"], "Mocne strony"]
  ];
  const openMatch = openQuestionMappings.find(([keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  if (openMatch && /^(co|jakie|jaka|jaki|czego|gdzie)\s/i.test(String(question).trim())) {
    return openMatch[1];
  }

  const cleaned = String(question)
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return cleaned || "Pytanie ankietowe";
}

function formatReadableQuestionSummary(question) {
  const label = question.displayName || createReadableQuestionName(question.name);
  const average = question.average;
  if (average === null || average === undefined) {
    return `Brak wystarczających odpowiedzi w obszarze "${label}".`;
  }
  if (average < 3.2) {
    return `Odpowiedzi wskazują wyraźny problem w obszarze "${label}". Warto pogłębić go w komentarzach.`;
  }
  if (average < 3.8) {
    return `Odpowiedzi są niejednoznaczne w obszarze "${label}". Warto sprawdzić segmenty i komentarze.`;
  }
  return `Odpowiedzi tworzą korzystny sygnał w obszarze "${label}". To może być mocny punkt ankiety.`;
}

function normalizeForLabel(value) {
  return String(value)
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function validateAnalysisCategory(themes) {
  if (analysisFilters.category !== "__all" && !themes.some((theme) => theme.id === analysisFilters.category)) {
    analysisFilters.category = "__all";
    analysisFilters.question = "__all";
  }
}

function validateAnalysisQuestion(questionOptions) {
  if (analysisFilters.category === "__all") {
    analysisFilters.question = "__all";
    return;
  }
  if (analysisFilters.question !== "__all" && !questionOptions.some((question) => question.value === analysisFilters.question)) {
    analysisFilters.question = "__all";
  }
}

function filterAndSortThemes(themes) {
  return [...themes]
    .filter((theme) => analysisFilters.category === "__all" || theme.id === analysisFilters.category)
    .sort((a, b) => sortThemeCompare(a, b));
}

function filterAndSortScaleItems(items) {
  const selectedArea = parseQuestionFilterValue(analysisFilters.question);
  return [...items]
    .filter((item) => analysisFilters.category === "__all" || item.themeId === analysisFilters.category)
    .filter((item) => !selectedArea || selectedArea.type !== "area" || createReadableQuestionName(item.name) === selectedArea.name)
    .sort((a, b) => sortQuestionCompare(a, b));
}

function getSelectedAnalysisTheme(themes) {
  if (analysisFilters.category === "__all") return null;
  return themes.find((theme) => theme.id === analysisFilters.category) || null;
}

function getSelectedAnalysisQuestion(questionOptions) {
  if (analysisFilters.question === "__all") return null;
  return questionOptions.find((question) => question.value === analysisFilters.question) || null;
}

function createQuestionFilterValue(type, name) {
  return `${type}::${encodeURIComponent(name)}`;
}

function parseQuestionFilterValue(value) {
  if (!value || value === "__all") return null;
  const [type, encodedName] = value.split("::");
  if (!type || !encodedName) return null;
  return { type, name: decodeURIComponent(encodedName) };
}

function formatSegments(segments) {
  return Object.entries(segments || {})
    .slice(0, 3)
    .filter(([, value]) => value)
    .map(([key, value]) => `${createReadableSegmentName(key)}: ${value}`)
    .join(" · ");
}

function summarizeAreaAnswers(theme, area, scaleAnswers, comments) {
  const answers = [
    ...scaleAnswers.map((answer) => String(answer.value || "").trim()),
    ...comments.map((comment) => String(comment.text || "").trim())
  ].filter(Boolean);
  const questionContext = getAreaQuestionContext(area);
  if (!answers.length) {
    return {
      lead: `Brak odpowiedzi do wyciągnięcia wniosku dla: ${questionContext}.`,
      body: "",
      groups: []
    };
  }

  const numeric = answers.map((answer) => Number(answer.replace(",", "."))).filter((value) => Number.isFinite(value));
  if (numeric.length >= Math.max(2, Math.round(answers.length * 0.6))) {
    const average = numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
    const conclusion = average >= 3.8
      ? "wynik jest raczej mocny"
      : average >= 3.2
        ? "wynik jest mieszany i wymaga sprawdzenia komentarzy"
        : "wynik wymaga uwagi";
    return {
      lead: `Wniosek: ${conclusion}.`,
      body: `Dla ${questionContext} średnia z ${numeric.length} odpowiedzi liczbowych wynosi ${formatNumber(average)}.`,
      groups: [
        { label: "średnia", value: formatNumber(average), tone: average < 3.2 ? "coral" : average < 3.8 ? "amber" : "teal" },
        { label: "odpowiedzi liczbowe", value: numeric.length, tone: "" }
      ]
    };
  }

  const closed = summarizeClosedAnswers(answers, area);
  if (closed) {
    return {
      lead: closed.lead,
      body: `Dla ${questionContext}: ${closed.body} Najczęstsze wartości: ${closed.topAnswers}.`,
      groups: closed.groups
    };
  }

  const keywords = getTopAnswerKeywords(answers, area.sourceQuestions);
  const topicPart = keywords.length ? ` Najczęściej wracają sygnały: ${keywords.join(", ")}.` : "";
  return {
    lead: "Wniosek: odpowiedzi mają charakter jakościowy i wymagają interpretacji tematycznej.",
    body: `AI przeanalizowało ${answers.length} wypowiedzi dla ${questionContext} i przypisało je do kategorii "${theme.name}".${topicPart}`,
    groups: [
      { label: "wypowiedzi", value: answers.length, tone: "" }
    ]
  };
}

function getAreaQuestionContext(area) {
  const questions = area.sourceQuestions || [];
  if (questions.length === 1) return `pytania "${questions[0]}"`;
  if (questions.length > 1) return `grupy ${questions.length} powiązanych pytań, m.in. "${questions[0]}"`;
  return `obszaru "${area.displayName}"`;
}

function formatSourceQuestionCount(count) {
  if (count === 1) return "1 pytanie źródłowe";
  if ([2, 3, 4].includes(count)) return `${count} pytania źródłowe`;
  return `${count} pytań źródłowych`;
}

function summarizeClosedAnswers(answers, area) {
  const exact = buildExactAnswerCounts(answers);
  const scale = chooseClosedScale(answers, area);
  if (!scale) return summarizeGenericClosedAnswers(answers, exact);

  const { lead, body } = describeClosedScale(scale.definition.id, scale.counts, scale.total);
  return {
    lead: `Wniosek: ${lead}.`,
    body,
    groups: scale.definition.buckets
      .map((bucket) => ({
        label: bucket.label,
        value: scale.counts[bucket.id] || 0,
        tone: bucket.tone
      }))
      .filter((group) => group.value > 0 || scale.definition.keepZeroLabels?.includes(group.label)),
    topAnswers: formatExactAnswerCounts(exact)
  };
}

function chooseClosedScale(answers, area) {
  const context = normalizeClosedAnswer([area.displayName, ...(area.sourceQuestions || [])].join(" "));
  const minClassified = Math.max(2, Math.round(answers.length * 0.45));
  const candidates = closedScaleDefinitions()
    .map((definition) => {
      const counts = Object.fromEntries(definition.buckets.map((bucket) => [bucket.id, 0]));
      answers.forEach((answer) => {
        const bucket = findScaleBucket(definition, normalizeClosedAnswer(answer));
        if (bucket) counts[bucket.id] += 1;
      });
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      const contextMatch = definition.contextKeywords.some((keyword) => context.includes(keyword));
      return {
        definition,
        counts,
        total,
        coverage: answers.length ? total / answers.length : 0,
        contextMatch
      };
    })
    .filter((candidate) => candidate.total >= minClassified || (candidate.contextMatch && candidate.total >= 2))
    .sort((left, right) => {
      if (left.contextMatch !== right.contextMatch) return left.contextMatch ? -1 : 1;
      if (left.coverage !== right.coverage) return right.coverage - left.coverage;
      return right.total - left.total;
    });

  return candidates[0] || null;
}

function summarizeGenericClosedAnswers(answers, exact) {
  const distribution = [...exact.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "pl"));
  if (!distribution.length) return null;

  const uniqueLimit = Math.min(10, Math.max(5, Math.ceil(answers.length * 0.8)));
  const averageLength = answers.reduce((sum, answer) => sum + String(answer).length, 0) / answers.length;
  if (distribution.length > uniqueLimit || averageLength > 90) return null;

  const [topAnswer, topCount] = distribution[0];
  return {
    lead: `Wniosek: najczęściej pojawia się odpowiedź "${topAnswer}" (${topCount} z ${answers.length}).`,
    body: "To pytanie nie wygląda na prostą skalę tak/nie, dlatego pokazuję rozkład najczęstszych wartości bez wymuszania jednej interpretacji.",
    groups: distribution.slice(0, 6).map(([answer, count], index) => ({
      label: answer,
      value: count,
      tone: index === 0 ? "teal" : ""
    })),
    topAnswers: formatExactAnswerCounts(exact)
  };
}

function buildExactAnswerCounts(answers) {
  const exact = new Map();
  answers.forEach((answer) => {
    const text = String(answer || "").trim();
    if (text) exact.set(text, (exact.get(text) || 0) + 1);
  });
  return exact;
}

function normalizeClosedAnswer(answer) {
  return normalizeForLabel(answer)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function closedScaleDefinitions() {
  return [
    {
      id: "importance",
      contextKeywords: ["waznosc", "wazne", "priorytet", "znaczenie", "istotn"],
      keepZeroLabels: ["ważne", "nieważne"],
      buckets: [
        { id: "veryHigh", label: "bardzo ważne", tone: "teal", values: ["bardzo wazne", "kluczowe", "najwazniejsze"] },
        { id: "high", label: "ważne", tone: "teal", values: ["wazne", "raczej wazne", "istotne"] },
        { id: "medium", label: "umiarkowane", tone: "amber", values: ["umiarkowanie wazne", "srednio wazne", "przecietnie wazne", "neutralnie wazne"] },
        { id: "low", label: "mało ważne", tone: "coral", values: ["malo wazne", "raczej niewazne", "raczej nie wazne", "nisko wazne"] },
        { id: "none", label: "nieważne", tone: "coral", values: ["niewazne", "nie wazne", "w ogole niewazne", "w ogole nie wazne", "bez znaczenia"] }
      ]
    },
    {
      id: "frequency",
      contextKeywords: ["czesto", "czestotliwosc", "regularnie", "jak czesto", "ile razy"],
      buckets: [
        { id: "always", label: "zawsze", tone: "teal", values: ["zawsze"] },
        { id: "often", label: "często", tone: "teal", values: ["czesto", "bardzo czesto", "regularnie"] },
        { id: "sometimes", label: "czasami", tone: "amber", values: ["czasami", "od czasu do czasu", "sporadycznie"] },
        { id: "rarely", label: "rzadko", tone: "coral", values: ["rzadko", "bardzo rzadko"] },
        { id: "never", label: "nigdy", tone: "coral", values: ["nigdy"] }
      ]
    },
    {
      id: "agreement",
      contextKeywords: ["zgadzasz", "zgadzam", "stopniu sie zgadzasz", "czy uwazasz", "na ile zgadzasz"],
      buckets: [
        { id: "strongAgree", label: "zdecydowana zgoda", tone: "teal", values: ["zdecydowanie sie zgadzam", "zdecydowanie zgadzam sie"] },
        { id: "agree", label: "zgoda", tone: "teal", values: ["zgadzam sie", "raczej sie zgadzam", "raczej zgadzam sie"] },
        { id: "neutral", label: "neutralnie", tone: "amber", values: ["ani tak ani nie", "neutralnie", "trudno powiedziec", "nie wiem", "brak zdania"] },
        { id: "disagree", label: "brak zgody", tone: "coral", values: ["nie zgadzam sie", "raczej sie nie zgadzam", "raczej nie zgadzam sie"] },
        { id: "strongDisagree", label: "zdecydowany brak zgody", tone: "coral", values: ["zdecydowanie sie nie zgadzam", "zdecydowanie nie zgadzam sie"] }
      ]
    },
    {
      id: "satisfaction",
      contextKeywords: ["oceniasz", "ocena", "jakosc", "zadowol", "satysfakc", "doswiadczenie"],
      buckets: [
        { id: "veryGood", label: "bardzo dobrze", tone: "teal", values: ["bardzo dobrze", "bardzo dobra", "swietnie", "świetnie"] },
        { id: "good", label: "dobrze", tone: "teal", values: ["dobrze", "dobra", "raczej dobrze"] },
        { id: "average", label: "średnio", tone: "amber", values: ["srednio", "przecietnie", "neutralnie", "ani dobrze ani zle"] },
        { id: "bad", label: "źle", tone: "coral", values: ["zle", "źle", "raczej zle"] },
        { id: "veryBad", label: "bardzo źle", tone: "coral", values: ["bardzo zle", "bardzo źle"] }
      ]
    },
    {
      id: "likelihood",
      contextKeywords: ["sklonny", "sklonna", "gotow", "czy korzystal", "czy bylbys", "czy bylabys", "chetnie"],
      buckets: [
        { id: "high", label: "wysoka gotowość", tone: "teal", values: ["tak", "raczej tak", "zdecydowanie tak", "bardzo chetnie", "chetnie"] },
        { id: "uncertain", label: "warunkowa gotowość", tone: "amber", values: ["moze", "trudno powiedziec", "nie wiem", "to zalezy", "brak zdania"] },
        { id: "low", label: "niska gotowość", tone: "coral", values: ["nie", "raczej nie", "zdecydowanie nie"] }
      ]
    },
    {
      id: "confirmation",
      contextKeywords: ["czy ", "czyli", "potwierdz", "weryfik"],
      keepZeroLabels: ["potwierdza", "zaprzecza"],
      buckets: [
        { id: "confirm", label: "potwierdza", tone: "teal", values: ["tak", "raczej tak", "zdecydowanie tak"] },
        { id: "unclear", label: "niejednoznaczne", tone: "amber", values: ["moze", "trudno powiedziec", "nie wiem", "brak zdania"] },
        { id: "deny", label: "zaprzecza", tone: "coral", values: ["nie", "raczej nie", "zdecydowanie nie"] }
      ]
    }
  ];
}

function findScaleBucket(definition, normalized) {
  return definition.buckets.find((bucket) => {
    return bucket.values.some((value) => {
      if (normalized === value) return true;
      return normalized.startsWith(`${value} `) || normalized.startsWith(`${value},`) || normalized.startsWith(`${value}.`);
    });
  });
}

function describeClosedScale(scaleId, counts, total) {
  if (scaleId === "importance") return describeImportanceScale(counts, total);
  if (scaleId === "frequency") return describeFrequencyScale(counts, total);
  if (scaleId === "agreement") return describeAgreementScale(counts, total);
  if (scaleId === "satisfaction") return describeSatisfactionScale(counts, total);
  if (scaleId === "likelihood") return describeLikelihoodScale(counts, total);
  return describeConfirmationScale(counts, total);
}

function describeImportanceScale(counts, total) {
  const high = counts.veryHigh + counts.high;
  const low = counts.low + counts.none;
  const lead = dominantScaleLead([
    ["temat jest odbierany jako ważny", high],
    ["temat ma niski priorytet dla respondentów", low],
    ["ważność jest oceniana umiarkowanie", counts.medium]
  ], total, "oceny ważności są podzielone");
  return {
    lead,
    body: `W skali ważności ${high} odpowiedzi wskazują wysoką ważność (${percent(high, total)}%), ${counts.medium} umiarkowaną ważność, a ${low} niską ważność albo brak znaczenia (${percent(low, total)}%).`
  };
}

function describeFrequencyScale(counts, total) {
  const frequent = counts.always + counts.often;
  const rare = counts.rarely + counts.never;
  return {
    lead: dominantScaleLead([
      ["zjawisko występuje często", frequent],
      ["zjawisko występuje rzadko", rare],
      ["zjawisko pojawia się sporadycznie", counts.sometimes]
    ], total, "częstotliwość jest zróżnicowana"),
    body: `Rozkład częstotliwości: ${frequent} odpowiedzi wskazuje częste występowanie (${percent(frequent, total)}%), ${counts.sometimes} sporadyczne, a ${rare} rzadkie lub zerowe występowanie (${percent(rare, total)}%).`
  };
}

function describeAgreementScale(counts, total) {
  const agree = counts.strongAgree + counts.agree;
  const disagree = counts.disagree + counts.strongDisagree;
  return {
    lead: dominantScaleLead([
      ["przeważa zgoda z twierdzeniem", agree],
      ["przeważa brak zgody z twierdzeniem", disagree],
      ["odpowiedzi są neutralne lub niejednoznaczne", counts.neutral]
    ], total, "zgoda i brak zgody są podzielone"),
    body: `W skali zgody ${agree} odpowiedzi wspiera twierdzenie (${percent(agree, total)}%), ${counts.neutral} jest neutralnych, a ${disagree} mu przeczy (${percent(disagree, total)}%).`
  };
}

function describeSatisfactionScale(counts, total) {
  const positive = counts.veryGood + counts.good;
  const negative = counts.bad + counts.veryBad;
  return {
    lead: dominantScaleLead([
      ["ocena jest raczej pozytywna", positive],
      ["ocena jest raczej negatywna", negative],
      ["ocena jest przeciętna", counts.average]
    ], total, "oceny są mieszane"),
    body: `W ocenie jakości ${positive} odpowiedzi jest pozytywnych (${percent(positive, total)}%), ${counts.average} przeciętnych, a ${negative} negatywnych (${percent(negative, total)}%).`
  };
}

function describeLikelihoodScale(counts, total) {
  return {
    lead: dominantScaleLead([
      ["respondenci pokazują gotowość do działania", counts.high],
      ["respondenci raczej nie deklarują gotowości", counts.low],
      ["gotowość zależy od warunków", counts.uncertain]
    ], total, "gotowość respondentów jest podzielona"),
    body: `W skali gotowości rozkład jest następujący: wysoka gotowość ${counts.high} (${percent(counts.high, total)}%), warunkowa gotowość ${counts.uncertain}, niska gotowość ${counts.low} (${percent(counts.low, total)}%).`
  };
}

function describeConfirmationScale(counts, total) {
  return {
    lead: dominantScaleLead([
      ["odpowiedzi częściej potwierdzają pytanie", counts.confirm],
      ["odpowiedzi częściej zaprzeczają pytaniu", counts.deny],
      ["odpowiedzi są niejednoznaczne", counts.unclear]
    ], total, "odpowiedzi potwierdzające i przeczące są podzielone"),
    body: `Rozkład odpowiedzi: ${counts.confirm} potwierdzających (${percent(counts.confirm, total)}%), ${counts.unclear} niejednoznacznych i ${counts.deny} przeczących (${percent(counts.deny, total)}%).`
  };
}

function dominantScaleLead(items, total, mixedText) {
  const dominant = items.sort((left, right) => right[1] - left[1])[0];
  return dominant[1] <= total / 2 ? mixedText : `${dominant[0]} (${dominant[1]} z ${total})`;
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function formatExactAnswerCounts(exact, limit = 8) {
  return [...exact.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "pl"))
    .slice(0, limit)
    .map(([answer, count]) => `${answer} (${count})`)
    .join(", ");
}

function getTopAnswerKeywords(answers, sourceQuestions) {
  const stopWords = new Set([
    "oraz", "jest", "jako", "tego", "tych", "dla", "nie", "tak", "raczej", "bardzo", "mozna", "moze",
    "ktore", "które", "przez", "przy", "nad", "pod", "czy", "jak", "jaki", "jaka", "jakie", "warto",
    "firmy", "firmie", "ankieta", "odpowiedz", "odpowiedzi"
  ]);
  const questionWords = new Set(
    sourceQuestions
      .flatMap((question) => normalizeForLabel(question).split(/\s+/))
      .filter((word) => word.length > 3)
  );
  const counts = new Map();
  answers.forEach((answer) => {
    normalizeForLabel(answer)
      .split(/[^a-z0-9ąćęłńóśźż]+/i)
      .map((word) => word.trim())
      .filter((word) => word.length > 3 && !stopWords.has(word) && !questionWords.has(word))
      .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "pl"))
    .slice(0, 4)
    .map(([word]) => word);
}

function sortQuestionStats(items) {
  return [...items].sort((a, b) => sortQuestionCompare(a, b));
}

function sortQuestionCompare(a, b) {
  const aTheme = a.themeName || "";
  const bTheme = b.themeName || "";
  return aTheme.localeCompare(bTheme, "pl") || a.name.localeCompare(b.name, "pl");
}

function sortThemeCompare(a, b) {
  return a.name.localeCompare(b.name, "pl");
}

function themeSignal(average) {
  if (average === null || average === undefined) return "mieszany";
  if (average < 3.2) return "wymaga uwagi";
  if (average < 3.8) return "mieszany";
  return "mocny";
}

function sortNumberAsc(a, b) {
  const left = a === null || a === undefined ? Number.POSITIVE_INFINITY : a;
  const right = b === null || b === undefined ? Number.POSITIVE_INFINITY : b;
  return left - right;
}

function sortNumberDesc(a, b) {
  const left = a === null || a === undefined ? Number.NEGATIVE_INFINITY : a;
  const right = b === null || b === undefined ? Number.NEGATIVE_INFINITY : b;
  return right - left;
}

function buildMarkdownReport(project) {
  const report = buildReportDraft(project);
  const stats = getQuestionStats(project);
  const topics = getTopics(project);
  const pii = detectPii(project);

  return [
    `# ${report.headline}`,
    "",
    `Klient: ${project.client}`,
    `Projekt: ${project.name}`,
    `Fala: ${project.wave || "-"}`,
    "",
    "## Streszczenie",
    "",
    ...report.executiveSummary.map((line) => `- ${line}`),
    "",
    "## Wyniki pytań",
    "",
    "| Pytanie | Typ | n | Średnia |",
    "|---|---:|---:|---:|",
    ...stats.map((item) => `| ${escapeMarkdown(item.name)} | ${typeLabel(item.type)} | ${item.count} | ${formatNumber(item.average)} |`),
    "",
    "## Tematy komentarzy",
    "",
    ...topics.map((topic) => `- ${topic.name}: ${topic.comments.length} komentarzy; charakter sygnału: ${topic.tone}`),
    "",
    "## Kontrola danych",
    "",
    `- Próg wyników liczbowych: ${project.thresholds?.numeric || 5}`,
    `- Próg komentarzy: ${project.thresholds?.comments || 10}`,
    `- Potencjalne wykrycia PII: ${pii.length}`,
    "",
    "## Status",
    "",
    "Raport jest szkicem roboczym. Przed pokazaniem klientowi wymaga przeglądu konsultanta."
  ].join("\n");
}

function buildHtmlReport(project) {
  if (project.reportDeck?.slides?.length) return buildHtmlDeckReport(project);

  const report = buildReportDraft(project);
  const stats = getQuestionStats(project);
  const topics = getTopics(project);
  const comments = collectComments(project).slice(0, 8);
  const pii = detectPii(project);

  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.headline)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #20252a; margin: 42px; line-height: 1.5; }
    h1 { font-size: 28px; margin-bottom: 4px; }
    h2 { margin-top: 28px; border-bottom: 1px solid #dce2e5; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { border: 1px solid #dce2e5; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #eef2f3; }
    .meta, .note { color: #687178; }
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
    .stat { border: 1px solid #dce2e5; padding: 12px; border-radius: 8px; }
    .stat strong { display: block; font-size: 24px; }
    blockquote { border-left: 4px solid #14796d; padding-left: 12px; color: #384248; }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.headline)}</h1>
  <div class="meta">${escapeHtml(project.client)} · ${escapeHtml(project.wave || "-")}</div>

  <div class="stat-grid">
    <div class="stat"><strong>${report.evidence.respondents}</strong>respondenci</div>
    <div class="stat"><strong>${report.evidence.comments}</strong>komentarze</div>
    <div class="stat"><strong>${report.evidence.topics}</strong>tematy</div>
    <div class="stat"><strong>${report.evidence.pii}</strong>PII do kontroli</div>
  </div>

  <h2>Streszczenie</h2>
  ${report.executiveSummary.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}

  <h2>Wyniki pytań</h2>
  <table>
    <thead><tr><th>Pytanie</th><th>Typ</th><th>n</th><th>Średnia</th></tr></thead>
    <tbody>
      ${stats.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${typeLabel(item.type)}</td><td>${item.count}</td><td>${formatNumber(item.average)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Tematy komentarzy</h2>
  <table>
    <thead><tr><th>Temat</th><th>Komentarze</th><th>Charakter sygnału</th></tr></thead>
    <tbody>
      ${topics.map((topic) => `<tr><td>${escapeHtml(topic.name)}</td><td>${topic.comments.length}</td><td>${escapeHtml(topic.tone)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2>Przykładowe cytaty po redakcji</h2>
  ${comments.map((comment) => `<blockquote>${escapeHtml(redactText(comment.text))}</blockquote>`).join("") || "<p>Brak komentarzy.</p>"}

  <h2>Kontrola danych</h2>
  <ul>
    <li>Próg wyników liczbowych: ${project.thresholds?.numeric || 5}</li>
    <li>Próg komentarzy: ${project.thresholds?.comments || 10}</li>
    <li>Potencjalne wykrycia PII: ${pii.length}</li>
  </ul>
  <p class="note">Raport jest szkicem roboczym. Przed pokazaniem klientowi wymaga przeglądu konsultanta. Nie używać do decyzji kadrowych wobec pojedynczych osób ani do rozpoznawania emocji pracowników.</p>
</body>
</html>`;
}

function buildHtmlDeckReport(project) {
  const deckSettings = getReportDeckSettings(project);
  const visibleSlides = getVisibleReportSlides(project);
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(project.client)} - ${escapeHtml(project.name)}</title>
  <style>
    body { margin: 0; background: #edf1f2; color: #1f292d; font-family: Arial, sans-serif; }
    .deck { display: grid; gap: 24px; padding: 28px; }
    .slide { position: relative; width: min(1120px, 100%); min-height: 630px; margin: 0 auto; box-sizing: border-box; padding: 46px 70px 46px 46px; background: #fff; border: 1px solid #dce2e5; page-break-after: always; overflow: hidden; }
    .slide::after { content: ""; position: absolute; top: 0; right: 0; width: 22px; height: 100%; background: #22385f; }
    .slide.theme-teal::after { background: #14796d; }
    .slide.theme-blue::after { background: #356a9a; }
    .slide.theme-amber::after { background: #b57911; }
    .slide.theme-coral::after { background: #c95736; }
    .slide.compact { min-height: 520px; padding: 34px 58px 34px 34px; }
    .slide.cover { min-height: 560px; display: grid; align-content: space-between; }
    .slide.split .slide-body-export { display: grid; grid-template-columns: minmax(220px, .75fr) minmax(0, 1.25fr); gap: 28px; align-items: start; }
    .kicker { color: #14796d; text-transform: uppercase; font-size: 12px; letter-spacing: .08em; font-weight: 700; }
    .theme-blue .kicker { color: #356a9a; }
    .theme-amber .kicker { color: #8a5b0d; }
    .theme-coral .kicker { color: #a34628; }
    h1, h2 { margin: 10px 0 14px; }
    h1 { font-size: 38px; }
    h2 { font-size: 30px; }
    p { font-size: 16px; line-height: 1.55; color: #3e4b52; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 28px; }
    .metric, blockquote, .check { border: 1px solid #dce2e5; padding: 16px; border-radius: 8px; background: #fbfcfc; }
    .metric strong { display: block; font-size: 32px; }
    .bar-row { display: grid; grid-template-columns: 220px 1fr 56px; gap: 12px; align-items: center; margin: 10px 0; }
    .track { height: 16px; background: #eef2f3; border-radius: 999px; overflow: hidden; }
    .bar { height: 100%; background: #14796d; }
    .bar.coral { background: #d65e41; }
    .bar.amber { background: #cf9023; }
    .quotes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .notes { margin-top: 24px; padding: 10px 12px; border-left: 4px solid #b57911; background: #f4ead2; color: #6c4b17; }
    cite { color: #66737a; font-size: 12px; }
    @media print { body { background: #fff; } .deck { padding: 0; gap: 0; } .slide { width: 100%; min-height: 100vh; border: 0; } }
  </style>
</head>
<body>
  <main class="deck">
    ${visibleSlides.length ? visibleSlides.map((slide) => renderHtmlDeckSlide(slide, deckSettings)).join("") : `<section class="slide theme-${escapeAttribute(deckSettings.theme)}"><div class="kicker">Raport</div><h2>Brak widocznych slajdów</h2><p>Wszystkie slajdy zostały ukryte w edytorze raportu.</p></section>`}
  </main>
</body>
</html>`;
}

function renderHtmlDeckSlide(slide, deckSettings = defaultReportDeckSettings()) {
  const layout = normalizeReportSlideLayout(slide.layout);
  const theme = normalizeReportSlideTheme(slide.theme || deckSettings.theme);
  return `
    <section class="slide ${layout} theme-${theme}">
      <div class="kicker">${escapeHtml(slide.kicker || "")}</div>
      <h2>${escapeHtml(slide.title || "")}</h2>
      <div class="slide-body-export">
        <p>${escapeHtml(slide.body || "")}</p>
        ${renderHtmlDeckVisual(slide)}
      </div>
      ${deckSettings.showNotes !== false && slide.notes ? `<p class="notes"><small>${escapeHtml(slide.notes)}</small></p>` : ""}
    </section>
  `;
}

function renderHtmlDeckVisual(slide) {
  if (slide.type === "metrics") {
    return `<div class="grid">${(slide.items || []).map((item) => `<div class="metric"><strong>${escapeHtml(String(item.value ?? "-"))}</strong>${escapeHtml(item.label || "")}</div>`).join("")}</div>`;
  }
  if (slide.type === "method") {
    return `<div class="grid">${(slide.items || []).map((item) => `<div class="metric"><strong>${escapeHtml(item.label || "")}</strong><p>${escapeHtml(item.text || "")}</p></div>`).join("")}</div>`;
  }
  if (slide.type === "comparison") {
    return `<div class="quotes"><div><h3>Najwyżej oceniane</h3>${(slide.top || []).map((item) => `<div class="check">${escapeHtml(item.label || "")}: <strong>${escapeHtml(String(item.value ?? "-"))}</strong></div>`).join("")}</div><div><h3>Najniżej oceniane</h3>${(slide.bottom || []).map((item) => `<div class="check">${escapeHtml(item.label || "")}: <strong>${escapeHtml(String(item.value ?? "-"))}</strong></div>`).join("")}</div></div>`;
  }
  if (slide.type === "segmentTable") {
    return `<table><thead><tr><th>Segment</th><th>n</th><th>Wynik</th><th>Sygnał</th></tr></thead><tbody>${(slide.items || []).map((item) => `<tr><td>${escapeHtml(item.label || "")}</td><td>${escapeHtml(String(item.count ?? "-"))}</td><td>${escapeHtml(String(item.value ?? "-"))}</td><td>${escapeHtml(item.signal || "")}</td></tr>`).join("")}</tbody></table>`;
  }
  if (slide.type === "tableGeneric") {
    return `<table><thead><tr><th>Obszar</th><th>Wartość</th><th>Opis</th><th>Status</th></tr></thead><tbody>${(slide.items || []).map((item) => `<tr><td>${escapeHtml(item.label || "")}</td><td>${escapeHtml(String(item.value ?? "-"))}</td><td>${escapeHtml(item.text || "")}</td><td>${escapeHtml(item.signal || "")}</td></tr>`).join("")}</tbody></table>`;
  }
  if (slide.type === "enps") {
    return `<div class="metric"><strong>${escapeHtml(String(slide.score ?? "-"))}</strong>eNPS</div>${renderHtmlDeckVisual({ type: "bars", chart: slide.chart })}`;
  }
  if (slide.type === "bars") {
    const values = slide.chart?.values || [];
    const max = Math.max(1, ...values.map((item) => Math.abs(Number(item.value) || 0)));
    return values.map((item) => {
      const width = Math.max(6, Math.round((Math.abs(Number(item.value) || 0) / max) * 100));
      return `<div class="bar-row"><span>${escapeHtml(item.label || "")}</span><div class="track"><div class="bar ${escapeHtml(item.tone || "")}" style="width:${width}%"></div></div><strong>${escapeHtml(String(item.value ?? "-"))}</strong></div>`;
    }).join("");
  }
  if (slide.type === "topics") {
    return `<div class="grid">${(slide.items || []).map((item) => `<div class="metric"><strong>${escapeHtml(String(item.value ?? 0))}</strong>${escapeHtml(item.label || "")}</div>`).join("")}</div>`;
  }
  if (slide.type === "quotes") {
    return `<div class="quotes">${(slide.items || []).map((item) => `<blockquote><p>${escapeHtml(item.text || "")}</p><cite>${escapeHtml(item.label || "")}</cite></blockquote>`).join("")}</div>`;
  }
  if (slide.type === "checklist" || slide.type === "bullets") {
    return `<div>${(slide.items || []).map((item) => `<div class="check">${escapeHtml(item.text || "")}</div>`).join("")}</div>`;
  }
  return "";
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  link.click();
  URL.revokeObjectURL(url);
}

function toast(message) {
  lastToastMessage = String(message || "");
  flushToast();
}

function flushToast() {
  const element = document.getElementById("toast");
  if (!element || !lastToastMessage) return;
  element.textContent = lastToastMessage;
  element.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    element.classList.remove("show");
    lastToastMessage = "";
  }, 2600);
}

function typeLabel(type) {
  return {
    segment: "Segment",
    scale: "Skala",
    enps: "eNPS",
    comment: "Komentarz",
    question_text: "Treść pytania",
    question_type: "Typ pytania",
    answer_text: "Odpowiedź",
    answer_value: "Wartość odpowiedzi",
    question_category: "Kategoria pytania",
    question_id: "ID pytania",
    response_id: "ID odpowiedzi",
    ignore: "Pomiń"
  }[type] || type;
}

function cellClass(value) {
  if (value === null || value === undefined) return "hm-low";
  if (value >= 3.8) return "hm-good";
  if (value >= 3.2) return "hm-mid";
  return "hm-low";
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toLocaleString("pl-PL", { maximumFractionDigits: 1 });
}

function shortLabel(value, length = 22) {
  const text = String(value);
  return escapeHtml(text.length > length ? `${text.slice(0, length - 1)}…` : text);
}

function escapeMarkdown(value) {
  return String(value).replace(/\|/g, "\\|");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
