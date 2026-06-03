export async function parseTabularFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    return parseXlsx(await file.arrayBuffer());
  }
  return parseCSV(await file.text());
}

export function parseCSV(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  if (rows.length < 2) return [];

  const headers = rows[0].map((header, index) => header || `Kolumna ${index + 1}`);
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] || "";
    });
    return record;
  });
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

export function inferColumns(rows) {
  const headers = Object.keys(rows[0] || {});
  return headers.map((name) => ({
    name,
    type: inferType(name, rows.map((row) => row[name]))
  }));
}

function inferType(name, values) {
  const normalizedName = normalize(name);
  const nonEmpty = values.filter((value) => String(value || "").trim().length > 0);
  const numeric = nonEmpty
    .map((value) => Number(String(value).replace(",", ".")))
    .filter((value) => Number.isFinite(value));
  const numericRatio = nonEmpty.length ? numeric.length / nonEmpty.length : 0;
  const averageLength = nonEmpty.length
    ? nonEmpty.reduce((sum, value) => sum + String(value).length, 0) / nonEmpty.length
    : 0;

  if (isResponseIdName(normalizedName) || isTechnicalIndexName(normalizedName)) return "response_id";
  if (isQuestionIdName(normalizedName)) return "question_id";
  if (isQuestionTextName(normalizedName)) return "question_text";
  if (isQuestionCategoryName(normalizedName)) return "question_category";
  if (isQuestionTypeName(normalizedName)) return "question_type";
  if (isTagName(normalizedName)) return "segment";
  if (isAnswerMetadataName(normalizedName) || isAnswerMetadataValueColumn(normalizedName, nonEmpty)) return "ignore";
  if (isAnswerValueName(normalizedName)) return "answer_value";
  if (isAnswerTextName(normalizedName)) return "answer_text";
  if (isLikelyRespondentSegmentName(normalizedName)) return "segment";

  if (normalizedName.includes("komentar") || normalizedName.includes("uwag") || normalizedName.startsWith("co ") || averageLength > 35) {
    return "comment";
  }

  if (numericRatio > 0.75) {
    const max = Math.max(...numeric);
    const min = Math.min(...numeric);
    const validEnpsValues = numeric.filter((value) => value >= 0 && value <= 10);
    if (isLikelyEnpsName(normalizedName) && validEnpsValues.length && validEnpsValues.length / numeric.length >= 0.75) {
      return "enps";
    }
    if (min >= 1 && max <= 7) {
      return "scale";
    }
    return "segment";
  }

  if (isLikelyScaleAnswerSet(nonEmpty)) return "scale";
  if (isLikelySurveyQuestionName(normalizedName)) return "comment";

  return "segment";
}

function isResponseIdName(name) {
  return ["id_odpowiedzi", "id odpowiedzi", "response_id", "response id", "respondent_id", "respondent id"].includes(name);
}

function isTechnicalIndexName(name) {
  return ["lp", "lp.", "l.p.", "nr", "nr.", "numer", "number", "#"].includes(name);
}

function isQuestionIdName(name) {
  return ["id_pytania", "id pytania", "question_id", "question id"].includes(name);
}

function isQuestionTextName(name) {
  return ["pytanie", "tresc pytania", "treść pytania", "tekst pytania", "question", "question text", "question title"].includes(name);
}

function isQuestionCategoryName(name) {
  return ["kategoria", "kategorie", "kategoria pytania", "obszar", "obszar pytania", "temat", "category", "question category"].includes(name);
}

function isQuestionTypeName(name) {
  return ["typ pytania", "rodzaj pytania", "question type", "type"].includes(name);
}

function isLikelyRespondentSegmentName(name) {
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
  if (segmentPhrases.some((phrase) => name.includes(phrase))) return true;
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
  if (segmentTerms.includes(name)) return true;
  return segmentTerms.some((term) => containsWholeTerm(name, term));
}

function containsWholeTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}($|\\s|\\?)`).test(text);
}

async function parseXlsx(buffer) {
  const files = await unzipXlsxFiles(buffer);
  const workbook = readTextFile(files, "xl/workbook.xml");
  if (!workbook) throw new Error("Nie udało się odczytać skoroszytu XLSX.");
  const workbookRels = parseXmlRels(readTextFile(files, "xl/_rels/workbook.xml.rels") || "");
  const sheetRef = [...workbook.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)][0];
  if (!sheetRef) throw new Error("Plik XLSX nie zawiera arkusza z danymi.");
  const sheetPath = normalizeXlsxPath(`xl/${workbookRels.get(sheetRef[2]) || "worksheets/sheet1.xml"}`);
  const sheetXml = readTextFile(files, sheetPath);
  if (!sheetXml) throw new Error("Nie udało się odczytać pierwszego arkusza XLSX.");
  const sharedStrings = parseSharedStrings(readTextFile(files, "xl/sharedStrings.xml") || "");
  const rows = parseSheetRows(sheetXml, sharedStrings);
  return rowsToObjects(rows);
}

async function unzipXlsxFiles(buffer) {
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("Ta przeglądarka nie obsługuje lokalnego odczytu XLSX. Zapisz arkusz jako CSV albo użyj nowszego Chrome/Edge.");
  }

  const bytes = new Uint8Array(buffer);
  const entries = new Map();
  let eocd = -1;
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (readUint32(bytes, index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("Niepoprawny plik XLSX.");

  const entryCount = readUint16(bytes, eocd + 10);
  let offset = readUint32(bytes, eocd + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) break;
    const method = readUint16(bytes, offset + 10);
    const compressedSize = readUint32(bytes, offset + 20);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localOffset = readUint32(bytes, offset + 42);
    const name = decodeUtf8(bytes.slice(offset + 46, offset + 46 + nameLength));
    entries.set(normalizeXlsxPath(name), {
      method,
      compressedSize,
      uncompressedSize,
      localOffset
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  const files = new Map();
  for (const [name, entry] of entries.entries()) {
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    if (readUint32(bytes, entry.localOffset) !== 0x04034b50) continue;
    const nameLength = readUint16(bytes, entry.localOffset + 26);
    const extraLength = readUint16(bytes, entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);
    const data = entry.method === 0
      ? compressed
      : await inflateRaw(compressed, entry.uncompressedSize);
    files.set(name, decodeUtf8(data));
  }
  return files;
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parseXmlRels(xml) {
  const rels = new Map();
  [...xml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].forEach((match) => {
    rels.set(match[1], match[2]);
  });
  return rels;
}

function parseSharedStrings(xml) {
  return [...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map((match) => {
    return [...match[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((textMatch) => decodeXml(textMatch[1]))
      .join("");
  });
}

function parseSheetRows(xml, sharedStrings) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells = [];
    [...rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].forEach((cellMatch) => {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const columnIndex = ref ? columnLettersToIndex(ref) : cells.length;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] || "";
      let value = decodeXml(rawValue);
      if (type === "s") value = sharedStrings[Number(value)] || "";
      if (type === "inlineStr") {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1])).join("");
      }
      cells[columnIndex] = value;
    });
    return cells.map((cell) => cell || "");
  }).filter((row) => row.some((cell) => String(cell).trim()));
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((header, index) => String(header || `Kolumna ${index + 1}`).trim());
  return rows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = String(cells[index] || "").trim();
    });
    return record;
  });
}

function readTextFile(files, path) {
  return files.get(normalizeXlsxPath(path));
}

function normalizeXlsxPath(path) {
  return String(path).replace(/^\/+/, "").replace(/\\/g, "/").replace(/\/[^/]+\/\.\.\//g, "/");
}

function columnLettersToIndex(letters) {
  return letters.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function readUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeXml(value) {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function isTagName(name) {
  return ["tag", "tagi", "tags", "etykiety", "slowa kluczowe", "slowakluczowe", "keywords"].includes(name);
}

function isExplicitAnswerName(name) {
  if (isAnswerMetadataName(name)) return false;
  if (isAnswerOptionsName(name)) return false;
  if (isResponseIdName(name)) return false;
  return (
    name.includes("odpowiedz") ||
    name.includes("answer") ||
    name.includes("response") ||
    name.includes("wartosc odpowiedzi") ||
    name.includes("tekst odpowiedzi")
  );
}

function isAnswerTextName(name) {
  if (isAnswerMetadataName(name)) return false;
  if (isAnswerValueName(name)) return false;
  if (isExplicitAnswerName(name)) return true;
  return [
    "odpowiedz",
    "odpowiedź",
    "odpowiedzi",
    "tresc odpowiedzi",
    "treść odpowiedzi",
    "tekst odpowiedzi",
    "odpowiedz respondenta",
    "odpowiedź respondenta",
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
    "wartość",
    "wartosc odpowiedzi",
    "wartość odpowiedzi",
    "ocena",
    "rating",
    "score",
    "wynik"
  ].includes(name);
}

function isAnswerValueName(name) {
  return (
    name === "answer score" ||
    name.startsWith("answer score ") ||
    name === "response score" ||
    name.startsWith("response score ") ||
    name === "answer value" ||
    name === "response value" ||
    name === "wartosc odpowiedzi" ||
    name === "ocena odpowiedzi" ||
    name === "wynik odpowiedzi"
  );
}

function isAnswerMetadataName(name) {
  return isAnswerOptionsName(name) || [
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
  ].includes(name) || name.includes("sentiment");
}

function isAnswerOptionsName(name) {
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
  ].includes(name) ||
    name.includes("mozliwe odpowiedzi") ||
    name.includes("opcje odpowiedzi") ||
    name.includes("warianty odpowiedzi") ||
    name.includes("odpowiedzi do wyboru") ||
    name.includes("answer options") ||
    name.includes("response options") ||
    name.includes("possible answers") ||
    name.includes("possible responses");
}

function isAnswerMetadataValueColumn(name, values) {
  if (!values.length) return false;
  if (!/(answer|response|odpowiedz|odpowiedzi)/.test(name)) return false;
  if (["answer", "answer text", "response", "response text", "odpowiedz", "tekst odpowiedzi", "tresc odpowiedzi"].includes(name)) return false;
  const metadataValues = new Set([
    "single choice",
    "multiple choice",
    "closed single choice",
    "closed multiple choice",
    "open text",
    "free text",
    "text",
    "positive",
    "negative",
    "neutral",
    "unknown",
    "not applicable",
    "suggestion",
    "idea",
    "comment",
    "closed",
    "open"
  ]);
  const hits = values.filter((value) => metadataValues.has(normalize(value))).length;
  return hits / values.length >= 0.8;
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
  const numeric = cleaned
    .map((value) => Number(String(value).replace(",", ".")))
    .filter((value) => Number.isFinite(value));
  const scaleHits = cleaned.filter((value) => {
    const number = Number(String(value).replace(",", "."));
    if (Number.isFinite(number) && number >= 0 && number <= 10) return true;
    return neutralScaleValues.has(normalize(value));
  });
  if (!numeric.length) return false;
  const numericRatio = numeric.length / cleaned.length;
  const hitRatio = scaleHits.length / cleaned.length;
  const max = Math.max(...numeric);
  const min = Math.min(...numeric);
  return hitRatio >= 0.85 && numericRatio >= 0.3 && min >= 0 && max <= 10;
}

function isLikelySurveyQuestionName(name) {
  if (name.includes("?")) return true;
  const questionStarts = ["czy ", "jak ", "jaka ", "jakie ", "jakich ", "na ile ", "w jaki ", "w jakim ", "co ", "gdybys "];
  if (questionStarts.some((start) => name.startsWith(start))) return true;
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
  return statementSignals.some((signal) => name.includes(signal));
}

function isLikelyEnpsName(name) {
  if (name.includes("enps") || name === "nps" || name.includes(" nps")) return true;
  const hasRecommendationSignal = [
    "enps",
    "nps",
    "polec",
    "rekomend",
    "rekomendow",
    "rekomendac"
  ].some((keyword) => name.includes(keyword));
  const hasWorkplaceContext = [
    "firma",
    "firmy",
    "pracodawc",
    "miejsce pracy",
    "organizac",
    "zaklad pracy"
  ].some((keyword) => name.includes(keyword));
  return hasRecommendationSignal && hasWorkplaceContext;
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[_-]+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
