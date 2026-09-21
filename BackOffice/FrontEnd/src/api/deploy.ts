import { http } from "./client";
import { ENDPOINTS } from "@/constant/bo-endpoints";
import type { BranchesResponse, CommitInfo, Deployment, NewDeploymentRequest, RollbackRequest } from "./types";

export const deployApi = {
  async history(page: number, pageSize: number): Promise<Deployment[]> {
    return http.get<Deployment[]>(ENDPOINTS.DEPLOY.HISTORY, {
      params: { page, page_size: pageSize },
    });
  },
  async commits(limit = 10, branch?: string): Promise<CommitInfo[]> {
    return http.get<CommitInfo[]>(ENDPOINTS.DEPLOY.COMMITS, { params: { limit, branch } });
  },
  async branches(): Promise<BranchesResponse> {
    return http.get<BranchesResponse>(ENDPOINTS.DEPLOY.BRANCHES);
  },
  async detail(id: number): Promise<Deployment> {
    return http.get<Deployment>(ENDPOINTS.DEPLOY.detail(id));
  },
  async trigger(data: NewDeploymentRequest): Promise<Deployment> {
    return http.post<Deployment>(ENDPOINTS.DEPLOY.NEW, data);
  },
  async rollback(data: RollbackRequest): Promise<Deployment> {
    return http.post<Deployment>(ENDPOINTS.DEPLOY.ROLLBACK, data);
  },
};
