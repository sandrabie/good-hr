import { topicRules } from "./data.js";

const EMPTY_ARRAY = Object.freeze([]);
const analyticsCache = new WeakMap();

function getCached(project, key, compute) {
  if (!project || typeof project !== "object") return compute();
  const cache = getProjectCache(project);
  if (cache.values.has(key)) return cache.values.get(key);
  const value = compute();
  cache.values.set(key, value);
  return value;
}

function getProjectCache(project) {
  const signature = getProjectSignature(project);
  const cache = analyticsCache.get(project);
  if (cache && isSameProjectSignature(cache.signature, signature)) return cache;

  const nextCache = {
    signature,
    values: new Map()
  };
  analyticsCache.set(project, nextCache);
  return nextCache;
}

function getProjectSignature(project) {
  const responses = project.responses || EMPTY_ARRAY;
  const columns = project.schema?.columns || EMPTY_ARRAY;
  return {
    responses,
    responseCount: responses.length,
    columns,
    columnSignature: columns.map((column) => `${column.name}:${column.type}`).join("\u001f"),
    thresholds: `${project.thresholds?.numeric ?? ""}:${project.thresholds?.comments ?? ""}`,
    meta: `${project.client || ""}\u001f${project.name || ""}\u001f${project.wave || ""}\u001f${project.sourceFile || ""}`
  };
}

function isSameProjectSignature(left, right) {
  return left.responses === right.responses
    && left.responseCount === right.responseCount
    && left.columns === right.columns
    && left.columnSignature === right.columnSignature
    && left.thresholds === right.thresholds
    && left.meta === right.meta;
}

export function getColumns(project, type) {
  return getCached(project, `columns:${type}`, () => {
    return (project.schema?.columns || []).filter((column) => column.type === type);
  });
}

export function getMetricSummary(project) {
  return getCached(project, "metric-summary", () => {
    const responses = project.responses || [];
    const scales = getColumns(project, "scale");
    const comments = getColumns(project, "comment");
    const numericValues = [];

    responses.forEach((row) => {
      scales.forEach((column) => {
        const value = toNumber(row[column.name]);
        if (value !== null) numericValues.push(value);
      });
    });

    const commentItems = collectComments(project);
    const piiItems = detectPii(project);
    const enps = getProjectEnps(project);
    const average = numericValues.length ? mean(numericValues) : null;
    const readiness = calculateReadiness(commentItems.length, piiItems.length);

    return {
      respondents: responses.length,
      questions: project.schema?.columns?.length || 0,
      scaleAverage: average,
      enps,
      comments: commentItems.length,
      pii: piiItems.length,
      readiness,
      commentColumns: comments.length
    };
  });
}

export function getQuestionStats(project) {
  return getCached(project, "question-stats", () => {
    const responses = project.responses || [];
    const longFormat = getLongFormatColumns(project);
    const longScaleAnswers = longFormat.numericAnswers.length ? longFormat.numericAnswers : longFormat.answers;
    if (longFormat.question && longScaleAnswers.length) {
      const grouped = new Map();
      responses.forEach((row) => {
        const question = getQuestionLabel(row, longFormat.question);
        if (!question) return;
        longScaleAnswers.forEach((column) => {
          const value = toNumber(row[column.name]);
          if (value === null) return;
          if (!grouped.has(question)) grouped.set(question, []);
          grouped.get(question).push(value);
        });
      });

      return [...grouped.entries()].map(([name, values]) => ({
        name,
        type: isEnpsQuestionName(name) ? "enps" : "scale",
        count: values.length,
        average: values.length ? mean(values) : null,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null
      }));
    }

    const columns = [...getColumns(project, "scale"), ...getColumns(project, "enps")];
    return columns.map((column) => {
      const values = responses.map((row) => toNumber(row[column.name])).filter((value) => value !== null);
      return {
        name: column.name,
        type: column.type,
        count: values.length,
        average: values.length ? mean(values) : null,
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null
      };
    });
  });
}

export function getHeatmap(project) {
  return getCached(project, "heatmap", () => {
    const longFormat = getLongFormatColumns(project);
    if (longFormat.question && (longFormat.answers.length || longFormat.numericAnswers.length)) return getLongFormatHeatmap(project, longFormat);

    const segment = getUsableSegmentColumns(project, longFormat)[0];
    const scales = getColumns(project, "scale");
    if (!segment) return { mode: "numeric", segment: null, scales: [], rows: [] };

    const groups = groupBy(project.responses || [], (row) => row[segment.name] || "Brak segmentu");
    if (scales.length === 0) {
      const categoricalScales = getColumns(project, "comment")
        .map((column) => ({
          name: column.name,
          type: "categorical",
          count: getTextAnswers(project.responses || [], [column]).length
        }))
        .filter((scale) => scale.count > 0 && isClosedAnswerSet(getTextAnswers(project.responses || [], [{ name: scale.name }])));
      if (!categoricalScales.length) return { mode: "categorical", segment: null, scales: [], rows: [] };

      const rows = Object.entries(groups).map(([group, records]) => ({
        group,
        count: records.length,
        cells: categoricalScales.map((scale) => buildCategoricalCell(scale.name, getTextAnswers(records, [{ name: scale.name }])))
      }));
      return { mode: "categorical", segment: segment.name, scales: categoricalScales, rows };
    }

    const rows = Object.entries(groups).map(([group, records]) => {
      const cells = scales.map((scale) => {
        const values = records.map((row) => toNumber(row[scale.name])).filter((value) => value !== null);
        return {
          question: scale.name,
          value: values.length ? mean(values) : null,
          count: values.length
        };
      });
      return { group, count: records.length, cells };
    });

    return { mode: "numeric", segment: segment.name, scales, rows };
  });
}

