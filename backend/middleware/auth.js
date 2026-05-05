// middleware/auth.js
import jwt from "jsonwebtoken";

export const protect = (req, res, next) => {
  try {
    // console.log("Body: "  + req.body);
    const authHeader = req.headers.authorization;
    // console.log("Header : " + authHeader);
    // console.log("All headers:", req.headers);
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded; 

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};
