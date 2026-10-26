import mongoose from "mongoose";
import Bull from "../models/Bull.model.js";
import Team from "../models/Team.model.js";
import User from "../models/Users.model.js";
import EventRegistration from "../models/EventRegistration.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL;
const BATCH_SIZE = 200;

const buildMaps = async (bullIds) => {
  const bulls = bullIds.length
    ? await Bull.find({ _id: { $in: bullIds } })
        .select("_id name teamId currentCategory status")
        .lean()
    : [];
  const bullById = new Map(bulls.map((b) => [String(b._id), b]));

  const teamIds = [
    ...new Set(bulls.map((b) => String(b.teamId)).filter(Boolean)),
  ];
  const teams = teamIds.length
    ? await Team.find({ _id: { $in: teamIds } })
        .select("teamName ownerId")
        .lean()
    : [];
  const teamById = new Map(teams.map((t) => [String(t._id), t]));

  const ownerIds = [
    ...new Set(teams.map((t) => String(t.ownerId)).filter(Boolean)),
  ];
  const owners = ownerIds.length
    ? await User.find({ _id: { $in: ownerIds } })
        .select("username")
        .lean()
    : [];
  const ownerById = new Map(owners.map((o) => [String(o._id), o]));

  return { bullById, teamById, ownerById };
};

const makeSnapshot = (bull, teamById, ownerById) => {
  const team = teamById.get(String(bull.teamId));
  const owner = team?.ownerId ? ownerById.get(String(team.ownerId)) : null;
  return {
    bullId: bull._id,
    name: bull.name,
    category: bull.currentCategory,
    teamId: bull.teamId,
    teamName: team?.teamName || "Unknown Team",
    ownerId: team?.ownerId || null,
    ownerName: owner?.username || null,
    statusAtThatTime: bull.status,
  };
};

const backfillRegistrations = async () => {
  const cursor = EventRegistration.find({
    "entries.bullSnapshots.0": { $exists: false },
  })
    .lean()
    .cursor();

  let batch = [];
  let ops = [];
  let processed = 0;

  const flush = async () => {
    if (!batch.length) return;
    const allBullIds = new Set();
    batch.forEach((reg) => {
      (reg.entries || []).forEach((entry) => {
        (entry.bulls || []).forEach((id) => allBullIds.add(String(id)));
      });
    });

    const { bullById, teamById, ownerById } = await buildMaps(
      [...allBullIds].map((id) => new mongoose.Types.ObjectId(id)),
    );

    batch.forEach((reg) => {
      const nextEntries = (reg.entries || []).map((entry) => {
        const bullSnapshots = (entry.bulls || [])
          .map((id) => bullById.get(String(id)))
          .filter(Boolean)
          .map((bull) => makeSnapshot(bull, teamById, ownerById));

        return { ...entry, bullSnapshots };
      });

      ops.push({
        updateOne: {
          filter: { _id: reg._id },
          update: { $set: { entries: nextEntries } },
        },
      });
    });

    if (ops.length) {
      await EventRegistration.bulkWrite(ops, { ordered: false });
    }

    processed += batch.length;
    batch = [];
    ops = [];
  };

  for await (const reg of cursor) {
    batch.push(reg);
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();
  return processed;
};

const backfillEventDayEntries = async () => {
  const cursor = EventDayEntry.find({
    "bullSnapshots.0": { $exists: false },
  })
    .lean()
    .cursor();

  let batch = [];
  let ops = [];
  let processed = 0;

  const flush = async () => {
    if (!batch.length) return;
    const allBullIds = new Set();
    batch.forEach((entry) => {
      (entry.bulls || []).forEach((id) => allBullIds.add(String(id)));
    });

    const { bullById, teamById, ownerById } = await buildMaps(
      [...allBullIds].map((id) => new mongoose.Types.ObjectId(id)),
    );

    batch.forEach((entry) => {
      const bullSnapshots = (entry.bulls || [])
        .map((id) => bullById.get(String(id)))
        .filter(Boolean)
        .map((bull) => makeSnapshot(bull, teamById, ownerById));

      ops.push({
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { bullSnapshots } },
        },
      });
    });

    if (ops.length) {
      await EventDayEntry.bulkWrite(ops, { ordered: false });
    }

    processed += batch.length;
    batch = [];
    ops = [];
  };

  for await (const entry of cursor) {
    batch.push(entry);
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();
  return processed;
};

const main = async () => {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI (or DATABASE_URL) is required");
  }
  await mongoose.connect(MONGO_URI);

  const registrations = await backfillRegistrations();
  const entries = await backfillEventDayEntries();

  console.log(`Backfilled registrations: ${registrations}`);
  console.log(`Backfilled event day entries: ${entries}`);

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
