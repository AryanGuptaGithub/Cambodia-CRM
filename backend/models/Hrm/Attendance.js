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
    workingHoursPerDay: {
      type: Number,
      default: 8,
    },
    extraHours: {
      type: String,
      default: "00:00:00",
    },
    extraHoursInMinutes: {
      type: Number,
      default: 0,
    },
    isLeaveDay: {
      type: Boolean,
      default: false,
    },
    remarks: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

attendanceSchema.pre("save", function (next) {
  if (this.logoutTime && this.loginTime) {
    const timeDiff = this.logoutTime - this.loginTime;
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

    this.totalTime = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    const totalMinutesWorked = Math.floor(timeDiff / (1000 * 60));
    const totalMinutesExpected = this.workingHoursPerDay * 60;
    const extraMinutes = Math.max(0, totalMinutesWorked - totalMinutesExpected);

    if (extraMinutes > 0) {
      this.extraHoursInMinutes = extraMinutes;
      const extraHours = Math.floor(extraMinutes / 60);
      const extraMins = extraMinutes % 60;
      this.extraHours = `${extraHours.toString().padStart(2, "0")}:${extraMins
        .toString()
        .padStart(2, "0")}:00`;
    }
  }
  next();
});

export default mongoose.model("Attendance", attendanceSchema);
