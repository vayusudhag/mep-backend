import axios from "axios";

export const sendViaFast2SMS = async ({ phoneNumber, otp }) => {
  try {
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "otp",
        variables_values: otp,
        numbers: phoneNumber.replace("+91", ""),
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      }
    );

    // IMPORTANT: log provider response (not OTP)
    console.log("Fast2SMS response:", response.data);

    if (!response.data.return) {
      const providerMessage =
        response?.data?.message || "Fast2SMS delivery failed";
      const providerError = new Error(providerMessage);
      providerError.code = response?.data?.status_code || "FAST2SMS_FAILED";
      throw providerError;
    }

    return response.data;
  } catch (err) {
    console.error("Fast2SMS error:", err.response?.data || err.message);
    const statusCode = err?.response?.data?.status_code;
    if (statusCode === 996) {
      const verificationError = new Error(
        "Fast2SMS OTP API blocked: website verification incomplete (status_code 996).",
      );
      verificationError.code = 996;
      throw verificationError;
    }
    throw err;
  }
};
