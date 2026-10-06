import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { AppTarget, BranchesResponse, CommitInfo, Deployment, NewDeploymentRequest, RollbackRequest } from "./types";

export const deployApi = {
  async history(app: AppTarget, page: number, pageSize: number): Promise<Deployment[]> {
    return http.get<Deployment[]>(ENDPOINTS.DEPLOY.history(app), {
      params: { page, page_size: pageSize },
    });
  },
  async commits(app: AppTarget, limit = 10, branch?: string): Promise<CommitInfo[]> {
    return http.get<CommitInfo[]>(ENDPOINTS.DEPLOY.commits(app), { params: { limit, branch } });
  },
  async branches(app: AppTarget): Promise<BranchesResponse> {
    return http.get<BranchesResponse>(ENDPOINTS.DEPLOY.branches(app));
  },
  async detail(app: AppTarget, id: number): Promise<Deployment> {
    return http.get<Deployment>(ENDPOINTS.DEPLOY.detail(app, id));
  },
  async trigger(app: AppTarget, data: NewDeploymentRequest): Promise<Deployment> {
    return http.post<Deployment>(ENDPOINTS.DEPLOY.new(app), data);
  },
  async rollback(app: AppTarget, data: RollbackRequest): Promise<Deployment> {
    return http.post<Deployment>(ENDPOINTS.DEPLOY.rollback(app), data);
  },
};
