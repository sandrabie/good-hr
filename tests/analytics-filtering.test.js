import test from "node:test";
import assert from "node:assert/strict";

import { sampleProject } from "../src/data.js";
import { inferColumns, parseCSV } from "../src/csv.js";
import {
  assignTopic,
  calculateEnps,
  classifyQuestion,
  collectComments,
  getAiAnswerInsights,
  getHeatmap,
  getMetricSummary,
  getQuestionStats,
  getSegmentComparison,
  getTopics
} from "../src/analytics.js";
import {
  createSegmentFilterValue,
  filterProjectBySegment,
  getSegmentFilterOptions,
  parseSegmentFilterValue
} from "../src/filtering.js";

test("segment filter options are built from all segment columns with counts", () => {
  const options = getSegmentFilterOptions(sampleProject);

  assert.ok(options.some((option) => option.label === "Dział: Biuro" && option.count === 2));
  assert.ok(options.some((option) => option.label === "Staż: 1-3 lata" && option.count === 3));
  assert.equal(options.length, 9);
});

test("segment filtering returns only matching survey responses", () => {
  const filterValue = createSegmentFilterValue("Dział", "Biuro");
  const filtered = filterProjectBySegment(sampleProject, filterValue);

  assert.equal(filtered.responses.length, 2);
  assert.equal(collectComments(filtered).length, 4);
  assert.equal(getMetricSummary(filtered).respondents, 2);
  assert.ok(filtered.responses.every((row) => row["Dział"] === "Biuro"));
});

test("segment comparison hides small groups and points to the weakest visible group", () => {
  const project = {
    thresholds: { numeric: 2, comments: 10 },
    schema: {
      columns: [
        { name: "dzial", type: "segment" },
        { name: "rola", type: "segment" },
        { name: "Obciazenie praca jest rozsadne", type: "scale" }
      ]
    },
    responses: [
      { dzial: "IT", rola: "Backend", "Obciazenie praca jest rozsadne": "2" },
      { dzial: "IT", rola: "Frontend", "Obciazenie praca jest rozsadne": "3" },
      { dzial: "HR", rola: "HRBP", "Obciazenie praca jest rozsadne": "5" },
      { dzial: "HR", rola: "Rekruter", "Obciazenie praca jest rozsadne": "4" },
      { dzial: "Zarzad", rola: "CEO", "Obciazenie praca jest rozsadne": "1" }
    ]
  };

  const comparison = getSegmentComparison(project, {
    segmentColumn: "dzial",
    question: "Obciazenie praca jest rozsadne",
    threshold: 2
  });

  assert.equal(comparison.segment, "dzial");
  assert.equal(comparison.hiddenGroups.length, 1);
  assert.equal(comparison.hiddenGroups[0].label, "Zarzad");
  assert.equal(comparison.strongestProblem.label, "IT");
  assert.equal(comparison.strongestProblem.summary.average, 2.5);
});

test("eNPS uses standard promoter and detractor rules", () => {
  assert.equal(calculateEnps([10, 9, 8, 7, 6, 0]), 0);
  assert.equal(calculateEnps([10, 9, 8, 7, 6]), 20);
  assert.equal(calculateEnps([10, 9, 8, 7, 6, 0, 11, 12, -1, "", "Nie dotyczy"]), 0);
  assert.equal(calculateEnps(["", "Nie dotyczy", 12, -1]), null);
});

test("metric summary calculates eNPS from a direct survey column", () => {
  const rows = parseCSV(`dzial;Czy polecilbys/polecilabys firme jako miejsce pracy?
IT;10
IT;9
HR;8
HR;7
HR;6
HR;0
HR;12
HR;Nie dotyczy`);
  const project = {
    thresholds: { numeric: 2, comments: 10 },
    schema: { columns: inferColumns(rows) },
    responses: rows
  };

  const byName = Object.fromEntries(project.schema.columns.map((column) => [column.name, column.type]));
  assert.equal(byName["Czy polecilbys/polecilabys firme jako miejsce pracy?"], "enps");
  assert.equal(getMetricSummary(project).enps, 0);
});

