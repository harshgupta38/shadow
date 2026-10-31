import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { PlusLg, Search, Star, StarFill } from "react-bootstrap-icons";

import { api, ApiError } from "@/api";
import type { Food, FoodListFilters } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { IllustratedErrorState } from "@/components/ui/IllustratedErrorState/IllustratedErrorState";
import { useToast } from "@/context/ToastContext";
import { CustomFoodForm } from "@/pages/diet/CustomFoodForm/CustomFoodForm";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { EditFoodValuesDialog } from "@/pages/diet/EditFoodValuesDialog/EditFoodValuesDialog";
import { FoodDetailDialog } from "@/pages/diet/FoodDetailDialog/FoodDetailDialog";
import { CATEGORY_LABEL, categoryLabel, fmt, foodBadges, quantityLabel } from "@/pages/diet/dietMath";
import "./LibraryTab.scss";

type Group = "all" | "indian" | "international" | "mine" | "edited" | "favourites";

const GROUPS: { id: Group; label: string }[] = [
  { id: "all", label: "All foods" },
  { id: "indian", label: "Indian" },
  { id: "international", label: "International" },
  { id: "mine", label: "My foods" },
  { id: "edited", label: "Edited by me" },
  { id: "favourites", label: "Favourites" },
];

const PAGE = 24;
const SEARCH_DELAY_MS = 250;

function filtersFor(group: Group, category: string): FoodListFilters {
  const filters: FoodListFilters = {};
  if (group === "indian" || group === "international") filters.cuisine = group;
  if (group === "mine" || group === "favourites" || group === "edited") filters.scope = group;
  if (category) filters.category = category;
  return filters;
}

