
import EsriMap from "https://js.arcgis.com/4.34/@arcgis/core/Map.js";
import MapView from "https://js.arcgis.com/4.34/@arcgis/core/views/MapView.js";
import FeatureLayer from "https://js.arcgis.com/4.34/@arcgis/core/layers/FeatureLayer.js";
import FeatureFilter from "https://js.arcgis.com/4.34/@arcgis/core/layers/support/FeatureFilter.js";
import Extent from "https://js.arcgis.com/4.34/@arcgis/core/geometry/Extent.js";

import { FireApiError, saveFires, toApiPayload } from "./api.js";
import { createSelectionPanel, createStatusMessage, createTypePanel } from "./ui.js";

const WILDFIRE_LAYER_URL =
  "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Wildfire/FeatureServer/0";

const OUT_FIELDS = ["objectid", "description", "eventtype", "eventdate"];

const FALLBACK_CENTER = [-122.2668, 37.8684];
const FALLBACK_ZOOM = 12;

const NO_TYPE = "none"; 
const MIN_BOX_SIZE = 5;

const elements = {
  viewContainer: document.getElementById("viewDiv"),
  mapArea: document.getElementById("mapArea"),
  status: document.getElementById("status"),
  list: document.getElementById("selectionList"),
  selectedCount: document.getElementById("selectedCount"),
  hiddenNotice: document.getElementById("hiddenNotice"),
  hiddenCount: document.getElementById("hiddenCount"),
  saveButton: document.getElementById("saveSelected"),
  deleteButton: document.getElementById("deleteSelected"),
  clearButton: document.getElementById("clearSelection"),
  restoreButton: document.getElementById("restoreHidden"),
  featureTotal: document.getElementById("featureTotal"),

  boxSelectButton: document.getElementById("boxSelect"),
  selectAllButton: document.getElementById("selectAllShown"),
  typeList: document.getElementById("typeList"),
  allTypes: document.getElementById("allTypes"),
  shownCount: document.getElementById("shownCount"),
  shownTotal: document.getElementById("shownTotal"),
};

const status = createStatusMessage(elements.status);

async function start() {
  const layer = createWildfireLayer();

  const view = new MapView({
    container: elements.viewContainer,

    map: new EsriMap({
      basemap: "osm",
      layers: [layer],
    }),

    center: FALLBACK_CENTER,
    zoom: FALLBACK_ZOOM,
    constraints: { rotationEnabled: false },

    timeZone: "Etc/UTC",
  });

  await view.when();
  await layer.load();

  const eventTypeLabels = buildEventTypeLabels(layer.types);
  applyPopupTemplate(layer, eventTypeLabels);

  const layerView = await view.whenLayerView(layer);

  const fireTypes = await loadFireTypes(layer);

  const selection = new SelectionModel();
  const typeFilter = new TypeFilter(sortTypeKeys(fireTypes.counts, eventTypeLabels));
  const highlighter = new SelectionHighlighter(layerView);
  const displayFilter = createDisplayFilter(layerView);

  const panel = createSelectionPanel(
    {
      list: elements.list,
      selectedCount: elements.selectedCount,
      hiddenNotice: elements.hiddenNotice,
      hiddenCount: elements.hiddenCount,
      selectionButtons: [elements.saveButton, elements.deleteButton, elements.clearButton],
      restoreButton: elements.restoreButton,
    },
    (objectId) => zoomToFire(view, layerView, objectId),
    (objectId) => describeFireType(fireTypes.typeOfFire.get(objectId), eventTypeLabels)
  );

  const typePanel = createTypePanel(
    {
      list: elements.typeList,
      allCheckbox: elements.allTypes,
      shownCount: elements.shownCount,
      shownTotal: elements.shownTotal,
    },
    {
      onToggleType: (key) => typeFilter.toggle(key),
      onToggleAll: (visible) => typeFilter.setAll(visible),
    }
  );

  function refresh() {
    highlighter.apply(selection.selectedIds);
    displayFilter.update(buildFilterWhere(selection.hiddenIds, typeFilter));
    panel.render(selection);

    typePanel.render({
      rows: buildTypeRows(typeFilter, fireTypes.counts, eventTypeLabels),
      allVisible: typeFilter.allVisible,
      shown: countShownFires(fireTypes.typeOfFire, selection.hiddenIds, typeFilter),
      total: fireTypes.typeOfFire.size,
    });
  }

  selection.onChange(refresh);
  typeFilter.onChange(refresh);
  refresh();

  view.on("click", (event) => handleMapClick(view, layer, selection, event));

  createBoxSelect({
    view,
    layerView,
    selection,
    button: elements.boxSelectButton,
    container: elements.mapArea,
  });

  elements.selectAllButton.addEventListener("click", () => selectAllShown(layerView, selection));
  elements.saveButton.addEventListener("click", () =>
    saveSelected(layer, selection, eventTypeLabels)
  );
  elements.deleteButton.addEventListener("click", () => deleteSelected(view, selection));
  elements.clearButton.addEventListener("click", () => selection.clearSelection());
  elements.restoreButton.addEventListener("click", () => restoreHidden(selection));

  await Promise.all([showFireCount(layer), zoomToAllFires(view, layer)]);
}

