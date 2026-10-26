import Bull from "../models/Bull.model.js";
import BullCategoryUpdateRequest from "../models/BullCategoryUpdateRequest.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import AppError from "../utils/AppError.js";
import mongoose from "mongoose";

/**
 * Create bull (simple & safe)
 */
export const createBull = async ({ name, currentCategory, team }, session) => {
  if (!currentCategory?.type || !currentCategory?.value) {
    throw new AppError("Invalid category structure", 400);
  }

  const [bull] = await Bull.create(
    [
      {
        name: name.trim(),
        currentCategory,
        team,
      },
    ],
    { session },
  );

  return bull;
};

/**
 * Team owner requests category update
 */
export const requestCategoryUpdate = async ({
  bull,
  toCategory,
  reason,
  requestedBy,
}) => {
  if (!toCategory?.type || !toCategory?.value) {
    throw new AppError("Invalid target category", 400);
  }

  // Must be same category type
  if (bull.currentCategory.type !== toCategory.type) {
    throw new AppError("Category type cannot be changed directly", 400);
  }

  // Forward-only rule (admin-configurable order)
  const order = [
    "MILK",
    "TWO",
    "FOUR",
    "SIX",
    "SUB_JUNIOR",
    "JUNIOR",
    "SENIOR",
  ];
  const fromIndex = order.indexOf(bull.currentCategory.value);
  const toIndex = order.indexOf(toCategory.value);

  if (toIndex === -1 || fromIndex === -1 || toIndex <= fromIndex) {
    throw new AppError("Category must move forward", 400);
  }

  // Block if active entry exists
  const activeEntry = await EventDayEntry.findOne({
    bulls: bull._id,
    isFinalized: false,
  });

  if (activeEntry) {
    throw new AppError("Bull is currently involved in an event", 400);
  }

  // Only one pending request allowed
  const pending = await BullCategoryUpdateRequest.findOne({
    bull: bull._id,
    status: "PENDING",
  });

  if (pending) {
    throw new AppError("Category update already pending", 400);
  }

  return await BullCategoryUpdateRequest.create({
    bull: bull._id,
    fromCategory: bull.currentCategory,
    toCategory,
    reason,
    requestedBy,
    status: "PENDING",
  });
};

/**
 * ADMIN approves category update
 */
export const approveCategoryUpdate = async ({ requestId, approvedBy }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const request =
      await BullCategoryUpdateRequest.findById(requestId).session(session);
    if (!request || request.status !== "PENDING") {
      throw new AppError("Invalid request", 400);
    }

    const bull = await Bull.findById(request.bull).session(session);
    if (!bull) throw new AppError("Bull not found", 404);

    // Ensure no change happened meanwhile
    if (
      bull.currentCategory.type !== request.fromCategory.type ||
      bull.currentCategory.value !== request.fromCategory.value
    ) {
      throw new AppError("Bull category changed since request", 400);
    }

    // Apply category
    bull.currentCategory = request.toCategory;
    await bull.save({ session });

    // Close request
    request.status = "APPROVED";
    request.reviewedBy = approvedBy;
    request.reviewedAt = new Date();
    await request.save({ session });

    await session.commitTransaction();
    return request;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * ADMIN rejects category update
 */
export const rejectCategoryUpdate = async ({ requestId, rejectedBy }) => {
  const request = await BullCategoryUpdateRequest.findById(requestId);
  if (!request || request.status !== "PENDING") {
    throw new AppError("Invalid request", 400);
  }

  request.status = "REJECTED";
  request.reviewedBy = rejectedBy;
  request.reviewedAt = new Date();
  await request.save();

  return request;
};
