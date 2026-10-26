import Team from "../models/Team.model.js";
import TeamPersonRole from "../models/TeamPersonRole.model.js";
import Bull from "../models/Bull.model.js";
import Person from "../models/Person.model.js";
import User from "../models/Users.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import { getSignedImageUrl } from "../utils/s3.js";
import AppError from "../utils/AppError.js";
import mongoose from "mongoose";

const attachTeamMembers = async (teams = []) => {
  if (!Array.isArray(teams) || teams.length === 0) return teams;

  const teamIds = teams.map((t) => t._id);
  const memberships = await TeamPersonRole.find({
    teamId: { $in: teamIds },
    leftAt: null,
  })
    .populate("personId", "name phone")
    .lean();

  const membersByTeam = memberships.reduce((acc, m) => {
    const teamId = String(m.teamId);
    if (!acc[teamId]) acc[teamId] = [];
    acc[teamId].push({
      _id: m.personId?._id || m.personId,
      name: m.personId?.name || null,
      phone: m.personId?.phone || null,
      role: m.role,
      info: m.info || "",
    });
    return acc;
  }, {});

  return teams.map((t) => ({
    ...t,
    teamMembers: membersByTeam[String(t._id)] || [],
  }));
};

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * POST /api/teams
 * Create team (PENDING)
 */
export const createTeam = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return next(new AppError("Authentication required", 401));
    }

    const { teamName, teamLocation } = req.body;

    if (!teamName) {
      return next(new AppError("Team name is required", 400));
    }

    const existing = await Team.findOne({ ownerId: req.user._id });
    if (existing) {
      return next(new AppError("User already owns a team", 409));
    }

    const team = await Team.create({
      teamName: teamName.trim(),
      teamLocation,
      ownerId: req.user._id,
      status: "PENDING",
    });

    res.status(201).json({ status: "success", data: team });
  } catch (err) {
    if (err.code === 11000 && err.message && err.message.includes("owner")) {
      return next(
        new AppError("Duplicate owner detected. Please contact support.", 409),
      );
    }
    next(err);
  }
};

/**
 * GET /api/teams/myTeam
 * Get team owned by current user
 */
