import { ENDPOINTS } from "@/constant/shadow-endpoints";
import { http } from "@/api/client";
import type {
  CopyMealsResponse,
  DiaryAddRequest,
  DiaryDay,
  DiaryMeal,
  DietEstimate,
  DietEstimateRequest,
  DietOverview,
  DietProfile,
  DietProfileSaveRequest,
  DietProfileState,
  Food,
  FoodCustomRequest,
  FoodListFilters,
  FoodLogProposal,
  FoodSearchHit,
  FoodValuesRequest,
  ProposalConfirmResult,
  ProposalEditRequest,
  QuickFoods,
  SavedMeal,
  WaterDay,
  WaterHistoryPoint,
} from "@/api/types";

const D = ENDPOINTS.DIET;
const url = (path: string) => `${D.PREFIX}${path}`;

export const dietApi = {
  // ── Profile and targets ─────────────────────────────────────────────────────
  getProfile(): Promise<DietProfileState> {
    return http.get<DietProfileState>(url(D.PROFILE));
  },
  saveProfile(data: DietProfileSaveRequest): Promise<DietProfile> {
    return http.put<DietProfile>(url(D.PROFILE), data);
  },
  estimate(data: DietEstimateRequest): Promise<DietEstimate> {
    return http.post<DietEstimate>(url(D.PROFILE_ESTIMATE), data);
  },

  // ── Overview ────────────────────────────────────────────────────────────────
  getOverview(date?: string): Promise<DietOverview> {
    return http.get<DietOverview>(url(D.OVERVIEW), { params: date ? { date } : undefined });
  },

  // ── Food library ────────────────────────────────────────────────────────────
  searchFoods(q: string, limit = 20, filters: FoodListFilters = {}): Promise<FoodSearchHit[]> {
    return http.get<FoodSearchHit[]>(url(D.FOODS), { params: { q, limit, ...filters } });
  },
  getFood(id: number): Promise<Food> {
    return http.get<Food>(url(D.FOOD(id)));
  },
  getQuickFoods(): Promise<QuickFoods> {
    return http.get<QuickFoods>(url(D.FOODS_QUICK));
  },
  createFood(data: FoodCustomRequest): Promise<Food> {
    return http.post<Food>(url(D.FOODS), data);
  },
  updateFood(id: number, data: FoodCustomRequest): Promise<Food> {
    return http.put<Food>(url(D.FOOD(id)), data);
  },
  deleteFood(id: number): Promise<void> {
    return http.delete<void>(url(D.FOOD(id)));
  },
  saveFoodValues(id: number, data: FoodValuesRequest): Promise<Food> {
    return http.put<Food>(url(D.FOOD_OVERRIDE(id)), data);
  },
  resetFoodValues(id: number): Promise<Food> {
    return http.delete<Food>(url(D.FOOD_OVERRIDE(id)));
  },
  setFavourite(id: number, favourite: boolean): Promise<void> {
    return favourite ? http.put<void>(url(D.FOOD_FAVOURITE(id))) : http.delete<void>(url(D.FOOD_FAVOURITE(id)));
  },

  // ── Food diary ──────────────────────────────────────────────────────────────
  getDiary(date?: string): Promise<DiaryDay> {
    return http.get<DiaryDay>(url(D.DIARY), { params: date ? { date } : undefined });
  },
  addItems(data: DiaryAddRequest): Promise<DiaryMeal> {
    return http.post<DiaryMeal>(url(D.DIARY_ITEMS), data);
  },
  updateItem(id: number, data: { quantity?: number; unit?: string }): Promise<DiaryMeal> {
    return http.patch<DiaryMeal>(url(D.DIARY_ITEM(id)), data);
  },
  deleteItem(id: number): Promise<void> {
    return http.delete<void>(url(D.DIARY_ITEM(id)));
  },
  moveItem(id: number, meal_type: string): Promise<DiaryMeal> {
    return http.post<DiaryMeal>(url(D.DIARY_ITEM_MOVE(id)), { meal_type });
  },
  duplicateItem(id: number): Promise<DiaryMeal> {
    return http.post<DiaryMeal>(url(D.DIARY_ITEM_DUPLICATE(id)));
  },
  updateMeal(id: number, data: { eaten_at?: string | null; note?: string }): Promise<DiaryMeal> {
    return http.patch<DiaryMeal>(url(D.DIARY_MEAL(id)), data);
  },
  deleteMeal(id: number): Promise<void> {
    return http.delete<void>(url(D.DIARY_MEAL(id)));
  },
  copyMeals(data: { from_date: string; to_date?: string; meal_types?: string[] }): Promise<CopyMealsResponse> {
    return http.post<CopyMealsResponse>(url(D.DIARY_COPY), data);
  },

  // ── Saved meals ─────────────────────────────────────────────────────────────
  getSavedMeals(): Promise<SavedMeal[]> {
    return http.get<SavedMeal[]>(url(D.SAVED_MEALS));
  },
  saveMeal(data: { name: string; log_date: string; meal_type: string }): Promise<SavedMeal> {
    return http.post<SavedMeal>(url(D.SAVED_MEALS), data);
  },
  deleteSavedMeal(id: number): Promise<void> {
    return http.delete<void>(url(D.SAVED_MEAL(id)));
  },
  logSavedMeal(id: number, data: { log_date?: string; meal_type?: string }): Promise<DiaryMeal> {
    return http.post<DiaryMeal>(url(D.SAVED_MEAL_LOG(id)), data);
  },

  // ── Water ───────────────────────────────────────────────────────────────────
  getWater(date?: string): Promise<WaterDay> {
    return http.get<WaterDay>(url(D.WATER), { params: date ? { date } : undefined });
  },
  /** delta_ml may be negative to decrease the day's total. The server clamps the stored total to 0. */
  addWater(delta_ml: number, log_date?: string): Promise<WaterDay> {
    return http.post<WaterDay>(url(D.WATER), { delta_ml, log_date });
  },
  getWaterHistory(days = 7): Promise<WaterHistoryPoint[]> {
    return http.get<WaterHistoryPoint[]>(url(D.WATER_HISTORY), { params: { days } });
  },

  // ── AI food logging: describe, review, confirm ──────────────────────────────
  parseMeal(data: { text: string; log_date?: string; meal_type?: string }): Promise<FoodLogProposal> {
    return http.post<FoodLogProposal>(url(D.LOG_PARSE), data);
  },
  getProposal(id: string): Promise<FoodLogProposal> {
    return http.get<FoodLogProposal>(url(D.PROPOSAL(id)));
  },
  editProposal(id: string, data: ProposalEditRequest): Promise<FoodLogProposal> {
    return http.patch<FoodLogProposal>(url(D.PROPOSAL(id)), data);
  },
  reviseProposal(id: string, message: string): Promise<FoodLogProposal> {
    return http.post<FoodLogProposal>(url(D.PROPOSAL_REVISE(id)), { message });
  },
  confirmProposal(id: string): Promise<ProposalConfirmResult> {
    return http.post<ProposalConfirmResult>(url(D.PROPOSAL_CONFIRM(id)));
  },
  dismissProposal(id: string): Promise<void> {
    return http.delete<void>(url(D.PROPOSAL(id)));
  },
};
