import mongoose from "mongoose";
import Team from "../models/Team.model.js";
import Person from "../models/Person.model.js";
import TeamPersonRole from "../models/TeamPersonRole.model.js";
import Bull from "../models/Bull.model.js";
import TeamAudit from "../models/TeamAudit.model.js";
import AppError from "../utils/AppError.js";
import { getSignedImageUrl, uploadImageToS3 } from "../utils/s3.js";

const validObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const asyncAudit = (payload) =>
  TeamAudit.create(payload).catch((err) =>
    console.error("Admin audit log failed:", err.message),
  );

const pagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  return { page, limit, skip: (page - 1) * limit };
};

const teamListProjection =
  "teamName teamLocation status ownerId isActive deletedAt createdAt updatedAt approvedAt";

const memberShape = (membership) => ({
  _id: membership._id,
  personId: membership.personId?._id || membership.personId,
  name: membership.personId?.name || null,
  phone: membership.personId?.phone || null,
  identityLevel: membership.personId?.identityLevel || null,
  role: membership.role,
  info: membership.info || "",
  joinedAt: membership.joinedAt,
});

const bullShape = async (bull) => {
  const raw = bull.toObject ? bull.toObject() : bull;
  return {
    ...raw,
    teamName: raw.teamId?.teamName || raw.teamName || null,
    teamId: raw.teamId?._id || raw.teamId,
    imageUrl: raw.imageUrl ? await getSignedImageUrl(raw.imageUrl) : null,
    imageKey: raw.imageUrl || null,
  };
};

