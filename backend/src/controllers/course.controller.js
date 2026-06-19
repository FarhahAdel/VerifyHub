import { errorResponse, ErrorCodes } from '../utils/errorUtils.js';
import Course from '../models/course.model.js'

export const getCourses = async (req, res) => {
  try {
    const courses = await Course.find({ institute: req.params.instituteId })
                                .select('name code description isActive');
    res.json({ success: true, courses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


export const toggleCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    console.log(course);
    if (!course) {
      const { response, statusCode } = errorResponse(
        'NOT_FOUND',
        'Course not found'
      );
      return res.status(statusCode).json(response);
    }
 
    course.isActive = !course.isActive;
    await Course.updateOne(course);
 
    return res.status(200).json({
      success: true,
      message: `Course ${course.isActive ? "restored" : "deactivated"} successfully`,
      isActive: course.isActive,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const addCourse = async (req, res) => {
  try {
    const { name, code, description } = req.body;
 
    if (!name || !code) {
     const { response, statusCode } = errorResponse(
        'MISSING_REQUIRED_FIELD',
        'All fields are required',
        { required: ['name', 'code', 'description'] }
      );
      return res.status(statusCode).json(response);
    }
 
    // Prevent duplicate code within the same institute
    const existing = await Course.findOne({
      institute: req.params.instituteId,
      code: code.trim().toUpperCase(),
      isActive: true,
    });
 
    if (existing) {
        const { response, statusCode } = errorResponse(
            'DUPLICATE_RESOURCE',
            '`Course already exists for this inistitute',
            { name }
        );
        return res.status(statusCode).json(response);
    }
 
    const course = await Course.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      description: description?.trim() || "",
      institute: req.params.instituteId,
    });

    
 
    res.status(201).json({
      success: true,
      message: "Course created successfully",
      course,
    });
  } catch (error) {
    const { response, statusCode } = errorResponse(
      'INTERNAL_ERROR',
      'Course Creation failed',
      process.env.NODE_ENV === 'development' ? { error: error.message } : {}
    );
    return res.status(statusCode).json(response);
  }
};