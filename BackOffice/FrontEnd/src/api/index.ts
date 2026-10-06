import { authApi } from "./auth";
import { deployApi } from "./deploy";
import { databaseApi } from "./database";
import { deletedDataApi } from "./deletedData";
import { serverApi } from "./server";
import { systemApi } from "./system";
import { usersApi } from "./users";

export const api = {
  auth: authApi,
  deploy: deployApi,
  database: databaseApi,
  deletedData: deletedDataApi,
  server: serverApi,
  system: systemApi,
  users: usersApi,
};

export { ApiError } from "./client";
export type * from "./types";