export const getAdminStats = async (req, res, next) => {
  try {
    const [
      totalTeams,
      activeTeams,
      pendingTeams,
      totalMembers,
      activeBulls,
      deletedBulls,
    ] = await Promise.all([
      Team.countDocuments({ deletedAt: null }),
      Team.countDocuments({ deletedAt: null, status: "APPROVED", isActive: true }),
      Team.countDocuments({ deletedAt: null, status: "PENDING" }),
      TeamPersonRole.countDocuments({ leftAt: null }),
      Bull.countDocuments({ isDeleted: false }),
      Bull.countDocuments({ isDeleted: true }),
    ]);

    res.status(200).json({
      status: "success",
      data: {
        totalTeams,
        activeTeams,
        pendingTeams,
        totalMembers,
        activeBulls,
        deletedBulls,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const listAdminTeams = async (req, res, next) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const { search = "", status = "ALL", includeDeleted = "false" } = req.query;
    const query = {};

    if (includeDeleted !== "true") query.deletedAt = null;
    if (status && status !== "ALL") query.status = String(status).toUpperCase();
    if (search) {
      query.$or = [
        { teamName: { $regex: escapeRegex(search), $options: "i" } },
        { "teamLocation.village": { $regex: escapeRegex(search), $options: "i" } },
        { "teamLocation.district": { $regex: escapeRegex(search), $options: "i" } },
        { "teamLocation.state": { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    const [teams, total] = await Promise.all([
      Team.find(query)
        .select(teamListProjection)
        .populate("ownerId", "username mobileNumber role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Team.countDocuments(query),
    ]);

    const teamIds = teams.map((team) => team._id);
    const [memberCounts, bullCounts] = await Promise.all([
      TeamPersonRole.aggregate([
        { $match: { teamId: { $in: teamIds }, leftAt: null } },
        { $group: { _id: "$teamId", count: { $sum: 1 } } },
      ]),
      Bull.aggregate([
        { $match: { teamId: { $in: teamIds }, isDeleted: false } },
        { $group: { _id: "$teamId", count: { $sum: 1 } } },
      ]),
    ]);

    const membersByTeam = new Map(memberCounts.map((item) => [String(item._id), item.count]));
    const bullsByTeam = new Map(bullCounts.map((item) => [String(item._id), item.count]));

    res.status(200).json({
      status: "success",
      results: teams.length,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      data: teams.map((team) => ({
        ...team,
        membersCount: membersByTeam.get(String(team._id)) || 0,
        bullsCount: bullsByTeam.get(String(team._id)) || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
};

export const getAdminTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return next(new AppError("Invalid team ID", 400));

    const team = await Team.findById(id)
      .populate("ownerId", "username mobileNumber role")
      .lean({ virtuals: true });
    if (!team || team.deletedAt) return next(new AppError("Team not found", 404));

    const [memberships, bulls] = await Promise.all([
      TeamPersonRole.find({ teamId: id, leftAt: null })
        .populate("personId", "name phone identityLevel")
        .sort({ createdAt: -1 })
        .lean(),
      Bull.find({ teamId: id, isDeleted: false }).sort({ createdAt: -1 }).lean(),
    ]);

    const shapedBulls = await Promise.all(bulls.map(bullShape));

    res.status(200).json({
      status: "success",
      data: {
        ...team,
        members: memberships.map(memberShape),
        bulls: shapedBulls,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const updateAdminTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return next(new AppError("Invalid team ID", 400));

    const { teamName, teamLocation, status, isActive, rejectedReason } = req.body;
    const team = await Team.findOne({ _id: id, deletedAt: null });
    if (!team) return next(new AppError("Team not found", 404));

    if (teamName && String(teamName).trim() !== team.teamName) {
      const exists = await Team.findOne({
        _id: { $ne: id },
        teamName: { $regex: new RegExp(`^${escapeRegex(teamName.trim())}$`, "i") },
        deletedAt: null,
      }).lean();
      if (exists) return next(new AppError("Team name already exists", 409));
      team.teamName = teamName.trim();
    }
    if (teamLocation) team.teamLocation = teamLocation;
    if (["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      team.status = status;
      team.approvedBy = status === "APPROVED" ? req.user._id : team.approvedBy;
      team.approvedAt = status === "APPROVED" ? new Date() : team.approvedAt;
      team.rejectedReason = status === "REJECTED" ? rejectedReason || "" : null;
    }
    if (typeof isActive === "boolean") team.isActive = isActive;

    await team.save();
    await asyncAudit({
      team: team._id,
      action: "ADMIN_TEAM_UPDATED",
      performedBy: req.user._id,
      metadata: req.body,
    });

    res.status(200).json({ status: "success", data: team });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminTeam = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return next(new AppError("Invalid team ID", 400));

    const team = await Team.findOne({ _id: id, deletedAt: null });
    if (!team) return next(new AppError("Team not found", 404));

    team.isActive = false;
    team.deletedAt = new Date();
    await team.save();
    await Promise.all([
      TeamPersonRole.updateMany({ teamId: id, leftAt: null }, { leftAt: new Date() }),
      Bull.updateMany(
        { teamId: id, isDeleted: false },
        { isDeleted: true, deletedAt: new Date(), deletionRequestedAt: new Date() },
      ),
      asyncAudit({
        team: team._id,
        action: "ADMIN_TEAM_DELETED",
        performedBy: req.user._id,
        metadata: { teamName: team.teamName },
      }),
    ]);

    res.status(200).json({ status: "success", message: "Team deleted" });
  } catch (err) {
    next(err);
  }
};

export const addAdminMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, role, info } = req.body;
    if (!validObjectId(id)) return next(new AppError("Invalid team ID", 400));
    if (!name || !role) return next(new AppError("Name and role are required", 400));

    const team = await Team.findOne({ _id: id, deletedAt: null });
    if (!team) return next(new AppError("Team not found", 404));

    let person = phone ? await Person.findOne({ phone }) : null;
    if (!person) person = await Person.create({ name: name.trim(), phone: phone || null });
    else if (name && person.name !== name.trim()) {
      person.name = name.trim();
      await person.save();
    }

    const duplicate = await TeamPersonRole.findOne({
      teamId: id,
      personId: person._id,
      leftAt: null,
    });
    if (duplicate) return next(new AppError("Member already exists in this team", 409));

    const membership = await TeamPersonRole.create({
      teamId: id,
      personId: person._id,
      role,
      info: info || "",
    });
    await asyncAudit({
      team: id,
      action: "ADMIN_MEMBER_CREATED",
      performedBy: req.user._id,
      metadata: { personId: person._id, role },
    });

    const populated = await membership.populate("personId", "name phone identityLevel");
    res.status(201).json({ status: "success", data: memberShape(populated) });
  } catch (err) {
    next(err);
  }
};

export const updateAdminMember = async (req, res, next) => {
  try {
    const { memberId } = req.params;
    if (!validObjectId(memberId)) return next(new AppError("Invalid member ID", 400));

    const membership = await TeamPersonRole.findOne({ _id: memberId, leftAt: null });
    if (!membership) return next(new AppError("Member not found", 404));

    const { name, phone, role, info } = req.body;
    const person = await Person.findById(membership.personId);
    if (!person) return next(new AppError("Person not found", 404));

    if (phone && phone !== person.phone) {
      const duplicatePerson = await Person.findOne({ phone, _id: { $ne: person._id } });
      if (duplicatePerson) {
        const duplicateMembership = await TeamPersonRole.findOne({
          teamId: membership.teamId,
          personId: duplicatePerson._id,
          leftAt: null,
        });
        if (duplicateMembership) {
          return next(new AppError("Another team member already uses this phone", 409));
        }
      }
      person.phone = phone;
    }
    if (name) person.name = name.trim();
    await person.save();

    if (role) membership.role = role;
    if (info !== undefined) membership.info = info;
    await membership.save();
    await asyncAudit({
      team: membership.teamId,
      action: "ADMIN_MEMBER_UPDATED",
      performedBy: req.user._id,
      metadata: { memberId, role },
    });

    const populated = await membership.populate("personId", "name phone identityLevel");
    res.status(200).json({ status: "success", data: memberShape(populated) });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminMember = async (req, res, next) => {
  try {
    const { memberId } = req.params;
    if (!validObjectId(memberId)) return next(new AppError("Invalid member ID", 400));

    const membership = await TeamPersonRole.findOne({ _id: memberId, leftAt: null });
    if (!membership) return next(new AppError("Member not found", 404));

    membership.leftAt = new Date();
    await membership.save();
    await asyncAudit({
      team: membership.teamId,
      action: "ADMIN_MEMBER_DELETED",
      performedBy: req.user._id,
      metadata: { memberId },
    });

    res.status(200).json({ status: "success", message: "Member deleted" });
  } catch (err) {
    next(err);
  }
};

export const listAdminBulls = async (req, res, next) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const { search = "", teamId, status = "ALL", includeDeleted = "false" } = req.query;
    const query = {};

    if (includeDeleted !== "true") query.isDeleted = false;
    if (teamId) {
      if (!validObjectId(teamId)) return next(new AppError("Invalid team ID", 400));
      query.teamId = teamId;
    }
    if (status && status !== "ALL") query.status = String(status).toUpperCase();
    if (search) query.name = { $regex: escapeRegex(search), $options: "i" };

    const [bulls, total] = await Promise.all([
      Bull.find(query)
        .populate("teamId", "teamName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Bull.countDocuments(query),
    ]);

    const shapedBulls = await Promise.all(bulls.map(bullShape));
    res.status(200).json({
      status: "success",
      results: shapedBulls.length,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      data: shapedBulls,
    });
  } catch (err) {
    next(err);
  }
};

const parseBullBody = (body) => {
  const currentCategory =
    typeof body.currentCategory === "string"
      ? JSON.parse(body.currentCategory)
      : body.currentCategory;

  return {
    name: body.name?.trim(),
    teamId: body.teamId,
    age: body.age === "" || body.age === undefined ? null : Number(body.age),
    breed: body.breed?.trim() || "",
    weight:
      body.weight === "" || body.weight === undefined ? null : Number(body.weight),
    healthStatus: body.healthStatus || "HEALTHY",
    status: body.status || "ACTIVE",
    currentCategory,
  };
};

const validateBullPayload = (payload) => {
  if (!payload.name) return "Bull name is required";
  if (!validObjectId(payload.teamId)) return "Valid team reference is required";
  if (!payload.currentCategory?.type || !payload.currentCategory?.value) {
    return "Category type and value are required";
  }
  if (payload.age !== null && Number.isNaN(payload.age)) return "Age must be a number";
  if (payload.weight !== null && Number.isNaN(payload.weight)) {
    return "Weight must be a number";
  }
  return null;
};

export const createAdminBull = async (req, res, next) => {
  try {
    const payload = parseBullBody(req.body);
    const validationMessage = validateBullPayload(payload);
    if (validationMessage) return next(new AppError(validationMessage, 400));

    const team = await Team.findOne({ _id: payload.teamId, deletedAt: null });
    if (!team) return next(new AppError("Team not found", 404));

    let imageKey = null;
    if (req.file) imageKey = await uploadImageToS3(req.file, "bulls");

    const bull = await Bull.create({ ...payload, imageUrl: imageKey });
    await asyncAudit({
      team: payload.teamId,
      action: "ADMIN_BULL_CREATED",
      performedBy: req.user._id,
      metadata: { bullId: bull._id, name: bull.name },
    });

    res.status(201).json({ status: "success", data: await bullShape(bull) });
  } catch (err) {
    next(err);
  }
};

export const updateAdminBull = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return next(new AppError("Invalid bull ID", 400));

    const bull = await Bull.findOne({ _id: id, isDeleted: false });
    if (!bull) return next(new AppError("Bull not found", 404));

    const payload = parseBullBody({ ...bull.toObject(), ...req.body });
    const validationMessage = validateBullPayload(payload);
    if (validationMessage) return next(new AppError(validationMessage, 400));

    const team = await Team.findOne({ _id: payload.teamId, deletedAt: null });
    if (!team) return next(new AppError("Team not found", 404));

    Object.assign(bull, payload);
    if (req.file) bull.imageUrl = await uploadImageToS3(req.file, "bulls");
    await bull.save();
    await asyncAudit({
      team: bull.teamId,
      action: "ADMIN_BULL_UPDATED",
      performedBy: req.user._id,
      metadata: { bullId: bull._id, name: bull.name },
    });

    res.status(200).json({ status: "success", data: await bullShape(bull) });
  } catch (err) {
    next(err);
  }
};

export const deleteAdminBull = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validObjectId(id)) return next(new AppError("Invalid bull ID", 400));

    const bull = await Bull.findOne({ _id: id, isDeleted: false });
    if (!bull) return next(new AppError("Bull not found", 404));

    bull.isDeleted = true;
    bull.deletedAt = new Date();
    bull.deletionRequestedAt = new Date();
    await bull.save();
    await asyncAudit({
      team: bull.teamId,
      action: "ADMIN_BULL_DELETED",
      performedBy: req.user._id,
      metadata: { bullId: bull._id, name: bull.name },
    });

    res.status(200).json({ status: "success", message: "Bull deleted" });
  } catch (err) {
    next(err);
  }
};
