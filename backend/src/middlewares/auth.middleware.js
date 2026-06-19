// src/middlewares/authMiddleware.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/user.model.js";

import { errorResponse } from "../utils/errorUtils.js";

dotenv.config();

/**
 * JWT authentication middleware.
 * Verifies the JWT token and fetches the full user from database.
 */
const authMiddleware = async (req, res, next) => {
  console.log("[Auth] Checking authentication...");
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists and has correct format
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[Auth] No valid auth header found:", authHeader);
    return res.status(401).json({
      success: false,
      status: "ERROR",
      message: "Authentication required",
      code: "UNAUTHORIZED",
      timestamp: new Date().toISOString(),
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    console.log("[Auth] Verifying token...");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(
      `[Auth] Token valid for user: ${decoded.id}, role: ${decoded.role}`,
    );

    // Fetch full user from database to get latest data including institutionName
    const user = await User.findById(decoded.id).select(
      "-password -refreshToken -privateKey",
    );

    if (!user) {
      console.log("[Auth] User not found in database:", decoded.id);
      return res.status(401).json({
        success: false,
        status: "ERROR",
        message: "User not found",
        code: "USER_NOT_FOUND",
        timestamp: new Date().toISOString(),
      });
    }

    // Set req.user with full user data
    req.user = {
      id: user._id.toString(),
      role: user.role,
      name: user.name,
      email: user.email,
      institutionName: user.institutionName,
      institutionLogo: user.institutionLogo,
      walletAddress: user.walletAddress,
      publicKey: user.publicKey,
    };

    console.log(
      `[Auth] User loaded: ${user.name}, institutionName: ${user.institutionName || "N/A"}`,
    );
    next();
  } catch (error) {
    console.error("[Auth] Token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      status: "ERROR",
      message:
        error.name === "TokenExpiredError"
          ? "Authentication token has expired"
          : "Invalid authentication token",
      code:
        error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      timestamp: new Date().toISOString(),
    });
  }
};

export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      const { response, statusCode } = errorResponse(
        "INSUFFICIENT_PERMISSIONS",
      );
      return res.status(statusCode).json(response);
    }
    next();
  };
};

export default authMiddleware;