export function getSegmentComparableQuestions(project) {
  return getCached(project, "segment-comparable-questions", () => {
    const longFormat = getLongFormatColumns(project);
    const questions = new Map();

    if (longFormat.question && (longFormat.answers.length || longFormat.numericAnswers.length)) {
      const groupedByQuestion = groupBy(project.responses || [], (row) => getQuestionLabel(row, longFormat.question) || "");
      Object.entries(groupedByQuestion).forEach(([question, records]) => {
        if (!question) return;
        const textAnswers = getTextAnswers(records, longFormat.answers);
        const numericAnswers = records
          .flatMap((row) => longFormat.numericAnswers.map((column) => toNumber(row[column.name])))
          .filter((value) => value !== null);

        if (textAnswers.length) {
          if (isOpenQuestionLabel(question)) return;
          if (!isClosedAnswerSet(textAnswers)) return;
          questions.set(question, {
            value: question,
            label: question,
            count: textAnswers.length,
            mode: "categorical"
          });
          return;
        }

        if (numericAnswers.length) {
          questions.set(question, {
            value: question,
            label: question,
            count: numericAnswers.length,
            mode: "numeric"
          });
        }
      });
    } else {
      getQuestionStats(project).forEach((question) => {
        questions.set(question.name, {
          value: question.name,
          label: question.name,
          count: question.count,
          mode: "numeric"
        });
      });

      [...getColumns(project, "comment"), ...getColumns(project, "answer_text")].forEach((column) => {
        const answers = getTextAnswers(project.responses || [], [column]);
        if (!answers.length || isOpenQuestionLabel(column.name) || !isClosedAnswerSet(answers)) return;
        questions.set(column.name, {
          value: column.name,
          label: column.name,
          count: answers.length,
          mode: "categorical"
        });
      });
    }

    return [...questions.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "pl"));
  });
}

export function getSegmentComparison(project, options = {}) {
  const cacheKey = `segment-comparison:${options.segmentColumn || ""}\u001f${options.question || ""}\u001f${options.threshold || ""}`;
  return getCached(project, cacheKey, () => {
    const longFormat = getLongFormatColumns(project);
    const segmentColumns = getUsableSegmentColumns(project, longFormat);
    const segment = segmentColumns.find((column) => column.name === options.segmentColumn) || segmentColumns[0];
    const threshold = Number(options.threshold || project.thresholds?.numeric || 5);
    const questions = getSegmentComparableQuestions(project);
    const questionMeta = questions.find((item) => item.value === options.question) || questions[0] || null;
    const question = questionMeta?.value || "";

    if (!segment || !questionMeta) {
      return {
        segment: segment?.name || null,
        question,
        questionLabel: questionMeta?.label || "",
        threshold,
        mode: "empty",
        groups: [],
        visibleGroups: [],
        hiddenGroups: [],
        strongestProblem: null,
        overall: null,
        segmentColumns,
        questions
      };
    }

    const groups = groupBy(project.responses || [], (row) => String(row[segment.name] || "Brak segmentu").trim() || "Brak segmentu");
    const overallAnswers = collectComparableAnswers(project, project.responses || [], question, longFormat);
    const overall = summarizeComparableAnswers(overallAnswers, questionMeta?.label || question);
    const rows = Object.entries(groups)
      .map(([label, records]) => {
        const answers = collectComparableAnswers(project, records, question, longFormat);
        const summary = summarizeComparableAnswers(answers, questionMeta?.label || question);
        const respondentCount = getSegmentRespondentCount(records, longFormat.responseId);
        const answerCount = summary.count;
        const hidden = respondentCount < threshold;
        return {
          label,
          respondentCount,
          answerCount,
          hidden,
          summary,
          delta: getSegmentDelta(summary, overall)
        };
      })
      .sort((left, right) => {
        if (left.hidden !== right.hidden) return left.hidden ? 1 : -1;
        if (overall?.mode === "numeric") return sortNullable(left.summary.average, right.summary.average);
        return (right.summary.problemPercent || 0) - (left.summary.problemPercent || 0) || right.answerCount - left.answerCount;
      });

    const visibleGroups = rows.filter((row) => !row.hidden && row.answerCount > 0);
    const hiddenGroups = rows.filter((row) => row.hidden);

    return {
      segment: segment.name,
      question,
      questionLabel: questionMeta?.label || question,
      threshold,
      mode: overall?.mode || "empty",
      groups: rows,
      visibleGroups,
      hiddenGroups,
      strongestProblem: findStrongestSegmentProblem(visibleGroups, overall),
      overall,
      segmentColumns,
      questions
    };
  });
}

export function collectComments(project) {
  return getCached(project, "comments", () => {
    const longFormat = getLongFormatColumns(project);
    if (longFormat.question && longFormat.answers.length) return collectLongFormatComments(project, longFormat);

    const commentColumns = getColumns(project, "comment");
    const segmentColumns = getUsableSegmentColumns(project);
    const comments = [];

    (project.responses || []).forEach((row, rowIndex) => {
      commentColumns.forEach((column) => {
        const text = String(row[column.name] || "").trim();
        if (!text) return;
        comments.push({
          id: `${rowIndex}-${column.name}`,
          rowIndex,
          question: column.name,
          text,
          segments: Object.fromEntries(segmentColumns.map((segment) => [segment.name, row[segment.name] || ""]))
        });
      });
    });

    return comments;
  });
}

function collectLongFormatComments(project, longFormat = getLongFormatColumns(project)) {
  const segmentColumns = getUsableSegmentColumns(project, longFormat);
  const comments = [];

  (project.responses || []).forEach((row, rowIndex) => {
    const question = getQuestionLabel(row, longFormat.question);
    if (!question) return;

    longFormat.answers.forEach((column) => {
      const text = String(row[column.name] || "").trim();
      if (!text) return;
      comments.push({
        id: getLongCommentId(row, rowIndex, column, longFormat),
        rowIndex,
        question,
        text,
        sourceColumn: column.name,
        segments: Object.fromEntries(segmentColumns.map((segment) => [segment.name, row[segment.name] || ""])),
        topicSource: buildLongTopicSource(row, question, text, longFormat)
      });
    });
  });

  return comments;
}

