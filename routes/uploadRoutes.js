import { Router } from "express";
import { uploadImage } from "../controllers/uploadController.js";
import upload from "../config/multerConfig.js";

const routes = Router();
routes.post("/uploadImage", upload.single("file"), uploadImage);

export default routes;
