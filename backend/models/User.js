import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["admin", "user", "super admin"],
      default: "user",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

/* 🔐 Pre-save hook to hash password automatically - ONLY FOR ADMIN ROLE */
userSchema.pre("save", async function (next) {
  // Only hash password if user is an admin AND password is modified
  if (this.role === "admin" && this.isModified("password")) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (err) {
      return next(err);
    }
  } else {
    // For non-admin roles, skip password hashing
    next();
  }
});

/* 🔑 Method to compare password - HANDLES BOTH ADMIN AND NON-ADMIN */
userSchema.methods.comparePassword = async function (candidatePassword) {
  // For admin role: use bcrypt comparison
  if (this.role === "admin") {
    return bcrypt.compare(candidatePassword, this.password);
  }
  
  // For non-admin roles: direct string comparison (if not hashed)
  // If you hash passwords for all roles, use bcrypt.compare for all
  return candidatePassword === this.password;
};

/* 🚫 Hide password & __v in responses */
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

const User = mongoose.model("User", userSchema);

export default User;