import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { FiPlus, FiTrash2, FiAlertCircle, FiCheckCircle, FiX } from 'react-icons/fi';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const CourseManagement = () => {
  const { user, getToken } = useAuth();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
  });

  const instituteId = user?._id || user?.id;

  const fetchCourses = async () => {
    if (!instituteId) return;
    try {
      const { data } = await axios.get(`${API_URL}/api/courses/${instituteId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setCourses(data.courses);
    } catch (err) {
      setError('Failed to load courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, [user]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await axios.post(
        `${API_URL}/api/courses/${instituteId}`,
        formData,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setCourses(prev => [...prev, data.course]);
      setFormData({ name: '', code: '', description: '' });
      setSuccess('Course added successfully.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add course.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (courseId) => {
    setTogglingId(courseId);
    setError('');
    try {
      console.log(courseId);
      const { data } = await axios.put(
        `${API_URL}/api/courses/${courseId}`,
        {},
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setCourses(prev =>
        prev.map(c => c._id === courseId ? { ...c, isActive: data.isActive } : c)
      );
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update course.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex-1 py-6 px-4 bg-gray-100">
        <div className="max-w-4xl mx-auto">

          {/* Add Course Form */}
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Course Management</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-sm flex items-start">
                <FiX className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-sm flex items-center">
                <FiCheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleAdd} className="space-y-4">
              <h3 className="text-md font-medium text-gray-700">Add New Course</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Course Name*
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                    placeholder="e.g., Introduction to Computer Science"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Course Code*
                  </label>
                  <input
                    type="text"
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                    placeholder="e.g., CS101"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Must be unique within your institute</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    className="w-full p-2.5 border border-gray-300 rounded-sm focus:ring-2 focus:ring-gray-400 focus:outline-none"
                    placeholder="Optional short description"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-gray-800 text-white px-5 py-2.5 rounded-sm hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  {submitting ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Adding...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <FiPlus className="mr-2" />
                      Add Course
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Courses List */}
          <div className="bg-white rounded-sm shadow-sm border border-gray-300 p-5">
            <h3 className="text-md font-medium text-gray-700 mb-4">
              Your Courses
              {!loading && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({courses.length} total)
                </span>
              )}
            </h3>

            {loading ? (
              <div className="flex justify-center py-8">
                <svg className="animate-spin h-6 w-6 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : courses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <FiAlertCircle className="w-8 h-8 mb-2" />
                <p className="text-sm">No courses added yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {courses.map(course => (
                  <div
                    key={course._id}
                    className="flex items-center justify-between py-3 hover:bg-gray-50 px-2 rounded-sm transition-colors"
                  >
                    <div>
                      <span className="text-sm font-medium text-gray-800">{course.code}</span>
                      <span className="text-gray-400 mx-2">—</span>
                      <span className="text-sm text-gray-700">{course.name}</span>
                      {course.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{course.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggle(course._id)}
                      disabled={togglingId === course._id}
                      aria-label={course.isActive ? 'Deactivate course' : 'Activate course'}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                        course.isActive ? 'bg-gray-800' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          course.isActive ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default CourseManagement;