function createWildfireLayer() {
  return new FeatureLayer({
    url: WILDFIRE_LAYER_URL,
    title: "Wildfire Response Points",
    outFields: OUT_FIELDS,
    dateFieldsTimeZone: "Etc/UTC",
  });
}

function buildEventTypeLabels(layerTypes) {
  const labels = new Map();

  for (const type of layerTypes ?? []) {
    if (type?.id !== null && type?.id !== undefined) {
      labels.set(type.id, type.name ?? String(type.id));
    }
  }

  return labels;
}

function applyPopupTemplate(layer, eventTypeLabels) {
  layer.popupTemplate = {
    title: "Response point {objectid}",

    expressionInfos: [
      {
        name: "eventTypeLabel",
        title: "Type",
        expression: buildEventTypeExpression(eventTypeLabels),
      },
    ],

    content: [
      {
        type: "fields",
        fieldInfos: [
          { fieldName: "objectid", label: "ObjectID" },
          { fieldName: "description", label: "Description" },
          { fieldName: "expression/eventTypeLabel", label: "Type" },
          {
            fieldName: "eventdate",
            label: "Event date (UTC)",
            format: { dateFormat: "short-date-short-time-24" },
          },
        ],
      },
    ],
  };
}

function buildEventTypeExpression(eventTypeLabels) {
  const field = "$feature.eventtype";

  const cases = [...eventTypeLabels.entries()]
    .map(([code, label]) => `${code}, ${JSON.stringify(label)}`)
    .join(", ");

  const decode = cases
    ? `Decode(${field}, ${cases}, "Unknown type")`
    : `Decode(${field}, "Unknown type")`;

  return `IIf(IsEmpty(${field}), "Not specified", ${decode})`;
}

class SelectionModel {
  #selected = new Set();
  #hidden = new Set();
  #listeners = new Set();