test("metric summary calculates eNPS from long survey answer values", () => {
  const rows = parseCSV(`response_id;question_id;department;question_text;answer_value
1;QENPS;IT;Na ile prawdopodobne jest, ze zarekomendujesz firme jako pracodawce?;10
2;QENPS;IT;Na ile prawdopodobne jest, ze zarekomendujesz firme jako pracodawce?;9
3;QENPS;HR;Na ile prawdopodobne jest, ze zarekomendujesz firme jako pracodawce?;8
4;QENPS;HR;Na ile prawdopodobne jest, ze zarekomendujesz firme jako pracodawce?;7
5;QENPS;HR;Na ile prawdopodobne jest, ze zarekomendujesz firme jako pracodawce?;6
6;QENPS;HR;Na ile prawdopodobne jest, ze zarekomendujesz firme jako pracodawce?;12
7;Q1;IT;Generalnie jestem zadowolony z pracy;1
8;Q1;IT;Generalnie jestem zadowolony z pracy;1`);
  const project = {
    thresholds: { numeric: 2, comments: 10 },
    schema: { columns: inferColumns(rows) },
    responses: rows
  };
  const stats = getQuestionStats(project);
  const enpsQuestion = stats.find((question) => question.name.includes("zarekomendujesz"));

  assert.equal(getMetricSummary(project).enps, 20);
  assert.equal(enpsQuestion.type, "enps");
});

test("PLK-like import uses region as segment and matrix questions as scales", () => {
  const rows = parseCSV(`Lp.;Zaznacz w jakim regionie pracujesz?;Generalnie jestem zadowolona/zadowolony z pracy;[System SAP;Platforma zakupowa
1;Region Slaski;4;3;1
2;Region Centralny;3;Nie dotyczy;5
3;Region Slaski;5;4;Nie dotyczy
4;Region Zachodni;2;1;4
5;Region Centralny;4;5;3`);
  const columns = inferColumns(rows);
  const byName = Object.fromEntries(columns.map((column) => [column.name, column.type]));
  const project = {
    thresholds: { numeric: 2, comments: 10 },
    schema: { columns },
    responses: rows
  };
  const comparison = getSegmentComparison(project, { threshold: 2 });
  const heatmap = getHeatmap(project);

  assert.equal(byName["Lp."], "response_id");
  assert.equal(byName["Zaznacz w jakim regionie pracujesz?"], "segment");
  assert.equal(byName["Generalnie jestem zadowolona/zadowolony z pracy"], "scale");
  assert.equal(byName["[System SAP"], "scale");
  assert.equal(byName["Platforma zakupowa"], "scale");
  assert.deepEqual(comparison.segmentColumns.map((column) => column.name), ["Zaznacz w jakim regionie pracujesz?"]);
  assert.equal(heatmap.segment, "Zaznacz w jakim regionie pracujesz?");
});

test("segment comparison works on long survey answers grouped by source question", () => {
  const rows = parseCSV(`response_id;question_id;department;question_text;answer_text
1;Q1;IT;Czy procedury sa jasne?;Tak
2;Q1;IT;Czy procedury sa jasne?;Nie
3;Q1;HR;Czy procedury sa jasne?;Nie
4;Q1;HR;Czy procedury sa jasne?;Nie
5;Q1;HR;Czy procedury sa jasne?;Raczej nie`);
  const project = {
    thresholds: { numeric: 2, comments: 10 },
    schema: { columns: inferColumns(rows) },
    responses: rows
  };

  const comparison = getSegmentComparison(project, {
    segmentColumn: "department",
    question: "Czy procedury sa jasne?",
    threshold: 2
  });

  assert.equal(comparison.mode, "categorical");
  assert.equal(comparison.visibleGroups.length, 2);
  assert.equal(comparison.strongestProblem.label, "HR");
  assert.equal(comparison.strongestProblem.summary.problemPercent, 100);
  assert.deepEqual(comparison.questions.map((question) => question.value), ["Czy procedury sa jasne?"]);
});

