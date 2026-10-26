import EventRegistration from "../models/EventRegistration.model.js";
import Bull from "../models/Bull.model.js";

export const getRegistrationsByEvent = async (req, res, next) => {
  try {
    const { eventId } = req.query;

    console.log("eventId", eventId);

    if (!eventId) {
      return res.status(400).json({
        status: "fail",
        message: "Event ID is required",
      });
    }

    const registrations = await EventRegistration.find({ event: eventId })
      .populate("team", "teamName")
      .populate("captain", "name")
      .populate("entries.bulls", "name currentCategory teamId")
      .populate("entries.borrowedFromTeamId", "teamName")
      .populate("teamMembers", "name")
      .populate("registeredBy", "username mobileNumber")
      .sort({ createdAt: -1 })
      .lean();

    const bullIdSet = new Set();
    for (const reg of registrations) {
      for (const entry of reg.entries || []) {
        for (const bull of entry?.bulls || []) {
          const bullId = typeof bull === "string" ? bull : bull?._id;
          if (bullId) bullIdSet.add(String(bullId));
        }
      }
    }

    const bullDocs = bullIdSet.size
      ? await Bull.find({ _id: { $in: Array.from(bullIdSet) } })
          .select("_id name currentCategory teamId")
          .lean()
      : [];
    const bullById = new Map(bullDocs.map((b) => [String(b._id), b]));

    // Normalize for frontend compatibility
    const normalized = registrations.map((reg) => ({
      ...reg,
      entries: (reg.entries || []).map((entry) => ({
        ...entry,
        bulls: (entry?.bulls || [])
          .map((bull) => {
            if (bull && typeof bull === "object" && bull.name) return bull;
            const bullId = typeof bull === "string" ? bull : bull?._id;
            return bullById.get(String(bullId)) || null;
          })
          .filter(Boolean),
      })),
      bullIds: (reg.entries || []).flatMap((entry) =>
        (entry?.bulls || []).map((bull) =>
          typeof bull === "string" ? bull : bull?._id,
        ),
      ),
      captainName: reg.captain?.name || null,
    }));

    res.status(200).json({
      status: "success",
      data: normalized,
    });
  } catch (err) {
    next(err);
  }
};

export const updateRegistrationStatus = async (req, res, next) => {
  try {
    const { registrationId } = req.params;
    const { status, reason } = req.body;

    console.log("status", status, "reason", reason);

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid status",
      });
    }

    const registration = await EventRegistration.findById(registrationId);
    if (!registration) {
      return res.status(404).json({
        status: "fail",
        message: "Registration not found",
      });
    }

    if (registration.status !== "PENDING") {
      return res.status(400).json({
        status: "fail",
        message: "Only PENDING registrations can be updated",
      });
    }

    if (status === "REJECTED" && !reason) {
      return res.status(400).json({
        status: "fail",
        message: "Rejection reason required",
      });
    }

    registration.status = status;

    if (status === "APPROVED") {
      registration.approvedBy = req.user._id;
      registration.approvedAt = new Date();
    }

    if (reason) {
      registration.adminNotes = reason;
    }

    await registration.save();

    res.status(200).json({
      status: "success",
      data: registration,
    });
  } catch (err) {
    next(err);
  }
};
