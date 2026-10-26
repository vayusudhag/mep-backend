import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 100,
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      validate: {
        validator: (v) => /^[6-9]\d{9}$/.test(v),
        message: "Invalid mobile number",
      },
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    bannerUrl: {
      type: String,
      trim: true,
      default: null,
    },
    profileUrl: {
      type: String,
      trim: true,
      default: null,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    passwordChangedAt: Date,
    tokenVersion: {
      type: Number,
      default: 0,
    },

    // Password reset (OTP-based)
    passwordResetOTP: String,
    passwordResetExpires: Date,
    passwordResetAttempts: {
      type: Number,
      default: 0,
    },
    lastOTPSentAt: Date,

    lastLogin: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Hash password before saving

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);

  if (!this.isNew) {
    this.tokenVersion += 1;
    this.passwordChangedAt = Date.now() - 1000;
  }
});

// Compare password

userSchema.methods.correctPassword = function (
  candidatePassword,
  hashedPassword,
) {
  return bcrypt.compare(candidatePassword, hashedPassword);
};

userSchema.methods.changedPasswordAfter = function (jwtIssuedAt) {
  if (!this.passwordChangedAt) return false;
  return this.passwordChangedAt.getTime() / 1000 > jwtIssuedAt;
};

userSchema.methods.signAccessToken = function () {
  return jwt.sign(
    {
      id: this._id,
      role: this.role,
      tv: this.tokenVersion,
    },
    process.env.JWT_ACCESS_TOKEN,
    { expiresIn: "15m" },
  );
};

userSchema.methods.signRefreshToken = function () {
  return jwt.sign(
    {
      id: this._id,
      tv: this.tokenVersion,
    },
    process.env.JWT_REFRESH_TOKEN,
    { expiresIn: "7d" },
  );
};

userSchema.methods.createPasswordResetOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  this.passwordResetOTP = crypto.createHash("sha256").update(otp).digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 mins
  this.passwordResetAttempts = 0;
  this.lastOTPSentAt = Date.now();

  return otp;
};

export default mongoose.model("User", userSchema);