test("segment comparison question list excludes open text questions", () => {
  const rows = parseCSV(`response_id;question_id;department;question_text;answer_text
1;Q1;IT;Czy procedury sa jasne?;Tak
2;Q1;HR;Czy procedury sa jasne?;Nie
3;Q2;IT;Co poprawic w procesach?;Trzeba uproscic akceptacje i spotkania
4;Q2;HR;Co poprawic w procesach?;Brakuje jasnych wlascicieli tematow
5;Q2;HR;Co poprawic w procesach?;Proces zakupowy jest zbyt dlugi`);
  const project = {
    thresholds: { numeric: 2, comments: 10 },
    schema: { columns: inferColumns(rows) },
    responses: rows
  };

  const comparison = getSegmentComparison(project, {
    segmentColumn: "department",
    threshold: 2
  });

  assert.deepEqual(comparison.questions.map((question) => question.value), ["Czy procedury sa jasne?"]);
  assert.equal(comparison.question, "Czy procedury sa jasne?");
});

test("segment filters round-trip through encoded values", () => {
  const encoded = createSegmentFilterValue("Staż", "5+ lat");
  const parsed = parseSegmentFilterValue(encoded);

  assert.deepEqual(parsed, { column: "Staż", segmentValue: "5+ lat" });
});

test("scale questions are assigned to expected AI themes", () => {
  assert.equal(classifyQuestion("Obciążenie pracą jest rozsądne"), "workload");
  assert.equal(classifyQuestion("Komunikacja w firmie jest skuteczna"), "communication");
  assert.equal(classifyQuestion("Mam jasną ścieżkę rozwoju"), "growth");
  assert.equal(classifyQuestion("Przełożony wspiera mnie w pracy"), "manager");
  assert.equal(classifyQuestion("Współpraca między działami działa dobrze"), "cooperation");
  assert.equal(classifyQuestion("Na co dzień czuję przestrzeń do swobodnej komunikacji i dzielenia się pomysłami."), "psychological_safety");
  assert.notEqual(classifyQuestion("Na co dzień czuję przestrzeń do swobodnej komunikacji i dzielenia się pomysłami."), "initiatives");
});

test("open comments are assigned to the intended topics", () => {
  assert.equal(assignTopic("Priorytety zmieniają się kilka razy w tygodniu."), "workload");
  assert.equal(assignTopic("Menedżer jest dostępny i regularnie daje feedback."), "manager");
  assert.equal(assignTopic("Część narzędzi nadal wymaga pracy ręcznej w Excelu."), "tools");
  assert.equal(assignTopic("Po odejściu Anny nikt realnie nie przejął komunikacji między zmianami."), "communication");
  assert.equal(assignTopic("Zespół dobrze sobie pomaga na zmianie."), "other");
});

test("sample survey topics keep expected comment counts", () => {
  const counts = Object.fromEntries(getTopics(sampleProject).map((topic) => [topic.id, topic.comments.length]));

  assert.deepEqual(counts, {
    other: 4,
    workload: 3,
    manager: 3,
    tools: 3,
    information_flow: 2,
    communication: 1
  });
});

test("AI insights keep questions and comments in their matching themes after filtering", () => {
  const filtered = filterProjectBySegment(sampleProject, createSegmentFilterValue("Dział", "Biuro"));
  const insights = getAiAnswerInsights(filtered);
  const themes = Object.fromEntries(insights.themes.map((theme) => [theme.id, theme]));

  assert.equal(filtered.responses.length, 2);
  assert.equal(themes.workload.comments.length, 1);
  assert.equal(themes.manager.comments.length, 1);
  assert.equal(themes.tools.comments.length, 2);
  assert.equal(themes.recommendation.comments.length, 0);
  assert.equal(themes.recommendation.scaleQuestions[0].type, "enps");
  assert.equal(themes.workload.scaleQuestions[0].count, 2);
});

