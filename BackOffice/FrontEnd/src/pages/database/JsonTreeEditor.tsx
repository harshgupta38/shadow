import { useState } from "react";
import { Modal } from "react-bootstrap";
import { ChevronRight, PlusLg, TrashFill } from "react-bootstrap-icons";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

type JsonKind = "string" | "number" | "boolean" | "null" | "object" | "array";

const KIND_LABELS: Record<JsonKind, string> = {
  string: "String",
  number: "Number",
  boolean: "Boolean",
  null: "Null",
  object: "Object",
  array: "Array",
};

// "Object · 7 keys" / "Array · 3 items" — shown on drill-in rows and reused
// in the type-change/delete confirmations so the warning names exactly what's at risk.
function describeContainer(value: JsonValue): string {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  const count = Object.keys(value as object).length;
  return `${count} key${count === 1 ? "" : "s"}`;
}

function hasNestedData(value: JsonValue): boolean {
  const kind = kindOf(value);
  if (kind !== "object" && kind !== "array") return false;
  return Array.isArray(value) ? value.length > 0 : Object.keys(value as object).length > 0;
}

function kindOf(value: JsonValue): JsonKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function emptyFor(kind: JsonKind): JsonValue {
  switch (kind) {
    case "object": return {};
    case "array": return [];
    case "number": return 0;
    case "boolean": return false;
    case "null": return null;
    default: return "";
  }
}

function convert(value: JsonValue, kind: JsonKind): JsonValue {
  if (kindOf(value) === kind) return value;
  if (kind === "string") return value === null ? "" : typeof value === "object" ? "" : String(value);
  if (kind === "number") { const n = Number(value); return Number.isFinite(n) ? n : 0; }
  if (kind === "boolean") return Boolean(value);
  return emptyFor(kind);
}

type PathSegment = string | number;

function getAtPath(root: JsonValue, path: PathSegment[]): JsonValue | undefined {
  let node: JsonValue | undefined = root;
  for (const segment of path) {
    if (node === undefined || node === null || typeof node !== "object") return undefined;
    node = Array.isArray(node) ? node[segment as number] : node[segment as string];
  }
  return node;
}

function setAtPath(root: JsonValue, path: PathSegment[], value: JsonValue): JsonValue {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (Array.isArray(root)) {
    const next = root.slice();
    next[head as number] = setAtPath(next[head as number] ?? null, rest, value);
    return next;
  }
  const obj = root && typeof root === "object" ? (root as Record<string, JsonValue>) : {};
  return { ...obj, [head as string]: setAtPath(obj[head as string] ?? null, rest, value) };
}

function deleteAtPath(root: JsonValue, path: PathSegment[]): JsonValue {
  if (path.length === 0) return root;
  const [head, ...rest] = path;
  if (rest.length > 0) {
    if (Array.isArray(root)) {
      const next = root.slice();
      next[head as number] = deleteAtPath(next[head as number], rest);
      return next;
    }
    const obj = root as Record<string, JsonValue>;
    return { ...obj, [head as string]: deleteAtPath(obj[head as string], rest) };
  }
  if (Array.isArray(root)) {
    const next = root.slice();
    next.splice(head as number, 1);
    return next;
  }
  const obj = { ...(root as Record<string, JsonValue>) };
  delete obj[head as string];
  return obj;
}

// Clamps a path back to the nearest ancestor that still resolves to an
// object/array — a defensive fallback for the (normally unreachable) case
// where a container the user was browsing gets deleted or retyped out from
// under them.
function nearestValidPath(root: JsonValue, path: PathSegment[]): PathSegment[] {
  for (let len = path.length; len >= 0; len--) {
    const candidate = path.slice(0, len);
    const node = len === 0 ? root : getAtPath(root, candidate);
    if (node !== undefined && node !== null && typeof node === "object") return candidate;
  }
  return [];
}

interface JsonTreeEditorProps {
  value: JsonValue;
  onChange: (next: JsonValue) => void;
  disabled?: boolean;
  // What the column's model annotation says this value should be. Used only
  // to name the right empty shape when the stored value doesn't match it —
  // see the malformed-root guard below.
  expectedShape?: "dict" | "list";
}

