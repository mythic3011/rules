import { translate, translateCatalogLabel } from "./i18n.mjs";

const DRAG_TYPE = "application/x-profile-route";
const SERVICE_DRAG_TYPE = "application/x-profile-service";

export function copyServiceGroups(value) {
  if (!Array.isArray(value)) return undefined;
  if (!value.every((group) => group && typeof group.id === "string" && typeof group.name === "string"
    && Array.isArray(group.serviceIds) && group.serviceIds.every((id) => typeof id === "string")
    && Array.isArray(group.routes) && group.routes.every((route) => typeof route === "string"))) return undefined;
  return value.map(({ id, name, serviceIds, routes }) => ({ id, name, serviceIds: [...serviceIds], routes: [...routes] }));
}

export function mountServiceGroupEditor({
  root, groups, regions, services, value, selectedGroup, allowDirect, failClosed,
  servicePaletteOpen = false, routePaletteOpen = true, settingsOpen = false, limits = {}, reservedNames = [],
  searches = {}, onSearch = () => {},
  disabledRegions = [], onlyRegions = [], onSelect, onChange,
}) {
  const document = root.ownerDocument;
  const policiesByService = new Map(groups.flatMap((item) => item.serviceIds.map((id) => [id, item])));
  const byRegion = new Map(regions.map((region) => [region.id, region]));
  const disabled = new Set(disabledRegions);
  const only = new Set(onlyRegions);
  const reserved = new Set(reservedNames);
  const isProtected = (item) => groups.some((policy) => policy.protected
    && (policy.id === item.id || item.serviceIds.some((id) => policy.serviceIds.includes(id))));
  const allowedRoutes = (item) => {
    const policies = item.serviceIds.map((id) => policiesByService.get(id)).filter(Boolean);
    const choices = policies[0]?.allowedRoutes ?? [...new Set(groups.flatMap((policy) => policy.allowedRoutes))];
    const defaults = new Set(policies.map((policy) => policy.defaultRouteGroup));
    return choices.filter((route) => policies.every((policy) => policy.allowedRoutes.includes(route))
      && (route !== "default" || defaults.size <= 1));
  };
  const globallyAllowed = (route) => {
    if (route === "direct") return allowDirect !== false;
    if (route === "other") return only.size === 0;
    return !byRegion.has(route) || (!disabled.has(route) && (!only.size || only.has(route)));
  };
  const layout = (copyServiceGroups(value) ?? groups.map(({ id, name, serviceIds, defaultRoutes }) => ({
    id, name, serviceIds: [...serviceIds], routes: [...defaultRoutes],
  }))).map((item) => {
    const routes = item.routes.filter(globallyAllowed);
    return { ...item, routes: isProtected(item) || failClosed === true
      ? ["reject", ...routes.filter((route) => route !== "reject")]
      : routes };
  });
  const group = layout.find((item) => item.id === selectedGroup) ?? layout[0];
  const locked = group && isProtected(group);
  const rejectLocked = locked || failClosed === true;
  const permitted = (route) => group && allowedRoutes(group).includes(route) && globallyAllowed(route);
  const routes = (group?.routes ?? []).filter(permitted);
  const exits = routes.filter((route) => route !== "reject");
  const startBlocked = rejectLocked || routes[0] === "reject";
  const routeName = (route) => {
    const region = byRegion.get(route);
    if (route === "direct") return `${translate("routeDirect")} · ${translate("routeActions")}`;
    return region
      ? `${route.toUpperCase()} · ${translateCatalogLabel("regionNames", route, region.name)}`
      : translate(`route${route[0].toUpperCase()}${route.slice(1)}`);
  };
  const groupName = (item) => groups.some((policy) => policy.id === item.id && policy.name === item.name)
    ? translateCatalogLabel("serviceGroupNames", item.id, translateCatalogLabel("serviceNames", item.id, item.name)) : item.name;
  const serviceName = (id) => translateCatalogLabel("serviceNames", id, services.find((service) => service.id === id)?.name ?? id);
  const label = (tag, text, className) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action, id, className) => {
    const node = label("button", text, className);
    node.type = "button";
    if (id) node.id = id;
    node.addEventListener("click", action);
    return node;
  };
  const status = label("p", "", "hint group-edit-status");
  status.id = "service-group-edit-status";
  status.setAttribute("role", "status");
  const validName = (name, currentId) => name && name.isWellFormed()
    && (!limits.maxNameLength || name.length <= limits.maxNameLength)
    && !reserved.has(name)
    && !layout.some((item) => item.id !== currentId && item.name === name)
    && !/[,`\[\]\\\p{Cc}\u2028\u2029]/u.test(name);
  function searchable(key, id, textKey, list) {
    const wrapper = document.createElement("div");
    wrapper.className = "group-search";
    const search = document.createElement("input");
    search.type = "search";
    search.id = id;
    search.value = searches[key] ?? "";
    search.placeholder = translate(textKey);
    search.setAttribute("aria-label", translate(textKey));
    const empty = label("p", translate("noSearchResults"), "hint group-search-empty");
    function filter() {
      const term = search.value.normalize("NFKC").toLocaleLowerCase();
      let visible = 0;
      for (const item of list.children) {
        item.hidden = !`${item.dataset.search ?? ""} ${item.textContent}`.normalize("NFKC").toLocaleLowerCase().includes(term);
        if (!item.hidden) visible += 1;
      }
      if (key === "groups") {
        const visible = [...list.children].filter((item) => !item.hidden);
        const selected = visible.find((item) => item.getAttribute("aria-checked") === "true");
        const tabStop = selected ?? visible[0];
        for (const item of list.children) item.tabIndex = item === tabStop ? 0 : -1;
      }
      empty.hidden = !term || visible > 0;
      onSearch(key, search.value);
    }
    search.addEventListener("input", filter);
    wrapper.append(search, list, empty);
    filter();
    return wrapper;
  }
  function confirmedAction(textKey, helpKey, id, action) {
    const panel = document.createElement("details");
    panel.className = "group-confirm-action";
    panel.append(label("summary", translate(textKey)), label("p", translate(helpKey), "hint"));
    panel.append(button(translate("confirmAction"), action, id), button(translate("cancelAction"), () => { panel.open = false; }));
    return panel;
  }

  function updateRoutes(next) {
    onChange(layout.map((item) => item.id === group.id ? { ...item, routes: next } : item));
  }
  function updateExits(next) {
    const unique = [...new Set(next.filter((route) => route !== "reject" && permitted(route)))];
    // Preserve a legacy template's trailing block choice until explicitly changed.
    updateRoutes(startBlocked ? ["reject", ...unique]
      : routes.includes("reject") ? [...unique, "reject"] : unique);
  }
  function insert(route, position) {
    if (route === "reject" || !permitted(route)) return;
    const next = exits.filter((item) => item !== route);
    const oldIndex = exits.indexOf(route);
    const target = Math.min(position - (oldIndex >= 0 && oldIndex < position ? 1 : 0), next.length);
    next.splice(target, 0, route);
    updateExits(next);
  }
  function moveService(id) {
    const policy = policiesByService.get(id);
    if (!group || !policy || policy.protected || locked) return;
    const serviceIds = [...new Set([...group.serviceIds, id])];
    if (routes.some((route) => !allowedRoutes({ ...group, serviceIds }).includes(route))) {
      status.textContent = translate("incompatibleGroupRoutes");
      return;
    }
    onChange(layout.map((item) => ({ ...item,
      serviceIds: item.id === group.id ? serviceIds : item.serviceIds.filter((service) => service !== id),
    })));
  }
  function unassignService(id) {
    onChange(layout.map((item) => item.id === group.id
      ? { ...item, serviceIds: item.serviceIds.filter((service) => service !== id) } : item));
  }
  function draggable(node, type, id) {
    node.draggable = true;
    node.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData(type, id);
      event.dataTransfer.effectAllowed = type === SERVICE_DRAG_TYPE || exits.includes(id) ? "move" : "copy";
      node.classList.add("is-dragging");
    });
    node.addEventListener("dragend", () => node.classList.remove("is-dragging"));
  }
  function dropTarget(node, type, canDrop, drop) {
    node.addEventListener("dragover", (event) => {
      if (!event.dataTransfer.types.includes(type)) return;
      event.preventDefault();
      node.classList.add("is-drop-target");
    });
    node.addEventListener("dragleave", () => node.classList.remove("is-drop-target"));
    node.addEventListener("drop", (event) => {
      node.classList.remove("is-drop-target");
      const id = event.dataTransfer.getData(type);
      if (!canDrop(id)) return;
      event.preventDefault();
      event.stopPropagation();
      drop(id);
    });
  }

  root.append(label("h3", translate("serviceGroupRoutes")));
  root.append(label("p", translate("serviceGroupRoutesHelp"), "hint"));
  const workspace = document.createElement("div");
  workspace.className = "service-group-workspace";
  const navigation = document.createElement("nav");
  navigation.className = "service-group-navigation";
  navigation.setAttribute("aria-label", translate("groupsLabel"));
  navigation.append(label("h4", translate("groupsLabel"), "group-section-label"));
  const groupList = document.createElement("div");
  groupList.id = "service-group-list";
  groupList.setAttribute("role", "radiogroup");
  groupList.setAttribute("aria-label", translate("groupsLabel"));
  for (const item of layout) {
    const choose = button("", () => onSelect(item.id), `service-group-select-${item.id}`, "group-choice");
    choose.setAttribute("role", "radio");
    choose.setAttribute("aria-checked", String(item.id === group?.id));
    choose.tabIndex = item.id === group?.id ? 0 : -1;
    choose.dataset.groupId = item.id;
    choose.dataset.search = `${item.id} ${item.name}`;
    choose.addEventListener("keydown", (event) => {
      const visible = [...groupList.children].filter((choice) => !choice.hidden);
      const current = visible.indexOf(choose);
      if (current < 0 || !visible.length) return;
      let destination = -1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") destination = (current + 1) % visible.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") destination = (current - 1 + visible.length) % visible.length;
      else if (event.key === "Home") destination = 0;
      else if (event.key === "End") destination = visible.length - 1;
      else if (event.key === " " || event.key === "Spacebar") destination = current;
      else return;
      event.preventDefault();
      onSelect(visible[destination].dataset.groupId, true, true);
    });
    choose.append(label("span", groupName(item), "group-choice-name"));
    choose.append(label("small", translate("groupCounts", {
      services: item.serviceIds.length, exits: item.routes.filter((route) => route !== "reject").length,
    }), "group-choice-count"));
    groupList.append(choose);
  }
  navigation.append(searchable("groups", "service-group-search", "searchGroups", groupList));
  const createPanel = document.createElement("details");
  createPanel.className = "group-create";
  const newGroup = label("summary", `+ ${translate("createGroup")}`);
  newGroup.id = "new-service-group";
  createPanel.append(newGroup);
  const newName = document.createElement("input");
  newName.id = "new-service-group-name";
  if (limits.maxNameLength) newName.maxLength = limits.maxNameLength;
  newName.setAttribute("aria-label", translate("newGroupName"));
  newName.placeholder = translate("newGroupName");
  const create = button(translate("createGroup"), () => {
    const name = newName.value.trim();
    if (!validName(name)) {
      status.textContent = translate("invalidGroupName");
      return;
    }
    let suffix = 1;
    while (layout.some((item) => item.id === `custom-${suffix}`)) suffix += 1;
    const id = `custom-${suffix}`;
    onSelect(id, false);
    onChange([...layout, { id, name, serviceIds: [], routes: ["reject"] }]);
  }, "create-service-group");
  create.disabled = limits.maxGroups !== undefined && layout.length >= limits.maxGroups;
  createPanel.append(newName, create);
  navigation.append(createPanel);
  const advanced = document.createElement("details");
  advanced.className = "group-advanced";
  advanced.append(label("summary", translate("advancedGroupActions")));
  advanced.append(confirmedAction("resetServiceGroups", "restoreServiceGroupsHelp", "reset-service-groups", () => onChange(undefined)));
  navigation.append(advanced);
  workspace.append(navigation);
  const editor = document.createElement("div");
  editor.className = "service-group-detail";
  workspace.append(editor);
  root.append(workspace);
  if (!group) {
    editor.append(label("p", translate("chooseOrCreateGroup"), "hint"));
    root.append(status);
    return;
  }

  const heading = document.createElement("div");
  heading.className = "group-detail-heading";
  heading.append(label("h3", groupName(group)));
  const settings = document.createElement("details");
  settings.className = "group-settings";
  settings.open = settingsOpen;
  settings.append(label("summary", translate("groupSettings")));
  const nameLabel = label("label", translate("groupName"));
  const nameInput = document.createElement("input");
  nameInput.id = "service-group-name";
  if (limits.maxNameLength) nameInput.maxLength = limits.maxNameLength;
  nameInput.value = group.name;
  nameInput.disabled = locked;
  nameLabel.append(nameInput);
  const rename = button(translate("renameGroup"), () => {
    const name = nameInput.value.trim();
    if (!validName(name, group.id)) {
      status.textContent = translate("invalidGroupName");
      return;
    }
    onChange(layout.map((item) => item.id === group.id ? { ...item, name } : item));
  }, "rename-service-group");
  rename.disabled = locked;
  const renameRow = document.createElement("div");
  renameRow.className = "group-rename-row";
  renameRow.append(nameLabel, rename);
  settings.append(renameRow);
  const order = document.createElement("div");
  order.className = "group-order-actions";
  order.append(label("span", translate("groupDisplayOrder")));
  const groupIndex = layout.findIndex((item) => item.id === group.id);
  for (const [delta, key, direction] of [[-1, "moveUp", "up"], [1, "moveDown", "down"]]) {
    const move = button(delta < 0 ? "↑" : "↓", () => {
      const next = [...layout];
      [next[groupIndex], next[groupIndex + delta]] = [next[groupIndex + delta], next[groupIndex]];
      onChange(next);
    }, `move-service-group-${direction}`);
    move.disabled = groupIndex + delta < 0 || groupIndex + delta >= layout.length;
    move.setAttribute("aria-label", `${translate(key)}: ${groupName(group)}`);
    order.append(move);
  }
  settings.append(order);
  const removeGroup = button(translate("deleteGroup"), () => {
    const remaining = layout.filter((item) => item.id !== group.id);
    onSelect(remaining[0]?.id ?? "", false);
    onChange(remaining);
  }, "delete-service-group", "group-delete");
  removeGroup.disabled = locked;
  settings.append(removeGroup, label("p", translate("deleteGroupHelp"), "hint"));
  heading.append(settings);
  editor.append(heading);
  if (locked) editor.append(label("p", translate("protectedGroupRoutes"), "group-protection-note"));

  const serviceSection = document.createElement("section");
  serviceSection.className = "group-assignment";
  serviceSection.append(label("h4", translate("groupServices"), "group-section-label"));
  const members = document.createElement("div");
  members.id = "service-group-members";
  members.className = "group-service-members";
  dropTarget(members, SERVICE_DRAG_TYPE, (id) => !locked && policiesByService.has(id), moveService);
  for (const id of group.serviceIds) {
    const name = serviceName(id);
    const remove = button(locked ? name : `${name} ×`, () => unassignService(id), `group-service-${id}-remove`);
    remove.disabled = locked;
    if (!locked) draggable(remove, SERVICE_DRAG_TYPE, id);
    remove.setAttribute("aria-label", locked ? name : translate("removeServiceFromGroup", { service: name }));
    members.append(remove);
  }
  if (!group.serviceIds.length) members.append(label("p", translate("emptyGroupServices"), "hint"));
  serviceSection.append(members);
  if (!locked) {
    const servicePalette = document.createElement("details");
    servicePalette.className = "group-service-palette";
    servicePalette.open = servicePaletteOpen;
    servicePalette.append(label("summary", translate("addGroupServices")));
    const choices = document.createElement("div");
    choices.className = "group-service-choices";
    dropTarget(choices, SERVICE_DRAG_TYPE, (id) => group.serviceIds.includes(id), unassignService);
    for (const service of services) {
      if (policiesByService.get(service.id)?.protected || group.serviceIds.includes(service.id)) continue;
      const add = button(serviceName(service.id), () => moveService(service.id), `group-service-available-${service.id}`);
      const owner = layout.find((item) => item.serviceIds.includes(service.id));
      add.title = owner ? translate("moveServiceFrom", { group: groupName(owner) }) : translate("unassignedServices");
      add.dataset.search = `${service.id} ${service.name}`;
      draggable(add, SERVICE_DRAG_TYPE, service.id);
      choices.append(add);
    }
    servicePalette.append(searchable("services", "group-service-search", "searchServices", choices));
    serviceSection.append(servicePalette);
  }
  editor.append(serviceSection);

  const routeSection = document.createElement("section");
  routeSection.className = "group-exit-priority";
  routeSection.append(label("h4", translate("groupRouteOrder"), "group-section-label"));
  routeSection.append(label("p", translate("groupRouteOrderHelp"), "hint"));
  const startLabel = document.createElement("label");
  startLabel.className = "group-start-state";
  const start = document.createElement("input");
  start.type = "checkbox";
  start.id = "service-group-start-reject";
  start.checked = Boolean(startBlocked);
  start.disabled = Boolean(rejectLocked);
  start.addEventListener("change", () => updateRoutes(start.checked ? ["reject", ...exits] : [...exits]));
  startLabel.append(start, label("span", translate("groupStartBlocked")));
  routeSection.append(startLabel);
  const startHelp = locked ? "protectedStartBlockedHelp" : failClosed === true ? "globalStartBlockedHelp" : "groupStartBlockedHelp";
  routeSection.append(label("p", translate(startHelp), "hint group-start-help"));
  const list = document.createElement("ol");
  list.id = "service-group-routes";
  list.className = "route-list";
  list.setAttribute("aria-label", translate("groupRouteOrder"));
  dropTarget(list, DRAG_TYPE, (route) => route !== "reject" && permitted(route), (route) => insert(route, exits.length));
  for (const [index, route] of exits.entries()) {
    const row = document.createElement("li");
    row.id = `group-route-${route}`;
    row.dataset.route = route;
    row.tabIndex = 0;
    row.className = "route-row";
    if (route === "direct") {
      row.classList.add("route-action");
      row.title = translate("directActionHelp");
    }
    const name = routeName(route);
    row.append(label("span", String(index + 1), "route-position"), label("span", name, "route-name"));
    draggable(row, DRAG_TYPE, route);
    dropTarget(row, DRAG_TYPE, (token) => token !== "reject" && permitted(token), (token) => insert(token, index));
    const actions = document.createElement("div");
    actions.className = "route-actions";
    for (const [key, delta, text] of [["moveUp", -1, "↑"], ["moveDown", 1, "↓"]]) {
      const move = button(text, () => {
        const next = [...exits];
        [next[index], next[index + delta]] = [next[index + delta], next[index]];
        updateExits(next);
      }, `group-route-${route}-${key}`);
      move.setAttribute("aria-label", `${translate(key)}: ${name}`);
      move.disabled = index + delta < 0 || index + delta >= exits.length;
      actions.append(move);
    }
    const remove = button("×", () => updateExits(exits.filter((item) => item !== route)), `group-route-${route}-remove`);
    remove.setAttribute("aria-label", translate("removeRoute", { route: name }));
    actions.append(remove);
    row.append(actions, label("span", "⋮⋮", "route-handle"));
    list.append(row);
  }
  if (!exits.length) list.append(label("li", translate("emptyGroupRoutes"), "hint route-empty"));
  const transfer = document.createElement("div");
  transfer.className = "group-exit-transfer";
  const selectedPane = document.createElement("section");
  selectedPane.className = "group-selected-exits";
  selectedPane.append(label("h5", translate("selectedRoutes")), list);
  const palettePanel = document.createElement("details");
  palettePanel.className = "group-route-palette";
  palettePanel.open = routePaletteOpen;
  palettePanel.append(label("summary", translate("addGroupRoutes")));
  const palette = document.createElement("div");
  palette.className = "route-palette-items";
  dropTarget(palette, DRAG_TYPE, (route) => exits.includes(route), (route) => updateExits(exits.filter((item) => item !== route)));
  const unavailable = [];
  const choices = [...new Set(groups.flatMap((item) => item.allowedRoutes))].filter((route) => route !== "reject");
  for (const route of choices) {
    if (exits.includes(route)) continue;
    const name = routeName(route);
    if (!permitted(route)) {
      const reason = !allowedRoutes(group).includes(route) ? "routeUnavailableService"
        : route === "direct" ? "routeUnavailableDirect" : "routeUnavailableRegion";
      unavailable.push({ name, reason });
      continue;
    }
    const add = button(name, () => insert(route, exits.length), `route-available-${route}`, "route-choice");
    add.setAttribute("aria-label", translate("addRoute", { route: name }));
    add.dataset.search = `${route} ${byRegion.get(route)?.name ?? ""}`;
    if (route === "direct") {
      add.classList.add("route-action");
      add.title = translate("directActionHelp");
      add.append(label("small", translate("directActionHelp")));
    }
    draggable(add, DRAG_TYPE, route);
    palette.append(add);
  }
  if (!palette.children.length) palette.append(label("p", translate("allGroupRoutesAdded"), "hint"));
  palettePanel.append(searchable("routes", "group-route-search", "searchRoutes", palette));
  if (unavailable.length) {
    const explanation = document.createElement("details");
    explanation.className = "route-unavailable";
    explanation.append(label("summary", translate("unavailableRoutes", { count: unavailable.length })));
    const reasons = document.createElement("ul");
    for (const { name, reason } of unavailable) {
      const item = document.createElement("li");
      item.append(label("span", name), label("small", translate(reason)));
      reasons.append(item);
    }
    explanation.append(reasons);
    palettePanel.append(explanation);
  }
  transfer.append(palettePanel, selectedPane);
  routeSection.append(transfer);
  settings.append(confirmedAction("resetGroupRoutes", "resetGroupRoutesHelp", "reset-service-group-routes", () => {
    const canonical = groups.find((item) => item.id === group.id);
    const defaults = (canonical?.defaultRoutes ?? ["reject"]).filter(permitted);
    updateRoutes(rejectLocked ? ["reject", ...defaults.filter((route) => route !== "reject")] : defaults);
  }));
  editor.append(routeSection);
  root.append(status);
  const assigned = new Set(layout.flatMap((item) => item.serviceIds));
  const unassigned = services.filter((service) => !assigned.has(service.id));
  if (unassigned.length) root.append(label("p", translate("unassignedServicesHint", {
    services: unassigned.map((service) => serviceName(service.id)).join(", "),
  }), "hint group-unassigned"));
}