function collectLongFormatQuestionItems(project, longFormat = getLongFormatColumns(project)) {
  const rows = project.responses || [];
  const grouped = new Map();
  const segmentColumns = getUsableSegmentColumns(project, longFormat);

  rows.forEach((row, rowIndex) => {
    const question = getQuestionLabel(row, longFormat.question);
    if (!question) return;
    if (!grouped.has(question)) {
      grouped.set(question, {
        name: question,
        type: "survey_question",
        count: 0,
        average: null,
        min: null,
        max: null,
        values: [],
        comments: [],
        topicParts: new Set([question])
      });
    }
    const item = grouped.get(question);
    item.topicParts.add(getLongQuestionTopicSource(row, question, longFormat));

    longFormat.numericAnswers.forEach((column) => {
      const value = toNumber(row[column.name]);
      if (value !== null) item.values.push(value);
    });

    longFormat.answers.forEach((column) => {
      const text = String(row[column.name] || "").trim();
      if (!text) return;
      item.comments.push({
        id: getLongCommentId(row, rowIndex, column, longFormat),
        rowIndex,
        question,
        text,
        sourceColumn: column.name,
        segments: Object.fromEntries(segmentColumns.map((segment) => [segment.name, row[segment.name] || ""])),
        topicSource: getLongQuestionTopicSource(row, question, longFormat)
      });
    });
  });

  return [...grouped.values()].map((item) => {
    const count = item.comments.length || item.values.length || rows.filter((row) => getQuestionLabel(row, longFormat.question) === item.name).length;
    const average = item.values.length ? mean(item.values) : null;
    return {
      name: item.name,
      type: item.values.length ? "scale" : "categorical",
      count,
      average,
      min: item.values.length ? Math.min(...item.values) : null,
      max: item.values.length ? Math.max(...item.values) : null,
      comments: item.comments,
      topicSource: [...item.topicParts].filter(Boolean).join(" ")
    };
  });
}

function getLongFormatHeatmap(project, longFormat) {
  const segment = getUsableSegmentColumns(project, longFormat)[0];
  if (!segment) return { mode: "numeric", segment: null, scales: [], rows: [] };
  if (!longFormat.numericAnswers.length) return getLongFormatCategoricalHeatmap(project, longFormat, segment);

  const answerColumns = longFormat.numericAnswers;

  const groupedByQuestion = groupBy(project.responses || [], (row) => getQuestionLabel(row, longFormat.question) || "Bez pytania");
  const scales = Object.entries(groupedByQuestion)
    .map(([name, records]) => ({
      name,
      type: "scale",
      count: records.reduce((count, row) => count + answerColumns.filter((column) => toNumber(row[column.name]) !== null).length, 0)
    }))
    .filter((scale) => scale.count > 0);

  if (!scales.length) return { mode: "numeric", segment: null, scales: [], rows: [] };

  const groups = groupBy(project.responses || [], (row) => row[segment.name] || "Brak segmentu");
  const rows = Object.entries(groups).map(([group, records]) => {
    const cells = scales.map((scale) => {
      const values = records
        .filter((row) => getQuestionLabel(row, longFormat.question) === scale.name)
        .flatMap((row) => answerColumns.map((column) => toNumber(row[column.name])).filter((value) => value !== null));
      return {
        question: scale.name,
        value: values.length ? mean(values) : null,
        count: values.length
      };
    });
    return { group, count: records.length, cells };
  });

  return { mode: "numeric", segment: segment.name, scales, rows };
}

function getLongFormatCategoricalHeatmap(project, longFormat, segment) {
  const groupedByQuestion = groupBy(project.responses || [], (row) => getQuestionLabel(row, longFormat.question) || "Bez pytania");
  const scales = Object.entries(groupedByQuestion)
    .map(([name, records]) => {
      const answers = getTextAnswers(records, longFormat.answers);
      return {
        name,
        type: "categorical",
        count: answers.length,
        closed: isClosedAnswerSet(answers)
      };
    })
    .filter((scale) => scale.count > 0 && scale.closed)
    .map(({ closed, ...scale }) => scale);

  if (!scales.length) return { mode: "categorical", segment: null, scales: [], rows: [] };

  const groups = groupBy(project.responses || [], (row) => row[segment.name] || "Brak segmentu");
  const rows = Object.entries(groups).map(([group, records]) => ({
    group,
    count: records.length,
    cells: scales.map((scale) => {
      const answers = getTextAnswers(
        records.filter((row) => getQuestionLabel(row, longFormat.question) === scale.name),
        longFormat.answers
      );
      return buildCategoricalCell(scale.name, answers);
    })
  }));

  return { mode: "categorical", segment: segment.name, scales, rows };
}

function getTextAnswers(records, columns) {
  return records
    .flatMap((row) => columns.map((column) => String(row[column.name] || "").trim()))
    .filter(Boolean);
}

function isClosedAnswerSet(answers) {
  if (!answers.length) return false;
  const distribution = summarizeAnswerDistribution(answers);
  const averageLength = answers.reduce((sum, answer) => sum + answer.length, 0) / answers.length;
  const uniqueLimit = Math.min(10, Math.max(5, Math.ceil(answers.length * 0.8)));
  return averageLength <= 80 && distribution.length <= uniqueLimit;
}

function buildCategoricalCell(question, answers) {
  const distribution = summarizeAnswerDistribution(answers);
  const top = distribution[0];
  return {
    question,
    value: null,
    count: answers.length,
    label: top?.answer || "",
    percent: top && answers.length ? Math.round((top.count / answers.length) * 100) : null,
    distribution
  };
}

function summarizeAnswerDistribution(answers) {
  const buckets = new Map();
  answers.forEach((answer) => {
    const text = String(answer || "").trim();
    if (!text) return;
    const key = normalize(text).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, { answer: text, count: 0 });
    buckets.get(key).count += 1;
  });
  return [...buckets.values()].sort((left, right) => right.count - left.count || left.answer.localeCompare(right.answer, "pl"));
}

export function getTopics(project) {
  return getCached(project, "topics", () => {
    const comments = collectComments(project);
    const topics = new Map();

    topicRules.forEach((rule) => {
      topics.set(rule.id, {
        ...rule,
        comments: []
      });
    });

    topics.set("other", {
      id: "other",
      name: "Inne obserwacje",
      tone: "mieszane",
      color: "muted",
      keywords: [],
      comments: []
    });

    comments.forEach((comment) => {
      const assigned = assignTopic(getCommentTopicSource(comment));
      topics.get(assigned).comments.push(comment);
    });

    return [...topics.values()]
      .filter((topic) => topic.comments.length > 0)
      .sort((a, b) => b.comments.length - a.comments.length);
  });
}