  get selectedIds() {
    return [...this.#selected];
  }

  get hiddenIds() {
    return [...this.#hidden];
  }

  get selectedCount() {
    return this.#selected.size;
  }

  get hiddenCount() {
    return this.#hidden.size;
  }

  toggle(objectId) {
    if (this.#selected.delete(objectId)) {
      this.#notify();
      return false;
    }

    this.#selected.add(objectId);
    this.#notify();
    return true;
  }

  addMany(objectIds) {
    let added = 0;

    for (const objectId of objectIds) {
      if (!this.#selected.has(objectId)) {
        this.#selected.add(objectId);
        added += 1;
      }
    }

    if (added > 0) {
      this.#notify();
    }

    return added;
  }

  clearSelection() {
    if (this.#selected.size === 0) {
      return;
    }

    this.#selected.clear();
    this.#notify();
  }

  hideSelected() {
    const justHidden = this.selectedIds;

    if (justHidden.length === 0) {
      return [];
    }

    for (const objectId of justHidden) {
      this.#hidden.add(objectId);
    }

    this.#selected.clear();
    this.#notify();

    return justHidden;
  }

  restoreHidden() {
    if (this.#hidden.size === 0) {
      return;
    }

    this.#hidden.clear();
    this.#notify();
  }

  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify() {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

class TypeFilter {
  #keys;
  #hidden = new Set();
  #listeners = new Set();

  constructor(keys) {
    this.#keys = keys;
  }

  get keys() {
    return this.#keys;
  }

  get allVisible() {
    return this.#hidden.size === 0;
  }

  get noneVisible() {
    return this.#hidden.size === this.#keys.length;
  }

  isVisible(key) {
    return !this.#hidden.has(key);
  }

  get visibleKeys() {
    return this.#keys.filter((key) => this.isVisible(key));
  }

  toggle(key) {
    if (!this.#hidden.delete(key)) {
      this.#hidden.add(key);
    }

    this.#notify();
  }

  setAll(visible) {
    this.#hidden.clear();

    if (!visible) {
      for (const key of this.#keys) {
        this.#hidden.add(key);
      }
    }

    this.#notify();
  }

  onChange(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify() {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

async function loadFireTypes(layer) {
  const typeOfFire = new Map();
  const counts = new Map();

  const { features } = await layer.queryFeatures({
    where: "1=1",
    outFields: ["objectid", "eventtype"],
    returnGeometry: false,
  });

  for (const feature of features) {
    const objectId = feature.attributes.objectid;
    const key = typeKeyOf(feature.attributes.eventtype);

    typeOfFire.set(objectId, key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return { typeOfFire, counts };
}

function typeKeyOf(eventType) {
  return eventType === null || eventType === undefined ? NO_TYPE : String(eventType);
}

function sortTypeKeys(counts, eventTypeLabels) {
  return [...counts.keys()].sort((a, b) => {
    if (a === NO_TYPE) return 1;
    if (b === NO_TYPE) return -1;

    return describeFireType(a, eventTypeLabels).localeCompare(
      describeFireType(b, eventTypeLabels)
    );
  });
}

function describeFireType(key, eventTypeLabels) {
  if (key === NO_TYPE || key === undefined) {
    return "No type recorded";
  }

  return eventTypeLabels.get(Number(key)) ?? `Type ${key}`;
}

function buildTypeRows(typeFilter, counts, eventTypeLabels) {
  return typeFilter.keys.map((key) => ({
    key,
    label: describeFireType(key, eventTypeLabels),
    count: counts.get(key) ?? 0,
    visible: typeFilter.isVisible(key),
  }));
}

function countShownFires(typeOfFire, hiddenIds, typeFilter) {
  const hidden = new Set(hiddenIds);
  let shown = 0;

  for (const [objectId, key] of typeOfFire) {
    if (!hidden.has(objectId) && typeFilter.isVisible(key)) {
      shown += 1;
    }
  }

  return shown;
}

class SelectionHighlighter {
  #layerView;
  #handle = null;

  constructor(layerView) {
    this.#layerView = layerView;
  }

  apply(objectIds) {
    this.#handle?.remove();
    this.#handle = objectIds.length > 0 ? this.#layerView.highlight(objectIds) : null;
  }
}

function createDisplayFilter(layerView) {
  let currentWhere = null;

  return {
    update(where) {
      if (where === currentWhere) {
        return;
      }

      currentWhere = where;
      layerView.filter = where ? new FeatureFilter({ where }) : null;
    },
  };
}

function buildFilterWhere(hiddenIds, typeFilter) {
  const parts = [buildTypeClause(typeFilter), buildHiddenWhereClause(hiddenIds)];
  const used = parts.filter((part) => part !== null);

  return used.length > 0 ? used.join(" AND ") : null;
}

function buildTypeClause(typeFilter) {
  if (typeFilter.allVisible) {
    return null;
  }

  if (typeFilter.noneVisible) {
    return "1=0";
  }

  const options = [];
  const codes = typeFilter.visibleKeys.filter((key) => key !== NO_TYPE).map(Number);

  if (codes.length > 0) {
    for (const code of codes) {
      if (!Number.isInteger(code)) {
        throw new TypeError(`Event type must be a whole number, got: ${JSON.stringify(code)}`);
      }
    }

    options.push(`eventtype IN (${codes.join(",")})`);
  }

  if (typeFilter.isVisible(NO_TYPE)) {
    options.push("eventtype IS NULL");
  }

  return `(${options.join(" OR ")})`;
}

function buildHiddenWhereClause(hiddenIds) {
  if (!hiddenIds || hiddenIds.length === 0) {
    return null;
  }

  for (const id of hiddenIds) {
    if (!Number.isInteger(id)) {
      throw new TypeError(`ObjectID must be a whole number, got: ${JSON.stringify(id)}`);
    }
  }

  return `objectid NOT IN (${hiddenIds.join(",")})`;
}

async function handleMapClick(view, layer, selection, event) {
  const { results } = await view.hitTest(event, { include: layer });

  const graphic = results.find((result) => result.type === "graphic")?.graphic;
  const objectId = graphic?.attributes?.objectid;

  if (Number.isInteger(objectId)) {
    selection.toggle(objectId);
  }
}

function createBoxSelect({ view, layerView, selection, button, container }) {
  let active = false;
  let box = null;
  let start = null;

  button.addEventListener("click", () => setActive(!active));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) {
      setActive(false);
    }
  });

  view.on("drag", (event) => {
    if (!active) {
      return;
    }

    event.stopPropagation();

    if (event.action === "start") {
      start = { x: event.x, y: event.y };
      box = document.createElement("div");
      box.className = "drag-box";
      container.append(box);
    } else if (event.action === "update") {
      drawBox(event);
    } else if (event.action === "end") {
      finishBox(event);
    }
  });

  function drawBox(event) {
    if (!box) {
      return;
    }

    box.style.left = `${Math.min(start.x, event.x)}px`;
    box.style.top = `${Math.min(start.y, event.y)}px`;
    box.style.width = `${Math.abs(event.x - start.x)}px`;
    box.style.height = `${Math.abs(event.y - start.y)}px`;
  }

  async function finishBox(event) {
    const from = start;
    const to = { x: event.x, y: event.y };

    removeBox();

    // No "start" was seen for this drag - box select was switched on midway through it.
    if (!from) {
      return;
    }

    if (Math.abs(to.x - from.x) < MIN_BOX_SIZE && Math.abs(to.y - from.y) < MIN_BOX_SIZE) {
      return;
    }

    // layerView not layer - it knows about the filter, so hidden/filtered fires can't be caught in the box
    const { features } = await layerView.queryFeatures({
      geometry: screenBoxToExtent(view, from, to),
      outFields: ["objectid"],
      returnGeometry: false,
    });

    selection.addMany(features.map((feature) => feature.attributes.objectid));
  }

  function setActive(next) {
    active = next;

    button.setAttribute("aria-pressed", String(active));
    button.classList.toggle("tool-button-on", active);
    container.classList.toggle("map-area-picking", active);

    if (!active) {
      removeBox();
    }
  }

  function removeBox() {
    box?.remove();
    box = null;
    start = null;
  }
}

function screenBoxToExtent(view, from, to) {
  const corner1 = view.toMap(from);
  const corner2 = view.toMap(to);

  return new Extent({
    xmin: Math.min(corner1.x, corner2.x),
    ymin: Math.min(corner1.y, corner2.y),
    xmax: Math.max(corner1.x, corner2.x),
    ymax: Math.max(corner1.y, corner2.y),
    spatialReference: view.spatialReference,
  });
}

async function selectAllShown(layerView, selection) {
  const { features } = await layerView.queryFeatures({
    outFields: ["objectid"],
    returnGeometry: false,
  });

  selection.addMany(features.map((feature) => feature.attributes.objectid));
}

async function saveSelected(layer, selection, eventTypeLabels) {
  const objectIds = selection.selectedIds;

  if (objectIds.length === 0) {
    return;
  }

  elements.saveButton.disabled = true;
  status.show({ tone: "info", message: `Saving ${objectIds.length}…` });

  try {
    const { features } = await layer.queryFeatures({
      objectIds,
      outFields: OUT_FIELDS,
      returnGeometry: true,
    });

    if (features.length === 0) {
      throw new Error("The selected fires could not be fetched from the service.");
    }

    const result = await saveFires(toApiPayload(features, eventTypeLabels));

    status.show({
      tone: "success",
      message: "تم حفظ البيانات بنجاح",
      lang: "ar",
      detail:
        `${result.added} added, ${result.updated} updated — ` +
        `${result.totalSaved} ${plural(result.totalSaved, "fire")} now saved.`,
    });

    selection.clearSelection();
  } catch (error) {
    console.error(error);

    status.show({
      tone: "error",
      message: "The data could not be saved.",
      detail:
        error instanceof FireApiError
          ? [error.message, ...error.details].join(" ")
          : String(error?.message ?? error),
    });
  } finally {
    elements.saveButton.disabled = selection.selectedCount === 0;
  }
}

function deleteSelected(view, selection) {
  const hidden = selection.hideSelected();

  if (hidden.length === 0) {
    return;
  }

  // Otherwise a popup for a fire that is no longer drawn stays open over the map.
  view.closePopup();

  status.show({
    tone: "info",
    message: `Removed ${hidden.length} ${plural(hidden.length, "fire")} from the display.`,
    detail:
      "Display only — the fires are still on the ArcGIS server. Reload the page, or press " +
      "Restore, to bring them back.",
  });
}

function restoreHidden(selection) {
  selection.restoreHidden();
  status.show({ tone: "info", message: "All fires are visible again." });
}

async function zoomToAllFires(view, layer) {
  try {
    const { extent } = await layer.queryExtent();

    if (extent) {
      await view.goTo(extent.clone().expand(1.15));
    }
  } catch (error) {
    console.warn("Could not ask the service where its fires are; keeping the default view.", error);
  }
}

async function showFireCount(layer) {
  try {
    elements.featureTotal.textContent = String(await layer.queryFeatureCount());
  } catch {
    elements.featureTotal.textContent = "?";
  }
}

async function zoomToFire(view, layerView, objectId) {
  const { features } = await layerView.queryFeatures({
    objectIds: [objectId],
    returnGeometry: true,
  });

  const geometry = features[0]?.geometry;

  if (geometry) {
    await view.goTo({ target: geometry, zoom: Math.max(view.zoom, 14) });
  }
}

function plural(count, noun) {
  return count === 1 ? noun : `${noun}s`;
}

start().catch((error) => {
  console.error(error);

  status.show({
    tone: "error",
    message: "The map could not be loaded.",
    detail: String(error?.message ?? error),
  });
});
