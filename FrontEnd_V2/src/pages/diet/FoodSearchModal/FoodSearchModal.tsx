import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { PlusLg, Search, Star, StarFill, Trash, XLg } from "react-bootstrap-icons";

import { api } from "@/api";
import type { DiaryMeal, Food, FoodSearchHit, QuickFoods, SavedMeal } from "@/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/context/ToastContext";
import { CustomFoodForm } from "@/pages/diet/CustomFoodForm/CustomFoodForm";
import { DietSkeleton } from "@/pages/diet/DietSkeleton/DietSkeleton";
import { ServingSelector } from "@/pages/diet/ServingSelector/ServingSelector";
import { certaintyFor, errorMessage, fmt, mealLabel, newToken, previewNutrients } from "@/pages/diet/dietMath";
import "./FoodSearchModal.scss";

interface FoodSearchModalProps {
  show: boolean;
  mealType: string;
  date: string;
  onClose: () => void;
  onLogged: (meal: DiaryMeal) => void;
}

interface CartEntry {
  token: string; // sent with the save so a double tap can never log the same entry twice
  food: Food;
  quantity: string;
  unit: string;
}

type View = "search" | "saved" | "custom";

const SEARCH_DELAY_MS = 250;

export function FoodSearchModal({ show, mealType, date, onClose, onLogged }: FoodSearchModalProps) {
  const toast = useToast();
  const [view, setView] = useState<View>("search");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FoodSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [quick, setQuick] = useState<QuickFoods | null>(null);
  const [saved, setSaved] = useState<SavedMeal[] | null>(null);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [eatenAt, setEatenAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SavedMeal | null>(null);
  const searchSeq = useRef(0);
  const cartRef = useRef<CartEntry[]>([]);
  cartRef.current = cart;

  // A clean slate each time the dialog opens.
  useEffect(() => {
    if (!show) return;
    setView("search");
    setQuery("");
    setHits([]);
    setCart([]);
    setEatenAt("");
    setSearchError(false);
    api.diet.getQuickFoods().then(setQuick).catch(() => setQuick({ favourites: [], recent: [], frequent: [] }));
    api.diet.getSavedMeals().then(setSaved).catch(() => setSaved([]));
  }, [show]);

  // Debounced search; a slower, older response never overwrites a newer one.
  useEffect(() => {
    if (!show || view !== "search") return;
    const text = query.trim();
    if (!text) {
      searchSeq.current += 1; // anything still in flight for the old text is now stale
      setHits([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = window.setTimeout(() => {
      api.diet
        .searchFoods(text)
        .then((result) => {
          if (seq !== searchSeq.current) return;
          setHits(result);
          setSearchError(false);
        })
        .catch(() => {
          if (seq === searchSeq.current) setSearchError(true);
        })
        .finally(() => {
          if (seq === searchSeq.current) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [query, show, view]);

  const addToCart = useCallback(
    (food: Food) => {
      if (cartRef.current.some((entry) => entry.food.id === food.id)) {
        toast.info(`${food.name} is already in your list.`);
        return;
      }
      setCart((prev) => [...prev, { token: newToken(), food, quantity: String(food.default_quantity), unit: food.default_unit }]);
    },
    [toast],
  );

  const toggleFavourite = useCallback(
    async (food: Food) => {
      const next = !food.is_favourite;
      const apply = (value: boolean) => {
        const patch = (f: Food) => (f.id === food.id ? { ...f, is_favourite: value } : f);
        setHits((prev) => prev.map((h) => ({ ...h, food: patch(h.food) })));
        setCart((prev) => prev.map((entry) => ({ ...entry, food: patch(entry.food) })));
      };
      apply(next);
      try {
        await api.diet.setFavourite(food.id, next);
        api.diet.getQuickFoods().then(setQuick).catch(() => undefined);
      } catch (err) {
        apply(!next);
        toast.error(errorMessage(err, "Couldn't update your favourites."));
      }
    },
    [toast],
  );

  const cartValid = cart.length > 0 && cart.every((entry) => Number(entry.quantity) > 0);
  const cartCalories = cart.reduce((sum, entry) => sum + (previewNutrients(entry.food, Number(entry.quantity), entry.unit)?.calories ?? 0), 0);

  async function saveCart() {
    if (!cartValid || saving) return;
    setSaving(true);
    try {
      const meal = await api.diet.addItems({
        log_date: date,
        meal_type: mealType,
        eaten_at: eatenAt || null,
        items: cart.map((entry) => ({
          food_id: entry.food.id,
          quantity: Number(entry.quantity),
          unit: entry.unit,
          certainty: certaintyFor(entry.unit),
          client_token: entry.token,
        })),
      });
      toast.success(`Added to ${mealLabel(mealType).toLowerCase()}.`);
      meal.notices.forEach((notice) => toast.error(notice)); // allergy or diet conflicts: logged, but the user is told
      onLogged(meal);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save these foods. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function logSaved(meal: SavedMeal) {
    setSaving(true);
    try {
      const logged = await api.diet.logSavedMeal(meal.id, { log_date: date, meal_type: mealType });
      toast.success(`${meal.name} added to ${mealLabel(mealType).toLowerCase()}.`);
      logged.notices.forEach((notice) => toast.error(notice));
      onLogged(logged);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't log this meal. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  async function removeSaved(meal: SavedMeal) {
    try {
      await api.diet.deleteSavedMeal(meal.id);
      setSaved((prev) => (prev ? prev.filter((m) => m.id !== meal.id) : prev));
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete this saved meal."));
    } finally {
      setPendingDelete(null);
    }
  }

  const renderFoodRow = (food: Food, note?: string) => (
    <li key={food.id} className="dt-fsm-row">
      <button type="button" className="dt-fsm-add" onClick={() => addToCart(food)} aria-label={`Add ${food.name}`}>
        <span className="dt-fsm-name">{food.name}</span>
        <span className="dt-fsm-meta">
          {fmt(food.calories)} kcal / 100 g · P {fmt(food.protein_g, 1)} · C {fmt(food.carbs_g, 1)} · F {fmt(food.fat_g, 1)}
          {note ? ` · ${note}` : ""}
        </span>
        <span className="dt-fsm-badges">
          {food.is_edited && <span className="pill pill-brand">Edited</span>}
          {food.is_custom && <span className="pill pill-brand">Yours</span>}
          {food.verification === "estimated" && <span className="pill">Estimate</span>}
        </span>
        <PlusLg size={16} aria-hidden="true" className="dt-fsm-plus" />
      </button>
      <button
        type="button"
        className={`dt-fsm-star${food.is_favourite ? " is-on" : ""}`}
        aria-label={food.is_favourite ? `Remove ${food.name} from favourites` : `Add ${food.name} to favourites`}
        aria-pressed={food.is_favourite}
        onClick={() => void toggleFavourite(food)}
      >
        {food.is_favourite ? <StarFill size={15} /> : <Star size={15} />}
      </button>
    </li>
  );

  const quickSection = (title: string, foods: Food[] | undefined) =>
    foods && foods.length > 0 ? (
      <section className="dt-fsm-quick" aria-label={title}>
        <h3 className="dt-fsm-heading">{title}</h3>
        <div className="dt-fsm-chips">
          {foods.map((food) => (
            <button key={food.id} type="button" className="dt-fsm-chip" onClick={() => addToCart(food)}>
              <PlusLg size={11} aria-hidden="true" /> {food.name}
            </button>
          ))}
        </div>
      </section>
    ) : null;

  const hasQuick = quick && (quick.favourites.length > 0 || quick.recent.length > 0 || quick.frequent.length > 0);

  return (
    <>
      <Modal show={show} onHide={onClose} size="lg" centered scrollable dialogClassName="dt-fsm-dialog" backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="dt-fsm-title">Add to {mealLabel(mealType).toLowerCase()}</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <div className="nav-tabs-jv dt-fsm-tabs" role="group" aria-label="Ways to add food">
            {(
              [
                ["search", "Search foods"],
                ["saved", "Saved meals"],
                ["custom", "Create a food"],
              ] as [View, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                className={`nav-tab-jv${view === id ? " active" : ""}`}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {view === "search" && (
            <>
              <div className="dt-fsm-search">
                <Search size={15} aria-hidden="true" />
                <input
                  type="search"
                  className="form-control"
                  placeholder="Search chapati, dal, paneer, banana…"
                  aria-label="Search foods"
                  maxLength={100}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>

              {query.trim() === "" ? (
                hasQuick ? (
                  <>
                    {quickSection("Favourites", quick?.favourites)}
                    {quickSection("Frequently eaten", quick?.frequent)}
                    {quickSection("Recent", quick?.recent)}
                  </>
                ) : (
                  <p className="dt-fsm-empty">Start typing to search the food library. Foods you log often will show up here.</p>
                )
              ) : searchError ? (
                <p className="dt-fsm-empty" role="alert">Search isn't working right now. Check your connection and try again.</p>
              ) : searching && hits.length === 0 ? (
                <div className="dt-fsm-list" aria-hidden="true">
                  {Array.from({ length: 4 }, (_, i) => <DietSkeleton key={i} height={52} />)}
                </div>
              ) : hits.length === 0 ? (
                <div className="dt-fsm-empty">
                  <p className="mb-2">No food matches “{query.trim()}”.</p>
                  <button type="button" className="btn btn-soft btn-sm" onClick={() => setView("custom")}>
                    <PlusLg size={12} /> Create “{query.trim()}” yourself
                  </button>
                </div>
              ) : (
                <ul className="dt-fsm-list" aria-label="Search results">
                  {hits.map((hit) => renderFoodRow(hit.food, hit.match === "similar" ? "similar spelling" : undefined))}
                </ul>
              )}
            </>
          )}

          {view === "saved" &&
            (saved === null ? (
              <DietSkeleton height={120} />
            ) : saved.length === 0 ? (
              <p className="dt-fsm-empty">
                No saved meals yet. Log a meal you eat often, then choose “Save as meal” on it to add it again in one tap.
              </p>
            ) : (
              <ul className="dt-fsm-list" aria-label="Saved meals">
                {saved.map((meal) => (
                  <li key={meal.id} className="dt-fsm-row">
                    <button type="button" className="dt-fsm-add" disabled={saving} onClick={() => void logSaved(meal)}>
                      <span className="dt-fsm-name">{meal.name}</span>
                      <span className="dt-fsm-meta">{meal.items.map((i) => i.name).join(", ")}</span>
                      <span />
                      <PlusLg size={16} aria-hidden="true" className="dt-fsm-plus" />
                    </button>
                    <button type="button" className="dt-fsm-star" aria-label={`Delete saved meal ${meal.name}`} onClick={() => setPendingDelete(meal)}>
                      <Trash size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {view === "custom" && (
            <CustomFoodForm
              initialName={query.trim()}
              onCancel={() => setView("search")}
              onCreated={(food) => {
                addToCart(food);
                setView("search");
              }}
            />
          )}

          {cart.length > 0 && (
            <section className="dt-fsm-cart" aria-label="Foods to add">
              <h3 className="dt-fsm-heading">Adding {cart.length} {cart.length === 1 ? "food" : "foods"}</h3>
              <ul className="dt-fsm-cart-list">
                {cart.map((entry) => (
                  <li key={entry.token} className="dt-fsm-cart-row">
                    <div className="dt-fsm-cart-head">
                      <span className="dt-fsm-name">{entry.food.name}</span>
                      <button
                        type="button"
                        className="dt-fsm-remove"
                        aria-label={`Remove ${entry.food.name}`}
                        onClick={() => setCart((prev) => prev.filter((e) => e.token !== entry.token))}
                      >
                        <XLg size={13} />
                      </button>
                    </div>
                    <ServingSelector
                      food={entry.food}
                      quantity={entry.quantity}
                      unit={entry.unit}
                      onChange={(next) => setCart((prev) => prev.map((e) => (e.token === entry.token ? { ...e, ...next } : e)))}
                    />
                  </li>
                ))}
              </ul>
              <div className="dt-fsm-time">
                <label htmlFor="dt-fsm-eaten" className="form-label mb-0">Eaten at <span className="text-muted">(optional)</span></label>
                <input id="dt-fsm-eaten" type="time" className="form-control form-control-sm" value={eatenAt} onChange={(e) => setEatenAt(e.target.value)} />
              </div>
            </section>
          )}
        </Modal.Body>

        <Modal.Footer>
          <span className="dt-fsm-count">
            {cart.length > 0 ? `${fmt(cartCalories)} kcal in total (estimate)` : "Pick one or more foods"}
          </span>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-brand" disabled={!cartValid || saving} onClick={() => void saveCart()}>
            {saving ? "Saving…" : cart.length > 0 ? `Add ${cart.length}` : "Add"}
          </button>
        </Modal.Footer>
      </Modal>

      <ConfirmDialog
        show={pendingDelete !== null}
        title="Delete saved meal?"
        message={pendingDelete ? `“${pendingDelete.name}” will be removed from your saved meals. Meals you already logged stay as they are.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => pendingDelete && void removeSaved(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