export function getAiAnswerInsights(project) {
  return getCached(project, "ai-answer-insights", () => {
    const longFormat = getLongFormatColumns(project);
    if (longFormat.question && (longFormat.answers.length || longFormat.numericAnswers.length)) {
      return getLongFormatAiAnswerInsights(project, longFormat);
    }

    const stats = getQuestionStats(project).filter((item) => item.type === "scale" || item.type === "enps");
    const commentTopics = getTopics(project);
    const themes = new Map();

    topicRules.forEach((rule) => {
      themes.set(rule.id, {
        id: rule.id,
        name: rule.name,
        color: rule.color,
        tone: rule.tone,
        scaleQuestions: [],
        comments: [],
        average: null,
        simplified: "",
        confidence: "niska"
      });
    });

    themes.set("other", {
      id: "other",
      name: "Inne obserwacje",
      color: "muted",
      tone: "mieszane",
      scaleQuestions: [],
      comments: [],
      average: null,
      simplified: "",
      confidence: "niska"
    });

    const scaleItems = stats.map((item) => {
      const themeId = classifyQuestion(item.name);
      const simplified = simplifyScaleQuestion(item);
      const enriched = {
        ...item,
        themeId,
        themeName: themes.get(themeId)?.name || "Inne obserwacje",
        simplified,
        signal: getScaleSignal(item.average)
      };
      themes.get(themeId).scaleQuestions.push(enriched);
      return enriched;
    });

    commentTopics.forEach((topic) => {
      const target = themes.get(topic.id) || themes.get("other");
      target.comments.push(...topic.comments);
    });

    const resultThemes = [...themes.values()]
      .map((theme) => {
        const values = theme.scaleQuestions
          .map((question) => question.average)
          .filter((value) => value !== null && value !== undefined);
        const average = values.length ? mean(values) : null;
        return {
          ...theme,
          average,
          confidence: getThemeConfidence(theme.scaleQuestions.length, theme.comments.length),
          simplified: simplifyTheme(theme, average)
        };
      })
      .filter((theme) => theme.scaleQuestions.length > 0 || theme.comments.length > 0)
      .sort((a, b) => getThemePriority(b) - getThemePriority(a));

    return {
      themes: resultThemes,
      scaleItems
    };
  });
}

function getLongFormatAiAnswerInsights(project, longFormat) {
  const themes = createEmptyInsightThemes();
  const questionItems = collectLongFormatQuestionItems(project, longFormat);

  const scaleItems = questionItems.map((item) => {
    const themeId = classifyQuestion(item.topicSource);
    const target = themes.get(themeId) || themes.get("other");
    const enriched = {
      ...item,
      themeId: target.id,
      themeName: target.name,
      simplified: simplifyScaleQuestion(item),
      signal: getScaleSignal(item.average)
    };
    target.scaleQuestions.push(enriched);
    target.comments.push(...item.comments);
    return enriched;
  });

  const resultThemes = finalizeInsightThemes(themes);
  return {
    themes: resultThemes,
    scaleItems
  };
}

function createEmptyInsightThemes() {
  const themes = new Map();
  topicRules.forEach((rule) => {
    themes.set(rule.id, {
      id: rule.id,
      name: rule.name,
      color: rule.color,
      tone: rule.tone,
      scaleQuestions: [],
      comments: [],
      average: null,
      simplified: "",
      confidence: "niska"
    });
  });

  themes.set("other", {
    id: "other",
    name: "Inne obserwacje",
    color: "muted",
    tone: "mieszane",
    scaleQuestions: [],
    comments: [],
    average: null,
    simplified: "",
    confidence: "niska"
  });

  return themes;
}

function finalizeInsightThemes(themes) {
  return [...themes.values()]
    .map((theme) => {
      const values = theme.scaleQuestions
        .map((question) => question.average)
        .filter((value) => value !== null && value !== undefined);
      const average = values.length ? mean(values) : null;
      return {
        ...theme,
        average,
        confidence: getThemeConfidence(theme.scaleQuestions.length, theme.comments.length),
        simplified: simplifyTheme(theme, average)
      };
    })
    .filter((theme) => theme.scaleQuestions.length > 0 || theme.comments.length > 0)
    .sort((a, b) => getThemePriority(b) - getThemePriority(a));
}

function collectComparableAnswers(project, records, question, longFormat = getLongFormatColumns(project)) {
  const isSpecificQuestion = question && question !== "__overall";

  if (longFormat.question && (longFormat.answers.length || longFormat.numericAnswers.length)) {
    const targetRows = isSpecificQuestion
      ? records.filter((row) => getQuestionLabel(row, longFormat.question) === question)
      : records;

    if (longFormat.answers.length) {
      return {
        numeric: [],
        text: getTextAnswers(targetRows, longFormat.answers)
      };
    }

    return {
      numeric: targetRows
        .flatMap((row) => longFormat.numericAnswers.map((column) => toNumber(row[column.name])))
        .filter((value) => value !== null),
      text: []
    };
  }

  const columns = project.schema?.columns || [];
  if (isSpecificQuestion) {
    const column = columns.find((item) => item.name === question);
    if (!column) return { numeric: [], text: [] };
    if (["scale", "enps", "answer_value"].includes(column.type) || isMostlyNumeric(project.responses || [], column.name)) {
      return {
        numeric: records.map((row) => toNumber(row[column.name])).filter((value) => value !== null),
        text: []
      };
    }
    return {
      numeric: [],
      text: getTextAnswers(records, [column])
    };
  }

  const numericColumns = [...getColumns(project, "scale"), ...getColumns(project, "enps"), ...getColumns(project, "answer_value")];
  const numeric = records
    .flatMap((row) => numericColumns.map((column) => toNumber(row[column.name])))
    .filter((value) => value !== null);

  if (numeric.length) return { numeric, text: [] };

  const textColumns = [...getColumns(project, "answer_text"), ...getColumns(project, "comment")]
    .filter((column) => isClosedAnswerSet(getTextAnswers(project.responses || [], [column])));

  return {
    numeric: [],
    text: getTextAnswers(records, textColumns)
  };
}

function summarizeComparableAnswers(answers, questionLabel) {
  if (answers.numeric.length) {
    const average = mean(answers.numeric);
    return {
      mode: "numeric",
      questionLabel,
      count: answers.numeric.length,
      average,
      min: Math.min(...answers.numeric),
      max: Math.max(...answers.numeric),
      signal: average < 3.2 ? "wymaga uwagi" : average < 3.8 ? "mieszany" : "mocny"
    };
  }

  if (answers.text.length) {
    const distribution = summarizeAnswerDistribution(answers.text);
    const top = distribution[0];
    const problemCount = distribution
      .filter((item) => isProblemAnswer(item.answer, questionLabel))
      .reduce((sum, item) => sum + item.count, 0);
    return {
      mode: "categorical",
      questionLabel,
      count: answers.text.length,
      distribution,
      topLabel: top?.answer || "",
      topCount: top?.count || 0,
      topPercent: top ? Math.round((top.count / answers.text.length) * 100) : 0,
      problemCount,
      problemPercent: Math.round((problemCount / answers.text.length) * 100)
    };
  }

  return {
    mode: "empty",
    questionLabel,
    count: 0,
    distribution: [],
    problemPercent: 0
  };
}

