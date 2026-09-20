# Interactive Wildfire System

An interactive map of the ArcGIS **Wildfire Response Points** layer, with a C# Web API that stores
the points you pick into `saved_fires.json`.

Click a fire to see its details and select it, box-select several at once, remove them from the
display, or send them to the API.

---

## Requirements

- [.NET SDK 8.0](https://dotnet.microsoft.com/download) or newer
- A modern browser (the map uses ES modules)
- Internet access — the map, the ArcGIS SDK and the fire data all come from Esri's servers

## Running it

The API serves the web page as well, so **one command starts everything**:

```bash
dotnet run --project src/Wildfire.Api
```

Then open:

| What | URL |
| --- | --- |
| The map page | <https://localhost:7042> |
| The API endpoint | `https://localhost:7042/api/fires` |
| Swagger UI | <https://localhost:7042/swagger> |

A browser opens the map page automatically. On first run the browser may warn about the .NET
development certificate — either accept it, or run `dotnet dev-certs https --trust` once.

### Plain HTTP instead

If you would rather avoid the HTTPS certificate entirely:

```bash
dotnet run --project src/Wildfire.Api --launch-profile http
```

That serves the same page and API on <http://localhost:5299>.

### Opening the page separately (Live Server, VS Code, file://)

Not required, but supported. Everything under `src/Wildfire.Api/wwwroot/` is a plain static
site — open `index.html` however you like. The page detects that it is not being served by the
API and posts to `https://localhost:7042/api/fires` instead, which the API's permissive CORS
policy allows. **The API still has to be running.**

To point the page at a different API origin, set a global before the module loads:

```html
<script>window.WILDFIRE_API_ORIGIN = "http://localhost:5299";</script>
<script type="module" src="js/app.js"></script>
```

---

## Using the map

| Action | How |
| --- | --- |
| Inspect a fire | Click it — a popup shows ObjectID, description, type and event date |
| Select / deselect | Click a fire; selected fires are highlighted and listed in the side panel |
| Select many | Turn on **Box select**, then drag a rectangle over the map |
| Select everything visible | **Select all shown** |
| Filter by type | Tick or untick entries under **Types** |
| Zoom to one fire | Click its row in the selection list |
| **Delete Selected** | Removes the selected fires **from the map display only** |
| **Restore to map** | Brings removed fires back |
| **Save Selected** | POSTs the selected fires to the API and confirms with *تم حفظ البيانات بنجاح* |

`Delete Selected` applies a `FeatureFilter` to the `FeatureLayerView`. Nothing is ever deleted
from the ArcGIS FeatureServer — reload the page and every fire is back.

---

## The API

Base URL: `https://localhost:7042/api/fires` (or `http://localhost:5299/api/fires`)

### `POST /api/fires`

Takes a **non-empty JSON array** of features and merges them into `saved_fires.json`.

```json
[
  {
    "id": 5286211,
    "attributes": {
      "objectid": 5286211,
      "description": "Fire Station NEW",
      "eventtype": 8,
      "eventTypeLabel": "Fire Station",
      "eventdate": "2026-08-24T15:26:48Z"
    },
    "geometry": {
      "x": -115.1418581,
      "y": 36.1991758,
      "spatialReference": { "wkid": 4326 }
    }
  }
]
```

Responds `200` with a summary:

```json
{ "added": 1, "updated": 0, "totalSaved": 1 }
```

**Previously saved fires are never lost.** New fires are appended; a fire whose `id` is already
stored is replaced rather than duplicated.

### `GET /api/fires`

Returns everything currently in `saved_fires.json`.

### Validation

A bad request returns `400` with an RFC 7807 problem document, keyed by the position of the
offending element:

```json
{
  "status": 400,
  "errors": {
    "$[0]": ["'attributes.objectid' (2) must match 'id' (1)."],
    "$[1]": ["longitude 999 is outside the valid range [-180, 180] degrees for EPSG:4326 (WGS 84, degrees)."]
  }
}
```

The rules:

- `id` and `attributes.objectid` are both required and must be equal
- `geometry.spatialReference.wkid` must be `4326`, `3857` or `102100`
- `x` / `y` must be finite and within range for that coordinate system
- `eventdate` is optional, and accepts either ISO 8601 or ArcGIS epoch milliseconds

Nothing is written when validation fails.

---

## Where the data is saved

`src/Wildfire.Api/saved_fires.json`

Configurable via `FireStore:FilePath` in `appsettings.json`; a relative path resolves against the
project's content root. Writes go to a temporary file and are then moved into place, so the file
is never left half-written.

## Project layout

```
src/Wildfire.Api/
├── Program.cs              # startup: CORS, static files, Swagger, DI
├── FiresEndpoints.cs       # POST and GET /api/fires
├── FireModels.cs           # DTOs matching the ArcGIS feature shape
├── FireValidator.cs        # validation rules, no framework types
├── FireStore.cs            # reads and writes saved_fires.json under a lock
├── EventDateConverter.cs   # accepts ISO 8601 or epoch milliseconds for eventdate
├── saved_fires.json        # the stored fires
└── wwwroot/                # the frontend
    ├── index.html
    ├── css/app.css
    └── js/
        ├── app.js          # map, selection, filtering, buttons
        ├── api.js          # payload building + fetch/async-await call to the API
        └── ui.js           # side panel and status message rendering
```

## Data source

<https://sampleserver6.arcgisonline.com/arcgis/rest/services/Wildfire/FeatureServer/0>

317 point features. The layer stores geometry in Web Mercator (EPSG:3857); the page converts
each point to longitude/latitude (EPSG:4326) before sending it to the API.

---

## تشغيل سريع

```bash
dotnet run --project src/Wildfire.Api
```

- الصفحة والخريطة: <https://localhost:7042>
- رابط الـ API: `https://localhost:7042/api/fires`
- ملف الحفظ: `src/Wildfire.Api/saved_fires.json`

زر **Delete Selected** يحذف المعالم من عرض الخريطة فقط، ولا يحذفها من الـ FeatureServer الأصلي.
زر **Save Selected** يرسل المعالم المحددة إلى الـ API باستخدام `fetch` مع `async/await`،
ويضيفها إلى الملف دون فقدان البيانات السابقة.
