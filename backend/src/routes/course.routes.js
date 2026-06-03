import express from 'express';
import { getCourses, addCourse, toggleCourse }  from '../controllers/course.controller.js';

const router = express.Router();

router.get('/:instituteId', getCourses);
router.post('/:instituteId', addCourse);
router.put('/:courseId', toggleCourse);

export default router;