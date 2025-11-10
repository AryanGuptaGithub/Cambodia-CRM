import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    yearCode: {
      type: [String], // Array to hold all years spanned by startDate and endDate
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Utility function to get all years spanned by startDate and endDate
const getYearsRange = (startDate, endDate) => {
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  const years = [];
  for (let year = startYear; year <= endYear; year++) {
    years.push(year.toString());
  }
  return years;
};

// Pre-save middleware
holidaySchema.pre("save", function (next) {
  if (this.startDate && this.endDate) {
    this.yearCode = getYearsRange(this.startDate, this.endDate);
  }
  next();
});

// Pre-findOneAndUpdate middleware
holidaySchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update.startDate && update.endDate) {
    const years = getYearsRange(new Date(update.startDate), new Date(update.endDate));
    this.setUpdate({ ...update, yearCode: years });
  }
  next();
});

// Indexes for faster queries
holidaySchema.index({ startDate: 1 });
holidaySchema.index({ endDate: 1 });
holidaySchema.index({ yearCode: 1 });

// Static method: find holidays by a specific year
holidaySchema.statics.findByYear = function (year) {
  return this.find({ yearCode: year.toString() });
};

// Static method: find holidays for current year
holidaySchema.statics.findCurrentYear = function () {
  const currentYear = new Date().getFullYear().toString();
  return this.find({ yearCode: currentYear, enabled: true });
};

const Holiday = mongoose.model("Holiday", holidaySchema);
export default Holiday;