function getSegmentRespondentCount(records, responseIdColumn) {
  if (!responseIdColumn) return records.length;
  const ids = records
    .map((row) => String(row[responseIdColumn.name] || "").trim())
    .filter(Boolean);
  return ids.length ? new Set(ids).size : records.length;
}

function getSegmentDelta(summary, overall) {
  if (!summary || !overall || summary.mode !== overall.mode || !summary.count || !overall.count) return null;
  if (summary.mode === "numeric") return summary.average - overall.average;
  if (summary.problemCount || overall.problemCount) return summary.problemPercent - overall.problemPercent;
  return summary.topPercent - overall.topPercent;
}

function findStrongestSegmentProblem(rows, overall) {
  if (!rows.length || !overall) return null;
  if (overall.mode === "numeric") {
    return [...rows]
      .filter((row) => row.summary.mode === "numeric" && row.summary.count)
      .sort((left, right) => sortNullable(left.summary.average, right.summary.average))[0] || null;
  }
  const withProblemSignal = rows.filter((row) => row.summary.mode === "categorical" && row.summary.problemPercent > 0);
  if (withProblemSignal.length) {
    return [...withProblemSignal].sort((left, right) => right.summary.problemPercent - left.summary.problemPercent)[0];
  }
  return [...rows]
    .filter((row) => row.summary.mode === "categorical" && row.summary.count)
    .sort((left, right) => right.summary.topPercent - left.summary.topPercent)[0] || null;
}

function isProblemAnswer(answer, questionLabel = "") {
  const normalized = normalize(answer).trim();
  const question = normalize(questionLabel);
  if (!normalized) return false;
  const negative = new Set([
    "nie",
    "raczej nie",
    "zdecydowanie nie",
    "nigdy",
    "rzadko",
    "bardzo rzadko",
    "zle",
    "bardzo zle",
    "raczej zle",
    "malo wazne",
    "niewazne",
    "bez znaczenia",
    "niska gotowosc",
    "brak zgody"
  ]);
  if (negative.has(normalized)) return true;
  if (question.includes("transport") || question.includes("dojezdzasz") || question.includes("dojazd")) {
    return normalized.includes("spalinowym") || normalized === "samochodem";
  }
  return false;
}

function isOpenQuestionLabel(questionLabel) {
  const question = normalize(questionLabel);
  const openPhrases = [
    "co poprawic",
    "co firma",
    "co moglaby",
    "co moglby",
    "co powinno",
    "czego brakuje",
    "co przeszkadza",
    "jakie dane",
    "jakie kryteria",
    "jakie zmiany",
    "jaka zmiana",
    "opisz",
    "uzasadnij",
    "komentarz",
    "sugestie",
    "propozycje"
  ];
  return openPhrases.some((phrase) => question.includes(phrase));
}

function sortNullable(left, right) {
  const a = left === null || left === undefined ? Number.POSITIVE_INFINITY : left;
  const b = right === null || right === undefined ? Number.POSITIVE_INFINITY : right;
  return a - b;
}

export function detectPii(project) {
  return getCached(project, "pii", () => {
    const comments = collectComments(project);
    const patterns = [
      { type: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
      { type: "telefon", regex: /(?:\+48\s*)?(?:\d[\s-]?){9,}/g },
      { type: "imię", regex: /\b(Anna|Anny|Jan|Jana|Piotr|Piotra|Katarzyna|Kasi|Marek|Marka|Tomasz|Tomasza|Agnieszka|Agnieszki)\b/gi },
      { type: "unikalny kontekst", regex: /\b(po odejściu|po zwolnieniu|po awansie|na projekcie)\b/gi }
    ];

    const findings = [];
    comments.forEach((comment) => {
      patterns.forEach((pattern) => {
        const matches = [...comment.text.matchAll(pattern.regex)];
        matches.forEach((match) => {
          findings.push({
            comment,
            type: pattern.type,
            match: match[0]
          });
        });
      });
    });
    return findings;
  });
}

export function buildReportDraft(project) {
  return getCached(project, "report-draft", () => {
    const summary = getMetricSummary(project);
    const topics = getTopics(project);
    const stats = getQuestionStats(project).filter((item) => item.type === "scale");
    const weakest = [...stats].sort((a, b) => (a.average || 0) - (b.average || 0))[0];
    const strongest = [...stats].sort((a, b) => (b.average || 0) - (a.average || 0))[0];
    const topTopic = topics[0];

    return {
      headline: `Raport ${project.client}: ${project.name}`,
      executiveSummary: [
        `W badaniu wzięło udział ${summary.respondents} respondentów. Średni wynik pytań skalowych wynosi ${formatNumber(summary.scaleAverage)}.`,
        summary.enps !== null ? `Wskaźnik eNPS wynosi ${summary.enps}.` : "W projekcie nie wykryto kolumny eNPS.",
        strongest ? `Najmocniejszy obszar to "${strongest.name}" ze średnią ${formatNumber(strongest.average)}.` : "",
        weakest ? `Największej uwagi wymaga "${weakest.name}" ze średnią ${formatNumber(weakest.average)}.` : "",
        topTopic ? `Najczęściej powracający temat komentarzy to "${topTopic.name}" (${topTopic.comments.length} wypowiedzi).` : ""
      ].filter(Boolean),
      evidence: {
        respondents: summary.respondents,
        comments: summary.comments,
        pii: summary.pii,
        topics: topics.length,
        thresholdNumeric: project.thresholds?.numeric || 5,
        thresholdComments: project.thresholds?.comments || 10
      }
    };
  });
}

export function redactText(text) {
  return String(text)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email usunięty]")
    .replace(/(?:\+48\s*)?(?:\d[\s-]?){9,}/g, "[telefon usunięty]")
    .replace(/\b(Anna|Anny|Jan|Jana|Piotr|Piotra|Katarzyna|Kasi|Marek|Marka|Tomasz|Tomasza|Agnieszka|Agnieszki)\b/gi, "[imię usunięte]");
}