// Firebase-Realtime-Database-style navigable editor for arbitrary JSON —
// nested dicts, arrays of objects, mixed shapes. A breadcrumb tracks where
// you are; each level shows its own keys/items as either an inline editable
// primitive or a "drill in" row. The user only ever edits one value or key
// name at a time, never raw JSON text, so there's no way to break the
// overall structure's syntax.
export function JsonTreeEditor({ value, onChange, disabled, expectedShape = "dict" }: JsonTreeEditorProps) {
  const [rawPath, setRawPath] = useState<PathSegment[]>([]);
  const path = nearestValidPath(value, rawPath);
  const node = path.length === 0 ? value : getAtPath(value, path);
  const [newKeyName, setNewKeyName] = useState("");
  const [pendingConvert, setPendingConvert] = useState<{ key: PathSegment; value: JsonValue; kind: JsonKind } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ key: PathSegment; value: JsonValue } | null>(null);

  // The root is the one place a mismatch can happen: every other node was
  // reached by drilling into a confirmed object/array, but the root is
  // whatever the database actually handed us. A column declared as dict/list
  // whose stored value is neither (a raw/legacy/corrupt string, a stray
  // number, ...) must never render identically to a genuinely empty
  // container — that's exactly the "data exists but the editor shows
  // nothing" failure this guards against.
  const rootKind = kindOf(value);
  const isMalformedRoot = path.length === 0 && rootKind !== "object" && rootKind !== "array";
  if (isMalformedRoot) {
    return (
      <div className="db-json-tree db-json-tree--malformed">
        <p className="db-json-tree-warning">
          Stored value is a {KIND_LABELS[rootKind].toLowerCase()}, not {expectedShape === "list" ? "an array" : "an object"} —
          showing the raw value below instead of hiding it. Resetting replaces it with an empty {expectedShape === "list" ? "array" : "object"} (only in this form — nothing is saved until you click Save).
        </p>
        <textarea className="form-control db-field-mono" rows={3} readOnly value={rootKind === "null" ? "null" : String(value)} />
        <button
          type="button"
          className="btn btn-soft-secondary btn-sm d-flex align-items-center gap-2"
          onClick={() => onChange(expectedShape === "list" ? [] : {})}
          disabled={disabled}
        >
          Reset to empty {expectedShape === "list" ? "array" : "object"}
        </button>
      </div>
    );
  }

  const isArrayNode = Array.isArray(node);
  const entries: [PathSegment, JsonValue][] = isArrayNode
    ? (node as JsonValue[]).map((v, i) => [i, v])
    : node && typeof node === "object"
    ? Object.entries(node as Record<string, JsonValue>)
    : [];

  function updateChild(key: PathSegment, next: JsonValue) {
    onChange(setAtPath(value, [...path, key], next));
  }

  function removeChild(key: PathSegment) {
    onChange(deleteAtPath(value, [...path, key]));
  }

  function addChild() {
    if (isArrayNode) {
      onChange(setAtPath(value, [...path, entries.length], ""));
      return;
    }
    const key = newKeyName.trim();
    if (!key) return;
    onChange(setAtPath(value, [...path, key], ""));
    setNewKeyName("");
  }

  // Object/array -> anything else (or object <-> array) always resets to
  // empty in convert() — there's no way to carry nested data across a kind
  // change, so a non-empty container needs a confirmation before it's gone.
  function requestTypeChange(key: PathSegment, childValue: JsonValue, nextKind: JsonKind) {
    if (hasNestedData(childValue) && nextKind !== kindOf(childValue)) {
      setPendingConvert({ key, value: childValue, kind: nextKind });
      return;
    }
    updateChild(key, convert(childValue, nextKind));
  }

  return (
    <div className="db-json-tree">
      <div className="db-json-breadcrumb">
        <button type="button" onClick={() => setRawPath([])} disabled={path.length === 0}>
          root
        </button>
        {path.map((segment, i) => (
          <span key={i} className="db-json-breadcrumb-segment">
            <button type="button" onClick={() => setRawPath(path.slice(0, i + 1))} disabled={i === path.length - 1}>
              {segment}
            </button>
          </span>
        ))}
      </div>

      <div className="db-json-tree-body">
        {entries.length === 0 && <p className="db-json-tree-empty">Nothing here yet.</p>}
        {entries.map(([key, childValue]) => {
          const childKind = kindOf(childValue);
          const isContainer = childKind === "object" || childKind === "array";
          return (
            <div key={key} className="db-json-tree-row">
              <span className="db-json-tree-key">{key}</span>

              {isContainer ? (
                <button
                  type="button"
                  className="db-json-tree-drill"
                  onClick={() => setRawPath([...path, key])}
                  disabled={disabled}
                >
                  {childKind === "array" ? "Array" : "Object"} · {describeContainer(childValue)}
                  <ChevronRight size={13} />
                </button>
              ) : childKind === "boolean" ? (
                <div className="form-check form-switch db-json-tree-bool">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    checked={childValue as boolean}
                    onChange={(e) => updateChild(key, e.target.checked)}
                    disabled={disabled}
                  />
                </div>
              ) : childKind === "number" ? (
                <input
                  type="number"
                  className="form-control"
                  value={childValue as number}
                  onChange={(e) => updateChild(key, Number(e.target.value))}
                  disabled={disabled}
                />
              ) : (
                <input
                  type="text"
                  className="form-control"
                  value={childValue === null ? "" : String(childValue)}
                  placeholder={childKind === "null" ? "null" : undefined}
                  onChange={(e) => updateChild(key, e.target.value)}
                  disabled={disabled}
                />
              )}

              <select
                className="form-select db-json-tree-type"
                value={childKind}
                onChange={(e) => requestTypeChange(key, childValue, e.target.value as JsonKind)}
                disabled={disabled}
                aria-label={`Type of ${key}`}
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="null">Null</option>
                <option value="object">Object</option>
                <option value="array">Array</option>
              </select>

              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setPendingDelete({ key, value: childValue })}
                disabled={disabled}
                aria-label={`Remove ${key}`}
              >
                <TrashFill size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="db-json-tree-add">
        {!isArrayNode && (
          <input
            type="text"
            className="form-control"
            placeholder="New key name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            disabled={disabled}
          />
        )}
        <button
          type="button"
          className="btn btn-soft-secondary btn-sm d-flex align-items-center gap-2 text-nowrap"
          onClick={addChild}
          disabled={disabled || (!isArrayNode && !newKeyName.trim())}
        >
          <PlusLg size={13} />
          {isArrayNode ? "Add item" : "Add field"}
        </button>
      </div>

      {pendingConvert && (
        <Modal show onHide={() => setPendingConvert(null)} centered className="deploy-modal">
          <Modal.Header>
            <h5 className="deploy-modal-title">Change type?</h5>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setPendingConvert(null)} aria-label="Close">
              ×
            </button>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-0">
              "{pendingConvert.key}" holds {kindOf(pendingConvert.value) === "array" ? "an array" : "an object"} with{" "}
              {describeContainer(pendingConvert.value)}. Changing its type to {KIND_LABELS[pendingConvert.kind]} will permanently
              delete that data — this can't be undone.
            </p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-ghost" onClick={() => setPendingConvert(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-soft-danger"
              onClick={() => {
                updateChild(pendingConvert.key, convert(pendingConvert.value, pendingConvert.kind));
                setPendingConvert(null);
              }}
            >
              Change type
            </button>
          </Modal.Footer>
        </Modal>
      )}

      {pendingDelete && (
        <Modal show onHide={() => setPendingDelete(null)} centered className="deploy-modal">
          <Modal.Header>
            <h5 className="deploy-modal-title">Remove field?</h5>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setPendingDelete(null)} aria-label="Close">
              ×
            </button>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-0">
              {hasNestedData(pendingDelete.value) ? (
                <>
                  "{pendingDelete.key}" holds {kindOf(pendingDelete.value) === "array" ? "an array" : "an object"} with{" "}
                  {describeContainer(pendingDelete.value)}. Removing it will permanently delete that data — this can't be undone.
                </>
              ) : (
                <>
                  Remove "{pendingDelete.key}"? This can't be undone.
                </>
              )}
            </p>
          </Modal.Body>
          <Modal.Footer>
            <button type="button" className="btn btn-ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-soft-danger"
              onClick={() => {
                removeChild(pendingDelete.key);
                setPendingDelete(null);
              }}
            >
              Remove
            </button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}