test("long survey format treats question text as metadata, not respondent answers", () => {
  const longProject = {
    schema: {
      columns: [
        { name: "id_odpowiedzi", type: "segment" },
        { name: "id_pytania", type: "segment" },
        { name: "kategoria", type: "segment" },
        { name: "pytanie", type: "comment" },
        { name: "odpowiedz", type: "comment" }
      ]
    },
    responses: [
      {
        id_odpowiedzi: "69",
        id_pytania: "12",
        kategoria: "Sprzet IT",
        pytanie: "Czy sprzet nadal dziala wydajnie?",
        odpowiedz: "Sprzet dziala wolno i utrudnia prace."
      },
      {
        id_odpowiedzi: "70",
        id_pytania: "12",
        kategoria: "Sprzet IT",
        pytanie: "Czy sprzet nadal dziala wydajnie?",
        odpowiedz: "Laptop wymaga wymiany, bo zawiesza sie na spotkaniach."
      },
      {
        id_odpowiedzi: "71",
        id_pytania: "14",
        kategoria: "Komunikacja",
        pytanie: "Co utrudnia przeplyw informacji?",
        odpowiedz: "Brakuje jednego kanalu z decyzjami."
      }
    ]
  };

  const comments = collectComments(longProject);
  const insights = getAiAnswerInsights(longProject);
  const themes = Object.fromEntries(insights.themes.map((theme) => [theme.id, theme]));

  assert.equal(comments.length, 3);
  assert.equal(comments[0].question, "Czy sprzet nadal dziala wydajnie?");
  assert.equal(comments[0].text, "Sprzet dziala wolno i utrudnia prace.");
  assert.ok(!comments.some((comment) => comment.text.includes("Czy sprzet nadal dziala wydajnie?")));
  assert.equal(comments[0].segments.id_odpowiedzi, undefined);
  assert.equal(comments[0].segments.id_pytania, undefined);
  assert.equal(themes.tools.comments.length, 2);
  assert.equal(themes.information_flow.comments.length, 1);
});

test("long survey format prefers explicit answer columns over tags", () => {
  const taggedProject = {
    schema: {
      columns: [
        { name: "id_odpowiedzi", type: "response_id" },
        { name: "id_pytania", type: "question_id" },
        { name: "typ_pytania", type: "question_type" },
        { name: "rola_pracownika_IT", type: "segment" },
        { name: "pytanie", type: "question_text" },
        { name: "tagi", type: "comment" },
        { name: "przykladowa_odpowiedz_pracownika", type: "segment" }
      ]
    },
    responses: [
      {
        id_odpowiedzi: "69",
        id_pytania: "12",
        typ_pytania: "zamkniete",
        rola_pracownika_IT: "Programista Backend",
        pytanie: "Czy korzystalbys czesciej z transportu publicznego?",
        tagi: "transport; IT; srodowisko; ankieta",
        przykladowa_odpowiedz_pracownika: "Tak"
      },
      {
        id_odpowiedzi: "70",
        id_pytania: "12",
        typ_pytania: "zamkniete",
        rola_pracownika_IT: "Programistka Frontend",
        pytanie: "Czy korzystalbys czesciej z transportu publicznego?",
        tagi: "transport; IT; srodowisko; ankieta",
        przykladowa_odpowiedz_pracownika: "Raczej tak"
      }
    ]
  };

  const comments = collectComments(taggedProject);

  assert.equal(comments.length, 2);
  assert.deepEqual(comments.map((comment) => comment.text), ["Tak", "Raczej tak"]);
  assert.ok(!comments.some((comment) => comment.text.includes("transport; IT")));
  assert.equal(comments[0].segments.przykladowa_odpowiedz_pracownika, undefined);
  assert.equal(comments[0].segments.tagi, undefined);
  assert.equal(comments[0].segments.rola_pracownika_IT, "Programista Backend");
});

test("long survey numeric answers are aggregated by question text", () => {
  const longScaleProject = {
    schema: {
      columns: [
        { name: "respondent_id", type: "response_id" },
        { name: "id_pytania", type: "question_id" },
        { name: "pytanie", type: "question_text" },
        { name: "odpowiedz", type: "answer_text" }
      ]
    },
    responses: [
      { respondent_id: "1", id_pytania: "1", pytanie: "Obciazenie praca jest rozsadne", odpowiedz: "2" },
      { respondent_id: "2", id_pytania: "1", pytanie: "Obciazenie praca jest rozsadne", odpowiedz: "4" },
      { respondent_id: "3", id_pytania: "2", pytanie: "Komunikacja w firmie jest skuteczna", odpowiedz: "3" }
    ]
  };

  const stats = getQuestionStats(longScaleProject);

  assert.deepEqual(
    stats.map((item) => ({ name: item.name, count: item.count, average: item.average })),
    [
      { name: "Obciazenie praca jest rozsadne", count: 2, average: 3 },
      { name: "Komunikacja w firmie jest skuteczna", count: 1, average: 3 }
    ]
  );
});