export function assignTopic(text) {
  return classifyByTopicRules(text, "comment", 1);
}

export function classifyQuestion(question) {
  const normalized = normalize(question);
  const intentMatch = classifyByTopicRules(question, "question", 1);
  if (intentMatch !== "other") return intentMatch;
  if (normalized.includes("wspolprac") || normalized.includes("dzial")) return "cooperation";
  if (normalized.includes("satysfakc")) return "satisfaction";
  if (normalized.includes("polec")) return "recommendation";
  return "other";
}

function classifyByTopicRules(text, mode, minScore) {
  const normalized = normalize(text);
  let best = { id: "other", score: 0, index: Number.MAX_SAFE_INTEGER };

  topicRules.forEach((rule, index) => {
    const score = scoreTopicRule(normalized, rule, mode);
    if (score > best.score || (score === best.score && score > 0 && index < best.index)) {
      best = { id: rule.id, score, index };
    }
  });

  return best.score >= minScore ? best.id : "other";
}

function scoreTopicRule(normalized, rule, mode) {
  if (rule.id === "initiatives" && !hasGreenItContext(normalized)) return 0;
  if (rule.id === "loyalty" && mode === "comment" && !hasRetentionContext(normalized)) return 0;
  if (rule.requiredKeywords?.length && !containsAnyKeyword(normalized, rule.requiredKeywords)) return 0;
  if (rule.excludeKeywords?.length && containsAnyKeyword(normalized, rule.excludeKeywords)) return 0;

  let score = 0;
  score += scoreKeywords(normalized, rule.keywords || [], 1);
  score += scoreKeywords(normalized, rule.strongKeywords || [], 3);
  if (mode === "question") score += scoreKeywords(normalized, rule.questionKeywords || [], 4);
  if (mode === "comment") score += scoreKeywords(normalized, rule.commentKeywords || [], 2);
  return score;
}

function scoreKeywords(normalized, keywords, weight) {
  return keywords.reduce((sum, keyword) => {
    return containsKeyword(normalized, keyword) ? sum + weight : sum;
  }, 0);
}

function containsAnyKeyword(normalized, keywords) {
  return keywords.some((keyword) => containsKeyword(normalized, keyword));
}

function containsKeyword(normalized, keyword) {
  const term = normalize(keyword).trim();
  if (!term) return false;
  if (term.length <= 3) return normalized.split(/\s+/).includes(term);
  return normalized.includes(term);
}

function hasGreenItContext(normalized) {
  return [
    "green it",
    "srodowisk",
    "energia",
    "energi",
    "zuzy",
    "oszczed",
    "ekolog",
    "slad weglowy"
  ].some((keyword) => containsKeyword(normalized, keyword));
}

function hasRetentionContext(normalized) {
  return [
    "przyszlosc",
    "zostac",
    "zostaje",
    "zostanie",
    "retenc",
    "rotac",
    "lojaln",
    "wiaze"
  ].some((keyword) => containsKeyword(normalized, keyword));
}

function simplifyScaleQuestion(question) {
  const name = question.name.replace(/\?$/, "");
  const average = question.average;
  if (average === null || average === undefined) {
    return `Brak wystarczających odpowiedzi dla pytania "${name}".`;
  }
  if (average < 3.2) {
    return `Odpowiedzi wskazują wyraźny problem: "${name}" wymaga pogłębienia w komentarzach.`;
  }
  if (average < 3.8) {
    return `Odpowiedzi są niejednoznaczne: "${name}" dzieli respondentów i warto sprawdzić segmenty.`;
  }
  return `Odpowiedzi tworzą korzystny sygnał: "${name}" może być mocnym punktem ankiety.`;
}

function simplifyTheme(theme, average) {
  const commentPart = theme.comments.length
    ? ` W komentarzach znaleziono ${theme.comments.length} powiązanych wypowiedzi.`
    : " Brakuje jeszcze komentarzy, które wyjaśniają ten wynik.";

  if (average === null || average === undefined) {
    return `Temat pojawia się głównie w odpowiedziach otwartych.${commentPart}`;
  }

  if (average < 3.2) {
    return `Temat wymaga uwagi. Wyniki skalowe są niskie, więc warto potraktować go jako kandydat do rekomendacji.${commentPart}`;
  }

  if (average < 3.8) {
    return `Temat ma mieszany sygnał. Nie jest jednoznacznie krytyczny, ale wymaga segmentacji i sprawdzenia cytatów.${commentPart}`;
  }

  return `Temat wygląda względnie dobrze w liczbach. Komentarze mogą pomóc opisać, co konkretnie działa.${commentPart}`;
}

function getScaleSignal(average) {
  if (average === null || average === undefined) return "brak danych";
  if (average < 3.2) return "wymaga uwagi";
  if (average < 3.8) return "mieszany";
  return "mocny";
}

function getThemeConfidence(questionCount, commentCount) {
  const score = questionCount * 2 + Math.min(6, commentCount);
  if (score >= 8) return "wysoka";
  if (score >= 4) return "średnia";
  return "niska";
}

function getThemePriority(theme) {
  const riskWeight = theme.average === null ? 1 : Math.max(0, 5 - theme.average);
  return riskWeight * 10 + theme.comments.length + theme.scaleQuestions.length * 3;
}

function isEnpsQuestionName(value) {
  const normalized = normalize(value);
  if (!normalized) return false;
  if (normalized.includes("enps") || normalized === "nps" || normalized.includes(" nps")) return true;
  const hasRecommendationSignal = [
    "enps",
    "nps",
    "polec",
    "rekomend",
    "rekomendow",
    "rekomendac"
  ].some((keyword) => normalized.includes(keyword));
  const hasWorkplaceContext = [
    "firma",
    "firmy",
    "pracodawc",
    "miejsce pracy",
    "organizac",
    "zaklad pracy"
  ].some((keyword) => normalized.includes(keyword));
  return hasRecommendationSignal && hasWorkplaceContext;
}

function getProjectEnps(project) {
  const responses = project.responses || [];
  const enpsColumn = getColumns(project, "enps")[0];
  if (enpsColumn) return calculateEnps(responses.map((row) => row[enpsColumn.name]));
  return calculateLongFormatEnps(project);
}

