import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Course name is required"],
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Course code is required"],
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    institute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Institute is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

courseSchema.index({ institute: 1 });
courseSchema.index({ institute: 1, code: 1 }, { unique: true });

export default mongoose.model("Course", courseSchema);