test("long survey closed text answers create categorical heatmap cells", () => {
  const project = {
    schema: {
      columns: [
        { name: "respondent_id", type: "response_id" },
        { name: "id_pytania", type: "question_id" },
        { name: "rola", type: "segment" },
        { name: "pytanie", type: "question_text" },
        { name: "odpowiedz", type: "answer_text" }
      ]
    },
    responses: [
      { respondent_id: "1", id_pytania: "1", rola: "Backend", pytanie: "Czy korzystasz z transportu?", odpowiedz: "Tak" },
      { respondent_id: "2", id_pytania: "1", rola: "Backend", pytanie: "Czy korzystasz z transportu?", odpowiedz: "Tak" },
      { respondent_id: "3", id_pytania: "1", rola: "Frontend", pytanie: "Czy korzystasz z transportu?", odpowiedz: "Nie" }
    ]
  };

  const heatmap = getHeatmap(project);

  assert.equal(heatmap.mode, "categorical");
  assert.equal(heatmap.segment, "rola");
  assert.deepEqual(heatmap.scales.map((scale) => scale.name), ["Czy korzystasz z transportu?"]);
  assert.equal(heatmap.rows.find((row) => row.group === "Backend").cells[0].label, "Tak");
  assert.equal(heatmap.rows.find((row) => row.group === "Backend").cells[0].percent, 100);
  assert.equal(heatmap.rows.find((row) => row.group === "Frontend").cells[0].label, "Nie");
});

test("long survey insights keep every CSV answer under its source question", () => {
  const rows = parseCSV(`response_id;question_id;category;question_type;answer_format;question_text;employee_role;department;work_mode;answer_text;answer_score_1_5
R001;Q003;transport;closed_single_choice;single_choice;Jak najczesciej dojezdzasz do biura?;Scrum Master;PM;hybrydowo;Samochodem spalinowym;1
R002;Q003;transport;closed_single_choice;single_choice;Jak najczesciej dojezdzasz do biura?;IT Support;Service Desk;zdalnie;Samochodem elektrycznym lub hybrydowym;2
R003;Q003;transport;closed_single_choice;single_choice;Jak najczesciej dojezdzasz do biura?;IT Architect;Architecture;stacjonarnie;Komunikacja publiczna;3
R004;Q003;transport;closed_single_choice;single_choice;Jak najczesciej dojezdzasz do biura?;Security Engineer;Cybersecurity;hybrydowo;Rowerem;4
R005;Q003;transport;closed_single_choice;single_choice;Jak najczesciej dojezdzasz do biura?;Data Engineer;Data;zdalnie;Pieszo;5
R006;Q003;transport;closed_single_choice;single_choice;Jak najczesciej dojezdzasz do biura?;Product Owner;Product;hybrydowo;Pracuje zdalnie;5`);
  const project = {
    responses: rows,
    schema: { columns: inferColumns(rows) },
    thresholds: { numeric: 5, comments: 10 }
  };

  const insights = getAiAnswerInsights(project);
  const transport = insights.themes.find((theme) => theme.name === "Transport i mobilność");
  const question = transport?.scaleQuestions.find((item) => item.name === "Jak najczesciej dojezdzasz do biura?");

  assert.ok(transport);
  assert.equal(question?.count, 6);
  assert.equal(transport.comments.filter((comment) => comment.question === "Jak najczesciej dojezdzasz do biura?").length, 6);
  assert.deepEqual(
    transport.comments.map((comment) => comment.text),
    [
      "Samochodem spalinowym",
      "Samochodem elektrycznym lub hybrydowym",
      "Komunikacja publiczna",
      "Rowerem",
      "Pieszo",
      "Pracuje zdalnie"
    ]
  );
});

test("CSV inference recognizes long survey metadata and answer columns", () => {
  const rows = parseCSV(`id_odpowiedzi;id_pytania;kategoria;typ_pytania;pytanie;tagi;przykladowa_odpowiedz_pracownika
69;12;Sprzet IT;zamkniete;Czy sprzet dziala wydajnie?;"transport; IT; srodowisko; ankieta";Tak
70;12;Sprzet IT;zamkniete;Czy sprzet dziala wydajnie?;"transport; IT; srodowisko; ankieta";Raczej tak`);
  const columns = Object.fromEntries(inferColumns(rows).map((column) => [column.name, column.type]));

  assert.equal(columns.id_odpowiedzi, "response_id");
  assert.equal(columns.id_pytania, "question_id");
  assert.equal(columns.kategoria, "question_category");
  assert.equal(columns.typ_pytania, "question_type");
  assert.equal(columns.pytanie, "question_text");
  assert.equal(columns.tagi, "segment");
  assert.equal(columns.przykladowa_odpowiedz_pracownika, "answer_text");
});

