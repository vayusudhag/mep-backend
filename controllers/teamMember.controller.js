import Team from "../models/Team.model.js";
import Person from "../models/Person.model.js";
import TeamPersonRole from "../models/TeamPersonRole.model.js";
import AppError from "../utils/AppError.js";

/**
 * POST /api/teams/:teamId/members
 */
export const addTeamMember = async (req, res, next) => {
  try {
    const { teamId } = req.params;
    const { name, phone, role } = req.body;

    if (!name || !role) {
      return next(new AppError("Name and role required", 400));
    }

    const team = await Team.findOne({
      _id: teamId,
      ownerId: req.user._id,
      deletedAt: null,
    });

    if (!team) return next(new AppError("Team not found", 404));

    let person = null;

    if (phone) {
      person = await Person.findOne({ phone });
    }

    if (!person) {
      person = await Person.create({ name, phone });
    }

    const exists = await TeamPersonRole.findOne({
      teamId,
      personId: person._id,
      role,
      leftAt: null,
    });

    if (exists) {
      return next(new AppError("Member already added", 409));
    }

    const membership = await TeamPersonRole.create({
      teamId,
      personId: person._id,
      role,
    });

    res.status(201).json({ status: "success", data: membership });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/teams/:teamId/members/:personId
 */
export const removeTeamMember = async (req, res, next) => {
  try {
    const { teamId, personId } = req.params;

    const team = await Team.findOne({
      _id: teamId,
      ownerId: req.user._id,
      deletedAt: null,
    });

    if (!team) return next(new AppError("Team not found", 404));

    const membership = await TeamPersonRole.findOne({
      teamId,
      personId,
      leftAt: null,
    });

    if (!membership) {
      return next(new AppError("Member not found", 404));
    }

    membership.leftAt = new Date();
    await membership.save();

    res.status(200).json({ status: "success" });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/teams/:teamId/members
 */
export const listTeamMembers = async (req, res, next) => {
  try {
    const { teamId } = req.params;

    const members = await TeamPersonRole.find({
      teamId,
      leftAt: null,
    }).populate("personId", "name phone");

    res.status(200).json({
      status: "success",
      results: members.length,
      data: members,
    });
  } catch (err) {
    next(err);
  }
};