export function LibraryTab() {
  const toast = useToast();
  const [group, setGroup] = useState<Group>("all");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [openFood, setOpenFood] = useState<Food | null>(null);
  const [formFor, setFormFor] = useState<{ editing?: Food } | null>(null);
  const [deleting, setDeleting] = useState<Food | null>(null);
  const [editingValues, setEditingValues] = useState<Food | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const serverOffset = useRef(0); // how far into the server's list we are; the shown list can shrink after a delete or un-favourite

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const fetchPage = useCallback(
    async (offset: number) => {
      const id = ++seq.current;
      try {
        const hits = await api.diet.searchFoods(debounced, PAGE, { ...filtersFor(group, category), offset });
        if (id !== seq.current) return; // a newer filter or search superseded this one
        setFoods((prev) => (offset === 0 ? hits.map((h) => h.food) : [...prev, ...hits.map((h) => h.food)]));
        serverOffset.current = offset + hits.length;
        setHasMore(hits.length === PAGE);
        setError(false);
      } catch {
        if (id === seq.current) setError(true);
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [debounced, group, category],
  );

  useEffect(() => {
    setLoading(true);
    void fetchPage(0);
  }, [fetchPage]);

  const patchFood = (updated: Food) => {
    setFoods((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    setOpenFood((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  async function toggleFavourite(food: Food) {
    const next = { ...food, is_favourite: !food.is_favourite };
    patchFood(next);
    try {
      await api.diet.setFavourite(food.id, next.is_favourite);
      if (group === "favourites" && !next.is_favourite) setFoods((prev) => prev.filter((f) => f.id !== food.id));
    } catch (err) {
      patchFood(food);
      toast.error(err instanceof ApiError ? err.message : "Couldn't update your favourites.");
    }
  }

  async function removeFood(food: Food) {
    setBusy(true);
    try {
      await api.diet.deleteFood(food.id);
      toast.success(`${food.name} deleted. Meals you already logged keep their entries.`);
      setFoods((prev) => prev.filter((f) => f.id !== food.id));
      setOpenFood(null);
      setDeleting(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete this food.");
    } finally {
      setBusy(false);
    }
  }

  const emptyMessage =
    debounced !== ""
      ? `No food matches “${debounced}” here. Try another spelling, or add it yourself.`
      : group === "mine"
        ? "You haven't added any foods yet. Add the ones you eat that aren't in the library."
        : group === "favourites"
          ? "No favourites yet. Open a food and choose “Add to favourites”, or tap a star."
          : group === "edited"
            ? "You haven't edited any foods yet. Open a library food and choose “Edit my values” to use your own numbers."
            : "No foods in this group.";

  return (
    <div className="dt-lib">
      <div className="dt-lib-toolbar">
        <div className="dt-lib-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="form-control"
            placeholder="Search the food library"
            aria-label="Search the food library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="visually-hidden" htmlFor="dt-lib-category">Category</label>
        <select id="dt-lib-category" className="form-select dt-lib-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" className="btn btn-brand dt-lib-add" onClick={() => setFormFor({})}>
          <PlusLg size={14} /> Add your own food
        </button>
      </div>

      <div className="dt-lib-groups" role="group" aria-label="Show">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" className={`dt-lib-group${group === g.id ? " is-active" : ""}`} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </button>
        ))}
      </div>

      {error ? (
        <IllustratedErrorState onRetry={() => { setLoading(true); void fetchPage(0); }} />
      ) : loading ? (
        <div className="dt-lib-grid" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => <DietSkeleton key={i} height={132} />)}
        </div>
      ) : foods.length === 0 ? (
        <div className="surface dt-lib-empty">
          <p>{emptyMessage}</p>
          {(group === "mine" || debounced !== "") && (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setFormFor({})}><PlusLg size={12} /> Add your own food</button>
          )}
        </div>
      ) : (
        <>
          <ul className="dt-lib-grid" aria-label="Foods">
            {foods.map((food) => {
              const { diet } = foodBadges(food);
              return (
                <li key={food.id} className="surface dt-lib-card">
                  <button type="button" className="dt-lib-open" onClick={() => setOpenFood(food)} aria-label={`${food.name}, ${fmt(food.calories)} calories per 100 grams. Open details`}>
                    <span className="dt-lib-name">{food.name}</span>
                    <span className="dt-lib-kcal"><strong>{fmt(food.calories)}</strong> kcal <small>per 100 g</small></span>
                    <span className="dt-lib-macros">P {fmt(food.protein_g, 1)} · C {fmt(food.carbs_g, 1)} · F {fmt(food.fat_g, 1)} g</span>
                    <span className="dt-lib-serving">Usual serving: {quantityLabel(food.default_quantity, food.default_unit)}</span>
                    <span className="dt-lib-pills">
                      <span className="pill">{categoryLabel(food.category)}</span>
                      {food.is_custom ? <span className="pill pill-brand">Yours</span> : diet && <span className="pill pill-success">{diet}</span>}
                      {food.is_edited && <span className="pill pill-brand">Edited</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`dt-lib-star${food.is_favourite ? " is-on" : ""}`}
                    aria-label={food.is_favourite ? `Remove ${food.name} from favourites` : `Add ${food.name} to favourites`}
                    aria-pressed={food.is_favourite}
                    onClick={() => void toggleFavourite(food)}
                  >
                    {food.is_favourite ? <StarFill size={16} /> : <Star size={16} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div className="dt-lib-more">
              <button type="button" className="btn btn-soft" disabled={loadingMore} onClick={() => { setLoadingMore(true); void fetchPage(serverOffset.current); }}>
                {loadingMore ? "Loading…" : "Show more foods"}
              </button>
            </div>
          )}
        </>
      )}

      <p className="dt-lib-footnote">
        Foods from the library are approximate typical values, not lab results, and are marked as estimates. Foods you add are marked as yours.
      </p>

      <FoodDetailDialog
        food={openFood}
        onClose={() => setOpenFood(null)}
        onToggleFavourite={(food) => void toggleFavourite(food)}
        onEdit={(food) => { setOpenFood(null); setFormFor({ editing: food }); }}
        onDelete={setDeleting}
        onEditValues={(food) => { setOpenFood(null); setEditingValues(food); }}
      />

      {editingValues && (
        <EditFoodValuesDialog
          key={editingValues.id}
          food={editingValues}
          onClose={() => setEditingValues(null)}
          onSaved={(saved) => {
            setEditingValues(null);
            if (group === "edited" && !saved.is_edited) setFoods((prev) => prev.filter((f) => f.id !== saved.id));
            else patchFood(saved);
          }}
        />
      )}

      <Modal show={formFor !== null} onHide={() => setFormFor(null)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="fs-5 fw-bold">{formFor?.editing ? "Edit your food" : "Add your own food"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {formFor && (
            <CustomFoodForm
              editing={formFor.editing}
              initialName={formFor.editing ? undefined : debounced}
              onCancel={() => setFormFor(null)}
              onCreated={(saved) => {
                setFormFor(null);
                if (formFor.editing) patchFood(saved);
                else {
                  setGroup("mine");
                  setCategory("");
                  setQuery("");
                  void fetchPage(0);
                }
              }}
            />
          )}
        </Modal.Body>
      </Modal>

      <ConfirmDialog
        show={deleting !== null}
        title="Delete this food?"
        message={deleting ? `“${deleting.name}” will be removed from your foods. Meals you already logged with it keep their entries and nutrition.` : undefined}
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => deleting && void removeFood(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