function calculateLongFormatEnps(project) {
  const longFormat = getLongFormatColumns(project);
  if (!longFormat.question || !longFormat.numericAnswers.length) return null;
  const values = [];

  (project.responses || []).forEach((row) => {
    const question = getQuestionLabel(row, longFormat.question);
    if (!isEnpsQuestionName(question)) return;
    longFormat.numericAnswers.forEach((column) => values.push(row[column.name]));
  });

  return calculateEnps(values);
}

export function calculateEnps(values) {
  const numbers = values.map(toNumber).filter((value) => value !== null && value >= 0 && value <= 10);
  if (numbers.length === 0) return null;
  const promoters = numbers.filter((value) => value >= 9).length;
  const detractors = numbers.filter((value) => value <= 6).length;
  return Math.round(((promoters - detractors) / numbers.length) * 100);
}

function calculateReadiness(comments, pii) {
  if (comments === 0) return 70;
  const piiPenalty = Math.min(35, Math.round((pii / comments) * 100));
  return Math.max(35, 88 - piiPenalty);
}

function getLongFormatColumns(project) {
  return getCached(project, "long-format-columns", () => {
    const columns = project.schema?.columns || [];
    const question = columns.find((column) => column.type === "question_text" || isQuestionTextName(column.name));
    const explicitAnswers = columns.filter((column) => isExplicitAnswerName(column.name) && !isMetadataName(column.name) && column.name !== question?.name);
    const answerColumns = explicitAnswers.length ? explicitAnswers : columns.filter((column) => isAnswerColumn(column, question));
    const numericAnswers = answerColumns.filter((column) => isMostlyNumeric(project.responses || [], column.name));
    const textAnswers = answerColumns.filter((column) => !numericAnswers.includes(column));

    return {
      question,
      questionId: columns.find((column) => column.type === "question_id" || isQuestionIdName(column.name)),
      responseId: columns.find((column) => column.type === "response_id" || isResponseIdName(column.name)),
      category: columns.find((column) => column.type === "question_category" || isQuestionCategoryName(column.name)),
      questionType: columns.find((column) => column.type === "question_type" || isQuestionTypeName(column.name)),
      answers: textAnswers,
      numericAnswers
    };
  });
}

function isAnswerColumn(column, questionColumn) {
  if (!column || column.name === questionColumn?.name) return false;
  if (["answer_text", "answer_value", "comment", "scale"].includes(column.type) && !isMetadataName(column.name)) return true;
  return isAnswerTextName(column.name);
}

function getUsableSegmentColumns(project, longFormat = getLongFormatColumns(project)) {
  const rows = project.responses || [];
  return getColumns(project, "segment").filter((column) => {
    if (isMetadataName(column.name) || isAnswerTextName(column.name) || isQuestionTextName(column.name)) return false;
    if ([longFormat.question?.name, longFormat.responseId?.name, longFormat.questionId?.name].includes(column.name)) return false;
    return isUsableRespondentSegmentColumn(column.name, rows);
  });
}

function isUsableRespondentSegmentColumn(name, rows) {
  const normalized = normalize(name);
  const values = rows.map((row) => String(row[name] || "").trim()).filter(Boolean);
  if (isTechnicalIndexName(normalized)) return false;
  if (!values.length) return false;
  if (isLikelyScaleAnswerSet(values)) return false;
  if (isLikelySurveyQuestionName(normalized) && !isLikelyRespondentSegmentName(normalized)) return false;
  if (hasHighCardinality(values) && !isLikelyRespondentSegmentName(normalized)) return false;
  return true;
}

function getQuestionLabel(row, questionColumn) {
  return String(row?.[questionColumn?.name] || "").trim();
}

function getLongCommentId(row, rowIndex, column, longFormat) {
  const responseId = longFormat.responseId ? row[longFormat.responseId.name] : "";
  const questionId = longFormat.questionId ? row[longFormat.questionId.name] : "";
  return [responseId || rowIndex, questionId, column.name].filter(Boolean).join("-");
}

function buildLongTopicSource(row, question, text, longFormat) {
  return [getLongQuestionTopicSource(row, question, longFormat), text].filter(Boolean).join(" ");
}

function getLongQuestionTopicSource(row, question, longFormat) {
  const category = longFormat.category ? row[longFormat.category.name] : "";
  const questionType = longFormat.questionType ? row[longFormat.questionType.name] : "";
  return [category, questionType, question].filter(Boolean).join(" ");
}

function getCommentTopicSource(comment) {
  return [comment.topicSource, comment.question, comment.text].filter(Boolean).join(" ");
}

function isMostlyNumeric(rows, columnName) {
  const values = rows.map((row) => String(row[columnName] || "").trim()).filter(Boolean);
  if (!values.length) return false;
  const numeric = values.filter((value) => toNumber(value) !== null);
  return numeric.length / values.length >= 0.75;
}

function isMetadataName(name) {
  const normalized = normalize(name);
  return (
    isQuestionTextName(normalized) ||
    isQuestionIdName(normalized) ||
    isResponseIdName(normalized) ||
    isQuestionCategoryName(normalized) ||
    isQuestionTypeName(normalized) ||
    isTagName(normalized) ||
    isAnswerMetadataName(normalized)
  );
}

function isResponseIdName(name) {
  const normalized = normalize(name);
  return ["id_odpowiedzi", "id odpowiedzi", "response_id", "response id", "respondent_id", "respondent id"].includes(normalized);
}

function isTechnicalIndexName(name) {
  const normalized = normalize(name);
  return ["lp", "lp.", "l.p.", "nr", "nr.", "numer", "number", "#"].includes(normalized);
}

function isQuestionIdName(name) {
  const normalized = normalize(name);
  return ["id_pytania", "id pytania", "question_id", "question id"].includes(normalized);
}

function isQuestionTextName(name) {
  const normalized = normalize(name);
  return ["pytanie", "tresc pytania", "tekst pytania", "question", "question text", "question title"].includes(normalized);
}

function isQuestionCategoryName(name) {
  const normalized = normalize(name);
  return ["kategoria", "kategorie", "kategoria pytania", "obszar", "obszar pytania", "temat", "category", "question category"].includes(normalized);
}

function isQuestionTypeName(name) {
  const normalized = normalize(name);
  return ["typ pytania", "rodzaj pytania", "question type", "type"].includes(normalized);
}

