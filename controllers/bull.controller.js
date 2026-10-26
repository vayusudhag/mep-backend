import mongoose from "mongoose";
import Bull from "../models/Bull.model.js";
import Team from "../models/Team.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import * as bullService from "../services/bull.service.js";
import AppError from "../utils/AppError.js";

/**
 * USER (TEAM OWNER)
 * POST /api/bulls
 */
export const createBull = async (req, res, next) => {
  try {
    const { name, currentCategory } = req.body;

    if (!name || !currentCategory?.type || !currentCategory?.value) {
      return next(new AppError("Invalid bull payload", 400));
    }

    // Resolve team from logged-in user
    const team = await Team.findOne({
      ownerId: req.user._id,
      status: "APPROVED",
    });

    if (!team) {
      return next(new AppError("Approved team not found", 403));
    }

    const bull = await bullService.createBull({
      name: name.trim(),
      currentCategory,
      team: team._id,
    });

    res.status(201).json({
      status: "success",
      data: bull,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * USER / ADMIN
 * GET /api/bulls?team=teamId
 */
export const listBullsByTeam = async (req, res, next) => {
  try {
    const { team } = req.query;

    if (!mongoose.Types.ObjectId.isValid(team)) {
      return next(new AppError("Invalid teamId", 400));
    }

    const includeDeleted = String(req.query.includeDeleted || "false") === "true";
    const bullQuery = {
      teamId: team,
      status: "ACTIVE",
      ...(includeDeleted ? {} : { isDeleted: false }),
    };

    const bulls = await Bull.find(bullQuery)
      .select("name currentCategory status")
      .lean();

    res.status(200).json({
      status: "success",
      data: bulls,
    });
  } catch (err) {
    next(err);
  }
};

export const listAllBulls = async (req, res, next) => {
  try {
    const approvedTeams = await Team.find({ status: "APPROVED" })
      .select("_id")
      .lean();

    const approvedTeamIds = approvedTeams.map((team) => team._id);

    const bulls = await Bull.find({
      teamId: { $in: approvedTeamIds },
      isDeleted: false,
    })
      .populate("teamId", "teamName")
      .select("name currentCategory status teamId")
      .lean();

    const bullIds = bulls.map((b) => b._id);
    const bullStats = bullIds.length
      ? await EventDayEntry.aggregate([
          {
            $match: {
              isFinalized: true,
              bulls: { $in: bullIds },
            },
          },
          { $unwind: "$bulls" },
          {
            $match: {
              bulls: { $in: bullIds },
            },
          },
          {
            $group: {
              _id: "$bulls",
              eventsPlayed: { $sum: 1 },
              bestRank: { $min: "$rank" },
            },
          },
        ])
      : [];

    const statsByBullId = new Map(
      bullStats.map((s) => [String(s._id), s]),
    );

    const withTeamName = (bulls || []).map((b) => ({
      ...b,
      teamName: b.teamId?.teamName || null,
      eventsPlayed: statsByBullId.get(String(b._id))?.eventsPlayed || 0,
      bestRank: statsByBullId.get(String(b._id))?.bestRank ?? null,
    }));

    res.status(200).json({
      status: "success",
      data: withTeamName,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * USER (TEAM OWNER)
 * POST /api/bulls/category-update-request
 */
export const requestCategoryUpdate = async (req, res, next) => {
  try {
    const { bullId, toCategory, reason } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(bullId) ||
      !toCategory?.type ||
      !toCategory?.value
    ) {
      return next(new AppError("Invalid request payload", 400));
    }

    // Resolve team from user
    const team = await Team.findOne({
      ownerId: req.user._id,
    });

    if (!team) {
      return next(new AppError("Team not found", 403));
    }

    // Ownership check
    const bull = await Bull.findOne({ _id: bullId, teamId: team._id });
    if (!bull) {
      return next(new AppError("Bull does not belong to your team", 403));
    }

    // Block category change if bull is in active / upcoming entry
    const activeEntry = await EventDayEntry.findOne({
      bulls: bullId,
      isFinalized: false,
    });

    if (activeEntry) {
      return next(new AppError("Bull is currently involved in an event", 400));
    }

    const request = await bullService.requestCategoryUpdate({
      bull,
      toCategory,
      reason,
      requestedBy: req.user._id,
    });

    res.status(201).json({
      status: "success",
      data: request,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * USER (TEAM OWNER)
 * DELETE /api/bulls/:bullId
 */
export const scheduleBullDelete = async (req, res, next) => {
  try {
    const { bullId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bullId)) {
      return next(new AppError("Invalid bullId", 400));
    }

    const team = await Team.findOne({
      ownerId: req.user._id,
      status: "APPROVED",
    });

    if (!team) {
      return next(new AppError("Approved team not found", 403));
    }

    const bull = await Bull.findOne({ _id: bullId, teamId: team._id });
    if (!bull) {
      return next(new AppError("Bull does not belong to your team", 403));
    }

    const activeEntry = await EventDayEntry.findOne({
      bulls: bullId,
      isFinalized: false,
    });
    if (activeEntry) {
      return next(new AppError("Bull is currently involved in an event", 400));
    }

    bull.isDeleted = true;
    bull.deletionRequestedAt = new Date();
    await bull.save();

    res.status(200).json({
      status: "success",
      message:
        "Bull scheduled for deletion. It will be permanently deleted after 15 days. You can revoke before that.",
      data: bull,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * USER (TEAM OWNER)
 * PATCH /api/bulls/:bullId/revoke-delete
 */
export const revokeBullDelete = async (req, res, next) => {
  try {
    const { bullId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bullId)) {
      return next(new AppError("Invalid bullId", 400));
    }

    const team = await Team.findOne({
      ownerId: req.user._id,
      status: "APPROVED",
    });

    if (!team) {
      return next(new AppError("Approved team not found", 403));
    }

    const bull = await Bull.findOne({ _id: bullId, teamId: team._id });
    if (!bull) {
      return next(new AppError("Bull not found", 404));
    }

    if (!bull.isDeleted || !bull.deletionRequestedAt) {
      return next(new AppError("Bull is not scheduled for deletion", 400));
    }

    const deletionDeadline = new Date(bull.deletionRequestedAt);
    deletionDeadline.setDate(deletionDeadline.getDate() + 15);
    if (new Date() > deletionDeadline) {
      return next(new AppError("Deletion window expired", 400));
    }

    bull.isDeleted = false;
    bull.deletionRequestedAt = null;
    await bull.save();

    res.status(200).json({
      status: "success",
      message: "Deletion revoked successfully",
      data: bull,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN
 * PATCH /api/bulls/category-update-requests/:requestId/approve
 */
export const approveCategoryUpdate = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    const result = await bullService.approveCategoryUpdate({
      requestId,
      approvedBy: req.user._id,
    });

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN
 * PATCH /api/bulls/category-update-requests/:requestId/reject
 */
export const rejectCategoryUpdate = async (req, res, next) => {
  try {
    const { requestId } = req.params;

    const result = await bullService.rejectCategoryUpdate({
      requestId,
      rejectedBy: req.user._id,
    });

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
