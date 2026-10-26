import mongoose from "mongoose";
import AppError from "../utils/AppError.js";
import Team from "../models/Team.model.js";
import Person from "../models/Person.model.js";
import TeamPersonRole from "../models/TeamPersonRole.model.js";
import Bull from "../models/Bull.model.js";
import TeamAudit from "../models/TeamAudit.model.js";

/**
 * POST /api/teams/onboard
 * One payload → orchestrated creation
 */
export const onboardTeam = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { teamName, teamLocation, teamMembers = [], bulls = [] } = req.body;

    if (!teamName) {
      throw new AppError("Team name required", 400);
    }

    if (!req.user || !req.user._id) {
      throw new AppError("Authentication required", 401);
    }

    const hasCaptain = teamMembers.some(
      (member) =>
        String(member?.role || "").toUpperCase() === "CAPTAIN" &&
        String(member?.name || "").trim(),
    );
    if (!hasCaptain) {
      throw new AppError("At least one captain is required", 400);
    }

    const existing = await Team.findOne({ ownerId: req.user._id }).session(
      session,
    );
    if (existing) {
      throw new AppError("User already owns a team", 409);
    }

    const created = await Team.create(
      [
        {
          teamName: teamName.trim(),
          teamLocation: teamLocation,
          ownerId: req.user._id,
          status: "PENDING",
        },
      ],
      { session },
    );
    const team = created[0];

    // audit log
    await TeamAudit.create(
      [
        {
          team: team._id,
          action: "CREATED",
          performedBy: req.user._id,
        },
      ],
      { session },
    );

    // Members (skip OWNER — ownership is tracked via Team.ownerId)
    for (const m of teamMembers) {
      if (!m.name || !m.role) {
        throw new AppError("Invalid team member payload", 400);
      }

      // Skip creating TeamPersonRole entry for OWNER (ownership is tracked in Team.ownerId)
      if (m.role === "OWNER") {
        continue;
      }

      let person = null;
      if (m.phone) {
        person = await Person.findOne({ phone: m.phone }).session(session);
      }
      if (!person) {
        person = await Person.create(
          [{ name: m.name, phone: m.phone || null }],
          { session },
        );
        person = person[0];
      }

      await TeamPersonRole.create(
        [
          {
            teamId: team._id,
            personId: person._id,
            role: m.role,
          },
        ],
        { session },
      );
    }

    // Bulls
    for (const b of bulls) {
      if (!b.name || !b.currentCategory) {
        throw new AppError("Invalid bull payload", 400);
      }

      await Bull.create(
        [
          {
            name: b.name,
            teamId: team._id,
            currentCategory: b.currentCategory,
          },
        ],
        { session },
      );
    }

    await session.commitTransaction();

    res.status(201).json({
      status: "success",
      data: { teamId: team._id },
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};