function isLikelyRespondentSegmentName(name) {
  const normalized = normalize(name);
  const segmentPhrases = [
    "w jakim regionie",
    "jakim regionie",
    "regionie pracujesz",
    "jakie stanowisko",
    "jakim stanowisku",
    "twoje stanowisko",
    "w jakim dziale",
    "jakim dziale",
    "w jakiej lokalizacji",
    "trybie pracy"
  ];
  if (segmentPhrases.some((phrase) => normalized.includes(phrase))) return true;
  const segmentTerms = [
    "dzial",
    "department",
    "departament",
    "region",
    "lokalizacja",
    "location",
    "stanowisko",
    "position",
    "job title",
    "rola",
    "role",
    "employee role",
    "staz",
    "seniority",
    "tenure",
    "tryb pracy",
    "work mode",
    "zespol",
    "team",
    "pion",
    "biuro",
    "komorka organizacyjna",
    "typ umowy",
    "employment type"
  ];
  if (segmentTerms.includes(normalized)) return true;
  return segmentTerms.some((term) => containsWholeTerm(normalized, term));
}

function containsWholeTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}($|\\s|\\?)`).test(text);
}

function isTagName(name) {
  const normalized = normalize(name);
  return ["tag", "tagi", "tags", "etykiety", "slowa kluczowe", "slowakluczowe", "keywords"].includes(normalized);
}

function isExplicitAnswerName(name) {
  const normalized = normalize(name);
  if (isAnswerMetadataName(normalized)) return false;
  if (isAnswerOptionsName(normalized)) return false;
  if (isResponseIdName(normalized)) return false;
  return (
    normalized.includes("odpowiedz") ||
    normalized.includes("answer") ||
    normalized.includes("response") ||
    normalized.includes("wartosc odpowiedzi") ||
    normalized.includes("tekst odpowiedzi")
  );
}

function isAnswerTextName(name) {
  const normalized = normalize(name);
  if (isAnswerMetadataName(normalized)) return false;
  if (isExplicitAnswerName(normalized)) return true;
  return [
    "odpowiedz",
    "odpowiedzi",
    "tresc odpowiedzi",
    "tekst odpowiedzi",
    "odpowiedz respondenta",
    "odpowiedzi respondenta",
    "answer",
    "answer text",
    "answers",
    "response",
    "response text",
    "comment",
    "komentarz",
    "komentarze",
    "uwaga",
    "uwagi",
    "opinia",
    "text",
    "value",
    "wartosc",
    "wartosc odpowiedzi",
    "ocena",
    "rating",
    "score",
    "wynik"
  ].includes(normalized);
}

function isAnswerMetadataName(name) {
  const normalized = normalize(name);
  return isAnswerOptionsName(normalized) || [
    "answer format",
    "response format",
    "format odpowiedzi",
    "typ odpowiedzi",
    "answer type",
    "response type",
    "answer kind",
    "response kind",
    "answer class",
    "response class",
    "answer category",
    "response category",
    "answer label",
    "response label",
    "answer sentiment",
    "response sentiment",
    "sentiment odpowiedzi",
    "wydzwiek odpowiedzi",
    "is closed question",
    "is open question",
    "closed question",
    "open question",
    "pytanie zamkniete",
    "pytanie otwarte",
    "czy pytanie zamkniete",
    "czy pytanie otwarte"
  ].includes(normalized) || normalized.includes("sentiment");
}

function isAnswerOptionsName(name) {
  const normalized = normalize(name);
  return [
    "mozliwe odpowiedzi",
    "mozliwe odpowiedzi dla pytan zamknietych",
    "opcje odpowiedzi",
    "lista odpowiedzi",
    "warianty odpowiedzi",
    "dostepne odpowiedzi",
    "odpowiedzi do wyboru",
    "answer options",
    "response options",
    "possible answers",
    "possible responses",
    "available answers",
    "available responses",
    "choices",
    "choice options",
    "options"
  ].includes(normalized) ||
    normalized.includes("mozliwe odpowiedzi") ||
    normalized.includes("opcje odpowiedzi") ||
    normalized.includes("warianty odpowiedzi") ||
    normalized.includes("odpowiedzi do wyboru") ||
    normalized.includes("answer options") ||
    normalized.includes("response options") ||
    normalized.includes("possible answers") ||
    normalized.includes("possible responses");
}

function isLikelyScaleAnswerSet(values) {
  const cleaned = values.map((value) => String(value || "").trim()).filter(Boolean);
  if (!cleaned.length) return false;
  const neutralScaleValues = new Set([
    "nie dotyczy",
    "n/d",
    "nd",
    "n d",
    "brak odpowiedzi",
    "nie wiem"
  ]);
  const numeric = cleaned.map(toNumber).filter((value) => value !== null);
  if (!numeric.length) return false;
  const scaleHits = cleaned.filter((value) => {
    const number = toNumber(value);
    if (number !== null && number >= 0 && number <= 10) return true;
    return neutralScaleValues.has(normalize(value));
  });
  const numericRatio = numeric.length / cleaned.length;
  const hitRatio = scaleHits.length / cleaned.length;
  const max = Math.max(...numeric);
  const min = Math.min(...numeric);
  return hitRatio >= 0.85 && numericRatio >= 0.3 && min >= 0 && max <= 10;
}

function isLikelySurveyQuestionName(name) {
  const normalized = normalize(name);
  if (normalized.includes("?")) return true;
  const questionStarts = ["czy ", "jak ", "jaka ", "jakie ", "jakich ", "na ile ", "w jaki ", "w jakim ", "co ", "gdybys "];
  if (questionStarts.some((start) => normalized.startsWith(start))) return true;
  const statementSignals = [
    "jestem ",
    "jestem zadowol",
    "mam ",
    "moj ",
    "moje ",
    "czuje ",
    "uwazam ",
    "wiaze ",
    "oceniam ",
    "polecisz ",
    "zaufanie",
    "wspolprace",
    "komunikacja ",
    "wymiana informacji",
    "narzedzia pracy",
    "procesy i procedury"
  ];
  return statementSignals.some((signal) => normalized.includes(signal));
}

function hasHighCardinality(values) {
  if (values.length < 10) return false;
  const unique = new Set(values.map((value) => normalize(value)).filter(Boolean)).size;
  return unique > Math.max(12, Math.ceil(values.length * 0.6));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/ł/g, "l")
    .replace(/[_-]+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 1 });
}
