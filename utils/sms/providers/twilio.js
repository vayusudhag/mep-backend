import twilio from "twilio";

const getTwilioConfig = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  const missing = [];
  if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!phoneNumber) missing.push("TWILIO_PHONE_NUMBER");

  if (missing.length > 0) {
    throw new Error(
      `Twilio is not configured. Missing env: ${missing.join(", ")}`,
    );
  }

  return { accountSid, authToken, phoneNumber };
};

const getTwilioClient = () => {
  const { accountSid, authToken } = getTwilioConfig();
  return twilio(accountSid, authToken);
};

export const sendWhatsAppOTP = async (phoneNumber, message) => {
  console.log("🔥 INSIDE sendWhatsAppOTP");
  const client = getTwilioClient();

  const result = await client.messages.create({
    from: "whatsapp:+14155238886",

    to: `whatsapp:${phoneNumber}`,
    body: message,
  });

  console.log("📨 WhatsApp SID:", result.sid);
  return result;
};

export const sendViaTwilio = async (phoneNumber, message) => {
  try {
    const client = getTwilioClient();
    const { phoneNumber: twilioPhoneNumber } = getTwilioConfig();

    const result = await client.messages.create({
      to: `+91${phoneNumber}`, // Assuming Indian numbers, adjust country code as needed
      from: twilioPhoneNumber,
      body: message,
    });
    console.log("SMS sent:", result.sid);
    return result;
  } catch (error) {
    console.error("Error sending SMS:", error);
    throw new Error(error.message || "Failed to send SMS");
  }
};
