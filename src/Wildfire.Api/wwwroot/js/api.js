
import { webMercatorToGeographic } from "https://js.arcgis.com/4.34/@arcgis/core/geometry/support/webMercatorUtils.js";

const API_ORIGINS = ["https://localhost:7042", "http://localhost:5299"];

function resolveApiBaseUrl() {
  if (typeof window.WILDFIRE_API_ORIGIN === "string") {
    return window.WILDFIRE_API_ORIGIN.replace(/\/+$/, "");
  }

  return API_ORIGINS.includes(window.location.origin) ? "" : API_ORIGINS[0];
}

const API_BASE_URL = resolveApiBaseUrl();
const SAVE_FIRES_ENDPOINT = `${API_BASE_URL}/api/fires`;

const COORDINATE_DECIMALS = 7;
const WGS84 = 4326;

function toLongitudeLatitude(point) {
  const spatialReference = point?.spatialReference;

  if (!spatialReference) {
    throw new Error("This point does not say what coordinate system it is in, so its numbers cannot be read.");
  }

  if (spatialReference.isWGS84) {
    return { x: point.x, y: point.y };
  }

  if (spatialReference.isWebMercator) {
    const converted = webMercatorToGeographic(point);
    return { x: converted.x, y: converted.y };
  }

  throw new Error(
    `Cannot convert coordinate system ${spatialReference.wkid} to longitude/latitude here.`
  );
}

function round(value) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Coordinate must be a real number, got: ${value}`);
  }

  return Number(value.toFixed(COORDINATE_DECIMALS));
}

function toIsoDate(millisecondsSince1970) {
  if (millisecondsSince1970 === null || millisecondsSince1970 === undefined) {
    return null;
  }

  const date = new Date(millisecondsSince1970);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toApiFeature(feature, eventTypeLabels) {
  const attributes = feature?.attributes;

  if (!attributes) {
    throw new Error("This feature has no attributes.");
  }

  const objectId = attributes.objectid;

  if (!Number.isInteger(objectId)) {
    throw new Error(`This feature has no usable objectid: ${JSON.stringify(objectId)}`);
  }

  const { x, y } = toLongitudeLatitude(feature.geometry);

  const eventType = attributes.eventtype ?? null;
  const eventTypeLabel =
    eventType === null ? null : eventTypeLabels.get(eventType) ?? `Unknown type (${eventType})`;

  return {
    id: objectId,
    attributes: {
      objectid: objectId,
      description: attributes.description ?? null,
      eventtype: eventType,
      eventTypeLabel: eventTypeLabel,
      eventdate: toIsoDate(attributes.eventdate),
    },
    geometry: {
      x: round(x),
      y: round(y),
      spatialReference: { wkid: WGS84 },
    },
  };
}

export function toApiPayload(features, eventTypeLabels) {
  return features.map((feature) => toApiFeature(feature, eventTypeLabels));
}

export class FireApiError extends Error {
  constructor(message, status, details = []) {
    super(message);
    this.name = "FireApiError";
    this.status = status;
    this.details = details;
  }
}

export async function saveFires(features) {
  let response;

  try {
    response = await fetch(SAVE_FIRES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features),
    });
  } catch (cause) {
    throw new FireApiError(
      "Could not reach the API. Check that it is running and that this page is allowed to call it.",
      0,
      [String(cause?.message ?? cause)]
    );
  }

  if (!response.ok) {
    throw new FireApiError(
      `The API rejected the request (HTTP ${response.status}).`,
      response.status,
      await readErrorMessages(response)
    );
  }

  return response.json();
}

async function readErrorMessages(response) {
  try {
    const problem = await response.json();

    if (problem?.errors && typeof problem.errors === "object") {
      return Object.entries(problem.errors).flatMap(([where, messages]) =>
        (Array.isArray(messages) ? messages : [messages]).map((message) => `${where}: ${message}`)
      );
    }

    return problem?.detail ? [problem.detail] : [];
  } catch {
    return []; 
  }
}
