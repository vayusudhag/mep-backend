import express from "express";
import multer from "multer";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import {
  addAdminMember,
  createAdminBull,
  deleteAdminBull,
  deleteAdminMember,
  deleteAdminTeam,
  getAdminStats,
  getAdminTeam,
  listAdminBulls,
  listAdminTeams,
  updateAdminBull,
  updateAdminMember,
  updateAdminTeam,
} from "../controllers/adminManagement.controller.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed"));
    }
    cb(null, true);
  },
});

router.use(protect, restrictTo("admin"));

router.get("/stats", getAdminStats);

router.get("/teams", listAdminTeams);
router.get("/teams/:id", getAdminTeam);
router.put("/teams/:id", updateAdminTeam);
router.delete("/teams/:id", deleteAdminTeam);

router.post("/teams/:id/members", addAdminMember);
router.put("/members/:memberId", updateAdminMember);
router.delete("/members/:memberId", deleteAdminMember);

router.get("/bulls", listAdminBulls);
router.post("/bulls", upload.single("image"), createAdminBull);
router.put("/bulls/:id", upload.single("image"), updateAdminBull);
router.delete("/bulls/:id", deleteAdminBull);

export default router;
