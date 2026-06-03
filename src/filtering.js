const SEGMENT_FILTER_SEPARATOR = "::";
const EMPTY_ARRAY = Object.freeze([]);
const segmentCache = new WeakMap();

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
  const cache = segmentCache.get(project);
  if (cache && isSameProjectSignature(cache.signature, signature)) return cache;
  const nextCache = {
    signature,
    values: new Map()
  };
  segmentCache.set(project, nextCache);
  return nextCache;
}

function getProjectSignature(project) {
  const responses = project.responses || EMPTY_ARRAY;
  const columns = project.schema?.columns || EMPTY_ARRAY;
  const columnSignature = columns.map((column) => `${column.name}:${column.type}`).join("\u001f");
  return {
    responses,
    responseCount: responses.length,
    columns,
    columnSignature,
    thresholds: `${project.thresholds?.numeric ?? ""}\u001f${project.thresholds?.comments ?? ""}`
  };
}

function isSameProjectSignature(left, right) {
  return left.responses === right.responses
    && left.responseCount === right.responseCount
    && left.columns === right.columns
    && left.columnSignature === right.columnSignature
    && left.thresholds === right.thresholds;
}

export function getSegmentFilterOptions(project) {
  return getCached(project, "segment-options", () => {
    const segmentColumns = (project.schema?.columns || []).filter((column) => column.type === "segment");
    const segmentOptions = [];

    segmentColumns.forEach((column) => {
      const counts = new Map();
      (project.responses || []).forEach((row) => {
        const value = String(row[column.name] || "").trim();
        if (!value) return;
        counts.set(value, (counts.get(value) || 0) + 1);
      });

      [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right, "pl"))
        .forEach(([value, count]) => {
          segmentOptions.push({
            value: createSegmentFilterValue(column.name, value),
            label: `${column.name}: ${value}`,
            column: column.name,
            segmentValue: value,
            count
          });
        });
    });

    return segmentOptions;
  });
}

export function filterProjectBySegment(project, segmentFilter) {
  const segment = parseSegmentFilterValue(segmentFilter);
  if (!segment) return project;

  return getCached(project, `filtered:${segmentFilter}`, () => {
    return {
      ...project,
      responses: (project.responses || []).filter((row) => {
        return String(row[segment.column] || "").trim() === segment.segmentValue;
      })
    };
  });
}

export function createSegmentFilterValue(column, segmentValue) {
  return `${encodeURIComponent(column)}${SEGMENT_FILTER_SEPARATOR}${encodeURIComponent(segmentValue)}`;
}

export function parseSegmentFilterValue(value) {
  if (!value || value === "__all") return null;
  const separatorIndex = value.indexOf(SEGMENT_FILTER_SEPARATOR);
  if (separatorIndex === -1) return null;

  return {
    column: decodeURIComponent(value.slice(0, separatorIndex)),
    segmentValue: decodeURIComponent(value.slice(separatorIndex + SEGMENT_FILTER_SEPARATOR.length))
  };
}