export const getMyTeam = async (req, res, next) => {
  try {
    const team = await Team.findOne({ ownerId: req.user._id })
      .populate("ownerId", "username mobileNumber")
      .populate({
        path: "bulls",
        select: "name currentCategory status isDeleted deletionRequestedAt",
        match: { isDeleted: false },
      })
      .lean();

    if (!team) {
      return res.status(200).json({ status: "success", data: null });
    }

    const members = await TeamPersonRole.find({
      teamId: team._id,
      leftAt: null,
    })
      .populate("personId", "name phone")
      .lean();

    const teamMembers = members.map((m) => ({
      _id: m.personId?._id || m.personId,
      name: m.personId?.name || null,
      phone: m.personId?.phone || null,
      role: m.role,
      info: m.info || "",
    }));

    res.status(200).json({
      status: "success",
      data: {
        ...team,
        teamMembers,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/teams/:teamId
 * Update name / location only
 */
export const updateTeam = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { name, location } = req.body;

    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return next(new AppError("Invalid team ID", 400));
    }

    const team = await Team.findOne({
      _id: teamId,
      ownerId: req.user._id,
    });

    if (!team) return next(new AppError("Team not found", 404));

    if (name) team.teamName = name.trim();
    if (location) team.teamLocation = location;

    await team.save();

    res.status(200).json({ status: "success", data: team });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/teams
 * Public list (approved teams)
 */
export const getAllTeams = async (req, res, next) => {
  try {
    const status = req.query.status || "APPROVED";
    const teams = await Team.find({ status, isActive: true, deletedAt: null })
      .select("teamName teamLocation status ownerId createdAt approvedAt")
      .populate("ownerId", "username mobileNumber")
      .populate("bulls", "name currentCategory status")
      .lean({ virtuals: true });

    const enrichedTeams = await attachTeamMembers(teams);

    res
      .status(200)
      .json({ status: "success", results: enrichedTeams.length, data: enrichedTeams });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/teams/:teamId
 */
export const getTeamById = async (req, res, next) => {
  try {
    const { teamId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return next(new AppError("Invalid team ID", 400));
    }

    const team = await Team.findById(teamId)
      .populate("ownerId", "username mobileNumber role")
      .populate("bulls", "name currentCategory status isDeleted deletionRequestedAt")
      .lean({ virtuals: true });
    if (!team) return next(new AppError("Team not found", 404));

    const user = await User.findById(team.ownerId).lean();
    const members = await TeamPersonRole.find({
      teamId: team._id,
      leftAt: null,
    })
      .populate("personId", "name phone")
      .lean();

    const teamMembers = members.map((m) => ({
      _id: m.personId?._id || m.personId,
      name: m.personId?.name || null,
      phone: m.personId?.phone || null,
      role: m.role,
      info: m.info || "",
    }));

    let bannerImageUrl = null;
    let profileImageUrl = null;
    if (user?.bannerUrl) {
      bannerImageUrl = await getSignedImageUrl(user.bannerUrl);
    }
    if (user?.profileUrl) {
      profileImageUrl = await getSignedImageUrl(user.profileUrl);
    }

    res.status(200).json({
      status: "success",
      data: {
        ...team,
        teamMembers,
        bannerUrl: bannerImageUrl,
        profileUrl: profileImageUrl,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updateTeamRoster = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const {
      bulls = [],
      teamMembers = [],
      teamLocation,
      teamName,
      ownerName,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return next(new AppError("Invalid team ID", 400));
    }

    const team = await Team.findOne({
      _id: teamId,
      ownerId: req.user._id,
    });
    if (!team)
      return next(new AppError("Team not found or access denied", 404));

    const normalizedMembers = (teamMembers || []).filter(
      (member) => member && (member._id || String(member.name || "").trim()),
    );
    const hasCaptain = normalizedMembers.some(
      (member) => String(member.role || "").toUpperCase() === "CAPTAIN",
    );
    if (!hasCaptain) {
      return next(new AppError("At least one captain is required", 400));
    }

    // Update team name (unique)
    if (teamName && String(teamName).trim()) {
      const normalizedTeamName = String(teamName).trim();
      if (normalizedTeamName !== team.teamName) {
        const exists = await Team.findOne({
          _id: { $ne: teamId },
          teamName: { $regex: new RegExp(`^${escapeRegex(normalizedTeamName)}$`, "i") },
        }).lean();
        if (exists) {
          return next(new AppError("Team name already taken", 409));
        }
        team.teamName = normalizedTeamName;
        await team.save();
      }
    }

    // Update owner name
    if (ownerName && String(ownerName).trim()) {
      const normalizedOwnerName = String(ownerName).trim();
      await User.findByIdAndUpdate(team.ownerId, {
        username: normalizedOwnerName,
      });
    }

    // Update location
    if (teamLocation) {
      team.teamLocation = teamLocation;
      await team.save();
    }

    // Bulls: upsert and remove missing
    const incomingIds = [];
    for (const b of bulls) {
      if (b._id) {
        // update existing bull
        const existing = await Bull.findOne({ _id: b._id, teamId: teamId });
        if (existing) {
          existing.name = b.name || existing.name;
          if (b.currentCategory) existing.currentCategory = b.currentCategory;
          await existing.save();
          incomingIds.push(existing._id.toString());
        }
      } else {
        const created = await Bull.create({
          name: b.name,
          teamId,
          currentCategory: b.currentCategory,
        });
        incomingIds.push(created._id.toString());
      }
    }

    // Remove bulls not present in incoming list (if they are safe to remove)
    const existingBulls = await Bull.find({ teamId }).select("_id isDeleted");
    for (const eb of existingBulls) {
      if (!incomingIds.includes(eb._id.toString())) {
        const activeEntry = await EventDayEntry.findOne({
          bulls: eb._id,
          isFinalized: false,
        });
        if (activeEntry) {
          return next(
            new AppError(
              "Cannot remove bull currently involved in an active entry",
              400,
            ),
          );
        }
        if (!eb.isDeleted) {
          await Bull.updateOne(
            { _id: eb._id },
            { isDeleted: true, deletionRequestedAt: new Date() },
          );
        }
      }
    }

    // Team Members: synchronize
    const incomingPersonIds = [];
    for (const m of normalizedMembers) {
      if (m._id) {
        incomingPersonIds.push(m._id);
        // update person details if provided
        const personUpdates = {};
        if (m.name) personUpdates.name = m.name;
        if (m.phone) personUpdates.phone = m.phone;
        if (Object.keys(personUpdates).length > 0) {
          await Person.findByIdAndUpdate(m._id, personUpdates);
        }
        // ensure membership exists
        const exists = await TeamPersonRole.findOne({
          teamId,
          personId: m._id,
          leftAt: null,
        });
        if (exists) {
          if (m.role && exists.role !== m.role) {
            exists.role = m.role;
          }
          exists.info = m.info || "";
          await exists.save();
        } else {
          await TeamPersonRole.create({
            teamId,
            personId: m._id,
            role: m.role || "HELPER",
            info: m.info || "",
          });
        }
      } else {
        // create person then membership
        let person = null;
        if (m.phone) person = await Person.findOne({ phone: m.phone });
        if (!person)
          {
            if (!String(m.name || "").trim()) {
              return next(new AppError("Member name is required", 400));
            }
            person = await Person.create({ name: m.name, phone: m.phone });
          }
        await TeamPersonRole.create({
          teamId,
          personId: person._id,
          role: m.role || "HELPER",
          info: m.info || "",
        });
        incomingPersonIds.push(person._id.toString());
      }
    }

    // Mark removed members as left
    const memberships = await TeamPersonRole.find({ teamId, leftAt: null });
    for (const mem of memberships) {
      const pid = mem.personId.toString();
      // do not remove owner
      if (pid === team.ownerId.toString()) continue;
      if (!incomingPersonIds.includes(pid)) {
        mem.leftAt = new Date();
        await mem.save();
      }
    }

    const updatedTeam = await Team.findById(teamId)
      .populate("ownerId", "username mobileNumber role")
      .populate("bulls", "name currentCategory status")
      .lean({ virtuals: true });

    const updatedMembers = await TeamPersonRole.find({
      teamId: updatedTeam._id,
      leftAt: null,
    })
      .populate("personId", "name phone")
      .lean();

    const responseMembers = updatedMembers.map((m) => ({
      _id: m.personId?._id || m.personId,
      name: m.personId?.name || null,
      phone: m.personId?.phone || null,
      role: m.role,
      info: m.info || "",
    }));

    res.status(200).json({
      status: "success",
      data: {
        ...updatedTeam,
        teamMembers: responseMembers,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/teams/pending
 * Admin only
 */
export const getPendingTeams = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const teams = await Team.find({ status: "PENDING", isActive: true, deletedAt: null })
      .populate("ownerId", "username mobileNumber")
      .populate("bulls", "name currentCategory status isDeleted deletionRequestedAt")
      .lean({ virtuals: true })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    const enrichedTeams = await attachTeamMembers(teams);

    // Map ownerId -> createdBy for frontend compatibility
    const mapped = enrichedTeams.map((t) => ({
      ...t,
      createdBy: t.ownerId || null,
    }));

    const total = mapped.length; // For simplicity, using the length of fetched teams as total. For accurate pagination, consider using countDocuments in a real implementation.

    res.status(200).json({
      status: "success",
      results: mapped.length,
      data: mapped,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/teams/:teamId/decision
 * ADMIN approve / reject
 */
export const decideTeamStatus = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { decision, rejectionReason } = req.body;

    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return next(new AppError("Invalid decision", 400));
    }

    const team = await Team.findOne({ _id: teamId, status: "PENDING" });
    if (!team) return next(new AppError("Team not found", 404));

    if (decision === "REJECTED" && !rejectionReason) {
      return next(new AppError("Rejection reason required", 400));
    }

    team.status = decision;
    team.approvedBy = decision === "APPROVED" ? req.user._id : null;
    team.approvedAt = decision === "APPROVED" ? new Date() : null;
    team.rejectionReason = decision === "REJECTED" ? rejectionReason : null;

    await team.save();

    res.status(200).json({ status: "success", data: team });
  } catch (err) {
    next(err);
  }
};
