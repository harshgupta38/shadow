import { authApi } from "./auth";
import { deployApi } from "./deploy";
import { databaseApi } from "./database";
import { serverApi } from "./server";
import { usersApi } from "./users";

export const api = {
  auth: authApi,
  deploy: deployApi,
  database: databaseApi,
  server: serverApi,
  users: usersApi,
};

export { ApiError } from "./client";
export type * from "./types";
