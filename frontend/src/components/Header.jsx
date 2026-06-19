// src/components/Header.jsx
import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  FiHome,
  FiFileText,
  FiCheckSquare,
  FiUpload,
  FiUser,
  FiLogOut,
  FiMenu,
  FiX,
  FiLogIn,
  FiInfo,
  FiChevronDown,
  FiList,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";

// Add CSS for dropdown animation without needing tailwind config
const dropdownAnimation = `
  @keyframes dropdownAppear {
    0% { opacity: 0; transform: scale(0.95); }
    100% { opacity: 1; transform: scale(1); }
  }
  .dropdown-animate {
    animation: dropdownAppear 0.1s ease-out forwards;
  }
`;

// Button component for navigation
// eslint-disable-next-line
function NavButton({ icon: Icon, label, onClick, isActive = false, to }) {
  // When using as a link (with "to" prop)
  if (to) {
    return (
      <Link
        to={to}
        className={`flex items-center px-3 py-2 rounded-sm transition-colors ${isActive ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-700/70 hover:text-white"}`}
        onClick={(e) => {
          // Handle control/meta clicks to open in new tab
          if ((e.ctrlKey || e.metaKey) && to) {
            e.preventDefault();
            window.open(to, "_blank");
            return;
          }

          // Call the onClick handler if provided
          if (onClick) onClick(e);
        }}
      >
        <Icon className="w-5 h-5 mr-2" />
        <span className="text-sm font-medium">{label}</span>
      </Link>
    );
  }

  // When using as a button (with "onClick" prop only)
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-3 py-2 rounded-sm transition-colors ${isActive ? "bg-gray-700 text-white" : "text-gray-300 hover:bg-gray-700/70 hover:text-white"}`}
    >
      <Icon className="w-5 h-5 mr-2" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const userDropdownRef = useRef(null);
  const userButtonRef = useRef(null);

  // Add this debugging code to understand what's in the user object
  useEffect(() => {
    console.log("Header component - user state:", user);
  }, [user]);

  // Force Header to re-render when user changes
  useEffect(() => {
    if (user) {
      console.log("Header received user with email:", user.email);
    }
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(event.target) &&
        userButtonRef.current &&
        !userButtonRef.current.contains(event.target)
      ) {
        setShowUserInfo(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
    setShowUserInfo(false);
  };

  const isCurrentPath = (path) => location.pathname === path;

  // Define role-based navigation items
  const getNavItems = () => {
    // Items visible to all users (logged in or not)
    const commonItems = [
      { icon: FiHome, label: "Home", path: "/" },
      { icon: FiCheckSquare, label: "Verify", path: "/verify" },
      { icon: FiList, label: "My Certificates", path: "/my-certificates" },
    ];

    // Items visible only to authenticated users based on role
    if (!user) return commonItems;

    if (user.role === "INSTITUTE") {
      return [
        ...commonItems,
        { icon: FiFileText, label: "Generate", path: "/generate" },
        { icon: FiUpload, label: "Upload", path: "/upload" },
        { icon: FiUsers, label: "Agreements", path: "/agreements" },
        { icon: FiList, label: "Courses", path: "/courses" },
      ];
    } else if (user.role === "STUDENT") {
      return [
        ...commonItems,
        { icon: FiUserPlus, label: "Enroll", path: "/enroll" },
      ];
    } else if (user.role === "VERIFIER") {
      return [
        ...commonItems,
        // Verifiers don't get additional nav items in the main menu
      ];
    }

    return commonItems;
  };

  // Main navigation items
  const navItems = getNavItems();

  // User dropdown items - role based
  const getUserMenuItems = () => {
    // Common items for all users
    const commonItems = [
      { icon: FiUser, label: "Profile", path: "/account" },
      { icon: FiFileText, label: "Your Certificates", path: "/certificates" },
      { icon: FiInfo, label: "About", path: "/about" },
      {
        icon: FiLogOut,
        label: "Sign Out",
        action: handleLogout,
        divider: true,
      },
    ];

    // Institute-specific items
    if (user?.role === "INSTITUTE") {
      // Add any institute-specific dropdown items
      return [
        { icon: FiUser, label: "Profile", path: "/account" },
        {
          icon: FiFileText,
          label: "Issued Certificates",
          path: "/certificates",
        },
        { icon: FiUpload, label: "Upload Certificate", path: "/upload" },
        { icon: FiFileText, label: "Generate Certificate", path: "/generate" },
        { icon: FiInfo, label: "About", path: "/about" },
        {
          icon: FiLogOut,
          label: "Sign Out",
          action: handleLogout,
          divider: true,
        },
      ];
    }

    // Student-specific items
    if (user?.role === "STUDENT") {
      return [
        { icon: FiUser, label: "Profile", path: "/account" },
        { icon: FiUserPlus, label: "Enroll in Institute", path: "/enroll" },
        { icon: FiFileText, label: "My Certificates", path: "/certificates" },
        { icon: FiCheckSquare, label: "Verify Certificate", path: "/verify" },
        { icon: FiInfo, label: "About", path: "/about" },
        {
          icon: FiLogOut,
          label: "Sign Out",
          action: handleLogout,
          divider: true,
        },
      ];
    }

    // Verifier-specific items
    if (user?.role === "VERIFIER") {
      return [
        { icon: FiUser, label: "Profile", path: "/account" },
        {
          icon: FiFileText,
          label: "Verified Certificates",
          path: "/certificates",
        },
        { icon: FiCheckSquare, label: "Verify Certificate", path: "/verify" },
        { icon: FiInfo, label: "About", path: "/about" },
        {
          icon: FiLogOut,
          label: "Sign Out",
          action: handleLogout,
          divider: true,
        },
      ];
    }

    return commonItems;
  };

  // Get user menu items based on role
  const userMenuItems = getUserMenuItems();

  return (
    <>
      {/* Add style tag for dropdown animation */}
      <style>{dropdownAnimation}</style>

      <header className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Brand and Tagline */}
            <Link to="/" className="flex flex-shrink-0 items-center">
              <img
                src="/favicon.svg"
                alt="VerifyHub"
                className="w-8 h-8 mr-2"
              />
              <div className="flex flex-col">
                <span className="text-white font-semibold text-lg tracking-tight">
                  VerifyHub
                </span>
                <span className="text-gray-400 text-xs">
                  Secure Certificate Verification
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => (
                <NavButton
                  key={item.path}
                  icon={item.icon}
                  label={item.label}
                  to={item.path}
                  isActive={isCurrentPath(item.path)}
                />
              ))}
            </nav>

            {/* User area / Auth */}
            <div className="flex items-center">
              {/* Mobile menu button */}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="md:hidden text-gray-300 hover:text-white p-2"
              >
                {isMenuOpen ? (
                  <FiX className="w-6 h-6" />
                ) : (
                  <FiMenu className="w-6 h-6" />
                )}
              </button>

              {/* User dropdown for desktop */}
              {user ? (
                <div className="hidden md:block relative">
                  <button
                    ref={userButtonRef}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-sm hover:bg-gray-700/70 transition-colors"
                    onClick={() => setShowUserInfo(!showUserInfo)}
                    aria-expanded={showUserInfo}
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center mr-2">
                      <FiUser className="w-4 h-4 text-gray-300" />
                    </div>
                    <span className="mr-1 max-w-[120px] truncate">
                      {user?.name || "User"}
                    </span>
                    <FiChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${showUserInfo ? "rotate-180 text-white" : "text-gray-400"}`}
                    />
                  </button>

                  {showUserInfo && (
                    <div
                      ref={userDropdownRef}
                      className="absolute right-0 mt-1 w-52 bg-gray-800 border border-gray-700 rounded-sm overflow-hidden dropdown-animate"
                      style={{
                        boxShadow:
                          "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                        transformOrigin: "top right",
                      }}
                    >
                      <div className="px-4 py-3 border-b border-gray-700">
                        <p className="text-xs text-gray-400">Signed in as</p>
                        <p className="text-sm font-medium text-white truncate">
                          {user?.name || "User"}
                        </p>
                        <p className="text-xs text-gray-300 mt-1">
                          {user?.email || "No email available"}
                        </p>
                        {user?.role && (
                          <p className="text-xs text-gray-400 mt-1">
                            {user.role}
                          </p>
                        )}
                      </div>

                      <div className="py-1">
                        {userMenuItems.map((item, index) =>
                          item.path ? (
                            <Link
                              key={index}
                              to={item.path}
                              className={`w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center group transition-colors ${item.divider ? "border-t border-gray-700 mt-1 pt-1" : ""}`}
                              onClick={(e) => {
                                // Handle control/meta clicks to open in new tab
                                if (e.ctrlKey || e.metaKey) {
                                  e.preventDefault();
                                  window.open(item.path, "_blank");
                                  return;
                                }
                                setShowUserInfo(false);
                              }}
                            >
                              <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center mr-2.5 group-hover:bg-gray-600 transition-colors">
                                <item.icon className="w-3.5 h-3.5 text-gray-300" />
                              </div>
                              {item.label}
                            </Link>
                          ) : (
                            <button
                              key={index}
                              onClick={item.action}
                              className={`w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white flex items-center group transition-colors ${item.divider ? "border-t border-gray-700 mt-1 pt-1" : ""}`}
                            >
                              <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center mr-2.5 group-hover:bg-gray-600 transition-colors">
                                <item.icon className="w-3.5 h-3.5 text-gray-300" />
                              </div>
                              {item.label}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => navigate("/login")}
                  className="hidden md:flex items-center px-3 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-sm hover:bg-gray-700/70 transition-colors"
                >
                  <FiLogIn className="w-5 h-5 mr-2" />
                  Login
                </button>
              )}
            </div>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div className="md:hidden pt-2 pb-3 border-t border-gray-700">
              <div className="flex flex-col space-y-1">
                {navItems.map((item) => (
                  <NavButton
                    key={item.path}
                    icon={item.icon}
                    label={item.label}
                    to={item.path}
                    isActive={isCurrentPath(item.path)}
                    onClick={() => setIsMenuOpen(false)}
                  />
                ))}

                {user ? (
                  <>
                    <div className="flex items-center px-3 py-2 text-white border-t border-gray-700 mt-2 pt-2">
                      <div className="w-6 h-6 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center mr-2">
                        <FiUser className="w-3.5 h-3.5 text-gray-300" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium truncate">
                          {user?.name || "User"}
                        </span>
                      </div>
                    </div>
                    <NavButton
                      icon={FiLogOut}
                      label="Logout"
                      onClick={() => {
                        handleLogout();
                        setIsMenuOpen(false);
                      }}
                    />
                  </>
                ) : (
                  <NavButton
                    icon={FiLogIn}
                    label="Login"
                    to="/login"
                    onClick={() => setIsMenuOpen(false)}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </header>
    </>
  );
}
