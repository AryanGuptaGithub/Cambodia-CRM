import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    loginTime: {
      type: Date,
      required: true,
    },
    logoutTime: {
      type: Date,
    },
    totalTime: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Calculate total time before saving
attendanceSchema.pre("save", function (next) {
  if (this.logoutTime && this.loginTime) {
    const timeDiff = this.logoutTime - this.loginTime;
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    this.totalTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  next();
});

export default mongoose.model("Attendance", attendanceSchema);
