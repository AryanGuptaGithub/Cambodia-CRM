import ActivityLog from "../models/activity/activityLog.js";

export const logActivity = async ({
  req,
  action,
  actionLabel,
  tableName,
  tableLabel,
  recordId,
  referenceNumber,
  previousData,
  newData,
  description,
}) => {
  try {
    const user = req.user || {};
    await ActivityLog.create({
      userId: user._id || user.id,
      userName: user.name || user.username || "Unknown",
      userRole: user.role || "unknown",
      userEmail: user.email || "",
      action,
      actionLabel,
      tableName,
      tableLabel,
      recordId: recordId?.toString(),
      referenceNumber,
      previousData,
      newData,
      ipAddress: req.ip || req.headers["x-forwarded-for"],
      userAgent: req.headers["user-agent"],
      description,
    });
  } catch (err) {
    console.error("Activity log error:", err.message);
  }
};