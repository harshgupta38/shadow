import { http } from "./client";
import type {
  Goal,
  GoalCreate,
  GoalStatus,
  GoalUpdate,
  Milestone,
  MilestoneCreate,
  MilestoneUpdate,
} from "./types";

export const goalsApi = {
  async list(status?: GoalStatus): Promise<Goal[]> {
    return http.get<Goal[]>("/goals", status ? { status } : undefined);
  },
  async get(id: number): Promise<Goal> {
    return http.get<Goal>(`/goals/${id}`);
  },
  async create(data: GoalCreate): Promise<Goal> {
    return http.post<Goal>("/goals", data);
  },
  async update(id: number, data: GoalUpdate): Promise<Goal> {
    return http.put<Goal>(`/goals/${id}`, data);
  },
  async remove(id: number): Promise<void> {
    return http.del(`/goals/${id}`);
  },
  async milestones(goalId: number): Promise<Milestone[]> {
    return http.get<Milestone[]>(`/goals/${goalId}/milestones`);
  },
  async addMilestone(goalId: number, data: MilestoneCreate): Promise<Milestone> {
    return http.post<Milestone>(`/goals/${goalId}/milestones`, data);
  },
  async updateMilestone(id: number, data: MilestoneUpdate): Promise<Milestone> {
    return http.put<Milestone>(`/milestones/${id}`, data);
  },
  async removeMilestone(id: number): Promise<void> {
    return http.del(`/milestones/${id}`);
  },
};
