// src/app.js
import express from "express";
import authRoutes from "./routes/auth.routes.js"; // Updated path
import healthRoutes from "./routes/health.routes.js"; // Updated path
import certificateRoutes from "./routes/certificate.routes.js"; // Updated path
import userRoutes from "./routes/user.routes.js"; // Added user routes
import emailRoutes from "./routes/email.routes.js"; // Added email routes
import courseRoutes from "./routes/course.routes.js"; // Added email routes
import enrollmentRoutes from "./routes/enrollment.routes.js"; // Student enrollment
import cors from "cors";
import morgan from "morgan";
import { errorHandler } from "./utils/errorUtils.js";
import adminRoutes from "./routes/admin.routes.js";
import agreementRoutes from "./routes/equivalency.routes.js"; // Bilateral equivalency agreements

const app = express();

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5173/",
      "http://127.0.0.1:5173/",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Increase JSON payload size limit for larger requests
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Logger
app.use(morgan("dev"));

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/health", healthRoutes); // Updated this line
app.use("/api/users", userRoutes); // Added user routes
app.use("/api/email", emailRoutes); // Added email routes
app.use("/api/admin", adminRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/enrollment", enrollmentRoutes);
app.use("/api/agreements", agreementRoutes);

// Add global error handler (must be after routes)
app.use(errorHandler);

// Export app
export default app;
