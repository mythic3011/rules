# Profile editor architecture

The editor uses addressable pages with shared in-memory state. Navigation is
nonlinear; the section links are navigation, not a completion indicator. Each
page mounts only its own controls. The converter remains a separate tool.

## Routes and responsibilities

| Builder route | Task | Primary action |
| --- | --- | --- |
| `/builder/template` | Choose a template and understand its defaults | Continue |
| `/builder/regions` | Choose regional filters and displayed region order | Continue |
| `/builder/services` | Find, create, or open a service group | Create group |
| `/builder/services/:groupId` | Edit one group's membership and manual exits | Done |
| `/builder/policies` | Configure global service and safety controls | Continue |
| `/builder/review` | Review the draft, resolve validation, inspect preview | Create subscription |
| `/builder/success?profile=<public-id>` | Show one created profile's links and import instructions | Open management |

`/` and `/builder` open the template page. Management uses `/manage` and
`/manage/:section`, with the same components and a distinct profile context.
Existing `/manage?id=<id>#<capability>` links remain valid. The nonsecret profile
ID stays in management navigation; the capability never enters a query string.
Unknown routes and missing group IDs have explicit recovery links.

The section rail is available on every editor page. Review links open the
relevant editor route with a return marker, so the page's Done action returns to
Review. Creating from Review navigates to Success; management saves remain in
the editor and report the new server revision there. Success labels the saved
profile snapshot separately from any later local draft.

If a newer unsaved draft exists after creation, Success shows a separate notice
and a link to Review that draft. Its validation errors stay with the editor and
Review; they do not replace the saved result, subscription URL, or revision.

Success records are kept per public profile ID in tab-scoped session storage;
the bare `/builder/success` route resolves to the latest result in that tab.
The profile ID is not a capability. The result record and displayed fields
expire after 30 minutes; clearing a result does not change the saved
subscription. Management capabilities have their own lifetime; clearing an
older result record does not revoke a separately renewed management capability.

## Ownership

- `builder-router.mjs` owns route parsing and same-origin editor navigation.
- `editor-state.mjs` owns configuration fingerprints, undo, operation state,
  preview snapshots, saved baselines, and nonsecret session drafts.
- `capability-session.mjs` owns time-limited, tab-scoped management capabilities.
- `app.js` coordinates the layout, API calls, review, success, and focus.
- `profile-options.js` owns existing option collection and section controls.
- `service-group-editor.js` owns the existing membership and exit constraints;
  list and detail views share those operations without mounting both views.
- The Worker remains the authority for ProfileSpec validation and rendering.
  No frontend route changes the API, routing catalog, renderer, or database.

## State and persistence

A draft contains raw editor values, including temporarily invalid only-mode
with zero regions. Its fingerprint is compared independently with the last
saved draft and the preview's submitted draft. Operation state is separate from
these comparisons: a late save cannot mark newer edits saved.

The observable states are clean, dirty, validating, preview-ready,
preview-stale, saving, saved, and error. A new builder additionally identifies
itself as an unsaved draft. Review shows current draft summaries separately
from generated preview snapshots. Create/Save requires a current successful
server validation. An invalid draft cannot be submitted. A successful create
stores the committed spec for the Success page, which keeps its saved template
label and revision tied to that result.

Nonsecret drafts use session storage, separately for the builder and each
managed profile. They expire after 24 hours. Storage failure is visible and
leaves the in-memory draft usable. A restored management draft with an older
server revision requires an explicit recovery choice. Local draft persistence
is never described as a server save. The Worker management `PUT` remains
unconditional: two tabs editing the same revision can overwrite each other,
with the last successful write taking effect. Local revision recovery warns
about a stale restored draft; it is not a server compare-and-swap.

Management capabilities use memory and session storage with a 30-minute
absolute lifetime, never local storage, logs, analytics, or history state.
The URL fragment is removed before loading the catalog or managed profile.
Created links remain available in the same tab during that lifetime. No new
authorization mechanism is introduced.

## Interaction and accessibility

Desktop has a persistent section rail; mobile has a wrapping section menu.
Both use one document scroll. Page headings receive focus after navigation;
browser Back restores the prior position. Review Edit links carry a bounded
return-to-review flag, so Done returns directly to Review. Undo preserves the
current route; Cancel/Reset/Delete require confirmation where destructive.

Validation has an alert summary and links to relevant fields. When an affected
field is mounted, its inline message is associated through `aria-invalid` and
`aria-describedby`. Status is textual and announced politely. Startup failure
offers a localized reload action. Exit movement supports buttons as well as
drag and drop, with retained focus. Interface messages are loaded from the
three JSON locale resources; the startup recovery button also keeps its
English HTML fallback if locale loading fails.

Generated INI/YAML behavior, fail-closed defaults, protected account controls,
read URL redirects, and management bearer authorization retain their existing
owners and contracts. Regression checks exercise equivalent specs through both
the legacy all-options component and the routed component.
