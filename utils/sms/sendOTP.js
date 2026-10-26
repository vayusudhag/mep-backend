import { sendViaTwilio } from "./providers/twilio.js";

import { sendViaFast2SMS } from "./providers/fast2sms.js";

export const sendOTP = async ({ phoneNumber, otp }) => {
  if (!phoneNumber || !otp) {
    throw new Error("phoneNumber and otp required");
  }

  const otpMessage = `Your OTP is ${otp}. Do not share it with anyone.`;

  // India-first strategy with Twilio fallback
  try {
    await sendViaFast2SMS({
      phoneNumber,
      otp,
    });
    return { provider: "fast2sms" };
  } catch (fastErr) {
    const twilioPhoneNumber = String(phoneNumber).replace(/^\+91/, "");

    try {
      await sendViaTwilio(twilioPhoneNumber, otpMessage);
      return { provider: "twilio" };
    } catch (twilioErr) {
      const combined = new Error(
        `OTP send failed. Fast2SMS: ${fastErr.message}. Twilio: ${twilioErr.message}`,
      );
      combined.cause = { fast2sms: fastErr, twilio: twilioErr };
      throw combined;
    }
  }
};
