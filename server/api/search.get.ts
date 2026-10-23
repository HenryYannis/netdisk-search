import { defineEventHandler, getQuery } from "h3";
import { requireSearchAuth } from "../utils/requireAuth";
import { runSearch } from "../utils/runSearch";

export default defineEventHandler(async (event) => {
  requireSearchAuth(event);
  return runSearch(event, getQuery(event));
});