test("answer option lists are ignored and not treated as respondent answers", () => {
  const rows = parseCSV(`response_id;question_id;typ_pytania;kategoria;pytanie;mozliwe_odpowiedzi_dla_pytan_zamknietych;rola_pracownika;przykladowa_odpowiedz;czy_pytanie_otwarte;czy_pytanie_zamkniete
R0001;P001;zamkniete;Energia;Czy wylaczasz komputer po pracy?;"Tak; Raczej tak; Czasami; Raczej nie; Nie";Programista;Tak, wylaczam komputer codziennie.;NIE;TAK
R0002;P001;zamkniete;Energia;Czy wylaczasz komputer po pracy?;"Tak; Raczej tak; Czasami; Raczej nie; Nie";Tester QA;Raczej nie, czesto zostawiam komputer wlaczony.;NIE;TAK`);
  const columns = inferColumns(rows);
  const byName = Object.fromEntries(columns.map((column) => [column.name, column.type]));
  const project = {
    responses: rows,
    schema: { columns },
    thresholds: { numeric: 5, comments: 10 }
  };
  const comments = collectComments(project);

  assert.equal(byName.mozliwe_odpowiedzi_dla_pytan_zamknietych, "ignore");
  assert.equal(byName.przykladowa_odpowiedz, "answer_text");
  assert.deepEqual(
    comments.map((comment) => comment.text),
    ["Tak, wylaczam komputer codziennie.", "Raczej nie, czesto zostawiam komputer wlaczony."]
  );
  assert.ok(!comments.some((comment) => comment.text.includes("Tak; Raczej tak")));
});

test("long survey import ignores answer metadata such as free_text, suggestion and sentiment", () => {
  const rows = parseCSV(`response_id;question_id;category;question_type;answer_format;question_text;employee_role;department;work_mode;answer_text;answer_score_1_5;answer_sentiment;answer_kind;is_closed_question;is_open_question;tags
R0001;Q001;energia;closed_single_choice;single_choice;Czy oszczedzasz energie?;Backend;IT;hybrydowo;Tak, codziennie;5;positive;closed;1;0;energia,it
R0002;Q001;energia;closed_single_choice;single_choice;Czy oszczedzasz energie?;Frontend;IT;zdalnie;Nie;1;negative;closed;1;0;energia,it
R0003;Q002;energia;open_text;free_text;Co poprawic?;QA;IT;stacjonarnie;Automatycznie wylaczac zasoby;;suggestion;suggestion;0;1;energia,it`);
  const columns = inferColumns(rows);
  const byName = Object.fromEntries(columns.map((column) => [column.name, column.type]));

  assert.equal(byName.answer_format, "ignore");
  assert.equal(byName.question_type, "question_type");
  assert.equal(byName.answer_sentiment, "ignore");
  assert.equal(byName.answer_kind, "ignore");
  assert.equal(byName.is_closed_question, "ignore");
  assert.equal(byName.is_open_question, "ignore");
  assert.equal(byName.answer_text, "answer_text");
  assert.equal(byName.answer_score_1_5, "answer_value");

  const project = {
    responses: rows,
    schema: { columns },
    thresholds: { numeric: 5, comments: 10 }
  };
  const comments = collectComments(project);
  const commentTexts = comments.map((comment) => comment.text);

  assert.deepEqual(commentTexts, ["Tak, codziennie", "Nie", "Automatycznie wylaczac zasoby"]);
  assert.equal(commentTexts.includes("single_choice"), false);
  assert.equal(commentTexts.includes("free_text"), false);
  assert.equal(commentTexts.includes("positive"), false);
  assert.equal(commentTexts.includes("suggestion"), false);
  assert.equal(commentTexts.includes("closed"), false);

  const heatmap = getHeatmap(project);
  assert.equal(heatmap.mode, "numeric");
  assert.deepEqual(heatmap.scales.map((scale) => scale.name), ["Czy oszczedzasz energie?"]);
});

