import express from "express";
import { Router } from "express";

import {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory
} from "../../../controllers/tenant/academics/categoryMaster.controller.js";

const routes = Router();

routes.post("/create", createCategory);
routes.get("/list", getCategories);
routes.put("/update/:id", updateCategory);
routes.delete("/delete/:id", deleteCategory);

export default routes;