import React from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { VerificationProvider } from "./contexts/VerificationContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

// Pages
import Home from "./pages/Home";
import AuthPage from "./pages/AuthPage";
import VerifyCertificate from "./pages/VerifyCertificate";
import GenerateCertificate from "./pages/GenerateCertificate";
import UploadPDF from "./pages/UploadPDF";
import CertificateEditor from "./components/CertificateEditor";
import About from "./pages/About";
import AccountPage from "./pages/AccountPage";
import CertificatesPage from "./pages/CertificatesPage";
import RecipientCertificates from "./pages/RecipientCertificates";
import CourseManagement from "./pages/courseManagement";
import EnrollmentPage from "./pages/EnrollmentPage";
import AgreementsPage from "./pages/AgreementsPage";
import TransferPage from "./pages/TransferPage";

/**
 * App Component
 *
 * This is the main application component that sets up routing and context providers.
 * The routing structure is organized as follows:
 *
 * Public Routes:
 * - /: Home page (accessible to all)
 * - /verify: Certificate verification page (accessible to all)
 * - /login: Authentication page (login/register)
 * - /about: About page (accessible to all)
 * - /my-certificates: Recipient's certificates view (accessible to all)
 *
 * Protected Routes (require authentication):
 * - /account: User account profile (all authenticated users)
 * - /certificates: User certificates or institute's issued certificates (all authenticated users)
 *
 * Role-Based Protected Routes:
 * - /generate: Certificate generation (Institute only)
 * - /upload: PDF upload (Institute only)
 * - /editor: Certificate editor (Institute only)
 *
 * The AuthProvider and VerificationProvider wrap the entire application
 * to provide authentication and verification context to all components.
 */
function App() {
  return (
    <AuthProvider>
      <VerificationProvider>
        <Layout>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<AuthPage />} />
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/verify" element={<VerifyCertificate />} />
            <Route
              path="/my-certificates"
              element={<RecipientCertificates />}
            />

            {/* Protected Routes - Any authenticated user */}
            <Route element={<ProtectedRoute />}>
              <Route path="/account" element={<AccountPage />} />
              <Route path="/certificates" element={<CertificatesPage />} />
            </Route>

            {/* Role-Based Routes - Institute Only */}
            <Route element={<ProtectedRoute allowedRoles={["INSTITUTE"]} />}>
              <Route path="/generate" element={<GenerateCertificate />} />
              <Route path="/upload" element={<UploadPDF />} />
              <Route path="/editor" element={<CertificateEditor />} />
              <Route path="/courses" element={<CourseManagement />} />
              <Route path="/agreements" element={<AgreementsPage />} />
            </Route>

            {/* Role-Based Routes - Student Only */}
            <Route element={<ProtectedRoute allowedRoles={["STUDENT"]} />}>
              <Route path="/enroll" element={<EnrollmentPage />} />
              <Route path="/transfer" element={<TransferPage />} />
            </Route>
          </Routes>
        </Layout>
      </VerificationProvider>
    </AuthProvider>
  );
}

export default App;
