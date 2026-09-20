
export function createSelectionPanel(elements, onFireClick, describeFire) {
  const { list, selectedCount, hiddenNotice, hiddenCount, selectionButtons, restoreButton } =
    elements;

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-object-id]");

    if (button) {
      onFireClick(Number(button.dataset.objectId));
    }
  });

  function render(selection) {
    const ids = selection.selectedIds;

    selectedCount.textContent = String(ids.length);
    list.replaceChildren(...ids.map((id) => createFireRow(id, describeFire(id))));
    list.hidden = ids.length === 0;

    for (const button of selectionButtons) {
      button.disabled = ids.length === 0;
    }

    hiddenCount.textContent = String(selection.hiddenCount);
    hiddenNotice.hidden = selection.hiddenCount === 0;
    restoreButton.disabled = selection.hiddenCount === 0;
  }

  return { render };
}

function createFireRow(objectId, typeName) {
  const row = document.createElement("li");
  row.className = "fire-list-item";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "fire-button";
  button.title = "Zoom to this fire";
  button.dataset.objectId = String(objectId);

  const id = document.createElement("span");
  id.className = "fire-id";
  id.textContent = `#${objectId}`; // textContent not innerHTML, keep it as plain text

  const type = document.createElement("span");
  type.className = "fire-type";
  type.textContent = typeName;

  button.append(id, type);
  row.append(button);
  return row;
}

export function createTypePanel(elements, { onToggleType, onToggleAll }) {
  const { list, allCheckbox, shownCount, shownTotal } = elements;

  list.addEventListener("change", (event) => {
    const row = event.target.closest("[data-type-key]");

    if (row) {
      onToggleType(row.dataset.typeKey);
    }
  });

  allCheckbox.addEventListener("change", () => onToggleAll(allCheckbox.checked));

  function render({ rows, allVisible, shown, total }) {
    allCheckbox.checked = allVisible;
    shownCount.textContent = String(shown);
    shownTotal.textContent = String(total);

    list.replaceChildren(...rows.map(createTypeRow));
  }

  return { render };
}

function createTypeRow({ key, label, count, visible }) {
  const row = document.createElement("label");
  row.className = visible ? "type-row" : "type-row type-row-off";
  row.dataset.typeKey = key;

  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = visible;

  const name = document.createElement("span");
  name.className = "type-name";
  name.textContent = label;

  const number = document.createElement("span");
  number.className = "type-count";
  number.textContent = String(count);

  row.append(box, name, number);
  return row;
}

const TONE_CLASSES = ["status-success", "status-error", "status-info"];

export function createStatusMessage(container) {
  const headline = document.createElement("p");
  headline.className = "status-headline";

  // detail is separate from headline because headline can be Arabic (RTL) and detail is English (LTR)
  const detail = document.createElement("p");
  detail.className = "status-detail";
  detail.lang = "en";
  detail.dir = "ltr";

  container.append(headline, detail);

  function show({ tone, message, lang = "en", detail: detailText = "" }) {
    container.classList.remove(...TONE_CLASSES);
    container.classList.add(`status-${tone}`);
    container.hidden = false;

    headline.textContent = message;
    headline.lang = lang;
    headline.dir = lang === "ar" ? "rtl" : "ltr";

    detail.textContent = detailText;
    detail.hidden = detailText === "";
  }

  function clear() {
    container.hidden = true;
    container.classList.remove(...TONE_CLASSES);
    headline.textContent = "";
    detail.textContent = "";
  }

  return { show, clear };
}
