import { authApi } from "./auth";
import { deployApi } from "./deploy";
import { databaseApi } from "./database";
import { serverApi } from "./server";

export const api = {
  auth: authApi,
  deploy: deployApi,
  database: databaseApi,
  server: serverApi,
};

export { ApiError } from "./client";
export type * from "./types";
