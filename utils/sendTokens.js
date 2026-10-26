import jwt from "jsonwebtoken";

export const verifyRefreshToken = (token) =>
  jwt.verify(token, process.env.JWT_REFRESH_TOKEN);

export const getAuthCookieOptions = (maxAge) => {
  const isProduction = process.env.NODE_ENV === "production";
  const domain = process.env.COOKIE_DOMAIN;

  const options = {
    httpOnly: true,
    secure: isProduction ? true : false,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge,
  };

  if (isProduction && domain) {
    options.domain = domain;
  }

  return options;
};

export const sendTokens = (res, accessToken, refreshToken) => {
  res.cookie(
    "accessToken",
    accessToken,
    getAuthCookieOptions(15 * 60 * 1000),
  );

  res.cookie(
    "refreshToken",
    refreshToken,
    getAuthCookieOptions(7 * 24 * 60 * 60 * 1000),
  );
};
