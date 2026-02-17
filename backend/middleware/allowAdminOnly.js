export const allowAdminOnly = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (req.user.role.toLowerCase() !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only Admin can perform this action.",
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Authorization error",
    });
  }
};
